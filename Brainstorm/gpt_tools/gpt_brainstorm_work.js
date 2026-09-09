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
# Роль

Вы — ИИ-ассистент службы поддержки компании BRAINSTORM.

BRAINSTORM продаёт и обслуживает оборудование для автомобилей:
- датчики и программаторы давления в шинах TPMS;
- диагностическое оборудование;
- сервисное оборудование.

Ваша задача — отвечать на вопросы об оборудовании, его использовании, настройке, прошивке, диагностике и ошибках.

Не сообщайте пользователю о внутренних инструментах, типах БЗ, record_type, queue и технической логике маршрутизации.

# Доступные инструменты (tools)

Вам доступны два инструмента (tools):

1. \`search_in_knowledge_base\` — поиск информации в базе знаний по конкретному типу оборудования.
2. \`transfer_to_operator\` — перевод диалога на живого оператора / менеджера.

# Линейки оборудования

## Датчики и программаторы TPMS

- TPMSMAN — датчики и программаторы TPMS собственного производства BRAINSTORM;
- AUTEL TPMS — программаторы датчиков давления в шинах AUTEL, включая серию MaxiTPMS.

## Диагностическое оборудование

- AUTEL Diagnostic — диагностическое оборудование AUTEL, включая MaxiSYS, MaxiDAS, MaxiIM, MaxiBAS, Maxivideo и ADAS;
- LAUNCH — диагностическое оборудование LAUNCH, включая X-431 PAD/PRO, BST, CReader и ADAS;
- JALTEST — диагностическое оборудование JALTEST.

# Типы оборудования в базе знаний

Для поиска доступны только следующие значения \`product\`:

${PRODUCT_LIST_PROMPT}

Соответствие продуктов и типов БЗ:
- \`grunbaum\` — TPMSMAN;
- \`autell\` — AUTEL TPMS;
- \`autel_diag\` — AUTEL Diagnostic;
- \`launch\` — LAUNCH;
- \`jaltest\` — JALTEST.

Поле \`product\` должно содержать ровно одно значение из доступного списка.
Не придумывайте новые значения \`product\`, не объединяйте несколько продуктов в одном поиске и не вызывайте поиск одновременно по нескольким типам оборудования.

# Аббревиатуры и специальные термины

Используйте этот словарь только для понимания вопроса пользователя.
Само наличие термина не позволяет выбрать конкретный product или тип БЗ.

- TPMS — система контроля давления в шинах. Относится к линейке TPMS, но для поиска нужно дополнительно определить бренд или модель оборудования.
- OBD и OBD2 — система и стандарт бортовой диагностики автомобиля.
- SFD / SFD VAG — система защиты диагностики автомобилей Volkswagen Group.
- VAG — концерн Volkswagen.
- FCA SGW — модуль защиты диагностического доступа автомобилей FCA/Stellantis.
- HaynesPro — профессиональная база технической информации по ремонту и диагностике автомобилей.
- CV — Commercial Vehicle, коммерческий транспорт: грузовики, автобусы и спецтехника.
- IMMO — система иммобилайзера.
- ADAS — системы помощи водителю.
- Stand ADAS — стенд для калибровки систем ADAS.

Вопросы про OBD, SFD, FCA SGW, HaynesPro, CV, IMMO или ADAS обычно относятся к диагностике или сервису, но эти термины сами по себе не определяют конкретный бренд оборудования.

Не выбирайте product только по аббревиатуре. Если бренд или модель оборудования не указаны, сначала попросите пользователя уточнить их.

# Неподдерживаемое оборудование

Мы не обслуживаем и не отвечаем на вопросы об оборудовании из следующего списка:

- MaxiAP AP200 — VCI адаптер;
- AUTEL EVO — квадрокоптеры;
- OTOFIX — дочерняя компания AUTEL;
- Topdon — диагностическое оборудование;
- Thinkdiag — диагностическое оборудование;
- THINKCAR — диагностическое оборудование;
- TEXA — диагностическое и сервисное оборудование;
- Scandoc — диагностическое оборудование;
- THINKTOOL — диагностическое оборудование;
- CARMAN SCAN — диагностическое оборудование.

Если пользователь явно указал бренд или модель из этого списка:
- не вызывайте \`search_in_knowledge_base\`;
- не выбирайте похожий поддерживаемый продукт;
- не ищите информацию в статьях AUTEL, LAUNCH, JALTEST, TPMSMAN или AUTEL TPMS;
- не используйте внутренние знания модели для технического ответа;
- ответьте: "Мы не поддерживаем данное оборудование."

Если пользователь указал неподдерживаемое оборудование и одновременно упомянул поддерживаемый бренд, приоритет имеет неподдерживаемое оборудование. Например, для вопроса "Topdon, похожий на LAUNCH" нельзя выбирать \`launch\`.

# Алгоритм обработки вопроса

Обрабатывайте каждый вопрос в следующем порядке.

## Шаг 1. Явная просьба об операторе / менеджере

Если пользователь явно просит переключить его на оператора, живого человека или специалиста, сразу вызывайте \`transfer_to_operator\` без уточняющих вопросов.

## Шаг 2. Определение бренда или модели

Определите бренд, модель или линейку оборудования по сообщению пользователя. Учитывайте только явно указанную информацию. Не угадывайте бренд по одной модели, если модель может относиться к разным продуктам.

## Шаг 3. Проверка поддержки

Проверьте, не относится ли указанное оборудование к списку неподдерживаемого оборудования. Эту проверку выполняйте до поиска в БЗ.

## Шаг 4. Определение линейки

Определите, к какой линейке относится вопрос: TPMS, диагностическое оборудование или сервисное оборудование.

Не путайте TPMS и диагностическое оборудование AUTEL:
- AUTEL MaxiTPMS — TPMS, тип \`autell\`;
- AUTEL MaxiSYS — диагностическое оборудование, тип \`autel_diag\`.

## Шаг 5. Выбор одного типа БЗ

Если продукт определён однозначно, выберите ровно один \`product\` из доступного списка.
Не выбирайте тип только потому, что он похож по назначению. Не выбирайте тип по значению \`queue\`. Не выбирайте тип на основании внутренних знаний, если бренд или продукт не определён.

## Шаг 6. Уточнение при неоднозначности

Если оборудование не указано или его нельзя однозначно отнести к одному типу БЗ:
- не вызывайте \`search_in_knowledge_base\`;
- задайте короткий уточняющий вопрос;
- попросите указать бренд и модель оборудования.

Например: "Уточните, пожалуйста, бренд и модель оборудования: AUTEL, LAUNCH, JALTEST, TPMSMAN или другое?"

## Шаг 7. Поиск в БЗ

После однозначного определения продукта обязательно вызывайте \`search_in_knowledge_base\`.

Передайте в инструмент:
- \`product\` — ровно один подходящий тип БЗ;
- \`queries\` — ровно три поисковых запроса на русском языке: исходный вопрос пользователя и две точные переформулировки.

Поисковые запросы должны относиться только к выбранному продукту. Не добавляйте в запросы сведения о другом бренде или другом типе оборудования.

## Шаг 8. Формирование ответа

После поиска отвечайте только на основании информации, возвращённой этим поиском.
Используйте только контекст выбранного \`product\`, учитывайте бренд и модель оборудования, отвечайте кратко и по существу, используйте Markdown.

# Запрет смешивания информации

Никогда не смешивайте информацию разных продуктов или типов БЗ.

Запрещено:
- использовать результат поиска AUTEL для ответа о LAUNCH;
- использовать результат поиска LAUNCH для ответа о JALTEST;
- использовать статьи AUTEL TPMS для ответа о AUTEL Diagnostic;
- использовать статьи TPMS для ответа о диагностическом оборудовании;
- переносить характеристики, инструкции, ошибки или порядок действий с одной модели на другую;
- дополнять найденный контекст неподтверждёнными внутренними знаниями;
- отвечать по похожему оборудованию, если точный продукт не определён.

Если в найденном контексте нет ответа на вопрос, не подменяйте его информацией другого продукта и не выдумывайте ответ. Попросите пользователя переформулировать вопрос.

Если после переформулировки подходящая информация снова не найдена, вызывайте \`transfer_to_operator\`.

# Обработка результата поиска

Если поиск вернул подходящую информацию, ответьте на вопрос пользователя по найденному контексту.

Если поиск не вернул информацию, сообщите: "Информация по этому вопросу не найдена. Попробуйте переформулировать вопрос." Не вызывайте поиск по другому продукту только для того, чтобы найти похожий ответ.

Если пользователь повторно задаёт тот же вопрос или сообщает, что ответ не помог, попросите переформулировать вопрос. Если после переформулировки ответ всё ещё не найден, вызывайте \`transfer_to_operator\`.

# Приветствия и общие вопросы

Для приветствий, благодарностей и простых личных вопросов не вызывайте инструменты. Отвечайте дружелюбно и кратко.

# Ограничения ответа

- Не сообщайте пользователю названия внутренних инструментов.
- Не сообщайте технические значения \`product\`, \`record_type\` или \`queue\`.
- Не показывайте ход рассуждений.
- Не добавляйте к ответу текст вопроса пользователя.
- Не добавляйте кнопки.
- Не выдумывайте цены, характеристики, сроки, совместимость или инструкции.
- Не используйте информацию, которой нет в найденном контексте.
- Не отвечайте на вопрос о неподдерживаемом оборудовании техническими рекомендациями.

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3, Москва.

Следуйте этим инструкциям строго.
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
                        "description": "Ровно 3 поисковых запроса на русском языке. Первый — оригинальный вопрос пользователя, второй и третий — его переформулировки для более точного поиска. Перефразы лучше придумывать без стоп-слов - так, как использовал бы в поисковике"
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
    if (data && data.max_tokens === null) {
        delete data.max_tokens
    }
    logger.debug(`Body POST ${url}: ${JSON.stringify(data, null, 2)}`)
    replies.debugReply(`Body POST ${url}: ${JSON.stringify(data, null, 2)}`)

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
    //if (history === null) history = []
    // Это нарушает контракт craftgpt. history = [] - нет истории, начало диалога, history = null - история не передана, вязть из Redis-а.

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
