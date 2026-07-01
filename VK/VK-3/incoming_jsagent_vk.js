const config = agentSettings
const VK_ATTACHMENT_TYPE = {
	sticker: "sticker",
	photo: "photo",
	doc: "doc",
	audio_message: "audio_message",
	market: "market",
}
const CT_ATTACHMENT_TYPE = {
	IMAGE: "IMAGE",
	FILE: "FILE",
	VOICE: "VOICE",
}
const VK_METHODS = {
	getUser: "users.get",
}
const VK_COMMENT_TYPE = {
	wall_reply_new: "wall",
	photo_comment_new: "photo",
}
const MESSAGE_TYPES = {
	INCOMING: 1,
	CONFIRMATION: 4,
	SCORE: 15,
}

const DEFAULT_RESPONSE = "ok"

function toQueryString(params) {
	return Object.keys(params)
		.map(
			(key) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
		)
		.join("&")
}

function safeParseJson(value, info, defaultValue = {}) {
	try {
		return JSON.parse(value)
	} catch (err) {
		logger.info(info)
		return defaultValue
	}
}

async function callVkApi(method, query = {}, options = { post: false }) {
	try {
		const url = new URL(method, config.vk_api_url).href
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
		return response.data.response
	} catch (err) {
		logger.error(`Axios error ${method}:` + err)
		logger.error(`Error response: ${JSON.stringify(err?.response || {})}`)
		return null
	}
}

async function getUserInfo(userIds) {
	const fields = "contacts,domain,sex,photo_max"
	const res = await callVkApi(VK_METHODS.getUser, {
		user_ids: userIds,
		fields,
	})
	logger.info("User info: " + JSON.stringify(res))
	return res?.[0] ?? null
}

function formAttachments(vkAttachments) {
	const attachments = []
	let ski_id
	let sticker

	if (vkAttachments?.length > 0) {
		for (let i = 0; i < vkAttachments.length; i++) {
			const elem = vkAttachments[i]
			const type = elem.type
			if (!VK_ATTACHMENT_TYPE[type]) {
				logger.info(`Attachment type ${type} is not supported`)
				continue
			}
			const value = elem[type]
			if (type === VK_ATTACHMENT_TYPE.market) {
				ski_id = value?.id
				logger.info(`Set vk_ski_id slot to ${ski_id}`)
				continue
			}
			const data = preprocessAttachment(type, value)
			if (!data) {
				logger.info(
					`Attachment data for ${type} is empty. Value: ${JSON.stringify(
						value
					)}`
				)
				continue
			}
			if (data.type == VK_ATTACHMENT_TYPE.sticker) {
				sticker = data
				continue
			}
			attachments.push(data)
		}
	}
	return { attachments, ski_id, sticker }
}

function formMessageToCT(
	incomingMessage,
	text,
	userInfo,
	attachments,
	payload,
	ski_id,
	sticker,
	isComment
) {
	const {
		first_name = "",
		last_name = "",
		photo_max = "",
		domain = "",
		id: userId,
	} = userInfo
	const isScore = payload?.action?.includes("__#score__")
	const postIdFieldName = {
		photo: "photo",
		wall: "post",
	}
	const postId =
		incomingMessage[postIdFieldName[incomingMessage.commentType] + "_id"]
	const commentId = incomingMessage.id
	const urlToComment = `\nСсылка:  https://vk.${new URL(
		config.vk_api_url
	).hostname
		.split(".")
		.at(-1)}/${incomingMessage.commentType}-${
		incomingMessage.group_id
	}_${postId}`
	const finalText = text + (isComment ? urlToComment : "")
	const apiMessage = {
		id: `${incomingMessage.id}`,
		content: {
			text: finalText,
			attachments: attachments,
			...(!isScore && payload?.action
				? { action: `${payload?.action}` }
				: {}),
			...(isScore
				? { score: +payload?.action.replace("__#score__", "") }
				: {}),
			...(sticker
				? {
					sticker: {
						sticker_id: `${sticker?.name}`,
						sticker_url: `${sticker?.url}`,
						animation_type: "NoAnimation",
					},
				}
				: {}),
		},
		message_type: isScore ? MESSAGE_TYPES.SCORE : MESSAGE_TYPES.INCOMING,
		user: {
			id: `${!isComment ? userId : uuid.v4()}`,
			first_name: first_name,
			last_name: last_name,
			pic: photo_max,
			username: domain,
		},
		timestamp: Date.now(),
		slots: [
			...(!isComment
				? [
					{
						id: "vk_user_id",
						value: `${userId}`,
					},
				]
				: [
					{
						id: "vk_post_id",
						value: `${postId}`,
					},
					{ id: "vk_reply_comment_id", value: `${commentId}` },
				]),

			...(ski_id ? [{ id: "vk_ski_id", value: `${ski_id}` }] : []),
			...(incomingMessage.group_id
				? [{ id: "vk_group_id", value: `${-incomingMessage.group_id}` }]
				: []),
		],
	}

	if (incomingMessage?.ref){
		apiMessage.slots.push(
			{id: "deep_linking_token", value: incomingMessage?.ref}
		)
	}

	return apiMessage
}

function preprocessAttachment(type, value) {
	let ctType = ""
	let fileUrl = ""
	let fileName = ""
	switch (type) {
		case VK_ATTACHMENT_TYPE.photo: {
			const tempUrl = value?.orig_photo?.url || ""
			ctType = CT_ATTACHMENT_TYPE.IMAGE
			fileUrl = tempUrl
			fileName = tempUrl.split("/").pop().split("?")[0]
			break
		}
		case VK_ATTACHMENT_TYPE.sticker: {
			ctType = VK_ATTACHMENT_TYPE.sticker
			fileUrl = value?.images?.at(-1)?.url || ""
			fileName = value?.sticker_id
			break
		}
		case VK_ATTACHMENT_TYPE.doc: {
			ctType = CT_ATTACHMENT_TYPE.FILE
			fileUrl = value?.url || ""
			fileName = value?.title
			break
		}
		case VK_ATTACHMENT_TYPE.audio_message: {
			ctType = CT_ATTACHMENT_TYPE.VOICE
			fileUrl = value?.link_mp3 || ""
			fileName = "Audio-" + value?.id
			break
		}
		default: {
			return
		}
	}
	return {
		url: fileUrl,
		name: fileName,
		type: ctType,
	}
}

async function preprocessMessage(incomingMessage, isComment = false) {
	try {
		const userInfo = await getUserInfo(`${incomingMessage.from_id}`)
		let text = incomingMessage.text || ""
		const vkAttachments = incomingMessage.attachments || []
		const { attachments, ski_id, sticker } = formAttachments(vkAttachments)

		const payload = safeParseJson(
			incomingMessage?.payload,
			"Payload is empty"
		)
		const data = formMessageToCT(
			incomingMessage,
			text,
			userInfo,
			attachments,
			payload,
			ski_id,
			sticker,
			isComment
		)
		logger.info(`Data : ${JSON.stringify(data)}`)
		return data
	} catch (error) {
		logger.error("Error when preprocess message: " + error)
	}
}

async function confirmedMessage(incomingMessage) {
	let data = {
		message_type: MESSAGE_TYPES.CONFIRMATION,
		parent_msg_id: `${incomingMessage.read_message_id}`,
		content: {
			text: "",
		},
		user: {
			id: `${incomingMessage.from_id}`,
		},
	}

	try {
		let response = await axios.post(config.incoming_api, data, {
			headers: {
				Authorization: config.authorization_token_incoming,
				"Content-Type": "application/json",
			},
			maxBodyLength: Infinity,
		})

		if (response.status !== 200) {
			logger.error(
				`Bad request : status - ${response.status} - ${response.syscall} ${response.code} ${response.hostname}`
			)
		} else {
			logger.info(`Success confirmation read message`)
		}
	} catch (error) {
		logger.error(`Error when send message as read to CT. ${error}`)
		logger.error(`Error response: ${JSON.stringify(error?.response?.data)}`)
	}
}

async function sendMessage(data) {
	try {
		let response = await axios.post(config.incoming_api, data, {
			headers: {
				Authorization: config.authorization_token_incoming,
				"Content-Type": "application/json",
			},
			maxBodyLength: Infinity,
		})
		if (response.status === 200) {
			logger.info(`Send status : ${response.status}`)
		} else {
			logger.warn(`Unexpected success status: ${response.status}`)
		}
	} catch (error) {
		logger.error(`Error when send message to CT. ${error}`)
		logger.error(`Error response: ${JSON.stringify(error?.response?.data)}`)
	}
}

async function run() {
	logger.info(`Message ${JSON.stringify(message)}`)
	const type = message.type
	const incomingObject = message?.object || null
	const switchType = {
		confirmation: "confirmation",
		message_new: "message_new",
		message_read: "message_read",
		wall_reply_new: "wall_reply_new",
		photo_comment_new: "photo_comment_new",
	}
	switch (type) {
		// 1. Подтверждение сервера
		case switchType.confirmation: {
			return config.confirmation_token
		}
		// 2. Новое входящее сообщение
		case switchType.message_new: {
			if (incomingObject.message === null) {
				logger.info("Missing incoming message")
				return DEFAULT_RESPONSE
			}
			logger.info(
				`New VK message from ${incomingObject.message.from_id}: ${incomingObject.message.text}`
			)

			let data = await preprocessMessage(incomingObject.message)
			await sendMessage(data)

			break
		}
		case switchType.message_read: {
			logger.info(
				"Message read with id: " + incomingObject.read_message_id
			)
			await confirmedMessage(incomingObject)
			break
		}
		// case switchType.photo_comment_new:
		case switchType.wall_reply_new: {
			logger.info(
				`New ${type} comment from ${incomingObject.from_id}: ${incomingObject.text}`
			)
			if (
				Math.abs(incomingObject.from_id) === Math.abs(message.group_id)
			) {
				logger.info("Comment from owner group. SKIP.")
				return DEFAULT_RESPONSE
			}
			incomingObject.group_id = message.group_id
			incomingObject.commentType = VK_COMMENT_TYPE[type]
			let data = await preprocessMessage(incomingObject, true)
			await sendMessage(data)
			break
		}
		default: {
			logger.info(`Message type is ${type}. SKIP.`)
		}
	}
	return DEFAULT_RESPONSE
}

run()
	.then((res) => resolve(res))
	.catch((er) => {
		logger.error(er)
		resolve(DEFAULT_RESPONSE)
	})
