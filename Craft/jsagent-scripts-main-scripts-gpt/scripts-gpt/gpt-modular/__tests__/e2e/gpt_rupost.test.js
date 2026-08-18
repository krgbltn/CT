// gpt_rupost-specific e2e тесты:
// - LLM_ANSWER_HISTORY: накопление текстов всех _sendReply через ";"
// - tracking/ops scenario: 2-turn цикл с onScenarioCompleted, который отправляет
//   результат сценария пользователю как markdownReply
// - HISTORY_FROM_BOT_MEDIATOR: повторный turn видит историю предыдущего

import { describe, expect } from 'vitest'
import { singleArticleResponse } from './helpers/context-fixtures.js'
import { setupE2E, itIf, runTurn, runDialog, clearDialog } from './helpers/setup.js'

setupE2E()

const CLIENT = 'gpt_rupost'

describe('e2e gpt_rupost', () => {
  itIf('LLM_ANSWER_HISTORY накапливает все ответы через ";"', async () => {
    // Включаем SHOW_REFERENCES + контекст со статьёй ⇒ агент шлёт ≥2 реплики
    // (ответ + ссылки), и все они должны накопиться в LLM_ANSWER_HISTORY.
    const r = await runTurn({
      client: CLIENT,
      question: 'Где описана услуга?',
      contextsearchResponses: [singleArticleResponse({
        title: 'Услуги',
        content: 'Описание услуги доступно на сайте.',
        intentId: 'art-rupost-1',
      })],
      settingsOverrides: { agent_parameters: { SHOW_REFERENCES: true } },
    })
    expect(r.error).toBeNull()
    expect(r.replies.length).toBeGreaterThanOrEqual(2)

    // В rupost-settings agent_slots.LLM_ANSWER_HISTORY = "llm_history_messages"
    const lastReply = r.replies[r.replies.length - 1]
    const accum = lastReply.SendMessageParams?.FilledSlots?.llm_history_messages
    expect(accum, 'expected llm_history_messages in last reply').toBeTruthy()
    expect(accum).toContain(';')
    for (const reply of r.replies) {
      const txt = (reply.MessageMarkdown ?? '').trim()
      if (txt) expect(accum).toContain(txt)
    }
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('LLM_ANSWER_HISTORY: пред-заполненный slot extends, не перезатирается', async () => {
    // Refactor сделал mergeSlots → updateAccumulatedSlot: caller-значение
    // должно стать базой для аккумулятора, а не быть стёртым.
    const r = await runTurn({
      client: CLIENT,
      question: 'Привет',
      contextsearchResponses: [],
      slots: [{ slot_id: 'llm_history_messages', value: 'preseeded_value' }],
    })
    expect(r.error).toBeNull()
    expect(r.replies.length).toBeGreaterThanOrEqual(1)
    const accum = r.replies[r.replies.length - 1].SendMessageParams?.FilledSlots?.llm_history_messages
    expect(accum).toBeTruthy()
    expect(accum.startsWith('preseeded_value')).toBe(true)
    expect(accum).toContain(';')
    await clearDialog({ dialogId: r.dialogId })
  })

  itIf('tracking scenario: 2-turn цикл, результат сценария отправляется как markdownReply', async () => {
    // Turn 1: вопрос с трек-номером → LLM с высокой вероятностью вызывает
    //         transfer_to_tracking_scenario → /switchredirect.
    // Turn 2: пользователь молчит (пустой text), но в slot_context приходит
    //         scenario_result от воображаемого scenario-агента.
    //         RuPost-override onScenarioCompleted должен пробросить scenario_result
    //         пользователю как markdownReply (verbatim).
    const trackingMarker = 'TRACKING_RESULT_MARKER_777'
    const dialog = await runDialog({
      client: CLIENT,
      turns: [
        {
          question: 'Где моя посылка с трек-номером 12345678901234?',
          contextsearchResponses: [],
        },
        {
          question: '',
          contextsearchResponses: [singleArticleResponse({
            title: 'Статья',
            content: 'Информация по посылке.',
          })],
          slots: [
            { slot_id: 'scenario_result', value: trackingMarker },
          ],
        },
      ],
    })
    expect(dialog.turns[0].error).toBeNull()
    const t1Switch = dialog.turns[0].replies.find(x => (x.MessageMarkdown ?? '').startsWith('/switchredirect'))
    expect(t1Switch, `turn 1 expected /switchredirect; replies: ${JSON.stringify(dialog.turns[0].replies.map(x => x.MessageMarkdown))}`).toBeDefined()

    expect(dialog.turns[1].error).toBeNull()
    const t2Verbatim = dialog.turns[1].replies.find(x => (x.MessageMarkdown ?? '').includes(trackingMarker))
    expect(t2Verbatim, `turn 2 expected reply containing ${trackingMarker}; replies: ${JSON.stringify(dialog.turns[1].replies.map(x => x.MessageMarkdown))}`).toBeDefined()
  })

  itIf('ops_search scenario: тот же 2-turn паттерн', async () => {
    const opsMarker = 'OPS_RESULT_MARKER_555'
    const dialog = await runDialog({
      client: CLIENT,
      turns: [
        {
          question: 'Найди отделение по индексу 101000, пожалуйста',
          contextsearchResponses: [],
        },
        {
          question: '',
          contextsearchResponses: [],
          slots: [
            { slot_id: 'scenario_result', value: opsMarker },
          ],
        },
      ],
    })
    expect(dialog.turns[0].error).toBeNull()
    const t1Switch = dialog.turns[0].replies.find(x => (x.MessageMarkdown ?? '').startsWith('/switchredirect'))
    expect(t1Switch).toBeDefined()

    expect(dialog.turns[1].error).toBeNull()
    const t2Verbatim = dialog.turns[1].replies.find(x => (x.MessageMarkdown ?? '').includes(opsMarker))
    expect(t2Verbatim, `turn 2 expected reply containing ${opsMarker}`).toBeDefined()
  })
})
