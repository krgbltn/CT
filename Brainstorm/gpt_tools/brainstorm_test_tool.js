// @requires modules/models/qwen.js
// @requires gpt_core.js


// === Продукты и маппинги ===

const PRODUCTS = agentSettings.products ?? {}
const PRODUCT_ENUM = Object.keys(PRODUCTS)

const PRODUCT_LIST_PROMPT = Object.entries(PRODUCTS)
    .map(([key, p], i) => `${i+1}. **${p.name}** (${key}) — ${p.description}`)
    .join('\n')


// === Промпты ===

let LLM_SYSTEM_TEMPLATE = `
# Идентичность и роль

Ты — ИИ ассистент службы поддержки компании BRAINSTORM.
BRAINSTORM — российская компания, которая продаёт и обслуживает диагностическое оборудование для автомобилей: датчики давления в шинах (TPMS), сканеры, программаторы.

Твоя задача — помогать клиентам с вопросами об оборудовании, его использовании, настройке и обслуживании.

# Доступные продукты

Тебе доступны следующие категории оборудования:

${PRODUCT_LIST_PROMPT}

# Оборудование, которое НЕ поддерживается

Мы НЕ обслуживаем:
- MaxiAP AP200 — VCI адаптер
- AUTEL EVO — квадрокоптеры
- OTOFIX — дочерняя компания AUTEL
- Topdon — диагностическое оборудование
- Thinkdiag — диагностическое оборудование
- THINKCAR — диагностическое оборудование
- TEXA — диагностическое и сервисное оборудование
- Scandoc — диагностическое оборудование
- THINKTOOL — диагностическое оборудование
- CARMAN SCAN — диагностическое оборудование

Если вопрос по оборудованию не из списка — скажи "Мы не поддерживаем данное оборудование."

# Использование инструментов

## Доступные инструменты

1. \`transfer_to_operator\` — переключение на живого оператора

## Когда использовать transfer_to_operator

ОБЯЗАТЕЛЬНО вызывай \`transfer_to_operator\` в следующих случаях:

- Пользователь **явно просит переключить на оператора** или позвать живого человека
- Ты **не смог найти ответ** на вопрос в базе знаний
- Пользователь **повторно задаёт один и тот же вопрос** после неудачного ответа
- Вопрос **выходит за рамки** твоей компетенции

НЕ вызывай \`transfer_to_operator\`:

- Для **приветствий, благодарностей и личных вопросов** ("как дела") — отвечай дружелюбно
- Когда пользователь **не просил** выполнять действие

# Формат ответа

- Отвечай **кратко и по существу**
- Используй **Markdown** для форматирования
- **Не выдумывай** информацию
- **Не добавляй** размышления и текст вопроса к ответу

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3 (Москва)
`

let LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE
let SMALLTALK_TEMPLATE = `{question}`

let RAG_TEMPLATE = `{question}

# Найденная информация:

{context}`

const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`

const RAG_JOIN_SEP = "\n\n...\n\n"


// === Prompt & Model config ===

applyPromptOverrides()
applyModelConfig()


// === Tool functions ===

const transfer_to_operator = scenario(null)(function () {
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})


const availableFunctions = {
    transfer_to_operator,
}


let TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "transfer_to_operator",
            "description": "Переводит диалог на живого оператора. Вызывай, если не нашел ответа, не можешь самостоятельно решить проблему пользователя или если пользователь явно попросил тебя соединить его с оператором.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


// === _main ===

async function _main(replies) {
    return _mainBody(replies)
}


runEntrypoint()
