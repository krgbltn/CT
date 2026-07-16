const INCOMING_API = agentSettings.incoming_api
const AUTHORIZATION_TOKEN_INCOMING = agentSettings.authorization_token_incoming
const SLOTS = agentSettings.slots
const MAX_BOT_HOST = agentSettings.maxBotHost
const MAX_API_TOKEN = agentSettings.maxBotToken
const EVALUATION_MESSAGE = agentSettings.evaluation_message || "Спасибо за вашу оценку:"
const REMOVE_BUTTONS_AFTER_CLICK = agentSettings.removeButtonsAfterClick ?? true
const UPDATE_SLOT_USER = agentSettings.update_slot_user ?? false
const PROXY = agentSettings.proxy

const indexScore = "__#score__"
const postfix = "userDataSent"
const CALLBACK_MESSAGE_TEXT_PREFIX = "max_callback_message_text:"

const getHttpsAgent = () => {
	const baseAgent = new https.Agent({
		rejectUnauthorized: false,
		secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
	})

	if (!PROXY) {
		return baseAgent
	}

	try {
		const proxyAgent = new HttpsProxyAgent(`http://${PROXY.host}:${PROXY.port}`)
		const originalCallback = proxyAgent.callback.bind(proxyAgent)
		proxyAgent.callback = function(req, opts) {
			opts.rejectUnauthorized = false
			opts.secureOptions = crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
			return originalCallback(req, opts)
		}
		return proxyAgent
	} catch (error) {
		logger.warn({"Can't create HttpProxyAgent": error})
		return baseAgent
	}
}

const httpsAgent = getHttpsAgent()

const isHttpsProxyAgentNowAvailable = httpsAgent instanceof https.Agent

const proxyConfig = PROXY && isHttpsProxyAgentNowAvailable ? {
	protocol: "http",
	host: PROXY.host,
	port: PROXY.port
} : undefined

const ATTACHMENT_TYPE = Object.freeze({
	IMAGE: "image",
	FILE: "file",
	VIDEO: "video",
	AUDIO: "audio",
	STICKER: "sticker",
	SHARE: "share",
	UNKNOWN: "unknown"
})

const ATTACHMENT_FILE_NAME = Object.freeze({
	IMAGE: "Изображение.jpg",
	FILE: "Файл без имени",
	VIDEO: "Видео.mp4",
	AUDIO: "Аудио.mp3",
	STICKER: "Стикер.jpg",
	SHARE: "Ссылка",
	UNKNOWN: "Вложение неизвестного типа"
})

const MESSAGE_TYPES_MAX = Object.freeze({
	BOT_STARTED: "bot_started",
	BOT_STOPPED: "bot_stopped",
	BOT_REMOVED: "bot_removed",
	MESSAGE_CREATED: "message_created",
	MESSAGE_CALLBACK: "message_callback"
})

const CHAT_TYPE = Object.freeze({
	CHAT: "chat",
	CHANNEL: "channel",
	DIALOG: "dialog"
})

const MESSAGE_TYPES = Object.freeze({
	INITIAL: 0,
	MESSAGE: 1,
	UPDATE_DIALOG_SCORE: 15
})

function getFilenameByAttachment(attachment) {
	switch (attachment.type) {
		case ATTACHMENT_TYPE.FILE:
			return attachment.filename || ATTACHMENT_FILE_NAME.FILE
		case ATTACHMENT_TYPE.IMAGE:
			return ATTACHMENT_FILE_NAME.IMAGE
		case ATTACHMENT_TYPE.VIDEO:
			return ATTACHMENT_FILE_NAME.VIDEO
		case ATTACHMENT_TYPE.AUDIO:
			return ATTACHMENT_FILE_NAME.AUDIO
		case ATTACHMENT_TYPE.STICKER:
			return ATTACHMENT_FILE_NAME.STICKER
		default:
			return ATTACHMENT_FILE_NAME.UNKNOWN
	}
}

function formatAttachments(attachments) {
	if (!Array.isArray(attachments) || attachments.length === 0) return []

	return attachments
		.filter(att => att.type && att.type !== ATTACHMENT_TYPE.SHARE && att.payload?.url)
		.map(att => ({
			url: att.payload.url,
			name: getFilenameByAttachment(att),
			type: att.type.toUpperCase()
		}))
}

function findButtonLabel(messageData, payload) {
	const attachments = messageData?.body?.attachments || []
	for (const att of attachments) {
		if (att.type === "inline_keyboard") {
			for (const row of (att.payload?.buttons || [])) {
				for (const btn of row) {
					if (btn.payload === payload) return btn.text
				}
			}
		}
	}
	return null
}

function getButtonText(action, messageData) {
	if (action?.includes(indexScore)) return action.replace(indexScore, "")
	return findButtonLabel(messageData, action) || action
}

async function updateMessageAfterClick(callbackId, action, buttonLabel, originalText, messageId) {
	if (!REMOVE_BUTTONS_AFTER_CLICK || !action) return

	const isScore = action.includes(indexScore)
	const savedTextKey = !isScore && messageId ? `${CALLBACK_MESSAGE_TEXT_PREFIX}${messageId}` : null
	const savedText = savedTextKey ? await agentStorage.globalStorage.get(savedTextKey) : null
	const baseText = isScore ? EVALUATION_MESSAGE : savedText || originalText
	const label = buttonLabel || action.replace(indexScore, "") || action
	const updatedText = `${baseText}\n\n✅ ${label}`

	try {
		await axios({
			method: 'post',
			url: `${MAX_BOT_HOST}/answers?callback_id=${callbackId}`,
			httpsAgent,
			proxy: proxyConfig,
			headers: {
				Authorization: MAX_API_TOKEN,
				'Content-Type': 'application/json'
			},
			data: {
				message: {
					text: updatedText,
					attachments: [],
					format: "markdown"
				}
			}
		})
		if (savedTextKey) {
			await agentStorage.globalStorage.del(savedTextKey)
		}
	} catch (error) {
		logger.error({error: error.message}, "Failed to update message after click")
	}
}

async function buildMessageResponse(
	{
		mid = "",
		text = "",
		attachments = [],
		action = "",
		callbackId = "",
		sender = {},
		chatId,
		reply_id,
		type = MESSAGE_TYPES.MESSAGE,
		payload = "",
		messageTimestamp,
		buttonLabel = ""
	}
) {
	const {user_id, first_name = "", last_name = "", name = ""} = sender

	const isScore = action?.includes(indexScore)
	const score = action?.replace(indexScore, "")
	if (action) {
		await updateMessageAfterClick(callbackId, action, buttonLabel, text, mid)
	}
	const apiMessage = {
		id: callbackId || mid,
		content: {
			text,
			attachments: formatAttachments(attachments),
			...(!isScore && action
				? {action: action}
				: {}),
			...(isScore
				? {score: +score}
				: {}),
		},
		reply_to_msg_id: reply_id,
		message_type: !isScore ? type : MESSAGE_TYPES.UPDATE_DIALOG_SCORE,
		user: {
			id: String(user_id)
		},
		timestamp: messageTimestamp || Date.now(),
		slots: [
			{id: SLOTS.maxChatId, value: String(chatId)},
			{id: SLOTS.maxUserId, value: String(user_id)},
			{id: SLOTS.maxUserName, value: name}
		]
	}
	const isUpdateUser = await agentStorage.globalStorage.get(user_id + postfix)
	if (!isUpdateUser || UPDATE_SLOT_USER) {
		apiMessage.user.first_name = first_name
		apiMessage.user.last_name = last_name
		apiMessage.slots.push(
			{id: SLOTS.maxFirstName, value: first_name},
			{id: SLOTS.maxLastName, value: last_name},
		)
	}
	if (!isUpdateUser) {
		await agentStorage.globalStorage.set(user_id + postfix, true)
	}
	if (payload) {
		apiMessage.slots.push(
			{id: SLOTS.deep_linking_token, value: payload}
		)
	}

	return apiMessage
}

const processBotStarted = (chatId, sender, payload, timestamp) => {
	return {
		mid: MESSAGE_TYPES_MAX.BOT_STARTED,
		sender,
		chatId,
		type: MESSAGE_TYPES.INITIAL,
		payload,
		messageTimestamp: timestamp
	}
}

const processMessageCallback = (messageData, callback) => {
	return {
		mid: messageData?.body?.mid,
		action: callback?.payload ?? "",
		sender: callback?.user,
		chatId: messageData?.recipient?.chat_id,
		callbackId: callback?.callback_id,
		messageTimestamp: callback?.timestamp
	}
}

const processDefault = (messageData) => {
	const sender = messageData?.sender || {}
	const recipient = messageData?.recipient || {}
	const body = messageData?.body || {}
	const link = messageData?.link || {}

	return {
		mid: body.mid,
		attachments: body.attachments ?? [],
		sender,
		reply_id: link?.type === "reply" ? link?.message?.mid : null,
		chatId: recipient.chat_id,
		messageTimestamp: messageData?.timestamp
	}
}

const handleBotStopped = async (update_type, chatId, sender, timestamp) => {
	const dialogId = await agentStorage.globalStorage.get(chatId)
	logger.info(`dialogId: ${dialogId}`)

	try {
		if (dialogId) {
			const {Response} = await agentApi.finishDialog(dialogId, update_type)
			logger.info(`finishDialog to: ${JSON.stringify(Response)}`)
		}
	} catch (error) {
		logger.error(`Error when completing a task with ID ${dialogId}: ${error.message}`)
	}

	logger.info(`Client ${update_type} the bot for chat: ${chatId}`)
	return {sender, chatId, messageTimestamp: timestamp}
}

async function preprocessMessage() {
	const {update_type, chat_id, user, payload, message: messageData, callback, timestamp} = message
	let result
	const text = messageData?.body?.text ?? ""

	switch (update_type) {
		case MESSAGE_TYPES_MAX.BOT_STARTED:
			result = processBotStarted(chat_id, user, payload, timestamp)
			break

		case MESSAGE_TYPES_MAX.MESSAGE_CALLBACK:
			result = processMessageCallback(messageData, callback)
			break

		case MESSAGE_TYPES_MAX.BOT_STOPPED:
		case MESSAGE_TYPES_MAX.BOT_REMOVED:
			result = await handleBotStopped(update_type, chat_id, user, timestamp)
			break

		case MESSAGE_TYPES_MAX.MESSAGE_CREATED:
			const chatType = messageData?.recipient?.chat_type || ""
			switch (chatType) {
				case CHAT_TYPE.DIALOG:
					result = processDefault(messageData)
					break
				case CHAT_TYPE.CHAT:
				case CHAT_TYPE.CHANNEL:
				default:
					logger.info(`Chat type "${chatType}" not supported yet. Skip.`)
					return false
			}
			break

		default:
			result = processDefault(messageData)
	}

	if (update_type === MESSAGE_TYPES_MAX.MESSAGE_CALLBACK && result.action) {
		result.buttonLabel = getButtonText(result.action, messageData)
	}

	return await buildMessageResponse({
		...result,
		text
	})
}

async function sendMessage() {
	const data = await preprocessMessage()
	if (!data) return

	logger.info(`Data: ${JSON.stringify(data)}`)

	const config = {
		method: 'post',
		maxBodyLength: Infinity,
		url: INCOMING_API,
		headers: {
			'Authorization': AUTHORIZATION_TOKEN_INCOMING,
			'Content-Type': 'application/json'
		},
		data: data
	}

	try {
		const response = await axios(config)
		if (response.status === 200) {
			logger.info(`Send status: ${response.status}`)
		} else {
			logger.warn(`Unexpected success status: ${response.status}`)
		}
	} catch (error) {
		logger.error(`Error when sending message to CT: ${error}`)
	}
}

async function run() {
	logger.info({"Raw incoming message": message})
	try {
		await sendMessage()
	} catch (error) {
		logger.error(`Error in run(): ${error}`)
	}
	return {}
}

run()
	.then(res => resolve(res))
	.catch(er => {
		logger.error(JSON.stringify(er))
		resolve({})
	})
