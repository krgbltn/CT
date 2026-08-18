// Тестовый MCP-сервер для e2e: два инструмента-калькулятора (add, multiply)
// и журнал всех входящих запросов. По журналу тест проверяет, что агент
// реально ходил в MCP: запрашивал tools/list и вызывал tools/call
// с ожидаемыми аргументами.
//
// Используем низкоуровневый Server из @modelcontextprotocol/sdk (devDependency
// этого репозитория): схемы инструментов описываются обычным JSON Schema,
// без zod.
//
// Транспорт — Streamable HTTP в stateless-режиме: на каждый POST создаётся
// свежая пара Server + transport (наш mcp-client в jsagent и так открывает
// новое соединение на каждую операцию).

import { createServer } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { config } from './config.js'

const _NUMBER_ARGS_SCHEMA = {
  type: 'object',
  properties: {
    a: { type: 'number', description: 'Первое число' },
    b: { type: 'number', description: 'Второе число' },
  },
  required: ['a', 'b'],
}

const _TOOLS = [
  { name: 'add', description: 'Складывает два числа a и b, возвращает сумму', inputSchema: _NUMBER_ARGS_SCHEMA },
  { name: 'multiply', description: 'Умножает два числа a и b, возвращает произведение', inputSchema: _NUMBER_ARGS_SCHEMA },
]

const _CALC = {
  add: (a, b) => a + b,
  multiply: (a, b) => a * b,
}

export async function startMcpTestServer({ port = config.mcpPort } = {}) {
  // Журнал запросов: {method} для служебных,
  // {method: 'tools/call', tool, args, result} для вызовов инструментов.
  const calls = []

  function buildMcpServer() {
    const server = new Server(
      { name: 'e2e-calc', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      calls.push({ method: 'tools/list' })
      return { tools: _TOOLS }
    })
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params
      const fn = _CALC[name]
      if (!fn) {
        calls.push({ method: 'tools/call', tool: name, args, result: null })
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
      const result = fn(args.a, args.b)
      calls.push({ method: 'tools/call', tool: name, args, result })
      return { content: [{ type: 'text', text: String(result) }] }
    })
    return server
  }

  const httpServer = createServer(async (req, res) => {
    // stateless-режим: сессий нет, GET (SSE-стрим) и DELETE не поддерживаем
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }))
      return
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    let body
    try {
      body = raw ? JSON.parse(raw) : undefined
    } catch {
      res.writeHead(400).end()
      return
    }

    const mcpServer = buildMcpServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      mcpServer.close()
    })
    await mcpServer.connect(transport)
    await transport.handleRequest(req, res, body)
  })

  await new Promise((resolveListen, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, () => resolveListen())
  })

  return {
    port,
    // jsagent крутится на этом же хосте, так что localhost достижим
    url: `http://localhost:${port}/mcp`,
    calls,
    toolCalls: () => calls.filter(c => c.method === 'tools/call'),
    async stop() {
      await new Promise(r => httpServer.close(r))
    },
  }
}
