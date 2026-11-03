const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const contract = (id, Adress, City = '') => ({ ID: id, No: `ЛС-${id}`, Adress, City })
const contracts = [
    contract('first', 'Иркутск улица Медовая дом 3'),
    contract('second', 'Ангарск, улица Артельная дом 6'),
    contract('third', 'Усть-илимск улица Автовокзальная дом 78'),
    contract('fourth', 'Иркутск, улица Советская дом 5')
]

// Каждый ход заново запускает агент с сохранённым состоянием, без внешних запросов.
function session(name, data = contracts) {
    const source = readFileSync(path.join(__dirname, name + '.js'), 'utf8')
    const settings = {
        slots: { accountId: 'id', contract: 'contract', address: 'address', authSuccess: 'success' },
        aiAgent: 'ai-test', nextArticle: 'next-test', operatorArticle: 'operator-test'
    }
    const store = new Map([['readings_identification', JSON.stringify({ contracts: data, step: 'ask_multiple' })]])
    return {
        get state() { return JSON.parse(store.get('readings_identification')) },
        async turn(text = '', type = 1) {
            const result = await new Promise((resolve, reject) => {
                try {
                    vm.runInNewContext(source, {
                        agentSettings: settings,
                        message: { message_type: type, message: { text } },
                        logger: { info() {}, error() {} },
                        agentStorage: { dialogStorage: {
                            async get(key) { return store.get(key) },
                            async set(key, value) { store.set(key, value); return true },
                            async del(key) { store.delete(key); return true }
                        } },
                        axios() { throw new Error('Unexpected HTTP request') },
                        agentApi: { makeTextReply(text, attachment, actions, slots) { return { text, slots } } },
                        resolve
                    }, { timeout: 1000 })
                } catch (error) { reject(error) }
            })
            assert.equal(result.length, 1)
            return JSON.parse(JSON.stringify(result[0]))
        }
    }
}

for (const name of ['identification_account', 'identification_phone']) {
    test(`${name}: пример клиента, новая нумерация и выбор второго адреса`, async () => {
        const s = session(name)
        const reply = await s.turn('Обращаюсь по адресу в городе ИРКУТСК.')
        assert.match(reply.text, /Номер 1: Иркутск.*Медовая/)
        assert.match(reply.text, /Номер 2: Иркутск.*Советская/)
        assert.doesNotMatch(reply.text, /Ангарск|Илимск|Номер 3/)
        assert.deepEqual(s.state.contracts.map(item => item.ID), ['first', 'fourth'])
        const selected = await s.turn('номер два')
        assert.equal(selected.slots.id, 'fourth')
        assert.match(selected.text, /intent_id="next-test"/)
    })

    test(`${name}: неизвестный город и часть названия не сужают список`, async () => {
        for (const text of ['Москва', 'Иркут', 'не знаю']) {
            const s = session(name)
            const reply = await s.turn(text)
            // Частичное совпадение может сначала вызвать подтверждение.
            const list = s.state.step === 'confirm_partial' ? await s.turn('нет') : reply
            assert.match(list.text, /Номер 4:/)
            assert.equal(s.state.contracts.length, 4)
        }
    })

    test(`${name}: повтор списка и неверный номер сохраняют фильтр`, async () => {
        const s = session(name)
        await s.turn('Иркутск')
        assert.doesNotMatch((await s.turn('', 0)).text, /Ангарск|Номер 3/)
        assert.match((await s.turn('3')).text, /от 1 до 2/)
        assert.equal((await s.turn('2')).slots.id, 'fourth')
    })

    test(`${name}: после отказа и повторного непонятного подтверждения учитывается исходный город`, async () => {
        for (const answers of [['нет'], ['не знаю', 'не знаю']]) {
            const s = session(name)
            assert.match((await s.turn('Иркутск Медовая')).text, /Скажите «да» или «нет»/)
            let reply
            for (const answer of answers) reply = await s.turn(answer)
            assert.match(reply.text, /Номер 2: Иркутск.*Советская/)
            assert.doesNotMatch(reply.text, /Ангарск|Номер 3/)
            assert.equal((await s.turn('2')).slots.id, 'fourth')
        }
    })

    test(`${name}: отдельное поле City, ё/е и составное название`, async () => {
        const data = [
            contract('a', 'ул Медовая дом 3', 'п. Зелёный Луг'),
            contract('b', 'ул Советская дом 5', 'поселок Зелёный Луг'),
            contract('c', 'Ангарск улица Артельная дом 6')
        ]
        const s = session(name, data)
        const reply = await s.turn('Зеленый луг')
        assert.match(reply.text, /Номер 2:/)
        assert.doesNotMatch(reply.text, /Ангарск|Номер 3/)
        assert.equal((await s.turn('2')).slots.id, 'b')
    })

    test(`${name}: полное совпадение по-прежнему сразу выбирает ЛС`, async () => {
        const s = session(name)
        assert.equal((await s.turn('Иркутск улица Советская дом 5')).slots.id, 'fourth')
    })

    test(`${name}: нет подходящего адреса — перевод оператору`, async () => {
        const s = session(name)
        await s.turn('Иркутск')
        assert.match((await s.turn('нет')).text, /intent_id="operator-test"/)
    })

    test(`${name}: озвучивание сохраняет род исходного окончания и исходный адрес в слоте`, async () => {
        for (const [street, spoken] of [
            ['микрорайон 10-й', 'микрорайон Десятый'],
            ['микрорайон 10-ый', 'микрорайон Десятый'],
            ['переулок 2-ой', 'переулок Второй'],
            ['проезд 3-ий', 'проезд Третий'],
            ['квартал 20-й', 'квартал Двадцатый'],
            ['микрорайон 23-й', 'микрорайон Двадцать Третий'],
            ['улица 10-я', 'Десятая улица'],
            ['улица 10-ая', 'Десятая улица'],
            ['улица 3-я', 'Третья улица'],
            ['улица 3-яя', 'Третья улица'],
            ['улица 23-я', 'Двадцать Третья улица'],
            ['шоссе 10-е', 'шоссе Десятое'],
            ['шоссе 10-ое', 'шоссе Десятое'],
            ['шоссе 3-ее', 'шоссе Третье'],
            ['микрорайон 100-й', 'микрорайон 100-Й'],
            ['улица 100-я', '100-Я улица'],
            ['квартал 92/93', 'квартал 92/93']
        ]) {
            const address = `${street}, дом 31, квартира 86`
            const s = session(name, [contract('a', address, 'Ангарск'), contracts[0]])
            const reply = await s.turn('не знаю')
            assert.ok(reply.text.includes(`Номер 1: Ангарск, ${spoken}, дом 31, квартира 86.`), `${street}: ${reply.text}`)
            const selected = await s.turn('1')
            assert.equal(selected.slots.address, address)
        }
    })

    test(`${name}: размер скрипта не превышает лимит платформы`, () => {
        assert.ok(readFileSync(path.join(__dirname, name + '.js')).length <= 32766)
    })
}
