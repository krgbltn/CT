// Драйвер e2e-теста: собирает IncomingMessage, дёргает jsagent /message,
// забирает реплики из mock-сервера. Поддерживает многократные turn-ы по одному dialogId.

import { getAgentParams } from './agent-registry.js'

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

async function postJson(url, body, timeoutMs = 5000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : await res.text() }
  } finally {
    clearTimeout(t)
  }
}

async function getJson(url, timeoutMs = 5000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : await res.text() }
  } finally {
    clearTimeout(t)
  }
}

function buildIncomingMessage({ client, dialogId, question, agentParams, slots, meta }) {
  const nowMs = Date.now()
  return {
    id: uuidv4(),
    id_from_channel: uuidv4(),
    parent_message_id: null,
    message_type: 1,
    timestamps: {
      sent_from_channel: nowMs,
      received_from_channel: nowMs,
      dispatched: nowMs,
    },
    channel: { customer_id: 'e2e', channel_id: 'e2e', channel_type: 'eval', id_in_channel: '' },
    user: {
      ext_user_id: 'eval_user',
      omni_user_id: dialogId,
      customer_id: 'e2e',
      channel_user_id: 'eval_user',
      session_id: dialogId,
    },
    message: { text: question, action: meta?.action ?? null },
    agent_params: agentParams,
    agent_id: client,
    agent_cust_id: client,
    slot_context: { filled_slots: slots ?? [] },
    context: [],
    meta: meta ?? {},
    routing: {},
  }
}

// Опции одного turn:
//   client                — 'gpt_tools' | 'gpt_ida_qwen' | 'gpt_rupost'
//   dialogId              — стабильный ID диалога для multi-turn (или новый, если undefined)
//   question              — текст пользователя
//   contextsearchResponses — FIFO ответов /search (по одному на каждый вызов)
//   scenarioSearchResponses
//   slots                 — filled_slots (пред-заполненные, например, scenario_result для turn 2)
//   meta                  — meta входящего сообщения (isQueryReport, dialog_id, history, action и т.п.)
//   settingsOverrides     — патч на agent_settings (api.*, agent_parameters.*, и т.д.)
//   appendHistory         — массив mediator-entries для добавления в историю до запуска turn-а
//   mockServerUrl, craftgptUrl, jsagentUrl — обязательные, инжектятся тестом
export async function runTurn({
  client,
  dialogId = uuidv4(),
  question,
  contextsearchResponses = [],
  scenarioSearchResponses = [],
  slots = [],
  meta = {},
  settingsOverrides = {},
  appendHistory = null,
  mockServerUrl,
  craftgptUrl,
  craftgptToken,
  jsagentUrl,
  timeoutMs = 120000,
}) {
  if (!mockServerUrl || !craftgptUrl || !jsagentUrl) {
    throw new Error('runTurn: mockServerUrl, craftgptUrl и jsagentUrl обязательны')
  }

  const agentParams = getAgentParams({ client, mockUrl: mockServerUrl, craftgptUrl, craftgptToken, settingsOverrides })

  // 1. Setup mock — НЕ затирает историю если хотим продолжить multi-turn:
  //    приходится передать текущую историю обратно. Получим её, прежде чем затереть.
  let preserved = []
  const beforeReplies = await getJson(`${mockServerUrl}/test/replies/${dialogId}`)
  if (beforeReplies.ok) preserved = beforeReplies.body.history ?? []

  await postJson(`${mockServerUrl}/test/setup`, {
    dialogId,
    history: preserved,
    contextsearchResponses,
    scenarioSearchResponses,
  })

  if (appendHistory && appendHistory.length > 0) {
    await postJson(`${mockServerUrl}/test/appendHistory/${dialogId}`, appendHistory)
  }

  // Кладём user-сообщение текущего turn-а в историю (так делает реальный
  // mediator при ingestion): следующий turn увидит его через getDialog().
  const payload = buildIncomingMessage({ client, dialogId, question, agentParams, slots, meta })
  if (question) {
    await postJson(`${mockServerUrl}/test/appendHistory/${dialogId}`, {
      msg: {
        id: payload.id,
        message_type: 1,
        message: { text: question, text_type: 'Markdown' },
        meta: meta ?? {},
      },
    })
  }

  // 2. POST /message

  let error = null
  const start = Date.now()
  let messageRes
  try {
    messageRes = await postJson(`${jsagentUrl}/message`, payload, timeoutMs)
    if (!messageRes.ok) {
      error = `jsagent ${messageRes.status}: ${typeof messageRes.body === 'string' ? messageRes.body : JSON.stringify(messageRes.body)}`
    }
  } catch (e) {
    error = e.name === 'AbortError' ? `jsagent timeout (${timeoutMs}ms)` : String(e)
  }
  const elapsedMs = Date.now() - start

  // 3. Забираем артефакты теста
  const artifactsRes = await getJson(`${mockServerUrl}/test/replies/${dialogId}`)
  const artifacts = artifactsRes.ok ? artifactsRes.body : {
    replies: [], history: [], contextsearchCalls: [], scenarioSearchCalls: [],
    getHistoryCalls: 0, getDialogIdCalls: 0, getLinkedHistoryCalls: [], failedRequests: [],
  }

  return {
    dialogId,
    error,
    elapsedMs,
    jsagentResponse: messageRes?.body ?? null,
    replies: artifacts.replies ?? [],
    history: artifacts.history ?? [],
    contextsearchCalls: artifacts.contextsearchCalls ?? [],
    scenarioSearchCalls: artifacts.scenarioSearchCalls ?? [],
    getHistoryCalls: artifacts.getHistoryCalls ?? 0,
    getDialogIdCalls: artifacts.getDialogIdCalls ?? 0,
    // Вызовы POST /mediator/user_messages_history — каждый элемент:
    // { DialogIds, OmniUserId, Count }.
    getLinkedHistoryCalls: artifacts.getLinkedHistoryCalls ?? [],
    // Запросы, которые мок отверг с 400 (как реальный botmediator).
    failedRequests: artifacts.failedRequests ?? [],
    // Текст ответа пользователю — без debug-реплик.
    answer: (artifacts.replies ?? [])
      .filter(r => !r.SendMessageParams?.Meta?.debug)
      .map(r => r.MessageMarkdown).filter(Boolean).join('\n\n'),
  }
}

// Чистка состояния dialogId на mock-сервере.
export async function clearDialog({ mockServerUrl, dialogId }) {
  await postJson(`${mockServerUrl}/test/clear/${dialogId}`, {})
}

// Засевает историю произвольного dialogId на mock-сервере. Нужно для
// linked-диалогов: имитируем, что у пользователя есть завершённый
// прошлый диалог с реквест/респонс парами, и эта история придёт через
// POST /mediator/user_messages_history. entries — массив mediator-
// формата [{msg|reply: {id, message_type, message: {text}, meta}}].
export async function seedDialogHistory({ mockServerUrl, dialogId, entries }) {
  await postJson(`${mockServerUrl}/test/appendHistory/${dialogId}`, entries)
}

// Convenience: запустить серию turn-ов на одном диалоге.
// Опции верхнего уровня (client, settingsOverrides и т.п.) наследуются каждым turn-ом.
// Опции внутри turn полностью перекрывают dialog-level.
export async function runDialog({ turns, ...dialogDefaults }) {
  const dialogId = uuidv4()
  const results = []
  for (const turn of turns) {
    const r = await runTurn({ dialogId, ...dialogDefaults, ...turn })
    results.push(r)
    if (r.error) break
  }
  return { dialogId, turns: results }
}
