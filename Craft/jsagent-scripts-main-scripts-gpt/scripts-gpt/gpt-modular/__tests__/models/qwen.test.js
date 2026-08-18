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
    standard_messages: { THINKING_PREFIX: '*Мои размышления:* \n\n' },
    agent_parameters: {},
    llm_settings: {},
    articles: {},
    slots: {},
  },
  message: { meta: {}, slot_context: { filled_slots: [] } },
}
const CORE_WITH_QWEN = ['modules/core/10_globals.js', 'modules/core/30_dialog.js', 'modules/models/qwen.js']


describe('QwenMessageProcessor.fromModelFormat', () => {
  it('extracts reasoning from <think> tags', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.fromModelFormat({ answer: '<think>\nreasoning\n</think>\n\nОтвет' })
    expect(result.reasoning).toBe('reasoning')
    expect(result.answer).toBe('Ответ')
  })

  it('returns response unchanged when no <think> tags', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const input = { answer: 'Просто ответ', tool_calls: [] }
    expect(mp.fromModelFormat(input)).toEqual(input)
  })

  it('returns response unchanged when reasoning field already present', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const input = { answer: 'Ответ', reasoning: 'уже извлечён' }
    expect(mp.fromModelFormat(input)).toEqual(input)
  })

  it('handles empty/whitespace-only <think> block', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.fromModelFormat({ answer: '<think>\n  \n</think>\n\nОтвет' })
    expect(result.reasoning).toBeUndefined()
    expect(result.answer).toBe('Ответ')
  })

  it('handles only <think> block, no answer (tool_calls case)', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.fromModelFormat({ answer: '<think>\nreasoning\n</think>' })
    expect(result.reasoning).toBe('reasoning')
    expect(result.answer).toBe('')
  })

  it('preserves other fields (tool_calls, log_id)', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.fromModelFormat({
      answer: '<think>\nr\n</think>\n\na',
      tool_calls: [{ id: '1' }],
      log_id: 'abc',
    })
    expect(result.tool_calls).toEqual([{ id: '1' }])
    expect(result.log_id).toBe('abc')
  })
})


describe('QwenMessageProcessor.toModelFormat', () => {
  it('wraps reasoning in <think> tags before message', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.toModelFormat([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Ответ', reasoning: 'размышления' },
    ])
    expect(result).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: '<think>\nразмышления\n</think>\n\nОтвет' },
    ])
  })

  it('passes through messages without reasoning', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
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

  it('handles reasoning with empty message (tool_calls case)', () => {
    const ctx = loadScript(['modules/models/qwen.js'])
    const mp = ctx.__getLetVar('messageProcessor')
    const result = mp.toModelFormat([
      { role: 'assistant', message: '', reasoning: 'thinking', tool_calls: [{ id: '1' }] },
    ])
    expect(result).toEqual([
      { role: 'assistant', message: '<think>\nthinking\n</think>\n\n', tool_calls: [{ id: '1' }] },
    ])
  })
})


