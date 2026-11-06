const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const test = require('node:test')

// Execute only the queue/continuation code with mocked platform and HTTP globals.
const core = fs.readFileSync(path.join(__dirname, 'gpt_core.js'), 'utf8')
const client = fs.readFileSync(path.join(__dirname, 'gpt_brainstorm_search_notice.js'), 'utf8')
const part = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
const code = [
    part(core, 'class SwitchRedirectPropagate', 'const _AP_TOOLS'),
    part(core, 'class ScenarioNotReadyError', 'function setScenariosForTransfer'),
    part(core, 'async function enqueueToolCalls', '// @module core/main'),
    part(client, '// === Search notice continuation ===', 'const transfer_to_operator ='),
    'const availableFunctions = {search_in_knowledge_base}',
    part(client, 'async function _main(replies)', 'runEntrypoint()'),
].join('\n')

function fixture({report = false, extraSearch = false, configured = true, httpFails = false} = {}) {
    const values = new Map()
    const metrics = {decisions: 0, searches: 0, commits: []}
    const args = {product: 'autell', queries: ['TS508 ошибка -6', 'ошибка программирования TS508', 'AUTEL MaxiTPMS TS508 ошибка -6']}
    const call = id => ({id, function: {name: 'search_in_knowledge_base', arguments: JSON.stringify(args)}})
    const storage = {
        async get(key) { return values.get(key) },
        async set(key, value) { values.set(key, value); return true },
        async del(key) { values.delete(key) },
    }
    const replies = {deleteSlot() {}, debugReply() {}, async markdownReply() {}}
    function boot(text = 'Ошибка -6 на TS508') {
        let uuid = 0
        const sandbox = {
            agentStorage: {dialogStorage: storage},
            agentSettings: {search_notice: configured ? {aiassist_agent_id: 'mock-aiassist'} : {}},
            ARTICLES: {SEARCH_NOTICE: {ID: 'mock-notice-article'}},
            IS_QUERY_REPORT: report,
            ITEM_TYPES: {function: 'function', commit: 'commit'},
            KEYS: {QUEUE_KEY: 'queue', N_CYCLES_KEY: 'cycles'}, WAIT_FOR_SCENARIO_TTL: 86400,
            ROLE: {FUNCTION: 'function'}, MAX_CYCLES: 5, ROUTE_TO_SELF_AGENT: 'mock-self',
            MESSAGE_CANCEL_WAITING: 'cancelled', MESSAGE_WHILE_WAITING_ERROR: 'waiting',
            uuid: {v4: () => `commit-${++uuid}`},
            message: {id: 'original-message', message: {text}},
            logger: {info() {}, debug() {}, warn() {}, error() {}},
            URL_CONTEXT_SEARCH: 'mock-only', CUSTOMER_ID: 'mock-customer', MAX_CONTEXTS: 5,
            PRODUCTS: {autell: {queue: 'mock-tpms'}}, slotManager: {setSlot() {}},
            removeArticleNavigation: content => content,
            processScenarios: (history, tools) => ({history, tools}),
            buildLLMHistory: history => history,
            getToolResult: item => item.result,
            axios: {async post(url, body) {
                metrics.searches++
                assert.equal(body.record_type, args.product)
                assert.equal(body.text, args.queries.join(' '))
                if (httpFails) throw new Error('mock HTTP failure')
                return {data: {context: [{title: 'TS508', content: 'Подтверждённый ответ'}]}}
            }},
            async sendMessageToLLM() {
                metrics.decisions++
                return {tool_calls: [call('original-call')]}
            },
            async commitToolResponses(results) {
                metrics.commits.push(JSON.parse(JSON.stringify(results)))
                return extraSearch && metrics.commits.length === 1
                    ? {tool_calls: [call('second-call')]}
                    : {answer: 'Ответ', tool_calls: []}
            },
            async _printResponse() {},
            async _mainBody(replies, opts) {
                return sandbox.runToolsLoop(text, 'mock-dialog', null, replies, opts,
                    sandbox.sendMessageToLLM, sandbox._printResponse)
            },
        }
        vm.createContext(sandbox)
        vm.runInContext(code, sandbox)
        return () => sandbox._main(replies)
    }
    return {values, metrics, boot, args}
}

test('scenario round trip preserves the queued call and searches only after re-entry', async () => {
    const f = fixture({extraSearch: true})
    await assert.rejects(f.boot()(), error => {
        assert.equal(error.name, 'SwitchRedirectPropagate')
        assert.equal(error.switchredirect, '/switchredirect mock-aiassist intent_id="mock-notice-article"')
        return true
    })
    assert.equal(f.metrics.searches, 0)
    assert.equal(f.metrics.commits.length, 0)
    const pending = JSON.parse(f.values.get('queue'))
    assert.deepEqual(pending[0].args, f.args)
    assert.equal(pending[0].toolCallId, 'original-call')
    assert.equal(pending[0].executed, false)
    assert.equal(pending[0].started, false)
    assert.equal(f.values.get('brainstorm_search_notice').toolCallId, 'original-call')

    // A fresh JS context simulates the scenario returning to the same agent/storage.
    await f.boot()()
    assert.equal(f.metrics.decisions, 1)
    assert.equal(f.metrics.searches, 2)
    const result = f.metrics.commits[0][0]
    assert.equal(result.tool_call_id, 'original-call')
    assert.match(result.content, /Подтверждённый ответ/)
    assert.equal(f.values.has('brainstorm_search_notice'), false)
})

test('report mode searches without scenario or saved notice state', async () => {
    const f = fixture({report: true, configured: false})
    await f.boot()()
    assert.equal(f.metrics.searches, 1)
    assert.equal(f.values.has('brainstorm_search_notice'), false)
})

test('missing scenario configuration fails before searching without losing the queue', async () => {
    const f = fixture({configured: false})
    await assert.rejects(f.boot()(), /Configure articles/)
    assert.equal(f.metrics.searches, 0)
    assert.equal(JSON.parse(f.values.get('queue'))[0].executed, false)
})

test('cancel after scenario clears pending notice and prevents search', async () => {
    const f = fixture()
    await assert.rejects(f.boot()(), {name: 'SwitchRedirectPropagate'})
    await f.boot('прервать')()
    assert.equal(f.metrics.searches, 0)
    assert.equal(f.values.has('brainstorm_search_notice'), false)
    assert.equal(JSON.parse(f.values.get('queue')).length, 0)
})

test('HTTP failure returns the tool error to LLM and cleans notice state', async () => {
    const f = fixture({httpFails: true})
    await assert.rejects(f.boot()(), {name: 'SwitchRedirectPropagate'})
    await f.boot()()
    assert.match(f.metrics.commits[0][0].content, /ERROR: ошибка поиска/)
    assert.equal(f.values.has('brainstorm_search_notice'), false)
})
