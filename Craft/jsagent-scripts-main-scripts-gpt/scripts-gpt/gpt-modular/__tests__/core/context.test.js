import { describe, it, expect, vi, beforeAll } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

const MODULES = [
  'modules/core/10_globals.js',
  'modules/core/20_http.js',
  'modules/core/50_context.js',
]

function makeGlobals(overrides = {}) {
  return {
    https: { Agent: class { constructor() {} } },
    Date,
    RegExp,
    URL,
    agentSettings: {
      api: {
        base_url: 'https://test.example.com',
        url_context_search: 'http://ctx-search:8080',
        url_llm: 'http://llm:8080',
      },
      customer_id: 'cust-1',
      agent_name: 'test-agent',
      slots: {},
      standard_messages: {},
      agent_parameters: {},
      llm_settings: {},
      proxy: { USE_PROXY: false },
      articles: {},
      context_settings: {
        MAX_CONTEXTS: 3,
        ...overrides.context_settings,
      },
    },
    message: { meta: {}, slot_context: { filled_slots: [] } },
    logger: {
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    },
    axios: { post: vi.fn(), get: vi.fn() },
    ...overrides,
  }
}

function makeReplies() {
  return { debugReply: vi.fn(), markdownReply: vi.fn(), textReply: vi.fn() }
}


describe('getContext', () => {
  it('sends correct request to context search', async () => {
    const globals = makeGlobals()
    globals.axios.post.mockResolvedValue({
      data: { context: [{ t: 1 }], symbol_code: ['a'], title: ['A'] },
    })
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()

    await ctx.getContext('вопрос', replies)

    expect(globals.axios.post).toHaveBeenCalledWith(
      'http://ctx-search:8080/search',
      {
        text: 'вопрос',
        customer_id: 'cust-1',
        record_type: null,
        catalog_symbol_code: null,
        tags: null,
        output_format: 'json-vikhr',
        filters: [],
        size: 3,
      },
    )
  })

  it('truncates all fields by MAX_CONTEXTS', async () => {
    const globals = makeGlobals()
    globals.axios.post.mockResolvedValue({
      data: {
        context: [{ t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }],
        symbol_code: ['a', 'b', 'c', 'd'],
        title: ['A', 'B', 'C', 'D'],
      },
    })
    const ctx = loadScript(MODULES, globals)

    const result = await ctx.getContext('q', makeReplies())

    // MAX_CONTEXTS = 3
    expect(result.context).toHaveLength(3)
    expect(result.symbol_code).toHaveLength(3)
    expect(result.title).toHaveLength(3)
  })

  it('does not truncate when MAX_CONTEXTS = -1', async () => {
    const globals = makeGlobals({ context_settings: { MAX_CONTEXTS: -1 } })
    globals.axios.post.mockResolvedValue({
      data: { context: [1, 2, 3, 4, 5] },
    })
    const ctx = loadScript(MODULES, globals)

    const result = await ctx.getContext('q', makeReplies())

    expect(result.context).toHaveLength(5)
  })

  it('throws on error and calls debugReply', async () => {
    const globals = makeGlobals()
    globals.axios.post.mockRejectedValue(new Error('network error'))
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()

    await expect(ctx.getContext('q', replies)).rejects.toThrow('network error')
    expect(replies.debugReply).toHaveBeenCalled()
  })
})


describe('getContextFromScenarios', () => {
  it('sends correct request to scenarios search', async () => {
    const globals = makeGlobals()
    globals.axios.post.mockResolvedValue({
      data: { simple: [1], complex: [2] },
    })
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()

    await ctx.getContextFromScenarios('вопрос', replies)

    expect(globals.axios.post).toHaveBeenCalledWith(
      'http://ctx-search:8080/search_in_scenarios',
      {
        text: 'вопрос',
        customer_id: 'cust-1',
        record_type: null,
        catalog_symbol_code: null,
        tags: null,
        filters: [],
        size: 5,
      },
    )
  })

  it('truncates simple by MAX_CONTEXTS and complex by MAX_COMPLEX_SCENARIOS', async () => {
    const globals = makeGlobals({ context_settings: { MAX_CONTEXTS: 3, MAX_COMPLEX_SCENARIOS: 2 } })
    globals.axios.post.mockResolvedValue({
      data: {
        simple: [1, 2, 3, 4, 5],
        complex: [10, 20, 30],
      },
    })
    const ctx = loadScript(MODULES, globals)

    const result = await ctx.getContextFromScenarios('q', makeReplies())

    expect(result.simple).toHaveLength(3)
    expect(result.complex).toHaveLength(2)
  })

  it('does not truncate simple when MAX_CONTEXTS = -1', async () => {
    const globals = makeGlobals({ context_settings: { MAX_CONTEXTS: -1, MAX_COMPLEX_SCENARIOS: 2 } })
    globals.axios.post.mockResolvedValue({
      data: { simple: [1, 2, 3, 4, 5], complex: [10, 20, 30] },
    })
    const ctx = loadScript(MODULES, globals)

    const result = await ctx.getContextFromScenarios('q', makeReplies())

    expect(result.simple).toHaveLength(5)
    expect(result.complex).toHaveLength(2)
  })

  it('does not truncate complex when MAX_COMPLEX_SCENARIOS = -1', async () => {
    const globals = makeGlobals({ context_settings: { MAX_CONTEXTS: 3, MAX_COMPLEX_SCENARIOS: -1 } })
    globals.axios.post.mockResolvedValue({
      data: { simple: [1, 2, 3, 4, 5], complex: [10, 20, 30] },
    })
    const ctx = loadScript(MODULES, globals)

    const result = await ctx.getContextFromScenarios('q', makeReplies())

    expect(result.simple).toHaveLength(3)
    expect(result.complex).toHaveLength(3)
  })

  it('throws on error and calls debugReply', async () => {
    const globals = makeGlobals()
    globals.axios.post.mockRejectedValue(new Error('fail'))
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()

    await expect(ctx.getContextFromScenarios('q', replies)).rejects.toThrow('fail')
    expect(replies.debugReply).toHaveBeenCalled()
  })
})


describe('formatConditionsToString', () => {
  let ctx
  beforeAll(() => { ctx = loadScript(MODULES, makeGlobals()) })

  it('returns empty string when both conditions are empty', () => {
    expect(ctx.formatConditionsToString([], [])).toBe('')
  })

  it('formats single positive condition without extra parens', () => {
    const pos = [[{ slot: 'city', condition: '==', value: 'Москва' }]]
    expect(ctx.formatConditionsToString(pos, [])).toBe(
      'ЕСЛИ city == "Москва"'
    )
  })

  it('formats single negative condition without extra parens', () => {
    const neg = [[{ slot: 'city', condition: '==', value: 'Москва' }]]
    expect(ctx.formatConditionsToString([], neg)).toBe(
      'ЕСЛИ НЕ city == "Москва"'
    )
  })

  it('formats positive AND negative', () => {
    const pos = [[{ slot: 'a', condition: '==', value: '1' }]]
    const neg = [[{ slot: 'b', condition: '!=', value: '2' }]]
    expect(ctx.formatConditionsToString(pos, neg)).toBe(
      'ЕСЛИ a == "1" И НЕ b != "2"'
    )
  })

  it('formats AND within group', () => {
    const pos = [[
      { slot: 'a', condition: '==', value: '1' },
      { slot: 'b', condition: '==', value: '2' },
    ]]
    expect(ctx.formatConditionsToString(pos, [])).toBe(
      'ЕСЛИ a == "1" И b == "2"'
    )
  })

  it('formats OR between groups with parens per group', () => {
    const pos = [
      [{ slot: 'a', condition: '==', value: '1' }],
      [{ slot: 'b', condition: '==', value: '2' }],
    ]
    expect(ctx.formatConditionsToString(pos, [])).toBe(
      'ЕСЛИ (a == "1") ИЛИ (b == "2")'
    )
  })

  it('formats AND + OR combined', () => {
    const pos = [
      [{ slot: 'a', condition: '==', value: '1' }, { slot: 'b', condition: '==', value: '2' }],
      [{ slot: 'c', condition: '==', value: '3' }],
    ]
    expect(ctx.formatConditionsToString(pos, [])).toBe(
      'ЕСЛИ (a == "1" И b == "2") ИЛИ (c == "3")'
    )
  })

  it('wraps compound pos and neg in outer parens for unambiguous order', () => {
    const pos = [
      [{ slot: 'a', condition: '==', value: '1' }, { slot: 'b', condition: '==', value: '2' }],
      [{ slot: 'c', condition: '==', value: '3' }],
    ]
    const neg = [
      [{ slot: 'd', condition: '==', value: '4' }],
      [{ slot: 'e', condition: '==', value: '5' }],
    ]
    expect(ctx.formatConditionsToString(pos, neg)).toBe(
      'ЕСЛИ ((a == "1" И b == "2") ИЛИ (c == "3")) И НЕ ((d == "4") ИЛИ (e == "5"))'
    )
  })

  it('wraps compound negative OR without positive', () => {
    const neg = [
      [{ slot: 'a', condition: '==', value: '1' }, { slot: 'b', condition: '==', value: '2' }],
      [{ slot: 'c', condition: '==', value: '3' }],
    ]
    expect(ctx.formatConditionsToString([], neg)).toBe(
      'ЕСЛИ НЕ ((a == "1" И b == "2") ИЛИ (c == "3"))'
    )
  })

  it('handles null/undefined conditions', () => {
    expect(ctx.formatConditionsToString(null, null)).toBe('')
    expect(ctx.formatConditionsToString(undefined, [])).toBe('')
  })
})


// --- Simple scenarios ---

const MODULES_WITH_REFS = [
  'modules/core/10_globals.js',
  'modules/core/20_http.js',
  'modules/core/40_references.js',
  'modules/core/50_context.js',
]

describe('formatChainSimple', () => {
  let ctx
  beforeAll(() => { ctx = loadScript(MODULES, makeGlobals()) })

  it('formats message blocks', () => {
    const chain = { blocks: [{ type: 'message', text: 'Hello' }] }
    expect(ctx.formatChainSimple(chain)).toBe('Hello')
  })

  it('formats start as h2 and button as h3', () => {
    const chain = {
      blocks: [
        { type: 'start', text: 'Title' },
        { type: 'message', text: 'body' },
        { type: 'button', text: 'Click' },
      ],
    }
    expect(ctx.formatChainSimple(chain)).toBe('\n## Title\nbody\n\n### Click')
  })

  it('skips questions and conditions by default', () => {
    const chain = {
      blocks: [
        { type: 'questions', text: ['q1', 'q2'] },
        { type: 'message', text: 'a' },
        { type: 'condition', pos_conditions: [[{ slot: 's', condition: '==', value: '1' }]], neg_conditions: [] },
        { type: 'message', text: 'b' },
      ],
    }
    expect(ctx.formatChainSimple(chain)).toBe('a\nb')
  })

  it('includes questions when SIMPLE_INCLUDE_QUESTIONS enabled', () => {
    const ctx2 = loadScript(MODULES, makeGlobals({
      context_settings: { SIMPLE_INCLUDE_QUESTIONS: true },
    }))
    const chain = {
      blocks: [
        { type: 'questions', text: ['как вернуть?', 'возврат товара', 'хочу вернуть'] },
        { type: 'start', text: 'Возврат' },
        { type: 'message', text: 'Инструкция по возврату' },
      ],
    }
    expect(ctx2.formatChainSimple(chain)).toBe(
      'Примеры вопросов: как вернуть?, возврат товара, хочу вернуть\n\n## Возврат\nИнструкция по возврату'
    )
  })

  it('limits questions to SIMPLE_MAX_QUESTIONS', () => {
    const ctx2 = loadScript(MODULES, makeGlobals({
      context_settings: { SIMPLE_INCLUDE_QUESTIONS: true, SIMPLE_MAX_QUESTIONS: 2 },
    }))
    const chain = {
      blocks: [
        { type: 'questions', text: ['q1', 'q2', 'q3', 'q4', 'q5'] },
        { type: 'message', text: 'body' },
      ],
    }
    expect(ctx2.formatChainSimple(chain)).toBe(
      'Примеры вопросов: q1, q2\nbody'
    )
  })

  it('includes conditions when SIMPLE_INCLUDE_CONDITIONS enabled', () => {
    const ctx2 = loadScript(MODULES, makeGlobals({
      context_settings: { SIMPLE_INCLUDE_CONDITIONS: true },
    }))
    const chain = {
      blocks: [
        { type: 'message', text: 'text' },
        {
          type: 'condition',
          pos_conditions: [[{ slot: 'city', condition: '==', value: 'Москва' }]],
          neg_conditions: [],
        },
        { type: 'message', text: 'after' },
      ],
    }
    expect(ctx2.formatChainSimple(chain)).toBe(
      'text\n**Условие:** ЕСЛИ city == "Москва"\nafter'
    )
  })

  it('skips blocks without type', () => {
    const chain = { blocks: [null, { text: 'no type' }, { type: 'message', text: 'ok' }] }
    expect(ctx.formatChainSimple(chain)).toBe('ok')
  })

  it('returns empty string for empty/missing blocks', () => {
    expect(ctx.formatChainSimple({ blocks: [] })).toBe('')
    expect(ctx.formatChainSimple({})).toBe('')
  })
})


describe('extractTitleFromChain', () => {
  let ctx
  beforeAll(() => { ctx = loadScript(MODULES_WITH_REFS, makeGlobals()) })

  it('extracts title from first matching block', () => {
    const chain = {
      blocks: [
        { type: 'message', text: 'not this' },
        { type: 'start', text: 'This Title' },
      ],
    }
    expect(ctx.extractTitleFromChain(chain, ['start'], false)).toBe('This Title')
  })

  it('returns markdown link when withUrl=true', () => {
    const chain = {
      blocks: [{ type: 'start', text: 'Title', symbol_code: 'sc-1' }],
    }
    const result = ctx.extractTitleFromChain(chain, ['start'], true)
    expect(result).toBe(
      '[Title](https://test.example.com/app/project/cust-1/knowledge-base/article/view/sc-1)'
    )
  })

  it('returns empty string when no block matches', () => {
    const chain = { blocks: [{ type: 'message', text: 'hi' }] }
    expect(ctx.extractTitleFromChain(chain, ['start'], false)).toBe('')
  })

  it('returns empty string for missing blocks', () => {
    expect(ctx.extractTitleFromChain({}, ['start'], false)).toBe('')
  })
})


describe('convertScenariosToContext', () => {
  let ctx
  beforeAll(() => { ctx = loadScript(MODULES_WITH_REFS, makeGlobals()) })

  it('converts chains to context with incremental ids', () => {
    const chains = [
      { blocks: [{ type: 'start', text: 'T1', symbol_code: 's1' }, { type: 'message', text: 'body1' }] },
      { blocks: [{ type: 'start', text: 'T2', symbol_code: 's2' }, { type: 'message', text: 'body2' }] },
    ]
    const result = ctx.convertScenariosToContext(chains)
    expect(result).toEqual([
      { id: 0, title: expect.stringContaining('[T1]'), content: '\n## T1\nbody1' },
      { id: 1, title: expect.stringContaining('[T2]'), content: '\n## T2\nbody2' },
    ])
  })

  it('skips chains with empty or missing blocks', () => {
    const chains = [
      { blocks: [] },
      null,
      { blocks: [{ type: 'message', text: 'ok' }] },
    ]
    const result = ctx.convertScenariosToContext(chains)
    expect(result).toEqual([{ id: 0, title: '', content: 'ok' }])
  })

  it('skips chains where formatChainSimple returns empty content', () => {
    const chains = [
      { blocks: [{ type: 'condition', text: 'ignored' }] },
      { blocks: [{ type: 'message', text: 'kept' }] },
    ]
    const result = ctx.convertScenariosToContext(chains)
    expect(result).toEqual([{ id: 0, title: '', content: 'kept' }])
  })

  it('uses plain title when SIMPLE_TITLE_WITH_URL=false', () => {
    const ctx2 = loadScript(MODULES_WITH_REFS, makeGlobals({
      context_settings: { SIMPLE_TITLE_WITH_URL: false },
    }))
    const chains = [
      { blocks: [{ type: 'start', text: 'Title', symbol_code: 's1' }, { type: 'message', text: 'body' }] },
    ]
    const result = ctx2.convertScenariosToContext(chains)
    expect(result).toEqual([
      { id: 0, title: 'Title', content: '\n## Title\nbody' },
    ])
  })
})


// --- Complex scenarios ---

describe('isAvailableChain', () => {
  let ctx
  beforeAll(() => { ctx = loadScript(MODULES, makeGlobals()) })

  it('returns true when no excluded types present', () => {
    const chain = { blocks: [{ type: 'message' }, { type: 'start' }] }
    expect(ctx.isAvailableChain(['button', 'condition'], chain)).toBe(true)
  })

  it('returns false when excluded type is found', () => {
    const chain = { blocks: [{ type: 'message' }, { type: 'button' }] }
    expect(ctx.isAvailableChain(['button'], chain)).toBe(false)
  })

  it('returns true for chain without blocks', () => {
    expect(ctx.isAvailableChain(['button'], {})).toBe(true)
    expect(ctx.isAvailableChain(['button'], { blocks: [] })).toBe(true)
  })
})


describe('formatChainComplex', () => {
  it('extracts questions and joins with comma', () => {
    const ctx = loadScript(MODULES, makeGlobals())
    const chain = {
      blocks: [{ type: 'questions', text: ['q1', 'q2', 'q3'] }],
    }
    expect(ctx.formatChainComplex(chain)).toBe('q1,q2,q3')
  })

  it('returns empty string for chain with excluded types (button, condition)', () => {
    const ctx = loadScript(MODULES, makeGlobals())
    const chain = {
      blocks: [
        { type: 'button', text: 'btn' },
        { type: 'questions', text: ['q1'] },
      ],
    }
    expect(ctx.formatChainComplex(chain)).toBe('')
  })

  it('respects MAX_COMPLEX_QUESTION_EXAMPLES_LENGTH', () => {
    const ctx = loadScript(MODULES, makeGlobals({
      context_settings: { MAX_COMPLEX_QUESTION_EXAMPLES_LENGTH: 10 },
    }))
    const chain = {
      blocks: [{ type: 'questions', text: ['abcde', '12345', 'overflow'] }],
    }
    // 'abcde' (5) + '12345' (5) = 10, 'overflow' exceeds limit
    expect(ctx.formatChainComplex(chain)).toBe('abcde,12345')
  })

  it('skips empty questions', () => {
    const ctx = loadScript(MODULES, makeGlobals())
    const chain = {
      blocks: [{ type: 'questions', text: ['q1', '', 'q2'] }],
    }
    expect(ctx.formatChainComplex(chain)).toBe('q1,q2')
  })

  it('returns empty string for empty blocks', () => {
    const ctx = loadScript(MODULES, makeGlobals())
    expect(ctx.formatChainComplex({ blocks: [] })).toBe('')
    expect(ctx.formatChainComplex({})).toBe('')
  })
})


describe('extractSymbolCodeFromChain', () => {
  let ctx
  beforeAll(() => { ctx = loadScript(MODULES, makeGlobals()) })

  it('extracts symbol_code from matching block', () => {
    const chain = {
      blocks: [
        { type: 'start', symbol_code: 'wrong' },
        { type: 'complex_scenario', symbol_code: 'sc-1' },
      ],
    }
    expect(ctx.extractSymbolCodeFromChain(chain, ['complex_scenario'])).toBe('sc-1')
  })

  it('returns empty string when no match', () => {
    expect(ctx.extractSymbolCodeFromChain({ blocks: [{ type: 'message' }] }, ['complex_scenario'])).toBe('')
  })

  it('returns empty string for missing blocks', () => {
    expect(ctx.extractSymbolCodeFromChain({}, ['complex_scenario'])).toBe('')
  })
})


describe('convertScenariosToTools', () => {
  let ctx
  beforeAll(() => { ctx = loadScript(MODULES, makeGlobals()) })

  it('converts complex chains to tool format', () => {
    const chains = [{
      blocks: [
        { type: 'complex_scenario', text: 'Возврат', symbol_code: 'return_flow' },
        { type: 'questions', text: ['как вернуть?', 'возврат товара'] },
      ],
    }]
    expect(ctx.convertScenariosToTools(chains)).toEqual([{
      id: 0,
      title: 'Возврат',
      content: 'как вернуть?,возврат товара',
      symbol_code: 'return_flow',
    }])
  })

  it('skips chains without complex_scenario block (no symbol_code)', () => {
    const chains = [{
      blocks: [{ type: 'questions', text: ['q1'] }],
    }]
    expect(ctx.convertScenariosToTools(chains)).toEqual([])
  })

  it('skips chains with button or condition blocks', () => {
    const chains = [{
      blocks: [
        { type: 'complex_scenario', text: 'Title', symbol_code: 'sc' },
        { type: 'button', text: 'btn' },
        { type: 'questions', text: ['q1'] },
      ],
    }]
    expect(ctx.convertScenariosToTools(chains)).toEqual([])
  })

  it('assigns incremental ids across chains', () => {
    const chains = [
      { blocks: [{ type: 'complex_scenario', text: 'A', symbol_code: 'a' }, { type: 'questions', text: ['q1'] }] },
      { blocks: [{ type: 'complex_scenario', text: 'B', symbol_code: 'b' }, { type: 'questions', text: ['q2'] }] },
    ]
    const result = ctx.convertScenariosToTools(chains)
    expect(result[0].id).toBe(0)
    expect(result[1].id).toBe(1)
  })
})
