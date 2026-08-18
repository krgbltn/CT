import { describe, it, expect, vi } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

function makeHttpCtx(apiSettings = {}, proxySettings = {}, llmSettings = {}) {
  return {
    https: { Agent: class { constructor(opts) { this.opts = opts } } },
    URL,
    JSON,
    axios: { post: vi.fn() },
    logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    agentSettings: {
      api: {
        url_llm: 'http://llm:3020',
        llm_auth_token: 'test-token',
        ...apiSettings,
      },
      proxy: { USE_PROXY: false, ...proxySettings },
      llm_settings: llmSettings,
    },
  }
}


describe('http module config', () => {
  it('builds LLM endpoint URLs from base url', () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    expect(ctx.__getLetVar('URL_LLM')).toBe('http://llm:3020/context_query')
    expect(ctx.__getLetVar('URL_LLM_SMALLTALK')).toBe('http://llm:3020/query')
    expect(ctx.__getLetVar('URL_LLM_REPHRASE')).toBe('http://llm:3020/rephrase')
    expect(ctx.__getLetVar('URL_LLM_COMMIT_TOOL_RESPONSES')).toBe('http://llm:3020/tool_responses')
  })

  it('reads auth token from settings', () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    expect(ctx.__getLetVar('LLM_AUTH_TOKEN')).toBe('test-token')
  })

  it('defaults timeout to 60 seconds', () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    expect(ctx.__getLetVar('LLM_TIMEOUT')).toBe(60)
  })

  it('reads custom timeout from settings', () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx({}, {}, { timeout: 200 }))
    expect(ctx.__getLetVar('LLM_TIMEOUT')).toBe(200)
  })

  it('defaults reject_unauthorized to true', () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    expect(ctx.__getLetVar('REJECT_UNAUTHORIZED')).toBe(true)
  })

  it('reads reject_unauthorized: false from settings', () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx({ reject_unauthorized: false }))
    expect(ctx.__getLetVar('REJECT_UNAUTHORIZED')).toBe(false)
  })
})


describe('_callLLM', () => {
  it('sends POST and returns response data', async () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    const responseData = { answer: 'Привет!', tool_calls: [], log_id: 'abc123' }
    ctx.axios.post.mockResolvedValue({ data: responseData })

    const result = await ctx._callLLM(
      'http://llm:3020/query',
      { question: 'Привет', instruction: 'Ты ассистент' },
      { debugReply() {} },
    )

    expect(result).toEqual(responseData)
    const [url, data, config] = ctx.axios.post.mock.calls[0]
    expect(url).toBe('http://llm:3020/query')
    expect(data).toEqual({ question: 'Привет', instruction: 'Ты ассистент' })
    expect(config.headers['Authorization']).toBe('Bearer test-token')
    expect(config.timeout).toBe(60000)
  })

  it('adds proxy config when USE_PROXY is true', async () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx(
      {},
      { USE_PROXY: true, url: 'proxy.example.com', port: 3128 },
    ))
    ctx.axios.post.mockResolvedValue({ data: { answer: '', tool_calls: [], log_id: '' } })

    await ctx._callLLM('http://llm:3020/query', {}, { debugReply() {} })

    const config = ctx.axios.post.mock.calls[0][2]
    expect(config.proxy).toEqual({
      protocol: 'http',
      host: 'proxy.example.com',
      port: 3128,
    })
  })

  it('does not add proxy when USE_PROXY is false', async () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    ctx.axios.post.mockResolvedValue({ data: { answer: '', tool_calls: [], log_id: '' } })

    await ctx._callLLM('http://llm:3020/query', {}, { debugReply() {} })

    const config = ctx.axios.post.mock.calls[0][2]
    expect(config.proxy).toBeUndefined()
  })

  it('throws and calls debugReply on error', async () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    const error = new Error('timeout')
    error.response = { data: { detail: 'timeout' }, status: 504, headers: {} }
    ctx.axios.post.mockRejectedValue(error)

    const debugReply = vi.fn()
    await expect(ctx._callLLM('http://llm:3020/query', {}, { debugReply }))
      .rejects.toThrow('timeout')

    expect(debugReply).toHaveBeenCalled()
  })

  it('calls extraErrorHandling callback on error', async () => {
    const ctx = loadScript(['modules/core/20_http.js'], makeHttpCtx())
    const error = new Error('fail')
    ctx.axios.post.mockRejectedValue(error)

    const extraHandler = vi.fn()
    await expect(ctx._callLLM('http://llm:3020/query', {}, { debugReply() {} }, extraHandler))
      .rejects.toThrow('fail')

    expect(extraHandler).toHaveBeenCalledWith(error)
  })
})
