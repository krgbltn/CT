// --- Настройки агента (из agentSettings) ---
const {
	url,
	method = "post",
	headers = {},
	authorizationToken,
	requestBody = {},
	slotsMapping = [],
	nextArticle,
	operatorArticle,
	disconnectionReportUrl,
	stub,
	stubResponse
} = agentSettings

// --- Утилиты для работы со слотами и message ---
const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${targetArticle}"`, undefined, undefined, slots)
}

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${operatorArticle}"`)

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

// --- Вспомогательные функции для анализа ответа пользователя ---
const isPositive = (text) => {
	const positiveWords = ['да', 'yes', 'ага', 'конечно', 'верно', 'правильно', 'согласен', 'подтверждаю', 'угу', 'ok', 'okay']
	const normalized = text.toLowerCase().trim()
	return positiveWords.some(w => normalized === w || normalized.startsWith(w + ' ') || normalized.startsWith(w + ','))
}

const isNegative = (text) => {
	const negativeWords = ['нет', 'no', 'не', 'неверно', 'неправильно', 'не то', 'другой']
	const normalized = text.toLowerCase().trim()
	return negativeWords.some(w => normalized === w || normalized.startsWith(w + ' ') || normalized.startsWith(w + ','))
}

// --- Извлечение части адреса начиная с улицы ---
const STREET_MARKERS = ['ул', 'улица', 'проспект', 'пр-кт', 'бульвар', 'б-р', 'переулок', 'пер', 'площадь', 'пл', 'шоссе', 'проезд', 'пр-д', 'мкр', 'микрорайон']

const extractStreetAddress = (fullAddress) => {
	if (!fullAddress) return ''
	const parts = fullAddress.split(',').map(p => p.trim())
	const startIndex = parts.findIndex(p => STREET_MARKERS.some(m => p.toLowerCase().startsWith(m)))
	if (startIndex === -1) return fullAddress
	return parts.slice(startIndex).join(', ')
}

// --- Запрос house_type из disconnection_report_info ---
const fetchHouseType = async (userId) => {
	if (!disconnectionReportUrl || !userId) return undefined

	if (stub && stubResponse) {
		return "MKD"
	}

	try {
		const requestUrl = disconnectionReportUrl.replace("{user_id}", userId)
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method: "get",
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data?.housetype
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when fetching house type: ${error}`)
		return undefined
	}
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

// --- Основная логика агента (state machine) ---
const main = async () => {
	const idStep = getSlotValueById("id_step")

	// === Последующие вызовы (обработка ответа пользователя) ===
	if (idStep === "confirm_single" || idStep === "ask_multiple") {
		const contractsData = getSlotValueById("id_contracts_data")
		const contracts = contractsData ? JSON.parse(contractsData) : null

		if (!contracts || !Array.isArray(contracts) || contracts.length === 0) {
			logger.warn('No contracts data in slot')
			return [operatorTransferReply()]
		}

		const userText = message?.message?.text || message?.text || ""
		logger.info(`User response (idStep=${idStep}): "${userText}"`)

		if (idStep === "confirm_single") {
			if (isPositive(userText)) {
				const idx = parseInt(getSlotValueById("id_selected_index") || "0", 10)
				const contract = contracts[idx]
				if (!contract) return [operatorTransferReply()]
				const filledSlots = fillSlotsFromContract(contract)
				const houseType = await fetchHouseType(filledSlots.user_id)
				if (houseType) filledSlots.house_type = houseType
				logger.info(`Single contract confirmed, filled slots: ${JSON.stringify(filledSlots)}`)
				return [nextArticleReply(filledSlots)]
			}

			if (isNegative(userText)) {
				logger.info('User declined single contract, transferring to operator')
				return [operatorTransferReply()]
			}

			logger.info('Unclear response, asking again')
			return [agentApi.makeTextReply("Извините, я не понял. Вы обращаетесь по этому адресу? Скажите «да» или «нет».", undefined, undefined, { id_step: "confirm_single" })]
		}

		if (idStep === "ask_multiple") {
			const matchedContract = findContractByText(contracts, userText)

			if (matchedContract) {
				const filledSlots = fillSlotsFromContract(matchedContract)
				const houseType = await fetchHouseType(filledSlots.user_id)
				if (houseType) filledSlots.house_type = houseType
				logger.info(`Matched by address, filled slots: ${JSON.stringify(filledSlots)}`)
				return [nextArticleReply(filledSlots)]
			}

			logger.info('No contract matched by address, transferring to operator')
			return [operatorTransferReply()]
		}
	}

	// === Первый вызов — запрос к API ===
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
	const contractsJson = JSON.stringify(contracts)

	// Один лицевой счёт — спрашиваем подтверждение
	if (contracts.length === 1) {
		const contract = contracts[0]
		const streetPart = extractStreetAddress(contract.WebProperties?.Address || "")
		logger.info(`Single contract, asking confirmation for: ${streetPart}`)
		return [agentApi.makeTextReply(
			`Вы обращаетесь по адресу ${streetPart}?`,
			undefined,
			undefined,
			{
				id_step: "confirm_single",
				id_selected_index: "0",
				id_contracts_data: contractsJson
			}
		)]
	}

	// Несколько лицевых счетов — спрашиваем адрес
	logger.info(`${contracts.length} contracts found, asking for address`)
	return [agentApi.makeTextReply(
		"Назовите адрес, по которому Вы обращаетесь.",
		undefined,
		undefined,
		{
			id_step: "ask_multiple",
			id_contracts_data: contractsJson
		}
	)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([nextArticleReply({ final_answer: 'error' })])
	})
