const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const test = require('node:test')

// Only pure content helpers and HTTP boundary functions; no platform entrypoint.
const source = fs.readFileSync(path.join(__dirname, 'gpt_bs_phone.js'), 'utf8')
function part(start, end) {
    const from = source.indexOf(start)
    const to = source.indexOf(end, from)
    assert.ok(from >= 0 && to > from, `Missing source boundary: ${start}`)
    return source.slice(from, to)
}

function fixture(documents = []) {
    const sent = []
    const replies = {debugReply() {}}
    const sandbox = {
        logger: {info() {}, error() {}, debug() {}},
        slotManager: {setSlot() {}}, PRODUCTS: {autell: {queue: 'tpms'}},
        URL_CONTEXT_SEARCH: 'mock-search', CUSTOMER_ID: 'mock', MAX_CONTEXTS: 10,
        axios: {async post() { return {data: {context: documents}} }},
        async _callLLM(url, data) {
            sent.push({url, data})
            return {answer: '**Нажмите кнопку питания.** Подробнее: https://example.test/manual', tool_calls: []}
        },
    }
    vm.createContext(sandbox)
    vm.runInContext([
        part('function unwrapKnowledgeBaseLinks', '// === Prompt & Model config ==='),
        part('async function search_in_knowledge_base', 'const transfer_to_operator ='),
        part('const _coreCallLLM =', '// === Override sendMessageToLLM'),
    ].join('\n'), sandbox)
    return {sandbox, sent, replies, clean: sandbox.sanitizeKnowledgeBaseContent}
}

const cases = [
    ['HTML links keep instruction labels',
        '<p><a href="https://example.test/manual.pdf" target="_blank">Нажмите кнопку питания</a> на 3 секунды.</p>',
        'Нажмите кнопку питания на 3 секунды.'],
    ['Markdown links allow nested target parentheses',
        '[Проверьте фильтр](https://example.test/manual_(v2).pdf "Инструкция") и [выберите режим](/articles/setup).',
        'Проверьте фильтр и выберите режим.'],
    ['reference links and their definitions lose targets',
        '[Проверьте фильтр][doc]. [Настройка][].\n\n[doc]: https://example.test/manual.pdf\n[Настройка]: /files/setup.pdf',
        'Проверьте фильтр. Настройка.'],
    ['shortcut reference links lose the definition',
        '[Инструкция]\n\n[Инструкция]: <https://example.test/file.pdf>', 'Инструкция'],
    ['images do not substitute for unavailable instruction text',
        'Проверка. ![Инструкция](https://example.test/image.png)', 'Проверка.'],
    ['raw addresses, domains, email and URI schemes are removed',
        'https://example.test/a www.example.test support@example.test пример.рф tg://resolve?domain=help mailto:support@example.test Проверка.',
        'Проверка.'],
    ['encoded HTML links are unwrapped',
        '&lt;a href=&quot;https://example.test/a&quot;&gt;Ошибка &#45;6 при 2&nbsp;бар&lt;/a&gt;',
        'Ошибка -6 при 2 бар'],
    ['HTML buttons and navigation blocks are removed',
        '<pre><code class="language-buttons">[В меню](type:action action:/menu)</code></pre><button onclick="go()">Далее</button><div role="button">Назад</div>Нажмите кнопку прибора.',
        'Нажмите кнопку прибора.'],
    ['fenced CraftTalk buttons are removed',
        'Проверка.\n```buttons(placement:keyboard)\n::\n[Оператор](type:action action:/operator)\n```\nРезультат.',
        'Проверка.\n\nРезультат.'],
    ['standalone CraftTalk buttons are removed',
        '[Назад](type:action action:/back) Выберите режим в меню прибора.',
        'Выберите режим в меню прибора.'],
    ['technical values, negations, versions and bracketed codes survive',
        'Не меняйте ATF4000 на ATF4000N. Ошибка -6 [E-06], 2.5 бар, 50 °C, V5.0, давление < 3 бар. Нажмите кнопку и перейдите в меню прибора.',
        'Не меняйте ATF4000 на ATF4000N. Ошибка -6 [E-06], 2.5 бар, 50 °C, V5.0, давление < 3 бар. Нажмите кнопку и перейдите в меню прибора.'],
]
for (const [name, input, expected] of cases) {
    test(name, () => {
        const {clean} = fixture()
        assert.equal(clean(input), expected)
        assert.equal(clean(clean(input)), expected)
    })
}

test('tool result contains cleaned title and text before LLM submission', async () => {
    const f = fixture([{
        title: '[TS508](https://example.test/article)',
        content: 'Ошибка -6. <a href="/file.pdf">Нажмите кнопку питания на 3 секунды.</a><button>Назад</button>',
        url: 'https://example.test/metadata',
    }])
    const result = await f.sandbox.search_in_knowledge_base({product: 'autell', queries: ['Ошибка -6']})
    await f.sandbox._callLLM('mock-tool-responses', {tool_responses: [{content: result}]}, f.replies)
    const content = f.sent[0].data.tool_responses[0].content
    assert.match(content, /TS508/)
    assert.match(content, /Ошибка -6/)
    assert.match(content, /Нажмите кнопку питания на 3 секунды/)
    assert.doesNotMatch(content, /https?:|file\.pdf|Назад|<a\b|<button\b/)
})

test('link-only results cannot be presented as a retrieved solution', async () => {
    const f = fixture([{title: 'Инструкция', content: '<a href="https://example.test/file.pdf">https://example.test/file.pdf</a>'}])
    const result = await f.sandbox.search_in_knowledge_base({product: 'autell', queries: ['TS508']})
    assert.match(result, /текста для подтверждённого ответа нет/)
    assert.doesNotMatch(result, /https?:/)
})

test('direct RAG request cleans title and body and excludes link metadata', async () => {
    const f = fixture()
    const document = {doc_id: 'mock-doc', title: '<a href="/article">TS508</a>',
        content: '[Проверка](https://example.test/file)', url: 'https://example.test/metadata'}
    await f.sandbox._callLLM('mock-context-query', {context: [document]}, f.replies)
    assert.equal(f.sent[0].data.context[0].content, 'Проверка')
    assert.equal(f.sent[0].data.context[0].title, 'TS508')
    assert.equal(f.sent[0].data.context[0].url, undefined)
    assert.equal(document.url, 'https://example.test/metadata')
})

test('tool-responses answer keeps equipment instructions and removes URLs and formatting', async () => {
    const f = fixture()
    const response = await f.sandbox._callLLM('mock-tool-responses', {}, f.replies)
    assert.equal(response.answer, 'Нажмите кнопку питания.')
})

test('reasoning remains in its service block and empty tool calls do not ask for clarification', () => {
    const {sandbox} = fixture()
    const response = sandbox.sanitizeResponse({answer: '<think>служебное рассуждение</think>\n**Нажмите кнопку питания.**', tool_calls: []})
    assert.equal(response.answer, '<think>служебное рассуждение</think>\nНажмите кнопку питания.')
    const emptyTool = sandbox.sanitizeResponse({answer: '<think>служебное рассуждение</think>', tool_calls: [{id: 'mock'}]})
    assert.equal(emptyTool.answer, '<think>служебное рассуждение</think>')
})

test('empty search and HTTP failure remain distinguishable', async () => {
    const f = fixture()
    assert.match(await f.sandbox.search_in_knowledge_base({product: 'autell', queries: ['TS508']}), /Поиск не вернул материалов/)
    f.sandbox.axios.post = async () => { throw new Error('mock failure') }
    assert.match(await f.sandbox.search_in_knowledge_base({product: 'autell', queries: ['TS508']}), /ERROR: ошибка поиска/)
})
