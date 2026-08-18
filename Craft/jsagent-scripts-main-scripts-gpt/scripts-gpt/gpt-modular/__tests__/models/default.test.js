import { describe, it, expect } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

const GLOBALS = {
  https: { Agent: class { constructor() {} } },
  URL, JSON, Date, RegExp,
  axios: {},
  logger: { debug() {}, info() {}, error() {}, warn() {} },
  agentSettings: {
    api: {},
    customer_id: 'test',
    agent_name: 'test',
    standard_messages: {},
    agent_parameters: {},
    llm_settings: {},
    articles: {},
    slots: {},
  },
  message: { meta: {}, slot_context: { filled_slots: [] } },
}
const CORE_WITH_DEFAULT = ['modules/core/10_globals.js', 'modules/core/30_dialog.js', 'modules/models/default.js']


describe('DefaultMessageProcessor.fromModelFormat', () => {
  it('returns response unchanged', () => {
    const ctx = loadScript(['modules/models/default.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const input = { answer: 'Ответ', tool_calls: [] }
    expect(mp.fromModelFormat(input)).toEqual(input)
  })
})


describe('DefaultMessageProcessor.toModelFormat', () => {
  it('removes reasoning field from messages', () => {
    const ctx = loadScript(['modules/models/default.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.toModelFormat([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ', reasoning: 'hidden' },
    ])
    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })

  it('passes through messages without reasoning', () => {
    const ctx = loadScript(['modules/models/default.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.toModelFormat([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ' },
    ])
    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ' },
    ])
  })
})


