import { describe, it, expect, vi } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

const MODULES = [
  'modules/core/10_globals.js',
  'modules/core/20_http.js',
  'modules/core/30_dialog.js',
  'modules/core/40_references.js',
  'modules/core/50_context.js',
  'modules/core/55_slots.js',
  'modules/core/60_rag.js',
  'modules/core/70_tools_loop.js',
  'modules/core/80_main.js',
  'modules/models/qwen.js',
]

function makeGlobals(overrides = {}) {
  return {
    https: { Agent: class { constructor() {} } },
    URL, JSON, Date, RegExp, Object, Array, Map, Set, Promise, Error,
    parseInt, parseFloat, String, Number, Boolean,
    axios: { post: vi.fn(), get: vi.fn() },
    logger: {
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    },
    agentSettings: {
      api: {
        base_url: 'https://test.example.com',
        url_context_search: 'http://ctx:8080',
        url_llm: 'http://llm:8080',
        url_mediator_service: 'http://mediator:8080',
      },
      customer_id: 'cust-1',
      agent_name: 'test-agent',
      standard_messages: {},
      agent_parameters: {
        SHOW_THINKING: overrides.showThinking ?? false,
        ...overrides.agentParameters,
      },
      llm_settings: {},
      proxy: { USE_PROXY: false },
      articles: {},
      slots: {},
      context_settings: {},
    },
    message: {
      id: 'msg-1',
      message: { text: 'test', action: null },
      message_type: 1,
      meta: overrides.messageMeta ?? {},
      user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
      slot_context: { filled_slots: [] },
    },
    agentStorage: { dialogStorage: { get: vi.fn(async () => null), set: vi.fn() } },
    agentApi: {
      makeMarkdownReply: vi.fn((text) => ({
        message: { text },
        customer_id: 'c1',
        omni_user_id: 'ou1',
        channel_id: 'ch1',
      })),
      sendMessage: vi.fn(async () => ({ Ok: true })),
      getDialogId: vi.fn(async () => ({ Response: 'dialog-1' })),
    },
    availableFunctions: {},
    TOOLS: [],
    uuid: { v4: () => 'test-uuid' },
    resolve: vi.fn(),
    ...overrides.extra,
  }
}

function makeReplies() {
  return {
    textReply: vi.fn(),
    markdownReply: vi.fn(),
    debugReply: vi.fn(),
    deleteSlot: vi.fn(),
  }
}


describe('sendMessageToLLM', () => {
  const ragResponse = { answer: 'RAG ответ', tool_calls: [], log_id: 'l1' }
  const smalltalkResponse = { answer: 'Smalltalk ответ', tool_calls: [], log_id: 'l2' }
  const fullContext = {
    context: [{ title: 'Статья', content: 'Текст' }],
    symbol_code: ['art-1'],
    title: ['Статья'],
  }
  const fullContextWithRanges = {
    context: [{ title: 'Статья', content: 'Текст' }],
    symbol_code: ['art-1'],
    start_index: [0],
    end_index: [10],
    title: ['Статья'],
  }
  const emptyContext = { context: [], symbol_code: [], title: [] }
  const articleUrl = (id) =>
    `https://test.example.com/app/project/cust-1/knowledge-base/article/view/${id}`
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const makeSeparatedChunkContext = (count) => ({
    context: Array.from({ length: count }, (_, index) => ({
      title: 'Статья',
      content: `Чанк ${index + 1}`,
    })),
    symbol_code: Array.from({ length: count }, () => 'art-1'),
    start_index: Array.from({ length: count }, (_, index) => index * 3),
    end_index: Array.from({ length: count }, (_, index) => index * 3 + 1),
    title: Array.from({ length: count }, () => 'Статья'),
  })

  function setupCtx(overrides = {}) {
    const globals = makeGlobals(overrides)
    const ctx = loadScript(MODULES, globals)
    ctx.rag = vi.fn(async () => ragResponse)
    ctx.smalltalk = vi.fn(async () => smalltalkResponse)
    ctx._printResponse = vi.fn(async () => null)
    ctx.getContext = vi.fn(async () => clone(fullContext))
    return ctx
  }

  it('calls getContext → rag → _printResponse when context found', async () => {
    const ctx = setupCtx()
    const replies = makeReplies()
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Здравствуйте', role: 'assistant' },
    ]

    const result = await ctx.sendMessageToLLM('Вопрос', 'd1', history, replies)

    expect(ctx.getContext).toHaveBeenCalledWith('Вопрос', replies)
    // addUrlToContextTitle оборачивает title в markdown link
    expect(ctx.rag).toHaveBeenCalledWith(
      'Вопрос',
      [expect.objectContaining({ title: expect.stringContaining('[Статья]') })],
      'd1',
      // buildLLMHistory преобразует историю
      [
        { role: 'user', message: 'Привет' },
        { role: 'assistant', message: 'Здравствуйте' },
      ],
      replies
    )
    expect(ctx._printResponse).toHaveBeenCalledWith(ragResponse, replies)
    expect(result).toBe(ragResponse)
  })

  it('calls getContext → smalltalk when context empty and use_smalltalk=true', async () => {
    const ctx = setupCtx()
    ctx.getContext.mockResolvedValue(emptyContext)
    const replies = makeReplies()
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
    ]

    const result = await ctx.sendMessageToLLM('Вопрос', 'd1', history, replies, { use_smalltalk: true })

    expect(ctx.getContext).toHaveBeenCalled()
    expect(ctx.smalltalk).toHaveBeenCalledWith(
      'Вопрос', 'd1',
      [{ role: 'user', message: 'Привет' }],
      replies
    )
    expect(ctx._printResponse).toHaveBeenCalledWith(smalltalkResponse, replies)
    expect(ctx.rag).not.toHaveBeenCalled()
    expect(result).toBe(smalltalkResponse)
  })

  it('returns NO_CONTEXT_TEXT when context empty and use_smalltalk=false', async () => {
    const ctx = setupCtx()
    ctx.getContext.mockResolvedValue(emptyContext)
    const replies = makeReplies()

    const result = await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies, { use_smalltalk: false })

    expect(ctx.getContext).toHaveBeenCalled()
    expect(replies.markdownReply).toHaveBeenCalled()
    expect(result.answer).toBe(ctx.__getLetVar('NO_CONTEXT_TEXT'))
    expect(result.tool_calls).toEqual([])
    expect(ctx.rag).not.toHaveBeenCalled()
    expect(ctx.smalltalk).not.toHaveBeenCalled()
  })

  it('skips getContext when use_rag=false', async () => {
    const ctx = setupCtx()
    const replies = makeReplies()

    await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies, { use_rag: false, use_smalltalk: true })

    expect(ctx.getContext).not.toHaveBeenCalled()
    expect(ctx.smalltalk).toHaveBeenCalled()
  })

  it('passes rephrased questions to getContext when use_rephrase=true', async () => {
    const ctx = setupCtx()
    ctx.rephrase = vi.fn(async () => ['перефраз1', 'перефраз2'])
    ctx.REPHRASE_PROMPT_2 = 'prompt2'
    const replies = makeReplies()
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
    ]

    await ctx.sendMessageToLLM('Вопрос', 'd1', history, replies, { use_rephrase: true })

    expect(ctx.rephrase).toHaveBeenCalledWith(
      'Вопрос', 'prompt2', 'd1',
      [{ role: 'user', message: 'Привет' }],
      replies
    )
    expect(ctx.getContext).toHaveBeenCalledWith(
      ['Вопрос', 'перефраз1', 'перефраз2'],
      replies
    )
  })

  it('calls buildLLMHistory before LLM request', async () => {
    const ctx = setupCtx()
    ctx.buildLLMHistory = vi.fn(() => [{ role: 'user', message: 'prev' }])
    const replies = makeReplies()
    const history = [{ id: 'm1', type: 1, content: 'prev', role: 'user' }]

    await ctx.sendMessageToLLM('Вопрос', 'd1', history, replies)

    expect(ctx.buildLLMHistory).toHaveBeenCalledWith(history, [])
  })

  it('keeps source highlight output disabled by default', async () => {
    const modelResponse = {
      answer: `[Статья](${articleUrl('art-1')})`,
      tool_calls: [],
      log_id: 'l1',
    }
    const ctx = setupCtx()
    ctx.getContext.mockResolvedValue(clone(fullContextWithRanges))
    ctx.rag.mockResolvedValue(modelResponse)
    const replies = makeReplies()

    const result = await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies)

    expect(ctx.rag.mock.calls[0][1][0].title).toBe(`[Статья](${articleUrl('art-1')})`)
    expect(ctx._printResponse).toHaveBeenCalledWith(modelResponse, replies)
    expect(result).toBe(modelResponse)
  })

  it('passes a separate source highlight link for each RAG context chunk', async () => {
    const ctx = setupCtx({
      agentParameters: { ENABLE_SOURCE_HIGHLIGHTS: true },
    })
    ctx.getContext.mockResolvedValue({
      context: [
        { title: 'Статья', content: 'Первый чанк' },
        { title: 'Статья', content: 'Второй чанк' },
      ],
      symbol_code: ['art-1', 'art-1'],
      start_index: [0, 10],
      end_index: [10, 20],
      title: ['Статья', 'Статья'],
    })
    const replies = makeReplies()

    await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies)

    expect(ctx.rag.mock.calls[0][1].map(({ title }) => title)).toEqual([
      `[Статья](${articleUrl('art-1')}?ctv=1&ctr=0%3A10)`,
      `[Статья](${articleUrl('art-1')}?ctv=1&ctr=10%3A20)`,
    ])
  })

  it('enriches RAG answer article links before printing when source highlights are enabled', async () => {
    const modelResponse = {
      answer: `[Статья](${articleUrl('art-1')}?ctv=1&ctr=99%3A100)`,
      tool_calls: [],
      log_id: 'l1',
    }
    const ctx = setupCtx({
      agentParameters: { ENABLE_SOURCE_HIGHLIGHTS: true },
    })
    ctx.getContext.mockResolvedValue(clone(fullContextWithRanges))
    ctx.rag.mockResolvedValue(modelResponse)
    const replies = makeReplies()

    const result = await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies)
    const expectedResponse = {
      ...modelResponse,
      answer: `[Статья](${articleUrl('art-1')}?ctv=1&ctr=0%3A10)`,
    }

    expect(ctx.rag.mock.calls[0][1][0].title).toBe(
      `[Статья](${articleUrl('art-1')}?ctv=1&ctr=0%3A10)`,
    )
    expect(ctx._printResponse).toHaveBeenCalledWith(expectedResponse, replies)
    expect(result).toEqual(expectedResponse)
  })

  it('preserves a valid model selection from the twenty-first retrieved chunk byte-for-byte', async () => {
    const selectedUrl =
      `${articleUrl('art-1')}?lang=ru&ctv=1&ctr=60%3A61#chunk-21`
    const modelResponse = {
      answer: `[Статья](${selectedUrl})`,
      tool_calls: [],
      log_id: 'l1',
    }
    const ctx = setupCtx({
      agentParameters: { ENABLE_SOURCE_HIGHLIGHTS: true },
    })
    ctx.getContext.mockResolvedValue(makeSeparatedChunkContext(21))
    ctx.rag.mockResolvedValue(modelResponse)
    const replies = makeReplies()

    const result = await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies)

    expect(result.answer).toBe(modelResponse.answer)
    expect(ctx._printResponse).toHaveBeenCalledWith(modelResponse, replies)
  })

  it('limits an invalid model selection fallback to the first twenty retrieved ranges', async () => {
    const modelResponse = {
      answer:
        `[Статья](${articleUrl('art-1')}` +
        '?lang=ru&ctv=1&ctr=999%3A1000#details)',
      tool_calls: [],
      log_id: 'l1',
    }
    const expectedRanges = Array.from(
      { length: 20 },
      (_, index) => `&ctr=${index * 3}%3A${index * 3 + 1}`,
    ).join('')
    const ctx = setupCtx({
      agentParameters: { ENABLE_SOURCE_HIGHLIGHTS: true },
    })
    ctx.getContext.mockResolvedValue(makeSeparatedChunkContext(21))
    ctx.rag.mockResolvedValue(modelResponse)
    const replies = makeReplies()

    const result = await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies)

    expect(result.answer).toBe(
      `[Статья](${articleUrl('art-1')}?lang=ru&ctv=1${expectedRanges}#details)`,
    )
  })

  it('keeps references without source highlight params when source highlights are disabled', async () => {
    const ctx = setupCtx({
      agentParameters: { SHOW_REFERENCES: true },
    })
    ctx.getContext.mockResolvedValue(clone(fullContextWithRanges))
    const replies = makeReplies()

    await ctx.sendMessageToLLM('Вопрос', 'd1', null, replies)

    expect(replies.markdownReply).toHaveBeenCalledWith(
      `### Ссылки для информации:\n\n*  [Статья](${articleUrl('art-1')})`,
      { references: "true" },
    )
  })
})


// mediator кладёт текущий user-msg в историю до вызова /message,
// поэтому jsagent должен отрезать его, прежде чем отправлять
// craftgpt-у — иначе craftgpt приклеит вопрос ещё раз и LLM
// получит его дважды. Тест проверяет тело axios.post через
// _mainBody, чтобы не зависеть от того, где именно делается trim.
describe('craftgpt request body — no duplicate of current question in history', () => {
  function _mediatorHistory(messages) {
    // Формат, который возвращает GET /messages?dialog_id=...:
    // [{msg|reply: {id, message_type, message: {text}, meta}}]
    // m.type позволяет задать служебные сообщения (напр. type 30 —
    // маршрутизация switchredirect/redirect/ack).
    return messages.map((m, i) => {
      const entry = {
        id: `m${i}`,
        message_type: m.type ?? 1,
        message: { text: m.text, text_type: 'Markdown' },
        meta: {},
      }
      return m.role === 'user' ? { msg: entry } : { reply: entry }
    })
  }

  function makeAxiosMock(mediatorHistory) {
    return {
      // GET: не используется для истории (messages_by_meta через POST)
      get: vi.fn(async () => ({ data: [] })),
      // POST: маршрутизация по URL — messages_by_meta (history) /
      // rephrase / context_query (rag) / query (smalltalk) /
      // contextsearch /search.
      post: vi.fn(async (url, data) => {
        if (url.includes('/messages_by_meta')) {
          return { data: mediatorHistory }
        }
        if (url.includes('/rephrase')) {
          return { data: { texts: [data.question] } }
        }
        if (url.includes('/search')) {
          return { data: {
            context: [{ doc_id: 'a-1', title: 'T', content: 'C' }],
            symbol_code: ['a-1'],
            title: ['T'],
          } }
        }
        if (url.includes('/context_query') || url.endsWith('/query')) {
          return { data: { answer: 'OK', tool_calls: [], log_id: 'l1' } }
        }
        return { data: {} }
      }),
    }
  }

  function runMainBody({ question, history }) {
    const axios = makeAxiosMock(_mediatorHistory(history))
    const globals = makeGlobals({
      agentParameters: { USE_HISTORY: true, HISTORY_FROM_BOT_MEDIATOR: true },
      extra: {
        axios,
        LLM_SYSTEM_TEMPLATE: '',
        LLM_SYSTEM_TEMPLATE_SMALLTALK: '',
        RAG_TEMPLATE: '{question}\n\n{context}',
        RAG_DOCUMENT_TEMPLATE: '{title}\n{content}',
        RAG_JOIN_SEP: '\n\n',
        SMALLTALK_TEMPLATE: '{question}',
      },
    })
    globals.message.message.text = question
    globals.message.slot_context.filled_slots = [{ slot_id: 'conversation_id', value: 'conv-test', filled_at_ms: 0 }]
    globals.agentApi.getDialogId = vi.fn(async () => ({ Response: 'd1' }))
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()
    return { ctx, axios, replies, run: () => ctx._mainBody(replies) }
  }

  function lastEntry(arr) {
    return arr && arr.length ? arr[arr.length - 1] : undefined
  }

  function craftgptHistory(axios) {
    // Из всех POST-вызовов берём первый /context_query или /query —
    // финальный запрос на ответ в craftgpt.
    const call = axios.post.mock.calls.find(
      c => c[0].includes('/context_query') || c[0].endsWith('/query'),
    )
    if (!call) return null
    return call[1].history ?? []
  }

  it('single-turn: mediator-история = [{user, question}] — craftgpt получает пустую history', async () => {
    const question = 'условия обслуживания стикера'
    const { axios, run } = runMainBody({
      question,
      history: [{ role: 'user', text: question }],
    })
    await run()
    const hist = craftgptHistory(axios)
    expect(hist, 'должен быть POST к craftgpt').not.toBeNull()
    const last = lastEntry(hist)
    expect(
      last && last.role === 'user' && last.message === question,
      'craftgpt-history не должна оканчиваться текущим question',
    ).toBeFalsy()
  })

  it('multi-turn: история оканчивается на текущий вопрос — он отрезан', async () => {
    const question = 'хочу оператора'
    const { axios, run } = runMainBody({
      question,
      history: [
        { role: 'user', text: 'привет' },
        { role: 'assistant', text: 'Здравствуйте!' },
        { role: 'user', text: question },
      ],
    })
    await run()
    const hist = craftgptHistory(axios)
    expect(hist).not.toBeNull()
    const last = lastEntry(hist)
    expect(
      last && last.role === 'user' && last.message === question,
    ).toBeFalsy()
    // Предыдущая реплика ассистента должна остаться — иначе
    // отрезали лишнее.
    expect(hist.some(
      e => e.role !== 'user' && (e.message || '').includes('Здравствуйте'),
    ), 'предыдущая bot-реплика должна сохраниться').toBe(true)
  })

  it('IDA routing-хвост: вопрос + служебные type 30 — дубликат отрезан, type 30 не уходят в craftgpt', async () => {
    // Прод-кейс gpt_ida_qwen: входящий сценарий идёт через aiassist2,
    // который выбирает агента, поэтому за сообщением пользователя в
    // истории остаётся хвост маршрутизации (type 30). craftgpt-у
    // должна уйти история БЕЗ текущего вопроса (он приклеится сам) и
    // без служебных type 30.
    const question = 'кардамон'
    const { axios, run } = runMainBody({
      question,
      history: [
        { role: 'user', text: question },
        { role: 'assistant', type: 30, text: `/switchredirect aiassist2 ${question}` },
        { role: 'assistant', type: 30, text: '/ack ack ack' },
        { role: 'assistant', type: 30, text: `/switchredirect gpt_ida_qwen ${question}` },
      ],
    })
    await run()
    const hist = craftgptHistory(axios)
    expect(hist).not.toBeNull()
    expect(
      hist.some(e => e.role === 'user' && e.message === question),
      'дубликат текущего вопроса не должен попасть в craftgpt-history',
    ).toBe(false)
    expect(
      hist.some(e => /\/switchredirect|\/ack|\/redirect/.test(e.message || '')),
      'служебные type 30 не должны попадать в craftgpt-history',
    ).toBe(false)
  })

  it('последний user-msg НЕ равен question — режется только дубликат', async () => {
    // Защита от over-trim: если последняя реплика — НЕ повторение
    // текущего вопроса, оставляем её. Это синтетический случай
    // (mediator всегда кладёт текущий msg в хвост), но проверяет,
    // что trim не агрессивен.
    const { axios, run } = runMainBody({
      question: 'новый вопрос',
      history: [{ role: 'user', text: 'другой вопрос' }],
    })
    await run()
    const hist = craftgptHistory(axios)
    expect(hist).not.toBeNull()
    expect(hist.some(
      e => e.role === 'user' && e.message === 'другой вопрос',
    ), 'user-msg с другим текстом должен сохраниться').toBe(true)
  })
})


describe('main', () => {
  it('catches SwitchRedirectPropagate and sends switchredirect to user', async () => {
    const globals = makeGlobals()
    const ctx = loadScript(MODULES, globals)
    const SRP = ctx.__getLetVar('SwitchRedirectPropagate')
    ctx._main = vi.fn(async () => { throw new SRP('/switchredirect other-agent intent_id="123"') })

    await ctx.main()

    expect(globals.agentApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageMarkdown: '/switchredirect other-agent intent_id="123"',
      }),
      expect.anything()
    )
  })

  it('calls _main and sends response to user on success', async () => {
    const globals = makeGlobals()
    const ctx = loadScript(MODULES, globals)
    ctx._main = vi.fn(async (replies) => {
      await replies.markdownReply('Ответ пользователю')
    })

    await ctx.main()

    expect(ctx._main).toHaveBeenCalled()
    expect(globals.agentApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ MessageMarkdown: 'Ответ пользователю' }),
      expect.anything()
    )
  })

  it('sends TIMEOUT_ERROR_MSG on ECONNABORTED error', async () => {
    const globals = makeGlobals()
    const ctx = loadScript(MODULES, globals)
    const err = new Error('timeout')
    err.code = 'ECONNABORTED'
    ctx._main = vi.fn(async () => { throw err })

    await ctx.main()

    const timeoutMsg = ctx.__getLetVar('TIMEOUT_ERROR_MSG')
    expect(globals.agentApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ MessageMarkdown: timeoutMsg }),
      expect.anything()
    )
  })

  it('sends DEFAULT_ERROR_MSG on unknown error', async () => {
    const globals = makeGlobals()
    const ctx = loadScript(MODULES, globals)
    ctx._main = vi.fn(async () => { throw new Error('unexpected') })

    await ctx.main()

    const defaultMsg = ctx.__getLetVar('DEFAULT_ERROR_MSG')
    expect(globals.agentApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ MessageMarkdown: defaultMsg }),
      expect.anything()
    )
  })

  it('sends debug error details when DEBUG=true', async () => {
    const globals = makeGlobals({ agentParameters: { DEBUG: true } })
    const ctx = loadScript(MODULES, globals)
    ctx._main = vi.fn(async () => { throw new Error('debug me') })

    await ctx.main()

    // DEFAULT_ERROR_MSG + два debug сообщения (ошибка + стек)
    expect(globals.agentApi.sendMessage).toHaveBeenCalledTimes(3)
  })
})


describe('_mainBody (IS_QUERY_REPORT)', () => {
  it('strips <think> tags via messageProcessor.fromModelFormat for Qwen finalAnswer', async () => {
    const globals = makeGlobals({
      messageMeta: { isQueryReport: true, dialog_id: 'd1', history: [] },
    })
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()

    // Перехватываем sendMessageToLLM, чтобы вернуть Qwen-ответ с <think>
    ctx.sendMessageToLLM = vi.fn(async () => ({
      answer: '<think>скрытое рассуждение</think>видимый ответ',
      tool_calls: [],
      log_id: 'l1',
    }))

    const result = await ctx._mainBody(replies)

    // _mainBody должен прогнать finalAnswer через messageProcessor.fromModelFormat
    expect(result).toBe('видимый ответ')
  })

  it('returns clean answer unchanged when no <think> tags present', async () => {
    const globals = makeGlobals({
      messageMeta: { isQueryReport: true, dialog_id: 'd1', history: [] },
    })
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()

    ctx.sendMessageToLLM = vi.fn(async () => ({
      answer: 'обычный ответ без размышлений',
      tool_calls: [],
      log_id: 'l1',
    }))

    const result = await ctx._mainBody(replies)
    expect(result).toBe('обычный ответ без размышлений')
  })
})


describe('_mainBody history loading', () => {
  it('passes customer_id and omni_user_id to getDialogsHistory and runToolsLoop', async () => {
    const globals = makeGlobals({
      agentParameters: { HISTORY_FROM_BOT_MEDIATOR: true },
    })
    const ctx = loadScript(MODULES, globals)
    const replies = makeReplies()

    ctx.getDialogsHistory = vi.fn(async () => [])
    ctx.runToolsLoop = vi.fn(async () => ({ finalAnswer: 'ok' }))

    await ctx._mainBody(replies, {})

    expect(ctx.getDialogsHistory).toHaveBeenCalledWith('c1', 'ou1')
    expect(ctx.runToolsLoop).toHaveBeenCalledWith(
      'test',
      'dialog-1',
      [],
      expect.any(Object),
      expect.any(Object),
      expect.any(Function),
      expect.any(Function)
    )
  })
})


describe('_sendReply', () => {
  it('calls agentApi.sendMessage with correct payload', async () => {
    const globals = makeGlobals()
    const ctx = loadScript(MODULES, globals)

    await ctx._sendReply('Hello')

    expect(globals.agentApi.sendMessage).toHaveBeenCalledWith(
      {
        MessageMarkdown: 'Hello',
        SendMessageParams: {
          ProjectId: 'c1',
          OmniUserId: 'ou1',
          Sender: {},
          DestinationChannel: {
            ChannelId: 'ch1',
            ChannelUserId: 'u1',
          },
          FilledSlots: {},
          Meta: {},
        },
      },
      expect.anything()
    )
  })

  it('passes meta to SendMessageParams.Meta', async () => {
    const globals = makeGlobals()
    const ctx = loadScript(MODULES, globals)

    await ctx._sendReply('text', undefined, { debug: "true" })

    expect(globals.agentApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        SendMessageParams: expect.objectContaining({ Meta: { debug: "true" } }),
      }),
      expect.anything()
    )
  })

  it('merges slots via slotManager', async () => {
    const globals = makeGlobals()
    const ctx = loadScript(MODULES, globals)
    const slots = { city: 'Москва' }

    await ctx._sendReply('text', slots)

    expect(globals.agentApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        SendMessageParams: expect.objectContaining({
          FilledSlots: expect.objectContaining({ city: 'Москва' }),
        }),
      }),
      expect.anything()
    )
  })

  it('logs error when sendMessage returns Ok=false', async () => {
    const globals = makeGlobals()
    globals.agentApi.sendMessage.mockResolvedValue({ Ok: false, Errors: ['fail'] })
    const ctx = loadScript(MODULES, globals)

    await ctx._sendReply('text')

    expect(globals.logger.error).toHaveBeenCalled()
  })

  it('sends debug error message when DEBUG=true and Ok=false', async () => {
    const globals = makeGlobals({ agentParameters: { DEBUG: true } })
    globals.agentApi.sendMessage
      .mockResolvedValueOnce({ Ok: false, Errors: ['fail'] })
      .mockResolvedValueOnce({ Ok: true })
    const ctx = loadScript(MODULES, globals)

    await ctx._sendReply('text')

    expect(globals.agentApi.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('catches sendMessage exceptions', async () => {
    const globals = makeGlobals()
    globals.agentApi.sendMessage.mockRejectedValue(new Error('network'))
    const ctx = loadScript(MODULES, globals)

    await ctx._sendReply('text')

    expect(globals.logger.error).toHaveBeenCalledWith(expect.stringContaining('network'))
  })
})


describe('_printResponse', () => {
  it('sends answer via markdownReply', async () => {
    const ctx = loadScript(MODULES, makeGlobals())
    const replies = makeReplies()

    const result = await ctx._printResponse(
      { answer: 'Ответ', tool_calls: [] },
      replies
    )

    expect(replies.markdownReply).toHaveBeenCalledWith('Ответ', expect.objectContaining({}))
    expect(result).toBeNull()
  })

  it('returns pendingReasoning when SHOW_THINKING=false and no answer', async () => {
    const ctx = loadScript(MODULES, makeGlobals())
    const replies = makeReplies()

    const result = await ctx._printResponse(
      { answer: '<think>Размышления</think>', tool_calls: [] },
      replies
    )

    expect(result).toBe('Размышления')
    expect(replies.debugReply).toHaveBeenCalled()
    expect(replies.markdownReply).not.toHaveBeenCalled()
  })

  it('attaches reasoning to answer meta when SHOW_THINKING=false', async () => {
    const ctx = loadScript(MODULES, makeGlobals())
    const replies = makeReplies()

    const result = await ctx._printResponse(
      { answer: '<think>Думаю</think>\n\nОтвет', tool_calls: [] },
      replies
    )

    expect(result).toBeNull()
    expect(replies.markdownReply).toHaveBeenCalledWith(
      'Ответ',
      expect.objectContaining({ reasoning: 'Думаю' })
    )
    expect(replies.debugReply).toHaveBeenCalled()
  })

  it('sends thinking via textReply when SHOW_THINKING=true', async () => {
    const ctx = loadScript(MODULES, makeGlobals({ showThinking: true }))
    const replies = makeReplies()

    const result = await ctx._printResponse(
      { answer: '<think>Думаю</think>\n\nОтвет', tool_calls: [] },
      replies
    )

    expect(result).toBeNull()
    expect(replies.textReply).toHaveBeenCalledWith(
      expect.stringContaining('Думаю'),
      expect.objectContaining({ isThinking: "true" })
    )
    expect(replies.markdownReply).toHaveBeenCalledWith(
      'Ответ',
      expect.not.objectContaining({ reasoning: expect.anything() })
    )
  })

  it('does not return pendingReasoning when SHOW_THINKING=true', async () => {
    const ctx = loadScript(MODULES, makeGlobals({ showThinking: true }))
    const replies = makeReplies()

    const result = await ctx._printResponse(
      { answer: '<think>Размышления</think>', tool_calls: [] },
      replies
    )

    expect(result).toBeNull()
    expect(replies.textReply).toHaveBeenCalled()
  })

  it('adds commitId to meta when provided', async () => {
    const ctx = loadScript(MODULES, makeGlobals())
    const replies = makeReplies()

    await ctx._printResponse(
      { answer: 'Ответ', tool_calls: [] },
      replies,
      'commit-123'
    )

    expect(replies.markdownReply).toHaveBeenCalledWith(
      'Ответ',
      expect.objectContaining({ commitId: 'commit-123' })
    )
  })

  it('returns null for IS_QUERY_REPORT', async () => {
    const ctx = loadScript(MODULES, makeGlobals({ messageMeta: { isQueryReport: true } }))
    const replies = makeReplies()

    const result = await ctx._printResponse({ answer: 'Ответ' }, replies)

    expect(result).toBeNull()
    expect(replies.markdownReply).not.toHaveBeenCalled()
  })
})
