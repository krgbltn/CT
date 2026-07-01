const config = agentSettings
const ATTACHMENT_TYPES = {
	IMAGE: "photo",
	FILE: "doc",
}

const VK_METHODS = {
	createComment: "wall.createComment",
	deleteComment: "wall.deleteComment",
	editComment: "wall.editComment",
	getComment: "wall.getComment",
	saveDocument: "docs.save",
	savePhoto: "photos.saveMessagesPhoto",
	getUploadPhotoServer: "photos.getMessagesUploadServer",
	getUploadDocsServer: "docs.getMessagesUploadServer",
}
const DEFAULT_RESPONSE = {}

function getSlotValue(slotId) {
	const slot = message.data?.slots?.find(
		(s) => s.id === slotId
	)?.value
	if (slot === undefined) {
		logger.info(`Slot ${slotId} is empty`)
		return
	}
	return slot
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
		logger.info(
			`VK API request: method=${method}, url=${url}, post=${options.post}, query=${JSON.stringify(query)}`
		)
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
			return null
		}
		logger.info(
			`VK API response: method=${method}, ok=true, response=${JSON.stringify(response.data.response)}`
		)
		return response.data.response
	} catch (err) {
		logger.error(`Axios error ${method}: ${err}`)
		logger.error(`Axios error response ${method}: ${JSON.stringify(err?.response?.data)}`)
		return null
	}
}

function cutFormatting(text) {
	const patterns = [
		{ regex: /\[.*?\]\((.*?)\)/g, replacement: "$1" },
		{ regex: /^\s*#{1,6}\s*/gm, replacement: "" },
		{ regex: /(\*{1,3}|_{1,2})(.*?)\1/g, replacement: "$2" },
		{ regex: /`([^`]*)`/g, replacement: "$1" },
		{ regex: /~~(.*?)~~/g, replacement: "$1" },
		{ regex: /==(.*?)==/g, replacement: "$1" },
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
			.map((k) =>
				k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
			)
			.join("|"),
		"g"
	)
	return text.replace(pattern, (match) => entities[match])
}

async function getFile(url) {
	try {
		const res = await axios.get(url, { responseType: "arraybuffer" })
		const result = Buffer.from(res.data)
		logger.info(`getFile byte length: ${result?.byteLength}`)
		return result
	} catch (error) {
		logger.error(`Failed to get file from CT: ${error.message}`)
		return
	}
}

async function getUploadServer(isPhoto, groupId) {
	const method = isPhoto
		? VK_METHODS.getUploadPhotoServer
		: VK_METHODS.getUploadDocsServer

	const query = { group_id: Math.abs(groupId) }
	if (groupId > 0) {
		query.peer_id = groupId
	}
	const res = await callVkApi(method, query)
	logger.info("getUploadServer response: " + JSON.stringify(res))
	return res?.upload_url ?? null
}

async function postToUploadServer(isPhoto, url, file, fullName) {
	try {
		const formData = new FormData()
		formData.append(`${isPhoto ? "photo" : "file"}`, file, fullName)
		const res = await axios.post(url, formData, {
			headers: {
				"Content-Type": "multipart/form-data",
			},
		})
		logger.info(
			"postToUploadServer response: " + JSON.stringify(res.data)
		)
		return res.data
	} catch (error) {
		logger.error(
			`Failed to upload data to VK server: ${error.message}`
		)
		return
	}
}

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

async function uploadAttachments(attachments, groupId) {
	const vkAttachments = []
	if (!attachments?.length) return vkAttachments

	for (let i = 0; i < attachments.length; i++) {
		const att = attachments[i]
		const type = att.attachment_type
		if (!ATTACHMENT_TYPES[type]) {
			logger.info(`Attachment type ${type} is not supported`)
			continue
		}
		const isPhoto = ATTACHMENT_TYPES[type] === ATTACHMENT_TYPES.IMAGE
		const url = att.attachment_url
		const name = att.attachment_name

		const uploadUrl = await getUploadServer(isPhoto, groupId)
		if (!uploadUrl) {
			logger.info("Upload URL is empty")
			continue
		}

		const file = await getFile(url)
		if (!file) continue

		const uploadResponse = await postToUploadServer(
			isPhoto,
			uploadUrl,
			file,
			name
		)
		if (!uploadResponse) continue

		const { server, photo, hash, file: fileResult } = uploadResponse
		let vkId
		if (photo) {
			vkId = await savePhoto(photo, server, hash)
		} else {
			vkId = await saveDocument(fileResult)
		}

		if (vkId) vkAttachments.push(vkId)
	}
	return vkAttachments
}

async function createComment(text, replyToComment, attachmentIds, ownerId, postId) {
	const query = {
		owner_id: ownerId,
		post_id: postId,
		reply_to_comment: replyToComment,
		message: decodeHtmlEntities(cutFormatting(text)),
		guid: Date.now(),
	}
	if (!replyToComment) {
		delete query.reply_to_comment
	}
	if (attachmentIds?.length) {
		query.attachments = attachmentIds.join(",")
	}
	logger.info(`Create comment payload: ${JSON.stringify(query)}`)
	const res = await callVkApi(VK_METHODS.createComment, query, {
		post: true,
	})
	logger.info("Create comment response: " + JSON.stringify(res))
	if (res) {
		logger.info(
			`Create comment success: owner_id=${ownerId}, post_id=${postId}, reply_to_comment=${replyToComment ?? "top-level"}`
		)
		return [
			{
				message_id: `${res}`,
				timestamp: message.data?.timestamp,
			},
		]
	}
	return []
}

async function deleteComment(commentId, ownerId, postId) {
	const query = {
		owner_id: ownerId,
		post_id: postId,
		comment_id: commentId,
	}
	logger.info(`Delete comment: ${JSON.stringify(query)}`)
	await callVkApi(VK_METHODS.deleteComment, query, { post: true })
	return []
}

async function editComment(commentId, text, attachmentIds, ownerId, postId) {
	const query = {
		owner_id: ownerId,
		post_id: postId,
		comment_id: commentId,
		message: decodeHtmlEntities(cutFormatting(text)),
	}
	if (attachmentIds?.length) {
		query.attachments = attachmentIds.join(",")
	}
	logger.info(`Edit comment: ${JSON.stringify(query)}`)
	await callVkApi(VK_METHODS.editComment, query, { post: true })
	return []
}

async function run() {
	const SEND_MESSAGE_TYPES = {
		INCOMING: 1,
		GREETING: 20,
		FINISH: 16,
		EDIT: 31,
		DELETE: 32,
	}

	logger.info(`Outgoing event: type=${message.type}, data=${JSON.stringify(message.data)}`)

	switch (message.type) {
		case "start":
			logger.info("Start event. No setup needed for VK Callback API.")
			return DEFAULT_RESPONSE

		case "send_message": {
			logger.error(
				`VK outgoing invoked: message_type=${message.data?.message_type}, slots=${JSON.stringify(message.data?.slots || [])}`
			)
			if (message.data?.meta?.force_finish_message_sent === "True") {
				logger.info("Skip forced finish message")
				return DEFAULT_RESPONSE
			}
			const VK_POST_ID = getSlotValue("vk_post_id")
			const VK_GROUP_ID = getSlotValue("vk_group_id")
			const VK_COMMENT_ID = getSlotValue("vk_comment_id")
			const VK_PARENT_COMMENT_ID = getSlotValue("vk_parent_comment_id")

			if (!VK_POST_ID || !VK_GROUP_ID) {
				logger.info(
					`Missing required slots. VK_POST_ID=${VK_POST_ID ?? "<empty>"}, VK_GROUP_ID=${VK_GROUP_ID ?? "<empty>"}. SKIP.`
				)
				return DEFAULT_RESPONSE
			}

			switch (message.data.message_type) {
				case SEND_MESSAGE_TYPES.INCOMING:
				case SEND_MESSAGE_TYPES.GREETING: {
					logger.info(
						"Outgoing message: " +
						JSON.stringify(message.data)
					)

					const parentMessageId =
						message.data.parent_message_id
					const text = message.data.content?.text || ""
					const attachments =
						message.data.content?.attachments || []

					let replyToComment

					if (parentMessageId) {
						replyToComment = parentMessageId
						logger.info(`Reply with quote to comment ${replyToComment}`)
					} else {
						if (VK_PARENT_COMMENT_ID) {
							logger.info(`No quote. Using last comment slot ${VK_PARENT_COMMENT_ID} as fallback.`)
						} else {
							logger.info("No reply target (no quote and no parent comment slot). Posting as top-level comment.")
						}
						replyToComment = VK_PARENT_COMMENT_ID || undefined
					}
					logger.info(
						`Prepared VK send: post_id=${VK_POST_ID}, group_id=${VK_GROUP_ID}, reply_to_comment=${replyToComment ?? "top-level"}, attachments=${attachments.length}`
					)

					const attachmentIds = await uploadAttachments(
						attachments,
						VK_GROUP_ID
					)
					logger.info(
						`VK attachments resolved: ${JSON.stringify(attachmentIds)}`
					)

					return await createComment(
						text,
						replyToComment,
						attachmentIds,
						VK_GROUP_ID,
						VK_POST_ID
					)
				}

				case SEND_MESSAGE_TYPES.EDIT: {
					logger.info(
						"Edit message: " + JSON.stringify(message.data)
					)
					if (!VK_GROUP_ID || !VK_COMMENT_ID) {
						logger.info(
							`Missing edit slots. VK_GROUP_ID=${VK_GROUP_ID ?? "<empty>"}, VK_COMMENT_ID=${VK_COMMENT_ID ?? "<empty>"}. SKIP.`
						)
						return DEFAULT_RESPONSE
					}

					const editText =
						message.data.content?.text || ""
					const editAttachments =
						message.data.content?.attachments || []
					const editAttachmentIds =
						await uploadAttachments(editAttachments, VK_GROUP_ID)

					return await editComment(
						VK_COMMENT_ID,
						editText,
						editAttachmentIds,
						VK_GROUP_ID,
						VK_POST_ID
					)
				}

				case SEND_MESSAGE_TYPES.DELETE: {
					logger.info(
						"Delete message: " +
						JSON.stringify(message.data)
					)
					if (!VK_GROUP_ID || !VK_COMMENT_ID) {
						logger.info(
							`Missing delete slots. VK_GROUP_ID=${VK_GROUP_ID ?? "<empty>"}, VK_COMMENT_ID=${VK_COMMENT_ID ?? "<empty>"}. SKIP.`
						)
						return DEFAULT_RESPONSE
					}
					return await deleteComment(VK_COMMENT_ID, VK_GROUP_ID, VK_POST_ID)
				}

				case SEND_MESSAGE_TYPES.FINISH: {
					logger.info(
						"Finish event. Nothing to do for comments."
					)
					return DEFAULT_RESPONSE
				}

				default:
					logger.info(
						`Unsupported message_type=${message.data.message_type}. SKIP.`
					)
			}
			break
		}

		default:
			logger.info("Another type: " + message.type + ". SKIP.")
	}

	return DEFAULT_RESPONSE
}

run()
	.then((res) => resolve(res))
	.catch((er) => {
		logger.error({ err: er })
		resolve({})
	})
