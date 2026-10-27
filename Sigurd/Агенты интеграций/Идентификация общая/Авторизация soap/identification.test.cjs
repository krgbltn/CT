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
		url: 'https://example.invalid/IVR.asmx', phoneSlotId: 'phone',
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
						if (request.url.endsWith('/IVR.asmx')) {
							if (settings.transportError) throw new Error('Network error')
							const soapData = Array.isArray(data) ? {
								Envelope: { Body: { GetContractsInfo_By_PhoneResponse: { GetContractsInfo_By_PhoneResult: {
									ContractInfo: data.map(item => ({ ID: item.UserId, No: item.WebProperties.ContractNo, Adress: item.WebProperties.Address }))
								} } } }
							} : data
							return { status: settings.httpStatus || 200, data: JSON.stringify(soapData) }
						}
						if (request.url.endsWith('/house')) return { data: { housetype: 'MKD' } }
						if (settings.infoError) throw new Error('Info unavailable')
						if ('infoResponse' in settings) return { data: settings.infoResponse }
						return { data: { status: 'Действует', account: { house: { address_object: { city: 'Иркутск' } } } } }
					},
					js2xmlparser: { parse(tag, body) { return JSON.stringify({ tag, body }) } },
					xml2js: { Parser: class {
						constructor(options) { assert.equal(options.tagNameProcessors[0]('soap:Envelope'), 'Envelope') }
						parseString(value, callback) {
							if (settings.parseError) return callback(new Error('Invalid XML'))
							callback(null, JSON.parse(value))
						}
					} },

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
		lookupCount() { return calls.filter(call => call.url.endsWith('/IVR.asmx')).length }
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
				assert.equal(reply.slots.city_1, 'Новое')
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

test('Поддерживается message.text и переопределённая следующая статья', async () => {
	const s = session()
	s.slots.next_article = 'custom-next'
	await s.turn()
	await s.turn('дом 72', 1, true)
	assert.match((await s.turn('да', 1, true)).text, /intent_id="custom-next"/)
})

const soapResponse = (result) => ({ Envelope: { Body: { GetContractsInfo_By_PhoneResponse: { GetContractsInfo_By_PhoneResult: result } } } })

test('SOAP: POST, действие, параметр телефона; REST-токен не передаётся', async () => {
	const s = session([contracts[0]], { authorizationToken: 'test-token', headers: { Accept: 'application/json' } })
	s.slots.phone = ' 9000000001 '
	await s.turn()
	const request = s.calls[0]
	assert.equal(request.url, 'https://example.invalid/IVR.asmx')
	assert.equal(request.method, 'post')
	assert.deepEqual(JSON.parse(JSON.stringify(request.headers)), {
		'Content-Type': 'text/xml; charset=utf-8',
		SOAPAction: 'http://tempuri.org/GetContractsInfo_By_Phone'
	})
	const xmlInput = JSON.parse(request.data)
	assert.equal(xmlInput.tag, 'soapenv:Envelope')
	assert.equal(xmlInput.body['@']['xmlns:soapenv'], 'http://schemas.xmlsoap.org/soap/envelope/')
	assert.equal(xmlInput.body['@']['xmlns:tem'], 'http://tempuri.org/')
	assert.equal(xmlInput.body['soapenv:Body']['tem:GetContractsInfo_By_Phone']['tem:PhoneNumber'], '9000000001')
	selected(await s.turn('да'), 'first')
	assert.equal(s.lookupCount(), 1)
	for (const rest of s.calls.slice(1)) {
		assert.equal(rest.method, 'get')
		assert.equal(rest.headers.Authorization, 'test-token')
		assert.equal(rest.headers.Accept, 'application/json')
	}
})

test('SOAP: один ContractInfo, City отдельно от Adress и маппинг слотов', async () => {
	const s = session(soapResponse({ ContractInfo: {
		ID: 'soap-id', No: 'ЛС-00001', Adress: ' ул Трудовая, дом 129А кв. 40 ', City: 'Иркутск'
	} }))
	assert.match((await s.turn()).text, /Иркутск, Трудовая/)
	const reply = await s.turn('да')
	selected(reply, 'soap-id')
	assert.equal(reply.slots.contract_no, 'ЛС-00001')
	assert.equal(reply.slots.address, 'Иркутск, ул Трудовая, дом 129А кв. 40')
	assert.equal(reply.slots.city_1, 'Иркутск')
})

test('SOAP: город в полном адресе не дублируется', async () => {
	const address = 'г Иркутск, ул Трудовая, дом 129А кв. 40'
	const s = session(soapResponse({ ContractInfo: { ID: 'soap-id', No: 'ЛС-1', Adress: address, City: 'Иркутск' } }))
	await s.turn()
	assert.equal((await s.turn('да')).slots.address, address)
})

test('SOAP: корректный пустой результат → error в следующую статью', async (t) => {
	for (const data of [soapResponse(''), soapResponse({}), soapResponse({ ContractInfo: [] }), []]) {
		await t.test(JSON.stringify(data), async () => {
			const s = session(data)
			const reply = await s.turn()
			assert.match(reply.text, /intent_id="next-test"/)
			assert.equal(reply.slots.final_answer, 'error')
			assert.equal(reply.slots.id_step, '')
		})
	}
})

test('SOAP: Fault, повреждённый ответ и неполный ContractInfo → оператор', async (t) => {
	for (const data of [
		null, {}, { Envelope: { Body: { Fault: { faultstring: 'Unavailable' } } } },
		soapResponse(null), soapResponse(42), soapResponse([]),
		soapResponse({ ContractInfo: null }), soapResponse({ ContractInfo: {} }),
		soapResponse({ ContractInfo: { ID: '', No: 'ЛС-1', Adress: 'Адрес' } }),
		soapResponse({ ContractInfo: { ID: 'one', No: '', Adress: 'Адрес' } }),
		soapResponse({ ContractInfo: { ID: 'one', No: 'ЛС-1', Adress: '' } })
	]) {
		await t.test(JSON.stringify(data), async () => failed(await session(data).turn()))
	}
})

test('SOAP: ошибка сети, HTTP и разбора XML → оператор', async (t) => {
	for (const overrides of [{ transportError: true }, { httpStatus: 500 }, { parseError: true }]) {
		await t.test(JSON.stringify(overrides), async () => failed(await session(contracts, overrides).turn()))
	}
})

test('SOAP: настраиваемый слот телефона; пустой телефон не отправляет запрос', async () => {
	const s = session([contracts[0]], { phoneSlotId: 'sys_phone' })
	s.slots.sys_phone = '9000000002'
	await s.turn()
	const sent = JSON.parse(s.calls[0].data)
	assert.equal(sent.body['soapenv:Body']['tem:GetContractsInfo_By_Phone']['tem:PhoneNumber'], '9000000002')
	for (const phone of ['', '   ', undefined]) {
		const missing = session()
		missing.slots.phone = phone
		failed(await missing.turn())
		assert.equal(missing.calls.length, 0)
	}
})

test('Заглушка сохраняет формат общей идентификации и не вызывает сеть', async () => {
	const s = session(null, { stub: true, stubResponse: [contracts[0]] })
	await s.turn()
	selected(await s.turn('да'), 'first')
	assert.equal(s.calls.length, 0)
})


test('SOAP: разные City при одинаковых улицах и домах различаются при выборе', async () => {
	const s = session(soapResponse({ ContractInfo: [
		{ ID: 'one', No: 'ЛС-1', Adress: 'ул Ленина, дом 1', City: 'Иркутск' },
		{ ID: 'two', No: 'ЛС-2', Adress: 'ул Ленина, дом 1', City: 'Ангарск' }
	] }))
	assert.equal((await s.turn()).slots.id_step, 'ask_multiple')
	selected(await s.turn('Ангарск улица Ленина дом 1'), 'two')
	assert.equal(s.lookupCount(), 1)
})


const dictionaries = JSON.parse(readFileSync(path.join(__dirname, 'identification_settings.json'), 'utf8'))
const currentDictionaries = { city1Values: dictionaries.city1Values, eddsMapping: dictionaries.eddsMapping }
const soapContract = (city, address = 'Улица Тестовая, дом 1') => soapResponse({
	ContractInfo: { ID: 'territory-id', No: 'ЛС-ТЕСТ', City: city, Adress: address }
})
const cityPhone = (city) => dictionaries.eddsMapping.find(item => item.locations.includes('г ' + city)).phone
const districtPhone = (district) => dictionaries.eddsMapping.find(item => item.locations.includes('р-н ' + district)).phone
const infoFor = (address, city = 'Маркова') => ({
	status: 'Действует', account: { house: { address_object: { city, full_address: address } } }
})
const chooseSingle = async (s) => {
	await s.turn()
	const reply = await s.turn('да')
	assert.equal(reply.slots.uid, 'territory-id')
	assert.equal(s.lookupCount(), 1)
	return reply
}

test('Территория: SOAP City без г. работает с прежними справочниками', async (t) => {
	for (const city of ['Иркутск', 'Ангарск', 'Усолье-Сибирское', 'Братск']) {
		await t.test(city, async () => {
			const s = session(soapContract(city), currentDictionaries)
			const reply = await chooseSingle(s)
			assert.equal(reply.slots.city_1, city)
			assert.equal(reply.slots.edds, cityPhone(city))
			const stored = JSON.parse((await session(soapContract(city)).turn()).slots.id_contracts_data)
			assert.equal(stored[0].WebProperties.City, city)
			assert.equal(s.calls.filter(call => call.url.endsWith('/info')).length, 1)
		})
	}
})

test('Территория: префикс г./город, регистр, ё и пробелы не меняют сопоставление', async (t) => {
	for (const city of [' г.  ИРКУТСК ', 'город Иркутск', 'Иркутск']) {
		await t.test(city, async () => {
			const reply = await chooseSingle(session(soapContract(city), currentDictionaries))
			assert.equal(reply.slots.city_1, 'Иркутск')
			assert.equal(reply.slots.edds, cityPhone('Иркутск'))
		})
	}
	const reply = await chooseSingle(session(soapContract('Бёрёзовка'), {
		city1Values: ['Березовка'], eddsMapping: [{ locations: ['город Березовка'], phone: 'test' }]
	}))
	assert.equal(reply.slots.city_1, 'Березовка')
	assert.equal(reply.slots.edds, 'test')
})

test('Территория: район Марковой берётся из полного адреса /info', async (t) => {
	for (const region of ['р-н Иркутский', 'р-он Иркутский', 'Иркутский район', 'район Иркутский']) {
		await t.test(region, async () => {
			const full = 'обл Иркутская, ' + region + ', рп Маркова, ул Тестовая, дом 1'
			const s = session(soapContract('Маркова'), { ...currentDictionaries, infoResponse: infoFor(full) })
			const reply = await chooseSingle(s)
			assert.equal(reply.slots.city_1, 'Иркутский')
			assert.equal(reply.slots.edds, districtPhone('Иркутский'))
			assert.equal(reply.slots.city, 'Маркова')
			assert.equal(reply.slots.address, 'Маркова, Улица Тестовая, дом 1')
			assert.equal(s.calls.filter(call => call.url.endsWith('/info')).length, 1)
		})
	}
})

test('Территория: запасное поле account.house.address и пустой full_address', async () => {
	const response = infoFor(' ')
	response.account.house.address = 'обл Иркутская, р-н Иркутский, рп Маркова, ул Тестовая, дом 1'
	const reply = await chooseSingle(session(soapContract('Маркова'), { ...currentDictionaries, infoResponse: response }))
	assert.equal(reply.slots.city_1, 'Иркутский')
	assert.equal(reply.slots.edds, districtPhone('Иркутский'))
})

test('Территория: город и одноимённый район не смешиваются', async () => {
	const reply = await chooseSingle(session(soapContract('Иркутский район'), currentDictionaries))
	assert.equal(reply.slots.city_1, 'Иркутский')
	assert.equal(reply.slots.edds, districtPhone('Иркутский'))
	assert.notEqual(reply.slots.edds, cityPhone('Иркутск'))
	const city = await chooseSingle(session(soapContract('Иркутск'), currentDictionaries))
	assert.equal(city.slots.edds, cityPhone('Иркутск'))
})

test('Территория: при неизвестном районе нет догадки по улице или старым слотам', async () => {
	const s = session(soapContract('Маркова', 'Улица Иркутск, дом 1'), currentDictionaries)
	s.slots.city_1 = 'Иркутск'
	s.slots.edds = 'old-value'
	const reply = await chooseSingle(s)
	assert.equal(reply.slots.city_1, '')
	assert.equal(reply.slots.edds, '')
})

test('Территория: ошибка /info не отменяет известные данные SOAP', async () => {
	const s = session(soapContract('Ангарск'), { ...currentDictionaries, infoError: true })
	const reply = await chooseSingle(s)
	assert.equal(reply.slots.city_1, 'Ангарск')
	assert.equal(reply.slots.edds, cityPhone('Ангарск'))
	assert.equal(reply.slots.house_type, 'MKD')
	assert.match(reply.text, /intent_id="next-test"/)
	const unknown = await chooseSingle(session(soapContract('Маркова'), { ...currentDictionaries, infoError: true }))
	assert.equal(unknown.slots.city_1, '')
	assert.equal(unknown.slots.edds, '')
})

test('Территория: отсутствует /info или City — используется адрес выбранного SOAP ЛС', async () => {
	const data = soapResponse({ ContractInfo: { ID: 'territory-id', No: 'ЛС-ТЕСТ', Adress: 'г. Ангарск, ул Тестовая, дом 1' } })
	const s = session(data, { ...currentDictionaries, infoUrl: '' })
	const reply = await chooseSingle(s)
	assert.equal(reply.slots.city_1, 'Ангарск')
	assert.equal(reply.slots.edds, cityPhone('Ангарск'))
	assert.equal(s.calls.filter(call => call.url.endsWith('/info')).length, 0)
})

test('Территория: повторный выбор сохраняет City только выбранного SOAP ЛС', async () => {
	const s = session(soapResponse({ ContractInfo: [
		{ ID: 'one', No: 'ЛС-1', City: 'Ангарск', Adress: 'ул Тестовая, дом 1' },
		{ ID: 'territory-id', No: 'ЛС-2', City: 'Иркутск', Adress: 'ул Тестовая, дом 1' }
	] }), currentDictionaries)
	await openList(s)
	const reply = await s.turn('2')
	assert.equal(reply.slots.uid, 'territory-id')
	assert.equal(reply.slots.city_1, 'Иркутск')
	assert.equal(reply.slots.edds, cityPhone('Иркутск'))
	assert.equal(s.lookupCount(), 1)
})


test('Территория: неполная карточка /info не теряет район из SOAP Adress', async () => {
	const s = session(soapContract('Маркова', 'р-н Иркутский, рп Маркова, ул Тестовая, дом 1'), {
		...currentDictionaries, infoResponse: infoFor('ул Тестовая, дом 1')
	})
	const reply = await chooseSingle(s)
	assert.equal(reply.slots.city_1, 'Иркутский')
	assert.equal(reply.slots.edds, districtPhone('Иркутский'))
})
