// @module core/references
// @requires modules/core/globals.js
// @requires modules/core/markdown.js
// Форматирование ссылок на статьи и подсветки источников

let SHARE_ID = (agentSettings.agent_parameters ?? {}).SHARE_ID ?? null
const MAX_SOURCE_HIGHLIGHT_RANGES = 20
const SOURCE_HIGHLIGHT_CONTRACT_VERSION = '1'
const SOURCE_HIGHLIGHT_VERSION_PARAM = 'ctv'
const SOURCE_HIGHLIGHT_RANGE_PARAM = 'ctr'


function wrapInMarkdownCodeBlock(str) {
    // Экранируем только неэкранированные тройные кавычки
    const escapedStr = str.replace(/(?<!\\)```/g, '\\```')
    return `\`\`\`
${escapedStr}
\`\`\``
}


function isValidSourceHighlightRange(start, end) {
    return Number.isSafeInteger(start) &&
        Number.isSafeInteger(end) &&
        start >= 0 &&
        end > start
}


function rangesOverlapOrTouch(left, right) {
    return left.start <= right.end + 1 && right.start <= left.end + 1
}


function normalizeSourceHighlightRanges(ranges) {
    const seenRanges = new Set()
    const sourceRanges = Array.isArray(ranges) ? ranges : []
    const uniqueRanges = []

    sourceRanges.forEach((range, order) => {
        if (!range || !isValidSourceHighlightRange(range.start, range.end)) {
            return
        }

        const key = `${range.start}:${range.end}`

        if (!seenRanges.has(key)) {
            seenRanges.add(key)
            uniqueRanges.push({ ...range, order })
        }
    })

    const mergedRanges = uniqueRanges
        .sort((left, right) => left.start - right.start || left.end - right.end)
        .reduce((result, range) => {
            const lastRange = result[result.length - 1]

            if (!lastRange || !rangesOverlapOrTouch(lastRange, range)) {
                result.push(range)
                return result
            }

            result[result.length - 1] = {
                start: lastRange.start,
                end: Math.max(lastRange.end, range.end),
                order: Math.min(lastRange.order, range.order),
            }

            return result
        }, [])

    return mergedRanges
        .sort((left, right) => left.order - right.order)
        .map(({ start, end }) => ({ start, end }))
}


function capNormalizedSourceHighlightRanges(ranges) {
    return ranges.slice(0, MAX_SOURCE_HIGHLIGHT_RANGES)
}


function getSourceHighlightRangeMaps(fullContext) {
    const rangesByArticle = new Map()
    const symbolCodes = Array.isArray(fullContext?.symbol_code) ? fullContext.symbol_code : []
    const startIndexes = Array.isArray(fullContext?.start_index) ? fullContext.start_index : []
    const endIndexes = Array.isArray(fullContext?.end_index) ? fullContext.end_index : []

    symbolCodes.forEach((articleCode, idx) => {
        if (typeof articleCode !== 'string' || !articleCode) {
            return
        }

        const start = startIndexes[idx]
        const end = endIndexes[idx]

        if (!isValidSourceHighlightRange(start, end)) {
            return
        }

        const ranges = rangesByArticle.get(articleCode) || []
        ranges.push({ start, end })
        rangesByArticle.set(articleCode, ranges)
    })

    const validationRangesByArticle = new Map()

    rangesByArticle.forEach((ranges, articleCode) => {
        const normalizedRanges = normalizeSourceHighlightRanges(ranges)

        if (normalizedRanges.length) {
            validationRangesByArticle.set(articleCode, normalizedRanges)
        }
    })

    const fallbackRangesByArticle = new Map()

    validationRangesByArticle.forEach((ranges, articleCode) => {
        fallbackRangesByArticle.set(
            articleCode,
            capNormalizedSourceHighlightRanges(ranges),
        )
    })

    return {
        validationRangesByArticle,
        fallbackRangesByArticle,
    }
}


function getSourceHighlightRangesByArticle(fullContext) {
    return getSourceHighlightRangeMaps(fullContext).fallbackRangesByArticle
}


function addSourceHighlightSearchParams(url, ranges) {
    url.searchParams.delete(SOURCE_HIGHLIGHT_VERSION_PARAM)
    url.searchParams.delete(SOURCE_HIGHLIGHT_RANGE_PARAM)

    if (ranges.length === 0) {
        return
    }

    url.searchParams.set(SOURCE_HIGHLIGHT_VERSION_PARAM, SOURCE_HIGHLIGHT_CONTRACT_VERSION)
    ranges.forEach(({ start, end }) => {
        url.searchParams.append(SOURCE_HIGHLIGHT_RANGE_PARAM, `${start}:${end}`)
    })
}


function getArticleUrl(intentId, ranges = []) {
    const baseArticleUrl = SHARE_ID
        ? `${BASE_URL}/app/share/${SHARE_ID}/article/${intentId}`
        : `${BASE_URL}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intentId}`
    const normalizedRanges = capNormalizedSourceHighlightRanges(
        normalizeSourceHighlightRanges(ranges),
    )

    if (normalizedRanges.length === 0) {
        return baseArticleUrl
    }

    const url = new URL(baseArticleUrl)
    addSourceHighlightSearchParams(url, normalizedRanges)

    return url.toString()
}


function getTitleWithUrl(intentId, title, ranges = []) {
    return `[${title}](${getArticleUrl(intentId, ranges)})`
}


function getContextSourceHighlightRange(fullContext, idx) {
    const start = fullContext?.start_index?.[idx]
    const end = fullContext?.end_index?.[idx]

    return isValidSourceHighlightRange(start, end)
        ? [{ start, end }]
        : []
}


function addUrlToContextTitle(fullContext, sourceHighlightsEnabled = false) {
    fullContext.symbol_code.forEach((intentId, idx) => {
        const title = fullContext.context[idx].title
        const ranges = sourceHighlightsEnabled
            ? getContextSourceHighlightRange(fullContext, idx)
            : []

        fullContext.context[idx].title = getTitleWithUrl(intentId, title, ranges)
    })
}


function getArticlePathPrefixes() {
    const prefixes = [
        `/app/project/${CUSTOMER_ID}/knowledge-base/article/view/`,
    ]

    if (SHARE_ID) {
        prefixes.push(`/app/share/${SHARE_ID}/article/`)
    }

    return prefixes
}


function getKnowledgeBaseArticleCodeFromUrl(destination) {
    let url
    let baseUrl

    try {
        url = new URL(destination, BASE_URL)
        baseUrl = new URL(BASE_URL)
    } catch (_) {
        return null
    }

    if (url.origin !== baseUrl.origin) {
        return null
    }

    const articlePathPrefix = getArticlePathPrefixes()
        .find(prefix => url.pathname.startsWith(prefix))

    if (!articlePathPrefix) {
        return null
    }

    const encodedArticleCode = url.pathname.slice(articlePathPrefix.length)

    try {
        const articleCode = decodeURIComponent(encodedArticleCode)

        if (
            !articleCode ||
            articleCode.includes('/') ||
            articleCode.includes('\\')
        ) {
            return null
        }

        return articleCode
    } catch (_) {
        return null
    }
}


function parseSourceHighlightRanges(url) {
    const versions = url.searchParams.getAll(SOURCE_HIGHLIGHT_VERSION_PARAM)
    const rawRanges = url.searchParams.getAll(SOURCE_HIGHLIGHT_RANGE_PARAM)

    if (
        versions.length !== 1 ||
        versions[0] !== SOURCE_HIGHLIGHT_CONTRACT_VERSION ||
        rawRanges.length === 0
    ) {
        return null
    }

    const parsedRanges = []

    for (const rawRange of rawRanges) {
        const match = /^(\d+):(\d+)$/.exec(rawRange)

        if (!match) {
            return null
        }

        const start = Number(match[1])
        const end = Number(match[2])

        if (!isValidSourceHighlightRange(start, end)) {
            return null
        }

        parsedRanges.push({ start, end })
    }

    return parsedRanges
}


function isSourceHighlightSelectionValid(url, availableRanges) {
    const selectedRanges = parseSourceHighlightRanges(url)

    if (!selectedRanges || !Array.isArray(availableRanges)) {
        return false
    }

    return selectedRanges.every(selectedRange =>
        availableRanges.some(availableRange =>
            availableRange.start <= selectedRange.start &&
            selectedRange.end <= availableRange.end
        )
    )
}


function getEnrichedArticleUrl(
    destination,
    validationRangesByArticle,
    fallbackRangesByArticle = validationRangesByArticle,
) {
    const articleCode = getKnowledgeBaseArticleCodeFromUrl(destination)

    if (!articleCode || !validationRangesByArticle.has(articleCode)) {
        return destination
    }

    try {
        const url = new URL(destination, BASE_URL)
        const availableRanges = validationRangesByArticle.get(articleCode)

        if (isSourceHighlightSelectionValid(url, availableRanges)) {
            return destination
        }

        const fallbackRanges = fallbackRangesByArticle.has(articleCode)
            ? fallbackRangesByArticle.get(articleCode)
            : availableRanges
        const normalizedFallbackRanges = capNormalizedSourceHighlightRanges(
            normalizeSourceHighlightRanges(fallbackRanges),
        )

        addSourceHighlightSearchParams(url, normalizedFallbackRanges)

        return url.toString()
    } catch (_) {
        return destination
    }
}


function enrichMarkdownArticleLinks(
    markdown,
    validationRangesByArticle,
    fallbackRangesByArticle = validationRangesByArticle,
) {
    if (
        typeof markdown !== 'string' ||
        !validationRangesByArticle ||
        typeof validationRangesByArticle.has !== 'function' ||
        typeof validationRangesByArticle.get !== 'function' ||
        validationRangesByArticle.size === 0
    ) {
        return markdown
    }

    let result = ''
    let cursor = 0

    while (cursor < markdown.length) {
        const linkStart = markdown.indexOf('[', cursor)

        if (linkStart === -1) {
            result += markdown.slice(cursor)
            break
        }

        if (linkStart > 0 && markdown[linkStart - 1] === '!') {
            result += markdown.slice(cursor, linkStart + 1)
            cursor = linkStart + 1
            continue
        }

        const titleEnd = markdown.indexOf(']', linkStart + 1)

        if (titleEnd === -1 || markdown[titleEnd + 1] !== '(') {
            result += markdown.slice(cursor, linkStart + 1)
            cursor = linkStart + 1
            continue
        }

        const urlStart = titleEnd + 2
        const urlEnd = markdown.indexOf(')', urlStart)

        if (urlEnd === -1) {
            result += markdown.slice(cursor, linkStart + 1)
            cursor = linkStart + 1
            continue
        }

        const destination = markdown.slice(urlStart, urlEnd)
        const enrichedDestination = getEnrichedArticleUrl(
            destination,
            validationRangesByArticle,
            fallbackRangesByArticle,
        )

        result += markdown.slice(cursor, urlStart)
        result += enrichedDestination
        cursor = urlEnd
    }

    return result
}


function enrichResponseArticleLinks(
    response,
    validationRangesByArticle,
    fallbackRangesByArticle = validationRangesByArticle,
) {
    if (!response || typeof response.answer !== 'string') {
        return response
    }

    const answer = enrichMarkdownArticleLinks(
        response.answer,
        validationRangesByArticle,
        fallbackRangesByArticle,
    )

    if (answer === response.answer) {
        return response
    }

    return { ...response, answer }
}


function getReferencesFromScenarios(context) {
    if (!context || context.length === 0) return ''
    const uniqueTitles = [...new Set(context.map(c => c.title).filter(Boolean))]
    if (uniqueTitles.length === 0) return ''
    return "### Ссылки для информации:" + uniqueTitles.map(t => `\n\n*  ${t}`).join('')
}


function getReferences(full_context, rangesByArticle = new Map()) {
    let references = ""
    const articles_counts = new Map()
    const articles_titles = new Map()

    // Считаем упоминания каждой статьи
    full_context.symbol_code.forEach((intent_id, idx) => {
        const prev_count = articles_counts.get(intent_id) || 0
        articles_counts.set(intent_id, prev_count + 1)
        articles_titles.set(intent_id, full_context.title[idx])
    })

    // Сортируем по убыванию числа упоминаний
    const sorted_counts = Array.from(articles_counts.entries())
        .sort((a, b) => b[1] - a[1])

    sorted_counts.forEach(([intent_id]) => {
        const url = getArticleUrl(intent_id, rangesByArticle.get(intent_id))
        references += `\n\n*  [${articles_titles.get(intent_id)}](${url})`
    })

    if (references !== "")
        references = "### Ссылки для информации:" + references
    return references
}
