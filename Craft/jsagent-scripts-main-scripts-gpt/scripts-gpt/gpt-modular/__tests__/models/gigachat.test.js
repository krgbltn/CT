import { describe, it, expect } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

describe('GigaChatMessageProcessor', () => {
  describe('fromModelFormat', () => {
    it('returns response unchanged', () => {
      const ctx = loadScript(['modules/models/gigachat.js'])
      const mp = ctx.__getLetVar('messageProcessor')
      expect(mp.fromModelFormat({ answer: 'Ответ' })).toEqual({ answer: 'Ответ' })
    })
  })

  describe('toModelFormat', () => {
    it('removes reasoning field', () => {
      const ctx = loadScript(['modules/models/gigachat.js'])
      const mp = ctx.__getLetVar('messageProcessor')
      const result = mp.toModelFormat([
        { role: 'assistant', message: 'Ответ', reasoning: 'hidden' },
      ])
      expect(result).toEqual([
        { role: 'assistant', message: 'Ответ' },
      ])
    })
  })
})
