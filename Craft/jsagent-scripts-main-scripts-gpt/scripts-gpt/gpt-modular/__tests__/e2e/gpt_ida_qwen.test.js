// gpt_ida_qwen-specific e2e тесты:
// - URL replacement (URL_REPLACE_FROM/TO в ответах LLM)
// - SHARE_ID в ссылках на статьи
// - DEFINE_TOPIC: новый слот dialog_topic_title
// - slot-toggles: use_rag=false → нет вызова contextsearch

import { describe, expect } from 'vitest'
import { singleArticleResponse } from './helpers/context-fixtures.js'
import { setupE2E, itIf, runTurn, clearDialog, seedDialogHistory } from './helpers/setup.js'

setupE2E()

const CLIENT = 'gpt_ida_qwen'

describe('e2e gpt_ida_qwen', () => {
  itIf('URL_REPLACE: домен в ответе LLM подменяется (normal path)', async () => {
    const r = await runTurn({
      client: CLIENT,
      question: 'По какому адресу найти статью? Дай ссылку как написана в источнике.',
      contextsearchResponses: [singleArticleResponse({
        title: 'FAQ',
        content: 'Подробнее на странице https://aaa-bbb.example/help/faq — там полная инструкция.',
      })],
      settingsOverrides: {
        agent_parameters: {
          URL_REPLACE_FROM: 'https://aaa-bbb.example',
          URL_REPLACE_TO: 'https://xxx-yyy.example',
        },
      },
    })
    expect(r.error).toBeNull()
    expect(r.replies.length).toBeGreaterThanOrEqual(1)
    expect(r.answer).not.toContain('aaa-bbb.example')
    expect(r.answer).toContain('xxx-yyy.example')
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('SHARE_ID → ссылки на статьи через /app/share/{id}/article/', async () => {
    const r = await runTurn({
      client: CLIENT,
      question: 'Что такое инструкция?',
      contextsearchResponses: [singleArticleResponse({
        title: 'Описание', content: 'Инструкция — это документ.',
        intentId: 'art-shared-1',
      })],
      settingsOverrides: {
        agent_parameters: { SHARE_ID: 'shareXYZ', SHOW_REFERENCES: true },
      },
    })
    expect(r.error).toBeNull()
    const refReply = r.replies.find(x => (x.MessageMarkdown ?? '').includes('Ссылки для информации'))
    expect(refReply, 'expected references reply').toBeDefined()
    expect(refReply.MessageMarkdown).toContain('/app/share/shareXYZ/article/art-shared-1')
    expect(refReply.MessageMarkdown).not.toContain('/knowledge-base/article/view/')
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('use_rag=false слот → contextsearch не вызывается', async () => {
    const r = await runTurn({
      client: CLIENT,
      question: 'Что такое инструкция?',
      contextsearchResponses: [],
      slots: [{ slot_id: 'use_rag', value: 'false' }],
    })
    expect(r.error).toBeNull()
    expect(r.contextsearchCalls.length).toBe(0)
    expect(r.answer).toContain('не использовалась база знаний')
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('DEFINE_TOPIC=true → dialog_topic_title попадает в FilledSlots', async () => {
    const r = await runTurn({
      client: CLIENT,
      question: 'Расскажи про настройку чат-ботов',
      contextsearchResponses: [],
      settingsOverrides: { agent_parameters: { DEFINE_TOPIC: true } },
    })
    expect(r.error).toBeNull()
    const withTopic = r.replies.find(x => x.SendMessageParams?.FilledSlots?.dialog_topic_title)
    expect(withTopic, `expected dialog_topic_title in some FilledSlots; got: ${JSON.stringify(r.replies.map(x => x.SendMessageParams?.FilledSlots))}`).toBeDefined()
    expect(typeof withTopic.SendMessageParams.FilledSlots.dialog_topic_title).toBe('string')
    expect(withTopic.SendMessageParams.FilledSlots.dialog_topic_title.length).toBeGreaterThan(0)
    await clearDialog({ dialogId: r.dialogId })
  })

  // Связка фичи linked dialogs (AiA_1-111) с фиксом trim-дубликата
  // (history_duplicate). Сценарий: у пользователя есть прошлый
  // (linked) диалог с маркерным словом → активный turn передаёт
  // slot `linked_dialog_ids` → агент через POST
  // /mediator/user_messages_history подтягивает историю прошлого
  // диалога, склеивает с активным, отрезает хвостовой дубликат
  // вопроса перед отправкой в craftgpt.
  itIf('linked_dialog_ids слот → история прошлого диалога подтягивается и попадает в LLM', async () => {
    const MARKER = 'Haiku OS'
    const linkedDialogId = `linked-${Date.now()}`

    await seedDialogHistory({
      dialogId: linkedDialogId,
      entries: [
        {
          msg: {
            id: 'old-q',
            message_type: 1,
            message: { text: `У меня на компьютере стоит ${MARKER}, запомни это.` },
            meta: {},
          },
        },
        {
          reply: {
            id: 'old-r',
            message_type: 1,
            message: { text: `Хорошо, запомнил — у вас ${MARKER}.` },
            meta: {},
          },
        },
      ],
    })

    const r = await runTurn({
      client: CLIENT,
      question: 'Какая у меня операционная система?',
      contextsearchResponses: [],
      slots: [{ slot_id: 'linked_dialog_ids', value: linkedDialogId }],
      settingsOverrides: {
        agent_parameters: { USE_HISTORY: true, HISTORY_FROM_BOT_MEDIATOR: true },
      },
    })

    expect(r.error).toBeNull()

    // Структурно: ручка linked-истории была вызвана ровно с тем
    // dialog_id, который был в слоте, и omni_user_id текущего user-а.
    expect(r.getLinkedHistoryCalls.length).toBe(1)
    expect(r.getLinkedHistoryCalls[0].DialogIds).toEqual([linkedDialogId])
    expect(r.getLinkedHistoryCalls[0].OmniUserId).toEqual([r.dialogId])
    expect(r.getLinkedHistoryCalls[0].Count).toBe(10000)

    // Семантически: история linked-диалога долетела до LLM, маркер
    // в ответе.
    expect(r.answer).toContain(MARKER)

    await clearDialog({ dialogId: r.dialogId })
    await clearDialog({ dialogId: linkedDialogId })
  })

  // Регрессия: при DEBUG=true первое же отладочное сообщение из _main падает
  // с 400 на botmediator-е, потому что Meta типизирована как
  // Dictionary<string,string>, а debugReply посылает { debug: true } (boolean).
  itIf('DEBUG=true → debugReply не отвергается botmediator-ом', async () => {
    const r = await runTurn({
      client: CLIENT,
      question: 'привет',
      contextsearchResponses: [],
      settingsOverrides: { agent_parameters: { DEBUG: true } },
    })
    expect(r.error).toBeNull()
    expect(
      r.failedRequests,
      `botmediator отверг ${r.failedRequests.length} запрос(а): ${JSON.stringify(r.failedRequests, null, 2)}`,
    ).toEqual([])
    await clearDialog({ dialogId: r.dialogId })
  })
})
