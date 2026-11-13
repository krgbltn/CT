const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const assert = require('node:assert/strict')

const code = fs.readFileSync(path.join(__dirname, 'gpt_assistant_agent_21vek.js'), 'utf8')
const source = fs.readFileSync(path.join(__dirname, '../Skolkovo/gpt_assistant_agent_skolkovo.js'), 'utf8')
const baseSettings = JSON.parse(fs.readFileSync(path.join(__dirname, 'gpt_assistant_agent_21vek_settings.json'), 'utf8'))

async function run(input = {}, options = {}) {
    const calls = [], logs = []
    const settings = { ...baseSettings, llm_auth_token: 'test-token', ...options.settings }
    const context = options.context ?? {
        context: [{ doc_id: '1', title: 'Доставка', content: 'Стоимость доставки — 10 рублей.' }],
        symbol_code: ['article-test'], title: ['Доставка'],
    }
    const request = { mode: 'gpt', reqTypeCommand: 'gpt_answer', operatorMessage: '', messages: [{ side: 'client', text: 'Сколько стоит доставка?' }], ...input }
    const original = JSON.stringify(request)
    const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('resolve not called')), 2000)
        vm.runInNewContext(options.source || code, {
            URL, Buffer,
            message: options.raw ?? (options.buffer ? Buffer.from(JSON.stringify(request)) : request),
            agentSettings: settings,
            logger: { info: x => logs.push(x), error: x => logs.push(x) },
            axios: { async post(url, data, config) {
                calls.push({ url, data, config })
                if (url.endsWith(options.failPath || '/never')) {
                    const error = new Error('service unavailable')
                    error.response = { status: 401 }
                    error.config = { headers: { Authorization: 'Bearer test-token' } }
                    throw error
                }
                return { data: url.endsWith('/search') ? context : { answer: options.answer ?? '<think>internal</think>Готовый текст' } }
            } },
            resolve: value => { clearTimeout(timeout); resolve(value) },
        }, { timeout: 1000 })
    })
    return { result, calls, logs, request, original }
}

test('меню функций совпадает с исходным ассистентом Skolkovo', async () => {
    const current = await run({ mode: 'get_request_types' })
    const original = await run({ mode: 'get_request_types' }, { source })
    assert.equal(JSON.stringify(current.result), JSON.stringify(original.result))
    assert.equal(current.calls.length, 0)
})

test('ответ по базе: фильтр проекта, авторизация, промпт 21 век и ссылки оператору', async () => {
    const { result, calls } = await run()
    assert.equal(result.message, 'Готовый текст')
    assert.equal(result.alarm, false)
    assert.equal(result.supportArticles.length, 1)
    assert.match(result.supportArticles[0].ref, /\/knowledge-base\/article\/view\/article-test$/)
    assert.equal(calls[0].data.record_type, '21_gpt')
    assert.equal(calls[1].config.headers.Authorization, 'Bearer test-token')
    assert.match(calls[1].data.system_template, /21 век/)
    assert.match(calls[1].data.system_template, /По умолчанию речь о рознице/)
    assert.match(calls[1].data.system_template, /Не выдумывай/)
})

test('подробный ответ сохраняет команду detailed', async () => {
    const { calls } = await run({ reqTypeCommand: 'detailed' })
    assert.match(calls[1].data.question, /Дай подробный ответ/)
})

test('пустой контекст использует строгий промпт без фактов компании из памяти', async () => {
    const { calls, result } = await run({}, { context: { context: [] } })
    assert.ok(calls[1].url.endsWith('/query'))
    assert.match(calls[1].data.instruction, /контекст базы знаний не найден/)
    assert.match(calls[1].data.instruction, /Не добавляй контактные данные из памяти/)
    assert.equal(result.supportArticles.length, 0)
})

for (const [command, language] of [['trans_en', 'английский'], ['trans_chinese', 'китайский'], ['trans_uz', 'узбекский'], ['trans_kg', 'киргизский'], ['trans_ru', 'русский'], ['trans_tj', 'таджикский']]) {
    test(`сохранён перевод ${command}`, async () => {
        const { calls, result } = await run({ reqTypeCommand: command, operatorMessage: 'Исходный текст' })
        assert.equal(calls.length, 1)
        assert.match(calls[0].data.question, new RegExp(language))
        assert.match(calls[0].data.question, /Исходный текст/)
        assert.equal(result.message, 'Готовый текст')
    })
}

for (const command of ['reject', 'fix_syntax', 'sell', 'adaptation']) {
    test(`сохранена обработка черновика ${command}`, async () => {
        const { calls, result } = await run({ reqTypeCommand: command, operatorMessage: 'Текст оператора' })
        assert.equal(calls.length, 1)
        assert.match(calls[0].data.question, /Текст оператора/)
        assert.match(calls[0].data.instruction, /21 век/)
        assert.equal(result.message, 'Готовый текст')
    })
}

test('рекомендации по диалогу адаптированы под магазин, alarm сохранён', async () => {
    const { calls, result } = await run({ reqTypeCommand: 'empathy' }, { answer: 'Да: Уточните номер заказа.' })
    assert.match(calls[0].data.instruction, /контакт-центра «21 век»/)
    assert.equal(result.alarm, true)
    assert.equal(result.message, '🧐 Уточните номер заказа.')
})

test('анализ тональности и сводка сохраняют контракт', async () => {
    for (const command of ['tone', 'summary']) {
        const { result, calls } = await run({ reqTypeCommand: command })
        assert.equal(typeof result.message, 'string')
        assert.match(calls[0].data.instruction, /21 век/)
    }
})

test('неактивный диалог: сводка и предложение возобновить общение', async () => {
    const { calls, result, request, original } = await run({ nonActiveDialog: true })
    assert.equal(calls.length, 2)
    assert.match(result.message, /РЕКОМЕНДУЕМОЕ НАЧАЛО ДИАЛОГА/)
    assert.equal(JSON.stringify(request), original)
})

test('CRM: пустой источник и явно настроенная карточка', async () => {
    const { result, calls } = await run({ reqTypeCommand: 'crm' }, { settings: { crm_clients: [] } })
    assert.equal(result.message, 'Источник данных CRM не настроен')
    assert.equal(calls.length, 0)
    const configured = await run({ reqTypeCommand: 'crm', messages: [{ side: 'client', text: 'Телефон: 000-000-0000' }] }, { settings: { crm_clients: [{ phone: '0000000000', card: { name: 'Тестовая карточка' } }] } })
    assert.match(configured.result.message, /Тестовая карточка/)
})

test('CRM демонстрирует тестовую карточку 21 век по тестовому номеру', async () => {
    const { result, calls } = await run({ reqTypeCommand: 'crm', messages: [{ side: 'client', text: 'Мой номер 000-000-0000' }] })
    assert.match(result.message, /Демонстрационная карточка клиента \(тестовые данные\)/)
    assert.match(result.message, /DEMO-001/)
    assert.equal(calls.length, 0)
    const missing = await run({ reqTypeCommand: 'crm', messages: [{ side: 'client', text: 'Другой клиент' }] })
    assert.equal(missing.result.message, 'Клиент не найден')
})

test('пустой ввод не вызывает сервисы', async () => {
    for (const command of ['gpt_answer', 'trans_en', 'fix_syntax', 'reject', 'sell', 'adaptation']) {
        const { calls, result } = await run({ reqTypeCommand: command, messages: [] })
        assert.equal(calls.length, 0)
        assert.match(result.message, /❗️/)
    }
})

test('JSON Buffer поддерживается, некорректный вход тоже завершает resolve', async () => {
    assert.equal((await run({}, { buffer: true })).result.message, 'Готовый текст')
    const bad = await run({}, { raw: Buffer.from('{bad-json') })
    assert.equal(typeof bad.result.error, 'string')
    assert.equal(bad.calls.length, 0)
})

test('ошибка сервиса не раскрывает токен и завершается', async () => {
    const { result, logs } = await run({}, { failPath: '/search' })
    assert.equal(typeof result.error, 'string')
    assert.doesNotMatch(JSON.stringify({ result, logs }), /test-token|Authorization/)
})

test('неизвестный режим завершается без вызовов сервисов', async () => {
    const { result, calls } = await run({ mode: 'unknown' })
    assert.equal(result.message, 'Неизвестный режим ассистента')
    assert.equal(calls.length, 0)
})
