const config = agentSettings
const ATTACHMENT_TYPES = {
	IMAGE: "photo",
	FILE: "doc",
}
const BUTTON_TYPES = {
	action: "text",
	url: "open_link",
}

const MAX_ROWS = 6

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
	deleteMessage: "messages.delete",
	editMessage: "messages.edit",
}

const getSlotValue = (slotId) => {
	const slot = message.data.slots?.find((slot) => slot.id === slotId)?.value
	if (slot === undefined) {
		logger.info(`Slot ${slotId} is empty`)
		return
	}
	return slot
}
const VK_USER_ID = getSlotValue("vk_user_id")
const VK_POST_ID = getSlotValue("vk_post_id")
const VK_GROUP_ID = getSlotValue("vk_group_id")
const VK_REPLY_COMMENT_ID = getSlotValue("vk_reply_comment_id")
const VK_FIRSTNAME = getSlotValue("sys_firstname")
const VK_USERNAME = getSlotValue("sys_username")

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

function cutFormatting(text) {
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

function decodeHtmlEntities(text) {
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

		formData.append(`${isPhoto ? "photo" : "file"}`, file, fullName)
		const res = await axios.post(url, formData, {
			headers: {
				"Content-Type": "multipart/form-data",
			},
		})
		logger.info("postToUploadServer response: " + JSON.stringify(res.data))
		return res.data
	} catch (error) {
		logger.error(`Failed to upload data to VK server: ${error.message}`)
		return
	}
}

// Создать коммент на посте VK
async function createWallComment(msg) {
	const query = {
		owner_id: VK_GROUP_ID,
		post_id: VK_POST_ID,
		reply_to_comment: VK_REPLY_COMMENT_ID,
		guid: Date.now(),
	}
	await prepareMessage(msg, query)
	prepareMarkdown(msg, query)
	query.message =
		`[${VK_USERNAME}|${VK_FIRSTNAME}], ` +
		decodeHtmlEntities(cutFormatting(query.message))
	query.attachments = query.attachment
	logger.info(`Request params: ${JSON.stringify(query)}`)
	const res = await callVkApi(VK_METHODS.createWallComment, query, {
		post: true,
	})
	logger.info("createWallComment response: " + JSON.stringify(res))
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

//TODO
// Нужно переделать на внутренний парсер js-agent
// const markdownConverter = agentApi.createConverterMarkdown(agentApi.getPredefinedMarkdownRules().Empty)

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
	query.keyboard = JSON.stringify(extractButtonsFromText(markdown))
	const textWithoutButtons = removeButtonsFromText(markdown)
	const mockText = msg.attachments?.length
		? ""
		: "Нажмите интересующую вас кнопку"
	query.message = textWithoutButtons || mockText
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
			const urlForSave = await getUploadServer(
				vkType === ATTACHMENT_TYPES.IMAGE
			)
			if (!urlForSave) {
				logger.info(`Response URL for save attachment is empty`)
				continue
			}

			const fileFromCT = await getFile(url)
			if (!fileFromCT) continue
			const uploadResponse = await postToUploadServer(
				vkType === ATTACHMENT_TYPES.IMAGE,
				urlForSave.replace("/\\/g", ""),
				fileFromCT,
				name
			)
			if (!uploadResponse) continue
			const { server, photo, hash, file } = uploadResponse
			let result
			if (photo) {
				result = await savePhoto(photo, server, hash)
			} else {
				result = await saveDocument(file)
			}

			if (result) query.attachment.push(result)
		}
		query.attachment = query.attachment.join(",")
	}
	if (msg.text) {
		query.message = msg.text
	}
	if (msg.sticker) {
		query.sticker_id = +msg.sticker.sticker_id || 0
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
		query.message = decodeHtmlEntities(cutFormatting(query.message))
		logger.info(`Request params: ${JSON.stringify(query)}`)

		const res = await callVkApi(
			edit ? VK_METHODS.editMessage : VK_METHODS.sendMessage,
			query,
			{
				post: true,
			}
		)
		logger.info(`Message response: ${JSON.stringify(res)}`)

		const infoMessage = {
			message_id: `${res}`,
			timestamp: message.data?.timestamp,
		}

		return !edit ? createResponseForChannel([infoMessage]) : []
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
							await createWallComment(message.data.content)
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
						logger.info(`VK_USER_ID is empty. SKIP.}`)
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
						logger.info(`VK_USER_ID is empty. SKIP.}`)
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
