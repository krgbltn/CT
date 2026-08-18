// E2E: MCP-сервер → стандартные тулзы агента.
// Поднимаем локальный MCP-сервер (helpers/mcp-test-server.js) с инструментами
// add/multiply и журналом запросов, подключаем его агенту через mcp_servers
// и просим посчитать пример со сложением и умножением. По журналу сервера
// проверяем, что агент запросил tools/list и вызывал tools/call, а по ответу —
// что результат вычислений дошёл до пользователя.

import { describe, expect, beforeAll, afterAll } from 'vitest'
import { setupE2E, itIf, runTurn, clearDialog } from './helpers/setup.js'
import { startMcpTestServer } from './helpers/mcp-test-server.js'

setupE2E()

// Промпт-калькулятор: запрещаем модели считать в уме, чтобы она ходила в тулзы.
// Имена инструментов не упоминаем — они неизвестны до подключения к MCP-серверу,
// модель выбирает их сама из списка доступных тулзов.
const CALC_PROMPT = `Ты — ассистент-калькулятор. Сам ты считать НЕ умеешь и никогда не считаешь в уме.
Любую арифметику выполняй строго через доступные инструменты сложения и умножения.
Вызывай по одному инструменту за раз и жди его результата. Не переспрашивай пользователя.
Итоговый ответ пользователю — число, которое вернул последний инструмент.`

describe('e2e mcp: gpt_tools', () => {
  let mcpServer = null

  beforeAll(async () => {
    mcpServer = await startMcpTestServer()
  })
  afterAll(async () => {
    if (mcpServer) {
      await mcpServer.stop()
      mcpServer = null
    }
  })

  itIf('агент считает (7 + 5) * 3 через MCP-инструменты', async () => {
    const r = await runTurn({
      client: 'gpt_tools',
      question: 'Посчитай выражение (7 + 5) * 3: сначала сложи 7 и 5, затем умножь результат на 3. В ответе укажи итоговое число.',
      contextsearchResponses: [],
      settingsOverrides: {
        prompts: {
          system_template: CALC_PROMPT,
          system_template_smalltalk: CALC_PROMPT,
        },
        mcp_servers: [
          { alias: 'calc', transport: 'http', url: mcpServer.url },
        ],
      },
      timeoutMs: 150000,
    })
    const journal = () => JSON.stringify(mcpServer.calls, null, 2)
    expect(r.error).toBeNull()

    // Агент сходил за списком инструментов (live tools/list на каждое сообщение)
    expect(
      mcpServer.calls.some(c => c.method === 'tools/list'),
      `expected tools/list in MCP journal: ${journal()}`
    ).toBe(true)

    // Оба инструмента вызваны через MCP
    const toolCalls = mcpServer.toolCalls()
    const names = toolCalls.map(c => c.tool)
    expect(names, `expected add in MCP calls: ${journal()}`).toContain('add')
    expect(names, `expected multiply in MCP calls: ${journal()}`).toContain('multiply')

    // add получил именно 7 и 5 (в любом порядке) и вернул 12
    const addCall = toolCalls.find(c => c.tool === 'add')
    expect(addCall.args.a + addCall.args.b, `unexpected add args: ${journal()}`).toBe(12)
    expect(addCall.result).toBe(12)

    // Результат последнего вызова дошёл до пользователя, итог верный — 36
    const lastCall = toolCalls[toolCalls.length - 1]
    expect(
      r.answer,
      `expected answer to contain ${lastCall.result}; replies: ${JSON.stringify(r.replies.map(x => x.MessageMarkdown))}`
    ).toContain(String(lastCall.result))
    expect(r.answer).toContain('36')

    await clearDialog({ dialogId: r.dialogId })
  })
})
