// @module core/globals
// Кросс-модульные переменные, утилиты, конфиг общего назначения

let currentDate = new Date().toLocaleDateString('ru-RU')

let ITEM_TYPES = {
    function: "function",
    commit: "commit",
}

let ROLE = {
    "USER": "user",
    "BOT": "assistant",
    "FUNCTION": "function"
}

// --- Config from agentSettings ---

let BASE_URL = agentSettings.api?.base_url
let CUSTOMER_ID = agentSettings.customer_id

const _AGENT_PARAMETERS = agentSettings.agent_parameters ?? {}
let {
    DEBUG = false,
    SHOW_THINKING = false,
} = _AGENT_PARAMETERS

let ARTICLES = agentSettings.articles ?? {}

const _STANDARD_MESSAGES = agentSettings.standard_messages ?? {}
let {
    DEFAULT_ERROR_MSG = "Что-то пошло не так, попробуйте еще раз.",
    TIMEOUT_ERROR_MSG = "Извините за задержку! Похоже, запрос занял больше времени, чем ожидалось. Пожалуйста, попробуйте снова позже.",
    NO_CONTEXT_TEXT = "К сожалению я не знаю ответ на ваш вопрос. Попробуйте задать вопрос иначе.",
} = _STANDARD_MESSAGES

// --- Validators ---

function validateHttpUrl(url) {
  if (typeof url !== 'string') {
    throw new TypeError('URL должен быть строкой')
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL должен начинаться с http:// или https://')
  }
  return true
}


// --- Utilities ---

let TRANS_MAP = {
'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
}
let CYRILLIC_REGEX = new RegExp(`[${Object.keys(TRANS_MAP).join('')}]`, 'g')

function translit(text) {
    return text
        .toLowerCase()
        .replace(CYRILLIC_REGEX, match => TRANS_MAP[match] || '')
        .replace(/\s+/g, '_')  // заменяем пробелы на _
        .replace(/[^a-z0-9_]/g, ''); // удаляем всё, кроме латиницы, цифр и _
}

