import { describe, it, expect, beforeAll } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

const MOCK_GLOBALS = {
  https: { Agent: class { constructor() {} } },
  Date,
  RegExp,
  URL,
  URLSearchParams,
  agentSettings: {
    api: { base_url: 'https://test.example.com' },
    customer_id: 'cust-42',
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

describe('core/references', () => {
  let ctx

  beforeAll(() => {
    ctx = loadScript(
      [
        'modules/core/10_globals.js',
        'modules/core/40_references.js',
      ],
      { ...MOCK_GLOBALS },
    )
  })

  describe('wrapInMarkdownCodeBlock', () => {
    it('wraps string in triple backticks', () => {
      expect(ctx.wrapInMarkdownCodeBlock('hello')).toBe('```\nhello\n```')
    })

    it('escapes unescaped triple backticks inside', () => {
      const result = ctx.wrapInMarkdownCodeBlock('before ``` after')
      expect(result).toContain('\\```')
      expect(result).toBe('```\nbefore \\``` after\n```')
    })

    it('does not double-escape already escaped backticks', () => {
      const result = ctx.wrapInMarkdownCodeBlock('before \\``` after')
      // already escaped — should remain as is
      expect(result).toBe('```\nbefore \\``` after\n```')
    })

    it('escapes already escaped 4 backticks', () => {
      const result = ctx.wrapInMarkdownCodeBlock('before \\```` after')
      // already escaped — should remain as is
      expect(result).toBe('```\nbefore \\`\\``` after\n```')
    })
  })

  describe('getTitleWithUrl', () => {
    it('returns markdown link with correct URL', () => {
      const result = ctx.getTitleWithUrl('intent-1', 'My Article')
      expect(result).toBe(
        '[My Article](https://test.example.com/app/project/cust-42/knowledge-base/article/view/intent-1)',
      )
    })

    it('adds source highlight ranges to article URL when ranges are passed', () => {
      const result = ctx.getTitleWithUrl('intent-1', 'My Article', [
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ])

      expect(result).toBe(
        '[My Article](https://test.example.com/app/project/cust-42/knowledge-base/article/view/intent-1?ctv=1&ctr=0%3A10&ctr=20%3A30)',
      )
    })
  })

  describe('getArticleUrl', () => {
    it('keeps old URL format when source highlight ranges are empty', () => {
      expect(ctx.getArticleUrl('intent-1', [])).toBe(
        'https://test.example.com/app/project/cust-42/knowledge-base/article/view/intent-1',
      )
    })

    it('keeps old URL format when source highlight ranges are null', () => {
      expect(ctx.getArticleUrl('intent-1', null)).toBe(
        'https://test.example.com/app/project/cust-42/knowledge-base/article/view/intent-1',
      )
    })

    it('serializes source highlight ranges as repeated ctr params', () => {
      const url = ctx.getArticleUrl('intent-1', [
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ])

      expect(url).toBe(
        'https://test.example.com/app/project/cust-42/knowledge-base/article/view/intent-1?ctv=1&ctr=0%3A10&ctr=20%3A30',
      )
      expect(url).not.toContain('%5B')
    })

    it('normalizes source highlight ranges before serializing', () => {
      expect(ctx.getArticleUrl('intent-1', [
        { start: 20, end: 30 },
        { start: 0, end: 10 },
        { start: 0, end: 10 },
        { start: 9, end: 12 },
        { start: -1, end: 10 },
      ])).toBe(
        'https://test.example.com/app/project/cust-42/knowledge-base/article/view/intent-1?ctv=1&ctr=20%3A30&ctr=0%3A12',
      )
    })
  })

  describe('addUrlToContextTitle', () => {
    const url = (id) =>
      `https://test.example.com/app/project/cust-42/knowledge-base/article/view/${id}`

    it('replaces context titles with markdown links in-place', () => {
      const fullContext = {
        symbol_code: ['art-1', 'art-2'],
        context: [
          { title: 'First', content: 'text1' },
          { title: 'Second', content: 'text2' },
        ],
      }
      ctx.addUrlToContextTitle(fullContext)
      expect(fullContext.context[0].title).toBe(`[First](${url('art-1')})`)
      expect(fullContext.context[1].title).toBe(`[Second](${url('art-2')})`)
    })

    it('does not modify other context fields', () => {
      const fullContext = {
        symbol_code: ['art-1'],
        context: [{ title: 'Title', content: 'keep me' }],
      }
      ctx.addUrlToContextTitle(fullContext)
      expect(fullContext.context[0].content).toBe('keep me')
    })

    it('adds only the current chunk range to each context title', () => {
      const fullContext = {
        symbol_code: ['art-1', 'art-2', 'art-1'],
        start_index: [0, 30, 10],
        end_index: [10, 40, 20],
        context: [
          { title: 'First', content: 'text1' },
          { title: 'Second', content: 'text2' },
          { title: 'First Again', content: 'text3' },
        ],
      }

      ctx.addUrlToContextTitle(fullContext, true)

      expect(fullContext.context[0].title).toBe(
        `[First](${url('art-1')}?ctv=1&ctr=0%3A10)`,
      )
      expect(fullContext.context[1].title).toBe(
        `[Second](${url('art-2')}?ctv=1&ctr=30%3A40)`,
      )
      expect(fullContext.context[2].title).toBe(
        `[First Again](${url('art-1')}?ctv=1&ctr=10%3A20)`,
      )
    })
  })

  describe('getReferences', () => {
    const url = (id) =>
      `https://test.example.com/app/project/cust-42/knowledge-base/article/view/${id}`

    it('returns empty string when no references', () => {
      expect(ctx.getReferences({ symbol_code: [], title: [] })).toBe('')
    })

    it('builds single reference', () => {
      expect(ctx.getReferences({
        symbol_code: ['art-1'],
        title: ['First Article'],
      })).toBe(
        `### Ссылки для информации:\n\n*  [First Article](${url('art-1')})`,
      )
    })

    it('sorts references by mention count (most first) and deduplicates', () => {
      expect(ctx.getReferences({
        symbol_code: ['a', 'b', 'a', 'c', 'b', 'a'],
        title: ['Article A', 'Article B', 'Article A', 'Article C', 'Article B', 'Article A'],
      })).toBe(
        `### Ссылки для информации:` +
        `\n\n*  [Article A](${url('a')})` +
        `\n\n*  [Article B](${url('b')})` +
        `\n\n*  [Article C](${url('c')})`,
      )
    })

    it('keeps mention-count sorting while adding source highlight ranges per article', () => {
      const fullContext = {
        symbol_code: ['a', 'b', 'a'],
        start_index: [0, 30, 10],
        end_index: [10, 40, 20],
        title: ['Article A', 'Article B', 'Article A'],
      }

      expect(ctx.getReferences(
        fullContext,
        ctx.getSourceHighlightRangesByArticle(fullContext),
      )).toBe(
        `### Ссылки для информации:` +
        `\n\n*  [Article A](${url('a')}?ctv=1&ctr=0%3A20)` +
        `\n\n*  [Article B](${url('b')}?ctv=1&ctr=30%3A40)`,
      )
    })
  })

  describe('enrichMarkdownArticleLinks', () => {
    const url = (id) =>
      `https://test.example.com/app/project/cust-42/knowledge-base/article/view/${id}`

    it('adds source highlight ranges to supported knowledge-base article links', () => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }, { start: 20, end: 30 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(
        `См. [Article A](${url('art-1')}) дальше.`,
        rangesByArticle,
      )).toBe(
        `См. [Article A](${url('art-1')}?ctv=1&ctr=0%3A10&ctr=20%3A30) дальше.`,
      )
    })

    it('enriches an inner article link without changing the outer pseudo-link', () => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(
        `[outer [inner](${url('art-1')})](other)`,
        rangesByArticle,
      )).toBe(
        `[outer [inner](${url('art-1')}?ctv=1&ctr=0%3A10)](other)`,
      )
    })

    it('replaces stale or partial source highlight params from model output', () => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }, { start: 20, end: 30 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(
        `См. [Article A](${url('art-1')}?ctv=1&ctr=999%3A1000)`,
        rangesByArticle,
      )).toBe(
        `См. [Article A](${url('art-1')}?ctv=1&ctr=0%3A10&ctr=20%3A30)`,
      )
    })

    it.each([
      ['one relevant chunk', '20%3A30'],
      ['a narrower excerpt', '2%3A8'],
    ])('preserves %s selected by the model', (_, selectedRange) => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }, { start: 20, end: 30 }]],
      ])
      const markdown =
        `[Article A](${url('art-1')}?ctv=1&ctr=${selectedRange})`

      expect(ctx.enrichMarkdownArticleLinks(markdown, rangesByArticle)).toBe(markdown)
    })

    it('preserves a valid composite selection', () => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }, { start: 20, end: 30 }]],
      ])
      const markdown =
        `[Article A](${url('art-1')}?ctv=1&ctr=1%3A9&ctr=22%3A28)`

      expect(ctx.enrichMarkdownArticleLinks(markdown, rangesByArticle)).toBe(markdown)
    })

    it.each([
      ['another contract version', 'ctv=2&ctr=0%3A10'],
      ['a malformed range', 'ctv=1&ctr=not-a-range'],
      ['a partially out-of-context range', 'ctv=1&ctr=5%3A15'],
    ])('replaces %s with aggregate fallback ranges', (_, query) => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }, { start: 20, end: 30 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(
        `[Article A](${url('art-1')}?${query})`,
        rangesByArticle,
      )).toBe(
        `[Article A](${url('art-1')}?ctv=1&ctr=0%3A10&ctr=20%3A30)`,
      )
    })

    it('preserves unrelated query params and hash while replacing highlight params', () => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(
        `[Article A](${url('art-1')}?lang=ru&ctv=1&ctr=999%3A1000#details)`,
        rangesByArticle,
      )).toBe(
        `[Article A](${url('art-1')}?lang=ru&ctv=1&ctr=0%3A10#details)`,
      )
    })

    it.each([
      ['missing ctv', 'lang=ru&ctr=0%3A10'],
      ['duplicate ctv', 'lang=ru&ctv=1&ctv=1&ctr=0%3A10'],
      [
        'an unsafe integer',
        `lang=ru&ctv=1&ctr=0%3A${Number.MAX_SAFE_INTEGER + 1}`,
      ],
      [
        'a composite with valid and invalid ranges',
        'lang=ru&ctv=1&ctr=0%3A10&ctr=invalid',
      ],
    ])('falls back for %s while preserving unrelated URL parts', (_, query) => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }, { start: 20, end: 30 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(
        `[Article A](${url('art-1')}?${query}#details)`,
        rangesByArticle,
      )).toBe(
        `[Article A](${url('art-1')}?lang=ru&ctv=1&ctr=0%3A10&ctr=20%3A30#details)`,
      )
    })

    it('keeps external URLs, unknown paths and missing ranges unchanged', () => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }]],
      ])
      const markdown =
        `[External](https://other.example.com/app/project/cust-42/knowledge-base/article/view/art-1) ` +
        `[Unknown](https://test.example.com/other/art-1) ` +
        `[Missing](${url('art-2')})`

      expect(ctx.enrichMarkdownArticleLinks(markdown, rangesByArticle)).toBe(markdown)
    })

    it('keeps malformed article URLs unchanged', () => {
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }]],
      ])
      const markdown = '[Broken](https://test.example.com/app/project/cust-42/knowledge-base/article/view/%E0%A4%A)'

      expect(ctx.enrichMarkdownArticleLinks(markdown, rangesByArticle)).toBe(markdown)
    })

    it.each([
      ['encoded forward slash', 'art%2Fsecret', 'art/secret'],
      ['encoded backslash', 'art%5Csecret', 'art\\secret'],
    ])('does not enrich project article codes containing an %s', (_, pathCode, decodedCode) => {
      const markdown = `[Article](${url(pathCode)})`
      const rangesByArticle = new Map([
        [decodedCode, [{ start: 0, end: 10 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(markdown, rangesByArticle)).toBe(markdown)
    })

    it.each([
      'https://test.example.com/app/project/cust-42/knowledge-base/article/views/art-1',
      `${url('art-1')}/extra`,
    ])('keeps a near-match project article path unchanged: %s', (rawUrl) => {
      const markdown = `[Article](${rawUrl})`
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }]],
        ['art-1/extra', [{ start: 0, end: 10 }]],
      ])

      expect(ctx.enrichMarkdownArticleLinks(markdown, rangesByArticle)).toBe(markdown)
    })
  })

  describe('getSourceHighlightRangesByArticle', () => {
    it('groups ranges by article without mutating source arrays', () => {
      const fullContext = {
        symbol_code: ['art-1', 'art-2', 'art-1'],
        start_index: [0, 20, 40],
        end_index: [10, 30, 50],
      }
      const originalSymbolCodes = [...fullContext.symbol_code]
      const originalStartIndexes = [...fullContext.start_index]
      const originalEndIndexes = [...fullContext.end_index]

      const rangesByArticle = ctx.getSourceHighlightRangesByArticle(fullContext)

      expect(Array.from(rangesByArticle.entries())).toEqual([
        ['art-1', [{ start: 0, end: 10 }, { start: 40, end: 50 }]],
        ['art-2', [{ start: 20, end: 30 }]],
      ])
      expect(fullContext.symbol_code).toEqual(originalSymbolCodes)
      expect(fullContext.start_index).toEqual(originalStartIndexes)
      expect(fullContext.end_index).toEqual(originalEndIndexes)
    })

    it('skips missing article codes and invalid range values', () => {
      const rangesByArticle = ctx.getSourceHighlightRangesByArticle({
        symbol_code: [
          'art-1',
          '',
          null,
          'art-2',
          'art-3',
          'art-4',
          'art-5',
          'art-6',
        ],
        start_index: [0, 1, 2, -1, 10, 1.5, Number.MAX_SAFE_INTEGER, 30],
        end_index: [10, 2, 3, 5, 10, 3, Number.MAX_SAFE_INTEGER + 1, 20],
      })

      expect(Array.from(rangesByArticle.entries())).toEqual([
        ['art-1', [{ start: 0, end: 10 }]],
      ])
    })

    it('handles different array lengths by skipping incomplete rows', () => {
      const rangesByArticle = ctx.getSourceHighlightRangesByArticle({
        symbol_code: ['art-1', 'art-2', 'art-3'],
        start_index: [0, 20],
        end_index: [10],
      })

      expect(Array.from(rangesByArticle.entries())).toEqual([
        ['art-1', [{ start: 0, end: 10 }]],
      ])
    })

    it('deduplicates and merges overlapping or adjacent ranges while preserving first primary article range', () => {
      const rangesByArticle = ctx.getSourceHighlightRangesByArticle({
        symbol_code: ['art-1', 'art-1', 'art-1', 'art-1', 'art-1'],
        start_index: [100, 0, 100, 108, 10],
        end_index: [110, 10, 110, 120, 20],
      })

      expect(rangesByArticle.get('art-1')).toEqual([
        { start: 100, end: 120 },
        { start: 0, end: 20 },
      ])
    })

    it('merges ranges separated by one index position', () => {
      const rangesByArticle = ctx.getSourceHighlightRangesByArticle({
        symbol_code: ['art-1', 'art-1'],
        start_index: [0, 10],
        end_index: [9, 20],
      })

      expect(rangesByArticle.get('art-1')).toEqual([
        { start: 0, end: 20 },
      ])
    })

    it('limits normalized ranges to twenty per article', () => {
      const rangesByArticle = ctx.getSourceHighlightRangesByArticle({
        symbol_code: Array.from({ length: 22 }, () => 'art-1'),
        start_index: Array.from({ length: 22 }, (_, index) => index * 3),
        end_index: Array.from({ length: 22 }, (_, index) => index * 3 + 1),
      })

      expect(rangesByArticle.get('art-1')).toHaveLength(20)
      expect(rangesByArticle.get('art-1')[19]).toEqual({ start: 57, end: 58 })
    })

    it('keeps uncapped validation ranges separate from capped fallback ranges', () => {
      const fullContext = {
        symbol_code: Array.from({ length: 21 }, () => 'art-1'),
        start_index: Array.from({ length: 21 }, (_, index) => index * 3),
        end_index: Array.from({ length: 21 }, (_, index) => index * 3 + 1),
      }

      const {
        validationRangesByArticle,
        fallbackRangesByArticle,
      } = ctx.getSourceHighlightRangeMaps(fullContext)

      expect(validationRangesByArticle.get('art-1')).toHaveLength(21)
      expect(validationRangesByArticle.get('art-1')[20]).toEqual({
        start: 60,
        end: 61,
      })
      expect(fallbackRangesByArticle.get('art-1')).toHaveLength(20)
      expect(fallbackRangesByArticle.get('art-1')[19]).toEqual({
        start: 57,
        end: 58,
      })
    })

    it('builds four ranges for one article from contextsearch arrays', () => {
      const rangesByArticle = ctx.getSourceHighlightRangesByArticle({
        symbol_code: ['best-car', 'best-car', 'best-car', 'best-car'],
        start_index: [0, 695, 1400, 2100],
        end_index: [693, 1349, 1700, 2500],
        title: [
          'Лучшая машина',
          'Лучшая машина',
          'Лучшая машина',
          'Лучшая машина',
        ],
      })

      expect(Array.from(rangesByArticle.entries())).toEqual([
        ['best-car', [
          { start: 0, end: 693 },
          { start: 695, end: 1349 },
          { start: 1400, end: 1700 },
          { start: 2100, end: 2500 },
        ]],
      ])
    })
  })

  describe('SHARE_ID URL variant', () => {
    let shareCtx

    beforeAll(() => {
      shareCtx = loadScript(
        [
          'modules/core/10_globals.js',
          'modules/core/40_references.js',
        ],
        {
          ...MOCK_GLOBALS,
          agentSettings: {
            ...MOCK_GLOBALS.agentSettings,
            agent_parameters: { SHARE_ID: 'share-xyz' },
          },
        },
      )
    })

    it('getTitleWithUrl uses /app/share/{SHARE_ID}/article path', () => {
      expect(shareCtx.getTitleWithUrl('intent-1', 'My Article')).toBe(
        '[My Article](https://test.example.com/app/share/share-xyz/article/intent-1)',
      )
    })

    it('getReferences uses share path for all entries', () => {
      expect(shareCtx.getReferences({
        symbol_code: ['a', 'b'],
        title: ['Article A', 'Article B'],
      })).toBe(
        '### Ссылки для информации:' +
        '\n\n*  [Article A](https://test.example.com/app/share/share-xyz/article/a)' +
        '\n\n*  [Article B](https://test.example.com/app/share/share-xyz/article/b)',
      )
    })

    it('adds source highlight params to SHARE_ID article links', () => {
      expect(shareCtx.getArticleUrl('intent-1', [{ start: 0, end: 10 }])).toBe(
        'https://test.example.com/app/share/share-xyz/article/intent-1?ctv=1&ctr=0%3A10',
      )
    })

    it('enriches configured SHARE_ID article links', () => {
      const rawUrl =
        'https://test.example.com/app/share/share-xyz/article/intent-1'
      const rangesByArticle = new Map([
        ['intent-1', [{ start: 0, end: 10 }]],
      ])

      expect(shareCtx.enrichMarkdownArticleLinks(
        `[Shared](${rawUrl})`,
        rangesByArticle,
      )).toBe(
        `[Shared](${rawUrl}?ctv=1&ctr=0%3A10)`,
      )
    })

    it.each([
      ['encoded forward slash', 'art%2Fsecret', 'art/secret'],
      ['encoded backslash', 'art%5Csecret', 'art\\secret'],
    ])('does not enrich shared article codes containing an %s', (_, pathCode, decodedCode) => {
      const rawUrl =
        `https://test.example.com/app/share/share-xyz/article/${pathCode}`
      const markdown = `[Shared](${rawUrl})`
      const rangesByArticle = new Map([
        [decodedCode, [{ start: 0, end: 10 }]],
      ])

      expect(shareCtx.enrichMarkdownArticleLinks(
        markdown,
        rangesByArticle,
      )).toBe(markdown)
    })

    it.each([
      'https://test.example.com/app/share/share-xy/article/art-1',
      'https://test.example.com/app/share/share-xyz/articles/art-1',
      'https://test.example.com/app/share/share-xyz/article/art-1/extra',
    ])('keeps a near-match shared article path unchanged: %s', (rawUrl) => {
      const markdown = `[Shared](${rawUrl})`
      const rangesByArticle = new Map([
        ['art-1', [{ start: 0, end: 10 }]],
        ['art-1/extra', [{ start: 0, end: 10 }]],
      ])

      expect(shareCtx.enrichMarkdownArticleLinks(
        markdown,
        rangesByArticle,
      )).toBe(markdown)
    })
  })

  describe('getReferencesFromScenarios', () => {
    it('returns empty string for empty context', () => {
      expect(ctx.getReferencesFromScenarios([])).toBe('')
      expect(ctx.getReferencesFromScenarios(null)).toBe('')
    })

    it('builds references from context titles', () => {
      const context = [
        { id: 0, title: '[Возврат](https://example.com/1)', content: 'text' },
        { id: 1, title: '[Доставка](https://example.com/2)', content: 'text' },
      ]
      expect(ctx.getReferencesFromScenarios(context)).toBe(
        '### Ссылки для информации:\n\n*  [Возврат](https://example.com/1)\n\n*  [Доставка](https://example.com/2)'
      )
    })

    it('deduplicates titles', () => {
      const context = [
        { id: 0, title: '[A](url)', content: 'text1' },
        { id: 1, title: '[A](url)', content: 'text2' },
        { id: 2, title: '[B](url2)', content: 'text3' },
      ]
      expect(ctx.getReferencesFromScenarios(context)).toBe(
        '### Ссылки для информации:\n\n*  [A](url)\n\n*  [B](url2)'
      )
    })
  })
})
