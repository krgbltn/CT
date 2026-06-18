// --- Настройки агента (из agentSettings) ---
const {
	url,
	method = "post",
	headers = {},
	authorizationToken,
	requestBody = {},
	slotsMapping = [],
	nextArticle,
	stub,
	stubResponse
} = agentSettings

// --- Утилиты для работы со слотами и message ---
const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const nextArticleReply = (slots) =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${nextArticle}"`, undefined, undefined, slots)

// --- Шаблонизация (подстановка {{ }} в url, requestBody и т.д.) ---
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

const createRequestBody = () => resolveTemplates(requestBody)
const createRequestUrl = () => renderTemplateString(url)

const normalizeSlotValue = (value) => {
	if (typeof value === "object") {
		return JSON.stringify(value)
	}

	return value.toString()
}

// --- Отправка запроса (реальная или заглушка) ---
const sendRequest = async (requestUrl, body) => {
	if (stub && stubResponse) {
		logger.info('Using stub response')
		return typeof stubResponse === 'string' ? JSON.parse(stubResponse) : stubResponse
	}

	try {
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method,
			headers: requestHeaders,
			data: body,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending request to ${url}. ${error}`)
	}
}

// --- Заполнение слотов из одного объекта контракта (очищает [0] из путей) ---
const fillSlotsFromContract = (contract) => {
	const filledSlots = {}

	for (const mapping of slotsMapping) {
		const relativePath = mapping.path.replace(/^\[\d+\]\.?/, '')
		const value = getValueByPath(contract, relativePath)
		const slotValue = value === undefined || value === null ? mapping.defaultValue : value

		if (slotValue === undefined || slotValue === null) {
			logger.warn(`Value by path '${mapping.path}' for slot '${mapping.slotId}' was not found`)
			continue
		}

		filledSlots[mapping.slotId] = normalizeSlotValue(slotValue)
	}

	return filledSlots
}

// --- Слова для исключения при сравнении адресов ---
const ADDRESS_STOPWORDS = [
	'дом', 'ул', 'улица', 'кв', 'квартира',
	'г', 'город', 'обл', 'область', 'р-н', 'район',
	'д', '№', 'по', 'на', 'в', 'с', 'и', 'не'
]

// --- Поиск контракта по тексту пользователя (сопоставление адреса) ---
const findContractByText = (contracts, text) => {
	if (!text) return null

	const words = text.toLowerCase().split(/\s+/)
		.filter(w => (w.length > 2 || /\d/.test(w)) && !ADDRESS_STOPWORDS.includes(w))

	if (words.length === 0) return null

	for (const contract of contracts) {
		const address = contract.WebProperties?.Address?.toLowerCase() || ''

		if (words.every(word => address.includes(word))) {
			return contract
		}
	}

	return null
}

// --- Основная логика агента ---
const main = async () => {
	const requestUrl = createRequestUrl()
	logger.info(`Created request url: ${requestUrl}`)

	const body = createRequestBody()
	logger.info(`Created request body: ${JSON.stringify(body)}`)

	const responseData = await sendRequest(requestUrl, body)
	logger.info(`Got response data: ${JSON.stringify(responseData || {})}`)

	if (!responseData || !Array.isArray(responseData) || responseData.length === 0) {
		logger.warn('No contracts found or invalid response')
		return [nextArticleReply({ final_answer: 'error' })]
	}

	const contracts = responseData

	// Если один контракт — сразу заполняем слоты и редиректим
	if (contracts.length === 1) {
		const filledSlots = fillSlotsFromContract(contracts[0])
		logger.info(`Single contract, filled slots: ${JSON.stringify(filledSlots)}`)
		return [nextArticleReply(filledSlots)]
	}

	// Несколько контрактов — пытаемся сопоставить с текстом от пользователя
	const userText = message?.message?.text || message?.text
	logger.info(`User message text: "${userText}"`)
	const matchedContract = findContractByText(contracts, userText)

	if (matchedContract) {
		const filledSlots = fillSlotsFromContract(matchedContract)
		logger.info(`Matched by address, filled slots: ${JSON.stringify(filledSlots)}`)
		return [nextArticleReply(filledSlots)]
	}

	// Не нашли — проверяем, спрашивали ли уже адрес
	const alreadyAsked = getSlotValueById("address_asked")

	if (alreadyAsked) {
		logger.info('No contract matched, address not found')
		return [agentApi.makeTextReply("По данному адресу лицевых счетов не найдено.")]
	}

	// Первый запрос без совпадения — спрашиваем адрес и ставим флаг
	logger.info('No contract matched, asking for address')
	return [agentApi.makeTextReply("Назовите адрес по которому Вы обращаетесь.", undefined, undefined, { address_asked: "true" })]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([nextArticleReply({ final_answer: 'error' })])
	})
