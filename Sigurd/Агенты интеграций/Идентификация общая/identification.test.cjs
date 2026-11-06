const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const filename = path.join(__dirname, 'identification.js')
const source = readFileSync(filename, 'utf8')
const contract = (id, address) => ({ UserId: id, WebProperties: { Address: address, ContractNo: `ЛС-${id}` } })
const contracts = [
	contract('first', '664528, обл Иркутская, р-н Иркутский, дп Новое, ул 3-я, дом № 72'),
	contract('second', '664081, обл Иркутская, г Иркутск, ул Трудовая, дом № 129А кв. 40'),
	contract('third', '664058, обл Иркутская, г Иркутск, мкр. Первомайский, дом № 4 кв. 66')
]

// Каждый ход исполняет исходник заново: состояние существует только в слотах ответа.
const session = (data = contracts, overrides = {}) => {
	const calls = []
	let slots = { phone: '9000000000', classifier: 'classifier-test' }
	const settings = {
		url: 'https://example.invalid/contracts?phone={{slots.phone}}', method: 'get',
		nextArticle: 'next-test', operatorArticle: 'operator-test',
		infoUrl: 'https://example.invalid/{user_id}/info',
		disconnectionReportUrl: 'https://example.invalid/{user_id}/house',
		city1Values: ['Иркутск', 'Новое'],
		eddsMapping: [{ locations: ['р-н Иркутский'], phone: 'test-edds' }],
		slotsMapping: [
			{ slotId: 'uid', path: '[0].UserId' },
			{ slotId: 'address', path: '[0].WebProperties.Address' },
			{ slotId: 'contract_no', path: '[0].WebProperties.ContractNo' }
		], ...overrides
	}
	return {
		calls,
		get slots() { return slots },
		async turn(text = '', type = 1, fallbackText = false) {
			let built = 0
			let resolved = 0
			const result = await new Promise((resolve, reject) => {
				const context = {
					agentSettings: settings,
					message: {
						message_type: type, ...(fallbackText ? { text } : { message: { text } }),
						slot_context: { filled_slots: Object.entries(slots).map(([slot_id, value]) => ({ slot_id, value })) }
					},
					logger: { info() {}, warn() {}, error() {} },
					https: require('node:https'),
					axios: async (request) => {
						calls.push(request)
						if (request.url.includes('/contracts?')) return { data }
						if (request.url.endsWith('/house')) return { data: { housetype: 'MKD' } }
						return { data: { status: 'Действует', account: { house: { address_object: { city: 'Иркутск' } } } } }
					},
					agentApi: {
						makeTextReply(text, attachment, actions, filledSlots = {}) {
							built++
							return { text, slots: filledSlots }
						},
						makeAckReply() { built++; return { text: '/ack ack ack', slots: {} } },
						sendMessage() { throw new Error('Телефония: дополнительные сообщения запрещены') }
					},
					resolve(value) { resolved++; resolve(value) }
				}
				try { vm.runInNewContext(source, context, { filename, timeout: 1000 }) } catch (error) { reject(error) }
			})
			assert.equal(resolved, 1, 'один resolve на вызов')
			assert.equal(built, 1, 'создаётся только одно сообщение')
			assert.ok(Array.isArray(result))
			assert.equal(result.length, 1, 'ровно одно сообщение в ответе для телефонии')
			const reply = JSON.parse(JSON.stringify(result[0]))
			for (const value of Object.values(reply.slots)) assert.equal(typeof value, 'string')
			slots = { ...slots, ...reply.slots }
			return reply
		},
		lookupCount() { return calls.filter(call => call.url.includes('/contracts?')).length }
	}
}

const selected = (reply, id) => {
	assert.match(reply.text, /intent_id="next-test"/)
	assert.equal(reply.slots.uid, id)
	assert.equal(reply.slots.id_step, '')
	assert.equal(reply.slots.id_contracts_data, '')
	assert.equal(reply.slots.id_selected_index, '')
	assert.equal(reply.slots.id_address_options, '[]')
	assert.equal(reply.slots.status_ls, 'Действует')
	assert.equal(reply.slots.house_type, 'MKD')
}
const failed = (reply) => {
	assert.match(reply.text, /intent_id="operator-test"/)
	assert.equal(reply.slots.id_step, '')
	assert.equal(reply.slots.id_contracts_data, '')
}
const openList = async (s) => {
	assert.equal((await s.turn()).slots.id_step, 'ask_multiple')
	const reply = await s.turn('совсем неизвестный адрес')
	assert.equal(reply.slots.id_step, 'choose_address')
	return reply
}

test('Скрипт укладывается в лимит платформы', () => {
	assert.ok(Buffer.byteLength(source, 'utf8') <= 32766, `${Buffer.byteLength(source, 'utf8')} bytes`)
	console.log(`Размер агента: ${Buffer.byteLength(source, 'utf8')} / 32766 байт`)
})

test('Полный адрес с дп, цифровой/словесной улицей и произнесённым домом', async (t) => {
	for (const street of ['3-я', 'Третья']) {
		for (const answer of ['Новое, улица Третья, дом семьдесят два', 'Новое, улица 3-я, дом 72', 'Новое Третья 72']) {
			await t.test(`${street}: ${answer}`, async () => {
				const data = [contract('first', contracts[0].WebProperties.Address.replace('3-я', street)), contracts[1]]
				const s = session(data)
				await s.turn('', 0)
				const reply = await s.turn(answer)
				selected(reply, 'first')
				assert.equal(reply.slots.address, data[0].WebProperties.Address)
				assert.equal(reply.slots.city_1, 'Иркутск')
				assert.equal(reply.slots.edds, 'test-edds')
				assert.equal(s.lookupCount(), 1)
			})
		}
	}
})

test('Существующее нечёткое сопоставление и краткий адрес', async () => {
	const s = session([contract('old', 'обл Иркутская, рп Маркова, ул Медовая, дом № 5а, кв. 47'), contracts[1]])
	await s.turn()
	selected(await s.turn('Марковой Медовая 5'), 'old')
})

test('Ответ из лога: частичное совпадение → подтверждение → успех', async () => {
	const s = session()
	await s.turn()
	const candidate = await s.turn('центр новая улица третий дом 72')
	assert.equal(candidate.slots.id_step, 'confirm_partial')
	assert.equal(candidate.slots.id_selected_index, '0')
	assert.match(candidate.text, /Новое, Третья улица, дом 72/)
	selected(await s.turn('да'), 'first')
	assert.equal(s.lookupCount(), 1)
})

test('Частичное совпадение каждого отдельного компонента', async (t) => {
	for (const answer of ['Новое', 'улица Трудовая', 'дом 72', 'улица Третья', 'улица 3-я', 'улица 3']) {
		await t.test(answer, async () => {
			const s = session()
			await s.turn()
			const reply = await s.turn(answer)
			assert.equal(reply.slots.id_step, 'confirm_partial')
			assert.equal(reply.slots.id_selected_index, answer.includes('Трудовая') ? '1' : '0')
		})
	}
})

test('Единственный лучший кандидат выбирается по количеству компонентов', async () => {
	const s = session()
	await s.turn()
	const reply = await s.turn('Иркутск, улица Трудовая')
	assert.equal(reply.slots.id_step, 'confirm_partial')
	assert.equal(reply.slots.id_selected_index, '1')
})

test('Равные частичные совпадения → сразу весь список', async () => {
	const s = session()
	await s.turn()
	const reply = await s.turn('Иркутск')
	assert.equal(reply.slots.id_step, 'choose_address')
	assert.match(reply.text, /Номер 1: Новое, Третья улица, дом 72/)
	assert.match(reply.text, /Номер 2: Иркутск, Трудовая, дом 129А, квартира 40/)
	assert.match(reply.text, /Номер 3: Иркутск, микрорайон Первомайский, дом 4, квартира 66/)
})

test('Отказ от кандидата → список → номер адреса', async () => {
	const s = session()
	await s.turn()
	await s.turn('дом 72')
	const list = await s.turn('нет')
	assert.equal(list.slots.id_step, 'choose_address')
	selected(await s.turn('второй вариант'), 'second')
	assert.equal(s.lookupCount(), 1)
})

test('Непонятное подтверждение: один повтор → список → успех', async () => {
	const s = session()
	await s.turn()
	await s.turn('дом 72')
	const retry = await s.turn('да нет')
	assert.equal(retry.slots.id_step, 'confirm_partial')
	assert.equal(retry.slots.id_confirm_retry, '1')
	assert.equal(retry.slots.id_selected_index, '0')
	assert.equal((await s.turn('не знаю')).slots.id_step, 'choose_address')
	selected(await s.turn('номер три'), 'third')
	assert.equal(s.lookupCount(), 1)
})

test('После повторного подтверждения можно ответить да или нет', async (t) => {
	for (const answer of ['да', 'нет']) {
		await t.test(answer, async () => {
			const s = session()
			await s.turn()
			await s.turn('дом 72')
			await s.turn('не знаю')
			const reply = await s.turn(answer)
			if (answer === 'да') selected(reply, 'first')
			else assert.equal(reply.slots.id_step, 'choose_address')
		})
	}
})

test('Числа и словесные варианты выбирают адрес без подтверждения', async (t) => {
	for (const [answer, id] of [['1', 'first'], ['один', 'first'], ['первый', 'first'], ['номер один', 'first'], ['второй адрес', 'second'], ['третий вариант', 'third'], ['ТРИ.', 'third']]) {
		await t.test(answer, async () => {
			const s = session()
			await openList(s)
			selected(await s.turn(answer), id)
			assert.equal(s.lookupCount(), 1)
		})
	}
})

test('Некорректный выбор → динамический вопрос → повторная ошибка/нет/успех', async (t) => {
	for (const answer of ['0', 'ноль', '4', '-1', '1.5', 'да', 'первый или второй', 'нет второй', 'один два', '1 2', '']) {
		await t.test(answer, async () => {
			const s = session()
			await openList(s)
			const retry = await s.turn(answer)
			assert.match(retry.text, /от 1 до 3/)
			assert.equal(retry.slots.id_step, 'choose_address')
			assert.equal(retry.slots.id_number_retry, '1')
			assert.deepEqual(JSON.parse(retry.slots.id_address_options), [0, 1, 2])
			selected(await s.turn('два'), 'second')
			assert.equal(s.lookupCount(), 1)
		})
	}
	const s = session()
	await openList(s)
	await s.turn('не знаю')
	failed(await s.turn('не знаю'))
	const other = session()
	await openList(other)
	await other.turn('не знаю')
	failed(await other.turn('нет'))
})

test('Слово нет в списке означает неуспех', async () => {
	const s = session()
	await openList(s)
	failed(await s.turn('Нет.'))
})

test('Динамическое количество адресов и составные числительные', async () => {
	const data = Array.from({ length: 21 }, (_, index) => contract(`n${index + 1}`, `г Иркутск, ул Тестовая, дом ${index + 1}`))
	const s = session(data)
	const list = await openList(s)
	assert.match(list.text, /Номер 21:/)
	assert.match((await s.turn('22')).text, /от 1 до 21/)
	selected(await s.turn('двадцать первый'), 'n21')
})

test('Дубли адреса с разным написанием → первый ЛС и стабильная нумерация', async () => {
	const duplicate = contract('duplicate', '664999, область Иркутская, район Иркутский, дачный поселок Новое, улица Третья, дом 72')
	const s = session([contracts[0], duplicate, contracts[1]])
	const list = await openList(s)
	assert.deepEqual(JSON.parse(list.slots.id_address_options), [0, 2])
	assert.doesNotMatch(list.text, /Номер 3:/)
	assert.match((await s.turn('3')).text, /от 1 до 2/)
	selected(await s.turn('второй'), 'second')
	const other = session([contracts[0], duplicate])
	await other.turn()
	selected(await other.turn('Новое, Третья, дом 72'), 'first')
})

test('Литеры, дробь, корпуса, строения, квартиры и тип улицы не объединяются', async () => {
	const addresses = [
		'г Иркутск, ул Ленина, дом 5А, кв 1',
		'г Иркутск, ул Ленина, дом 5Б, кв 1',
		'г Иркутск, ул Ленина, дом 5/1, кв 1',
		'г Иркутск, ул Ленина, дом 5А, корпус 1, кв 1',
		'г Иркутск, ул Ленина, дом 5А, корпус 1, строение 2, кв 1',
		'г Иркутск, ул Ленина, дом 5А, кв 2',
		'г Иркутск, проспект Ленина, дом 5А, кв 1'
	]
	const s = session(addresses.map((address, index) => contract(String(index), address)))
	const list = await openList(s)
	assert.equal(JSON.parse(list.slots.id_address_options).length, addresses.length)
	assert.match(list.text, /дом 5\/1/)
	assert.match(list.text, /корпус 1, строение 2/)
})

test('Один дом с разными квартирами: список без квартиры, точный выбор с квартирой', async () => {
	const data = [contract('a', 'г Иркутск, ул Ленина, дом 5, кв 1'), contract('b', 'г Иркутск, ул Ленина, дом 5, кв 2')]
	const s = session(data)
	await s.turn()
	assert.equal((await s.turn('Иркутск Ленина дом 5')).slots.id_step, 'choose_address')
	const other = session(data)
	await other.turn()
	selected(await other.turn('Иркутск Ленина дом 5 квартира 2'), 'b')
})

test('Маркер сам по себе не совпадает, дом 5 не равен 15 или 50', async (t) => {
	for (const answer of ['город улица дом', 'дом 5']) {
		await t.test(answer, async () => {
			const s = session([contract('a', 'г Иркутск, ул Ленина, дом 15'), contract('b', 'г Ангарск, ул Ленина, дом 50')])
			await s.turn()
			assert.equal((await s.turn(answer)).slots.id_step, 'choose_address')
		})
	}
})

test('Единственный ЛС: подтверждение, отказ и ограниченный повтор', async () => {
	const s = session([contracts[0]])
	assert.equal((await s.turn()).slots.id_step, 'confirm_single')
	await s.turn('не знаю')
	selected(await s.turn('верно'), 'first')
	assert.equal(s.lookupCount(), 1)
	const denied = session([contracts[0]])
	await denied.turn()
	failed(await denied.turn('нет'))
	const unclear = session([contracts[0]])
	await unclear.turn()
	await unclear.turn('не знаю')
	failed(await unclear.turn('не знаю'))
})

test('Системные события не расходуют попытки и не вызывают поиск повторно', async () => {
	const s = session()
	await s.turn()
	await s.turn('дом 72')
	assert.equal((await s.turn('', 200)).text, '/ack ack ack')
	assert.equal((await s.turn('', 0)).slots.id_confirm_retry, '0')
	await s.turn('не знаю')
	assert.equal((await s.turn('', 0)).slots.id_confirm_retry, '1')
	await s.turn('нет')
	assert.equal((await s.turn('', 0)).slots.id_number_retry, '0')
	await s.turn('не знаю')
	assert.equal((await s.turn('', 0)).slots.id_number_retry, '1')
	selected(await s.turn('2'), 'second')
	assert.equal(s.lookupCount(), 1)
})

test('Повторный старт обрабатывается и в ask_multiple, и в confirm_single', async () => {
	const multiple = session()
	await multiple.turn('', 0)
	assert.equal((await multiple.turn('', 0)).slots.id_step, 'ask_multiple')
	assert.equal(multiple.lookupCount(), 1)
	selected(await multiple.turn('Иркутск Первомайский дом 4 квартира 66'), 'third')
	const single = session([contracts[0]])
	await single.turn('', 0)
	assert.equal((await single.turn('', 0)).slots.id_confirm_retry, '0')
	await single.turn('не знаю')
	assert.equal((await single.turn('', 0)).slots.id_confirm_retry, '1')
	selected(await single.turn('да'), 'first')
	assert.equal(single.lookupCount(), 1)
})

test('Продолжение диалога, начатого старой версией агента', async () => {
	const s = session()
	Object.assign(s.slots, { id_step: 'ask_multiple', id_contracts_data: JSON.stringify(contracts) })
	assert.equal((await s.turn('дом 72')).slots.id_step, 'confirm_partial')
	selected(await s.turn('да'), 'first')
	assert.equal(s.lookupCount(), 0)
	const single = session([contracts[0]])
	Object.assign(single.slots, { id_step: 'confirm_single', id_contracts_data: JSON.stringify([contracts[0]]) })
	selected(await single.turn('да'), 'first')
	assert.equal(single.lookupCount(), 0)
})

test('Один уникальный адрес нескольких ЛС: список из одного пункта выбирает первый ЛС', async () => {
	const s = session([contracts[0], contract('duplicate', contracts[0].WebProperties.Address)])
	const reply = await openList(s)
	assert.deepEqual(JSON.parse(reply.slots.id_address_options), [0])
	assert.doesNotMatch(reply.text, /Номер 2:/)
	assert.match((await s.turn('2')).text, /от 1 до 1/)
	selected(await s.turn('первый'), 'first')
	assert.equal(s.lookupCount(), 1)
})

test('Повреждённое/утраченное состояние не запускает поиск заново', async (t) => {
	for (const patch of [
		{ id_contracts_data: '' }, { id_contracts_data: '{' }, { id_contracts_data: '{}' },
		{ id_address_options: '[99]' }, { id_address_options: '{' }, { id_address_options: '' },
		{ id_step: 'unknown' }
	]) {
		await t.test(JSON.stringify(patch), async () => {
			const s = session()
			await openList(s)
			Object.assign(s.slots, patch)
			failed(await s.turn('1'))
			assert.equal(s.lookupCount(), 1)
		})
	}
	const s = session()
	await s.turn()
	await s.turn('дом 72')
	s.slots.id_selected_index = '99'
	failed(await s.turn('да'))
})

test('Успех/неуспех очищает состояние; новый вход начинает новый поиск', async () => {
	for (const answer of ['1', 'нет']) {
		const s = session()
		await openList(s)
		await s.turn(answer)
		assert.equal((await s.turn()).slots.id_step, 'ask_multiple')
		assert.equal(s.lookupCount(), 2)
	}
})

test('Пустой/некорректный ответ API возвращает error одним сообщением', async (t) => {
	for (const data of [[], null, {}]) {
		await t.test(JSON.stringify(data), async () => {
			const s = session(data)
			const reply = await s.turn()
			assert.equal(reply.slots.final_answer, 'error')
			assert.equal(reply.slots.id_step, '')
		})
	}
})

test('Поддерживается message.text и переопределённая следующая статья', async () => {
	const s = session()
	s.slots.next_article = 'custom-next'
	await s.turn()
	await s.turn('дом 72', 1, true)
	assert.match((await s.turn('да', 1, true)).text, /intent_id="custom-next"/)
})
