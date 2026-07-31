const {
	channelId: CHANNEL_ID,
	customerId: CUSTOMER_ID,
	slots: SLOTS,
	channelAuthToken: AUTHORIZATION_TOKEN_INCOMING,
	urlMediatorService: URL_MEDIATOR,
	channelsUrl: CHANNELS_URL,
	routingTopics: ROUTING_TOPICS,
	routingText: ROUTING_TEXT
} = agentSettings

const SECONDS_TO_RESPONSE = 30
const INCOMING_API = `http://opbot-channels:8082/webhooks/integration_channel/${CHANNEL_ID}`
const MESSAGE_TYPE_TEXT = 1

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

const getOmniUserId = async (channelId, channelUserId) => {
	try {
		const response = await axios.get(CHANNELS_URL +
			"/user-channels/get_omni_user_id?customer_id=" + CUSTOMER_ID + "&channel_id=" +
			channelId + "&channel_user_id=" + channelUserId)
		return response.data
	} catch (error) {
		logger.error(`Error getOmniUserId: ${error}`)
		throw error
	}
}

const getDialogHistory = async (dialogId) => {
	if (!dialogId) return {messages: [], isRouted: false, routingTopic: "", routingGroups: []}
	try {
		const response = await axios.get(`${URL_MEDIATOR}?dialog_id=${dialogId}`, {
			timeout: 10000
		})
		const data = response.data
		//logger.info({data}, "DialogHistory")
		if (!data || !Array.isArray(data)) return {messages: [], isRouted: false, routingTopic: "", routingGroups: []}

		let isRouted = false
		let routingTopic = ""
		let routingGroups = []
		const parsed = data.reduce((acc, item) => {
			const isUser = !!item.msg
			const source = isUser ? item.msg : item.reply
			const type = source?.message_type
			const text = source?.message?.text

			if (!isRouted && type === 30) {
				const msgText = text || ""
				if (msgText.includes("routingagent")) {
					isRouted = true
					const topic = msgText.replace("/switchredirect routingagent", "").trim()
					const topics = ROUTING_TOPICS || {}
					const info = topics[topic] || topics["Не определена"] || {
						topic: "Не определена",
						groups: [{id: 411, name: "Разное"}]
					}
					routingTopic = info.topic
					routingGroups = info.groups
				}
			}

			if (type === MESSAGE_TYPE_TEXT && text) {
				acc.push({
					role: isUser ? "user" : "assistant",
					message: text,
					timestamp: source?.timestamps?.dispatched || 0
				})
			}
			return acc
		}, [])

		const last3 = parsed.slice(-3)
		logger.info(`Dialog history: total=${parsed.length}, isRouted=${isRouted}, routingTopic="${routingTopic}", last3=${JSON.stringify(last3)}`)

		return {messages: parsed, isRouted, routingTopic, routingGroups}
	} catch (e) {
		logger.error(`Error getDialogHistory: ${e}`)
		return {messages: [], isRouted: false, routingTopic: "", routingGroups: []}
	}
}

const getLastBotMessage = (history) => {
	for (let i = history.length - 1; i >= 0; i--) {
		if (history[i].role === "assistant") {
			return history[i].message
		}
	}
	return ""
}

const getHeaders = () => ({
	'Authorization': AUTHORIZATION_TOKEN_INCOMING,
	'Content-Type': 'application/json'
})

const createSendMessageRequestBody = (phone, text, userId, firstName, lastName, slots) => ({
	id: uuid.v4(),
	content: {
		text: text?.trim(),
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

const sendMessage = async (body) => {
	let response
	try {
		const responseFromUrl = await axios.post(INCOMING_API, body, {headers: getHeaders()})
		logger.info(`Incoming data ${JSON.stringify(responseFromUrl.data)}`)
		response = responseFromUrl.data || null
	} catch (error) {
		logger.error(`Error when sending request to ${INCOMING_API}: ${error}`)
		response = null
	}
	return response
}

const waitBotResponse = async (maxSeconds, dialogId, historyLenBefore) => {
	const startTime = Date.now()
	const maxWaitMs = maxSeconds * 1000
	let pollCount = 0

	while (true) {
		if (Date.now() - startTime > maxWaitMs) {
			logger.info(`Timeout has exceeded ${maxSeconds}s`)
			return {text: "", isRouted: false, routingTopic: "", routingGroups: []}
		}

		pollCount++
		const result = await getDialogHistory(dialogId)
		const history = result.messages
		const lastItem = history[history.length - 1]
		const botText = getLastBotMessage(history)

		logger.info(`Poll #${pollCount}: historyLen=${history.length}, historyLenBefore=${historyLenBefore}, botText="${botText}", lastItemRole=${lastItem?.role}, isRouted=${result.isRouted}`)

		if (result.isRouted) {
			logger.info(`Dialog routed to operator, stopping poll`)
			return {text: "", isRouted: true, routingTopic: result.routingTopic, routingGroups: result.routingGroups}
		}

		if (history.length > historyLenBefore && lastItem?.role === "assistant" && botText && botText.trim().length > 0) {
			logger.info(`Got bot response: ${botText}`)
			return {text: botText.trim(), isRouted: false, routingTopic: "", routingGroups: []}
		}

		const pauseStart = Date.now()
		const second = 1000
		while (Date.now() - pauseStart < second) {
		}
	}
}

const createResponse = (sessionId, event, channel, phone, text, transferTarget) => {
	const base = {
		sessionID: sessionId,
		event,
		channel,
		phone,
		text,
		timestamp: Date.now()
	}
	if (transferTarget) {
		base.transfer_target = transferTarget
	}
	return base
}

const getSlots = (userId) => {
	return [
		{id: SLOTS.userId, value: userId}
	]
}

const finishDialog = async (omniUserId) => {
	if (!omniUserId) {
		logger.info(`finishDialog: omniUserId is null, skipping`)
		return
	}
	try {
		const {Response: dialogId} = await agentApi.getDialogId(omniUserId, CUSTOMER_ID)
		await agentApi.finishDialog(dialogId, "Call end", 5)
	} catch (err) {
		logger.error({stack: err.stack}, `Error when finish dialog: ${err}`)
	}
}

const waitForDialog = async (omniUserId, existingDialogId, maxSeconds = 10) => {
	if (existingDialogId) return existingDialogId

	const startTime = Date.now()
	const maxWaitMs = maxSeconds * 1000

	while (Date.now() - startTime < maxWaitMs) {
		const {Response: dialogId} = await agentApi.getDialogId(omniUserId, CUSTOMER_ID)
		if (dialogId) {
			logger.info(`Dialog created: ${dialogId}`)
			return dialogId
		}
		const pauseStart = Date.now()
		while (Date.now() - pauseStart < 200) {
		}
	}

	logger.info(`Timeout waiting for dialog creation`)
	return null
}

const waitForOmniUserId = async (channelId, userId, maxSeconds = 10) => {
	const startTime = Date.now()
	const maxWaitMs = maxSeconds * 1000

	while (Date.now() - startTime < maxWaitMs) {
		const result = await getOmniUserId(channelId, userId)
		if (result) {
			logger.info(`OmniUserId appeared: ${result}`)
			return result
		}
		const pauseStart = Date.now()
		while (Date.now() - pauseStart < 200) {
		}
	}

	logger.info(`Timeout waiting for omniUserId after sendMessage`)
	return null
}

const main = async () => {
	logger.info({"Incoming message": message})
	const {sessionID, event, channel, user, text} = message
	const {id, first_name: firstName = "Нет данных", last_name: lastName = "Нет данных", phone} = user

	const userId = extractPhoneNumber(id)
	if (!userId) {
		throw new Error(`Empty user id`)
	}

	let omniUserId = await getOmniUserId(CHANNEL_ID, userId)
	logger.info(`Got omniUserId: ${omniUserId}`)

	let dialogId
	if (omniUserId) {
		const {Response} = await agentApi.getDialogId(omniUserId, CUSTOMER_ID)
		dialogId = Response
		logger.info(`Got dialogId: ${Response}`)
	}

	const slots = getSlots(userId)
	const requestBody = createSendMessageRequestBody(userId, text, userId, firstName, lastName, slots)

	if (event === "callstarted" || event === IncomingEvents.START) {
		requestBody.content.text = "/start"
	}

	if (event === "callended" || event === IncomingEvents.FINISH) {
		await finishDialog(omniUserId)
		return {}
	}

	const historyResult = await getDialogHistory(dialogId)
	const historyLenBefore = historyResult.messages.length
	logger.info(`History length before send: ${historyLenBefore}`)

	await sendMessage(requestBody)
	logger.info(`Sent to platform: ${requestBody.content.text}`)

	if (!omniUserId) {
		omniUserId = await waitForOmniUserId(CHANNEL_ID, userId, 10)
		if (!omniUserId) {
			throw new Error(`OmniUserId not created after send`)
		}
	}

	const currentDialogId = await waitForDialog(omniUserId, dialogId)
	if (!currentDialogId) {
		throw new Error(`Dialog not created`)
	}

	const response = await waitBotResponse(SECONDS_TO_RESPONSE, currentDialogId, historyLenBefore)

	if (response?.isRouted) {
		await finishDialog(omniUserId)
		return createResponse(sessionID, OutgoingEvents.TRANSFER, channel, phone, ROUTING_TEXT, {
			topic: response.routingTopic,
			groups: response.routingGroups
		})
	}

	if (!response.text) {
		throw new Error(`Text to response not found`)
	}

	return createResponse(sessionID, event, channel, phone, response.text)
}

main()
	.then(response => {
		logger.info({response})
		resolve(response)
	})
	.catch(err => {
		logger.error(err)
		resolve({})
	})
