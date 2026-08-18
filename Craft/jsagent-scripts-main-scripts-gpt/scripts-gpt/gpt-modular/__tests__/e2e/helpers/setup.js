// Общий setup для e2e тестов.
// Тесты импортируют setupE2E(), itIf, runTurn, runDialog, clearDialog —
// и не знают про env-переменные / mock-сервер / health-check.

import { beforeAll, afterAll, it } from 'vitest'
import { createMockServer } from './mock-server.js'
import { loadModulesForMock, modelSupportsThinking } from './agent-registry.js'
import { runTurn as _runTurn, runDialog as _runDialog, clearDialog as _clearDialog, seedDialogHistory as _seedDialogHistory } from './pipeline.js'
import { config } from './config.js'

let server = null
let runEnabled = false

export const supportsThinking = modelSupportsThinking(config.model)

// Регистрирует beforeAll/afterAll для текущего файла.
// Если jsagent недоступен или не задан E2E_CRAFTGPT_URL — выставляет
// runEnabled=false, и itIf пропускает все тесты с предупреждением.
export function setupE2E() {
  beforeAll(async () => {
    runEnabled = false
    const issues = []
    if (!config.craftgptUrl) issues.push('E2E_CRAFTGPT_URL не задан')
    try {
      const r = await fetch(`${config.jsagentUrl}/health`)
      if (!r.ok) issues.push(`jsagent /health → ${r.status}`)
    } catch (e) {
      issues.push(`jsagent недоступен: ${e.message}`)
    }
    if (issues.length > 0) {
      console.warn(`[e2e] SKIPPING: ${issues.join('; ')}`)
      return
    }
    server = createMockServer({ modules: loadModulesForMock(config.model) })
    await server.start(config.mockPort)
    runEnabled = true
  }, 30000)
  afterAll(async () => {
    if (server) { await server.stop(); server = null }
  })
}

// it() с автопропуском, если runEnabled=false.
// itIf.skipIf(cond)(name, fn) — также скипает при cond=true.
function makeItIf(extraSkip = false) {
  const fn = (name, body) => it(name, async (ctx) => {
    if (!runEnabled || extraSkip) return ctx.skip()
    await body(ctx)
  })
  fn.skipIf = (cond) => makeItIf(extraSkip || Boolean(cond))
  return fn
}
export const itIf = makeItIf()

// runTurn / runDialog / clearDialog с зашитыми URL-ами и токеном.
const sharedConfig = {
  mockServerUrl: config.mockUrl,
  craftgptUrl: config.craftgptUrl,
  craftgptToken: config.craftgptToken,
  jsagentUrl: config.jsagentUrl,
}

export async function runTurn(opts) {
  return _runTurn({ ...sharedConfig, ...opts })
}
export async function runDialog(opts) {
  return _runDialog({ ...sharedConfig, ...opts })
}
export async function clearDialog(opts) {
  return _clearDialog({ mockServerUrl: config.mockUrl, ...opts })
}
export async function seedDialogHistory(opts) {
  return _seedDialogHistory({ mockServerUrl: config.mockUrl, ...opts })
}
