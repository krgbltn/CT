const {
	maxBotToken: MAX_API_TOKEN,
	maxBotHost: MAX_BOT_HOST,
	host: HOST,
	customerId: CUSTOMER_ID,
	incomingAgent: INCOMING_AGENT,
	slots: SLOTS,
	webhook_events: WEBHOOK_EVENTS,
	button_text: TEXT_FOR_BUTTON_MESSAGE = "Нажмите интересующую вас кнопку",
	useLegacy: USE_LEGACY = false,
	proxy: PROXY,
	disableLinkPreview: DISABLE_LINK_PREVIEW = false,
	incomingProcessor: INCOMING_PROCESSOR,
	has_score: HAS_SCORE = false,
	fileStorageUrl: FILE_STORAGE_URL,
	has_combination_keyboards: HAS_COMBINATION_KEYBOARDS = false
} = agentSettings

function createRatingMessage(isVertical = false) {
	const buttons = [1, 2, 3, 4, 5]
		.map(score => `[${score}](type:action action:__#score__${score})`)
		.join(isVertical ? '\n::\n' : '\n')

	return `Оцените работу оператора\n\n\`\`\`buttons\n::\n${buttons}\n\`\`\``
}

const MAX_COLUMNS = 7
const MAX_ROWS = 30
const SLOT_ID_OMNIUSER = "sys_omniuserid"
const DELETION_MESSAGE_ATTACHMENT = "Сообщение удалено"

const METHOD_API = Object.freeze({
	POST: "post",
	PUT: "put",
	DELETE: "delete"
})

const ATTACHMENT_TYPES = Object.freeze({
	TEXT: "text",
	IMAGE: "image",
	VIDEO: "video",
	AUDIO: "audio",
	FILE: "file"
})

const MESSAGE_TYPES = Object.freeze({
	start: "start",
	send_message: "send_message"
})

const MESSAGE_TYPES_SEND_MESSAGE = Object.freeze({
	MESSAGE: 1,
	FINISH_DIALOG: 16,
	AUTO_GREETING: 20,
	EDITED_BY_OPERATOR: 31,
	DELETED_BY_OPERATOR: 32
})

const ATTACHMENT_EXTENSION = Object.freeze({
	IMAGE: /\.(jpeg|jpg|gif|png)$/i,
	VIDEO: /\.(mp4|mov)$/i,
	AUDIO: /\.(mp3|wav)$/i
})

const BUTTON_TYPES = Object.freeze({
	inline: "inline_keyboard",
	url: 0,
	link: "link",
	callback: "callback",
	message: "message"
})

const TEXT_FORMAT = Object.freeze({
	html: "html",
	markdown: "markdown"
})

const MAX_TEXT_LENGTH = 4000
const markdownConverter = agentApi.createConverterMarkdown(agentApi.getPredefinedMarkdownRules().Empty)

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

const AUTH_HEADERS = USE_LEGACY ? {} : {
	Authorization: MAX_API_TOKEN
}

const AUTH_QUERY_STRING = USE_LEGACY ? `&access_token=${MAX_API_TOKEN}` : ""

function isErrorMessage(data) {
	return (data?.success === false &&
		(data?.message?.includes("errors.process.attachment.file.not.processed") ||
			data?.message?.includes("errors.process.attachment.video.not.processed") ||
			data?.message?.includes("EJB service unavailable")
		))

}

function axiosCreateWithAttachmentRetry() {
	const api = axios.create({
		baseURL: MAX_BOT_HOST,
		timeout: 50000,
		httpsAgent,
		proxy: proxyConfig,
		headers: AUTH_HEADERS
	})
	const retriesCount = 3
	const retriesTimeout = 2000
	axiosRetry(api, {
		retries: retriesCount,
		retryCondition: (error) => {
			logger.warn(`The reason for the repeat: ${error}`)
			const data = error.response?.data
			if (data?.code === "attachment.not.ready") {
				return true
			}
			return isErrorMessage(data)
		},
		validateResponse: (response) => {
			if (response.status === 200) {
				if (isErrorMessage(response.data)) {
					logger.warn(`Attachment not ready in 200 response. Retrying...`)
					return false
				}
			}
			if (response.status >= 400) {
				return false
			}
			return true
		},
		retryDelay: (retryCount) => {
			logger.warn(`Attachment not ready. Retry attempt ${retryCount} in ${retryCount * 2} seconds...`)
			return retryCount * retriesTimeout
		}
	})

	return api
}

const createAttachment = (type, token) => ({type, payload: {token}})

const createButton = (button) => [{type: BUTTON_TYPES.callback, text: button.caption, payload: button.payload}]

const createInlineButton = (btn) => {
	return btn.map(button => {
		return button.type === BUTTON_TYPES.url
			? {type: BUTTON_TYPES.link, text: button.title, url: button.action}
			: {type: BUTTON_TYPES.callback, text: button.title, payload: button.action}
	})
}

const getSlotValue = (slotId) => message.data.slots?.find((slot) => slot.id === slotId)?.value

function fixEmptyMarkdownLink(_, fullUrl, filename) {
	return `[${filename}](${fullUrl})`
}

function formatText(text) {
	const underlineMarkdownPattern = /__(.+?)__/g // Ищем блоки текста с подчеркиванием в ct
	const underlineMaxPattern = "++$1++" // блоки текста с подчеркиванием в max

	return text.replace(underlineMarkdownPattern, underlineMaxPattern)
}

// Удаляем блоки кнопок из текста
function removeButtonsFromText(text, complexAnswer) {
	const buttonPattern = /```buttons[\s\S]*?```/g // Ищем блоки кнопок (с пометкой buttons)
	const buttonPattern2 = /::::[\s\S]*?(?=\n::::|\n```|$)/g // Ищем блоки кнопок с ::::
	const internalArticlePattern = /buttons\n::\n.*?```/gi // Ищем блоки вложенные статьи
	const imageHyperLinkPattern = /\[\]\((https?:\/\/[^\s)]+\/([^/\s)]+))\)/g // Ищем ссылки на изображения

	let cleanedText = text
		.replace(buttonPattern, "") // удаляем кнопки
		.replace(internalArticlePattern, "") // удаляем вложенные статьи
		.replace(imageHyperLinkPattern, fixEmptyMarkdownLink) // чиним пустые ссылки
		.replace(/\\+/g, "") // удаляем экранирующие слеши
		.replace(/\n[ \t]*\n(?![ \t]*\n)/g, "\n") // схлопывает лишние пустые строки
		.replace(/(#{1,6} .+)\n+/g, "$1\n\n") // после заголовков уровня 1-6 оставляем пустую строку
		.trim()

	// Удаляем кнопки с :::: только если есть complexAnswer
	if (complexAnswer) {
		cleanedText = cleanedText.replace(buttonPattern2, "")
	}

	return formatText(cleanedText)
}

function addInlineButtonsFromText(attachments, inlineButtons) {
	if (inlineButtons.length) {
		attachments.push({
			type: BUTTON_TYPES.inline,
			payload: {buttons: inlineButtons.map(createInlineButton)}
		})
	}
}

function addActionButtons(attachments, actions) {
	attachments.push({
		type: BUTTON_TYPES.inline,
		payload: {buttons: actions.map(createButton)}
	})
}

async function addStickerAttachment(attachments, sticker) {
	const uploaded = await getUploadUrl(ATTACHMENT_TYPES.IMAGE)
	const token = await uploadToMax(sticker.sticker_url, ATTACHMENT_TYPES.IMAGE, uploaded.url, sticker.sticker_id, false)
	attachments.push(createAttachment(ATTACHMENT_TYPES.IMAGE, token))
}

async function addMediaAttachments(attachments, files) {
	for (const file of files) {
		const messageType = detectMediaType(file.attachment_url)
		const uploaded = await getUploadUrl(messageType)
		const token = await uploadToMax(file.attachment_url, messageType, uploaded.url, file.attachment_name)

		const baseAttachment = createAttachment(messageType, token)

		if (messageType === ATTACHMENT_TYPES.FILE) {
			baseAttachment.filename = file.attachment_name
		} else if ([ATTACHMENT_TYPES.AUDIO, ATTACHMENT_TYPES.VIDEO].includes(messageType)) {
			baseAttachment.payload.token = uploaded.token
		}

		attachments.push(baseAttachment)
	}
}

async function getUploadUrl(type) {
	try {
		const url = `${MAX_BOT_HOST}/uploads?type=${type}${AUTH_QUERY_STRING}`
		const {data} = await axios.post(url, {}, {httpsAgent, proxy: proxyConfig, headers: AUTH_HEADERS})
		logger.info(`Upload Url: ${JSON.stringify(data)}, to type: ${type}`)
		return data
	} catch (error) {
		logger.error(`Error getUploadUrl: ${error}`)
	}
}

function replaceUrlDomain(url, newDomain) {
	try {
		const urlObj = new URL(url)
		urlObj.protocol = "http:"
		urlObj.host = newDomain
		return urlObj.toString()
	} catch (error) {
		logger.error("Invalid URL:", error)
		return url
	}
}

async function uploadToMax(url, type, uploadUrl, name, replace = true) {
	try {
		const fileUrl = replace ? replaceUrlDomain(url, FILE_STORAGE_URL) : url
		const {data: stream} = await axios.get(fileUrl, {
			responseType: "stream",
			httpsAgent,
			proxy: proxyConfig,
			headers: AUTH_HEADERS
		})
		const form = new FormData()
		form.append("data", stream, {filename: name})

		const {data} = await axios.post(uploadUrl, form, {
			headers: {...form.getHeaders(), ...AUTH_HEADERS},
			httpsAgent,
			proxy: proxyConfig
		})
		logger.info(`Upload to Max: ${JSON.stringify(data)}, to type: ${type}`)
		if (type === ATTACHMENT_TYPES.IMAGE && data.photos) return Object.values(data.photos)[0].token
		if (type === ATTACHMENT_TYPES.FILE && data.token) return data.token
		if ([ATTACHMENT_TYPES.AUDIO, ATTACHMENT_TYPES.VIDEO].includes(type)) return true
		if (type === ATTACHMENT_TYPES.STICKER && data.token) return data.token
	} catch (error) {
		logger.error(`Error uploadToMax: ${error}`)
	}
}

function detectMediaType(url) {
	if (ATTACHMENT_EXTENSION.IMAGE.test(url)) return ATTACHMENT_TYPES.IMAGE
	if (ATTACHMENT_EXTENSION.VIDEO.test(url)) return ATTACHMENT_TYPES.VIDEO
	if (ATTACHMENT_EXTENSION.AUDIO.test(url)) return ATTACHMENT_TYPES.FILE
	return ATTACHMENT_TYPES.FILE
}

function splitTextByLength(text, maxLength = MAX_TEXT_LENGTH) {
	const chunks = []
	let start = 0

	while (start < text.length) {
		if (start + maxLength >= text.length) {
			chunks.push(text.slice(start))
			break
		}

		const end = start + maxLength
		const lastNewline = text.lastIndexOf('\n', end)

		const splitPoint = lastNewline > start ? lastNewline : end

		chunks.push(text.slice(start, splitPoint).trim())
		start = splitPoint + 1
	}

	return chunks.filter(chunk => chunk.length > 0)
}

const getColumnsForButton = (countButtons) => {
	const columns = Math.ceil(countButtons / MAX_ROWS)
	return columns > MAX_COLUMNS ? MAX_COLUMNS : columns
}

function buttonDistribution(combinedButtons) {
	const flatButtons = Object.values(combinedButtons).flat()
	const numberOfButtons = flatButtons.length
	const numberOfColumns = getColumnsForButton(numberOfButtons)
	const rows = []
	for (let i = 0; i < numberOfButtons; i += numberOfColumns) {
		rows.push(flatButtons.slice(i, i + numberOfColumns))
	}
	return rows.slice(0, MAX_ROWS)
}

function createMessage(text = "", attachments = [], format) {
	const messages = []

	const textChunks = splitTextByLength(text)
	if (!attachments.length) {
		textChunks.forEach(chunk => messages.push({text: chunk, format}))
		return messages
	}

	const inlineAttachments = attachments.filter(a => a.type === BUTTON_TYPES.inline)
	const imageAttachments = attachments.filter(a => a.type === ATTACHMENT_TYPES.IMAGE)
	const otherAttachments = attachments.filter(
		a => a.type !== ATTACHMENT_TYPES.IMAGE && a.type !== BUTTON_TYPES.inline
	)

	if (inlineAttachments.length) {
		const lastChunk = textChunks.pop() || ""
		textChunks.forEach(chunk => messages.push({text: chunk, format}))

		let combinedButtons = inlineAttachments[0].payload.buttons
		let lengthRowsButtons = inlineAttachments[0]?.payload?.buttons?.length

		if (HAS_COMBINATION_KEYBOARDS) {
			let combiningKeyboards = []

			for (const attachment of inlineAttachments) {
				if (attachment.payload?.buttons) {
					combiningKeyboards.push(...attachment.payload.buttons)
				}
			}
			lengthRowsButtons = combiningKeyboards.length
			combinedButtons = combiningKeyboards
		}

		if (lengthRowsButtons > MAX_ROWS) {
			combinedButtons = buttonDistribution(combinedButtons)
		}

		const combinedAttachment = {
			type: BUTTON_TYPES.inline,
			payload: {
				buttons: combinedButtons
			}
		}
		messages.push({
			text: lastChunk || TEXT_FOR_BUTTON_MESSAGE,
			format,
			attachments: [combinedAttachment]
		})
	} else {
		textChunks.forEach(chunk => messages.push({text: chunk, format}))
	}

	if (imageAttachments.length) {
		messages.push({text: "", format, attachments: imageAttachments})
	}

	for (const file of otherAttachments) {
		messages.push({text: "", format, attachments: [file]})
	}

	return messages
}

async function preprocessMessage(msg) {
	const textType = msg.content.text_type
	let text = msg.content.text
	const attachments = []

	if (textType === TEXT_FORMAT.markdown) {
		const markdownAnswers = markdownConverter.Parse(text)
		logger.info(`markdownAnswers ${JSON.stringify(markdownAnswers)}`)
		text = removeButtonsFromText(text)

		for (let markdownAnswer of markdownAnswers) {
			logger.info(`Create message from Markdown ${markdownAnswer.type}.`)
			switch (markdownAnswer.type) {
				case "TextAnswer":
					break
				case "FileAnswer":
					break
				case "ButtonsAnswer":
					addInlineButtonsFromText(attachments, markdownAnswer.buttonsAnswer?.buttons)
					break
				case "ComplexAnswer":
					text = removeButtonsFromText(msg.content.text, true)
					addInlineButtonsFromText(attachments, markdownAnswer.buttonsAnswer?.buttons)
					break
				default:
					logger.info(`Markdown ${markdownAnswer.type}. Skip.`)
					break
			}
		}
	}

	if (msg.content.actions?.length) {
		addActionButtons(attachments, msg.content.actions)
	}

	if (msg.content?.sticker) {
		await addStickerAttachment(attachments, msg.content.sticker)
	}

	if (msg.content.attachments?.length) {
		await addMediaAttachments(attachments, msg.content.attachments)
	}

	const format = textType === TEXT_FORMAT.markdown ? TEXT_FORMAT.markdown : TEXT_FORMAT.html
	return createMessage(text, attachments, format)
}

async function sendMessages(method, url, payload = {}) {
	try {
		const api = axiosCreateWithAttachmentRetry()
		logger.info(`payload: ${JSON.stringify(payload)}`)
		const {data} = await api[method](url, payload)
		logger.info(`MAX Message sent successfully: ${JSON.stringify(data)}`)
		return data
	} catch (error) {
		logger.error(`Error sending MAX message: ${JSON.stringify(error.response?.data || error.message)}`)
		throw new Error(`Error sending MAX message: ${JSON.stringify(error.response?.data || error.message)}`)
	}
}

function createResponseForChannel(chatId, userId, messages, error = []) {
	return {
		data: {
			chat_id: chatId,
			user_id: userId,
			messages: messages
		},
		errors: error
	}
}


async function handleSendMessage(data) {
	logger.info(`Incoming data ${JSON.stringify(data)}`)
	const chatId = getSlotValue(SLOTS.maxChatId)
	const userId = getSlotValue(SLOTS.maxUserId)
	const replies = await preprocessMessage(data)
	const messages = []
	const url = `/messages?user_id=${userId}&chat_id=${chatId}${AUTH_QUERY_STRING}&disable_link_preview=${DISABLE_LINK_PREVIEW}`
	for (const reply of replies) {
		try {
			const responseData = await sendMessages(METHOD_API.POST, url, reply)
			const infoMessages = {
				message_id: responseData?.message?.body?.mid,
				timestamp: responseData?.message?.timestamp
			}
			messages.push(infoMessages)
		} catch (error) {
			logger.error(`Send message error: ${error}`)
			return createResponseForChannel(chatId, userId, [], [error.message])
		}
	}
	return createResponseForChannel(chatId, userId, messages)
}

async function handleSendModifiedMessage(data) {
	logger.info(`Incoming modified data ${JSON.stringify(data)}`)
	const replies = await preprocessMessage(data)
	const chatId = getSlotValue(SLOTS.maxChatId)
	const userId = getSlotValue(SLOTS.maxUserId)
	const idMessages = JSON.parse(data.meta?.channel_message_ids)
	if (replies.length < idMessages.length) {
		const diff = idMessages.length - replies.length
		replies.push(...Array(diff).fill().map(() =>
			({text: DELETION_MESSAGE_ATTACHMENT, format: TEXT_FORMAT.markdown, attachments: []})))
	}
	if (replies.length > idMessages.length) {
		if ((replies.length - idMessages.length === 1) && idMessages.length === 1) {
			const lastIndex = idMessages.length - 1
			const extraElements = replies.slice(idMessages.length)

			const extraAttachments = extraElements.flatMap(item => item.attachments || [])
			if (extraAttachments.length > 0) {
				replies[lastIndex].attachments = [
					...(replies[lastIndex].attachments || []),
					...extraAttachments
				]
			}
		} else replies.length = idMessages.length
	}
	for (const [index, reply] of replies.entries()) {
		try {
			const id = idMessages?.[index]
			if (!id) continue
			const url = `/messages?message_id=${id}`
			const isAttachmentsNotExist = !reply.attachments || reply.attachments.length === 0
			const isSingleReply = replies.length === 1
			if (reply.text && reply.text !== DELETION_MESSAGE_ATTACHMENT && isAttachmentsNotExist) {
				reply.attachments = isSingleReply || idMessages.length !== 1 ? [] : null
			}
			await sendMessages(METHOD_API.PUT, url, reply)
		} catch (error) {
			logger.error(`Send message Modified error: ${error}`)
			return createResponseForChannel(chatId, userId, [], [error.message])
		}
	}
	return {}
}

async function handleDeletionMessage(data) {
	logger.info(`Incoming deletion data ${JSON.stringify(data)}`)
	const chatId = getSlotValue(SLOTS.maxChatId)
	const userId = getSlotValue(SLOTS.maxUserId)
	const idMessages = JSON.parse(data.meta?.channel_message_ids)
	for (const id of idMessages) {
		try {
			const url = `/messages?message_id=${id}`
			await sendMessages(METHOD_API.DELETE, url)
		} catch (error) {
			logger.error(`Send message Modified error: ${error}`)
			return createResponseForChannel(chatId, userId, [], [error.message])
		}
	}
	return {}
}

async function bindWebhook() {
	const INCOMING_WEBHOOK = INCOMING_PROCESSOR ?? `${HOST}/workplace/${CUSTOMER_ID}/${INCOMING_AGENT}`
	logger.info(`Start binding webhook ${INCOMING_WEBHOOK} for max.`)
	const url = `${MAX_BOT_HOST}/subscriptions?${AUTH_QUERY_STRING.slice(1)}`
	const data = {url: INCOMING_WEBHOOK, update_types: WEBHOOK_EVENTS}

	try {
		await axios.post(url, data, {httpsAgent, proxy: proxyConfig, headers: AUTH_HEADERS})
	} catch (error) {
		logger.error(`Failed bind webhooks from max. ${error}. Description ${error.response?.data?.description}`)
	}
}

async function recordDialogIdToGlobalStorage() {
	try {
		const omniUserId = getSlotValue(SLOT_ID_OMNIUSER)
		if (!omniUserId) {
			logger.info(`sys_omniuserid is empty, skipping execution.`)
		} else {
			const checkDialogId = await agentStorage.globalStorage.get(getSlotValue(SLOTS.maxChatId))
			logger.info(`check DialogId: ${JSON.stringify(checkDialogId)}`)
			if (!checkDialogId) {
				const {Response} = await agentApi.getDialogId(
					omniUserId,
					CUSTOMER_ID
				)
				logger.info(`set DialogId: ${JSON.stringify(Response)}`)
				await agentStorage.globalStorage.set(getSlotValue(SLOTS.maxChatId), Response)
			}
		}
	} catch (error) {
		logger.error(`Error in recordDialogIdToGlobalStorage: ${error}`)
	}
}

async function run() {
	let response = {}
	switch (message.type) {
		case MESSAGE_TYPES.send_message:
			switch (message.data.message_type) {
				case MESSAGE_TYPES_SEND_MESSAGE.MESSAGE:
				case MESSAGE_TYPES_SEND_MESSAGE.AUTO_GREETING:
					await recordDialogIdToGlobalStorage()
					response = await handleSendMessage(message.data)
					logger.info(`Message sent successfully: ${JSON.stringify(response)}`)
					break
				case MESSAGE_TYPES_SEND_MESSAGE.FINISH_DIALOG:
					await agentStorage.globalStorage.del(getSlotValue(SLOTS.maxChatId))
					if (!HAS_SCORE) {
						break
					}
					message.data.content.text = createRatingMessage()
					message.data.content.text_type = TEXT_FORMAT.markdown
					await handleSendMessage(message.data)
					break
				case MESSAGE_TYPES_SEND_MESSAGE.EDITED_BY_OPERATOR:
					response = await handleSendModifiedMessage(message.data)
					logger.info(`Message sent Modified successfully: ${JSON.stringify(response)}`)
					break
				case MESSAGE_TYPES_SEND_MESSAGE.DELETED_BY_OPERATOR:
					response = await handleDeletionMessage(message.data)
					logger.info(`Message sent Deletion successfully: ${JSON.stringify(response)}`)
					break
				default:
					logger.info(`Message type: ${message.data.message_type}. SKIP.`)
			}
			break
		case MESSAGE_TYPES.start:
			await bindWebhook()
			break
		default:
			logger.info(`Another type: ${message.type}. SKIP.`)
	}
	return response
}

run()
	.then(res => resolve(res))
	.catch(er => {
		logger.error(er)
		resolve({})
	})
