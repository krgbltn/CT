// Единственный источник правды по env-параметрам e2e-тестов.
// Если нужно добавить новую переменную окружения — добавляй сюда.
//
// Значения берутся из process.env. Перед чтением подгружается
// __tests__/e2e/.env (если есть). Шаблон — .env.example рядом.

import { config as loadDotenv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: resolve(__dirname, '../.env') })

const mockPort = Number(process.env.E2E_MOCK_PORT ?? 9999)

export const config = {
  mockPort,
  mockUrl: `http://localhost:${mockPort}`,
  jsagentUrl: process.env.E2E_JSAGENT_URL ?? 'http://localhost:3366',
  craftgptUrl: process.env.E2E_CRAFTGPT_URL ?? '',
  craftgptToken: process.env.E2E_CRAFTGPT_TOKEN ?? '',
  // Имя модуля модели (ключ MODEL_FILES в agent-registry).
  model: process.env.E2E_MODEL ?? 'qwen',
  // Порт тестового MCP-сервера (mockPort занят заглушкой botmediator/contextsearch).
  mcpPort: Number(process.env.E2E_MCP_PORT ?? 9998),
}
