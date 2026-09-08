const {
	url,
	method = "post",
	headers = {},
	phoneSlotId,
	slots: SLOTS,
	nextArticle,
	timeoutMs
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const classifier = () => getSlotValueById("classifier")

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${targetArticle}"`, undefined, undefined, slots)
}

const routingToOperatorAnswer = agentApi.makeTextReply("/switchredirect routingagent")

const normalizePath = (path) => {
	if (path === undefined || path === null || path === "" || path === "$") {
		return []
	}

	return path
		.toString()
		.replace(/^\$\./, "")
		.replace(/\[(\d+)\]/g, ".$1")
		.replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
		.split(".")
		.map(part => part.trim())
		.filter(Boolean)
}

const getValueByPath = (data, path) => {
	return normalizePath(path).reduce((acc, key) => acc?.[key], data)
}

const isFilledValue = (value) => value !== undefined && value !== null && value !== ""

const getTemplateValue = (expression) => {
	const valuePath = expression.trim()

	if (valuePath.startsWith("message.")) {
		return getValueByPath(message, valuePath.substring("message.".length))
	}

	if (valuePath.startsWith("slots.")) {
		return getSlotValueById(valuePath.substring("slots.".length))
	}

	return valuePath
}

const parseTemplateExpression = (templatePart) => {
	const match = templatePart.match(/^\s*\{\{([\s\S]*?)}}\s*$/)

	if (!match) {
		return undefined
	}

	return getTemplateValue(match[1])
}

const renderTemplatePart = (templatePart) => {
	const expressionValue = parseTemplateExpression(templatePart)

	if (expressionValue !== undefined) {
		return expressionValue
	}

	let hasEmptyValue = false
	const renderedValue = templatePart.replace(/\{\{([\s\S]*?)}}/g, (_, expression) => {
		const value = getTemplateValue(expression)

		if (!isFilledValue(value)) {
			hasEmptyValue = true
			return ""
		}

		return typeof value === "object" ? JSON.stringify(value) : value.toString()
	})

	return hasEmptyValue ? undefined : renderedValue
}

const renderTemplateString = (template) => {
	if (!template.includes("{{")) {
		return template
	}

	const templateParts = template.split(/\s+\|\|\s+/)

	for (const templatePart of templateParts) {
		const value = renderTemplatePart(templatePart)

		if (isFilledValue(value)) {
			return value
		}
	}

	return ""
}

const createRequestUrl = () => renderTemplateString(url)

const sendRequest = async (requestUrl) => {
	try {
		const res = await axios({
			url: requestUrl,
			method,
			headers,
			timeout: Number(timeoutMs) || 3000,
			maxBodyLength: Infinity,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending request to ${url}. ${error}`)
		logger.error(`Response data: ${JSON.stringify(error.response?.data)}`)
	}
}

/**
{
	"ls": "7891932",
	"days": 3,
	"requested_at": "2026-08-18T13:55:43+08:00",
	"debt_call": {
		"exists": true,
		"last_call_at": "2026-08-18T13:43:51+08:00",
		"days_ago": 0,
		"attempts": 1,
		"amount": 892.48,
		"campaign_type_id": 2,
		"campaign_type": "Задолженность ЭЭ",
		"campaign_id": "367068",
		"division": "Усть-Илимское отделение ООО «Иркутскэнергосбыт»",
		"is_legal_entity": false
	}
}
 */
const buildResultSlots = (responseData) => {
	const debtCall = responseData?.debt_call

	if (!debtCall || debtCall.exists !== true) {
		logger.info(`Debt call not found: ${JSON.stringify(debtCall ?? {})}`)
		return { final_answer: '2' }
	}

	logger.info(`Debt call found: ls=${responseData.ls}, lastCallAt=${debtCall.last_call_at}, daysAgo=${debtCall.days_ago}`)

	return {
		[SLOTS.ls]: String(responseData.ls ?? ""),
		final_answer: '1'
	}
}

const main = async () => {
	const phone = getSlotValueById(phoneSlotId)
	logger.info(`Got phone: ${phone}`)

	if (!isFilledValue(phone)) {
		logger.warn('Phone slot is empty')
		return [routingToOperatorAnswer]
	}

	const requestUrl = createRequestUrl()
	logger.info(`Created request url: ${requestUrl}`)

	const responseData = await sendRequest(requestUrl)

	if (!responseData) {
		logger.warn('No response data or request failed')
		return [routingToOperatorAnswer]
	}

	logger.info(`Got response data: ${JSON.stringify(responseData || {})}`)

	const resultSlots = buildResultSlots(responseData)
	logger.info(`Result slots: ${JSON.stringify(resultSlots)}`)

	return [nextArticleReply(resultSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([routingToOperatorAnswer])
	})
