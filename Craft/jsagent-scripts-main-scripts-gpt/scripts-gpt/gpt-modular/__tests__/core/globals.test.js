import { describe, it, expect, beforeAll } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

const MOCK_GLOBALS = {
  https: { Agent: class { constructor() {} } },
  Date,
  RegExp,
  agentSettings: {
    api: {},
    customer_id: 'test-customer',
    agent_name: 'test-agent',
    slots: {},
    standard_messages: {},
    agent_parameters: {},
    llm_settings: {},
    proxy: { USE_PROXY: false },
    articles: {},
  },
  message: { meta: {}, slot_context: { filled_slots: [] } },
}

describe('core/globals', () => {
  let ctx

  beforeAll(() => {
    ctx = loadScript(['modules/core/10_globals.js'], { ...MOCK_GLOBALS })
  })

  describe('translit', () => {
    it('transliterates basic Russian text', () => {
      expect(ctx.translit('Привет')).toBe('privet')
    })

    it('replaces spaces with underscores', () => {
      expect(ctx.translit('два слова')).toBe('dva_slova')
    })

    it('collapses multiple spaces into one underscore', () => {
      expect(ctx.translit('раз   два')).toBe('raz_dva')
    })

    it('removes non-alphanumeric characters', () => {
      expect(ctx.translit('тест!')).toBe('test')
    })

    it('handles mixed Latin and Cyrillic', () => {
      expect(ctx.translit('hello мир')).toBe('hello_mir')
    })

    it('preserves digits', () => {
      expect(ctx.translit('тест 123')).toBe('test_123')
    })

    it('handles empty string', () => {
      expect(ctx.translit('')).toBe('')
    })

    it('transliterates multi-char mappings: ё→yo, ж→zh, щ→shch', () => {
      expect(ctx.translit('ёж')).toBe('yozh')
      expect(ctx.translit('щука')).toBe('shchuka')
    })

    it('removes soft and hard signs', () => {
      expect(ctx.translit('объём')).toBe('obyom')
    })

    it('lowercases before transliterating', () => {
      expect(ctx.translit('ТЕСТ')).toBe('test')
    })
  })

  describe('validateHttpUrl', () => {
    it('accepts http URL', () => {
      expect(ctx.validateHttpUrl('http://example.com')).toBe(true)
    })

    it('accepts https URL', () => {
      expect(ctx.validateHttpUrl('https://example.com')).toBe(true)
    })

    it('throws on non-http protocol', () => {
      expect(() => ctx.validateHttpUrl('ftp://example.com')).toThrow()
    })

    it('throws on non-string input', () => {
      expect(() => ctx.validateHttpUrl(123)).toThrow('строкой')
    })
  })
})
