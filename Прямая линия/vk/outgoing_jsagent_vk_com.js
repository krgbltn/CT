const config = agentSettings
const ATTACHMENT_TYPES = {
	IMAGE: "photo",
	FILE: "doc",
}
const UPLOAD_ATTEMPTS = 3
const BUTTON_TYPES = {
	action: "text",
	url: "open_link",
}

const MAX_ROWS = 6
const MAX_ATTACHMENTS_PER_MESSAGE = 10

const VK_METHODS = {
	getUser: "users.get",
	getMessageById: "messages.getById",
	markMessagesAsRead: "messages.markAsRead",
	saveDocument: "docs.save",
	savePhoto: "photos.saveMessagesPhoto",
	getUploadPhotoServer: "photos.getMessagesUploadServer",
	getUploadDocsServer: "docs.getMessagesUploadServer",
	getUploadDocsWallServer: "docs.getWallUploadServer",
	sendMessage: "messages.send",
	createWallComment: "wall.createComment",
	editWallComment: "wall.editComment",
	deleteWallComment: "wall.deleteComment",
	deleteMessage: "messages.delete",
	editMessage: "messages.edit",
}

const getSlotValue = (slotId) => {
	const slot = message.data?.slots?.find((slot) => slot.id === slotId)?.value
	if (slot === undefined) {
		logger.info(`Slot ${slotId} is empty`)
		return
	}
	return slot
}
const VK_USER_ID = getSlotValue("vk_user_id")
const VK_POST_ID = getSlotValue("vk_post_id")
const VK_GROUP_ID = getSlotValue("vk_group_id")
const VK_COMMENT_ID = getSlotValue("vk_comment_id")
const VK_PARENT_COMMENT_ID = getSlotValue("vk_parent_comment_id")
const VK_REPLY_COMMENT_ID = getSlotValue("vk_reply_comment_id")

function createResponseForChannel(messages, error = []) {
	return {
		data: {
			chat_id: VK_USER_ID,
			user_id: VK_USER_ID,
			messages: messages,
		},
		errors: error,
	}
}

function cutFormatting(text = "") {
	const patterns = [
		// Ссылки [text](url)
		{ regex: /\[.*?\]\((.*?)\)/g, replacement: "$1" },
		// Заголовки (#, ##, ...)
		{ regex: /^\s*#{1,6} \s*/gm, replacement: "" },
		// Жирный/курсив (*, **, ***, _, __)
		{ regex: /(\*{1,3}|_{1,2})(.*?)\1/g, replacement: "$2" },
		// Инлайн-код
		{ regex: /`([^`]*)`/g, replacement: "$1" },
		// Зачеркивание
		{ regex: /~~(.*?)~~/g, replacement: "$1" },
		// Подсветка ==...==
		{ regex: /==(.*?)==/g, replacement: "$1" },
		// ::: блоки
		{ regex: /:::\.?[a-zA-Z0-9_-]*\n?/g, replacement: "" },
	]
	let prev
	do {
		prev = text
		patterns.forEach(({ regex, replacement }) => {
			text = text.replace(regex, replacement)
		})
	} while (text !== prev)

	return text.trim()
}

function decodeHtmlEntities(text = "") {
	const entities = {
		"&quot;": '"',
		"&apos;": "'",
		"&amp;": "&",
		"&lt;": "<",
		"&gt;": ">",
		"&#39;": "'",
		"&#171;": "«",
		"&#187;": "»",
	}
	const pattern = new RegExp(
		Object.keys(entities)
			.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // Экранируем спецсимволы для RegExp
			.join("|"),
		"g"
	)
	return text.replace(pattern, (match) => entities[match])
}

function normalizeVkUploadUrl(url) {
	return `${url || ""}`.replace(/\\\//g, "/")
}

function getFormHeaders(formData) {
	if (typeof formData.getHeaders !== "function") return {}
	return formData.getHeaders()
}

function getFileNameFromUrl(url, defaultName) {
	try {
		const { pathname } = new URL(url)
		const fileName = pathname.split("/").pop()
		return fileName || defaultName
	} catch (error) {
		logger.info(`Failed to parse file name from URL: ${error.message}`)
		return defaultName
	}
}

function getFileExtensionFromUrl(url, defaultExtension) {
	try {
		const { pathname } = new URL(url)
		const fileName = pathname.split("/").pop() || ""
		const extension = fileName.match(/\.([^.]+)$/)?.[1]
		return extension || defaultExtension
	} catch (error) {
		logger.info(`Failed to parse file extension from URL: ${error.message}`)
		return defaultExtension
	}
}

function getStickerFileName(sticker) {
	const name = `${sticker.name || ""}`.trim()
	if (!name) return getFileNameFromUrl(sticker.sticker_url, "sticker.webp")
	if (/\.[^.]+$/.test(name)) return name
	return `${name}.${getFileExtensionFromUrl(sticker.sticker_url, "webp")}`
}

function getRandomId(offset = 0) {
	return Date.now() + offset + Math.floor(Math.random() * 100000)
}

function getQueryAttachments(query) {
	if (!query.attachment) return []
	if (Array.isArray(query.attachment)) return query.attachment
	return `${query.attachment}`.split(",").filter(Boolean)
}

function setQueryAttachments(query, attachments) {
	if (attachments.length) {
		query.attachment = attachments.join(",")
	} else {
		delete query.attachment
	}
}

function chunkArray(items, chunkSize) {
	const chunks = []
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize))
	}
	return chunks
}

function toQueryString(params) {
	return Object.keys(params)
		.map(
			(key) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
		)
		.join("&")
}

async function callVkApi(method, query = {}, options = { post: false }) {
	try {
		const url = `${config.vk_api_url}${method}`
		const params = {
			...query,
			access_token: config.vk_api_token,
			v: config.api_version,
		}
		let response
		if (options.post) {
			response = await axios.post(url, toQueryString(params), {
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			})
		} else {
			response = await axios.get(url, { params })
		}
		if (response.data.error) {
			logger.error(
				`VK error response ${method}:` +
				JSON.stringify(response.data.error)
			)
		}
		return response.data.response
	} catch (err) {
		logger.error(`Axios error ${method}:` + err)
		logger.error(`Error response: ${JSON.stringify(err?.response || {})}`)
		return null
	}
}

//  Получение сообщений по ID
async function getMessageById(messageIds) {
	const res = await callVkApi(VK_METHODS.getMessageById, {
		message_ids: messageIds,
	})
	logger.info("getMessageById response: " + JSON.stringify(res))
	return res?.items?.[0] ?? null
}

// Пометить сообщения как прочитанные
async function markMessagesAsRead() {
	const res = await callVkApi(VK_METHODS.markMessagesAsRead, {
		peer_id: VK_USER_ID,
	})
	logger.info("markMessagesAsRead response: " + JSON.stringify(res))
	return res === 1
}

//  Сохранение документа
async function saveDocument(file) {
	try {
		const res = await callVkApi(VK_METHODS.saveDocument, { file })
		logger.info("saveDocument response: " + JSON.stringify(res))
		if (!res) return null
		const doc = res.doc
		return `doc${doc.owner_id}_${doc.id}`
	} catch (error) {
		logger.error(`Failed to save document: ${error.message}`)
		return
	}
}

// Сохранение фото для сообщений
async function savePhoto(photo, server, hash) {
	try {
		const res = await callVkApi(VK_METHODS.savePhoto, {
			photo,
			server,
			hash,
		})
		logger.info("savePhoto response: " + JSON.stringify(res))
		if (!res) return null
		const result = res[0]
		return `photo${result.owner_id}_${result.id}`
	} catch (error) {
		logger.error(`Failed to save photo: ${error.message}`)
		return
	}
}

// Получить url сервера для сохранения
async function getUploadServer(isPhoto) {
	const method = isPhoto
		? VK_METHODS.getUploadPhotoServer
		: VK_METHODS.getUploadDocsServer

	const res = await callVkApi(method, {
		peer_id: VK_USER_ID,
		...(VK_GROUP_ID ? { group_id: Math.abs(VK_GROUP_ID) } : {}),
	})
	logger.info("getUploadServer response: " + JSON.stringify(res))
	return res?.upload_url ?? null
}

// Получить файл по URL
async function getFile(url) {
	try {
		const res = await axios.get(url, {
			responseType: "arraybuffer",
		})
		const result = Buffer.from(res.data)
		logger.info(`getFile byte length: ${result?.byteLength}`)
		return result
	} catch (error) {
		logger.error(`Failed to get file from CT: ${error.message}`)
		return
	}
}

// Сохранить файл на сервере VK
async function postToUploadServer(isPhoto, url, file, fullName) {
	try {
		const formData = new FormData()

		formData.append(`${isPhoto ? "photo" : "file"}`, file, {
			filename: fullName,
		})
		const res = await axios.post(url, formData, {
			headers: getFormHeaders(formData),
			maxBodyLength: Infinity,
			maxContentLength: Infinity,
		})
		logger.info("postToUploadServer response: " + JSON.stringify(res.data))
		return res.data
	} catch (error) {
		logger.error(`Failed to upload data to VK server: ${error.message}`)
		return
	}
}

async function uploadAttachmentToVk(vkType, name, fileFromCT) {
	const isPhoto = vkType === ATTACHMENT_TYPES.IMAGE
	for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
		const urlForSave = await getUploadServer(isPhoto)
		if (!urlForSave) {
			logger.info(`Response URL for save attachment is empty`)
			continue
		}

		const uploadResponse = await postToUploadServer(
			isPhoto,
			normalizeVkUploadUrl(urlForSave),
			fileFromCT,
			name
		)
		if (!uploadResponse) {
			logger.info(
				`Upload attachment ${name} failed. Attempt ${attempt}/${UPLOAD_ATTEMPTS}`
			)
			continue
		}

		const { server, photo, hash, file } = uploadResponse
		const result = photo
			? await savePhoto(photo, server, hash)
			: await saveDocument(file)
		if (result) return result

		logger.info(
			`Save attachment ${name} failed. Attempt ${attempt}/${UPLOAD_ATTEMPTS}`
		)
	}

	logger.error(`Failed to upload attachment ${name} to VK after retries`)
	return null
}

async function addAttachmentToQuery(query, url, name, vkTypes) {
	const fileFromCT = await getFile(url)
	if (!fileFromCT) return false

	for (let i = 0; i < vkTypes.length; i++) {
		const result = await uploadAttachmentToVk(vkTypes[i], name, fileFromCT)
		if (result) {
			if (!Array.isArray(query.attachment)) query.attachment = []
			query.attachment.push(result)
			return true
		}
	}

	return false
}

async function prepareWallCommentQuery(msg, query) {
	await prepareMessage(msg, query)
	if (msg.text_type === "markdown") {
		prepareMarkdown(msg, query)
	}
	if (query.message !== undefined) {
		query.message = decodeHtmlEntities(cutFormatting(query.message))
	}
	if (query.attachment) {
		query.attachments = query.attachment
	}
	delete query.attachment
	delete query.keyboard
	delete query.sticker_id
	return query
}

function getOutgoingCommentId() {
	const rawIds = message.data.meta?.channel_message_ids
	if (Array.isArray(rawIds)) return rawIds[0] || VK_COMMENT_ID
	if (typeof rawIds === "string" && rawIds) {
		try {
			const ids = JSON.parse(rawIds)
			if (Array.isArray(ids) && ids[0]) return ids[0]
		} catch (error) {
			logger.info(`Can't parse channel_message_ids: ${error.message}`)
		}
	}
	return VK_COMMENT_ID
}

// Создать комментарий на посте VK
async function createWallComment(msg) {
	const replyToComment =
		message.data.parent_message_id ||
		VK_COMMENT_ID ||
		VK_REPLY_COMMENT_ID ||
		VK_PARENT_COMMENT_ID
	const query = {
		owner_id: VK_GROUP_ID,
		post_id: VK_POST_ID,
		guid: Date.now(),
		...(replyToComment
			? { reply_to_comment: replyToComment }
			: {}),
	}
	await prepareWallCommentQuery(msg, query)
	logger.info(`Create wall comment params: ${JSON.stringify(query)}`)
	let res = await callVkApi(VK_METHODS.createWallComment, query, {
		post: true,
	})
	if (!res && query.reply_to_comment) {
		logger.info(
			"Parent comment not found, retrying without reply_to_comment"
		)
		delete query.reply_to_comment
		res = await callVkApi(VK_METHODS.createWallComment, query, {
			post: true,
		})
	}
	logger.info("createWallComment response: " + JSON.stringify(res))
	if (!res?.comment_id) return []
	return [
		{
			message_id: `${res.comment_id}`,
			timestamp: message.data?.timestamp,
		},
	]
}

async function editWallComment(msg) {
	const commentId = getOutgoingCommentId()
	if (!commentId) {
		logger.info("Comment id for editing is empty. SKIP.")
		return []
	}
	const query = {
		owner_id: VK_GROUP_ID,
		post_id: VK_POST_ID,
		comment_id: commentId,
	}
	await prepareWallCommentQuery(msg, query)
	logger.info(`Edit wall comment params: ${JSON.stringify(query)}`)
	await callVkApi(VK_METHODS.editWallComment, query, { post: true })
	return []
}

async function deleteWallComment() {
	const commentId = getOutgoingCommentId()
	if (!commentId) {
		logger.info("Comment id for deleting is empty. SKIP.")
		return []
	}
	const query = {
		owner_id: VK_GROUP_ID,
		post_id: VK_POST_ID,
		comment_id: commentId,
	}
	logger.info(`Delete wall comment params: ${JSON.stringify(query)}`)
	await callVkApi(VK_METHODS.deleteWallComment, query, { post: true })
	return []
}

// Удаляем блоки кнопок из текста
function removeButtonsFromText(text) {
	const buttonPattern = /```buttons[\s\S]*?```/g // Поиск блока с кнопками в Markdown

	return text
		.replaceAll(buttonPattern, "")
		.trim()
		.replaceAll(/\n{2,}/g, "\n")
		.replaceAll(/\\+/g, "")
}


// Ищем блоки кнопок в тексте и формируем из них объекты с кнопками
function extractButtonsFromText(text) {
	logger.info(`Extracting buttons from text: ${text}`)
	const pattern = /buttons(?:\([^)]*\))?([\s\S]*?)```/g
	// Упрощенный паттерн
	let keyboardType = "inline"
	const buttons = []
	let match
	let buttonCount = 0

	while ((match = pattern.exec(text)) !== null) {
		const buttonStr = match[1]
		// Ищем кнопки вида [текст](параметры)
		const buttonPattern = /\[([^\]]+)\]\(([^)]+)\)/g
		let buttonMatch

		while ((buttonMatch = buttonPattern.exec(buttonStr)) !== null) {
			if (buttonCount >= MAX_ROWS) {
				logger.info(`Maximum buttons limit reached (${MAX_ROWS})`)
				break
			}

			const btnTitle = buttonMatch[1]
			const btnParams = buttonMatch[2]
			const params = {}

			// Парсим параметры
			const paramPattern = /(\w+):([^\s,)]+)/g
			let paramMatch
			while ((paramMatch = paramPattern.exec(btnParams)) !== null) {
				params[paramMatch[1]] = paramMatch[2]
			}

			const { type, color, visible, Row = 1, action } = params
			if (visible === "false") {
				logger.info(`Button ${btnTitle} is not visible`)
				continue
			}

			const btnType = BUTTON_TYPES[type]
			if (!btnType) {
				logger.info(`Unknown button type: ${type}`)
				continue
			}

			const currentRowNumber = +Row - 1
			if (buttons[currentRowNumber] === undefined)
				buttons[currentRowNumber] = []

			switch (btnType) {
				case BUTTON_TYPES.action: {
					buttons[currentRowNumber].push({
						action: {
							label: btnTitle,
							type: btnType,
							payload: { action },
						},
						color: color || "primary",
					})
					buttonCount++
					break
				}
				case BUTTON_TYPES.url: {
					buttons[currentRowNumber].push({
						action: {
							label: btnTitle,
							type: btnType,
							payload: { action },
							link: action,
						},
					})
					buttonCount++
					break
				}
			}
		}
	}

	const filteredButtons = buttons.filter((row) => row && row.length > 0)

	const keyboard = {
		inline: keyboardType === "inline" || !keyboardType,
		buttons: filteredButtons,
	}
	return keyboard
}

// Подготовка Markdown сообщения
function prepareMarkdown(msg, query) {
	if (query.keyboard !== undefined) return
	const markdown = msg.text || ""
	const keyboard = extractButtonsFromText(markdown)
	const textWithoutButtons = removeButtonsFromText(markdown)
	if (keyboard.buttons.length) {
		query.keyboard = JSON.stringify(keyboard)
	}
	const mockText = msg.attachments?.length || msg.sticker
		? ""
		: "Нажмите интересующую вас кнопку"
	const messageText =
		textWithoutButtons || (keyboard.buttons.length ? mockText : "")
	if (messageText) {
		query.message = messageText
	}
}

// Подготовка текстового сообщения
async function prepareMessage(msg, query) {
	if (msg.attachments?.length) {
		query.attachment = []
		const attachments = msg.attachments
		for (let i = 0; i < attachments.length; i++) {
			const att = attachments[i]
			const type = att.attachment_type
			if (!ATTACHMENT_TYPES[type]) {
				logger.info(`Attachment type ${type} is not supported`)
				continue
			}
			const vkType = ATTACHMENT_TYPES[type]
			const url = att.attachment_url
			const name = att.attachment_name
			await addAttachmentToQuery(query, url, name, [vkType])
		}
	}
	if (msg.text) {
		query.message = msg.text
	}
	if (msg.sticker) {
		query.sticker_id = 0
		if (msg.sticker.sticker_url) {
			const name = getStickerFileName(msg.sticker)
			await addAttachmentToQuery(
				query,
				msg.sticker.sticker_url,
				name,
				[ATTACHMENT_TYPES.IMAGE]
			)
		} else {
			logger.info(`Sticker without sticker_url. SKIP.`)
		}
	}
	if (msg.actions?.length) {
		const buttons = []

		for (let i = 0; i < Math.min(msg.actions.length, MAX_ROWS); i++) {
			const elem = msg.actions[i]
			buttons.push([
				{
					action: {
						label: elem?.caption,
						type: BUTTON_TYPES.action,
						payload: { action: elem?.payload },
					},
				},
			])
		}

		const keyboard = {
			inline: true,
			buttons: buttons,
		}
		query.keyboard = JSON.stringify(keyboard)
	}
	if (Array.isArray(query.attachment)) {
		query.attachment = query.attachment.join(",")
	}
}
async function deleteMessage() {
	const idMessages = JSON.parse(message.data.meta?.channel_message_ids || [])
	let query = {
		peer_id: VK_USER_ID,
		message_ids: idMessages,
		delete_for_all: 1,
	}
	const res = await callVkApi(VK_METHODS.deleteMessage, query, {
		post: true,
	})
	logger.info(`Message response: ${JSON.stringify(res)}`)
	return []
}

async function sendPreparedMessageQuery(method, query) {
	logger.info(`Request params: ${JSON.stringify(query)}`)
	const res = await callVkApi(method, query, {
		post: true,
	})
	logger.info(`Message response: ${JSON.stringify(res)}`)
	return res
}

async function sendPreparedMessage(query, edit = false) {
	const method = edit ? VK_METHODS.editMessage : VK_METHODS.sendMessage
	const attachments = getQueryAttachments(query)

	if (edit) {
		await sendPreparedMessageQuery(method, query)
		return []
	}

	if (attachments.length <= MAX_ATTACHMENTS_PER_MESSAGE) {
		const res = await sendPreparedMessageQuery(method, query)
		return res ? [`${res}`] : []
	}

	const chunks = chunkArray(attachments, MAX_ATTACHMENTS_PER_MESSAGE)
	const messageIds = []

	setQueryAttachments(query, chunks[0])
	const firstMessageId = await sendPreparedMessageQuery(method, query)
	if (firstMessageId) messageIds.push(`${firstMessageId}`)

	for (let i = 1; i < chunks.length; i++) {
		const chunkQuery = {
			user_id: query.user_id,
			random_id: getRandomId(i),
			attachment: chunks[i].join(","),
		}
		const chunkMessageId = await sendPreparedMessageQuery(
			VK_METHODS.sendMessage,
			chunkQuery
		)
		if (chunkMessageId) messageIds.push(`${chunkMessageId}`)
	}

	return messageIds
}

// Отправка сообщения
async function sendMessage(msg, edit = false) {
	try {
		const type = msg.text_type
		let idMessages = []
		if (edit) {
			idMessages = JSON.parse(
				message.data.meta?.channel_message_ids || []
			)
		}
		let query = {
			user_id: VK_USER_ID,
			random_id: Date.now(),
			...(edit
				? {
					peer_id: VK_USER_ID,
					message_id: idMessages[0],
					keep_forward_messages: 1,
					keep_snippets: 1,
				}
				: {}),
		}

		const switchType = {
			text: "text",
			markdown: "markdown",
		}
		switch (type) {
			case switchType.text: {
				await prepareMessage(msg, query)
				break
			}
			case switchType.markdown: {
				await prepareMessage(msg, query)
				prepareMarkdown(msg, query)
				break
			}
			default: {
				logger.info(`Text type: ${type}. SKIP.`)
			}
		}
		if (query.message !== undefined) {
			query.message = decodeHtmlEntities(cutFormatting(query.message))
		}
		const messageIds = await sendPreparedMessage(query, edit)
		const infoMessages = messageIds.map((messageId) => ({
			message_id: messageId,
			timestamp: message.data?.timestamp,
		}))

		return !edit ? createResponseForChannel(infoMessages) : []
	} catch (error) {
		logger.error(`Vk send message error: ${error}`)
		logger.error(`Error response: ${JSON.stringify(error?.response?.data)}`)
		return createResponseForChannel([], [error.message])
	}
}

async function run() {
	const MESSAGE_TYPES = {
		send_message: "send_message",
	}
	const SEND_MESSAGE_TYPES = {
		INCOMING: 1,
		READ: 12,
		GREETING: 20,
		FINISH: 16,
		EDIT: 31,
		DELETE: 32,
		RATING: 400,
	}
	let response = []
	switch (message.type) {
		case MESSAGE_TYPES.send_message:
			switch (message.data.message_type) {
				case SEND_MESSAGE_TYPES.INCOMING:
				case SEND_MESSAGE_TYPES.GREETING: {
					logger.info(
						`Outgoing message data ${JSON.stringify(message.data)}`
					)
					if (VK_USER_ID === undefined) {
						if (VK_POST_ID !== undefined) {
							response = await createWallComment(
								message.data.content
							)
						} else {
							logger.info(
								`VK_USER_ID and VK_POST_ID is empty. SKIP.}`
							)
						}
						break
					}
					response = await sendMessage(message.data.content, false)
					break
				}
				case SEND_MESSAGE_TYPES.EDIT: {
					logger.info(
						`Outgoing edit message data ${JSON.stringify(message.data)}`
					)
					logger.info(`Editing message`)
					if (VK_USER_ID === undefined) {
						if (VK_POST_ID !== undefined) {
							response = await editWallComment(
								message.data.content
							)
						} else {
							logger.info(
								"VK_USER_ID and VK_POST_ID are empty. SKIP."
							)
						}
						break
					}
					response = await sendMessage(message.data.content, true)
					break
				}
				case SEND_MESSAGE_TYPES.DELETE: {
					logger.info(
						`Delete message with data ${JSON.stringify(message.data)}`
					)
					if (VK_USER_ID === undefined) {
						if (VK_POST_ID !== undefined) {
							response = await deleteWallComment()
						} else {
							logger.info(
								"VK_USER_ID and VK_POST_ID are empty. SKIP."
							)
						}
						break
					}
					await deleteMessage()
					break
				}
				case SEND_MESSAGE_TYPES.READ: {
					if (VK_USER_ID === undefined) {
						break
					}
					logger.info("Mark messages as read")
					await markMessagesAsRead()
					break
				}
				case SEND_MESSAGE_TYPES.RATING:
				case SEND_MESSAGE_TYPES.FINISH:
					if (!config.score || VK_POST_ID !== undefined) {
						break
					}
					const default_rating_message =
						"Оцените работу оператора\n```buttons::[1](type:action action:__#score__1 )[2](type:action action:__#score__2 )[3](type:action action:__#score__3 )[4](type:action action:__#score__4 )[5](type:action action:__#score__5 )```"

					const message_content = { ...message.data.content }
					message_content.text = default_rating_message
					message_content.text_type = "markdown"

					logger.info(
						`Outgoing rating message data ${JSON.stringify(
							message_content
						)}`
					)
					await sendMessage(message_content)
					break

				default: {
					logger.info(
						`Message type: ${message.data.message_type}. SKIP.`
					)
				}
			}
			break
		default:
			logger.info(`Another type: ${message.type}. SKIP.`)
			logger.info(`Outgoing message data ${JSON.stringify(message)}`)
			break
	}

	return response
}
run()
	.then((res) => resolve(res))
	.catch((er) => {
		logger.error({ err: er })
		resolve([])
	})
