const {
	microserviceUrl: MICROSERVICE_URL,
	channelId: CHANNEL_ID,
	customerId: CUSTOMER_ID,
	slots: SLOTS,
	routingText: ROUTING_TEXT,
	routingTopics: ROUTING_TOPICS
} = agentSettings

const CALL_ID_SLOT_ID = "call_id_sigurd"
const SESSION_ID_SLOT_ID = "session_id_sigurd"
const OMNI_USER_ID_SLOT_ID = "sys_omniuserid"

const WEBHOOK_URL = `${MICROSERVICE_URL}/webhook`

const getSlotValue = (slots, slotId) => slots?.find(slot => slot.id === slotId)?.value ?? ""

const sendWebhook = async (payload) => {
	try {
		const response = await axios.post(WEBHOOK_URL, payload, { timeout: 25000 })
		logger.debug(`Webhook sent: status=${response.status} event=${payload.event}`)
	} catch (error) {
		logger.error(`Webhook failed (${WEBHOOK_URL}): ${error}`)
	}
}

const getRoutingInfo = (text) => {
	const topic = (text || "").replace("/switchredirect routingagent", "").trim()
	const topics = ROUTING_TOPICS || {}
	const info = topics[topic] || topics["Не определена"] || {
		topic: "Не определена",
		groups: [{ id: 411, name: "Разное" }]
	}
	return { topic: info.topic, groups: info.groups }
}

const finishDialog = async (omniUserId) => {
	if (!omniUserId) {
		logger.debug(`finishDialog: omniUserId is null, skipping`)
		return
	}
	try {
		const { Response: dialogId } = await agentApi.getDialogId(omniUserId, CUSTOMER_ID)
		await agentApi.finishDialog(dialogId, "Call end", 5)
		logger.debug(`finishDialog: dialog ${dialogId} finished (transfer)`)
	} catch (err) {
		logger.error({ stack: err.stack }, `Error when finishDialog on transfer: ${err}`)
	}
}

const handleMessage = async () => {
	const msg = message.data

	const slots = msg?.slots || []
	const callId = getSlotValue(slots, CALL_ID_SLOT_ID)
	const sessionId = getSlotValue(slots, SESSION_ID_SLOT_ID)
	const omniUserId = getSlotValue(slots, OMNI_USER_ID_SLOT_ID)
	const messageType = msg?.message_type
	const text = msg?.content?.text ?? ""

	logger.debug(`[outgoing] callId=${callId} messageType=${messageType} text="${text.substring(0, 80)}"`)

	if (!callId) {
		logger.error(`callId not found in slots, cannot correlate webhook`)
		return
	}

	switch (messageType) {
		case 1: {
			const meta = msg?.meta || msg?.content?.meta || {}
			const finReason = getSlotValue(slots, "DialogFinishReason")
			const isFinish =
				text === "Диалог завершен" ||
				String(meta.force_finish_message_sent ?? "").toLowerCase() === "true" ||
				finReason === "finishdialog"
			if (isFinish) {
				logger.debug(`[outgoing] callId=${callId} end`)
				await sendWebhook({ callId, sessionId, event: "end", messageType })
				break
			}
			logger.debug(`[outgoing] callId=${callId} reply`)
			await sendWebhook({ callId, sessionId, event: "reply", text, messageType })
			break
		}
		case 16: {
			logger.debug(`[outgoing] callId=${callId} end`)
			await sendWebhook({ callId, sessionId, event: "end", messageType })
			break
		}
		case 18: {
			const op = msg?.operator || {}
			const operatorName = [op.fname, op.lname].filter(Boolean).join(' ')
				|| msg?.context?.first_operator_name
				|| getSlotValue(slots, "operator_name")
				|| null
			const topic = getSlotValue(slots, "theme") || null
			const topicInfo = (ROUTING_TOPICS || {})[topic] || (ROUTING_TOPICS || {})["Не определена"]
			const groups = topicInfo?.groups || []
			logger.info(`[outgoing] callId=${callId} operator_connected operator=${operatorName} topic=${topic}`)
			await sendWebhook({ callId, sessionId, event: "operator_connected", operator: operatorName, target: { topic, groups }, text: ROUTING_TEXT, messageType })
			await finishDialog(omniUserId)
			break
		}
		default: {
			logger.debug(`[outgoing] callId=${callId} ignored messageType=${messageType}`)
		}
	}
}

const main = async () => {
	await handleMessage()
}

main()
	.catch(err => logger.error(`[outgoing] error: ${err}`))
	.finally(() => resolve({}))
