const {
	url,
	method = "post",
	headers = {},
	authorizationToken,
	innSlotId,
	slots: SLOTS,
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const classifier = () => getSlotValueById("classifier")

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${targetArticle}"`, undefined, undefined, slots)
}

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${operatorArticle}"`)

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
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method,
			headers: requestHeaders,
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
[
	{
		"UserId": "0e114d18-62b6-11e7-80de-00237d360000",
		"IsRegistered": true,
		"WebProperties": [
			{
				"ContractId": "4d21e098-fe41-11e6-80ce-002481f90000",
				"ContractNo": "ЕТСОО200763"
			}
		]
	}
]
 */
const buildResultSlots = (responseData) => {
	const abonents = Array.isArray(responseData) ? responseData : []

	if (abonents.length === 0) {
		logger.info('No abonents found by INN')
		return { final_answer: '2' }
	}

	const abonent = abonents[0]
	const contracts = Array.isArray(abonent?.WebProperties) ? abonent.WebProperties : []
	const contractNumbers = contracts.map(contract => contract?.ContractNo).filter(isFilledValue)

	if (contractNumbers.length === 0) {
		logger.info(`Abonent ${abonent?.UserId} found but has no contracts`)
		return { final_answer: '2' }
	}

	logger.info(`Found abonent: userId=${abonent?.UserId}, isRegistered=${abonent?.IsRegistered}, contracts=${contractNumbers.length}`)

	return {
		[SLOTS.accountNumber]: String(contractNumbers[0]),
		final_answer: '1'
	}
}

const main = async () => {
	const inn = getSlotValueById(innSlotId)
	logger.info(`Got inn: ${inn}`)

	if (!isFilledValue(inn)) {
		logger.warn('INN slot is empty')
		return [operatorTransferReply()]
	}

	const requestUrl = createRequestUrl()
	logger.info(`Created request url: ${requestUrl}`)

	const responseData = await sendRequest(requestUrl)

	if (!responseData) {
		logger.warn('No response data or request failed')
		return [operatorTransferReply()]
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
		resolve([operatorTransferReply()])
	})
