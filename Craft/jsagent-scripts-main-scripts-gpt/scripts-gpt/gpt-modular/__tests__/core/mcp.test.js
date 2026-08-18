import { describe, it, expect, vi } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

const MODULES = [
  'modules/core/10_globals.js',
  'modules/core/65_mcp.js',
]

function makeGlobals(mcpServers, mcp, { TOOLS, availableFunctions } = {}) {
  return {
    Date,
    RegExp,
    agentSettings: {
      customer_id: 'cust-1',
      agent_parameters: {},
      standard_messages: {},
      articles: {},
      mcp_servers: mcpServers,
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mcp,
    TOOLS: TOOLS ?? [],
    availableFunctions: availableFunctions ?? {},
  }
}

const FORECAST_TOOL = {
  name: 'get_forecast',
  description: 'Прогноз погоды',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
}

describe('registerMcpTools', () => {
  it('превращает инструменты MCP-сервера в TOOLS и availableFunctions', async () => {
    const mcp = {
      listTools: vi.fn().mockResolvedValue([FORECAST_TOOL]),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '+25°C' }], isError: false }),
    }
    const server = { alias: 'weather', transport: 'http', url: 'https://mcp.example/mcp', enabled: true }
    const ctx = loadScript(MODULES, makeGlobals([server], mcp))

    await ctx.registerMcpTools()

    expect(mcp.listTools).toHaveBeenCalledWith(server)
    expect(ctx.TOOLS).toHaveLength(1)
    expect(ctx.TOOLS[0]).toEqual({
      type: 'function',
      function: {
        name: 'weather__get_forecast',
        description: 'Прогноз погоды',
        parameters: FORECAST_TOOL.inputSchema,
      },
    })
    expect(typeof ctx.availableFunctions['weather__get_forecast']).toBe('function')
  })

  it('маршрутизирует вызов тулзы в mcp.callTool и сплющивает результат в строку', async () => {
    const mcp = {
      listTools: vi.fn().mockResolvedValue([FORECAST_TOOL]),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '+25°C' }], isError: false }),
    }
    const server = { alias: 'weather', url: 'https://mcp.example/mcp' }
    const ctx = loadScript(MODULES, makeGlobals([server], mcp))
    await ctx.registerMcpTools()

    const result = await ctx.availableFunctions['weather__get_forecast']({ city: 'Москва' })

    expect(mcp.callTool).toHaveBeenCalledWith(server, 'get_forecast', { city: 'Москва' })
    expect(result).toBe('+25°C')
  })

  it('помечает результат с isError префиксом ERROR', async () => {
    const mcp = {
      listTools: vi.fn().mockResolvedValue([FORECAST_TOOL]),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'нет такого города' }], isError: true }),
    }
    const ctx = loadScript(MODULES, makeGlobals([{ alias: 'weather', url: 'u' }], mcp))
    await ctx.registerMcpTools()

    const result = await ctx.availableFunctions['weather__get_forecast']({ city: 'x' })
    expect(result).toBe('ERROR: нет такого города')
  })

  it('уважает tool_filter', async () => {
    const mcp = {
      listTools: vi.fn().mockResolvedValue([
        FORECAST_TOOL,
        { name: 'get_alerts', description: '', inputSchema: { type: 'object', properties: {} } },
      ]),
      callTool: vi.fn(),
    }
    const server = { alias: 'weather', url: 'u', tool_filter: ['get_forecast'] }
    const ctx = loadScript(MODULES, makeGlobals([server], mcp))
    await ctx.registerMcpTools()

    expect(ctx.TOOLS.map(t => t.function.name)).toEqual(['weather__get_forecast'])
  })

  it('регистрирует несколько тулз с одного сервера', async () => {
    const ALERTS_TOOL = {
      name: 'get_alerts',
      description: 'Погодные предупреждения',
      inputSchema: { type: 'object', properties: { region: { type: 'string' } } },
    }
    const mcp = {
      listTools: vi.fn().mockResolvedValue([FORECAST_TOOL, ALERTS_TOOL]),
      callTool: vi.fn()
        .mockResolvedValueOnce({ content: [{ type: 'text', text: '+25°C' }], isError: false })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'штормовое' }], isError: false }),
    }
    const server = { alias: 'weather', url: 'https://mcp.example/mcp' }
    const ctx = loadScript(MODULES, makeGlobals([server], mcp))
    await ctx.registerMcpTools()

    expect(ctx.TOOLS.map(t => t.function.name)).toEqual(['weather__get_forecast', 'weather__get_alerts'])
    expect(Object.keys(ctx.availableFunctions).sort())
      .toEqual(['weather__get_alerts', 'weather__get_forecast'])

    expect(await ctx.availableFunctions['weather__get_forecast']({ city: 'Москва' })).toBe('+25°C')
    expect(await ctx.availableFunctions['weather__get_alerts']({ region: 'СЗ' })).toBe('штормовое')
    expect(mcp.callTool).toHaveBeenNthCalledWith(1, server, 'get_forecast', { city: 'Москва' })
    expect(mcp.callTool).toHaveBeenNthCalledWith(2, server, 'get_alerts', { region: 'СЗ' })
  })

  it('регистрирует тулзы с нескольких серверов с раздельной маршрутизацией', async () => {
    const CALC_TOOL = {
      name: 'add',
      description: 'Сложение',
      inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
    }
    // Один общий mock на оба сервера: различаем по alias из serverConfig.
    const mcp = {
      listTools: vi.fn(async (srv) =>
        srv.alias === 'weather' ? [FORECAST_TOOL] : [CALC_TOOL]
      ),
      callTool: vi.fn(async (srv, name) => {
        if (srv.alias === 'weather' && name === 'get_forecast') {
          return { content: [{ type: 'text', text: '+25°C' }], isError: false }
        }
        if (srv.alias === 'calc' && name === 'add') {
          return { content: [{ type: 'text', text: '42' }], isError: false }
        }
        return { content: [{ type: 'text', text: 'нет' }], isError: true }
      }),
    }
    const weather = { alias: 'weather', url: 'https://weather/mcp' }
    const calc = { alias: 'calc', transport: 'sse', url: 'https://calc/sse' }
    const ctx = loadScript(MODULES, makeGlobals([weather, calc], mcp))

    await ctx.registerMcpTools()

    expect(mcp.listTools).toHaveBeenCalledTimes(2)
    expect(ctx.TOOLS.map(t => t.function.name).sort())
      .toEqual(['calc__add', 'weather__get_forecast'])

    // Тулза каждого сервера ходит именно в свой сервер.
    expect(await ctx.availableFunctions['weather__get_forecast']({ city: 'Москва' })).toBe('+25°C')
    expect(await ctx.availableFunctions['calc__add']({ a: 40, b: 2 })).toBe('42')
    expect(mcp.callTool).toHaveBeenCalledWith(weather, 'get_forecast', { city: 'Москва' })
    expect(mcp.callTool).toHaveBeenCalledWith(calc, 'add', { a: 40, b: 2 })
  })

  it('один недоступный сервер не мешает зарегистрировать другой', async () => {
    const mcp = {
      listTools: vi.fn(async (srv) => {
        if (srv.alias === 'broken') throw new Error('ECONNREFUSED')
        return [FORECAST_TOOL]
      }),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    }
    const globals = makeGlobals([
      { alias: 'broken', url: 'https://broken/mcp' },
      { alias: 'weather', url: 'https://weather/mcp' },
    ], mcp)
    const ctx = loadScript(MODULES, globals)

    await ctx.registerMcpTools()

    expect(ctx.TOOLS.map(t => t.function.name)).toEqual(['weather__get_forecast'])
    expect(globals.logger.error).toHaveBeenCalled()
  })

  it('пропускает выключенный сервер', async () => {
    const mcp = { listTools: vi.fn(), callTool: vi.fn() }
    const ctx = loadScript(MODULES, makeGlobals([{ alias: 'weather', url: 'u', enabled: false }], mcp))
    await ctx.registerMcpTools()

    expect(mcp.listTools).not.toHaveBeenCalled()
    expect(ctx.TOOLS).toHaveLength(0)
  })

  it('недоступный сервер логируется и не ломает обработку', async () => {
    const mcp = {
      listTools: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      callTool: vi.fn(),
    }
    const globals = makeGlobals([{ alias: 'weather', url: 'u' }], mcp)
    const ctx = loadScript(MODULES, globals)

    await expect(ctx.registerMcpTools()).resolves.toBeUndefined()
    expect(ctx.TOOLS).toHaveLength(0)
    expect(globals.logger.error).toHaveBeenCalled()
  })

  // --- уникальность имён тулз (фейл при коллизии) ---

  it('бросает ошибку при дублирующем alias и одинаковом имени инструмента', async () => {
    const mcp = {
      listTools: vi.fn().mockResolvedValue([FORECAST_TOOL]),
      callTool: vi.fn(),
    }
    const globals = makeGlobals([
      { alias: 'weather', url: 'https://a/mcp' },
      { alias: 'weather', url: 'https://b/mcp' },
    ], mcp)
    const ctx = loadScript(MODULES, globals)

    await expect(ctx.registerMcpTools()).rejects.toThrow(/конфликт имён тулз/)

    expect(ctx.TOOLS.map(t => t.function.name)).toEqual(['weather__get_forecast'])
    expect(Object.keys(ctx.availableFunctions)).toEqual(['weather__get_forecast'])
  })

  it('бросает ошибку, когда два сервера без alias дают одинаковый префикс mcp__', async () => {
    const mcp = {
      listTools: vi.fn().mockResolvedValue([FORECAST_TOOL]),
      callTool: vi.fn(),
    }
    const globals = makeGlobals([
      { url: 'https://a/mcp' },
      { url: 'https://b/mcp' },
    ], mcp)
    const ctx = loadScript(MODULES, globals)

    await expect(ctx.registerMcpTools()).rejects.toThrow(/конфликт имён тулз/)
    expect(ctx.TOOLS.map(t => t.function.name)).toEqual(['mcp__get_forecast'])
    expect(globals.logger.warn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('бросает ошибку, когда translit схлопывает разные имена инструментов', async () => {
    const tools = [
      { name: 'get-forecast', description: 'd1', inputSchema: { type: 'object', properties: {} } },
      { name: 'get.forecast', description: 'd2', inputSchema: { type: 'object', properties: {} } },
    ]
    const mcp = { listTools: vi.fn().mockResolvedValue(tools), callTool: vi.fn() }
    const globals = makeGlobals([{ alias: 'weather', url: 'u' }], mcp)
    const ctx = loadScript(MODULES, globals)

    await expect(ctx.registerMcpTools()).rejects.toThrow(/конфликт имён тулз/)
    expect(ctx.TOOLS.map(t => t.function.name)).toEqual(['weather__getforecast'])
  })

  it('бросает ошибку при коллизии со штатной тулзой клиентского скрипта', async () => {
    const existingTool = { type: 'function', function: { name: 'mcp__get_forecast', description: 'existing' } }
    const existingFn = () => 'existing'
    const mcp = {
      listTools: vi.fn().mockResolvedValue([FORECAST_TOOL]),
      callTool: vi.fn(),
    }
    const globals = makeGlobals(
      [{ alias: 'mcp', url: 'u' }],
      mcp,
      { TOOLS: [existingTool], availableFunctions: { mcp__get_forecast: existingFn } }
    )
    const ctx = loadScript(MODULES, globals)

    await expect(ctx.registerMcpTools()).rejects.toThrow(/конфликт имён тулз/)

    expect(ctx.TOOLS).toHaveLength(1)
    expect(ctx.TOOLS[0].function.description).toBe('existing')
    expect(ctx.availableFunctions['mcp__get_forecast']).toBe(existingFn)
  })

  it('не бросает, когда у двух серверов нет alias, но имена инструментов разные', async () => {
    const mcp = {
      listTools: vi.fn(async (srv) =>
        srv.url === 'https://a/mcp' ? [FORECAST_TOOL] : [{ name: 'add', description: 'addition', inputSchema: { type: 'object', properties: {} } }]
      ),
      callTool: vi.fn(),
    }
    const globals = makeGlobals([
      { url: 'https://a/mcp' },
      { url: 'https://b/mcp' },
    ], mcp)
    const ctx = loadScript(MODULES, globals)

    await expect(ctx.registerMcpTools()).resolves.toBeUndefined()
    expect(ctx.TOOLS.map(t => t.function.name).sort()).toEqual(['mcp__add', 'mcp__get_forecast'])
  })
})
