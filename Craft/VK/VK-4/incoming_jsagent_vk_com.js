const config = agentSettings
const VK_ATTACHMENT_TYPE = {
	photo: "photo",
	doc: "doc",
	audio_message: "audio_message",
	sticker: "sticker",
}
const CT_ATTACHMENT_TYPE = {
	IMAGE: "IMAGE",
	FILE: "FILE",
	VOICE: "VOICE",
}
const VK_METHODS = {
	getUsers: "users.get",
	getComment: "wall.getComment",
	getGroup: "groups.getById",
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
				`VK error ${method}: ${JSON.stringify(response.data.error)}`
			)
		}
		return response.data.response
	} catch (err) {
		logger.error(`Axios error ${method}: ${err}`)
		return null
	}
}

async function getUsers(userIds) {
	const res = await callVkApi(VK_METHODS.getUsers, {
		user_ids: userIds,
		fields: "contacts,domain,sex,photo_max",
	})
	return res?.[0] ?? null
}

async function getGroupInfo(groupId) {
	const res = await callVkApi(VK_METHODS.getGroup, {
		group_id: Math.abs(groupId),
		fields: "name,screen_name,photo_200",
	})
	return res?.[0] ?? null
}

async function getComment(ownerId, postId, commentId) {
	const res = await callVkApi(VK_METHODS.getComment, {
		owner_id: ownerId,
		post_id: postId,
		comment_id: commentId,
	})
	return res ?? null
}

async function findFirstLevelAuthor(ownerId, postId, commentId) {
	const comment = await getComment(ownerId, postId, commentId)
	if (!comment) return null
	if (comment.reply_to_comment) {
		return findFirstLevelAuthor(ownerId, postId, comment.reply_to_comment)
	}
	return comment.from_id
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
		case VK_ATTACHMENT_TYPE.sticker: {
			ctType = VK_ATTACHMENT_TYPE.sticker
			fileUrl = value?.images?.at(-1)?.url || ""
			fileName = value?.sticker_id
			break
		}
		default:
			return
	}
	return {
		url: fileUrl,
		name: fileName,
		type: ctType,
	}
}

function formAttachments(vkAttachments) {
	const attachments = []
	if (vkAttachments?.length > 0) {
		for (let i = 0; i < vkAttachments.length; i++) {
			const elem = vkAttachments[i]
			const type = elem.type
			if (!VK_ATTACHMENT_TYPE[type]) {
				logger.info(`Attachment type ${type} is not supported`)
				continue
			}
			const value = elem[type]
			if (type === VK_ATTACHMENT_TYPE.sticker) {
				const sticker = preprocessAttachment(type, value)
				if (sticker) {
					attachments.push({
						sticker_id: `${sticker?.name}`,
						sticker_url: `${sticker?.url}`,
						animation_type: "NoAnimation",
					})
				}
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
			attachments.push(data)
		}
	}
	return attachments
}

function buildServiceInfo(authorName, vkUserId, commentUrl, timestamp) {
	const date = new Date((timestamp + 3 * 3600) * 1000)
	const dd = String(date.getDate()).padStart(2, "0")
	const mm = String(date.getMonth() + 1).padStart(2, "0")
	const yyyy = date.getFullYear()
	const hh = String(date.getHours()).padStart(2, "0")
	const mi = String(date.getMinutes()).padStart(2, "0")
	const dateStr = `${dd}.${mm}.${yyyy} ${hh}:${mi}`
	const profileUrl = vkUserId < 0
		? `https://vk.com/club${Math.abs(vkUserId)}`
		: `https://vk.com/id${vkUserId}`
	return [
		`${dateStr}`,
		`VK ID: id${vkUserId}`,
		`Автор: ${authorName} (${profileUrl})`,
		`Ссылка: ${commentUrl}`,
		"",
	].join("\n")
}

function buildCommentUrl(groupId, postId, commentId) {
	const tld = new URL(config.vk_api_url).hostname.split(".").at(-1)
	return `https://vk.${tld}/wall${groupId}_${postId}?reply=${commentId}`
}

async function processComment(incomingObject, groupId) {
	const commentId = incomingObject.id
	const fromId = incomingObject.from_id
	const postId = incomingObject.post_id
	const replyToComment = incomingObject.reply_to_comment || null
	const text = incomingObject.text || ""
	const date = incomingObject.date || Math.floor(Date.now() / 1000)
	const vkAttachments = incomingObject.attachments || []

	const ownerId = -groupId
	let channelUserId
	let parentCommentId

	if (replyToComment) {
		const firstLevelAuthor = await findFirstLevelAuthor(
			ownerId,
			postId,
			replyToComment
		)
		channelUserId = firstLevelAuthor || fromId
		parentCommentId = replyToComment
	} else {
		channelUserId = fromId
		parentCommentId = commentId
	}

	const isGroup = fromId < 0
	const authorInfo = isGroup ? await getGroupInfo(fromId) : await getUsers(`${fromId}`)
	const commentUrl = buildCommentUrl(ownerId, postId, commentId)
	const authorName = authorInfo
		? isGroup
			? authorInfo.name || `club${Math.abs(fromId)}`
			: `${authorInfo.first_name || ""} ${authorInfo.last_name || ""}`.trim()
		: isGroup
			? `club${Math.abs(fromId)}`
			: `id${fromId}`
	const serviceInfo = buildServiceInfo(authorName, fromId, commentUrl, date)

	let channelUserInfo = null
	if (channelUserId !== fromId) {
		channelUserInfo = await getUsers(`${channelUserId}`)
	}
	const userInfo = channelUserInfo || authorInfo
	const attachments = formAttachments(vkAttachments)

	const content = {
		text: `${serviceInfo}${text}`,
		attachments: attachments.filter((a) => !a.sticker_id),
	}

	const sticker = attachments.find((a) => a.sticker_id)
	if (sticker) {
		content.sticker = sticker
	}

	const data = {
		id: `${commentId}`,
		content,
		message_type: 1,
		user: {
			id: `${channelUserId}`,
			first_name: userInfo?.first_name || userInfo?.name || "",
			last_name: userInfo?.last_name || "",
			pic: userInfo?.photo_max || userInfo?.photo_200 || "",
			username: userInfo?.domain || userInfo?.screen_name || "",
		},
		timestamp: date * 1000,
		slots: [
			{ id: "vk_post_id", value: `${postId}` },
			{ id: "vk_comment_id", value: `${commentId}` },
			{ id: "vk_group_id", value: `${ownerId}` },
			{ id: "vk_author_id", value: `${fromId}` },
			{ id: "vk_parent_comment_id", value: `${parentCommentId}` },
		],
	}

	return data
}

async function sendToPlatform(data) {
	try {
		const response = await axios.post(config.incoming_api, data, {
			headers: {
				Authorization: config.authorization_token_incoming,
				"Content-Type": "application/json",
			},
			maxBodyLength: Infinity,
		})
		if (response.status === 200) {
			logger.info(`Send status: ${response.status}`)
		} else {
			logger.warn(`Unexpected status: ${response.status}`)
		}
	} catch (error) {
		logger.error(`Error sending to CT: ${error}`)
		logger.error(`Error response: ${JSON.stringify(error?.response?.data)}`)
	}
}

async function run() {
	logger.info(`Message: ${JSON.stringify(message)}`)
	const type = message.type

	switch (type) {
		case "confirmation":
			return config.confirmation_token

		case "wall_reply_new": {
			const incomingObject = message?.object
			if (!incomingObject) {
				logger.info("Missing incoming object")
				return DEFAULT_RESPONSE
			}
			if (
				incomingObject.from_id < 0 ||
				incomingObject.is_from_post_author ||
				incomingObject.post_owner_id === incomingObject.from_id
			) {
				logger.info("Skip community own comment")
				return DEFAULT_RESPONSE
			}
			logger.info(
				`New wall comment from ${incomingObject.from_id}: ${incomingObject.text}`
			)
			const data = await processComment(incomingObject, message.group_id)
			if (data) {
				await sendToPlatform(data)
			}
			break
		}

		default:
			logger.info(`Message type: ${type}. SKIP.`)
	}
	return DEFAULT_RESPONSE
}

run()
	.then((res) => resolve(res))
	.catch((er) => {
		logger.error(er)
		resolve(DEFAULT_RESPONSE)
	})
