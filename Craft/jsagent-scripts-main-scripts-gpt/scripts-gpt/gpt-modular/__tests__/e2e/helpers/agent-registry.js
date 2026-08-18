// Реестр клиентов и модулей для e2e-тестов.
// Загружает с диска gpt_core.js + выбранную модель (как модули) и клиентские скрипты,
// подменяет URL-ы в settings на mock и craftgpt.

import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../..')

export const MODULE_IDS = {
  CORE: 'module:core',
  MODEL: 'module:model',
}

// Какие model-модули можно подключить. supportsThinking читается
// из самого модуля при загрузке — единственный источник правды.
export const MODEL_FILES = {
  qwen: 'modules/models/qwen.js',
  qwen_yandex: 'modules/models/qwen_yandex.js',
  default: 'modules/models/default.js',
  gigachat: 'modules/models/gigachat.js',
}

export const CLIENTS = ['gpt_tools', 'gpt_ida_qwen', 'gpt_rupost']

// Клиенты, у которых однотурновое emit-сценария на оператора срабатывает на простом запросе.
// IDA — нет сценария "оператор" вообще. RuPost — промпт требует сперва уточнить вопрос
// (двухтурновый flow), один turn не сработает.
export const CLIENTS_WITH_OPERATOR = ['gpt_tools']

// Клиенты, на которых осмысленно проверять многоходовую историю универсальными
// вопросами. RuPost исключён — его промпт замкнут на тематику "Почта России"
// и отказывается отвечать на всё остальное.
export const CLIENTS_FOR_HISTORY_TESTS = ['gpt_tools', 'gpt_ida_qwen']

const CLIENT_CONFIG = {
  gpt_tools: {
    code: 'client_scripts/gpt_tools.js',
    settings: 'client_scripts/gpt_tools_settings.json',
  },
  gpt_ida_qwen: {
    code: 'client_scripts/gpt_ida_qwen.js',
    settings: 'client_scripts/gpt_ida_qwen_settings.json',
  },
  gpt_rupost: {
    code: 'client_scripts/gpt_rupost.js',
    settings: 'client_scripts/gpt_rupost_settings.json',
  },
}

function readRepo(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8')
}

// Pair[] для "module" агента
function moduleParams(code) {
  return [
    { n: 'agent-code', v: code },
    { n: 'agent-is-module', v: 'true' },
    { n: 'agent-api-version', v: 'v1' },
    { n: 'aiassist-agent-id', v: 'aiassist2' },
    { n: 'agent-settings', v: '{}' },
    { n: 'agent-modules', v: '' },
  ]
}

// Загружает тела gpt_core и выбранной модели, возвращает map для регистрации в mock-сервере.
export function loadModulesForMock(modelName = 'qwen') {
  const file = MODEL_FILES[modelName]
  if (!file) throw new Error(`Unknown model: ${modelName}; known: ${Object.keys(MODEL_FILES).join(', ')}`)
  const core = readRepo('gpt_core.js')
  const model = readRepo(file)
  return {
    [MODULE_IDS.CORE]: moduleParams(core),
    [MODULE_IDS.MODEL]: moduleParams(model),
  }
}

// Реальное значение supportsThinking — запускаем модуль модели в изолированном
// vm-контексте, как jsagent. Корректно отрабатывает let/const и переопределения.
export function modelSupportsThinking(modelName = 'qwen') {
  const file = MODEL_FILES[modelName]
  if (!file) throw new Error(`Unknown model: ${modelName}`)
  const src = readRepo(file) + '\nfunction __get(name) { return eval(name) }'
  const ctx = createContext({})
  runInContext(src, ctx)
  return ctx.__get('supportsThinking') === true
}

// Возвращает settings с подменёнными URL-ами + перекрытыми параметрами.
function buildSettings({ baseSettings, mockUrl, craftgptUrl, craftgptToken, overrides = {} }) {
  const settings = JSON.parse(JSON.stringify(baseSettings))
  settings.api = settings.api ?? {}
  settings.api.url_mediator_service = `${mockUrl}/webhooks/mediator/messages`
  settings.api.url_context_search = mockUrl
  settings.api.url_llm = craftgptUrl
  settings.api.base_url = mockUrl
  if (craftgptToken) {
    settings.api.llm_auth_token = craftgptToken
  }

  // overrides.api / overrides.agent_parameters / overrides.standard_messages / etc.
  // Мердж по верхнему уровню секций.
  for (const [section, values] of Object.entries(overrides)) {
    if (typeof values === 'object' && values !== null && !Array.isArray(values)) {
      settings[section] = { ...(settings[section] ?? {}), ...values }
    } else {
      settings[section] = values
    }
  }
  return settings
}

// Возвращает Pair[] для IncomingMessage.agent_params.
// settingsOverrides — патч над json-ом настроек клиента.
export function getAgentParams({ client, mockUrl, craftgptUrl, craftgptToken, settingsOverrides = {} }) {
  const config = CLIENT_CONFIG[client]
  if (!config) throw new Error(`Unknown client: ${client}`)
  const code = readRepo(config.code)
  const baseSettings = JSON.parse(readRepo(config.settings))
  const settings = buildSettings({ baseSettings, mockUrl, craftgptUrl, craftgptToken, overrides: settingsOverrides })

  return [
    { n: 'agent-code', v: code },
    { n: 'agent-settings', v: JSON.stringify(settings) },
    { n: 'agent-timeout', v: '120000' },
    { n: 'agent-api-version', v: 'v1' },
    { n: 'aiassist-agent-id', v: 'aiassist2' },
    { n: 'agent-is-module', v: 'false' },
    { n: 'agent-modules', v: `${MODULE_IDS.MODEL},${MODULE_IDS.CORE}` },
  ]
}
