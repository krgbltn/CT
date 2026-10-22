const {
	apiUrl,
	apiToken,
	aiAssistAgentId,
	articleId,
	errorArticleId,
	slotIds = {},
	debugMode = false,
	debugRequestBody = {}
} = agentSettings

let appealNumber = ""

const generateAppealNumber = () =>
	`ПЛ-2026-${String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0")}`

const makeAppealReply = (targetArticleId) => {
	const filledSlots = appealNumber
		? { [slotIds.number_question || "number_question"]: appealNumber }
		: undefined

	return agentApi.makeTextReply(
		`/switchredirect ${aiAssistAgentId} intent_id="${targetArticleId}"`,
		undefined,
		undefined,
		filledSlots
	)
}

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
		    question: getSlotValue(slotIds.question),
			summary: getSlotValue(slotIds.summary),
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
		question: source.question || "",
		summary: source.summary || "",
		any_file: source.any_file || "",
		date_question: toIsoDate(source.date_question),
		channel_question: source.channel_question || "",
		user_id_max: source.user_id_max || "",
		attach_links: source.attach_links || ""
	}
}

const sendAppeal = async (requestBody) => {
	if (!apiUrl) {
		throw new Error("Direct Line webhook URL is not configured")
	}

	const headers = { "Content-Type": "application/json" }
	if (apiToken) {
		headers.Authorization = `Bearer ${apiToken}`
	}

	const response = await axios.post(apiUrl, requestBody, { headers })
	logger.info({ status: response.status, responseData: response.data }, "Direct Line webhook response")
	return response.data
}

const main = async () => {
	const requestBody = await buildRequestBody()
	appealNumber = generateAppealNumber()
	requestBody.number_question = appealNumber
	logger.info({ requestBody, debugMode }, "Direct Line webhook request")

	await sendAppeal(requestBody)
	return [makeAppealReply(articleId)]
}

main()
	.then(result => resolve(result))
	.catch(error => {
		logger.error(
			{ status: error.response?.status, responseData: error.response?.data, stack: error.stack },
			"Direct Line webhook agent execution failed"
		)
		resolve([makeAppealReply(errorArticleId)])
	})
