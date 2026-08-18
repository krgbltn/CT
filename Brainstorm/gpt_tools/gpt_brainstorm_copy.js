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

Вы — ИИ ассистент службы поддержки компании BRAINSTORM.
BRAINSTORM — российская компания, которая продаёт и обслуживает диагностическое оборудование для автомобилей: датчики давления в шинах (TPMS), сканеры, программаторы.
Ваша задача — помогать клиентам с вопросами об оборудовании, его использовании, настройке и обслуживании.

# Доступные возможности

У вас есть доступ к следующим возможностям:

1. **Инструменты действий** — вы можете выполнять конкретные действия через специальные инструменты (tools): поиск в базе знаний и перевод на оператора.

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

## Когда использовать инструменты

ОБЯЗАТЕЛЬНО используйте инструменты в следующих случаях:

- Пользователь **явно просит переключить на оператора** или позвать живого человека — сразу вызывай \`transfer_to_operator\`, без уточняющих вопросов.
- Вопрос касается **конкретного оборудования BRAINSTORM** (настройка, использование, прошивка, ошибки), продукт **явно указан** и ты уверен в категории — вызывай \`search_in_knowledge_base\`.
- Пользователь **не может найти ответ** или повторно задаёт один и тот же вопрос после поиска в базе знаний — сначала попроси переформулировать, при повторном неуспехе вызывай \`transfer_to_operator\`.

НЕ используйте инструменты:

- Для **приветствий, благодарностей и личных вопросов** ("как дела") — отвечай дружелюбно без вызова инструмента.
- Когда пользователь **не просил** выполнять действие.
- Когда **продукт не определён** — задай уточняющий вопрос, перечисли доступные категории оборудования.

## Доступные инструменты

Вам доступны следующие инструменты (детальные описания будут предоставлены отдельно):

1. \`search_in_knowledge_base\` — поиск информации в базе знаний BRAINSTORM по конкретному продукту (категории оборудования). 
2. \`transfer_to_operator\` — переключение на живого оператора.

# Работа с базой знаний

## Правила использования контекста

**ОБЯЗАТЕЛЬНО:**

- **Приоритизируйте информацию из контекста** над вашими внутренними знаниями для вопросов о компании и ее продуктах.
- **Не выдумывайте** детали, которых нет в контексте (цены, характеристики, сроки).
- **ВСЕГДА вызывай \`search_in_knowledge_base\`** для вопросов об оборудовании, его настройке, использовании, прошивке, ошибках — не отвечай на такие вопросы без вызова инструмента.

**ЗАПРЕЩЕНО:**

- **НЕ ПРЕДПОЛАГАЙ** и не угадывай продукт. Если пользователь указал модель без бренда (например "TS508") — ты НЕ ЗНАЕШЬ, к какому бренду она относится, пока не посмотришь в базе знаний.
- **НЕ вызывай \`search_in_knowledge_base\`**, если продукт не определён — сначала задай уточняющий вопрос: "Какое оборудование вы используете — AUTEL, LAUNCH, JALTEST или другое?"
- **НЕ выдумывай** информацию, которой нет в найденном контексте.

# Формат ответа

- Отвечай **кратко и по существу**
- Используй **Markdown** для форматирования
- **Не добавляй** размышления и текст вопроса к ответу
- **Не добавляй** кнопки в ответ

# Обработка особых ситуаций

## Пользователь явно просит оператора

Если пользователь явно просит переключить на оператора или живого человека ("позови оператора", "переключи на человека", "оператор") — **сразу вызывай \`transfer_to_operator\`**, не задавай уточняющих вопросов и не проси переформулировать.

## Личный вопрос

Для приветствий, благодарностей и личных вопросов — отвечай дружелюбно без вызова инструмента.

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3 (Москва)

---

Следуйте этим инструкциям строго. Вызывайте инструменты только когда это действительно необходимо для выполнения действий.
`
LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE
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

async function search_in_knowledge_base({ product, queries }) {
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
        logger.info(`Context empty for record_type=${recordType}, text=${text}`)
        return "Информация не найдена по данному продукту. Попробуйте переформулировать вопрос."
    }

    logger.info(`Found ${context.length} contexts for record_type=${recordType}: ${context.map(c => c.title).join(', ')}`)

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


// Синтетический контекст: craftgpt парсит tool_calls и конвертирует маркер
// ".tool_name" только на /context_query с НЕПУСТЫМ контекстом (как у rupost).
// С пустым контекстом на любом эндпоинте маркер возвращается как обычный текст.
function buildSyntheticContext(question) {
    const docs = []
    docs.push({
        doc_id: 'synthetic-products',
        title: 'Каталог оборудования BRAINSTORM',
        content: `Тебе доступны следующие категории оборудования:\n\n${PRODUCT_LIST_PROMPT}\n\nПо вопросам об оборудовании, его настройке, использовании, прошивке и ошибках — находи информацию через инструмент search_in_knowledge_base, указывая product (категорию из перечня выше) и queries (список поисковых запросов).`,
    })
    const q = (question || '').toLowerCase()
    for (const key of Object.keys(PRODUCTS)) {
        const product = PRODUCTS[key]
        const synonyms = [product.name, key, product.queue]
            .filter(Boolean)
            .map(s => s.toLowerCase())
        if (synonyms.some(s => q.includes(s))) {
            docs.push({
                doc_id: `synthetic-${key}`,
                title: product.name,
                content: product.description,
            })
        }
    }
    return docs
}


// === Override _callLLM: debug-лог тела POST к craftgpt ===

const _coreCallLLM = _callLLM
_callLLM = async function(url, data, replies, extraErrorHandling = null) {
    logger.debug(`Body POST ${url}: ${JSON.stringify(data, null, 2)}`)
    return _coreCallLLM(url, data, replies, extraErrorHandling)
}


// === Override sendMessageToLLM: route tools through /context_query ===

async function sendMessageToLLM(question, dialog_id, history, replies, opts = {}) {
    const {
        use_rag = true,
        use_think = ENABLE_THINKING_SMALLTALK,
        use_rephrase = DO_REPHRASE,
        use_smalltalk = SMALLTALK_IF_NO_CONTEXT,
        topicSlots = {}
    } = opts

    history = buildLLMHistory(history, [])

    let contextsearch_texts = question
    if (use_rephrase) {
        let rephrases2 = await rephrase(question, REPHRASE_PROMPT_2, dialog_id, history, replies)
        logger.info(`rephrases2 значение: ${rephrases2}`)
        contextsearch_texts = [question]
        contextsearch_texts = contextsearch_texts.concat(rephrases2)
        logger.info(`contextsearch_texts значение: ${contextsearch_texts}`)
    }

    let context
    let fullContext
    let scenariosContext
    let sourceHighlightValidationRangesByArticle = new Map()
    let sourceHighlightFallbackRangesByArticle = new Map()

    if (!use_rag) {
        context = []
    } else if (CONTEXT_FROM_SCENARIOS) {
        scenariosContext = await getContextFromScenarios(contextsearch_texts, replies)
        context = convertScenariosToContext(scenariosContext.simple)
        if (ADD_COMPLEX_SCENARIOS_TO_TOOLS && scenariosContext.complex) {
            addCustomScenariosToTools(convertScenariosToTools(scenariosContext.complex))
        }
    } else {
        fullContext = await getContext(contextsearch_texts, replies)

        if (ENABLE_SOURCE_HIGHLIGHTS) {
            const sourceHighlightRangeMaps = getSourceHighlightRangeMaps(fullContext)
            sourceHighlightValidationRangesByArticle =
                sourceHighlightRangeMaps.validationRangesByArticle
            sourceHighlightFallbackRangesByArticle =
                sourceHighlightRangeMaps.fallbackRangesByArticle
        }

        addUrlToContextTitle(fullContext, ENABLE_SOURCE_HIGHLIGHTS)
        context = fullContext.context
    }

    let response
    if (context?.length === 0) {
        logger.info(`Context not found for question "${question}"`)
        replies.debugReply(`Context not found for question "${question}"`)

        if (TOOLS.length > 0) {
            // With tools — go through rag() (/context_query) with a NON-EMPTY
            // synthetic context. Модель в tool-режиме возвращает маркер
            // ".tool_name", /context_query превращает его в tool_calls (как у
            // rupost). С пустым контекстом craftgpt не парсит маркер.
            response = await rag(question, buildSyntheticContext(question), dialog_id, history, replies)
        } else if (use_smalltalk) {
            response = await smalltalk(question, dialog_id, history, replies)
            await _printResponse(response, replies)
            return response
        } else {
            replies.markdownReply(NO_CONTEXT_TEXT)
            return {answer: NO_CONTEXT_TEXT, tool_calls: [], log_id: null}
        }
    } else {
        response = await rag(question, context, dialog_id, history, replies)
    }

    response = enrichResponseArticleLinks(
        response,
        sourceHighlightValidationRangesByArticle,
        sourceHighlightFallbackRangesByArticle,
    )

    let references = ''
    if (SHOW_REFERENCES) {
        references = CONTEXT_FROM_SCENARIOS
            ? getReferencesFromScenarios(context)
            : getReferences(fullContext, sourceHighlightFallbackRangesByArticle)
    }

    await _printResponse(response, replies)

    if (SHOW_REFERENCES && references) {
        replies.markdownReply(references, { references: "true" })
    }

    if (SHOW_CONTEXT) {
        const contextToShow = CONTEXT_FROM_SCENARIOS ? scenariosContext : fullContext
        replies.textReply(
            "<h3>Контекст</h3>" + JSON.stringify(contextToShow, null, 2),
            {},
            true
        )
    }
    return response
}


// === _main ===

async function _main(replies) {
    return _mainBody(replies, {
        use_rag: false,
        use_rephrase: false,
        use_smalltalk: true,
    })
}


runEntrypoint()
