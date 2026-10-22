const config = agentSettings
const VK_ATTACHMENT_TYPE = {
	sticker: "sticker",
	photo: "photo",
	doc: "doc",
	audio_message: "audio_message",
	video: "video",
	market: "market",
}
const CT_ATTACHMENT_TYPE = {
	IMAGE: "IMAGE",
	FILE: "FILE",
	VOICE: "VOICE",
	VIDEO: "VIDEO",
}
const VK_METHODS = {
	getUser: "users.get",
	getVideo: "video.get",
	getComment: "wall.getComment",
	getGroup: "groups.getById",
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
			access_token: options.accessToken || config.vk_api_token,
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
		logger.error(`Axios error ${method}: ${err?.message || err}`)
		logger.error(
			`Error response data: ${JSON.stringify(err?.response?.data || {})}`
		)
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

async function getGroupInfo(groupId) {
	const res = await callVkApi(VK_METHODS.getGroup, {
		group_id: Math.abs(groupId),
		fields: "name,screen_name,photo_200",
	})
	logger.info("Group info: " + JSON.stringify(res))
	return res?.groups?.[0] || res?.[0] || null
}

async function getComment(ownerId, postId, commentId) {
	const res = await callVkApi(VK_METHODS.getComment, {
		owner_id: ownerId,
		post_id: postId,
		comment_id: commentId,
	})
	return res?.items?.[0] || res || null
}

async function findFirstLevelAuthor(ownerId, postId, commentId) {
	const comment = await getComment(ownerId, postId, commentId)
	if (!comment) return null
	if (comment.reply_to_comment) {
		return findFirstLevelAuthor(
			ownerId,
			postId,
			comment.reply_to_comment
		)
	}
	return comment.from_id
}

async function formAttachments(vkAttachments) {
	const attachments = []
	const videoLinks = []
	let ski_id
	let sticker
	const videoKinds = new Set()

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
			const data = await preprocessAttachment(type, value)
			if (!data) {
				logger.info(
					`Attachment data for ${type} is empty. Value: ${JSON.stringify(
						value
					)}`
				)
				continue
			}
			if (type === VK_ATTACHMENT_TYPE.video) {
				videoKinds.add(value?.type || VK_ATTACHMENT_TYPE.video)
			}
			if (data.videoLink) {
				videoLinks.push(data.videoLink)
				continue
			}
			if (data.type == VK_ATTACHMENT_TYPE.sticker) {
				sticker = data
				continue
			}
			attachments.push(data)
		}
	}
	let video_kind = ""
	if (videoKinds.size === 1) {
		video_kind = [...videoKinds][0]
	} else if (videoKinds.size > 1) {
		video_kind = "mixed"
	}
	return { attachments, ski_id, sticker, video_kind, videoLinks }
}

function formMessageToCT(
	incomingMessage,
	text,
	userInfo,
	attachments,
	payload,
	ski_id,
	sticker,
	videoKind,
	videoLinks
) {
	const {
		first_name = "",
		last_name = "",
		photo_max = "",
		domain = "",
		id: userId,
	} = userInfo
	const isScore = payload?.action?.includes("__#score__")
	const finalText = [text, ...videoLinks].filter(Boolean).join("\n")
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
			id: `${userId}`,
			first_name: first_name,
			last_name: last_name,
			pic: photo_max,
			username: domain,
		},
		timestamp: Date.now(),
		slots: [
			{
				id: "vk_user_id",
				value: `${userId}`,
			},

			...(ski_id ? [{ id: "vk_ski_id", value: `${ski_id}` }] : []),
			...(videoKind
				? [{ id: "vk_video_kind", value: `${videoKind}` }]
				: []),
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

function getVideoUrl(value) {
	const files = value?.files || {}
	const mp4Files = Object.entries(files)
		.filter(
			([quality, url]) =>
				/^mp4_\d+$/.test(quality) && typeof url === "string" && url
		)
		.sort(
			([firstQuality], [secondQuality]) =>
				Number(firstQuality.split("_")[1]) -
				Number(secondQuality.split("_")[1])
		)

	return mp4Files.at(-1)?.[1] || ""
}

function getVideoFileName(value) {
	const title = `${value?.title || `Video-${value?.id || "unknown"}`}`.trim()
	return /\.mp4$/i.test(title) ? title : `${title}.mp4`
}

function getVideoPageUrl(value) {
	if (value?.player) return value.player
	if (value?.owner_id === undefined || value?.id === undefined) return ""

	const vkHost = new URL(config.vk_api_url).hostname
		.split(".")
		.slice(-2)
		.join(".")
	const accessKey = value?.access_key
		? `?access_key=${encodeURIComponent(value.access_key)}`
		: ""
	return `https://${vkHost}/video${value.owner_id}_${value.id}${accessKey}`
}

async function getVideoInfo(value) {
	if (value?.owner_id === undefined || value?.id === undefined) {
		logger.info("Can't request video without owner_id and id")
		return null
	}

	const accessKey = value?.access_key ? `_${value.access_key}` : ""
	const videoId = `${value.owner_id}_${value.id}${accessKey}`
	logger.info(`Request video data from VK API: ${value.owner_id}_${value.id}`)

	const accessToken = config.vk_video_api_token || config.vk_api_token
	const response = await callVkApi(
		VK_METHODS.getVideo,
		{ videos: videoId },
		{ accessToken }
	)
	const videoInfo = response?.items?.[0] || null
	const hasDirectUrl = Boolean(getVideoUrl(videoInfo))
	const isProcessing = Boolean(videoInfo?.processing || value?.processing)
	logger.info(
		`VK video response: ${value.owner_id}_${value.id}, found=${Boolean(
			videoInfo
		)}, processing=${isProcessing}, direct_url=${hasDirectUrl}, dedicated_token=${Boolean(
			config.vk_video_api_token
		)}`
	)

	return videoInfo
}

async function preprocessAttachment(type, value) {
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
		case VK_ATTACHMENT_TYPE.video: {
			fileUrl = getVideoUrl(value)
			if (!fileUrl) {
				const videoInfo = await getVideoInfo(value)
				if (videoInfo) {
					value = {
						...value,
						...videoInfo,
						type: value?.type || videoInfo.type,
					}
					fileUrl = getVideoUrl(value)
				}
			}
			if (!fileUrl) {
				const videoLink = getVideoPageUrl(value)
				if (!videoLink) return
				logger.info(
					`Direct URL for video ${value?.owner_id}_${value?.id} is unavailable. Send VK page link.`
				)
				return { videoLink }
			}
			ctType = CT_ATTACHMENT_TYPE.VIDEO
			fileName = getVideoFileName(value)
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

async function preprocessMessage(incomingMessage) {
	try {
		const userInfo = await getUserInfo(`${incomingMessage.from_id}`)
		let text = incomingMessage.text || ""
		const vkAttachments = incomingMessage.attachments || []
		const { attachments, ski_id, sticker, video_kind, videoLinks } =
			await formAttachments(vkAttachments)

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
			video_kind,
			videoLinks
		)
		logger.info(`Data : ${JSON.stringify(data)}`)
		return data
	} catch (error) {
		logger.error("Error when preprocess message: " + error)
	}
}

function buildServiceInfo(authorName, vkUserId, commentUrl, timestamp) {
	const date = new Date(timestamp * 1000)
	const dateStr = new Intl.DateTimeFormat("ru-RU", {
		timeZone: "Europe/Moscow",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	})
		.format(date)
		.replace(",", "")
	const profileUrl =
		vkUserId < 0
			? `https://vk.com/club${Math.abs(vkUserId)}`
			: `https://vk.com/id${vkUserId}`
	return [
		dateStr,
		`VK ID: ${vkUserId}`,
		`Автор: ${authorName} (${profileUrl})`,
		`Ссылка: ${commentUrl}`,
		"",
	].join("\n")
}

function buildCommentUrl(ownerId, postId, commentId) {
	const tld = new URL(config.vk_api_url).hostname.split(".").at(-1)
	return `https://vk.${tld}/wall${ownerId}_${postId}?reply=${commentId}`
}

async function getCommentAuthorInfo(authorId) {
	if (authorId < 0) return getGroupInfo(authorId)
	return getUserInfo(`${authorId}`)
}

async function processComment(incomingObject, groupId) {
	const commentId = incomingObject.id
	const fromId = incomingObject.from_id
	const postId = incomingObject.post_id
	const replyToComment = incomingObject.reply_to_comment || null
	const text = incomingObject.text || ""
	const timestamp = incomingObject.date || Math.floor(Date.now() / 1000)
	const ownerId =
		incomingObject.post_owner_id ||
		incomingObject.owner_id ||
		-Math.abs(groupId)

	let channelUserId = fromId
	let parentCommentId = commentId
	if (replyToComment) {
		const firstLevelAuthor = await findFirstLevelAuthor(
			ownerId,
			postId,
			replyToComment
		)
		channelUserId = firstLevelAuthor || fromId
		parentCommentId = replyToComment
	}

	const authorInfo = await getCommentAuthorInfo(fromId)
	const channelUserInfo =
		channelUserId === fromId
			? authorInfo
			: await getCommentAuthorInfo(channelUserId)
	const authorName = authorInfo
		? fromId < 0
			? authorInfo.name || `club${Math.abs(fromId)}`
			: `${authorInfo.first_name || ""} ${
				authorInfo.last_name || ""
			}`.trim()
		: fromId < 0
			? `club${Math.abs(fromId)}`
			: `id${fromId}`
	const commentUrl = buildCommentUrl(ownerId, postId, commentId)
	const serviceInfo = buildServiceInfo(
		authorName,
		fromId,
		commentUrl,
		timestamp
	)

	const { attachments, sticker, video_kind, videoLinks } =
		await formAttachments(incomingObject.attachments || [])
	const commentText = [text, ...videoLinks].filter(Boolean).join("\n")
	const content = {
		text: `${serviceInfo}${commentText}`,
		attachments,
		...(sticker
			? {
				sticker: {
					sticker_id: `${sticker.name}`,
					sticker_url: `${sticker.url}`,
					animation_type: "NoAnimation",
				},
			}
			: {}),
	}

	return {
		id: `${commentId}`,
		content,
		message_type: MESSAGE_TYPES.INCOMING,
		user: {
			id: `${channelUserId}`,
			first_name:
				channelUserInfo?.first_name || channelUserInfo?.name || "",
			last_name: channelUserInfo?.last_name || "",
			pic:
				channelUserInfo?.photo_max ||
				channelUserInfo?.photo_200 ||
				"",
			username:
				channelUserInfo?.domain ||
				channelUserInfo?.screen_name ||
				"",
		},
		timestamp: timestamp * 1000,
		slots: [
			{ id: "vk_post_id", value: `${postId}` },
			{ id: "vk_comment_id", value: `${commentId}` },
			{ id: "vk_group_id", value: `${ownerId}` },
			{ id: "vk_author_id", value: `${fromId}` },
			{
				id: "vk_parent_comment_id",
				value: `${parentCommentId}`,
			},
			{
				id: "vk_reply_comment_id",
				value: `${commentId}`,
			},
			...(video_kind
				? [{ id: "vk_video_kind", value: `${video_kind}` }]
				: []),
		],
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
		case switchType.wall_reply_new: {
			if (!incomingObject) {
				logger.info("Missing incoming comment")
				return DEFAULT_RESPONSE
			}
			logger.info(
				`New ${type} comment from ${incomingObject.from_id}: ${incomingObject.text}`
			)
			const ownerId =
				incomingObject.post_owner_id ||
				incomingObject.owner_id ||
				-Math.abs(message.group_id)
			if (
				incomingObject.is_from_post_author ||
				Number(incomingObject.from_id) === Number(ownerId) ||
				Math.abs(incomingObject.from_id) === Math.abs(message.group_id)
			) {
				logger.info("Comment from owner group. SKIP.")
				return DEFAULT_RESPONSE
			}
			const data = await processComment(incomingObject, message.group_id)
			if (data) {
				await sendMessage(data)
			}
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
