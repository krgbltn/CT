const INCOMING_API = agentSettings.incoming_api
const AUTHORIZATION_TOKEN_INCOMING = agentSettings.authorization_token_incoming
const SLOTS = agentSettings.slots

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

function buildMessageResponse(
	{
		mid = "",
		text = "",
		attachments = [],
		action = "",
		sender = {},
		chatId,
		type = MESSAGE_TYPES.MESSAGE
	}
) {
	const {user_id, first_name = "", last_name = "", name = ""} = sender

	const isScore = action?.includes("__#score__")
	return {
		id: mid,
		content: {
			text,
			attachments: formatAttachments(attachments),
			...(!isScore && action
				? {action: action}
				: {}),
			...(isScore
				? {score: +action.replace("__#score__", "")}
				: {}),
		},
		message_type: !isScore ? type : MESSAGE_TYPES.UPDATE_DIALOG_SCORE,
		user: {
			id: String(user_id),
			first_name,
			last_name
		},
		slots: [
			{id: SLOTS.maxChatId, value: String(chatId)},
			{id: SLOTS.maxUserId, value: String(user_id)},
			{id: SLOTS.maxFirstName, value: first_name},
			{id: SLOTS.maxLastName, value: last_name},
			{id: SLOTS.maxUserName, value: name}
		]
	}
}

const processBotStarted = (chatId, sender) => {
	return {
		mid: MESSAGE_TYPES_MAX.BOT_STARTED,
		sender,
		chatId,
		type: MESSAGE_TYPES.INITIAL
	}
}

const processMessageCallback = (messageData, callback) => {
	return {
		mid: messageData?.body?.mid,
		action: callback?.payload ?? "",
		sender: callback?.user,
		chatId: messageData?.recipient?.chat_id
	}
}

const processDefault = (messageData) => {
	const sender = messageData?.sender || {}
	const recipient = messageData?.recipient || {}
	const body = messageData?.body || {}

	return {
		mid: body.mid,
		attachments: body.attachments ?? [],
		sender,
		chatId: recipient.chat_id
	}
}

const handleBotStopped = async (update_type, chatId, sender) => {
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
	return {sender, chatId}
}

async function preprocessMessage() {
	const {update_type, chat_id, user, message: messageData, callback} = message
	let result
	const text = messageData?.body?.text ?? ""

	switch (update_type) {
		case MESSAGE_TYPES_MAX.BOT_STARTED:
			result = processBotStarted(chat_id, user)
			break

		case MESSAGE_TYPES_MAX.MESSAGE_CALLBACK:
			result = processMessageCallback(messageData, callback)
			break

		case MESSAGE_TYPES_MAX.BOT_STOPPED:
		case MESSAGE_TYPES_MAX.BOT_REMOVED:
			result = await handleBotStopped(update_type, chat_id, user)
			break

		default:
			result = processDefault(messageData)
	}

	return buildMessageResponse({
		...result,
		text
	})
}

async function sendMessage() {
	const data = await preprocessMessage()
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
	logger.info(`Raw incoming message: ${JSON.stringify(message)}`)

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
		resolve([])
	})
