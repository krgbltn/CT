// Mock-сервер для e2e-тестов: botmediator + contextsearch.
// Порт 9999 по умолчанию. Craftgpt (LLM) — реальный, не мокается.
//
// Контракт endpoint-ов повторяет llm-evalkit/experiments/jsagent_common/mock_server.py
// плюс два дополнения:
//   - POST /mediator/customers/.../agents/choose возвращает тела модулей (core, qwen)
//   - POST /test/setSlots/:dialogId для сценариев — подготовить filled_slots к turn 2
//
// /api/send-message/send-message строго проверяет типы как реальный botmediator
// (F# SendMessageRequest + System.Text.Json). Невалидные тела отдают 400
// и пишутся в state.failedRequests[dialogId] — тесты могут это проверить.

import express from 'express'

function createState() {
  return {
    // per-dialog state
    replies: new Map(),                // dialogId -> [reply, ...]
    history: new Map(),                // dialogId -> [mediatorEntry, ...]
    contextsearchCalls: new Map(),     // dialogId -> [requestBody, ...]
    scenarioSearchCalls: new Map(),    // dialogId -> [requestBody, ...]
    getHistoryCalls: new Map(),        // dialogId -> count of GET /webhooks/mediator/messages
    getDialogIdCalls: new Map(),       // dialogId -> count of GET /mediator/get_dialog_id
    getLinkedHistoryCalls: new Map(),  // activeDialogId -> [{DialogIds, OmniUserId, Count}, ...] (POST /mediator/user_messages_history)
    failedRequests: new Map(),         // dialogId -> [{body, errors, timestamp}, ...]
    // per-test FIFO queues
    contextsearchQueue: [],
    scenarioSearchQueue: [],
    // last-set dialog (used for capturing replies when the agent doesn't echo dialog_id in sendMessage)
    currentDialogId: null,
    // agent registry: agentId -> Pair[] (for modules fetched via /agents/choose)
    modules: new Map(),
  }
}

// Возвращает map field-path → [error, ...] или null, если всё ок.
// Типы — как в F# SendMessageRequest: ProjectId/MessageMarkdown обязательны,
// FilledSlots/Meta — Dictionary<string, string> (boolean/число отвергаются).
function validateSendMessageRequest(body) {
  const errors = {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors['$'] = ['Request body must be a JSON object.']
    return errors
  }
  if (typeof body.MessageMarkdown !== 'string' || body.MessageMarkdown.length === 0) {
    errors['$.MessageMarkdown'] = ['The MessageMarkdown field is required.']
  }
  const p = body.SendMessageParams
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    errors['$.SendMessageParams'] = ['The SendMessageParams field is required.']
    return errors
  }
  if (typeof p.ProjectId !== 'string' || p.ProjectId.length === 0) {
    errors['$.SendMessageParams.ProjectId'] = ['The ProjectId field is required.']
  }
  if (p.OmniUserId != null && typeof p.OmniUserId !== 'string') {
    errors['$.SendMessageParams.OmniUserId'] =
      [`The JSON value of type ${typeof p.OmniUserId} could not be converted to System.String.`]
  }
  if (p.DestinationChannel != null) {
    if (typeof p.DestinationChannel !== 'object' || Array.isArray(p.DestinationChannel)) {
      errors['$.SendMessageParams.DestinationChannel'] =
        ['The JSON value could not be converted to ChannelInfo.']
    } else {
      const ch = p.DestinationChannel
      if (typeof ch.ChannelId !== 'string') {
        errors['$.SendMessageParams.DestinationChannel.ChannelId'] =
          [`The JSON value of type ${typeof ch.ChannelId} could not be converted to System.String.`]
      }
      if (typeof ch.ChannelUserId !== 'string') {
        errors['$.SendMessageParams.DestinationChannel.ChannelUserId'] =
          [`The JSON value of type ${typeof ch.ChannelUserId} could not be converted to System.String.`]
      }
    }
  }
  for (const field of ['FilledSlots', 'Meta']) {
    const dict = p[field]
    if (dict == null) continue
    if (typeof dict !== 'object' || Array.isArray(dict)) {
      errors[`$.SendMessageParams.${field}`] =
        ['The JSON value could not be converted to System.Collections.Generic.Dictionary`2[System.String,System.String].']
      continue
    }
    // System.Text.Json допускает null в Dictionary<string, string> (string в .NET nullable).
    // boolean/число не приводятся к string — отвергаем как реальный botmediator.
    for (const [k, v] of Object.entries(dict)) {
      if (v !== null && typeof v !== 'string') {
        errors[`$.SendMessageParams.${field}.${k}`] =
          [`The JSON value of type ${typeof v} could not be converted to System.String.`]
      }
    }
  }
  return Object.keys(errors).length > 0 ? errors : null
}

// ASP.NET-style ProblemDetails (то, что возвращает botmediator при ошибке десериализации).
function validationProblemDetails(errors) {
  return {
    type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
    title: 'One or more validation errors occurred.',
    status: 400,
    errors,
    traceId: '00-mock-trace-00',
  }
}

export function createMockServer({ modules = {} } = {}) {
  const app = express()
  app.use(express.json({ limit: '50mb' }))

  const state = createState()
  // preload modules: { 'module:core': [{n, v}, ...], 'module:qwen': [...] }
  for (const [id, params] of Object.entries(modules)) {
    state.modules.set(id, params)
  }

  function ensureDialog(dialogId) {
    if (!state.replies.has(dialogId)) state.replies.set(dialogId, [])
    if (!state.history.has(dialogId)) state.history.set(dialogId, [])
    if (!state.contextsearchCalls.has(dialogId)) state.contextsearchCalls.set(dialogId, [])
    if (!state.scenarioSearchCalls.has(dialogId)) state.scenarioSearchCalls.set(dialogId, [])
    if (!state.getHistoryCalls.has(dialogId)) state.getHistoryCalls.set(dialogId, 0)
    if (!state.getDialogIdCalls.has(dialogId)) state.getDialogIdCalls.set(dialogId, 0)
    if (!state.getLinkedHistoryCalls.has(dialogId)) state.getLinkedHistoryCalls.set(dialogId, [])
    if (!state.failedRequests.has(dialogId)) state.failedRequests.set(dialogId, [])
  }

  // ── service endpoints ──────────────────────────────────────

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.post('/test/setup', (req, res) => {
    const { dialogId, history = [], contextsearchResponses = [], scenarioSearchResponses = [] } = req.body
    state.currentDialogId = dialogId
    ensureDialog(dialogId)
    state.history.set(dialogId, history)
    state.replies.set(dialogId, [])
    state.contextsearchCalls.set(dialogId, [])
    state.scenarioSearchCalls.set(dialogId, [])
    state.failedRequests.set(dialogId, [])
    state.contextsearchQueue = [...contextsearchResponses]
    state.scenarioSearchQueue = [...scenarioSearchResponses]
    state.getHistoryCalls.set(dialogId, 0)
    state.getDialogIdCalls.set(dialogId, 0)
    state.getLinkedHistoryCalls.set(dialogId, [])
    res.json({ ok: true })
  })

  app.get('/test/replies/:dialogId', (req, res) => {
    const d = req.params.dialogId
    res.json({
      replies: state.replies.get(d) ?? [],
      history: state.history.get(d) ?? [],
      contextsearchCalls: state.contextsearchCalls.get(d) ?? [],
      scenarioSearchCalls: state.scenarioSearchCalls.get(d) ?? [],
      getHistoryCalls: state.getHistoryCalls.get(d) ?? 0,
      getDialogIdCalls: state.getDialogIdCalls.get(d) ?? 0,
      getLinkedHistoryCalls: state.getLinkedHistoryCalls.get(d) ?? [],
      failedRequests: state.failedRequests.get(d) ?? [],
    })
  })

  app.post('/test/clear/:dialogId', (req, res) => {
    const d = req.params.dialogId
    state.replies.delete(d)
    state.history.delete(d)
    state.contextsearchCalls.delete(d)
    state.scenarioSearchCalls.delete(d)
    state.failedRequests.delete(d)
    res.json({ ok: true })
  })

  app.post('/test/appendHistory/:dialogId', (req, res) => {
    const d = req.params.dialogId
    ensureDialog(d)
    const entries = Array.isArray(req.body) ? req.body : [req.body]
    state.history.get(d).push(...entries)
    res.json({ ok: true })
  })

  // ── botmediator: sendMessage (captures agent replies) ──────

  app.post('/api/send-message/send-message', (req, res) => {
    const dialogId = state.currentDialogId ?? 'unknown'
    ensureDialog(dialogId)

    // Строгая валидация — как у реального botmediator (System.Text.Json + F#).
    // Невалидные тела возвращают 400, jsagent превращает их в AxiosError 400.
    const validationErrors = validateSendMessageRequest(req.body)
    if (validationErrors) {
      state.failedRequests.get(dialogId).push({
        body: req.body,
        errors: validationErrors,
        timestamp: Date.now(),
      })
      return res.status(400).json(validationProblemDetails(validationErrors))
    }

    const messageId = cryptoUuid()
    const params = req.body.SendMessageParams
    const reply = {
      MessageMarkdown: req.body.MessageMarkdown,
      MessageId: messageId,
      DialogId: dialogId,
      SendMessageParams: params,
    }
    state.replies.get(dialogId).push(reply)
    // Зеркалим bot-реплику в историю диалога в формате mediator-а:
    // getDialog() в core ожидает [{msg|reply: {id, message_type, message: {text}, meta}}]
    state.history.get(dialogId).push({
      reply: {
        id: messageId,
        message_type: 19,
        message: { text: reply.MessageMarkdown, text_type: 'Markdown' },
        meta: params.Meta ?? {},
      },
    })
    // SendMessageResponse: { Success, Result: SendMessageResult option, Errors: string[] option }
    res.json({
      Success: true,
      Result: {
        MessageId: messageId,
        DialogId: dialogId,
        ChannelId: params.DestinationChannel?.ChannelId ?? '',
        OmniUserId: params.OmniUserId ?? '',
      },
      Errors: null,
    })
  })

  // ── botmediator: ack/post reply ────────────────────────────

  app.post('/webhooks/mediator', (_req, res) => res.json({ ok: true }))

  // ── botmediator: history ───────────────────────────────────

  app.get('/webhooks/mediator/messages', (req, res) => {
    const d = req.query.dialog_id ?? ''
    state.getHistoryCalls.set(d, (state.getHistoryCalls.get(d) ?? 0) + 1)
    res.json(state.history.get(d) ?? [])
  })

  // POST /mediator/user_messages_history — батч-получение сообщений
  // прошлых (linked) диалогов пользователя.
  // Реальный эндпоинт (BotMediatorController.fs:467, MessagesHistoryRequest
  // в BotMediator.Api/Types.fs:86) принимает {DialogIds, OmniUserId,
  // StartTime, EndTime, Count} и возвращает HistoryRecord[],
  // отсортированный newest-first по timestamp кросс-диалогно.
  // В моке у нас нет реальных timestamp — приближаем: считаем, что
  // вызывающая сторона передаёт DialogIds в oldest-first порядке,
  // реверсим порядок диалогов и сообщения внутри каждого.
  app.post('/mediator/user_messages_history', (req, res) => {
    const body = req.body ?? {}
    const ids = Array.isArray(body.DialogIds) ? body.DialogIds : []
    const activeId = state.currentDialogId ?? ''
    const calls = state.getLinkedHistoryCalls.get(activeId) ?? []
    calls.push({
      DialogIds: ids,
      OmniUserId: body.OmniUserId,
      Count: body.Count,
    })
    state.getLinkedHistoryCalls.set(activeId, calls)
    const merged = []
    for (let i = ids.length - 1; i >= 0; i--) {
      const entries = state.history.get(ids[i]) ?? []
      for (let j = entries.length - 1; j >= 0; j--) merged.push(entries[j])
    }
    res.json(merged)
  })

  app.get('/mediator/get_dialog_id', (_req, res) => {
    const d = state.currentDialogId ?? ''
    if (d) state.getDialogIdCalls.set(d, (state.getDialogIdCalls.get(d) ?? 0) + 1)
    res.json(d)
  })

  app.get('/mediator/get_dialog_raw', (req, res) => {
    const d = req.query.dialogId ?? ''
    res.json(state.history.get(d) ?? [])
  })

  app.get('/mediator/finish_dialog', (_req, res) => res.json('ok'))

  // ── botmediator: agent registry ────────────────────────────
  // В нашем /message-флоу jsagent НЕ дёргает этот GET: главный агент приходит
  // инлайном в IncomingMessage.agent_params, модули — через POST .../agents/choose.
  // Эндпоинт оставлен на всякий случай: если запросили зарегистрированный модуль —
  // отдаём, иначе 404 (чтобы непредвиденный путь падал громко).

  app.get('/mediator/customers/:custId/agents/:agentId', (req, res) => {
    const id = req.params.agentId
    if (state.modules.has(id)) {
      return res.json({ id, parameters: state.modules.get(id) })
    }
    res.status(404).json({ error: `agent ${id} not registered in mock` })
  })

  // POST /mediator/customers/:custId/agents/choose — batch module fetch.
  // Тело: string[] id-шников. Возвращаем массив { id, parameters: Pair[] }
  app.post('/mediator/customers/:custId/agents/choose', (req, res) => {
    const ids = Array.isArray(req.body) ? req.body : []
    const result = ids
      .filter(id => state.modules.has(id))
      .map(id => ({ id, parameters: state.modules.get(id) }))
    res.json(result)
  })

  // ── contextsearch ─────────────────────────────────────────

  app.post('/search', (req, res) => {
    const d = state.currentDialogId ?? 'unknown'
    ensureDialog(d)
    state.contextsearchCalls.get(d).push(req.body)
    const response = state.contextsearchQueue.shift() ?? {
      context: [], symbol_code: [], title: [],
    }
    res.json(response)
  })

  app.post('/search_in_scenarios', (req, res) => {
    const d = state.currentDialogId ?? 'unknown'
    ensureDialog(d)
    state.scenarioSearchCalls.get(d).push(req.body)
    const response = state.scenarioSearchQueue.shift() ?? {
      simple: [], complex: [],
    }
    res.json(response)
  })

  // ── lifecycle helpers ─────────────────────────────────────

  let server = null
  const instance = {
    state,
    app,
    async start(port = 9999) {
      return await new Promise((resolve, reject) => {
        server = app.listen(port, (err) => err ? reject(err) : resolve(instance))
      })
    },
    async stop() {
      if (!server) return
      await new Promise((resolve) => server.close(resolve))
      server = null
    },
    registerModule(id, params) {
      state.modules.set(id, params)
    },
    getUrl(port = 9999) {
      return `http://localhost:${port}`
    },
  }
  return instance
}

function cryptoUuid() {
  // простой uuid v4 без зависимостей
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
