import { describe, it, expect, vi } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

function makeDialogCtx() {
  return {
    https: { Agent: class { constructor() {} } },
    URL, JSON, Date, RegExp,
    axios: {},
    logger: { debug() {}, info() {}, error() {}, warn() {} },
    agentSettings: {
      api: {},
      customer_id: 'test',
      agent_name: 'test-agent',
      standard_messages: { THINKING_PREFIX: '*Мои размышления:* \n\n' },
      agent_parameters: {},
      llm_settings: {},
      articles: {},
      slots: {},
    },
    message: { meta: {}, slot_context: { filled_slots: [] } },
    AGENT: {},
  }
}

function makeDialogCtxWithToolsLoop() {
  return {
    ...makeDialogCtx(),
    agentSettings: {
      ...makeDialogCtx().agentSettings,
      api: { url_llm: 'http://llm:3020' },
    },
  }
}

const DIALOG_ONLY = ['modules/core/10_globals.js', 'modules/core/30_dialog.js']
const DIALOG_WITH_QWEN = ['modules/core/10_globals.js', 'modules/core/30_dialog.js', 'modules/models/qwen.js']
const DIALOG_WITH_TOOLS_LOOP = [
  'modules/core/10_globals.js',
  'modules/core/20_http.js',
  'modules/core/30_dialog.js',
  'modules/core/55_slots.js',
  'modules/core/70_tools_loop.js',
  'modules/models/qwen.js',
]

describe('createMessageItem', () => {
  it('creates message item with basic fields', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    expect(ctx.createMessageItem('msg-1', 1, 'Hello', 'user', {})).toEqual({
      id: 'msg-1',
      type: 1,
      content: 'Hello',
      role: 'user',
    })
  })

  it('handles empty meta', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const item = ctx.createMessageItem('msg-2', 19, 'text', 'assistant', {})
    expect(item.isThinking).toBeUndefined()
    expect(item.meta).toBeUndefined()
  })

  it('preserves isThinking flag from meta', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const item = ctx.createMessageItem('msg-3', 1, 'thinking', 'assistant', { isThinking: true })
    expect(item.isThinking).toBe(true)
  })

  it('preserves reasoning from meta', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const item = ctx.createMessageItem('msg-4', 1, 'answer', 'assistant', { reasoning: 'hidden' })
    expect(item.meta).toEqual({ reasoning: 'hidden' })
  })

  it('preserves commitId from meta', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const item = ctx.createMessageItem('msg-5', 1, 'thinking', 'assistant', {
      isThinking: true,
      commitId: 'c1',
    })
    expect(item.isThinking).toBe(true)
    expect(item.meta).toEqual({ commitId: 'c1' })
  })

  it('preserves debug flag from meta', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const item = ctx.createMessageItem('msg-6', 1, 'debug text', 'assistant', { debug: true })
    expect(item.meta).toEqual({ debug: true })
  })

  it('preserves references flag from meta', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const item = ctx.createMessageItem('msg-7', 1, '### Ссылки...', 'assistant', { references: true })
    expect(item.meta).toEqual({ references: true })
  })
})


describe('getDialog', () => {
  // Ответ bot mediator — массив HistoryRecord[].
  // HistoryRecord = {is_reply: bool, msg: Message|null, reply: ReplyMessage|null}
  // Если is_reply=false: msg заполнен (входящее от клиента), reply=null.
  // Если is_reply=true: reply заполнен (ответ бота/оператора), msg=null.
  // Текст: source.message.text (Msg или ReplyMsg).
  // getDialog фильтрует: оставляет только message_type 1 (Message), 19 (DialogFinished), 30 (Command).
  const MEDIATOR_RESPONSE = [
    // Пользователь: обычное сообщение (type 1)
    {
      is_reply: false,
      msg: {
        id: 'msg-001', message_type: 1,
        message: { text: 'Привет, хочу отследить посылку', attachment: null, attachments: null, action: '', action_title: '', sticker: null },
        meta: {},
      },
      reply: null,
    },
    // Бот: ответ на сообщение (type 1)
    {
      is_reply: true,
      msg: null,
      reply: {
        id: 'reply-001', message_type: 1,
        message: { text_type: 'Markdown', text: 'Здравствуйте! Укажите трек-номер.', attachment: null, attachments: null, actions: [] },
        meta: { commitId: 'c1' },
      },
    },
    // Служебное: SentConfirmation (type 2) — должно быть отфильтровано
    {
      is_reply: true,
      msg: null,
      reply: {
        id: 'reply-002', message_type: 2,
        message: { text_type: null, text: '', attachment: null, attachments: null, actions: [] },
        meta: {},
      },
    },
    // Пользователь: трек-номер (type 1)
    {
      is_reply: false,
      msg: {
        id: 'msg-002', message_type: 1,
        message: { text: 'RA123456789RU', attachment: null, attachments: null, action: '', action_title: '', sticker: null },
        meta: {},
      },
      reply: null,
    },
    // Бот: команда switchredirect (type 30)
    {
      is_reply: true,
      msg: null,
      reply: {
        id: 'reply-003', message_type: 30,
        message: { text_type: null, text: '/switchredirect aiassist2', attachment: null, attachments: null, actions: [] },
        meta: {},
      },
    },
    // Служебное: ReceivedByOperator (type 12) — отфильтровано
    {
      is_reply: true,
      msg: null,
      reply: {
        id: 'reply-004', message_type: 12,
        message: { text_type: null, text: '', attachment: null, attachments: null, actions: [] },
        meta: {},
      },
    },
    // Бот: диалог завершён (type 19)
    {
      is_reply: true,
      msg: null,
      reply: {
        id: 'reply-005', message_type: 19,
        message: { text_type: null, text: 'Диалог завершён', attachment: null, attachments: null, actions: [] },
        meta: {},
      },
    },
    // Пользователь: FailedConfirmation (type 5) — отфильтровано
    {
      is_reply: false,
      msg: {
        id: 'msg-003', message_type: 5,
        message: { text: 'failed', attachment: null, attachments: null, action: '', action_title: '', sticker: null },
        meta: {},
      },
      reply: null,
    },
  ]

  function makeDialogCtxWithAxios(mediatorData) {
    const ctx = makeDialogCtx()
    ctx.axios = { get: vi.fn(() => Promise.resolve({ data: mediatorData })) }
    return ctx
  }

  it('parses user and bot messages with correct roles', async () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithAxios(MEDIATOR_RESPONSE))
    const result = await ctx.getDialog('dialog-1')

    expect(result).toEqual([
      { id: 'msg-001', type: 1, content: 'Привет, хочу отследить посылку', role: 'user' },
      { id: 'reply-001', type: 1, content: 'Здравствуйте! Укажите трек-номер.', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 'msg-002', type: 1, content: 'RA123456789RU', role: 'user' },
      { id: 'reply-003', type: 30, content: '/switchredirect aiassist2', role: 'assistant' },
      { id: 'reply-005', type: 19, content: 'Диалог завершён', role: 'assistant' },
    ])
  })

  it('filters out service message types (2, 5, 12)', async () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithAxios(MEDIATOR_RESPONSE))
    const result = await ctx.getDialog('dialog-1')

    const ids = result.map(m => m.id)
    expect(ids).not.toContain('reply-002')  // SentConfirmation (type 2)
    expect(ids).not.toContain('reply-004')  // ReceivedByOperator (type 12)
    expect(ids).not.toContain('msg-003')    // FailedConfirmation (type 5)
  })

  it('returns empty array when mediator returns null', async () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithAxios(null))
    const result = await ctx.getDialog('dialog-1')
    expect(result).toEqual([])
  })

  it('returns empty array for empty dialog', async () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithAxios([]))
    const result = await ctx.getDialog('dialog-1')
    expect(result).toEqual([])
  })

  it('calls mediator API with correct dialog_id', async () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithAxios([]))
    await ctx.getDialog('5db81f73-8d85-4225-8ec9-b8d61f6c7d04')

    const url = ctx.axios.get.mock.calls[0][0]
    expect(url).toContain('dialog_id=5db81f73-8d85-4225-8ec9-b8d61f6c7d04')
  })
})


describe('getDialogsHistory', () => {
  function makeHistoryRecord(id, text, isReply = false, type = 1) {
    if (isReply) {
      return {
        is_reply: true,
        msg: null,
        reply: {
          id,
          message_type: type,
          message: { text },
          meta: {},
        },
      }
    }
    return {
      is_reply: false,
      msg: {
        id,
        message_type: type,
        message: { text },
        meta: {},
      },
      reply: null,
    }
  }

  function makeCtxWithConversationId(conversationId, mediatorData) {
    const ctx = makeDialogCtx()
    ctx.message.slot_context.filled_slots = [{ slot_id: 'conversation_id', value: conversationId, filled_at_ms: 0 }]
    ctx.axios = { post: vi.fn(() => Promise.resolve({ data: mediatorData })) }
    return ctx
  }

  it('fetches history from messages_by_meta with conversation_id from slots', async () => {
    const historyData = [
      makeHistoryRecord('u1', 'привет'),
      makeHistoryRecord('b1', 'Здравствуйте!', true),
    ]
    const ctx = makeCtxWithConversationId('conv-123', historyData)
    const loaded = loadScript(DIALOG_ONLY, ctx)

    const result = await loaded.getDialogsHistory('cust-1', 'omni-1')

    expect(result.map(m => m.id)).toEqual(['u1', 'b1'])
    expect(ctx.axios.post).toHaveBeenCalledTimes(1)
    const [url, body] = ctx.axios.post.mock.calls[0]
    expect(url).toContain('/mediator/messages_by_meta')
    expect(body).toEqual({
      CustomerId: 'cust-1',
      OmniUserId: 'omni-1',
      MetaFilter: { conversation_id: 'conv-123' },
      SortBy: 'timestamp',
      SortOrder: 'Asc',
      Limit: 10000,
    })
  })

  it('falls back to conversation_id from message.meta when not in slots', async () => {
    const historyData = [makeHistoryRecord('u1', 'привет')]
    const ctx = makeDialogCtx()
    ctx.message.meta = { conversation_id: 'meta-conv-456' }
    ctx.axios = { post: vi.fn(() => Promise.resolve({ data: historyData })) }
    const loaded = loadScript(DIALOG_ONLY, ctx)

    const result = await loaded.getDialogsHistory('cust-1', 'omni-1')

    expect(result.map(m => m.id)).toEqual(['u1'])
    const [, body] = ctx.axios.post.mock.calls[0]
    expect(body.MetaFilter).toEqual({ conversation_id: 'meta-conv-456' })
  })

  it('returns empty array when conversation_id is missing', async () => {
    const ctx = makeDialogCtx()
    ctx.axios = { post: vi.fn(() => Promise.resolve({ data: [makeHistoryRecord('u1', 'hi')] })) }
    const loaded = loadScript(DIALOG_ONLY, ctx)

    const result = await loaded.getDialogsHistory('cust-1', 'omni-1')

    expect(result).toEqual([])
    expect(ctx.axios.post).not.toHaveBeenCalled()
  })

  it('returns empty array when API call fails', async () => {
    const ctx = makeDialogCtx()
    ctx.message.slot_context.filled_slots = [{ slot_id: 'conversation_id', value: 'conv-1', filled_at_ms: 0 }]
    ctx.axios = { post: vi.fn(() => Promise.reject(new Error('network error'))) }
    const loaded = loadScript(DIALOG_ONLY, ctx)

    const result = await loaded.getDialogsHistory('cust-1', 'omni-1')

    expect(result).toEqual([])
  })
})


describe('getMediatorHistoryForQuery', () => {
  // mediator кладёт текущее входящее сообщение в историю до /message,
  // craftgpt-у мы передаём вопрос отдельным параметром, и он
  // приклеивает его ещё раз — без trim модель видит вопрос дважды.

  function userEntry(id, text) {
    return {
      is_reply: false,
      msg: { id, message_type: 1, message: { text }, meta: {} },
      reply: null,
    }
  }

  function botEntry(id, text) {
    return {
      is_reply: true,
      msg: null,
      reply: { id, message_type: 1, message: { text }, meta: {} },
    }
  }

  function redirectEntry(id, text) {
    // служебное сообщение маршрутизации ботмедиатора (type 30),
    // приходит как reply → role assistant
    return {
      is_reply: true,
      msg: null,
      reply: { id, message_type: 30, message: { text }, meta: {} },
    }
  }

  function ctxWith(mediatorData) {
    const c = makeDialogCtx()
    c.message.slot_context.filled_slots = [{ slot_id: 'conversation_id', value: 'conv-1', filled_at_ms: 0 }]
    c.axios = { post: vi.fn(() => Promise.resolve({ data: mediatorData })) }
    return loadScript(DIALOG_ONLY, c)
  }

  it('trims trailing user-msg when it matches question', async () => {
    const ctx = ctxWith([
      userEntry('m1', 'привет'),
      botEntry('r1', 'Здравствуйте!'),
      userEntry('m2', 'условия стикера'),
    ])

    const result = await ctx.getMediatorHistoryForQuery('d1', 'условия стикера', 'cust-1', 'omni-1')

    expect(result).toEqual([
      { id: 'm1', type: 1, content: 'привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Здравствуйте!', role: 'assistant' },
    ])
  })

  it('trims trailing question even when followed by type 30 routing messages', async () => {
    const ctx = ctxWith([
      userEntry('m1', 'кардамон'),
      redirectEntry('s1', '/switchredirect aiassist2 кардамон'),
      redirectEntry('s2', '/ack ack ack'),
      redirectEntry('s3', '/switchredirect gpt_ida_qwen кардамон'),
    ])

    const result = await ctx.getMediatorHistoryForQuery('d1', 'кардамон', 'cust-1', 'omni-1')

    expect(result).toEqual([
      { id: 's1', type: 30, content: '/switchredirect aiassist2 кардамон', role: 'assistant' },
      { id: 's2', type: 30, content: '/ack ack ack', role: 'assistant' },
      { id: 's3', type: 30, content: '/switchredirect gpt_ida_qwen кардамон', role: 'assistant' },
    ])
  })

  it('keeps trailing user-msg when it differs from question', async () => {
    const ctx = ctxWith([userEntry('m1', 'другой вопрос')])

    const result = await ctx.getMediatorHistoryForQuery('d1', 'новый вопрос', 'cust-1', 'omni-1')

    expect(result).toEqual([
      { id: 'm1', type: 1, content: 'другой вопрос', role: 'user' },
    ])
  })

  it('keeps history when last entry is assistant', async () => {
    const ctx = ctxWith([
      userEntry('m1', 'вопрос'),
      botEntry('r1', 'ответ'),
    ])

    const result = await ctx.getMediatorHistoryForQuery('d1', 'вопрос', 'cust-1', 'omni-1')

    expect(result).toEqual([
      { id: 'm1', type: 1, content: 'вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'ответ', role: 'assistant' },
    ])
  })

  it('does not trim when question equals last assistant message text', async () => {
    const ctx = ctxWith([
      userEntry('m1', 'вопрос'),
      botEntry('r1', 'ответ'),
    ])

    const result = await ctx.getMediatorHistoryForQuery('d1', 'ответ', 'cust-1', 'omni-1')

    expect(result).toEqual([
      { id: 'm1', type: 1, content: 'вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'ответ', role: 'assistant' },
    ])
  })

  it('returns empty array for empty mediator response', async () => {
    const ctx = ctxWith([])
    expect(await ctx.getMediatorHistoryForQuery('d1', 'q', 'cust-1', 'omni-1')).toEqual([])
  })

  it('returns empty array when mediator call fails', async () => {
    const c = makeDialogCtx()
    c.message.slot_context.filled_slots = [{ slot_id: 'conversation_id', value: 'conv-1', filled_at_ms: 0 }]
    c.axios = { post: vi.fn(() => Promise.reject(new Error('boom'))) }
    const ctx = loadScript(DIALOG_ONLY, c)
    expect(await ctx.getMediatorHistoryForQuery('d1', 'q', 'cust-1', 'omni-1')).toEqual([])
  })
})


describe('escapeHTML / unescapeHTML', () => {
  it('escapes all five HTML-sensitive characters', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    expect(ctx.escapeHTML('<div>"Tom & Jerry\'s"</div>'))
      .toBe('&#60;div&#62;&#34;Tom &#38; Jerry&#39;s&#34;&#60;/div&#62;')
  })

  it('unescapes numeric HTML entities', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    expect(ctx.unescapeHTML('&#60;b&#62;bold&#60;/b&#62;')).toBe('<b>bold</b>')
  })

  it('roundtrip: escapeHTML → unescapeHTML preserves original', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const original = '<div>"Tom & Jerry\'s"</div>'
    expect(ctx.unescapeHTML(ctx.escapeHTML(original))).toBe(original)
  })
})


describe('ResponseFormatter.formatResponse', () => {
  function makeCtxWithPrefix(prefix = '') {
    const ctx = makeDialogCtx()
    ctx.agentSettings.standard_messages = { THINKING_PREFIX: prefix }
    return loadScript(DIALOG_ONLY, ctx)
  }

  it('returns single message for answer without reasoning', () => {
    const ctx = makeCtxWithPrefix()
    expect(ctx.__getLetVar('responseFormatter').formatResponse({ answer: 'Ответ' })).toEqual([
      { text: 'Ответ', meta: {}, isMarkdown: true },
    ])
  })

  it('returns empty array for empty answer', () => {
    const ctx = makeCtxWithPrefix()
    expect(ctx.__getLetVar('responseFormatter').formatResponse({ answer: '' })).toEqual([])
  })

  it('returns reasoning with prefix and escapeHTML', () => {
    const ctx = makeCtxWithPrefix('*Мои размышления:* \n\n')
    const result = ctx.__getLetVar('responseFormatter').formatResponse({
      answer: 'Ответ',
      reasoning: '<b>bold</b>',
    })
    expect(result).toEqual([
      { text: '*Мои размышления:* \n\n&#60;b&#62;bold&#60;/b&#62;', meta: { isThinking: "true" }, isMarkdown: false },
      { text: 'Ответ', meta: {}, isMarkdown: true },
    ])
  })

  it('returns reasoning without prefix when prefix is empty', () => {
    const ctx = makeCtxWithPrefix('')
    const result = ctx.__getLetVar('responseFormatter').formatResponse({
      answer: 'Ответ',
      reasoning: 'thinking',
    })
    expect(result[0].text).toBe('thinking')
  })

  it('returns only reasoning when answer is empty', () => {
    const ctx = makeCtxWithPrefix('PREFIX: ')
    const result = ctx.__getLetVar('responseFormatter').formatResponse({
      answer: '',
      reasoning: 'thinking',
    })
    expect(result).toEqual([
      { text: 'PREFIX: thinking', meta: { isThinking: "true" }, isMarkdown: false },
    ])
  })
})


describe('unformatResponse', () => {
  const THINKING_PREFIX = '*Мои размышления:* \n\n'

  function makeDialogCtxWithPrefix() {
    const ctx = makeDialogCtx()
    ctx.agentSettings.standard_messages = {
      ...ctx.agentSettings.standard_messages,
      THINKING_PREFIX,
    }
    return ctx
  }

  it('passes through regular messages unchanged', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithPrefix())
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    expect(ctx.__getLetVar('responseFormatter').unformatResponse(history)).toEqual(history)
  })

  it('cleans isThinking message: removes prefix and unescapes HTML', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithPrefix())
    const history = [
      { id: 'r1', type: 1, content: `${THINKING_PREFIX}&#60;b&#62;bold&#60;/b&#62;`, role: 'assistant', isThinking: true },
    ]
    const result = ctx.__getLetVar('responseFormatter').unformatResponse(history)
    expect(result[0].content).toBe('<b>bold</b>')
    expect(result[0].isThinking).toBe(true)
    expect(result[0].id).toBe('r1')
  })

  it('cleans isThinking message: plain text without HTML entities', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithPrefix())
    const history = [
      { id: 'r1', type: 1, content: `${THINKING_PREFIX}простой текст`, role: 'assistant', isThinking: true },
    ]
    const result = ctx.__getLetVar('responseFormatter').unformatResponse(history)
    expect(result[0].content).toBe('простой текст')
  })

  it('does not modify meta.reasoning', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithPrefix())
    const history = [
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant', meta: { reasoning: 'raw reasoning' } },
    ]
    const result = ctx.__getLetVar('responseFormatter').unformatResponse(history)
    expect(result[0].meta.reasoning).toBe('raw reasoning')
    expect(result[0].content).toBe('Ответ')
  })

  it('does not mutate input array', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtxWithPrefix())
    const original = `${THINKING_PREFIX}text`
    const history = [
      { id: 'r1', type: 1, content: original, role: 'assistant', isThinking: true },
    ]
    ctx.__getLetVar('responseFormatter').unformatResponse(history)
    expect(history[0].content).toBe(original)
  })
})


describe('prepareHistoryWithReasoning', () => {
  function tool(name, args, callId, result, extra = {}) {
    return {
      type: 'function', name, args, toolCallId: callId,
      result, executed: true, started: false, scenario: null,
      ...extra,
    }
  }
  function commit(commitId, messageId) {
    return { type: 'commit', commitId, replyGptToMessageId: messageId, executed: true }
  }

  it('converts regular messages to normalized format', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })

  it('merges thinking + answer into one message with reasoning field', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'reasoning text', role: 'assistant', isThinking: true },
      { id: 'r2', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ', reasoning: 'reasoning text' },
    ])
  })

  it('handles thinking without following answer (next is user msg)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'r1', type: 1, content: 'reasoning', role: 'assistant', isThinking: true },
      { id: 'm2', type: 1, content: 'Вопрос', role: 'user' },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'assistant', message: '', reasoning: 'reasoning' },
      { role: 'user', message: 'Вопрос' },
    ])
  })

  it('handles thinking at end of history', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'reasoning', role: 'assistant', isThinking: true },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'reasoning' },
    ])
  })

  it('extracts reasoning from meta.reasoning', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant', meta: { reasoning: 'hidden' } },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'assistant', message: 'Ответ', reasoning: 'hidden' },
    ])
  })

  it('inserts tool from RedisQueue after anchor message', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const tools = [
      tool('get_info', {}, 'call_1', 'данные'),
      commit('c1', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{}' } }] },
      { role: 'function', message: 'данные', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })

  it('inserts tool with reasoning from RedisQueue', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const tools = [
      tool('get_info', {}, 'call_1', 'данные', { reasoning: 'надо вызвать тулзу' }),
      commit('c1', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'надо вызвать тулзу',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{}' } }] },
      { role: 'function', message: 'данные', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })

  it('attaches tool to thinking+answer when thinking is present', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'reasoning', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const tools = [
      tool('get_info', {}, 'call_1', 'данные'),
      commit('c1', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'reasoning',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{}' } }] },
      { role: 'function', message: 'данные', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })

  it('handles thinking with tool but no answer (commit not yet executed)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'reasoning', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
    ]
    const tools = [
      tool('get_info', {}, 'call_1', 'данные'),
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: false },
    ]
    // tool_calls включены (LLM должна видеть что вызывала), function results — нет (придут как tool_responses)
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'reasoning',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{}' } }] },
    ])
  })

  it('handles multiple parallel tools in one commit (reasoning on first)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Отследи RA123 и RA456', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const tools = [
      tool('get_tracking', { track: 'RA123' }, 'call_1', 'В пути', { reasoning: 'Нужно отследить оба' }),
      tool('get_tracking', { track: 'RA456' }, 'call_2', 'Доставлена'),
      commit('c1', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Отследи RA123 и RA456' },
      { role: 'assistant', message: '', reasoning: 'Нужно отследить оба',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA123"}' } },
          { id: 'call_2', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA456"}' } },
        ] },
      { role: 'function', message: 'В пути', tool_call_id: 'call_1' },
      { role: 'function', message: 'Доставлена', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })

  it('handles sequential tool calls in same request (same replyGptToMessageId)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Финальный ответ', role: 'assistant' },
    ]
    const tools = [
      tool('step_one', {}, 'call_1', 'result_1', { reasoning: 'Сначала шаг 1' }),
      commit('c1', 'm1'),
      tool('step_two', {}, 'call_2', 'result_2', { reasoning: 'Теперь шаг 2' }),
      commit('c2', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'Сначала шаг 1',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'step_one', arguments: '{}' } }] },
      { role: 'function', message: 'result_1', tool_call_id: 'call_1' },
      { role: 'assistant', message: '', reasoning: 'Теперь шаг 2',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'step_two', arguments: '{}' } }] },
      { role: 'function', message: 'result_2', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Финальный ответ' },
    ])
  })

  it('handles sequential scenarios (replyGptToMessageId already normalized by processScenarios)', () => {
    // processScenarios уже нормализовал replyGptToMessageId — все указывают на m1
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Отследи и найди ОПС', role: 'user' },
      { id: 'r1', type: 1, content: 'Всё нашёл', role: 'assistant' },
    ]
    const tools = [
      tool('track', { n: 'RA123' }, 'call_1', 'В пути', { reasoning: 'Сначала трекинг' }),
      commit('c1', 'm1'),
      tool('ops_search', { idx: '101000' }, 'call_2', 'Москва', { reasoning: 'Теперь ОПС' }),
      commit('c2', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Отследи и найди ОПС' },
      { role: 'assistant', message: '', reasoning: 'Сначала трекинг',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'track', arguments: '{"n":"RA123"}' } }] },
      { role: 'function', message: 'В пути', tool_call_id: 'call_1' },
      { role: 'assistant', message: '', reasoning: 'Теперь ОПС',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'ops_search', arguments: '{"idx":"101000"}' } }] },
      { role: 'function', message: 'Москва', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Всё нашёл' },
    ])
  })

  it('handles sequential scenarios with mixed reasoning sources', () => {
    // Первый вызов: reasoning из isThinking (SHOW_THINKING=true)
    // Второй вызов: reasoning из meta (SHOW_THINKING=false)
    // Третий вызов: reasoning из toolQueue (SHOW_THINKING=false, no answer)
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'msg-001', type: 1, content: 'Сделай три вещи', role: 'user' },
      // visible thinking для первого вызова
      { id: 'r1', type: 1, content: 'visible reasoning', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      // ответ с reasoning в meta для второго вызова
      { id: 'r2', type: 1, content: 'Промежуточный ответ', role: 'assistant', meta: { reasoning: 'meta reasoning', commitId: 'c2' } },
      // финальный ответ
      { id: 'r3', type: 1, content: 'Готово', role: 'assistant' },
    ]
    const tools = [
      tool('step_one', {}, 'call_1', 'res_1'),
      commit('c1', 'msg-001'),
      tool('step_two', {}, 'call_2', 'res_2'),
      commit('c2', 'msg-001'),
      tool('step_three', {}, 'call_3', 'res_3', { reasoning: 'queue reasoning' }),
      commit('c3', 'msg-001'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Сделай три вещи' },
      { role: 'assistant', message: '', reasoning: 'visible reasoning',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'step_one', arguments: '{}' } }] },
      { role: 'function', message: 'res_1', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Промежуточный ответ', reasoning: 'meta reasoning',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'step_two', arguments: '{}' } }] },
      { role: 'function', message: 'res_2', tool_call_id: 'call_2' },
      { role: 'assistant', message: '', reasoning: 'queue reasoning',
        tool_calls: [{ id: 'call_3', type: 'function', function: { name: 'step_three', arguments: '{}' } }] },
      { role: 'function', message: 'res_3', tool_call_id: 'call_3' },
      { role: 'assistant', message: 'Готово' },
    ])
  })

  it('handles visible thinking with multiple parallel tools', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'thinking', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
    ]
    const tools = [
      tool('tool_a', {}, 'call_1', 'res_a'),
      tool('tool_b', {}, 'call_2', 'res_b'),
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: false },
    ]
    // tool_calls включены, function results — нет (non-executed commit)
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'thinking',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'tool_b', arguments: '{}' } },
        ] },
    ])
  })

  it('handles visible thinking with sequential tool calls (two commits)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'thinking 1', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'thinking 2', role: 'assistant', isThinking: true, meta: { commitId: 'c2' } },
      { id: 'r3', type: 1, content: 'Финал', role: 'assistant' },
    ]
    const tools = [
      tool('step_one', {}, 'call_1', 'res_1'),
      commit('c1', 'm1'),
      tool('step_two', {}, 'call_2', 'res_2'),
      commit('c2', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'thinking 1',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'step_one', arguments: '{}' } }] },
      { role: 'function', message: 'res_1', tool_call_id: 'call_1' },
      { role: 'assistant', message: '', reasoning: 'thinking 2',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'step_two', arguments: '{}' } }] },
      { role: 'function', message: 'res_2', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Финал' },
    ])
  })

  it('handles tool call with explicit answer and reasoning', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'thinking', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'Сейчас поищу', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 'r3', type: 1, content: 'Вот результат', role: 'assistant' },
    ]
    const tools = [
      tool('search', { q: 'test' }, 'call_1', 'found'),
      commit('c1', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: 'Сейчас поищу', reasoning: 'thinking',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"test"}' } }] },
      { role: 'function', message: 'found', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Вот результат' },
    ])
  })

  it('handles tool call with explicit answer but no reasoning', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Сейчас поищу', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'Вот результат', role: 'assistant' },
    ]
    const tools = [
      tool('search', { q: 'test' }, 'call_1', 'found'),
      commit('c1', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: 'Сейчас поищу',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"test"}' } }] },
      { role: 'function', message: 'found', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Вот результат' },
    ])
  })

  it('handles tool calls without reasoning in longer dialog', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Первый', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ 1', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 'm2', type: 1, content: 'Второй', role: 'user' },
      { id: 'r2', type: 1, content: 'Ответ 2', role: 'assistant' },
      { id: 'm3', type: 1, content: 'Третий', role: 'user' },
      { id: 'r3', type: 1, content: 'Ответ 3', role: 'assistant', meta: { commitId: 'c2' } },
    ]
    const tools = [
      tool('tool_a', {}, 'call_1', 'res_a'),
      commit('c1', 'm1'),
      tool('tool_b', {}, 'call_2', 'res_b'),
      commit('c2', 'm3'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Первый' },
      { role: 'assistant', message: 'Ответ 1',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: '{}' } }] },
      { role: 'function', message: 'res_a', tool_call_id: 'call_1' },
      { role: 'user', message: 'Второй' },
      { role: 'assistant', message: 'Ответ 2' },
      { role: 'user', message: 'Третий' },
      { role: 'assistant', message: 'Ответ 3',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'tool_b', arguments: '{}' } }] },
      { role: 'function', message: 'res_b', tool_call_id: 'call_2' },
    ])
  })

  it('handles full dialog with all reasoning variants mixed', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      // 1. reasoning в meta (SHOW_THINKING=false, без тулзов)
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Здравствуйте!', role: 'assistant', meta: { reasoning: 'приветствие' } },
      // 2. visible thinking + tool call + answer
      { id: 'm2', type: 1, content: 'Найди инфо', role: 'user' },
      { id: 'r2', type: 1, content: 'надо поискать', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      { id: 'r3', type: 1, content: 'Вот что нашёл', role: 'assistant' },
      // 3. обычный ответ без reasoning + tool с reasoning в очереди
      { id: 'm3', type: 1, content: 'Спасибо', role: 'user' },
      { id: 'r4', type: 1, content: 'Рад помочь', role: 'assistant', meta: { commitId: 'c2' } },
      { id: 'r5', type: 1, content: 'Отзыв сохранён!', role: 'assistant' },
    ]
    const tools = [
      // tool на второе сообщение
      tool('search', { q: 'инфо' }, 'call_1', 'результат'),
      commit('c1', 'm2'),
      // tool на третье сообщение с reasoning в очереди
      tool('feedback', { text: 'ok' }, 'call_2', 'saved', { reasoning: 'сохраню отзыв' }),
      commit('c2', 'm3'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Здравствуйте!', reasoning: 'приветствие' },
      { role: 'user', message: 'Найди инфо' },
      { role: 'assistant', message: '', reasoning: 'надо поискать',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"инфо"}' } }] },
      { role: 'function', message: 'результат', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Вот что нашёл' },
      { role: 'user', message: 'Спасибо' },
      { role: 'assistant', message: 'Рад помочь', reasoning: 'сохраню отзыв',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'feedback', arguments: '{"text":"ok"}' } }] },
      { role: 'function', message: 'saved', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Отзыв сохранён!' },
    ])
  })

  it('handles tool call with explicit answer and reasoning in meta', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Сейчас поищу', role: 'assistant', meta: { reasoning: 'hidden thinking', commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'Вот результат', role: 'assistant' },
    ]
    const tools = [
      tool('search', { q: 'test' }, 'call_1', 'found'),
      commit('c1', 'm1'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: 'Сейчас поищу', reasoning: 'hidden thinking',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"test"}' } }] },
      { role: 'function', message: 'found', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Вот результат' },
    ])
  })

  it('handles commitId in history but tools missing from queue (thinking+answer)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'thinking', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'Ответ', role: 'assistant', meta: { commitId: 'c1' } },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: 'Ответ', reasoning: 'thinking' },
    ])
  })

  it('handles commitId in history but tools missing (thinking only)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'thinking', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'thinking' },
    ])
  })

  it('handles commitId in history but tools missing (thinking + final answer without commitId)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'thinking', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'Финальный ответ', role: 'assistant' },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual([
      { role: 'user', message: 'Вопрос' },
      { role: 'assistant', message: '', reasoning: 'thinking' },
      { role: 'assistant', message: 'Финальный ответ' },
    ])
  })

  it('handles two tool groups on different user messages (after processScenarios)', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Первый', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ 1', role: 'assistant' },
      { id: 'm2', type: 1, content: 'Второй', role: 'user' },
      { id: 'r2', type: 1, content: 'Ответ 2', role: 'assistant' },
    ]
    const tools = [
      tool('tool_a', {}, 'call_1', 'res_a'),
      commit('c1', 'm1'),
      tool('tool_b', {}, 'call_2', 'res_b'),
      commit('c2', 'm2'),
    ]
    expect(ctx.prepareHistoryWithReasoning(history, tools)).toEqual([
      { role: 'user', message: 'Первый' },
      { role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: '{}' } }] },
      { role: 'function', message: 'res_a', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Ответ 1' },
      { role: 'user', message: 'Второй' },
      { role: 'assistant', message: '',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'tool_b', arguments: '{}' } }] },
      { role: 'function', message: 'res_b', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Ответ 2' },
    ])
  })

  it('handles empty and null tool queue', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const expected = [
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ' },
    ]
    expect(ctx.prepareHistoryWithReasoning(history, [])).toEqual(expected)
    expect(ctx.prepareHistoryWithReasoning(history, null)).toEqual(expected)
  })

  it('returns empty array for null history', () => {
    const ctx = loadScript(DIALOG_ONLY, makeDialogCtx())
    expect(ctx.prepareHistoryWithReasoning(null, [])).toEqual([])
  })

  it('excludes tool group when commit has executed=false', () => {
    const ctx = loadScript(DIALOG_WITH_QWEN, makeDialogCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ 1', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 'm2', type: 1, content: 'Ещё вопрос', role: 'user' },
      { id: 'r2', type: 1, content: 'Ответ 2', role: 'assistant', meta: { commitId: 'c2' } },
    ]
    const toolQueue = [
      // Предыдущий батч — executed
      tool('search', { q: 'a' }, 'call-1', 'result-1'),
      commit('c1', 'm1'),
      // Текущий батч — committed but NOT executed
      tool('search', { q: 'b' }, 'call-2', 'result-2'),
      { type: 'commit', commitId: 'c2', replyGptToMessageId: 'm2', executed: false },
    ]

    const result = ctx.prepareHistoryWithReasoning(history, toolQueue)

    // Первый батч (executed commit) — tool_calls и function results включены
    const funcMessages = result.filter(m => m.tool_call_id)
    expect(funcMessages).toHaveLength(1)
    expect(funcMessages[0].message).toBe('result-1')

    // Текущий батч (non-executed commit) — tool_calls включены, function results нет
    const currentAssistant = result.find(m => m.tool_calls?.some(tc => tc.id === 'call-2'))
    expect(currentAssistant).toBeDefined()
    expect(result.find(m => m.tool_call_id === 'call-2')).toBeUndefined()
  })
})


describe('getArrayFromInsertPosition', () => {
  it('returns [index, ...rest] starting from first element > index', () => {
    const ctx = loadScript(DIALOG_WITH_QWEN, makeDialogCtx())
    expect(ctx.getArrayFromInsertPosition([3, 7, 12], 5)).toEqual([5, 7, 12])
  })

  it('returns [index] when no elements > index', () => {
    const ctx = loadScript(DIALOG_WITH_QWEN, makeDialogCtx())
    expect(ctx.getArrayFromInsertPosition([3, 7, 12], 20)).toEqual([20])
  })

  it('does not duplicate when index equals an element', () => {
    const ctx = loadScript(DIALOG_WITH_QWEN, makeDialogCtx())
    expect(ctx.getArrayFromInsertPosition([3, 7, 12], 7)).toEqual([7, 12])
  })

  it('handles empty array', () => {
    const ctx = loadScript(DIALOG_WITH_QWEN, makeDialogCtx())
    expect(ctx.getArrayFromInsertPosition([], 5)).toEqual([5])
  })
})


describe('buildLLMHistory', () => {
  const ROUTE = '/switchredirect test-agent'
  const DIALOG_WITH_DEFAULT_AND_TOOLS_LOOP = [
    'modules/core/10_globals.js',
    'modules/core/20_http.js',
    'modules/core/30_dialog.js',
    'modules/core/55_slots.js',
    'modules/core/70_tools_loop.js',
    'modules/models/default.js',
  ]

  it('converts mediator history to craftgpt format when toolQueue is empty', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Здравствуйте!', role: 'assistant', meta: { commitId: 'c1' } },
    ]

    const processed = ctx.processScenarios(mediatorHistory, [], ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Здравствуйте!' },
    ])
  })

  it('excludes debug messages from LLM history', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Hello', role: 'user' },
      { id: 'd1', type: 1, content: '```\nsome debug info\n```', role: 'assistant', meta: { debug: true } },
      { id: 'r1', type: 1, content: 'Hi there', role: 'assistant', meta: { commitId: 'c1' } },
    ]
    const processed = ctx.processScenarios(mediatorHistory, [], ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)
    expect(result).toEqual([
      { role: 'user', message: 'Hello' },
      { role: 'assistant', message: 'Hi there' },
    ])
  })

  it('excludes references messages from LLM history', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Где почитать?', role: 'user' },
      { id: 'r1', type: 1, content: 'В этой статье всё есть', role: 'assistant' },
      { id: 'ref1', type: 1, content: '### Ссылки для информации:\n\n*  [Статья](url)', role: 'assistant', meta: { references: true } },
    ]
    const processed = ctx.processScenarios(mediatorHistory, [], ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)
    expect(result).toEqual([
      { role: 'user', message: 'Где почитать?' },
      { role: 'assistant', message: 'В этой статье всё есть' },
    ])
  })

  it('filters multiple debug messages across conversation turns', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'First question', role: 'user' },
      { id: 'd1', type: 1, content: '```\ndebug1\n```', role: 'assistant', meta: { debug: true } },
      { id: 'r1', type: 1, content: 'First answer', role: 'assistant' },
      { id: 'm2', type: 1, content: 'Second question', role: 'user' },
      { id: 'd2', type: 1, content: '```\ndebug2\n```', role: 'assistant', meta: { debug: true } },
      { id: 'd3', type: 1, content: '```\ndebug3\n```', role: 'assistant', meta: { debug: true } },
      { id: 'r2', type: 1, content: 'Second answer', role: 'assistant' },
    ]
    const processed = ctx.processScenarios(mediatorHistory, [], ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)
    expect(result).toEqual([
      { role: 'user', message: 'First question' },
      { role: 'assistant', message: 'First answer' },
      { role: 'user', message: 'Second question' },
      { role: 'assistant', message: 'Second answer' },
    ])
  })

  it('returns empty array for null/empty history', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    // null history пропускает processScenarios (как в реальном коде)
    expect(ctx.buildLLMHistory(null, [])).toBeNull()
    const p = ctx.processScenarios([], [], ROUTE)
    expect(ctx.buildLLMHistory(p.history, p.tools)).toEqual([])
  })

  it('inserts tool_calls for a single tool call', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи посылку RA123', role: 'user' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA123' },
        toolCallId: 'call_1', result: 'В пути, ожидается 05.04',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи посылку RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA123"}' } }],
      },
      { role: 'function', message: 'В пути, ожидается 05.04', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Посылка в пути' },
    ])
  })

  it('inserts tool_calls for different messages in correct positions', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'r1', type: 1, content: 'В пути', role: 'assistant' },
      { id: 'm2', type: 1, content: 'А что с RA456?', role: 'user' },
      { id: 'r2', type: 1, content: 'Доставлена', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA123' },
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA456' },
        toolCallId: 'call_2', result: 'Доставлена',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c2', replyGptToMessageId: 'm2', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      { role: 'assistant', message: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA123"}' } }] },
      { role: 'function', message: 'В пути', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'В пути' },
      { role: 'user', message: 'А что с RA456?' },
      { role: 'assistant', message: '', tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA456"}' } }] },
      { role: 'function', message: 'Доставлена', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Доставлена' },
    ])
  })

  it('groups multiple tool_calls for the same message', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123 и RA456', role: 'user' },
      { id: 'r1', type: 1, content: 'Обе в пути', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA123' },
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: false, scenario: null,
      },
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA456' },
        toolCallId: 'call_2', result: 'В пути, задержка',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123 и RA456' },
      {
        role: 'assistant', message: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA123"}' } },
          { id: 'call_2', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA456"}' } },
        ],
      },
      { role: 'function', message: 'В пути', tool_call_id: 'call_1' },
      { role: 'function', message: 'В пути, задержка', tool_call_id: 'call_2' },
      { role: 'assistant', message: 'Обе в пути' },
    ])
  })

  it('skips tools with replyGptToMessageId not found in history', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Здравствуйте!', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA123' },
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'nonexistent', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Здравствуйте!' },
    ])
  })

  it('ignores non-executed tools', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ок', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_info', args: {},
        toolCallId: 'call_1', result: null,
        executed: false, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ок' },
    ])
  })

  it('does not mutate the input mediatorHistory array', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ок', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_info', args: {},
        toolCallId: 'call_1', result: 'done',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const originalLength = mediatorHistory.length
    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    ctx.buildLLMHistory(processed.history, processed.tools)

    expect(mediatorHistory).toHaveLength(originalLength)
  })

  it('handles scenario tools: packs scenario messages as function result, excludes from history', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      // switchredirect на сценарий трекинга
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      // сценарные сообщения
      { id: 's1', type: 1, content: 'Трек-номер принят', role: 'assistant' },
      { id: 's2', type: 1, content: 'Статус: в пути', role: 'assistant' },
      // switchredirect обратно на наш агент
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      // финальный ответ бота
      { id: 'r1', type: 1, content: 'Ваша посылка в пути', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [
            { actor: 'assistant', utterance: 'Трек-номер принят' },
            { actor: 'assistant', utterance: 'Статус: в пути' },
          ],
          scenario_result: 'Done',
        }),
      },
      { role: 'assistant', message: 'Ваша посылка в пути' },
    ])
  })

  it('handles scenario tool with user messages and nested switchredirects inside', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      // switchredirect на сценарий (с аргументами)
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      // сценарные сообщения — бот, пользователь, вложенный switchredirect
      { id: 's1', type: 1, content: 'Введите трек-номер', role: 'assistant' },
      { id: 's2', type: 1, content: 'RA123', role: 'user' },
      { id: 'sw_inner', type: 30, content: '/switchredirect tracking_service', role: 'assistant' },
      { id: 's3', type: 1, content: 'Статус: в пути', role: 'assistant' },
      // switchredirect обратно на наш агент
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Ваша посылка в пути', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [
            { actor: 'assistant', utterance: 'Введите трек-номер' },
            { actor: 'user', utterance: 'RA123' },
            { actor: 'assistant', utterance: 'Статус: в пути' },
          ],
          scenario_result: 'Done',
        }),
      },
      { role: 'assistant', message: 'Ваша посылка в пути' },
    ])
  })

  it('handles multiple scenario calls in one dialog', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'В пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
      { id: 'm2', type: 1, content: 'Найди ОПС 101000', role: 'user' },
      { id: 'sw3', type: 30, content: '/switchredirect aiassist2 intent_id="start_ops"', role: 'assistant' },
      { id: 's2', type: 1, content: 'Москва, Главпочтамт', role: 'assistant' },
      { id: 'sw4', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r2', type: 1, content: 'Нашёл отделение', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
      {
        type: 'function', name: 'transfer_to_ops_search',
        args: { ops_index: '101000' },
        toolCallId: 'call_2', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c2', replyGptToMessageId: 'm2', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({ scenario_dialogue: [{ actor: 'assistant', utterance: 'В пути' }], scenario_result: 'Done' }),
      },
      { role: 'assistant', message: 'Посылка в пути' },
      { role: 'user', message: 'Найди ОПС 101000' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'transfer_to_ops_search', arguments: '{"ops_index":"101000"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_2',
        message: JSON.stringify({ scenario_dialogue: [{ actor: 'assistant', utterance: 'Москва, Главпочтамт' }], scenario_result: 'Done' }),
      },
      { role: 'assistant', message: 'Нашёл отделение' },
    ])
  })

  it('handles scenario that just returned — agent has not replied yet', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Трек-номер принят', role: 'assistant' },
      { id: 's2', type: 1, content: 'Статус: в пути', role: 'assistant' },
      // switchredirect обратно — история заканчивается, наш агент ещё не ответил
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [
            { actor: 'assistant', utterance: 'Трек-номер принят' },
            { actor: 'assistant', utterance: 'Статус: в пути' },
          ],
          scenario_result: 'Done',
        }),
      },
    ])
  })

  it('handles thinking messages from mediator history (Qwen)', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: '*Мои размышления:* \n\nreasoning text', role: 'assistant', isThinking: true },
      { id: 'r2', type: 1, content: 'Ответ', role: 'assistant' },
    ]

    const processed = ctx.processScenarios(mediatorHistory, [], ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: '<think>\nreasoning text\n</think>\n\nОтвет' },
    ])
  })

  it('handles reasoning in meta (Qwen, SHOW_THINKING=false)', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant', meta: { reasoning: 'hidden reasoning' } },
    ]

    const processed = ctx.processScenarios(mediatorHistory, [], ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: '<think>\nhidden reasoning\n</think>\n\nОтвет' },
    ])
  })

  it('handles reasoning from tool queue (SHOW_THINKING=false, tool_calls case)', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA123' },
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: false, scenario: null,
        reasoning: 'Пользователь хочет отследить посылку',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant',
        message: '<think>\nПользователь хочет отследить посылку\n</think>\n\n',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA123"}' } }],
      },
      { role: 'function', message: 'В пути', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Посылка в пути' },
    ])
  })

  it('handles tools without reasoning (Qwen, no thinking in response)', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Покажи инфо', role: 'user' },
      { id: 'r1', type: 1, content: 'Вот информация', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_info', args: {},
        toolCallId: 'call_1', result: 'данные',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Покажи инфо' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{}' } }],
      },
      { role: 'function', message: 'данные', tool_call_id: 'call_1' },
      { role: 'assistant', message: 'Вот информация' },
    ])
  })

  it('handles tools with thinking shown (SHOW_THINKING=true, thinking + answer)', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'r1', type: 1, content: '*Мои размышления:* \n\nНужно вызвать трекинг', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
      { id: 'r2', type: 1, content: 'Проверяю статус посылки', role: 'assistant', meta: { commitId: 'c1' } },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA123' },
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      { role: 'assistant', message: '<think>\nНужно вызвать трекинг\n</think>\n\nПроверяю статус посылки',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA123"}' } }],
      },
      { role: 'function', message: 'В пути', tool_call_id: 'call_1' },
    ])
  })

  it('handles tools with only thinking shown (SHOW_THINKING=true, no answer)', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'r1', type: 1, content: '*Мои размышления:* \n\nНужно вызвать трекинг', role: 'assistant', isThinking: true, meta: { commitId: 'c1' } },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_tracking', args: { track: 'RA123' },
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: false, scenario: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      { role: 'assistant', message: '<think>\nНужно вызвать трекинг\n</think>\n\n',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_tracking', arguments: '{"track":"RA123"}' } }],
      },
      { role: 'function', message: 'В пути', tool_call_id: 'call_1' },
    ])
  })

  it('excludes thinking messages for default model', () => {
    const ctx = loadScript(DIALOG_WITH_DEFAULT_AND_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'reasoning', role: 'assistant', isThinking: true },
      { id: 'r2', type: 1, content: 'Ответ', role: 'assistant' },
    ]

    const processed = ctx.processScenarios(mediatorHistory, [], ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })

  it('handles mix of regular and scenario tools for the same message', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123 и покажи инфо', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'В пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Вот информация', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_info', args: { q: 'info' },
        toolCallId: 'call_1', result: 'Данные о клиенте',
        executed: true, started: false, scenario: null,
      },
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_2', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123 и покажи инфо' },
      {
        role: 'assistant', message: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{"q":"info"}' } },
          { id: 'call_2', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } },
        ],
      },
      { role: 'function', message: 'Данные о клиенте', tool_call_id: 'call_1' },
      {
        role: 'function', tool_call_id: 'call_2',
        message: JSON.stringify({ scenario_dialogue: [{ actor: 'assistant', utterance: 'В пути' }], scenario_result: 'Done' }),
      },
      { role: 'assistant', message: 'Вот информация' },
    ])
  })

  it('handles scenario with result from slot', () => {
    // scenario(slotName) — результат сценария записывается в слот,
    // затем читается через getScenarioAnswer и попадает в result очереди.
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Трек принят', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Посылка доставлена', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1',
        result: 'Доставлена 01.04.2026',  // значение из слота scenario_result
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [{ actor: 'assistant', utterance: 'Трек принят' }],
          scenario_result: 'Доставлена 01.04.2026',
        }),
      },
      { role: 'assistant', message: 'Посылка доставлена' },
    ])
  })

  it('does not apply unformatResponse to scenario messages', () => {
    const ctx = loadScript(DIALOG_WITH_TOOLS_LOOP, makeDialogCtxWithToolsLoop())

    // Другой агент отправил thinking-сообщение с isThinking.
    // Оно содержит HTML-entities (&#60;) как часть контента,
    // а не как артефакт нашего escapeHTML.
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи посылку', role: 'user' },
      { id: 'r1', type: 1, content: '', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 's1', type: 30, content: '/switchredirect other_agent' },
      { id: 's2', type: 1, content: 'Статус: &#60;в пути&#62;', role: 'assistant', isThinking: true },
      { id: 's3', type: 1, content: 'Посылка в пути', role: 'assistant' },
      { id: 's4', type: 30, content: '/switchredirect test-agent' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'track', args: {},
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: true, scenario: 'result_slot',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, '/switchredirect test-agent')
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    // scenario_dialogue должен содержать ОРИГИНАЛЬНЫЙ контент,
    // без применения unescapeHTML (&#60; должен остаться &#60;, а не стать <)
    const funcMsg = result.find(m => m.tool_call_id === 'call_1')
    const parsed = JSON.parse(funcMsg.message)
    expect(parsed.scenario_dialogue).toEqual([
      { actor: 'assistant', utterance: 'Статус: &#60;в пути&#62;' },
      { actor: 'assistant', utterance: 'Посылка в пути' },
    ])
  })

})
