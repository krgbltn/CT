// @requires modules/models/qwen.js
// @requires gpt_core.js


// === Продукты и маппинги ===

const PRODUCTS = agentSettings.products ?? {}
const PRODUCT_ENUM = Object.keys(PRODUCTS)

const PRODUCT_LIST_PROMPT = Object.entries(PRODUCTS)
    .map(([key, p], i) => `${i+1}. **${p.name}** (${key}) — ${p.description}`)
    .join('\n')

const PRODUCT_TOOL_HINT = Object.entries(PRODUCTS)
    .map(([key, p]) => `${key}: ${p.description}`)
    .join('. ')


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

# Как работать с инструментами

У тебя есть доступ к инструменту **search_in_knowledge_base** для поиска информации в базе знаний.

## Алгоритм работы:

1. **Определи продукт** из вопроса пользователя. Используй список доступных продуктов выше.
2. **Если продукт определён ясно** — вызови \`search_in_knowledge_base\` с параметрами:
   - \`product\` — ключ продукта (grunbaum, autell, jaltest, autel_diag или launch)
   - \`queries\` — ровно 3 поисковых запроса на русском языке (оригинальный вопрос + 2 варианта)
3. **Если продукт НЕ определён или не ясен** — задай уточняющий вопрос пользователю. НЕ вызывай инструмент в этом случае. Перечисли доступные категории оборудования.
4. **Если после поиска ответ не найден или информации недостаточно** — попроси пользователя переформулировать вопрос иначе.
5. **Если пользователь переформулировал вопрос, но ответить по-прежнему не получается** — вызови \`transfer_to_operator\`.

## Когда вызывать transfer_to_operator:
- Пользователь **повторно задаёт один и тот же вопрос** (или переформулированный, но суть та же) и ответить не удалось
- LLM **не смогла найти ответ** в базе знаний даже после переформулировки
- Пользователь **явно просит** переключиться на оператора или позвать живого человека

## ВАЖНО:
- **ВСЕГДА** вызывай \`search_in_knowledge_base\` для вопросов об оборудовании, его настройке, использовании, прошивке, ошибках и т.д.
- **НЕ отвечай** на вопросы об оборудовании без вызова инструмента — ты можешь не знать актуальную информацию.
- **Сначала** попроси переформулировать вопрос, **только потом** переводи на оператора.
- Для **личных вопросов** (приветствие, благодарность, "как дела") — отвечай дружелюбно без вызова инструмента.

# Формат ответа

- Отвечай **кратко и по существу**
- Используй **Markdown** для форматирования
- **Не выдумывай** информацию, которой нет в найденном контексте
- **Не добавляй** размышления и текст вопроса к ответу
- **Не добавляй** кнопки в ответ

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3 (Москва)
`

let LLM_SYSTEM_TEMPLATE_SMALLTALK = `
Ты интеллектуальный помощник компании BRAINSTORM.
BRAINSTORM — российская компания, которая продаёт и обслуживает диагностическое оборудование для автомобилей.

Отвечай на личные вопросы (приветствие, благодарность, "как дела") дружелюбно.
Если вопрос связан с оборудованием — направь на использование инструмента поиска.
Не предлагай обращаться в поддержку, ты и есть бот поддержки.
Отвечай кратко. Используй Markdown.
Если не можешь ответить, попроси переформулировать вопрос.
`

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

async function searchInKnowledgeBase({ product, queries }) {
    const recordType = product
    const text = Array.isArray(queries) ? queries.join(" ") : queries

    logger.info(`Search in KB: record_type=${recordType}, text=${text}`)

    let response
    try {
        response = await axios.post(URL_CONTEXT_SEARCH, {
            text: text,
            customer_id: CUSTOMER_ID,
            record_type: recordType,
            catalog_symbol_code: null,
            output_format: "json-vikhr",
            size: MAX_CONTEXTS > 0 ? MAX_CONTEXTS : 100,
        })
    } catch (e) {
        logger.error(`Context search error: ${e}`)
        return `ERROR: ошибка поиска в базе знаний: ${e.message}`
    }

    const context = response.data.context || []
    if (context.length === 0) {
        return "Информация не найдена по данному продукту. Попробуйте переформулировать вопрос."
    }

    const queueValue = PRODUCTS[recordType]?.queue || "другое"
    slotManager.setSlot("queue", queueValue)
    logger.info(`Set queue slot: ${queueValue} for product: ${recordType}`)

    return context.map(c =>
        `## ${c.title}:\n\`\`\`\n${c.content}\n\`\`\``
    ).join("\n\n...\n\n")
}


const transfer_to_operator = scenario(null)(function () {
    const queueValue = getSlotValue("queue") || "другое"
    slotManager.setSlot("queue", queueValue)
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})


const availableFunctions = {
    search_in_knowledge_base,
    transfer_to_operator,
}


let TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_in_knowledge_base",
            "description": "Поиск информации в базе знаний BRAINSTORM по конкретному продукту. ВСЕГДА вызывай этот инструмент, когда пользователь задаёт вопрос об оборудовании, его настройке, использовании, прошивке, ошибках. Укажи product — категорию оборудования, и queries — список поисковых запросов.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product": {
                        "type": "string",
                        "enum": PRODUCT_ENUM,
                        "description": `Категория оборудования для поиска. ${PRODUCT_TOOL_HINT}.`
                    },
                    "queries": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Ровно 3 поисковых запроса на русском языке. Первый — оригинальный вопрос пользователя, второй и третий — его переформулировки для более точного поиска."
                    }
                },
                "required": ["product", "queries"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "transfer_to_operator",
            "description": "Переводит диалог на живого оператора. Вызывай ТОЛЬКО после того, как попросил пользователя переформулировать вопрос и он это сделал, но ответить по-прежнему не удалось. Также вызывай, если пользователь повторно задаёт тот же вопрос или явно просит соединить с оператором/позвать человека.",
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
    return _mainBody(replies, {
        use_rag: false,
        use_rephrase: false,
        use_smalltalk: true,
    })
}


runEntrypoint()
