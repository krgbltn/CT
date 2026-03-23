const agentConfig = agentSettings

const getSlotValue = (slotId) => message.slot_context.filled_slots.find((slot) => slot.slot_id === slotId)?.value

const extractSlotsFromVariables = (variables) => {
	const slots = {}

	if (agentConfig.var_to_slots) {
		for (const variableKey of Object.keys(agentConfig.var_to_slots)) {
			if (variables[variableKey]) {
				slots[[agentConfig.var_to_slots[variableKey]]] = variables[variableKey]
			}
		}
	}

	return {}
}

/* Domain */
const SessionRequestType = {
	Start: 0,
	StartWithContinue: 1,
	Continue: 2,
	ContinueWithServiceMessage: 3,
	Empty: 4,
	ContinueWithAuthorizeServiceMessage: 5
}

const MessageType = {
	Initial: 0,
	Message: 1,
	Authorize: 26
}

const channelTypes = ['telegram', 'viber', 'facebook', 'whatsapp']

/* Logic */
function formatBytes(bytes, decimals = 2) {
	if (!+bytes) return 0

	const k = 1024
	const dm = decimals < 0 ? 0 : decimals

	const i = 2

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm))
}

function isJSONMessage(text) {
	const JSON_START = /^\[|^\{(?!\{)/;
	const JSON_ENDS = {
		'[': /]$/,
		'{': /}$/
	};

	const jsonStart = text.match(JSON_START);

	if (!jsonStart) return false

	return jsonStart && JSON_ENDS[jsonStart[0]].test(text);
}

function detectUnsupportedAttachmentExtension(allowedExtensions, attachmentsUrl) {
	logger.info(`detectUnsupportedAttachmentExtension with ${JSON.stringify(allowedExtensions)} and ${JSON.stringify(attachmentsUrl)}`)

	let notAllowedFiles = []

	if (allowedExtensions.length > 0) {
		notAllowedFiles = attachmentsUrl.filter(
			(file) => !allowedExtensions.includes(
				file.split(".").slice(-1)[0]
			)
		).map(
			el => el.split(".").slice(-1)[0]
		)
	}

	return notAllowedFiles
}

function detectUnsupportedAttachmentSize(maxAttachmentSizeInBytes, attachmentsInfo) {
	let unsupportedSizes = []

	for (let info of attachmentsInfo) {
		if (info.fileSize > maxAttachmentSizeInBytes) {
			unsupportedSizes.push({
				fileName: info.fileName,
				fileUrl: info.fileUrl,
				size: info.fileSize
			})
		}
	}

	return unsupportedSizes
}

function getSlots(slotContext, continueSessionSlotIds) {
	logger.info('Get slots')

	let slotMap = {}

	let filledSlots = slotContext.filled_slots.filter(slot => continueSessionSlotIds.indexOf(slot.slot_id) !== -1 && slot.value !== '')

	filledSlots.map((slot) => {
		slotMap[slot.slot_id] = [{value: slot.value, confidence: 1}]
	})

	return slotMap
}

function isSlotExist(message, slotId) {
	let sessionStartSlot = message.slot_context.filled_slots.find(slot => slot.slot_id === slotId)

	return sessionStartSlot ? true : false
}

async function doRequest(authTokenHeader, url, requestBody) {
	logger.info('Sending request')
	logger.info(`authTokenHeader: ${authTokenHeader}`)

	let headers = {
		'Content-Type': 'application/json',
	}

	if (authTokenHeader) {
		headers['Authorization'] = `Bearer ${authTokenHeader}`
	}

	const response = await axios.post(
		url,
		requestBody,
		{
			headers: headers,
			httpsAgent: new https.Agent({
				rejectUnauthorized: false
			})
		}
	)

	return response.data
}

function getSessionRequestType(isSessionStarted, messageType) {
	switch (messageType) {
		case MessageType.Initial:
			return isSessionStarted ? SessionRequestType.Empty : SessionRequestType.Start

		case MessageType.Message:
			return isSessionStarted ? SessionRequestType.Continue : SessionRequestType.StartWithContinue

		case MessageType.Authorize:
			return isSessionStarted ? SessionRequestType.ContinueWithAuthorizeServiceMessage : SessionRequestType.Empty

		default:
			return isSessionStarted ? SessionRequestType.ContinueWithServiceMessage : SessionRequestType.Empty
	}
}

async function getCurrentDialogStarted(dialogId) {
	logger.info(`Get dialog`)

	let dialogResponse = await agentApi.getDialog(dialogId)

	let dialog = dialogResponse.Response

	logger.info(`Getted dialog: ${JSON.stringify(dialog)}`)

	if (!dialog) {
		logger.info(`Dialog ${dialogId} doesn't exist`)
		return ""
	}

	return dialog.stat.started
}

async function getDialogStarted(dialogId) {
	logger.info(`Get dialog started with dialog id ${dialogId}`)

	const dialogStarted = await getCurrentDialogStarted(dialogId)

	if (dialogStarted) {
		return `${dialogStarted}`
	} else {
		return ""
	}
}

function getChannelType(channel_type, channelTypeSettings, channel_id) {
	if (channel_id in channelTypeSettings) {
		return channelTypeSettings[channel_id]
	}
	if (channel_type in channelTypeSettings) {
		return channelTypeSettings[channel_type]
	}
	if (channelTypes.indexOf(channel_type) !== -1) {
		return channel_type
	} else {
		return 'text'
	}
}

async function getStartSessionRequestBody(message, channelTypeSettings, dialogId) {
	logger.info('Get start request body')

	let dialogStarted = await getDialogStarted(dialogId)

	let channelType = getChannelType(message.channel.channel_type, channelTypeSettings, message.channel.channel_id)

	return {
		session_id: message.user.session_id,
		user_id: message.user.omni_user_id,
		channel_id: message.channel.channel_id,
		// mapping_id: NaN,
		channel_type: channelType,
		// formatting_options: NaN,
		variables: {
			channel_user_id: message.user.channel_user_id,
			id_in_channel: message.channel.id_in_channel,
			started: dialogStarted,
			formatting_type: 'md'
		}
	}
}

async function startNewSession(message, authTokenHeader, url, channelTypeSettings) {
	logger.info(`Start session`)
	let requestBody = await getStartSessionRequestBody(message, channelTypeSettings, message.user.session_id)
	logger.info(`Got start session request body: ${JSON.stringify(requestBody)}`)
	return await doRequest(authTokenHeader, url, requestBody)
}

function getAttachmentsFromMessage(msg) {
	let attachments = []

	if (msg.attachments) {
		attachments = msg.attachments
	}

	if (msg.attachment && Object.keys(msg.attachment).length > 0) {
		attachments.push(msg.attachment)
	}

	return attachments
}

function getContinueSessionResult(msg, allowedAttachmentExtensions, unsupportedAttachmentExtensionMessage) {
	if (msg.action) {
		logger.info(msg.action)
		let action
		if (msg.action.startsWith("B$")) {
			action = msg.action.split("$")[1].replaceAll("_SP_", " ")
		} else {
			action = msg.action.replaceAll("_SP_", " ")
		}

		return {
			ActionRequest: action
		}
	} else {
		let attachments = getAttachmentsFromMessage(msg)

		if (attachments.length > 0) {
			let unsupportedExtensions = detectUnsupportedAttachmentExtension(allowedAttachmentExtensions, attachments.map((attach) => attach.attachment_url))

			if (unsupportedExtensions.length > 0) {
				return {
					UnsupportedAttachmentResponse: [unsupportedAttachmentExtensionMessage, unsupportedExtensions]
				}
			} else {
				return {
					AttachmentsRequest: [attachments, msg.text]
				}
			}
		} else {
			return {
				TextRequest: msg.text
			}
		}
	}
}

const getFileUrl = (url) => {
	const validationUrlRegexp = /^(?:[a-z+]+:)?\/\//

	try {
		if (!validationUrlRegexp.test(url)) return new URL(url, agentConfig.FileStorageHost).href
		return url
	} catch (error) {
		logger.error(`Some error when trying get url: ${error}`)
		return url
	}
}

async function getFileInfo(attachments) {
	logger.info('Getting file info')
	logger.info(JSON.stringify(attachments))

	let resultArr = []

	for (let attach of attachments) {
		const fileUrl = getFileUrl(attach.attachment_url)

		let response = await axios.get(fileUrl, {responseType: 'blob'})

		logger.info(JSON.stringify(response.headers))

		resultArr.push(
			{
				mediaType: response.headers['content-type'],
				fileType: response.config.url.split("/").slice(-1)[0].split(".").slice(-1)[0],
				fileSize: response.headers['content-length'] ? formatBytes(parseInt(response.headers['content-length'])) : 0,
				fileName: attach.attachment_name,
				fileUrl: response.config.url
			}
		)

		logger.info(JSON.stringify(resultArr))
	}

	return resultArr
}

function getLoadAttachmentsResult(maxAttachmentSizeInBytes, attachmentsInfo, unsupportedAttachmentSizeMessage) {
	let unsupportedAttachmentSize = detectUnsupportedAttachmentSize(maxAttachmentSizeInBytes, attachmentsInfo)

	if (unsupportedAttachmentSize.length > 0) {
		return {
			UnsupportedAttachmentResponse: [unsupportedAttachmentSizeMessage, JSON.stringify(unsupportedAttachmentSize)]
		}
	} else {
		return {
			AttachmentsRequest: attachmentsInfo
		}
	}
}

function createMockContinue(dialogId, content) {
	return {
		session_id: dialogId,
		messages: [
			{
				content: content,
				content_type: "text",
				button: NaN
			}
		],
		action: "continue",
		variables: {},
		error_code: 0,
		error_info: ""
	}
}

function getAttachments(filesInfo) {
	let attachents = []

	for (let info of filesInfo) {
		attachents.push({
			fileUrl: info.fileUrl,
			fileType: info.fileType.toUpperCase(),
			fileSize: info.fileSize.toString(),
			fileName: info.fileName
		})
	}

	return attachents
}

async function continueSession(message, slotContext, dialogId, authTokenHeader, scenarioAction) {
	logger.info(`Continue session with config ${JSON.stringify(agentConfig)}`)

	let continueSessionResult = getContinueSessionResult(message.message, agentConfig.AllowedAttachmentExtensions, agentConfig.UnsupportedAttachmentExtensionMessage)
	let slots = getSlots(slotContext, agentConfig.ContinueSessionSlotIds)

	let requestBody
	let response

	logger.info(`slots: ${JSON.stringify(slots)}`)

	switch (Object.keys(continueSessionResult)[0]) {
		case 'TextRequest':
			logger.info('TextRequest')

			requestBody = {
				session_id: dialogId,
				content: scenarioAction ?? continueSessionResult.TextRequest,
				content_type: 'text',
				slots: slots
			}

			logger.info(`Send text request: ${JSON.stringify(requestBody)}`)

			response = await doRequest(authTokenHeader, agentConfig.ContinueSessionRequestUrl, requestBody)

			return response

		case 'ActionRequest':
			logger.info('ActionRequest')

			requestBody = {
				session_id: dialogId,
				content: continueSessionResult.ActionRequest,
				content_type: 'button',
				slots: slots
			}

			logger.info(`Send action request: ${JSON.stringify(requestBody)}`)

			response = await doRequest(authTokenHeader, agentConfig.ContinueSessionRequestUrl, requestBody)

			return response

		case 'AttachmentsRequest':
			logger.info('AttachmentsRequest')

			let attachmentsInfo = await getFileInfo(continueSessionResult.AttachmentsRequest[0])

			let attachmentsResult = getLoadAttachmentsResult(agentConfig.MaxAttachmentSizeBytes, attachmentsInfo, agentConfig.UnsupportedAttachmentSizeMessage)

			switch (Object.keys(attachmentsResult)[0]) {
				case 'UnsupportedAttachmentResponse':
					logger.info(`Got unsupported attachent size: ${attachmentsResult['UnsupportedAttachmentResponse'][1]}`)
					return createMockContinue(dialogId)

				case 'AttachmentsRequest':
					logger.info(`AttachmentsRequest with content ${JSON.stringify(continueSessionResult)}`)
					let text = continueSessionResult.AttachmentsRequest[1] ? continueSessionResult.AttachmentsRequest[1] : "empty text content"
					let attachmentsSlotValue = getAttachments(attachmentsInfo)

					slots['fileAttachments'] = [{value: JSON.stringify(attachmentsSlotValue), confidence: 1}]

					let requestBody = {
						session_id: dialogId,
						content: text,
						content_type: 'text',
						slots: slots
					}

					logger.info(`Sent attachments request: ${JSON.stringify(requestBody)}`)

					response = await doRequest(authTokenHeader, agentConfig.ContinueSessionRequestUrl, requestBody)

					return response
			}

			break

		case 'UnsupportedAttachmentResponse':
			logger.info(`Got unsupported attachment extensions: ${JSON.stringify(continueSessionResult.UnsupportedAttachmentResponse[1])}`)
			return createMockContinue(dialogId, continueSessionResult.UnsupportedAttachmentResponse[0])
	}
}

async function continueSessionWithAuthorizeServiceMessage(slotContext, sessionId, messageType, authTokenHeader, user, authContent) {
	logger.info("Continue session with authorize service message")

	let slots = getSlots(slotContext, agentConfig.ContinueSessionSlotIds)
	let userId = user?.ext_user_id ?? getSlots(slotContext, [ "sys_extuserid" ])

	let requestBody = {
		session_id: sessionId,
		content: authContent ? authContent : JSON.stringify({
			authorized: true,
			sessionId,
			userId: user?.ext_user_id ?? userId.sys_extuserid[0].value,
			sms: null,
			error: null
		}),
		content_type: "text",
		slots: slots
	}

	logger.info(`Send service with authorize message request: ${JSON.stringify(requestBody)}`)

	response = await doRequest(authTokenHeader, agentConfig.ContinueSessionRequestUrl, requestBody)

	return response
}

async function continueSessionWithServiceMessage(slotContext, sessionId, messageType, authTokenHeader) {
	logger.info("Continue session with service message")

	let slots = getSlots(slotContext, agentConfig.ContinueSessionSlotIds)

	slots['message_type'] = [{value: `${messageType}`, confidence: 1}]

	let requestBody = {
		session_id: sessionId,
		content: "/crafttalk_internal_message",
		content_type: "text",
		slots: slots
	}

	logger.info(`Send service message request: ${JSON.stringify(requestBody)}`)

	response = await doRequest(authTokenHeader, agentConfig.ContinueSessionRequestUrl, requestBody)

	return response
}

async function sendSessionRequest(message, sessionRequestType, authContent) {
	let authTokenHeader = agentConfig.AuthToken[message.channel.channel_id] ?? agentConfig.AuthToken.default

	let response

	switch (sessionRequestType) {
		case SessionRequestType.Empty:
			return {response: NaN, config: NaN}

		case SessionRequestType.Start:
			response = await startNewSession(message, authTokenHeader, agentConfig.StartSessionRequestUrl, agentConfig.OverrideChannelTypeSettings)

			return {response: response, config: agentConfig}

		case SessionRequestType.Continue:
			response = await continueSession(message, message.slot_context, message.user.session_id, authTokenHeader)

			return {response: response, config: agentConfig}

		case SessionRequestType.StartWithContinue:
			let scenarioAction
			if (agentConfig.SlotInScenario) { scenarioAction = getSlotValue(agentConfig.SlotInScenario) }
			logger.info(`Scenario action: ${scenarioAction}`)

			let startResponse = await startNewSession(message, authTokenHeader, agentConfig.StartSessionRequestUrl, agentConfig.OverrideChannelTypeSettings)
			logger.info(`Response from start new session: ${JSON.stringify(startResponse)}`)

			response = await continueSession(message, message.slot_context, message.user.session_id, authTokenHeader, scenarioAction)

			return {response: response, config: agentConfig}

		case SessionRequestType.ContinueWithAuthorizeServiceMessage:
			response = await continueSessionWithAuthorizeServiceMessage(message.slot_context, message.user.session_id, message.message_type, authTokenHeader, message.user, authContent)

			return {response: response, config: agentConfig}

		case SessionRequestType.ContinueWithServiceMessage:
			response = await continueSessionWithServiceMessage(message.slot_context, message.user.session_id, message.message_type, authTokenHeader)

			return {response: response, config: agentConfig}

		default:
			return {response: NaN, config: NaN}
	}
}

function responseActionFromText(action) {
	return ["finish", "transfer"].includes(action) ? action : "continue"
}

function getTextType(variables) {
	let formattingType = variables.formatting_type

	if (formattingType) {
		switch (formattingType) {
			case "md":
				return "Markdown"

			case "plain":
				return "Text"

			default:
				return "Text"
		}
	} else {
		return "Text"
	}
}

function responseMessageButtonsToBotsActions(buttons) {
	let actions = []

	if (buttons.length > 0) {
		for (let button of buttons) {
			if (button.tag && button.label) {
				actions.push({
					action_id: button.tag.replaceAll(" ", "_SP_").replaceAll(/_SP_color:/gi, " color:"),
					action_text: button.label
				})
			}
		}
	}

	return actions
}

function responseMessageButtonsToMarkdown(buttons) {
	if (buttons.length > 0) {
		const burronsMdStart = "\n```buttons\n::"

		let buttonsMd = ""
		let lastRow = -1

		let allRowsOne = buttons.filter(button => button.rows !== 1).length === 0

		for (let button of buttons) {
			if (button.label && button.tag) {
				let splited_button = button.tag.split("___")
				let button_type = splited_button[0]
				let button_action = splited_button[1]

				if (!button_action) {
					button_type = "action"
					button_action = splited_button[0]
				}

				if (allRowsOne || (lastRow !== -1 && lastRow !== button.rows))
					buttonsMd += "::\n" + `[${button.label} ${button.icon}](type:${button_type} action:${button_type !== "action" ? "" : "B$"}${button_action.replaceAll(" ", "_SP_").replaceAll(/_SP_color:/gi, " color:")})\n`
				else
					buttonsMd += "\n" + `[${button.label} ${button.icon}](type:${button_type} action:${button_type !== "action" ? "" : "B$"}${button_action.replaceAll(" ", "_SP_").replaceAll(/_SP_color:/gi, " color:")})\n`

				lastRow = button.rows
			}
		}

		return burronsMdStart + buttonsMd + "```"
	} else {
		return ""
	}
}

function convertHtmlTagToMd(message) {
	logger.info(`Incoming message to unwrap links: ${message}`)
	let links_content = message.match(/>(.*?)<\s*\/\s*a>/gi)
	logger.info(`Links in message: ${links_content ? JSON.stringify(links_content) : "unknown"}`)

	if (links_content) {
		links_content = links_content.map((el => el.replace(/<\/?a>|^>/g, '').replace(/<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g, "")))

		let links = message.match(/href="(.*?)"/g).map((el => el.replace(/href="|"/g, '')))

		const regexp = /<\s*a[^>]*>(.*?)<\s*\/\s*a>/gi
		let count = 0
		let result = message.replace(regexp, function ($0) {
			return `[${links_content[count]}](${links[count]})`
		})

		return result
	} else {
		return message
	}
}

function processResponseMessages(messages, variables, message) {
	let replies = []
	if (messages.length > 0) {
		for (let msg of messages) {
			if (!msg.content) {
				msg.content = ""
			}

			logger.info(`MESSAGES: ${JSON.stringify(messages)}`)

			const reqexp = /action:.*\)/gi
			let count = 0
			let currentActions = msg.content.match(reqexp)
			let filledSpacesActionContent = msg.content.replace(reqexp, function ($0) {
				return currentActions[count++].replaceAll(" ", "_SP_").replaceAll("_SP_image_emoji", " image_emoji").replaceAll(/_SP_color:/gi, " color:")
			})

			let content = filledSpacesActionContent
			let textType = "Text"
			let actions = []
			let buttons = ""

			let gettedTextType = getTextType(variables)

			if (gettedTextType === "Markdown") {
				content = convertHtmlTagToMd(content)
			}

			if (msg.buttons) {
				if (gettedTextType === "Markdown") {
					textType = "Markdown"
					actions = []
					buttons = responseMessageButtonsToMarkdown(msg.buttons)
				} else {
					actions = responseMessageButtonsToBotsActions(msg.buttons)
					textType = message.channel.channel_type === "telegram" ? "Html" : textType
				}
			}

			const slots = extractSlotsFromVariables(variables)

			let reply = agentApi.makeTextReply(content + buttons, undefined, actions, slots)
			reply.message.text_type = textType

			replies.push(reply)
		}
	}

	return replies
}

function processResponseAction(responseAction, redirectToOperatorAction, message, sessionRequestType, slots) {
	let reply
	logger.info(`Action from response ${message.action} and getted ${responseAction}`)
	switch (responseAction) {
		case "continue":
			if (sessionRequestType === SessionRequestType.Start || sessionRequestType === SessionRequestType.StartWithContinue) {
				return {slot: {"bss-session-started": "true", ...slots}}
			} else {
				return {empty: "Empty"}
			}

		case "transfer":
			reply = agentApi.makeTextReply(`/switchredirect ${redirectToOperatorAction[message.channel.channel_id] ?? redirectToOperatorAction.default_routing}`, undefined, undefined, {isOperator: "true", ...slots})
			return {transfer: reply}

		case "finish":
			reply = agentApi.makeFinishReply("CLOSED_BY_BOT")

			let index = message.slot_context.filled_slots.findIndex((slot) => slot.slot_id === "bss-session-started")

			if (index > -1) {
				message.slot_context.filled_slots[index].value = ""
			}

			reply.slot_context = message.slot_context
			return {finish: reply}
	}
}

function processResponse(response, message, redirectToOperatorAction, sessionRequestType) {
	let resultProcessResponse
	const slots = extractSlotsFromVariables(response.variables)
	switch (response.error_code) {
		case 0:
			let responseAction = responseActionFromText(response.action)

			resultProcessResponse = {
				Messages: processResponseMessages(response.messages, response.variables, message),
				Action: processResponseAction(responseAction, redirectToOperatorAction, message, sessionRequestType, slots),
				Error: ""
			}
			break

		default:
			resultProcessResponse = {
				Messages: "Empty",
				Action: "Empty",
				Error: response.error_info ? `Process response error info: ${response.error_info}` : `Process response error info is empty`
			}
			break
	}

	return resultProcessResponse
}

async function setSessionStarted(sessionRequestType, error, dialogId, omniUserId) {
	logger.info(`Set session startedin storage`)
	if (sessionRequestType === SessionRequestType.Start || sessionRequestType === SessionRequestType.StartWithContinue) {
		logger.info(`Session started or started with continue`)
		if (error === "") {
			logger.info(`Set session ${dialogId} started by omni user id: ${omniUserId}`)
			await agentStorage.agentStorage.set(omniUserId, dialogId)
		}
	}
}

function overrdeContext(dialogContext, context) {
	context = context[0][1] !== "" ? context : [[]]

	dialogContext = dialogContext[0].length < 1 ? dialogContext : [[]]

	let keys = context.map(item => item[0])

	let us = def_context.filter(item => !keys.includes(item[0]) && item[0] !== "" && item[1] !== "" && item.length > 0)
	return context.concat(us)
}

function tryOverrideDialogRouting(responseVariables, overrideDialogRoutingSettings, overrideDialogRoutingVariable) {
	if (responseVariables[overrideDialogRoutingVariable]) {
		const overrideDialogRoutingValue = responseVariables[overrideDialogRoutingVariable]

		if (overrideDialogRoutingSettings[overrideDialogRoutingValue]) {
			const routing = overrideDialogRoutingSettings[overrideDialogRoutingValue]
			return {isOperator: "true", routing_queue: routing}
		} else {
			logger.info(`Got empty override dialog routing settings for ${overrideDialogRoutingValue}`)
			return {isOperator: "true", routing_queue: overrideDialogRoutingValue}
		}
	} else {
		logger.info(`Failed to find variable ${overrideDialogRoutingVariable} in response variables`)
	}
}

async function runAction(action, variables, overrideDialogRoutingSettings, overrideDialogRoutingVariable, dialogId, omniUserId) {
	let reply = ""

	if (action.transfer) {
		logger.info("Got transfer action")
		const slots = tryOverrideDialogRouting(variables, overrideDialogRoutingSettings, overrideDialogRoutingVariable, agentConfig.RedirectToOperatorAction)
		await agentStorage.agentStorage.del(omniUserId)
		if (slots && slots.routing_queue) {
			const transferAction = action.transfer
			transferAction.slot_context.filled_slots.push({
				slot_id: "routing_queue",
				value: slots.routing_queue,
				filled_at_ms: 0,
				filled_by: "Auto"
			})
			action.transfer = transferAction
		}
		return action.transfer
	} else if (action.finish) {
		logger.info("Got finish action")
		await agentStorage.agentStorage.del(omniUserId)
		return action.finish
	} else if (action.empty) {
		logger.info("Got empty action")
		return reply
	} else {
		logger.info("Got unknown action")
		return reply
	}
}

async function processSessionResponse(response, sessionRequestType, message, dialogId, omniUserId) {
	let processResponseResult = processResponse(response, message, agentConfig.RedirectToOperatorAction, sessionRequestType)

	logger.info(`Got process response result ${JSON.stringify(processResponseResult)}`)

	await setSessionStarted(sessionRequestType, processResponseResult.Error, dialogId, message.user.omni_user_id)

	let reply = await runAction(processResponseResult.Action, response.variables, agentConfig.OverrideDialogRoutingSettings, agentConfig.OverrideDialogRoutingVariable, dialogId, omniUserId)

	let resultReplies = processResponseResult.Messages

	if (!Array.isArray(resultReplies)) { throw new Error("Messages not array") }

	logger.info(`resultReplies: ${JSON.stringify(resultReplies)}`)
	logger.info(`reply: ${JSON.stringify(reply)}`)

	if (reply !== "") {
		let lastReply = processResponseResult.Action.slot ? agentApi.makeTextReply("/ack ack ack", undefined, undefined, processResponseResult.Action.slot) : agentApi.makeTextReply("/ack ack ack")
		resultReplies = resultReplies.concat([reply, lastReply])
	}

	return resultReplies
}

async function closeBssSession(dialogId) {
	if (!message.user.merged_to) {
		return
	}

	logger.info(`User [${message.user.omni_user_id}] was merged to ${message.user.merged_to}`)

	const authTokenHeader = agentConfig.AuthToken[message.channel.channel_id] ?? agentConfig.AuthToken.default

	const requestBody = { session_id: dialogId }

	try {
		await doRequest(
			authTokenHeader,
			agentConfig.FinishSessionRequestUrl,
			requestBody
		)
	} catch (error) {
		logger.error(`Error when finish session on bss: ${error}`)
		logger.info(`[url: ${agentConfig.FinishSessionRequestUrl}] Error body : ${JSON.stringify(requestBody)}`)
	}
}

async function main(message) {
	logger.info(`Got message: ${JSON.stringify(message)}`)

	let dialogId

	if (message.user.session_id) {
		dialogId = message.user.session_id
	} else {
		let dialogIdResponse = await agentApi.getDialogId(message.user.omni_user_id, message.user.customer_id)
		dialogId = dialogIdResponse.Response
	}

	if (!dialogId) {
		return [agentApi.makeTextReply("/ack ack ack")]
	}

	let sessionStarted = false

	logger.info(`Dialog id: ${dialogId}`)
	const omniUserId = message.user.omni_user_id
	let dialogStorageValueByOmniUser = undefined

	if (omniUserId) {
		dialogStorageValueByOmniUser = await agentStorage.agentStorage.get(omniUserId)
	}

	logger.info(`Dialog id in omni [${omniUserId}] storage: ${dialogStorageValueByOmniUser}. Current dialog id: ${dialogId}`)

	if (dialogStorageValueByOmniUser === dialogId) {
		sessionStarted = true
	}

	const slotStartValue = getSlots(message.slot_context, [ "bss-session-started" ])

	if (slotStartValue["bss-session-started"] && slotStartValue["bss-session-started"] == "true") {
		logger.info(`Set session started variable by slot`)
		sessionStarted = true
		await agentStorage.agentStorage.set(omniUserId, dialogId)
	}

	const isJsonContent = isJSONMessage(message.message.text ?? "")

	if (isJsonContent) {
		logger.info(`User was auth`)
		sessionRequestType = SessionRequestType.ContinueWithAuthorizeServiceMessage
		sessionStarted = true
		await agentStorage.agentStorage.set(omniUserId, dialogId)
	}

	let sessionRequestType = getSessionRequestType(sessionStarted, message.message_type)

	logger.info(
		`Got session request type: ${sessionRequestType} - ${Object.keys(SessionRequestType).find(key => SessionRequestType[key] === sessionRequestType)}`
	)

	let response = await sendSessionRequest(message, sessionRequestType, isJsonContent ? message.message.text ?? "" : undefined)

	logger.info(`Got response: ${JSON.stringify(response)}`)
	logger.info(`Got response response: ${JSON.stringify(response.response)}`)
	logger.info(`Got response config: ${JSON.stringify(response.config)}`)

	if (response.response && response.config) {
		logger.info("Not empty response and not empty agentConfig")

		let result = await processSessionResponse(response.response, sessionRequestType, message, dialogId, message.user.omni_user_id)
		return result
	} else {
		logger.info("Empty response and agentConfig")
		return [agentApi.makeTextReply("/ack ack ack")]
	}
}

main(message).then((result) => {
	resolve(result)
}).catch((error) => {
	logger.error(`Get PsbBssResponse: ${error}`)
	logger.error(error.response)

	resolve([
		agentApi.makeTextReply(`/switchredirect ${agentConfig.RedirectToOperatorAction[message.channel.channel_id] ?? agentConfig.RedirectToOperatorAction.default_routing}`)
	])
})