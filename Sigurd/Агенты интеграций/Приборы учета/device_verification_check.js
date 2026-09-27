const {
	url,
	method = "get",
	headers = {},
	authorizationToken,
	serviceNames = {},
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

const normalizeName = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

const normalizeSlotValue = (value) => {
	if (typeof value === "object") {
		return JSON.stringify(value)
	}

	return value.toString()
}

const sendRequest = async (requestUrl) => {
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
		return res?.data
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending request to ${requestUrl}. ${error}`)
	}
}

const main = async () => {
	const userId = getSlotValueById('uid')
	const serviceType = getSlotValueById('service_type')
	const names = serviceNames[serviceType]

	if (!userId) {
		logger.warn('uid slot is empty')
		return [operatorTransferReply()]
	}

	if (!names || !Array.isArray(names)) {
		logger.warn(`Unknown service_type: ${serviceType}`)
		return [operatorTransferReply()]
	}

	const requestUrl = url.replace('{{slots.uid}}', encodeURIComponent(userId))
	logger.info(`Request url: ${requestUrl}`)

	const responseData = await sendRequest(requestUrl)

	if (!responseData) {
		logger.warn('No response data or request failed')
		return [operatorTransferReply()]
	}

	logger.info(`Got response data: ${JSON.stringify(responseData || {})}`)

	const devices = responseData?.account?.devices
	const device = Array.isArray(devices)
		? devices.find(d => names.some(name => normalizeName(d?.service_name).includes(normalizeName(name))))
		: undefined

	if (!device) {
		logger.info(`Device for service_type '${serviceType}' not found`)
		const filledSlots = { final_answer: '2' }
		return [nextArticleReply(filledSlots)]
	}

	const nextCheck = device.next_check
	logger.info(`Device next_check: ${nextCheck}`)

	if (!nextCheck) {
		logger.info('No next_check date for device')
		const filledSlots = { final_answer: '2' }
		return [nextArticleReply(filledSlots)]
	}

	const filledSlots = {
		next_check: normalizeSlotValue(nextCheck),
		final_answer: '1'
	}

	logger.info(`Final answer: ${filledSlots.final_answer}`)
	logger.info(`All slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
