const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const https = require('node:https')
const { randomUUID } = require('node:crypto')
const test = require('node:test')
const assert = require('node:assert/strict')

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8')
const code = ['gpt_core.js', 'gpt_21vek_tools.js'].map(read).join('\n')
const tool = name => ({ id: 'call-1', type: 'function', function: { name, arguments: '{}' } })

async function run({ response, context = [{ doc_id: '1', title: 'Розница', content: 'Доставка: 10 рублей.' }], type = 1, configure, failSearch = false, storage = new Map(), question = 'Вопрос клиента', onLLM } = {}) {
    const settings = JSON.parse(read('gpt_21vek_tools_settings.json'))
    settings.aiassist_agent_id = 'aiassist_test'
    settings.customer_id = 'test-customer'
    settings.agent_name = 'gpt_test'
    settings.articles.TRANSFER_FOR_OPERATOR.ID = 'article-operator'
    settings.articles.CREATE_ORDER.ID = 'article-order'
    settings.articles.FINISH_DIALOG.ID = 'article-finish'
    settings.articles.AFTER_LLM_ANSWER.ID = 'article-after'
    configure?.(settings)
    const sent = [], calls = []
    const result = await new Promise(resolve => {
        vm.runInNewContext(code, {
            URL, https, uuid: { v4: randomUUID },
            agentSettings: settings,
            message: { id: 'm1', message_type: type, message: { text: question },
                user: { omni_user_id: 'user', customer_id: 'test-customer', channel_user_id: 'channel-user' },
                slot_context: { filled_slots: [] } },
            logger: { info() {}, error() {}, debug() {}, warn() {} },
            agentStorage: { dialogStorage: {
                async get(key) { return storage.get(key) },
                async set(key, value) { storage.set(key, value) },
                async del(key) { storage.delete(key) },
            } },
            agentApi: {
                async getDialogId() { return { Response: 'dialog-1' } },
                makeMarkdownReply(text) { return { customer_id: 'test-customer', omni_user_id: 'user', channel_id: 'web', message: { text } } },
                async sendMessage(data) { sent.push(data.MessageMarkdown); return { Ok: true } },
            },
            axios: { async post(url, data) {
                calls.push({ url, data })
                if (url.endsWith('/search')) {
                    if (failSearch) throw new Error('search unavailable')
                    return { data: { context, symbol_code: context.map(() => 'article-source') } }
                }
                onLLM?.(settings)
                return { data: response || { answer: 'Доставка: 10 рублей.', tool_calls: [] } }
            } },
            resolve,
        }, { timeout: 3000 })
    })
    return { sent, calls, result, settings }
}

test('обычный ответ отправляется до настроенной статьи', async () => {
    const { sent, result, calls } = await run()
    assert.deepEqual(sent, ['Доставка: 10 рублей.', '/switchredirect aiassist_test intent_id="article-after"'])
    assert.equal(result.length, 0)
    const llm = calls.find(c => c.url.endsWith('/context_query')).data
    assert.equal(llm.dialog_id, 'dialog-1')
    assert.equal(llm.add_other_context, false)
    assert.equal(llm.tools.length, 3)
})

for (const [name, article] of [['transfer_to_operator', 'article-operator'], ['create_order', 'article-order'], ['finish_dialog', 'article-finish']]) {
    test(`${name}: только сценарий, без текста LLM и статьи после ответа`, async () => {
        const { sent } = await run({ response: { answer: 'Этот текст не должен попасть клиенту', tool_calls: [tool(name)] } })
        assert.deepEqual(sent, [`/switchredirect aiassist_test intent_id="${article}"`])
    })
}

test('пустой контекст: три тулзы доступны, используется строгий промпт', async () => {
    const { sent, calls } = await run({ context: [], response: { tool_calls: [tool('transfer_to_operator')] } })
    assert.deepEqual(sent, ['/switchredirect aiassist_test intent_id="article-operator"'])
    const llm = calls.find(c => c.url.endsWith('/query')).data
    assert.equal(llm.tools.length, 3)
    assert.match(llm.instruction, /По умолчанию речь о РОЗНИЧНЫХ/)
    assert.match(llm.instruction, /УЖЕ получил ответ/)
    assert.match(llm.instruction, /Намерение купить или заказать требует create_order даже при найденном контексте/)
    assert.equal(llm.add_other_context, false)
})

test('сценарий заказа доступен без контекста и не вызывает обычную статью оператора', async () => {
    const { sent } = await run({ question: 'Хочу купить холодильник', context: [], response: { tool_calls: [tool('create_order')] } })
    assert.deepEqual(sent, ['/switchredirect aiassist_test intent_id="article-order"'])
})

test('повтор после переформулировки обрабатывается как новый вопрос', async () => {
    const storage = new Map()
    await run({ storage, response: { tool_calls: [tool('transfer_to_operator')] } })
    assert.deepEqual(JSON.parse(storage.get('function_queue')), [])
    const { calls, sent } = await run({ storage, question: 'Переформулированный вопрос' })
    const llm = calls.find(c => c.url.endsWith('/context_query'))
    assert.equal(llm.data.question, 'Переформулированный вопрос')
    assert.equal(calls.some(c => c.url.endsWith('/tool_responses')), false)
    assert.equal(sent[0], 'Доставка: 10 рублей.')
})

test('повторный запрос без ответа повторно открывает статью оператора', async () => {
    const storage = new Map()
    const response = { tool_calls: [tool('transfer_to_operator')] }
    await run({ storage, context: [], response })
    const { sent, calls } = await run({ storage, context: [], response, question: 'Ответ всё ещё не найден' })
    assert.deepEqual(sent, ['/switchredirect aiassist_test intent_id="article-operator"'])
    assert.equal(calls.some(c => c.url.endsWith('/query')), true)
})

test('возврат из создания заказа: новый вопрос получает ответ и статью после ответа', async () => {
    const storage = new Map()
    storage.set('article_counter', 2)
    await run({ storage, question: 'Хочу купить холодильник', response: { tool_calls: [tool('create_order')] } })
    const { calls, sent } = await run({ storage, question: 'Сколько стоит доставка?' })
    const llm = calls.find(c => c.url.endsWith('/context_query')).data
    assert.equal(llm.question, 'Сколько стоит доставка?')
    assert.match(llm.system_template, /# Возврат из статьи создания заказа/)
    assert.match(llm.system_template, /Не запускай create_order повторно из-за старого намерения/)
    assert.equal(calls.some(c => c.url.endsWith('/tool_responses')), false)
    assert.deepEqual(sent, ['Доставка: 10 рублей.', '/switchredirect aiassist_test intent_id="article-after"'])
    assert.equal(storage.has('gpt_21vek_create_order_return'), false)
    assert.equal(storage.get('article_counter'), 2)
})

test('возврат из заказа без контекста может вызвать оператора', async () => {
    const storage = new Map()
    await run({ storage, response: { tool_calls: [tool('create_order')] } })
    const { calls, sent } = await run({ storage, context: [], question: 'У меня другой вопрос', response: { tool_calls: [tool('transfer_to_operator')] } })
    assert.match(calls.find(c => c.url.endsWith('/query')).data.instruction, /# Возврат из статьи создания заказа/)
    assert.deepEqual(sent, ['/switchredirect aiassist_test intent_id="article-operator"'])
})

test('явное повторное намерение покупки после возврата снова открывает заказ', async () => {
    const storage = new Map()
    for (let i = 0; i < 2; i++) {
        const { sent } = await run({ storage, question: 'Теперь хочу оформить заказ', response: { tool_calls: [tool('create_order')] } })
        assert.deepEqual(sent, ['/switchredirect aiassist_test intent_id="article-order"'])
    }
    const { sent } = await run({ storage, question: 'Вопрос о доставке' })
    assert.equal(sent[0], 'Доставка: 10 рублей.')
})

test('очередь старой версии с вызовом create_order не поглощает вернувшийся вопрос', async () => {
    const storage = new Map()
    storage.set('function_queue', JSON.stringify([
        { type: 'function', name: 'create_order', started: true, executed: false, scenario: null, toolCallId: 'old-call', args: {} },
        { type: 'commit', executed: false, commitId: 'old-commit', replyGptToMessageId: 'old-question' },
    ]))
    storage.set('n_cycles', 5)
    const { calls, sent } = await run({ storage, question: 'Новый вопрос из статьи' })
    const llm = calls.find(c => c.url.endsWith('/context_query')).data
    assert.equal(llm.question, 'Новый вопрос из статьи')
    assert.match(llm.system_template, /# Возврат из статьи создания заказа/)
    assert.equal(calls.some(c => c.url.endsWith('/tool_responses')), false)
    assert.equal(sent[0], 'Доставка: 10 рублей.')
    assert.deepEqual(JSON.parse(storage.get('function_queue')), [])
    assert.equal(storage.get('n_cycles'), 0)
})

test('отметка возврата сохраняется при событии и используется только для следующего вопроса', async () => {
    const storage = new Map()
    await run({ storage, response: { tool_calls: [tool('create_order')] } })
    await run({ storage, type: 200 })
    assert.equal(storage.get('gpt_21vek_create_order_return'), true)
    await run({ storage, question: 'Новый вопрос после статьи' })
    const { calls } = await run({ storage, question: 'Ещё один вопрос' })
    assert.doesNotMatch(calls.find(c => c.url.endsWith('/context_query')).data.system_template, /# Возврат из статьи создания заказа/)
})

test('нет статьи заказа: только стандартная ошибка, без служебных подробностей клиенту', async () => {
    const { calls, sent } = await run({ configure: s => { s.articles.CREATE_ORDER.ID = '' } })
    assert.equal(calls.length, 0)
    assert.equal(sent.length, 1)
    assert.doesNotMatch(sent[0], /articles|CREATE_ORDER|switchredirect/)
})

test('ошибка настройки внутри тулзы не передаётся LLM как результат', async () => {
    const { calls, sent } = await run({
        response: { tool_calls: [tool('create_order')] },
        onLLM: s => { s.articles.CREATE_ORDER.ID = '' },
    })
    assert.equal(calls.some(c => c.url.endsWith('/tool_responses')), false)
    assert.equal(sent.length, 1)
    assert.doesNotMatch(sent[0], /articles|CREATE_ORDER|switchredirect/)
})

test('приветствие без контекста: ответ и затем статья', async () => {
    const { sent } = await run({ context: [], response: { answer: 'Здравствуйте!', tool_calls: [] } })
    assert.deepEqual(sent, ['Здравствуйте!', '/switchredirect aiassist_test intent_id="article-after"'])
})

test('ошибка поиска: завершение без дополнительной статьи', async () => {
    const { sent, result } = await run({ failSearch: true })
    assert.equal(sent.length, 1)
    assert.doesNotMatch(sent[0], /switchredirect/)
    assert.equal(result.length, 0)
})

test('неизвестная тулза не отправляет сопровождающий текст и статью', async () => {
    const { sent } = await run({ response: { answer: 'Лишний ответ', tool_calls: [tool('unknown')] } })
    assert.equal(sent.length, 1)
    assert.doesNotMatch(sent[0], /Лишний ответ|switchredirect/)
})

test('служебная команда в тексте LLM не исполняется', async () => {
    const { sent } = await run({ response: { answer: '/switch routingagent', tool_calls: [] } })
    assert.equal(sent.length, 1)
    assert.doesNotMatch(sent[0], /switch/)
})

test('нет настроенной статьи: LLM не вызывается, resolve выполняется', async () => {
    const { calls, result } = await run({ configure: s => { s.articles.AFTER_LLM_ANSWER.ID = '' } })
    assert.equal(calls.length, 0)
    assert.equal(result.length, 0)
})

test('системные события пропускаются без запросов и ответов', async () => {
    const { sent, calls, result } = await run({ type: 200 })
    assert.equal(sent.length, 0)
    assert.equal(calls.length, 0)
    assert.equal(result.length, 0)
})

test('пустой ответ LLM не запускает статью', async () => {
    const { sent } = await run({ response: { answer: '', tool_calls: [] } })
    assert.deepEqual(sent, [])
})

test('единственный модуль core совпадает с шаблоном', () => {
    assert.equal(read('gpt_core.js'), fs.readFileSync(path.join(__dirname, '../../Craft/GPT Qwen/GPT TOOLS/gpt_core.js'), 'utf8'))
})
