import { describe, it, expect, vi } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

function makeGlobalsCtx(filledSlots = [], slotsConfig = {}) {
  return {
    https: { Agent: class { constructor() {} } },
    Date, RegExp, Object, Array, Map, JSON,
    agentSettings: {
      api: {},
      customer_id: 'test',
      agent_name: 'test',
      slots: slotsConfig,
      standard_messages: {},
      agent_parameters: {},
      llm_settings: {},
      articles: {},
    },
    message: {
      meta: {},
      user: { channel_user_id: 'u1' },
      slot_context: {
        current_intent_id: '',
        current_slot_id: '',
        filled_slots: filledSlots,
        conflicts: [],
        attempts_to_fill: [],
        started_at_ms: 0,
      },
    },
  }
}

const FILLED_SLOTS = [
  {
    slot_id: 'channel_id',
    filled_at_ms: 1774616797982,
    filled_by: 'Auto',
    scrubbingStatus: 'NotScrubbed',
    value: 'channel_45d3baa',
  },
  {
    slot_id: 'sys_omniuserid',
    filled_at_ms: 1774616795560,
    filled_by: 'Auto',
    scrubbingStatus: 'NotScrubbed',
    value: 'e22d3830-818a-4932-a7c3-aef368f2e2f5',
  },
  {
    slot_id: 'sys_phone',
    filled_at_ms: 1774616795560,
    filled_by: 'Auto',
    scrubbingStatus: 'NotScrubbed',
    value: '',
  },
  {
    slot_id: 'sys_username',
    filled_at_ms: 1774616795560,
    filled_by: 'Auto',
    scrubbingStatus: 'NotScrubbed',
  },
]


describe('getSlotValue', () => {
  it('finds existing slot by id', () => {
    const ctx = loadScript(['modules/core/55_slots.js'], makeGlobalsCtx(FILLED_SLOTS))
    expect(ctx.getSlotValue('channel_id')).toBe('channel_45d3baa')
    expect(ctx.getSlotValue('sys_omniuserid')).toBe('e22d3830-818a-4932-a7c3-aef368f2e2f5')
    expect(ctx.getSlotValue('sys_phone')).toBe('')
  })

  it('returns undefined for missing slot', () => {
    const ctx = loadScript(['modules/core/55_slots.js'], makeGlobalsCtx(FILLED_SLOTS))
    expect(ctx.getSlotValue('nonexistent')).toBeUndefined()
  })

  it('returns undefined for slot without value field', () => {
    const ctx = loadScript(['modules/core/55_slots.js'], makeGlobalsCtx(FILLED_SLOTS))
    expect(ctx.getSlotValue('sys_username')).toBeUndefined()
  })
})


describe('getSlots', () => {
  const SLOTS_DEF = [
    { id: 'channel_id', description: 'ID канала' },
    { id: 'sys_omniuserid', description: 'Omni User ID' },
    { id: 'sys_phone', description: 'Телефон' },
    { id: 'sys_username', description: 'Имя пользователя' },
  ]

  it('returns [] for null/undefined/non-array', () => {
    const ctx = loadScript(['modules/core/55_slots.js'], makeGlobalsCtx([]))
    expect(ctx.getSlots(null)).toEqual([])
    expect(ctx.getSlots(undefined)).toEqual([])
    expect(ctx.getSlots('not array')).toEqual([])
  })

  it('maps filled slots with descriptions', () => {
    const ctx = loadScript(['modules/core/55_slots.js'], makeGlobalsCtx(FILLED_SLOTS))
    const result = ctx.getSlots(SLOTS_DEF)
    expect(result).toEqual([
      { slotId: 'channel_id', slotDescription: 'ID канала', slotValue: 'channel_45d3baa' },
      { slotId: 'sys_omniuserid', slotDescription: 'Omni User ID', slotValue: 'e22d3830-818a-4932-a7c3-aef368f2e2f5' },
      { slotId: 'sys_phone', slotDescription: 'Телефон', slotValue: null },
      { slotId: 'sys_username', slotDescription: 'Имя пользователя', slotValue: null },
    ])
  })

  it('takes last value after semicolons', () => {
    const ctx = loadScript(['modules/core/55_slots.js'], makeGlobalsCtx([
      { slot_id: 'channel_id', filled_at_ms: 0, filled_by: 'Auto', scrubbingStatus: 'NotScrubbed', value: 'first;second;third' },
    ]))
    const result = ctx.getSlots([{ id: 'channel_id', description: 'ID канала' }])
    expect(result[0].slotValue).toBe('third')
  })

  it('takes empty string when semicolon is at the end', () => {
    const ctx = loadScript(['modules/core/55_slots.js'], makeGlobalsCtx([
      { slot_id: 'channel_id', filled_at_ms: 0, filled_by: 'Auto', scrubbingStatus: 'NotScrubbed', value: 'first;second;' },
    ]))
    const result = ctx.getSlots([{ id: 'channel_id', description: 'ID канала' }])
    expect(result[0].slotValue).toBe('')
  })
})


describe('slotManager.injectSlotsIntoPrompt', () => {
  const USER_SLOTS = [
    { id: 'channel_id', description: 'ID канала' },
    { id: 'sys_omniuserid', description: 'Omni User ID' },
    { id: 'sys_username', description: 'Имя пользователя' },
  ]
  const SLOTS_CONFIG = {
    use_slots: true,
    user_slots: USER_SLOTS,
    user_slots_placeholder: '## Слоты:',
  }
  const TEMPLATE = 'System prompt\n## Слоты:\nEnd'

  it('returns template unchanged when useSlots is false', () => {
    const ctx = loadScript(
      ['modules/core/55_slots.js'],
      makeGlobalsCtx(FILLED_SLOTS, { ...SLOTS_CONFIG, use_slots: false }),
    )
    expect(ctx.__getLetVar('slotManager').injectSlotsIntoPrompt(TEMPLATE)).toBe(TEMPLATE)
  })

  it('injects filled slots into template, unfilled marked as "не заполнено"', () => {
    const ctx = loadScript(
      ['modules/core/55_slots.js'],
      makeGlobalsCtx(FILLED_SLOTS, SLOTS_CONFIG),
    )

    const expectedSlotsBlock =
      '## Слоты:\n' +
      '- channel_id. - ID канала: **channel_45d3baa**\n' +
      '- sys_omniuserid. - Omni User ID: **e22d3830-818a-4932-a7c3-aef368f2e2f5**\n' +
      '- sys_username. - Имя пользователя: **не заполнено**'

    expect(ctx.__getLetVar('slotManager').injectSlotsIntoPrompt(TEMPLATE)).toBe(
      `System prompt\n${expectedSlotsBlock}\nEnd`,
    )
  })

  it('shows "Нет заполненных слотов" when user_slots list is empty', () => {
    const ctx = loadScript(
      ['modules/core/55_slots.js'],
      makeGlobalsCtx([], { ...SLOTS_CONFIG, user_slots: [] }),
    )
    expect(ctx.__getLetVar('slotManager').injectSlotsIntoPrompt(TEMPLATE))
      .toContain('Нет заполненных слотов')
  })
})


describe('_sendReply slots behavior', () => {
  function makeSendReplyCtx(slotsConfig = {}) {
    const sendMessageMock = vi.fn(() => Promise.resolve({ Ok: true }))
    const globals = {
      ...makeGlobalsCtx([], slotsConfig),
      logger: { debug() {}, info() {}, error() {}, warn() {} },
      agentApi: {
        makeMarkdownReply: (text) => ({
          message: { text },
          customer_id: 'cust',
          omni_user_id: 'user',
          channel_id: 'ch',
        }),
        sendMessage: sendMessageMock,
      },
      LLM_SYSTEM_TEMPLATE: '',
      LLM_SYSTEM_TEMPLATE_SMALLTALK: '',
    }
    return { globals, sendMessageMock }
  }

  function getFilledSlots(sendMessageMock, callIndex = -1) {
    const idx = callIndex < 0 ? sendMessageMock.mock.calls.length + callIndex : callIndex
    return sendMessageMock.mock.calls[idx][0].SendMessageParams.FilledSlots
  }

  it('sends slots passed as argument', () => {
    const { globals, sendMessageMock } = makeSendReplyCtx()
    const ctx = loadScript(
      ['modules/core/10_globals.js', 'modules/core/55_slots.js', 'modules/core/80_main.js'],
      globals,
    )

    ctx._sendReply('Hello', { track_number: 'RA123' })

    expect(getFilledSlots(sendMessageMock)).toEqual({ track_number: 'RA123' })
  })

  it('preserves slots from previous calls', () => {
    const { globals, sendMessageMock } = makeSendReplyCtx()
    const ctx = loadScript(
      ['modules/core/10_globals.js', 'modules/core/55_slots.js', 'modules/core/80_main.js'],
      globals,
    )

    ctx._sendReply('first', { track_number: 'RA123' })
    ctx._sendReply('second', { index_ops: '101000' })

    const slots = getFilledSlots(sendMessageMock)
    expect(slots.track_number).toBe('RA123')
    expect(slots.index_ops).toBe('101000')
  })

  it('overwrites slot with same key', () => {
    const { globals, sendMessageMock } = makeSendReplyCtx()
    const ctx = loadScript(
      ['modules/core/10_globals.js', 'modules/core/55_slots.js', 'modules/core/80_main.js'],
      globals,
    )

    ctx._sendReply('first', { track_number: 'RA123' })
    ctx._sendReply('second', { track_number: 'RA999' })

    expect(getFilledSlots(sendMessageMock).track_number).toBe('RA999')
  })

  it('deletes slot by setting null', () => {
    const { globals, sendMessageMock } = makeSendReplyCtx()
    const ctx = loadScript(
      ['modules/core/10_globals.js', 'modules/core/55_slots.js', 'modules/core/80_main.js'],
      globals,
    )

    ctx._sendReply('first', { track_number: 'RA123' })
    ctx._sendReply('second', { track_number: null })

    expect(getFilledSlots(sendMessageMock).track_number).toBeNull()
  })

  it('works without slots argument', () => {
    const { globals, sendMessageMock } = makeSendReplyCtx()
    const ctx = loadScript(
      ['modules/core/10_globals.js', 'modules/core/55_slots.js', 'modules/core/80_main.js'],
      globals,
    )

    ctx._sendReply('Hello')

    expect(getFilledSlots(sendMessageMock)).toEqual({})
  })

})
