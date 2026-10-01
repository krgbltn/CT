const {
	apiUrl,
	apiToken,
	aiAssistAgentId,
	articleId,
	errorArticleId,
	slotIds = {},
	debugMode = false,
	debugRequestBody = {},
	maxRetries = 3,
	retryDelayMs = 1000
} = agentSettings

const getSlotValue = (slotId) =>
	message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const toIsoDate = (value) => {
	const timestamp = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value
	const date = new Date(timestamp)

	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid date_question value: ${value}`)
	}

	return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

const getDialogId = async () => {
	if (message.dialog_id) {
		return message.dialog_id
	}

	const dialog = await agentApi.getDialogId(
		message.user?.omni_user_id,
		message.user?.customer_id || message.channel?.customer_id
	)

	return dialog?.Response || ""
}

const buildRequestBody = async () => {
	const source = debugMode
		? debugRequestBody
		: {
			dialog_id: await getDialogId(),
			client_id: message.user?.omni_user_id,
			type_question: getSlotValue(slotIds.type_question),
			municipality: getSlotValue(slotIds.municipality),
			theme: getSlotValue(slotIds.theme),
			question: getSlotValue(slotIds.question),
			any_file: getSlotValue(slotIds.any_file),
			date_question: message.timestamps?.sent_from_channel,
			channel_question: getSlotValue(slotIds.channel_question),
			user_id_max: getSlotValue(slotIds.user_id_max),
			attach_links: getSlotValue(slotIds.attach_links)
		}

	return {
		dialog_id: source.dialog_id || "",
		client_id: source.client_id || "",
		type_question: source.type_question || "",
		municipality: source.municipality || "",
		theme: source.theme || "",
		question: source.question || "",
		any_file: source.any_file || "",
		date_question: toIsoDate(source.date_question),
		channel_question: source.channel_question || "",
		user_id_max: source.user_id_max || "",
		attach_links: source.attach_links || ""
	}
}

const wait = (milliseconds) => new Promise(resolveWait => setTimeout(resolveWait, milliseconds))

const sendAppeal = async (requestBody) => {
	for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
		try {
			const response = await axios.post(apiUrl, requestBody, {
				headers: {
					Authorization: `Bearer ${apiToken}`,
					"Content-Type": "application/json"
				}
			})

			logger.info({ status: response.status, responseData: response.data }, "Direct Line appeal response")
			return response.data
		} catch (error) {
			const status = error.response?.status
			const responseData = error.response?.data

			logger.error(
				{ attempt: attempt + 1, status, responseData, stack: error.stack },
				"Direct Line appeal request failed"
			)

			if (status !== 503 || attempt === maxRetries) {
				throw error
			}

			logger.warn({ attempt: attempt + 1, retryDelayMs }, "Retrying Direct Line appeal after 503")
			await wait(retryDelayMs)
		}
	}
}

const main = async () => {
	const requestBody = await buildRequestBody()
	logger.info({ requestBody, debugMode }, "Direct Line appeal request")

	await sendAppeal(requestBody)
	return [agentApi.makeSwitchRedirectReply(aiAssistAgentId, `intent_id="${articleId}"`)]
}

main()
	.then(result => resolve(result))
	.catch(error => {
		logger.error({ stack: error.stack }, "Direct Line appeal agent execution failed")
		resolve([agentApi.makeSwitchRedirectReply(aiAssistAgentId, `intent_id="${errorArticleId}"`)])
	})
