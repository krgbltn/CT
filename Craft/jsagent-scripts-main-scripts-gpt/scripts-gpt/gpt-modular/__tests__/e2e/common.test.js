// E2E common test suite — параметризовано по 3 клиентам.
// Запускает реальный jsagent + реальный craftgpt с замоканными
// botmediator/contextsearch.

import { describe, expect } from 'vitest'
import { CLIENTS, CLIENTS_WITH_OPERATOR, CLIENTS_FOR_HISTORY_TESTS } from './helpers/agent-registry.js'
import { multiRangeArticleResponse, singleArticleResponse } from './helpers/context-fixtures.js'
import { setupE2E, itIf, runTurn, runDialog, clearDialog, supportsThinking } from './helpers/setup.js'

setupE2E()

describe.each(CLIENTS)('e2e common: %s', (client) => {
  itIf('greeting → агент отвечает (smalltalk без контекста)', async () => {
    const r = await runTurn({
      client, question: 'привет',
      contextsearchResponses: [],
    })
    expect(r.error).toBeNull()
    expect(r.replies.length).toBeGreaterThanOrEqual(1)
    expect(r.replies.some(x => (x.MessageMarkdown ?? '').trim().length > 0)).toBe(true)
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('rag_answer → ответ содержит маркер из контекста', async () => {
    const marker = 'BANANA42'
    const r = await runTurn({
      client,
      question: 'Какое магическое слово упоминается в инструкции?',
      contextsearchResponses: [singleArticleResponse({
        title: 'Инструкция',
        content: `Магическое слово инструкции — ${marker}. Используйте его при необходимости.`,
      })],
    })
    expect(r.error).toBeNull()
    expect(r.replies.length).toBeGreaterThanOrEqual(1)
    expect(r.answer).toContain(marker)
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('show_references → отдельная реплика со ссылками', async () => {
    const r = await runTurn({
      client,
      question: 'Где описана инструкция?',
      contextsearchResponses: [singleArticleResponse({
        title: 'ВАЖНАЯ-СТАТЬЯ',
        content: 'Содержимое статьи',
        intentId: 'art-XYZ',
      })],
      settingsOverrides: { agent_parameters: { SHOW_REFERENCES: true } },
    })
    expect(r.error).toBeNull()
    const refReply = r.replies.find(x => (x.MessageMarkdown ?? '').includes('Ссылки для информации'))
    expect(refReply, `expected references reply, got: ${JSON.stringify(r.replies.map(x => x.MessageMarkdown))}`).toBeDefined()
    expect(refReply.MessageMarkdown).toContain('art-XYZ')
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('source_highlights → references MessageMarkdown contains repeated ctr params', async () => {
    const r = await runTurn({
      client,
      question: 'Где описан порядок из статьи с подсветкой?',
      contextsearchResponses: [multiRangeArticleResponse({
        title: 'Статья с подсветкой',
        intentId: 'highlight-art-1',
      })],
      settingsOverrides: {
        agent_parameters: {
          ENABLE_SOURCE_HIGHLIGHTS: true,
          SHOW_REFERENCES: true,
        },
      },
    })
    expect(r.error).toBeNull()
    const refReply = r.replies.find(x => (x.MessageMarkdown ?? '').includes('Ссылки для информации'))
    expect(refReply, `expected references reply, got: ${JSON.stringify(r.replies.map(x => x.MessageMarkdown))}`).toBeDefined()
    expect(refReply.MessageMarkdown).toContain(
      '/knowledge-base/article/view/highlight-art-1?ctv=1&ctr=0%3A10&ctr=20%3A30',
    )
    expect(refReply.MessageMarkdown.match(/ctr=/g)).toHaveLength(2)
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf.skipIf(!supportsThinking)('show_thinking → реплика с meta.isThinking', async () => {
    const r = await runTurn({
      client,
      question: 'Что такое инструкция?',
      contextsearchResponses: [singleArticleResponse({
        content: 'Инструкция — это документ с правилами.',
      })],
      settingsOverrides: { agent_parameters: { SHOW_THINKING: true, ENABLE_THINKING_RAG: true } },
    })
    expect(r.error).toBeNull()
    const thinkingReply = r.replies.find(x => x.SendMessageParams?.Meta?.isThinking)
    expect(thinkingReply, 'expected reply with Meta.isThinking=true').toBeDefined()
    await clearDialog({ dialogId: r.dialogId })
  })

  // Зеркальный тест для моделей без reasoning — даже при SHOW_THINKING=true и ENABLE_THINKING_RAG=true
  // в ответе ровно одна реплика-ответ, без Meta.isThinking и без <think> в тексте.
  itIf.skipIf(supportsThinking)('no reasoning → ровно одна реплика-ответ без thinking-артефактов', async () => {
    const r = await runTurn({
      client,
      question: 'Что такое инструкция?',
      contextsearchResponses: [singleArticleResponse({
        content: 'Инструкция — это документ с правилами.',
      })],
      settingsOverrides: { agent_parameters: { SHOW_THINKING: true, ENABLE_THINKING_RAG: true } },
    })
    expect(r.error).toBeNull()
    const userFacing = r.replies.filter(x => !x.SendMessageParams?.Meta?.debug)
    expect(userFacing.length).toBe(1)
    expect(userFacing[0].SendMessageParams?.Meta?.isThinking).toBeUndefined()
    expect(r.answer).not.toContain('<think>')
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf.skipIf(!supportsThinking)('reasoning включён но не показывается — нет user-facing реплик с isThinking', async () => {
    const r = await runTurn({
      client,
      question: 'Что такое инструкция?',
      contextsearchResponses: [singleArticleResponse({
        content: 'Инструкция — это документ с правилами.',
      })],
      settingsOverrides: { agent_parameters: { ENABLE_THINKING_RAG: true, SHOW_THINKING: false } },
    })
    expect(r.error).toBeNull()
    // User-facing реплик с isThinking быть не должно.
    const userFacing = r.replies.filter(x => !x.SendMessageParams?.Meta?.debug)
    const thinkingReply = userFacing.find(x => x.SendMessageParams?.Meta?.isThinking)
    expect(thinkingReply, `expected no user-facing thinking reply, got: ${JSON.stringify(userFacing.map(x => x.SendMessageParams?.Meta))}`).toBeUndefined()
    // Основной ответ должен быть
    expect(userFacing.length).toBeGreaterThanOrEqual(1)
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('rephrase → один вызов /search со списком запросов', async () => {
    // DO_REPHRASE=true → агент сначала зовёт LLM /rephrase, потом ОДИН раз /search
    // с массивом text=[оригинал, ...рефразы]
    const r = await runTurn({
      client,
      question: 'Где найти инструкцию по работе с системой?',
      contextsearchResponses: [{ context: [], symbol_code: [], title: [] }],
      settingsOverrides: { agent_parameters: { DO_REPHRASE: true, REPHRASE_N_GENERATIONS: 1, REPHRASE_SAMPLES_PER_GENERATION: 2 } },
    })
    expect(r.error).toBeNull()
    expect(r.contextsearchCalls.length).toBe(1)
    const body = r.contextsearchCalls[0]
    expect(Array.isArray(body.text), `text field must be array; got ${typeof body.text}`).toBe(true)
    expect(body.text.length).toBeGreaterThanOrEqual(2)
    expect(body.text[0]).toBe('Где найти инструкцию по работе с системой?')
    await clearDialog({ dialogId: r.dialogId })
  })

})

describe.each(CLIENTS_FOR_HISTORY_TESTS)('e2e common (history): %s', (client) => {
  // ОС — обычный технический факт, который Касперский-промпт не блокирует
  // (в отличие от «магических слов»).
  const MARKER = 'Haiku OS'
  const TURN_1_QUESTION = `У меня на компьютере стоит ${MARKER}, запомни это.`
  const TURN_2_QUESTION = 'Какая у меня операционная система?'

  itIf('USE_HISTORY=false → getDialog/getDialogId не зовутся, прошлого не помнит', async () => {
    const dialog = await runDialog({
      client,
      settingsOverrides: { agent_parameters: { USE_HISTORY: false } },
      turns: [
        { question: TURN_1_QUESTION, contextsearchResponses: [] },
        { question: TURN_2_QUESTION, contextsearchResponses: [] },
      ],
    })
    expect(dialog.turns[0].error).toBeNull()
    expect(dialog.turns[1].error).toBeNull()
    // Структурно: ни одна из mediator-ручек для истории не дёрнута.
    expect(dialog.turns[1].getDialogIdCalls).toBe(0)
    expect(dialog.turns[1].getHistoryCalls).toBe(0)
    // Семантически: без истории модель не может знать маркер.
    expect(dialog.turns[1].answer).not.toContain(MARKER)
  })

  itIf('USE_HISTORY=true, HISTORY_FROM_BOT_MEDIATOR=false → getDialog не зовётся, dialog_id уходит в craftgpt', async () => {
    const dialog = await runDialog({
      client,
      settingsOverrides: { agent_parameters: { USE_HISTORY: true, HISTORY_FROM_BOT_MEDIATOR: false } },
      turns: [
        { question: TURN_1_QUESTION, contextsearchResponses: [] },
        { question: TURN_2_QUESTION, contextsearchResponses: [] },
      ],
    })
    expect(dialog.turns[0].error).toBeNull()
    expect(dialog.turns[1].error).toBeNull()
    // getDialogId зовётся (всегда когда USE_HISTORY=true и не IS_QUERY_REPORT), getDialog — нет.
    expect(dialog.turns[1].getDialogIdCalls).toBeGreaterThanOrEqual(1)
    expect(dialog.turns[1].getHistoryCalls).toBe(0)
    // Семантически: craftgpt восстановил историю по dialog_id → знает маркер.
    expect(dialog.turns[1].answer).toContain(MARKER)
  })

  itIf('USE_HISTORY=true, HISTORY_FROM_BOT_MEDIATOR=true → getDialog зовётся, ответ по истории', async () => {
    const dialog = await runDialog({
      client,
      settingsOverrides: { agent_parameters: { USE_HISTORY: true, HISTORY_FROM_BOT_MEDIATOR: true } },
      turns: [
        { question: TURN_1_QUESTION, contextsearchResponses: [] },
        { question: TURN_2_QUESTION, contextsearchResponses: [] },
      ],
    })
    expect(dialog.turns[0].error).toBeNull()
    expect(dialog.turns[1].error).toBeNull()
    expect(dialog.turns[1].getDialogIdCalls).toBeGreaterThanOrEqual(1)
    expect(dialog.turns[1].getHistoryCalls).toBeGreaterThanOrEqual(1)
    expect(dialog.turns[1].answer).toContain(MARKER)
  })
})

describe.each(CLIENTS_WITH_OPERATOR)('e2e common (with operator): %s', (client) => {
  itIf('scenario emit → /switchredirect в ответе', async () => {
    const r = await runTurn({
      client,
      question: 'Я очень недоволен качеством обслуживания! Переключите меня на живого оператора немедленно.',
      contextsearchResponses: [],
    })
    expect(r.error).toBeNull()
    const switchReply = r.replies.find(x => (x.MessageMarkdown ?? '').startsWith('/switchredirect'))
    expect(switchReply, `expected /switchredirect reply, got: ${JSON.stringify(r.replies.map(x => x.MessageMarkdown))}`).toBeDefined()
    await clearDialog({ dialogId: r.dialogId })
  })
})
