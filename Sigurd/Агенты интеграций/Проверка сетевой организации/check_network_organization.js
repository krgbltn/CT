const {
	url,
	method = "get",
	headers = {},
	authorizationToken,
	slotsMapping = [],
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${targetArticle}"`, undefined, undefined, slots)
}

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${operatorArticle}"`)

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

const renderTemplateString = (template) => {
	if (!template.includes("{{")) {
		return template
	}

	const templateParts = template.split(/\s+\|\|\s+/)

	for (const templatePart of templateParts) {
		const match = templatePart.match(/^\s*\{\{([\s\S]*?)}}\s*$/)

		if (match) {
			const value = getTemplateValue(match[1])
			if (value !== undefined && value !== null && value !== "") {
				return value
			}
			continue
		}

		let hasEmptyValue = false
		const renderedValue = templatePart.replace(/\{\{([\s\S]*?)}}/g, (_, expression) => {
			const value = getTemplateValue(expression)

			if (value === undefined || value === null || value === "") {
				hasEmptyValue = true
				return ""
			}

			return typeof value === "object" ? JSON.stringify(value) : value.toString()
		})

		if (!hasEmptyValue) {
			return renderedValue
		}
	}

	return ""
}

const normalizeSlotValue = (value) => {
	if (typeof value === "object") {
		return JSON.stringify(value)
	}

	return value.toString()
}

const fillSlotsFromRequest = (data) => {
	if (data === undefined || data === null) {
		return {}
	}

	const filledSlots = {}

	for (const mapping of slotsMapping) {
		const value = getValueByPath(data, mapping.path)
		const slotValue = value === undefined || value === null ? mapping.defaultValue : value

		if (slotValue === undefined || slotValue === null) {
			logger.warn(`Value by path '${mapping.path}' for slot '${mapping.slotId}' was not found`)
			continue
		}

		filledSlots[mapping.slotId] = normalizeSlotValue(slotValue)
	}

	return filledSlots
}

const createRequestUrl = () => renderTemplateString(url)

const main = async () => {
	const requestUrl = createRequestUrl()
	logger.info(`Request url: ${requestUrl}`)

	try {
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method,
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})

		const responseData = res?.data
		logger.info(`Response data: ${JSON.stringify(responseData || {})}`)

		if (!responseData) {
			logger.warn("No response data")
			return [operatorTransferReply()]
		}

		const filledSlots = fillSlotsFromRequest(responseData)
		logger.info(`Filled slots: ${JSON.stringify(filledSlots)}`)

		return [nextArticleReply(filledSlots)]
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending request: ${error}`)
		logger.error(`Response data: ${JSON.stringify(error.response?.data)}`)
		return [operatorTransferReply()]
	}
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
