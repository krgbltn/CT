// @requires modules/models/qwen.js
// @requires gpt_core.js

// === Промпты ===
// Замените этот шаблон для нового проекта. Правила вызова тулзов должны соответствовать TOOLS ниже.
let LLM_SYSTEM_TEMPLATE = `
# Роль
Ты — бот-помощник службы поддержки компании {НАЗВАНИЕ_КОМПАНИИ}.

# Правила общения
- Отвечай на языке клиента.
- Используй контекст базы знаний как основной источник информации о компании.
- Не выдумывай цены, статусы, даты, условия, правила или другие данные компании.
- Не упоминай тулзы, сценарии, внутренние системы и технические детали маршрутизации.
- На приветствия и благодарности отвечай кратко, не вызывая тулзы.

# Контекст базы знаний
Контекст из базы знаний передаётся перед сообщением клиента между маркерами [КОНТЕКСТ БАЗЫ ЗНАНИЙ] и [КОНЕЦ КОНТЕКСТА]. Используй только релевантные фрагменты. Если контекст не содержит ответа на вопрос об услугах компании, вызови тулзу оператора.

# Тулзы
- Вызови \`transfer_to_operator\` без текстового ответа клиенту, если клиент явно просит оператора, жалуется, проявляет агрессию либо вопрос нельзя решить по контексту и правилам.
- Вызови \`finish_dialog\` без текстового ответа клиенту, если клиент прощается или явно подтверждает, что дальнейшая помощь не нужна.
- Никогда не пиши клиенту название тулзы или служебную команду.

Сегодня: ${currentDate}
`

// Единый базовый промпт нужен для кэширования общего префикса Qwen. При необходимости переопределите его через agentSettings.prompts.
let LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE
let SMALLTALK_TEMPLATE = `{question}`

let RAG_TEMPLATE = `[КОНТЕКСТ БАЗЫ ЗНАНИЙ]

{context}
[КОНЕЦ КОНТЕКСТА]

{question}
`

const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`

const RAG_JOIN_SEP = "\n\n...\n\n"
const DB_LANGUAGE = "на языке клиента"
let REPHRASE_PROMPT_1 = `Сгенерируй {samples_per_generation} поисковых запросов ${DB_LANGUAGE} к фразе '{question}', используя только детали из предыдущего диалога.
Ответь в JSON: {{samples: list[str]}}.`
let REPHRASE_PROMPT_2 = `Сгенерируй {samples_per_generation} кратких и разнообразных поисковых сниппетов ${DB_LANGUAGE} к фразе '{question}'.
Ответь в JSON: {{samples: list[str]}}.`


// === Настройка промптов и модели ===
applyPromptOverrides()
applyModelConfig()


// === Базовые сценарные тулзы ===
// ID статей всегда берутся из agentSettings. Не указывайте здесь ID конкретного окружения.
const transfer_to_operator = scenario(null)(function () {
    const articleId = ARTICLES.TRANSFER_FOR_OPERATOR?.ID
    if (!articleId) {
        return 'ОШИБКА: не настроен articles.TRANSFER_FOR_OPERATOR.ID'
    }
    return switchredirect(articleId)
})

const finish_dialog = scenario(null)(function () {
    const articleId = ARTICLES.FINISH_DIALOG?.ID
    if (!articleId) {
        return 'ОШИБКА: не настроен articles.FINISH_DIALOG.ID'
    }
    return switchredirect(articleId)
})


const availableFunctions = {
    transfer_to_operator,
    finish_dialog,
}


let TOOLS = [
    {
        type: 'function',
        function: {
            name: 'transfer_to_operator',
            description: 'Переводит диалог на оператора без текстового ответа клиенту. Вызывай при явной просьбе об операторе, жалобе, агрессии или если вопрос нельзя решить по контексту базы знаний и правилам.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'finish_dialog',
            description: 'Завершает диалог без текстового ответа клиенту. Вызывай только если клиент прощается или явно подтверждает, что дальнейшая помощь не нужна.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
]


async function _main(replies) {
    return _mainBody(replies)
}

runEntrypoint()
