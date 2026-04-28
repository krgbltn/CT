let agent_id = "aiassist2"
const channelId = message.channel?.channel_id || ""
logger.info(`===> message:, ${JSON.stringify(message)}`)

if (message.message.text !== "/start") {
	logger.info("Message text !== /start")
	logger.info("===> after first if:", message)
	resolve([
		agentApi.makeTextReply(''),
		agentApi.makeSwitchRedirectReply(agent_id, message.message.text)
	])
} else if (message.message.text === "/start" && (message.context.findIndex(el => el[0] === "initialize_operator_id" && el[1] !== "__SYSTEM__") !== -1)) {
	logger.info("===> after second if:", message)
	if (channelId === "channel_0a6583b") {
		logger.info("Incoming message on js_aiassist2_proxy in second if")
		resolve([
			agentApi.makeTextReply('/redirect routingagent', undefined, undefined, {sys_phone: channelId}),
		])
	} else {
		resolve([
			agentApi.makeSwitchRedirectReply("routingagent")
		])
	}

} else {
	logger.info("Incoming message on js_aiassist2_proxy in second if")
	resolve([])
}