const {
	url,
	method = "get",
	headers = {},
	authorizationToken,
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const nextArticleReply = (slots) =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${nextArticle}"`, undefined, undefined, slots)

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${operatorArticle}"`)

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
	const userId = getSlotValueById('user_id_tst')
	const serviceType = getSlotValueById('service_type')

	if (!userId) {
		logger.warn('user_id_tst slot is empty')
		return [operatorTransferReply()]
	}

	if (!serviceType) {
		logger.warn('service_type slot is empty')
		return [operatorTransferReply()]
	}

	const requestUrl = url.replace('{{slots.user_id_tst}}', userId)
	logger.info(`Request url: ${requestUrl}`)

	const responseData = await sendRequest(requestUrl)

	if (!responseData) {
		logger.warn('No response data or request failed')
		return [operatorTransferReply()]
	}

	logger.info(`Got response data: ${JSON.stringify(responseData || {})}`)

	const devices = Array.isArray(responseData) ? responseData : []

	const device = devices.find(d =>
		d.service_name && d.service_name.includes(serviceType)
	)

	if (!device) {
		logger.info(`Device with service_type '${serviceType}' not found`)
		return [operatorTransferReply()]
	}

	const lastReading = device.last_reading?.readings?.[0]

	if (!lastReading) {
		logger.info('No last_reading data for device')
		return [operatorTransferReply()]
	}

	const filledSlots = {
		device: normalizeSlotValue(device.id),
		last_reading: normalizeSlotValue(lastReading.value),
		last_reading_date: normalizeSlotValue(lastReading.date)
	}

	logger.info(`All slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
