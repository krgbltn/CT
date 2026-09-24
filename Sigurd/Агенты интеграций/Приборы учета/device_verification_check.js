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
	const deviceId = getSlotValueById('device')

	if (!userId) {
		logger.warn('user_id_tst slot is empty')
		return [operatorTransferReply()]
	}

	if (!deviceId) {
		logger.warn('device slot is empty')
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

	const devices = responseData?.account?.devices
	const device = Array.isArray(devices)
		? devices.find(d => d.id === deviceId)
		: undefined

	if (!device) {
		logger.info(`Device with id '${deviceId}' not found`)
		const filledSlots = { final_answer: '3' }
		return [nextArticleReply(filledSlots)]
	}

	const nextCheck = device.next_check
	logger.info(`Device next_check: ${nextCheck}`)

	if (!nextCheck) {
		logger.info('No next_check date for device')
		const filledSlots = { final_answer: '3' }
		return [nextArticleReply(filledSlots)]
	}

	const now = new Date()
	const nextCheckDate = new Date(nextCheck)
	const finalAnswer = nextCheckDate > now ? '1' : '2'

	const filledSlots = {
		device: normalizeSlotValue(deviceId),
		next_check: normalizeSlotValue(nextCheck),
		final_answer: finalAnswer
	}

	logger.info(`Final answer: ${finalAnswer}`)
	logger.info(`All slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
