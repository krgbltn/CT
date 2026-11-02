const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const read = name => readFileSync(path.join(__dirname, name), 'utf8')
const controllerSource = read('readings-soap-module.js') + '\n' + read('readings-controller.js')
const template = JSON.parse(read('readings-controller_settings.json'))
const clone = value => JSON.parse(JSON.stringify(value))

// По умолчанию XML-глобалы подменены снимками результата xml2js, как в соседних тестах.
// Дополнительный прогон с READINGS_XML_MODULES использует уже имеющийся xml-js для XML.
let xml
if (process.env.READINGS_XML_MODULES) {
    xml = require(require.resolve('xml-js', { paths: [process.env.READINGS_XML_MODULES] }))
}
function xmlNode(value, encode) {
    if (Array.isArray(value)) return value.map(item => xmlNode(item, encode))
    if (value === null || typeof value !== 'object') return encode ? { _text: String(value ?? '') } : value
    if (!encode && Object.keys(value).every(key => key === '_text')) return value._text || ''
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        encode && key === '@' ? '_attributes' : (!encode && key === '_attributes' ? '$' : key),
        key === '@' || key === '_attributes' ? item : xmlNode(item, encode)
    ]))
}
const encode = value => xml ? xml.js2xml(xmlNode(value, true), { compact: true }) : JSON.stringify(value)
const decode = value => xml ? xmlNode(xml.xml2js(value, { compact: true, trim: true, ignoreDeclaration: true }), false) : JSON.parse(value)
const xmlGlobals = {
    js2xmlparser: { parse: (tag, body) => encode({ [tag]: body }) },
    xml2js: { Parser: class {
        constructor(options) { assert.equal(options.explicitArray, false) }
        parseString(value, callback) {
            try { callback(null, decode(value)) } catch (error) { callback(error) }
        }
    } }
}
const bodyOf = request => {
    const envelope = decode(request.data)['soapenv:Envelope']
    const body = envelope['soapenv:Body']
    return body[Object.keys(body)[0]]
}
const response = (method, result, prefix = 'soap') => ({
    status: 200,
    data: encode({ [`${prefix}:Envelope`]: { [`${prefix}:Body`]: { [`${method}Response`]: { [`${method}Result`]: result } } } })
})
const scale = (id, extra = {}) => ({
    MDScaleID: id, MDScaleName: 'Основная', MDSDigitsAfterDot: '2',
    LastReadings: '100.25', MaxAcceptableNewMDReadingValue: '250.25', ...extra
})
const meter = (number, scales) => ({
    MDSerialNumber: number, MDInstallationLocation: 'Место & установки', MDScales: { MDScaleInfo: scales }
})
const basic = () => ({ '24': [meter('A-335', [scale('scale-1')])] })
const identity = { account_id: 'account-test', account_number: 'ЛС-тест', account_address: 'Тестовый адрес' }

function session({ meters = basic(), source = controllerSource, settings = {}, handler } = {}) {
    const config = {
        ...clone(template), url: 'https://example.invalid/IVR.asmx', aiAgent: 'ai-test', routingAgent: 'routing-test',
        articles: { input: 'input-test', correction: 'correction-test', error: 'error-test', finish: 'finish-test' },
        ...settings
    }
    const store = new Map()
    const calls = []
    let slots = { ...identity }
    let sequence = 0
    let writes = 0
    let failWrite
    let failRead = false
    const s = {
        config, calls, store,
        get slots() { return slots },
        get state() { return JSON.parse(store.get('readings_controller')) },
        failSaveWhen(fn) { failWrite = fn },
        failReads() { failRead = true },
        submissions() { return calls.filter(request => request.headers.SOAPAction.endsWith('/InputOfReadingsWithDot')) },
        async turn(changes = {}, { id = `message-${++sequence}`, type = 1, text = '' } = {}) {
            const incoming = { ...slots, ...changes }
            let count = 0
            let reply
            const resolved = new Promise((resolve, reject) => {
                const context = {
                    ...xmlGlobals, agentSettings: config, https: require('node:https'),
                    logger: { info() {}, error() {} },
                    message: { id, message_type: type, message: { text }, slot_context: {
                        filled_slots: Object.entries(incoming).map(([slot_id, value]) => ({ slot_id, value }))
                    } },
                    agentStorage: { dialogStorage: {
                        async get(key) { if (failRead) throw new Error('Storage read failed'); return store.get(key) },
                        async set(key, value) {
                            writes++
                            if (failWrite?.({ key, value: JSON.parse(value), writes })) return false
                            store.set(key, value)
                            return true
                        },
                        async del(key) { store.delete(key); return true }
                    } },
                    axios: async request => {
                        calls.push(request)
                        if (handler) {
                            const custom = await handler(request, s)
                            if (custom !== undefined) return custom
                        }
                        const method = request.headers.SOAPAction.split('/').pop()
                        if (method === 'GetMDInfo_By_ContractIDAndNomenclatureCode') {
                            const code = bodyOf(request)['tem:NomenclatureCode']
                            const found = meters[code] || []
                            return response(method, found.length ? { MDInfo: found.length === 1 ? found[0] : found } : '')
                        }
                        if (method === 'InputOfReadingsWithDot') return response(method, '1')
                        throw new Error(`Unexpected HTTP method ${method}`)
                    },
                    agentApi: {
                        makeTextReply(text, attachment, actions, filledSlots = {}) { return { text, slots: filledSlots } },
                        makeAckReply() { return { text: '/ack ack ack', slots: {} } }
                    },
                    resolve(value) { count++; resolve(value) }
                }
                try { vm.runInNewContext(source, context, { timeout: 1000 }) } catch (error) { reject(error) }
            })
            const result = await resolved
            assert.equal(count, 1)
            assert.equal(result.length, 1)
            reply = clone(result[0])
            for (const value of Object.values(reply.slots)) assert.equal(typeof value, 'string')
            // Имитируем сброс контекста платформой: остаются только явно переданные слоты.
            slots = reply.slots
            return reply
        },
        init(id) { return s.turn({ ...identity, readings_action: 'init' }, id ? { id } : {}) },
        process(value, extra = {}) { return s.turn({ readings_action: 'process', current_new_reading: value, ...extra }) },
        next(extra = {}) { return s.turn({ readings_action: 'next', ...extra }) }
    }
    return s
}
const article = (reply, name) => assert.match(reply.text, new RegExp(`intent_id="${name}-test"`))

test('Все скрипты укладываются в лимит платформы; контракт не содержит reading_retry', () => {
    for (const file of ['readings-controller.js', 'readings-soap-module.js', 'identification_account.js', 'identification_phone.js']) {
        assert.ok(Buffer.byteLength(read(file), 'utf8') <= 32766, file)
    }
    assert.doesNotMatch(controllerSource, /reading_retry/)
})

test('Все услуги, приборы и шкалы; дедупликация до выбора первого значения; сохранение порядка', async () => {
    const s = session({ meters: {
        '24': [meter('335', [scale('SHARED', { MDScaleName: 'День' }), scale('night', { MDScaleName: 'Ночь' })]), meter('336', [scale('other')])],
        '2': [meter('337', [scale('shared', { MDScaleName: 'Дубликат', MaxAcceptableNewMDReadingValue: '999' }), scale('water')])],
        '1': [meter('338', [scale('heat'), scale('volume')])]
    } })
    const reply = await s.init()
    article(reply, 'input')
    assert.deepEqual(s.state.queue.map(item => item.id), ['shared', 'night', 'other', 'water', 'heat', 'volume'])
    assert.equal(s.state.queue[0].maximum, '250.25')
    assert.equal(reply.slots.current_service, 'электроэнергии')
    assert.equal(reply.slots.current_scale_name, 'День')
    assert.equal(reply.slots.scale_type, 'false')
    assert.equal(reply.slots.current_meter_location, 'Место & установки')
    assert.deepEqual(s.calls.map(request => bodyOf(request)['tem:NomenclatureCode']), ['24', '2', '21', '1'])
})

test('Слоты отправленной шкалы сохраняются до next; следующая шкала очищает ввод и ошибки', async () => {
    const s = session({ meters: { '24': [meter('A-335', [scale('one'), scale('two')])] } })
    await s.init()
    const firstStep = s.slots.readings_step_id
    const reply = await s.process('00123,34')
    article(reply, 'input')
    assert.equal(reply.slots.reading_status, 'accepted')
    assert.equal(reply.slots.current_new_reading, '123.34')
    assert.equal(reply.slots.current_meter_number_short, '335')
    assert.equal(reply.slots.readings_step_id, firstStep)
    assert.equal(reply.slots.readings_sent_count, '1')
    assert.equal(bodyOf(s.submissions()[0])['tem:MDScale_NewReadings'], '123.34')
    const next = await s.next()
    assert.equal(next.slots.reading_status, 'ready')
    assert.equal(next.slots.current_new_reading, '')
    assert.equal(next.slots.reading_error, '')
    assert.equal(next.slots.readings_action, '')
    assert.equal(next.slots.skip_service, '')
    assert.notEqual(next.slots.readings_step_id, firstStep)
})

test('Границы и точные сравнения десятичных строк', async t => {
    const cases = [
        ['100.25', '250.25', '100.25', ''], ['100.25', '250.25', '200.25', ''],
        ['100.25', '250.25', '200.26', '2'], ['100.25', '150.03', '150.03', ''],
        ['100.25', '150.03', '150.04', '2'], ['100.25', '250.25', '100.24', '1'],
        ['0', '100', '0', ''], ['0.1', '100.1', '100.10', ''],
        ['9007199254740993123.45', '9007199254740993223.45', '9007199254740993223.45', ''],
        ['9007199254740993123.45', '9007199254740993223.45', '9007199254740993223.46', '2']
    ]
    for (const [previous, maximum, value, expected] of cases) await t.test(value + '/' + maximum, async () => {
        const s = session({ meters: { '24': [meter('335', [scale('one', { LastReadings: previous, MaxAcceptableNewMDReadingValue: maximum })])] } })
        await s.init()
        const reply = await s.process(value)
        assert.equal(reply.slots.reading_error, expected)
        assert.equal(s.submissions().length, expected ? 0 : 1)
    })
})

test('Ошибки ввода сохраняют шкалу и значение; исправление использует новый шаг', async t => {
    for (const [value, expected] of [['123abc', '3'], ['1,2.3', '3'], ['', '3'], ['1e3', '3'], ['0x10', '3'], ['-1', '3'], ['123.456', '4']]) {
        await t.test(value || 'empty', async () => {
            const s = session()
            await s.init()
            const oldStep = s.slots.readings_step_id
            const reply = await s.process(value)
            article(reply, 'correction')
            assert.equal(reply.slots.reading_error, expected)
            assert.equal(reply.slots.current_new_reading, value)
            assert.equal(reply.slots.current_meter_number, 'A-335')
            assert.notEqual(reply.slots.readings_step_id, oldStep)
            assert.equal(s.submissions().length, 0)
            assert.equal((await s.process('123,34')).slots.reading_status, 'accepted')
            assert.equal(s.submissions().length, 1)
        })
    }
})

test('Точность 0 -> 3 -> 0; предыдущие дроби не обрезаются', async () => {
    const s = session({ meters: { '24': [meter('335', [
        scale('a', { MDSDigitsAfterDot: '0', LastReadings: '1.999' }),
        scale('b', { MDSDigitsAfterDot: '3' }), scale('c', { MDSDigitsAfterDot: '0' })
    ])] } })
    await s.init()
    assert.equal(s.slots.scale_type, 'true')
    await s.process('2')
    await s.next()
    assert.equal(s.slots.scale_type, 'false')
    await s.process('123.456')
    await s.next()
    assert.equal(s.slots.scale_type, 'true')
    assert.equal((await s.process('123.0')).slots.reading_error, '4')
})

test('Пропуск приоритен перед валидацией; одинаковые номера не объединяют приборы', async () => {
    const s = session({ meters: { '24': [meter('335', [scale('a'), scale('b')]), meter('335', [scale('c')])] } })
    await s.init()
    const reply = await s.process('invalid', { skip_service: 'true' })
    assert.equal(reply.slots.reading_status, 'ready')
    assert.equal(reply.slots.skip_service, '')
    assert.equal(reply.slots.current_new_reading, '')
    assert.equal(reply.slots.readings_skipped_count, '2')
    assert.equal(s.state.queue[2].status, 'pending')
    assert.equal(s.submissions().length, 0)
})

test('Пропуск после частичной отправки сохраняет успех; пропуск всех завершает цикл', async () => {
    const s = session({ meters: { '24': [meter('335', [scale('a'), scale('b'), scale('c')])] } })
    await s.init()
    await s.process('120')
    await s.next()
    const done = await s.process('', { skip_service: 'true' })
    article(done, 'finish')
    assert.equal(done.slots.readings_sent_count, '1')
    assert.equal(done.slots.readings_skipped_count, '2')
    assert.equal(done.slots.reading_status, '')
    const all = session()
    await all.init()
    article(await all.process('', { skip_service: 'true' }), 'finish')
    assert.equal(all.slots.readings_sent_count, '0')
    assert.equal(all.submissions().length, 0)
})

test('Повторные init/process/next и старый шаг не повторяют отправку и продвижение', async () => {
    const s = session({ meters: { '24': [meter('335', [scale('a'), scale('b')])] } })
    await s.init('init-once')
    const first = clone(s.slots)
    await s.init('init-once')
    assert.equal(s.calls.length, 4)
    await s.process('120')
    await s.process('130')
    assert.equal(s.submissions().length, 1)
    assert.equal(s.slots.current_new_reading, '120')
    await s.next()
    const secondStep = s.slots.readings_step_id
    await s.next({ readings_step_id: first.readings_step_id })
    await s.process('140', { readings_step_id: first.readings_step_id })
    assert.equal(s.slots.readings_step_id, secondStep)
    assert.equal(s.submissions().length, 1)
    assert.equal(s.state.index, 1)
})

test('Новый ЛС создает новую очередь, а поздний init старого цикла не переключает ее обратно', async () => {
    const s = session()
    await s.init('first-init')
    await s.process('120')
    await s.turn({ account_id: 'other-account', account_number: 'Другой ЛС', account_address: 'Другой адрес', readings_action: 'init' }, { id: 'second-init' })
    assert.equal(s.slots.account_id, 'other-account')
    assert.equal(s.slots.readings_sent_count, '0')
    assert.equal(s.slots.current_new_reading, '')
    await s.init('first-init')
    assert.equal(s.slots.account_id, 'other-account')
    assert.equal(s.calls.length, 9)
})

test('Полный успешный цикл и повтор последнего next завершаются без повторного POST', async () => {
    const s = session()
    await s.init()
    await s.process('120')
    const sentStep = s.slots.readings_step_id
    article(await s.next(), 'finish')
    assert.equal(s.slots.current_meter_number, '')
    assert.equal(s.slots.readings_sent_count, '1')
    article(await s.next({ readings_step_id: sentStep }), 'finish')
    assert.equal(s.submissions().length, 1)
})

test('Техническая ошибка после успеха не возвращает accepted; новый ЛС не получает старые данные', async () => {
    let failLookup = false
    const s = session({ handler: request => {
        if (failLookup && request.headers.SOAPAction.endsWith('/GetMDInfo_By_ContractIDAndNomenclatureCode')) throw new Error('Lookup failed')
    } })
    await s.init()
    await s.process('120')
    const invalid = await s.process('130', { account_id: 'wrong' })
    article(invalid, 'error')
    assert.equal(invalid.slots.reading_status, '')
    failLookup = true
    const failedInit = await s.turn({ readings_action: 'init', account_id: 'another', account_number: 'ЛС-2', account_address: 'Другой адрес' })
    article(failedInit, 'error')
    assert.equal(failedInit.slots.account_id, 'another')
    assert.equal(failedInit.slots.current_meter_number, '')
    assert.equal(failedInit.slots.reading_status, '')
})

test('Пустая очередь завершается без отправки', async () => {
    const s = session({ meters: {} })
    article(await s.init(), 'finish')
    assert.equal(s.slots.readings_sent_count, '0')
    assert.equal(s.submissions().length, 0)
})

test('Техническая ошибка при отсутствии обязательных данных шкалы', async t => {
    for (const field of ['MDScaleID', 'MDScaleName', 'MDSDigitsAfterDot', 'LastReadings', 'MaxAcceptableNewMDReadingValue']) {
        await t.test(field, async () => {
            const data = scale('a')
            delete data[field]
            const s = session({ meters: { '24': [meter('335', [data])] } })
            article(await s.init(), 'error')
            assert.equal(s.submissions().length, 0)
        })
    }
    for (const precision of ['-1', '1.5', 'NaN']) {
        const s = session({ meters: { '24': [meter('335', [scale('a', { MDSDigitsAfterDot: precision })])] } })
        article(await s.init(), 'error')
    }
})

test('Ошибка API и неопределенный результат не повторяются', async t => {
    const variants = [
        ['reject', () => response('InputOfReadingsWithDot', '0'), 'failed'],
        ['timeout', () => { throw new Error('ETIMEDOUT') }, 'unknown'],
        ['invalid XML', () => ({ status: 200, data: '<broken' }), 'unknown'],
        ['missing result', () => response('WrongMethod', '1'), 'unknown'],
        ['HTTP error', () => ({ status: 503, data: 'Unavailable' }), 'unknown'],
        ['SOAP Fault', () => ({ status: 200, data: encode({ 's:Envelope': { 's:Body': { 's:Fault': { faultstring: 'Rejected' } } } }) }), 'failed']
    ]
    for (const [name, respond, status] of variants) await t.test(name, async () => {
        const s = session({ handler: request => request.headers.SOAPAction.endsWith('/InputOfReadingsWithDot') ? respond() : undefined })
        await s.init()
        article(await s.process('120'), 'error')
        assert.equal(s.state.queue[0].status, status)
        article(await s.process('120'), 'error')
        article(await s.next(), 'error')
        assert.equal(s.submissions().length, 1)
    })
})

test('Перед HTTP отправкой статус сохранен; сбои хранения не создают повторную отправку', async () => {
    const s = session({ handler: (request, current) => {
        if (request.headers.SOAPAction.endsWith('/InputOfReadingsWithDot')) assert.equal(current.state.queue[0].status, 'sending')
    } })
    await s.init()
    s.failSaveWhen(({ value }) => value.queue[0]?.status === 'sending')
    article(await s.process('120'), 'error')
    assert.equal(s.submissions().length, 0)
    s.failSaveWhen(({ value }) => value.queue[0]?.status === 'sent')
    const reply = await s.process('120')
    article(reply, 'error')
    assert.notEqual(reply.slots.reading_status, 'accepted')
    assert.equal(s.state.queue[0].status, 'sending')
    article(await s.process('120'), 'error')
    assert.equal(s.submissions().length, 1)
})

test('Системные сообщения, отсутствие и несовпадение шага/ЛС не отправляют показания', async () => {
    const s = session()
    assert.equal((await s.turn({ readings_action: 'init' }, { type: 200 })).text, '/ack ack ack')
    assert.equal(s.calls.length, 0)
    await s.init()
    article(await s.next(), 'error')
    article(await s.process('120', { account_id: 'wrong' }), 'error')
    article(await s.process('120', { readings_step_id: '' }), 'error')
    assert.equal(s.submissions().length, 0)
})

test('Произвольные слоты сценария не переносятся; настройки слотов применяются', async () => {
    const s = session({ settings: { slots: { ...template.slots, service: 'service-custom', scaleType: 'integer-custom' } } })
    await s.turn({ ...identity, readings_action: 'init', scenario_private: 'private' })
    assert.equal(s.slots['service-custom'], 'электроэнергии')
    assert.equal(s.slots['integer-custom'], 'false')
    assert.equal(s.slots.scenario_private, undefined)
})

test('Некорректные настройки и ошибки чтения/записи хранилища не вызывают SOAP', async () => {
    const blank = session({ settings: { url: '' } })
    article(await blank.init(), 'error')
    assert.equal(blank.calls.length, 0)
    const unreadable = session()
    unreadable.failReads()
    article(await unreadable.init(), 'error')
    assert.equal(unreadable.calls.length, 0)
    const unsaved = session()
    unsaved.failSaveWhen(() => true)
    article(await unsaved.init(), 'error')
    assert.equal(unsaved.store.size, 0)
    assert.equal(unsaved.submissions().length, 0)
    const corrupt = session()
    corrupt.store.set('readings_controller', '{broken')
    article(await corrupt.init(), 'error')
    assert.equal(corrupt.calls.length, 0)
})

test('Поврежденная сохраненная шкала или позиция не запускает отправку', async () => {
    for (const damage of [state => { state.queue[0].number = {} }, state => { state.index = 1 }, state => { state.queue[0].status = 'sent' }]) {
        const s = session()
        await s.init()
        const bad = s.state
        damage(bad)
        s.store.set('readings_controller', JSON.stringify(bad))
        article(await s.process('120'), 'error')
        assert.equal(s.submissions().length, 0)
    }
})

test('Сбой сохранения next не продвигает сохраненную очередь и не повторяет POST', async () => {
    const s = session({ meters: { '24': [meter('335', [scale('a'), scale('b')])] } })
    await s.init()
    await s.process('120')
    const sentStep = s.slots.readings_step_id
    s.failSaveWhen(({ value }) => value.index === 1)
    article(await s.next(), 'error')
    assert.equal(s.state.index, 0)
    s.failSaveWhen(() => false)
    await s.next({ readings_step_id: sentStep })
    assert.equal(s.state.index, 1)
    assert.equal(s.submissions().length, 1)
})

test('Некорректный SOAP получения приборов и прибор без шкал ведут в техническую статью', async t => {
    const method = 'GetMDInfo_By_ContractIDAndNomenclatureCode'
    const variants = [
        ['broken XML', () => ({ status: 200, data: '<broken' })],
        ['wrong collection', () => response(method, { unexpected: 'value' })],
        ['missing result', () => response('WrongMethod', '')],
        ['empty HTTP', () => ({ status: 200, data: '' })],
        ['network failure', () => { throw new Error('Network unavailable') }],
        ['no scales', () => response(method, { MDInfo: meter('335', []) })]
    ]
    for (const [name, respond] of variants) await t.test(name, async () => {
        const s = session({ handler: request => request.headers.SOAPAction.endsWith('/' + method) ? respond() : undefined })
        article(await s.init(), 'error')
        assert.equal(s.submissions().length, 0)
    })
})

test('SOAP-модуль принимает другие префиксы пространств имен', async () => {
    const method = 'GetMDInfo_By_ContractIDAndNomenclatureCode'
    const s = session({ handler: request => {
        if (request.headers.SOAPAction.endsWith('/' + method)) return {
            status: 200,
            data: encode({ 'env:Envelope': { 'env:Body': { ['api:' + method + 'Response']: {
                ['api:' + method + 'Result']: bodyOf(request)['tem:NomenclatureCode'] === '24' ? {
                    'api:MDInfo': { 'api:MDSerialNumber': '335', 'api:MDScales': { 'api:MDScaleInfo': {
                        'api:MDScaleID': 'scale-a', 'api:MDScaleName': 'Основная', 'api:MDSDigitsAfterDot': '0',
                        'api:LastReadings': '10', 'api:MaxAcceptableNewMDReadingValue': '110'
                    } } }
                } : ''
            } } } })
        }
        if (request.headers.SOAPAction.endsWith('/InputOfReadingsWithDot')) return response('InputOfReadingsWithDot', '1', 'env')
    } })
    article(await s.init(), 'input')
    assert.equal((await s.process('110')).slots.reading_status, 'accepted')
})

for (const name of ['identification_account_number', 'identification_phone_number']) {
    test(`${name}: выбор ЛС передает GUID без запросов приборов и очищает старые слоты`, async () => {
        const config = JSON.parse(read(name + '_settings.json'))
        assert.deepEqual(Object.keys(config.slots).sort(), ['accountId', 'contract', 'address', 'authSuccess', 'addressSuccess'].sort())
        const s = session({ source: read(name + '.js'), settings: { ...config,
            url: 'https://example.invalid/IVR.asmx', aiAgent: 'ai-test', routingAgent: 'routing-test',
            nextArticle: 'input-test', operatorArticle: 'error-test', useHardcodedPhone: false
        }, handler: request => {
            const method = request.headers.SOAPAction.split('/').pop()
            assert.ok(['FindAllByContractNumber', 'GetContractsInfo_By_Phone'].includes(method))
            return response(method, { ContractInfo: { ID: identity.account_id, No: identity.account_number, Adress: identity.account_address } })
        } })
        const reply = await s.turn({ ...Object.fromEntries(Object.keys(config.resetSlots).map(id => [id, 'old'])),
            account_number_client: '12345', sys_phone: '0000000000',
            account_id: 'old', current_new_reading: 'old', number_electricity_meter: 'old', readings_step_id: 'old', scale_type: 'true'
        })
        article(reply, 'input')
        assert.equal(reply.slots.account_id, identity.account_id)
        assert.equal(reply.slots.account_number, identity.account_number)
        assert.equal(reply.slots.successful_identification, 'true')
        assert.equal(reply.slots.current_new_reading, '')
        assert.equal(reply.slots.number_electricity_meter, '')
        assert.equal(reply.slots.readings_step_id, '')
        assert.equal(reply.slots.scale_type, '')
        assert.equal(reply.slots.readings_electricity, '')
        for (const [slotId, resetValue] of Object.entries(config.resetSlots)) assert.equal(reply.slots[slotId], resetValue)
        assert.equal(Object.hasOwn(reply.slots, 'undefined'), false)
        assert.equal(s.calls.length, 1)
    })

    test(`${name}: пустой поиск очищает GUID; выбор из нескольких адресов сохранен`, async () => {
        const config = JSON.parse(read(name + '_settings.json'))
        const accounts = [
            { ID: 'first-test', No: 'ЛС-1', Adress: 'г Тестоград, ул Первая, дом 1' },
            { ID: 'second-test', No: 'ЛС-2', Adress: 'г Тестоград, ул Вторая, дом 2' }
        ]
        const create = data => session({ source: read(name + '.js'), settings: { ...config,
            aiAgent: 'ai-test', nextArticle: 'input-test', operatorArticle: 'error-test', useHardcodedPhone: false
        }, handler: request => response(request.headers.SOAPAction.split('/').pop(), data.length ? { ContractInfo: data } : '') })
        const empty = create([])
        const failure = await empty.turn({ account_number_client: '12345', sys_phone: '0000000000' })
        article(failure, 'input')
        assert.equal(failure.slots.account_id, '')
        assert.equal(failure.slots.successful_identification, 'false')
        const multiple = create(accounts)
        assert.match((await multiple.turn({ account_number_client: '12345', sys_phone: '0000000000' })).text, /Назовите адрес/)
        assert.match((await multiple.turn({}, { text: 'неизвестный адрес' })).text, /Номер 1/)
        const selected = await multiple.turn({}, { text: '2' })
        article(selected, 'input')
        assert.equal(selected.slots.account_id, 'second-test')
        assert.equal(selected.slots.account_number, 'ЛС-2')
        assert.equal(multiple.calls.length, 1)
    })
}
