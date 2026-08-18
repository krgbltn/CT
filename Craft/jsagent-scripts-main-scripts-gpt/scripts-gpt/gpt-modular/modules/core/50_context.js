// @module core/context
// @requires modules/core/http.js
// Поиск контекста в базе знаний и обработка сценариев

let URL_CONTEXT_SEARCH = new URL('/search', agentSettings.api?.url_context_search).href
let URL_CONTEXT_SEARCH_SCENARIOS = new URL('/search_in_scenarios', agentSettings.api?.url_context_search).href

const _CONTEXT_SETTINGS = agentSettings.context_settings ?? {}
let {
    LAST_CONTEXT_PRICE = 0.19,
    OTHER_CONTEXT_PRICE = 3.1,
    ADD_OTHER_CONTEXT = true,
    MAX_CONTEXTS = 10,
    MAX_COMPLEX_SCENARIOS = 5,
    MAX_COMPLEX_QUESTION_EXAMPLES_LENGTH = 1000,
    CONTEXT_FROM_SCENARIOS = false,
    ADD_COMPLEX_SCENARIOS_TO_TOOLS = false,
    FILTERS = [],
    SIMPLE_INCLUDE_QUESTIONS = false,
    SIMPLE_MAX_QUESTIONS = 5,
    SIMPLE_INCLUDE_CONDITIONS = false,
    SIMPLE_TITLE_WITH_URL = true,
    RECORD_TYPE = null,
    CATALOG_IDS = null,
    TAGS = null,
} = _CONTEXT_SETTINGS


async function getContext(question, replies) {
    replies.debugReply(JSON.stringify(question))
    logger.debug(`Call CONTEXT SEARCH service`)
    let response
    try {
        response = await axios.post(
            URL_CONTEXT_SEARCH,
            {
                text: question,
                customer_id: CUSTOMER_ID,
                record_type: RECORD_TYPE,
                catalog_symbol_code: CATALOG_IDS,
                tags: TAGS,
                output_format: "json-vikhr",
                filters: FILTERS,
                size: MAX_CONTEXTS > 0 ? MAX_CONTEXTS : 100,
            }
        )

        logger.info("Response from CONTEXT SEARCH:" + JSON.stringify(response.data))
    } catch(e) {
        logger.error(`Error requesting context search: ${e}.`)
        replies.debugReply(`Error requesting context search: ${e}.`)
        _debugAxiosError(e, replies)
        throw e
    }
    const fullContext = response.data
    if (MAX_CONTEXTS > -1) {
        Object.keys(fullContext).forEach(key => {
            fullContext[key] = fullContext[key].slice(0, MAX_CONTEXTS)
        })
    }
    return fullContext
}


async function getContextFromScenarios(question, replies) {
    replies.debugReply(JSON.stringify(question))
    logger.debug(`Call CONTEXT SEARCH service (scenarios)`)
    let response
    try {
        response = await axios.post(
            URL_CONTEXT_SEARCH_SCENARIOS,
            {
                text: question,
                customer_id: CUSTOMER_ID,
                record_type: RECORD_TYPE,
                catalog_symbol_code: CATALOG_IDS,
                tags: TAGS,
                filters: FILTERS,
                size: Math.max(
                    MAX_CONTEXTS > 0 ? MAX_CONTEXTS : 100,
                    MAX_COMPLEX_SCENARIOS > 0 ? MAX_COMPLEX_SCENARIOS : 100,
                ),
            }
        )

        logger.info("Response from CONTEXT SEARCH (scenarios):" + JSON.stringify(response.data))
    } catch(e) {
        logger.error(`Error requesting context search (scen.): ${e}.`)
        replies.debugReply(`Error requesting context search (scen.): ${e}.`)
        _debugAxiosError(e, replies)
        throw e
    }
    const fullContext = response.data
    if (MAX_CONTEXTS > -1) {
        fullContext.simple = fullContext.simple.slice(0, MAX_CONTEXTS)
    }
    if (MAX_COMPLEX_SCENARIOS > -1) {
        fullContext.complex = fullContext.complex.slice(0, MAX_COMPLEX_SCENARIOS)
    }
    return fullContext
}


// --- Scenario conversion helpers ---

function isExceededLimitQuestions(ctxPartsLength, question) {
    const possibleLength = ctxPartsLength + question.length
    const maxLength = MAX_COMPLEX_QUESTION_EXAMPLES_LENGTH
    const isExceeded = possibleLength > maxLength
    if (isExceeded)
        logger.warn(`Length context exceeded(max:${MAX_COMPLEX_QUESTION_EXAMPLES_LENGTH}, possible:${possibleLength}). Question example is deleted: '${question}'`)
    return isExceeded
}


// Исключает цепочки с недопустимыми типами блоков
function isAvailableChain(excludedTypes, chain) {
    const types = chain.blocks?.map(b => b.type) || []
    return !types.some(type => excludedTypes.includes(type))
}


/**
 * Преобразует условия в читаемую строку с кастомизируемыми операторами
 */
function formatConditionsToString(posConditions, negConditions, options = {}) {
    const {
        ifPrefix = 'ЕСЛИ',
        andNotPrefix = 'И НЕ',
        notPrefix = 'НЕ',
        andOperator = 'И',
        orOperator = 'ИЛИ'
    } = options

    const formatCondition = (cond) => {
        return `${cond.slot} ${cond.condition} "${cond.value}"`
    }

    const formatAndGroup = (andGroup) => {
        if (!andGroup || andGroup.length === 0) return ''
        return andGroup.map(formatCondition).join(` ${andOperator} `)
    }

    const buildOrString = (conditions) => {
        if (!conditions || conditions.length === 0) return { str: '', compound: false }
        const groups = conditions.map(formatAndGroup).filter(Boolean)
        if (groups.length === 0) return { str: '', compound: false }
        if (groups.length === 1) return { str: groups[0], compound: false }
        return {
            str: groups.map(g => `(${g})`).join(` ${orOperator} `),
            compound: true,
        }
    }

    const pos = buildOrString(posConditions)
    const neg = buildOrString(negConditions)

    if (!pos.str && !neg.str) return ''

    const wrap = (s) => `(${s})`

    if (pos.str && neg.str) {
        const p = pos.compound ? wrap(pos.str) : pos.str
        const n = neg.compound ? wrap(neg.str) : neg.str
        return `${ifPrefix} ${p} ${andNotPrefix} ${n}`
    }
    if (pos.str) {
        return `${ifPrefix} ${pos.str}`
    }
    const n = neg.compound ? wrap(neg.str) : neg.str
    return `${ifPrefix} ${notPrefix} ${n}`
}


/** Преобразует ответ из контекстсерча в формате цепочки сценария в текст для LLM.
 * Структура цепочки: @see Chain typedef в исходных скриптах.
 */
function formatChainSimple(chain) {
    let ctxParts = []
    const blocks = chain.blocks || []

    for (const block of blocks) {
        if (!block?.type) continue

        if (block.type === "message") {
            ctxParts.push(block.text || "")
        } else if (block.type === "button") {
            ctxParts.push(`\n### ${block.text || ""}`)
        } else if (block.type === "start") {
            ctxParts.push(`\n## ${block.text || ""}`)
        } else if (block.type === "questions" && SIMPLE_INCLUDE_QUESTIONS) {
            if (Array.isArray(block.text) && block.text.length > 0) {
                const questions = block.text.slice(0, SIMPLE_MAX_QUESTIONS)
                ctxParts.push(`Примеры вопросов: ${questions.join(", ")}`)
            }
        } else if (block.type === "condition" && SIMPLE_INCLUDE_CONDITIONS) {
            const condStr = formatConditionsToString(
                block.pos_conditions, block.neg_conditions
            )
            if (condStr) {
                ctxParts.push(`**Условие:** ${condStr}`)
            }
        }
    }

    return ctxParts.join("\n")
}


function formatChainComplex(chain) {
    let ctxParts = []
    let ctxPartsLength = 0
    const blocks = chain.blocks || []
    if (!isAvailableChain(["button", "condition"], chain))
        return ""
    for (const block of blocks) {
        if (!block?.type) continue
        if (block.type === "questions") {
            block.text.forEach(question => {
                if (question && !isExceededLimitQuestions(ctxPartsLength, question)) {
                    ctxPartsLength += question.length
                    ctxParts.push(question)
                }
            })
        }
    }
    return ctxParts.join(",")
}


function extractTitleFromChain(chain, availableTypes, withUrl) {
    for (const block of (chain.blocks ?? [])) {
        if (availableTypes.includes(block.type)) {
            if (withUrl)
                return getTitleWithUrl(block.symbol_code, block.text)
            else
                return block.text
        }
    }
    return ""
}


function extractSymbolCodeFromChain(chain, availableTypes) {
    for (const block of (chain.blocks ?? [])) {
        if (availableTypes.includes(block.type)) {
            return block.symbol_code
        }
    }
    return ""
}


function convertScenariosSimple(chains) {
    let contexts = []
    let docId = 0
    for (const chain of chains) {
        if (!chain?.blocks?.length) continue
        const content = formatChainSimple(chain)
        if (!content) continue
        contexts.push({
            id: docId++,
            title: extractTitleFromChain(chain, ["start"], SIMPLE_TITLE_WITH_URL),
            content: content
        })
    }
    return contexts
}


function convertScenariosComplex(chains) {
    let contexts = []
    let docId = 0
    for (const chain of chains) {
        if (!chain?.blocks?.length) continue
        const content = formatChainComplex(chain)
        if (!content) continue
        const symbol_code = extractSymbolCodeFromChain(chain, ["complex_scenario"])
        if (!symbol_code) continue
        const title = extractTitleFromChain(chain, ["complex_scenario"], false)
        if (!title) continue
        contexts.push({
            id: docId++,
            title: title,
            content: content,
            symbol_code: symbol_code,
        })
    }
    return contexts
}


function convertScenariosToContext(chains) {
    return convertScenariosSimple(chains)
}


function convertScenariosToTools(chains) {
    return convertScenariosComplex(chains)
}
