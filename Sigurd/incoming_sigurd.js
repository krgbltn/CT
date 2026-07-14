const {
	storageKey: OUTGOING_TEXT_KEY,
	channelId: CHANNEL_ID,
	channelAuthToken: AUTHORIZATION_TOKEN_INCOMING,
	customerId: CUSTOMER_ID,
	slots: SLOTS
} = agentSettings

const SECONDS_TO_RESPONSE = 30
const INCOMING_API = `http://opbot-channels:8082/webhooks/integration_channel/${CHANNEL_ID}`
const OMNI_ID = "OMNI_ID"
const REQUEST_ID_KEY = "OUTGOING_REQ"

const getStorageKey = (userId, key = OUTGOING_TEXT_KEY) => `${key}-${userId}`
const getRequestKey = (userId) => `${REQUEST_ID_KEY}-${userId}`
const getResponseKey = (userId, requestId) => `${OUTGOING_TEXT_KEY}-${userId}-${requestId}`

const getUserText = async (userId, requestId) => {
	const key = getResponseKey(userId, requestId)
	logger.info(`Got text stor key: ${key}`)
	return await agentStorage.globalStorage.get(key) ?? ""
}
const deleteUserText = async (userId, requestId) => {
	const key = getResponseKey(userId, requestId)
	logger.info(`Got text stor key delete: ${key}`)
	return await agentStorage.globalStorage.del(key)
}
const getOmniUserId = async (userId) => await agentStorage.globalStorage.get(getStorageKey(userId, OMNI_ID))

const extractPhoneNumber = (phoneNumber) => phoneNumber.replace(/\D/g, '')

const IncomingEvents = {
	START: "call_started",
	TEXT: "text_message",
	FINISH: "call_ended"
}

const OutgoingEvents = {
	TEXT: "text_message",
	TRANSFER: "transfer_to_operator",
	FINISH: "end_call"
}

const createSendMessageRequestBody = (phone, text, userId, firstName, lastName, slots) => ({
	id: uuid.v4(),
	content: {
		text: text,
		attachments: []
	},
	message_type: !!text ? 1 : 0,
	user: {
		id: userId,
		username: `${firstName} ${lastName}`,
		phone
	},
	timestamp: Date.now(),
	slots
})

const getHeaders = () => ({
	'Authorization': AUTHORIZATION_TOKEN_INCOMING,
	'Content-Type': 'application/json'
})

const sendMessage = async (body) => {
	let response

	try {
		const responseFromUrl = await axios.post(INCOMING_API, body, { headers: getHeaders() })
		logger.info(`Incoming data ${JSON.stringify(responseFromUrl.data)}`)
		response = responseFromUrl.data || null
	} catch (error) {
		logger.error(`Error when sending request to ${INCOMING_API}: ${error}`)
		response = null
	}

	return response
}

const waitBotResponse = async (maxSeconds, userId, requestId) => {
	const startTime = Date.now()
	const maxWaitMs = maxSeconds * 1000
	const text = ""

	while (true) {
		if (Date.now() - startTime > maxWaitMs) {
			logger.info(`Timeout has exceeded ${maxSeconds}s`)
			return text
		}

		const textForUser = await getUserText(userId, requestId)
		logger.info(`Got text: ${textForUser}`)
		if (textForUser && textForUser.trim().length > 0) {
			await deleteUserText(userId, requestId)
			return textForUser.trim()
		}

		const pauseStart = Date.now()
		const second = 1000
		while (Date.now() - pauseStart < second) {}
	}
}

const createResponse = (sessionId, event, channel, phone, text) => ({
	sessionID: sessionId,
	event,
	channel,
	phone,
	text,
	timestamp: Date.now()
})

const getSlots = (userId) => {
	return [
		{ id: SLOTS.userId, value: userId }
	]
}

const finishDialog = async (userId) => {
	try {
		const omniUserId = await getOmniUserId(userId)
		const { Response: dialogId } = await agentApi.getDialogId(omniUserId, CUSTOMER_ID)
		await agentApi.finishDialog(dialogId, "Call end", 5)
	} catch (err) {
		logger.error({ stack: err.stack }, `Error when finish dialog: ${err}`)
	}
}

const main = async () => {
	logger.info(`Incoming message: ${JSON.stringify(message)}`)

	const { sessionID, event, channel, user, text } = message
	const { id, first_name: firstName = "Нет данных", last_name: lastName = "Нет данных", phone } = user

	const userId = extractPhoneNumber(id)
	if (!userId) {
		throw new Error(`Empty user id`)
	}

	const requestId = uuid.v4()
	await agentStorage.globalStorage.set(getRequestKey(userId), requestId)

	const slots = getSlots(userId)
	const requestBody = createSendMessageRequestBody(userId, text, userId, firstName, lastName, slots)

	if (event === "callstarted" || event === IncomingEvents.START) {
		requestBody.content.text = "/start"
	}

	if (event === "callended" || event === IncomingEvents.FINISH) {
		await agentStorage.globalStorage.del(getRequestKey(userId))
		await finishDialog(userId)
		return
	}

	await sendMessage(requestBody)

	const textForUser = await waitBotResponse(SECONDS_TO_RESPONSE, userId, requestId)
	if (!textForUser) {
		throw new Error(`Text to response not found`)
	}

	return createResponse(sessionID, event, channel, phone, textForUser)
}

main()
	.then(response => resolve(response))
	.catch(err => {
		logger.error(err)
		resolve({})
	})
