// --- Настройки агента (из agentSettings) ---
const {
	url,
	methodName,
	phoneSlotId,
	targetNamespace = "http://tempuri.org/",
	soapVersion = "1.1",
	parameters = [],
	resultPath,
	slotsMapping = [],
	nextArticle,
	operatorArticle,
	authorizationToken,
	headers = {},
	stub,
	stubResponse
} = agentSettings

// --- Утилиты для работы со слотами и message ---
const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const nextArticleReply = (slots) => {
	const target = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${target}"`, undefined, undefined, slots)
}

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${operatorArticle}"`)

const routingToOperatorAnswer = agentApi.makeTextReply("/switchredirect routingagent")

// --- Шаблонизация (подстановка {{ }} в url, параметры и т.д.) ---
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

const resolveTemplates = (data) => {
	if (typeof data === "string") {
		return renderTemplateString(data)
	}

	if (Array.isArray(data)) {
		return data.map(item => resolveTemplates(item))
	}

	if (data && typeof data === "object") {
		return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, resolveTemplates(value)]))
	}

	return data
}

// --- SOAP: сборка конверта ---
const SOAP_NAMESPACES = {
	"1.1": {
		envelope: "http://schemas.xmlsoap.org/soap/envelope/",
		contentType: "text/xml; charset=utf-8"
	},
	"1.2": {
		envelope: "http://www.w3.org/2003/05/soap-envelope",
		contentType: "application/soap+xml"
	}
}

const buildSoapEnvelope = (method, params) => {
	const ns = SOAP_NAMESPACES[soapVersion] || SOAP_NAMESPACES["1.1"]

	const bodyParams = {}
	for (const param of params) {
		const name = param.name
		const rawValue = resolveTemplates(param.value)
		bodyParams[`tem:${name}`] = param.type === "number" ? Number(rawValue) : String(rawValue ?? "")
	}

	const envelope = {
		"@": {
			"xmlns:soapenv": ns.envelope,
			"xmlns:tem": targetNamespace
		},
		"soapenv:Header": "",
		"soapenv:Body": {
			[`tem:${method}`]: bodyParams
		}
	}

	const xml = js2xmlparser.parse("soapenv:Envelope", envelope)
	logger.info(`SOAP request XML: ${xml}`)
	return xml
}

// --- SOAP: парсинг ответа ---
const parseSoapResponse = (xml) => {
	if (typeof xml !== "string") {
		return Promise.resolve(xml)
	}

	const parser = new xml2js.Parser({
		explicitArray: false,
		preserveChildrenOrder: true,
		headlessRootTag: false,
		trim: true
	})
	return new Promise((resolve, reject) => {
		parser.parseString(xml, (err, result) => {
			if (err) reject(err)
			else resolve(result)
		})
	})
}

const extractFault = (parsed) => {
	const body = parsed?.["soap:Envelope"]?.["soap:Body"]
	if (!body) return null

	const fault = body["soap:Fault"] || body["Fault"]
	if (!fault) return null

	const faultcode = fault.faultcode || ""
	const faultstring = fault.faultstring || fault.reason || ""
	return { faultcode, faultstring }
}

// --- Отправка запроса (реальная или заглушка) ---
const sendRequest = async (requestUrl, body) => {
	if (stub && stubResponse) {
		logger.info('Using stub response')
		return typeof stubResponse === 'string' ? JSON.parse(stubResponse) : stubResponse
	}

	const ns = SOAP_NAMESPACES[soapVersion] || SOAP_NAMESPACES["1.1"]
	const reqHeaders = {
		"Content-Type": ns.contentType,
		"SOAPAction": `${targetNamespace}${methodName}`,
		...headers
	}

	if (authorizationToken) {
		reqHeaders["Authorization"] = authorizationToken
	}

	try {
		const res = await axios({
			url: requestUrl,
			method: "post",
			headers: reqHeaders,
			data: body,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending SOAP request to ${url}. ${error}`)
		logger.error(`Response data: ${JSON.stringify(error.response?.data)}`)
	}
}

// --- Заполнение слотов из объекта ответа ---
const normalizeSlotValue = (value) => {
	if (typeof value === "object") {
		return JSON.stringify(value)
	}

	return value.toString()
}

const fillSlotsFromResponse = (data) => {
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

// --- Основная логика агента ---
const main = async () => {
	const requestUrl = renderTemplateString(url)
	logger.info(`SOAP endpoint: ${requestUrl}`)
	logger.info(`SOAP method: ${methodName}`)

	let phoneNumber = phoneSlotId ? getSlotValueById(phoneSlotId) : undefined
	logger.info(`Got phone number ${phoneNumber}`)

	if (!phoneNumber) {
		logger.info(`Phone not found`)
		return [routingToOperatorAnswer]
	}

	const soapXml = buildSoapEnvelope(methodName, parameters)
	logger.info(`SOAP request built`)

	const xmlResponse = await sendRequest(requestUrl, soapXml)
	logger.info(`SOAP response received: ${typeof xmlResponse === 'string' ? xmlResponse.substring(0, 500) : JSON.stringify(xmlResponse)?.substring(0, 500)}`)

	if (!xmlResponse) {
		logger.warn('Empty SOAP response')
		return operatorArticle ? [operatorTransferReply()] : [nextArticleReply({ final_answer: 'error' })]
	}

	const parsed = await parseSoapResponse(xmlResponse)
	logger.info(`SOAP parsed: ${JSON.stringify(parsed)?.substring(0, 500)}`)

	const fault = extractFault(parsed)
	if (fault) {
		logger.error(`SOAP Fault: code=${fault.faultcode}, string=${fault.faultstring}`)
		return operatorArticle ? [operatorTransferReply()] : [nextArticleReply({ final_answer: 'error' })]
	}

	const resolved = resultPath ? getValueByPath(parsed, resultPath) : parsed
	logger.info(`Resolved result at path '${resultPath}': ${JSON.stringify(resolved)?.substring(0, 500)}`)

	if (!resolved) {
		logger.warn(`No data found at resultPath '${resultPath}'`)
		return operatorArticle ? [operatorTransferReply()] : [nextArticleReply({ final_answer: 'error' })]
	}

	const dataNode = Array.isArray(resolved) && resolved.length > 0 ? resolved[0] : resolved
	const filledSlots = fillSlotsFromResponse(dataNode)
	logger.info(`Filled slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve(operatorArticle ? [operatorTransferReply()] : [nextArticleReply({ final_answer: 'error' })])
	})
