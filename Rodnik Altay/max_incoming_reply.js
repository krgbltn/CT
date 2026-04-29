const INCOMING_API = agentSettings.incoming_api
const AUTHORIZATION_TOKEN_INCOMING = agentSettings.authorization_token_incoming
const SLOTS = agentSettings.slots
const MAX_BOT_HOST = agentSettings.maxBotHost
const MAX_API_TOKEN = agentSettings.maxBotToken
const EVALUATION_MESSAGE = agentSettings.evaluation_message || "Благодарим за оценку 🌷:"
const REMOVE_BUTTONS_AFTER_CLICK = agentSettings.removeButtonsAfterClick ?? true
const PROXY = agentSettings.proxy

const indexScore = "__#score__"

const getHttpsAgent = () => {
	const baseAgent = new https.Agent({
		rejectUnauthorized: false,
		secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
	})

	if (!PROXY) {
		return baseAgent
	}

	try {
		return new HttpsProxyAgent(`http://${PROXY.host}:${PROXY.port}`)
	} catch (error) {
		logger.warn(`Can't create HttpProxyAgent: ${error}`)
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

function createMessageButton(score) {
	// Варианты оценки диалога от одного до пяти
	const baseButtons = [1, 2, 3, 4, 5].map(num => ({
		type: "callback",
		text: num.toString(),
		payload: indexScore + num
	}))

	return REMOVE_BUTTONS_AFTER_CLICK
		? {
			text: EVALUATION_MESSAGE,
			attachments: [{
				type: "inline_keyboard",
				payload: {
					buttons: [[{
						type: "callback",
						text: score,
						payload: indexScore + score
					}]]
				}
			}]
		}
		: {
			text: `${EVALUATION_MESSAGE} ${score}`,
			attachments: [{
				type: "inline_keyboard",
				payload: {
					buttons: [baseButtons]
				}
			}]
		}
}

async function updatingButtonSelection(callbackId, score) {
	const message = createMessageButton(score)

	const config = {
		method: 'post',
		url: `${MAX_BOT_HOST}/answers?callback_id=${callbackId}`,
		httpsAgent,
		proxy: proxyConfig,
		headers: {
			Authorization: MAX_API_TOKEN,
			'Content-Type': 'application/json'
		},
		data: {message}
	}

	try {
		await axios(config)
	} catch (error) {
		logger.error({error: error.message}, "Failed to update button selection")
	}
}

// 🆕 НОВОЕ: Функция для извлечения информации о цитировании из reply
function extractReplyInfo(link) {
	if (!link || link.type !== 'reply') return null;

	const quotedMessage = link.message;
	const quotedSender = link.sender || {};

	// Формируем текст цитаты
	let quotedText = quotedMessage?.text || '';

	// Если нет текста, но есть вложения
	if (!quotedText && quotedMessage?.attachments?.length) {
		quotedText = '[Вложение]';
	}

	// Имя отправителя цитаты
	const senderName = quotedSender.first_name
		|| quotedSender.name
		|| quotedSender.username
		|| 'Пользователь';

	return {
		quoted_message_id: quotedMessage.mid,
		quoted_text: quotedText,
		quoted_sender_name: senderName,
		quoted_timestamp: quotedMessage.timestamp || Date.now(),
		// Сохраняем полные данные для дальнейшего использования
		raw_quoted_message: quotedMessage,
		raw_quoted_sender: quotedSender
	};
}

// ✏️ ИЗМЕНЕНО: Добавлена обработка replyInfo
async function buildMessageResponse(
	{
		mid = "",
		text = "",
		attachments = [],
		action = "",
		callbackId = "",
		sender = {},
		chatId,
		type = MESSAGE_TYPES.MESSAGE,
		replyInfo = null  // 🆕 НОВОЕ: Параметр для информации о цитировании
	}
) {
	const {user_id, first_name: incomingFirstName = "", last_name = "", name = ""} = sender

	const isScore = action?.includes(indexScore)
	const score = action?.replace(indexScore, "")
	if (isScore) {
		await updatingButtonSelection(callbackId, score)
	}

	// 🆕 НОВОЕ: Форматируем информацию о цитате
	let reply = null;
	if (replyInfo && replyInfo.type === 'reply') {
		const quotedMessage = replyInfo.message;
		const quotedSender = replyInfo.sender || {};

		reply = {
			message_id: quotedMessage?.mid || '',
			text: quotedMessage?.text || '',
			sender_name: quotedSender.first_name || quotedSender.name || quotedSender.username || 'Пользователь',
			timestamp: quotedMessage?.timestamp || Date.now(),
			sender_id: quotedSender?.user_id || ''
		};

		// Добавляем вложения, если есть
		if (quotedMessage?.attachments?.length) {
			reply.has_attachments = true;
			reply.attachments_count = quotedMessage.attachments.length;
		}

		logger.info(`🆕 Reply detected - quoting message: ${reply.message_id} from ${reply.sender_name}${reply.text ? `: "${reply.text.substring(0, 50)}"` : ''}`);
	}

	const slots = [
		{id: SLOTS.maxChatId, value: String(chatId)},
		{id: SLOTS.maxUserId, value: String(user_id)},
		{id: SLOTS.maxLastName, value: last_name},
		{id: SLOTS.maxUserName, value: name}
	]

	// 🔑 Уникальный ключ для каждого пользователя
	const firstNameKey = `${SLOTS.maxFirstName}_${user_id}`;

	let storedFirstName = null;
	try {
		storedFirstName = await agentStorage.globalStorage.get(firstNameKey);
		logger.info(`Stored first_name for user ${user_id}: "${storedFirstName}"`);
	} catch (error) {
		logger.error(`Error getting slot ${firstNameKey}: ${error}`);
	}

	const isStoredEmpty = !storedFirstName || storedFirstName.trim() === "";
	const isIncomingValid = incomingFirstName?.trim();

	if (isStoredEmpty && isIncomingValid) {
		const nameToSave = incomingFirstName.trim();
		slots.splice(2, 0, {id: SLOTS.maxFirstName, value: nameToSave});

		try {
			const setResult = await agentStorage.globalStorage.set(firstNameKey, nameToSave);
			logger.info(`✅ globalStorage.set() result: ${setResult}, saved: "${nameToSave}"`);
		} catch (error) {
			logger.error(`Error saving slot ${firstNameKey}: ${error}`);
		}
	} else if (!isStoredEmpty) {
		logger.info(`📦 Using existing first_name from storage: "${storedFirstName}"`);
	}

	// Для user.first_name используем сохранённое имя (если есть)
	const finalFirstName = (!isStoredEmpty && storedFirstName) ? storedFirstName : incomingFirstName;

	// 🆕 НОВОЕ: Формируем текст сообщения с визуальным выделением цитаты
	let finalText = text;
	if (reply && !isScore) {
		// Вариант с красивым форматированием
		const quotedPreview = reply.text.length > 100 ? reply.text.substring(0, 100) + '...' : reply.text;
		//finalText = `💬 **Ответ на сообщение от ${reply.sender_name}:**\n> ${quotedPreview}\n\n${text}`;

		// Альтернативные варианты форматирования (раскомментируйте нужный):
		// Вариант 2: Компактный
		// finalText = `📎 В ответ ${reply.sender_name}: «${quotedPreview}»\n\n${text}`;

		// Вариант 3: Markdown цитата
		 finalText = `> **${reply.sender_name}:** ${reply.text}\n\n${text}`;

		// Вариант 4: HTML (если CT поддерживает)
		// finalText = `<blockquote><b>${reply.sender_name}:</b> ${reply.text}</blockquote><br/>${text}`;
	}

	const result = {
		id: mid,
		content: {
			text: finalText,
			attachments: formatAttachments(attachments),
			...(!isScore && action ? {action: action} : {}),
			...(isScore ? {score: +score} : {}),
		},
		message_type: !isScore ? type : MESSAGE_TYPES.UPDATE_DIALOG_SCORE,
		user: {
			id: String(user_id),
			first_name: finalFirstName,
			last_name
		},
		timestamp: Date.now(),
		slots: slots
	};

	// 🆕 НОВОЕ: Добавляем информацию о цитате отдельным полем для CT
	if (reply && !isScore) {
		result.reply_to = reply;
		logger.info(`🆕 Added reply_to field to message: ${JSON.stringify(reply)}`);
	}

	return result;
}

// ✏️ ИЗМЕНЕНО: Добавлена обработка reply в callback
const processMessageCallback = (messageData, callback) => {
	const link = messageData?.link || null;  // 🆕 НОВОЕ: Добавлен link
	return {
		mid: messageData?.body?.mid,
		action: callback?.payload ?? "",
		sender: callback?.user,
		chatId: messageData?.recipient?.chat_id,
		callbackId: callback?.callback_id,
		replyInfo: link?.type === 'reply' ? link : null  // 🆕 НОВОЕ: Добавлена информация о цитате
	}
}

// ✏️ ИЗМЕНЕНО: Добавлена обработка reply в обычном сообщении
const processDefault = (messageData) => {
	const sender = messageData?.sender || {}
	const recipient = messageData?.recipient || {}
	const body = messageData?.body || {}
	const link = messageData?.link || null  // 🆕 НОВОЕ: Извлекаем link из сообщения

	return {
		mid: body.mid,
		text: body.text || "",  // 🆕 НОВОЕ: Добавлен text
		attachments: body.attachments ?? [],
		sender,
		chatId: recipient.chat_id,
		replyInfo: link?.type === 'reply' ? link : null  // 🆕 НОВОЕ: Добавляем информацию о цитате
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

// ✏️ ИЗМЕНЕНО: Добавлена передача replyInfo
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
			result = processDefault(messageData)  // ✏️ ИЗМЕНЕНО: Теперь возвращает replyInfo
	}

	return await buildMessageResponse({
		...result,
		text  // 🆕 НОВОЕ: Явно передаём текст
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