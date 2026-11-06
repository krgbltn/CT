const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const https = require('node:https')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const contract = (ID, City, Adress = 'Улица Медовая, дом 5, квартира 47') => ({ ID, No: `ЛС-${ID}`, Adress, City })
const contracts = [
    contract('first', 'Маркова'),
    contract('second', 'Иркутск'),
    contract('third', 'Иркутск', 'Улица Трудовая, дом 129А, квартира 40')
]
const envelope = (method, result) => ({
    'soap:Envelope': { 'soap:Body': { [`${method}Response`]: { [`${method}Result`]: result } } }
})

// Исходник запускается заново на каждом ходе. SOAP-транспорт и XML-конвертеры
// подменены; структура ответов соответствует SOAP API, состояние живёт в storage.
const session = (agent, data = contracts, options = {}) => {
    const storage = new Map(Object.entries(options.initialStorage || {}))
    const calls = []
    const settings = {
        ...agent.settings,
        url: 'https://example.invalid/IVR.asmx',
        aiAgent: 'classifier-test', nextArticle: 'next-test', operatorArticle: 'operator-test',
        slots: { ...agent.settings.slots, ...options.slotOverrides }
    }
    let slots = { sys_phone: '9000000000', account_number_client: '12345', ...options.initialSlots }
    return {
        calls,
        get slots() { return slots },
        get storageKeys() { return [...storage.keys()] },
        get state() {
            const value = storage.get('readings_identification')
            return value ? JSON.parse(value) : null
        },
        async turn(text = '', type = 1) {
            let built = 0
            let resolved = 0
            const result = await new Promise((resolve, reject) => {
                const context = {
                    agentSettings: settings,
                    message: {
                        message_type: type, message: { text },
                        slot_context: { filled_slots: Object.entries(slots).map(([slot_id, value]) => ({ slot_id, value })) }
                    },
                    logger: { info() {}, error() {} },
                    https,
                    js2xmlparser: { parse: (tag, body) => JSON.stringify(body) },
                    xml2js: { Parser: class {
                        parseString(value, callback) { callback(null, JSON.parse(value)) }
                    } },
                    axios: async (request) => {
                        assert.equal(request.url, settings.url)
                        const method = request.headers.SOAPAction.split('/').pop()
                        const body = JSON.parse(request.data)['soapenv:Body'][`tem:${method}`]
                        calls.push({ method, body })
                        if (method === agent.lookupMethod) {
                            if (options.lookupError) throw new Error('Contracts SOAP request failed')
                            if (options.lookupParseError) return { status: 200, data: '<invalid' }
                            const result = Object.hasOwn(options, 'lookupResult')
                                ? options.lookupResult : { ContractInfo: data.length === 1 ? data[0] : data }
                            const response = Object.hasOwn(options, 'lookupResponse')
                                ? options.lookupResponse : envelope(method, result)
                            return { status: 200, data: JSON.stringify(response) }
                        }
                        assert.equal(method, 'GetMDInfo_By_ContractIDAndNomenclatureCode')
                        if (options.meterError) throw new Error('Meter SOAP request failed')
                        const result = body['tem:NomenclatureCode'] === 24 ? { MDInfo: {
                            MDSerialNumber: `meter-${body['tem:ContractStrGUID']}`,
                            MDScales: { MDScaleInfo: {
                                MDScaleID: 'scale-test', MDScaleName: 'кВт.ч', LastReadings: '100'
                            } }
                        } } : ''
                        return { status: 200, data: JSON.stringify(envelope(method, result)) }
                    },
                    agentStorage: { dialogStorage: {
                        async get(key) { return storage.get(key) },
                        async set(key, value) { storage.set(key, value); return true },
                        async del(key) { storage.delete(key); return true }
                    } },
                    agentApi: {
                        makeTextReply(text, attachment, actions, filledSlots = {}) {
                            built++
                            return { text, slots: filledSlots }
                        },
                        makeAckReply() { built++; return { text: '/ack ack ack', slots: {} } }
                    },
                    resolve(value) { resolved++; resolve(value) }
                }
                try { vm.runInNewContext(agent.source, context, { filename: agent.filename, timeout: 1000 }) }
                catch (error) { reject(error) }
            })
            assert.equal(resolved, 1, 'один resolve на вызов')
            assert.equal(built, 1, 'один ReplyMessage на вызов')
            assert.ok(Array.isArray(result))
            assert.equal(result.length, 1)
            const reply = JSON.parse(JSON.stringify(result[0]))
            for (const value of Object.values(reply.slots)) assert.equal(typeof value, 'string')
            slots = { ...slots, ...reply.slots }
            return reply
        }
    }
}

const selected = (s, reply, item, addressSuccess = '') => {
    assert.match(reply.text, /intent_id="next-test"/)
    assert.equal(reply.slots.successful_identification, 'true')
    assert.equal(reply.slots.account_number, item.No)
    assert.equal(reply.slots.account_address, item.Adress.trim())
    assert.equal(reply.slots.address_success, addressSuccess)
    assert.equal(reply.slots.number_electricity_meter, `meter-${item.ID}`)
    assert.equal(s.state, null)
    const meters = s.calls.filter(call => call.method === 'GetMDInfo_By_ContractIDAndNomenclatureCode')
    assert.equal(meters.length, 4)
    for (const call of meters) assert.equal(call.body['tem:ContractStrGUID'], item.ID)
}

for (const [name, lookupMethod] of [
    ['identification_phone_number', 'GetContractsInfo_By_Phone'],
    ['identification_account_number', 'FindAllByContractNumber']
]) {
    const filename = path.join(__dirname, `${name}.js`)
    const agent = {
        filename, lookupMethod,
        source: readFileSync(filename, 'utf8'),
        settings: JSON.parse(readFileSync(path.join(__dirname, `${name}_settings.json`), 'utf8'))
    }
    const check = (description, run) => test(`${name}: ${description}`, { timeout: 5000 }, run)

    check('настройка address_success и лимит размера платформы', () => {
        assert.equal(agent.settings.slots.addressSuccess, 'address_success')
        const bytes = Buffer.byteLength(agent.source, 'utf8')
        assert.ok(bytes <= 32766, `${bytes} / 32766 bytes`)
    })

    check('пустой SOAP-результат → следующая статья с false и очищенными слотами', async (t) => {
        for (const lookupResult of ['', {}, { ContractInfo: [] }]) {
            await t.test(JSON.stringify(lookupResult), async () => {
                const initialSlots = Object.fromEntries(Object.values(agent.settings.slots).map(id => [id, 'old-value']))
                const s = session(agent, [], {
                    lookupResult, initialSlots,
                    initialStorage: { contracts: 'old-contracts', contracts_addresses: 'old-addresses', contracts_pagination: 'old-page' }
                })
                const reply = await s.turn()
                assert.equal(reply.text, '/switchredirect classifier-test intent_id="next-test"')
                assert.equal(reply.slots.successful_identification, 'false')
                assert.equal(reply.slots.has_next_account, 'false')
                for (const [id, value] of Object.entries(reply.slots)) {
                    if (!['successful_identification', 'has_next_account'].includes(id)) assert.equal(value, '', id)
                }
                assert.deepEqual(s.storageKeys, [])
                assert.equal(s.calls.length, 1, 'приборы при отсутствии ЛС не запрашиваются')
                assert.equal(s.calls[0].method, lookupMethod)
            })
        }
    })

    check('пустой результат учитывает classifier и next_article из слотов', async () => {
        const s = session(agent, [], { initialSlots: { classifier: 'custom-classifier', next_article: 'custom-next' } })
        const reply = await s.turn()
        assert.equal(reply.text, '/switchredirect custom-classifier intent_id="custom-next"')
        assert.equal(reply.slots.successful_identification, 'false')
        assert.equal(reply.slots.address_success, '')
    })

    check('после пустого результата новый вход выполняет новый поиск', async () => {
        const s = session(agent, [])
        for (let turn = 0; turn < 2; turn++) {
            const reply = await s.turn()
            assert.equal(reply.text, '/switchredirect classifier-test intent_id="next-test"')
            assert.equal(reply.slots.successful_identification, 'false')
            assert.equal(s.state, null)
        }
        assert.equal(s.calls.length, 2)
        assert.ok(s.calls.every(call => call.method === lookupMethod))
    })

    check('технические ошибки и повреждённые данные поиска направляются оператору', async (t) => {
        const faultResponse = envelope(lookupMethod, '')
        faultResponse['soap:Envelope']['soap:Body']['soap:Fault'] = { faultcode: 'soap:Server', faultstring: 'Test fault' }
        for (const [description, options] of [
            ['ошибка запроса', { lookupError: true }],
            ['ошибка разбора XML', { lookupParseError: true }],
            ['отсутствует результат SOAP', { lookupResponse: {} }],
            ['SOAP Fault с пустым результатом', { lookupResponse: faultResponse }],
            ['null вместо результата', { lookupResult: null }],
            ['строка вместо результата', { lookupResult: 'invalid-result' }],
            ['boolean вместо результата', { lookupResult: false }],
            ['массив вместо результата', { lookupResult: [] }],
            ['пустой ContractInfo', { lookupResult: { ContractInfo: '' } }],
            ['null вместо ContractInfo', { lookupResult: { ContractInfo: null } }],
            ['у найденного ЛС нет адреса', { lookupResult: { ContractInfo: { ID: 'broken', No: 'broken', Adress: '' } } }]
        ]) {
            await t.test(description, async () => {
                const s = session(agent, [], { ...options, initialSlots: { address_success: 'true', account_number: 'old-number' } })
                const reply = await s.turn()
                assert.equal(reply.text, '/switchredirect classifier-test intent_id="operator-test"')
                assert.equal(reply.slots.successful_identification, 'false')
                assert.equal(reply.slots.address_success, '')
                assert.equal(reply.slots.account_number, '')
                assert.equal(s.state, null)
                assert.equal(s.calls.length, 1)
            })
        }
    })

    check('одинаковые Adress в разных City остаются отдельными вариантами', async () => {
        const s = session(agent, [contract('first', ' Маркова '), contracts[1]])
        assert.match((await s.turn('', 0)).text, /Назовите адрес/)
        assert.deepEqual(s.state.contracts.map(item => item.City), ['Маркова', 'Иркутск'])
        assert.equal(s.calls.length, 1, 'приборы до выбора ЛС не запрашиваются')
    })

    check('полное совпадение учитывает город и оставляет address_success пустым', async (t) => {
        for (const answer of ['Иркутск, улица Медовая, дом 5, квартира 47', 'г. Маркова, ул. Медовая, д. 5, кв. 47']) {
            await t.test(answer, async () => {
                const s = session(agent, contracts, { initialSlots: { address_success: 'true' } })
                assert.equal((await s.turn()).slots.address_success, '')
                selected(s, await s.turn(answer), answer.includes('Маркова') ? contracts[0] : contracts[1])
            })
        }
    })

    check('частичное совпадение по городу → подтверждение с городом → true', async (t) => {
        for (const answer of ['Маркова', 'Марковой']) {
            await t.test(answer, async () => {
                const s = session(agent)
                await s.turn()
                const question = await s.turn(answer)
                assert.equal(s.state.step, 'confirm_partial')
                assert.match(question.text, /Вы обращаетесь по адресу: Маркова, Медовая, дом 5, квартира 47\?/)
                assert.equal(question.slots.address_success, '')
                selected(s, await s.turn('да'), contracts[0], 'true')
                assert.equal(s.calls.filter(call => call.method === lookupMethod).length, 1)
            })
        }
    })

    check('частичное совпадение по улице озвучивает город перед подтверждением', async () => {
        const s = session(agent)
        await s.turn()
        assert.match((await s.turn('Трудовая')).text, /Иркутск, Трудовая, дом 129А, квартира 40/)
        selected(s, await s.turn('верно'), contracts[2], 'true')
    })

    check('повтор подтверждения и повторный вход не устанавливают true до согласия', async () => {
        const s = session(agent)
        await s.turn()
        await s.turn('Маркова')
        assert.equal((await s.turn('не знаю')).slots.address_success, '')
        assert.match((await s.turn('', 0)).text, /Маркова, Медовая/)
        assert.equal(s.state.retry, 1)
        selected(s, await s.turn('да'), contracts[0], 'true')
    })

    check('равнозначные адреса → список с городами → номер без address_success', async () => {
        const s = session(agent)
        await s.turn()
        const list = await s.turn('Медовая, дом 5')
        assert.equal(s.state.step, 'choose_address')
        assert.equal(list.slots.address_success, '')
        assert.match(list.text, /Номер 1: Маркова, Медовая, дом 5, квартира 47/)
        assert.match(list.text, /Номер 2: Иркутск, Медовая, дом 5, квартира 47/)
        assert.match(list.text, /Номер 3: Иркутск, Трудовая/)
        selected(s, await s.turn('номер два'), contracts[1])
    })

    check('отказ или два непонятных ответа → список без address_success', async (t) => {
        for (const answers of [['нет'], ['не знаю', 'не знаю']]) {
            await t.test(answers.join(' → '), async () => {
                const s = session(agent)
                await s.turn()
                await s.turn('Маркова')
                for (const answer of answers) assert.equal((await s.turn(answer)).slots.address_success, '')
                assert.equal(s.state.step, 'choose_address')
                selected(s, await s.turn('первый'), contracts[0])
            })
        }
    })

    check('единственный адрес и дубли одного города выбираются автоматически без true', async (t) => {
        for (const data of [[contracts[0]], [contracts[0], contract('duplicate', 'г. Маркова')]]) {
            await t.test(`${data.length} ЛС`, async () => {
                const s = session(agent, data, { initialSlots: { address_success: 'true' } })
                selected(s, await s.turn(), contracts[0])
            })
        }
    })

    check('пустой или отсутствующий City: населённый пункт берётся из Adress', async (t) => {
        for (const City of [undefined, '', '   ', null, {}]) {
            await t.test(JSON.stringify(City) || 'undefined', async () => {
                const first = contract('first', City, 'г. Маркова, улица Медовая, дом 5, квартира 47')
                const s = session(agent, [first, contracts[2]])
                await s.turn()
                assert.match((await s.turn('Медовая')).text, /Маркова, Медовая/)
                selected(s, await s.turn('да'), first, 'true')
            })
        }
    })

    check('город из City и Adress не дублируется, индекс не озвучивается', async (t) => {
        for (const Adress of [
            '664000, г. Иркутск, улица Медовая, дом 5, квартира 47',
            '664000, Иркутск, Садовое товарищество Ромашка, дом 5',
            '664000, Садовое товарищество Ромашка, дом 5'
        ]) {
            await t.test(Adress, async () => {
                const s = session(agent, [contract('first', 'г. Иркутск', Adress), contracts[2]])
                await s.turn()
                const question = await s.turn('дом 5')
                assert.equal(s.state.step, 'confirm_partial')
                assert.equal((question.text.match(/Иркутск/g) || []).length, 1)
                assert.doesNotMatch(question.text, /664000/)
            })
        }
    })

    check('новый поиск очищает true от предыдущего подтверждения', async () => {
        const s = session(agent)
        await s.turn()
        await s.turn('Маркова')
        selected(s, await s.turn('да'), contracts[0], 'true')
        assert.equal((await s.turn()).slots.address_success, '')
        assert.equal(s.state.step, 'ask_multiple')
        assert.equal(s.calls.filter(call => call.method === lookupMethod).length, 2)
        assert.equal((await s.turn('Иркутск, Медовая, дом 5, квартира 47')).slots.address_success, '')
    })

    check('нет нужного адреса и ошибка SOAP очищают прежний true', async (t) => {
        await t.test('нет в списке', async () => {
            const s = session(agent, contracts, { initialSlots: { address_success: 'true' } })
            await s.turn()
            await s.turn('адрес неизвестен')
            const reply = await s.turn('нет')
            assert.match(reply.text, /intent_id="operator-test"/)
            assert.equal(reply.slots.address_success, '')
            assert.equal(reply.slots.successful_identification, 'false')
        })
        await t.test('ошибка получения приборов после да', async () => {
            const s = session(agent, contracts, { meterError: true, initialSlots: { address_success: 'true' } })
            await s.turn()
            await s.turn('Маркова')
            const reply = await s.turn('да')
            assert.match(reply.text, /intent_id="operator-test"/)
            assert.equal(reply.slots.address_success, '')
            assert.equal(reply.slots.successful_identification, 'false')
            assert.equal(s.state, null)
        })
    })

    check('имя слота подтверждения берётся из настроек', async () => {
        const s = session(agent, contracts, { slotOverrides: { addressSuccess: 'custom_address_success' } })
        assert.equal((await s.turn()).slots.custom_address_success, '')
        await s.turn('Маркова')
        const reply = await s.turn('да')
        assert.equal(reply.slots.custom_address_success, 'true')
        assert.equal(Object.hasOwn(reply.slots, 'address_success'), false)
    })
}
