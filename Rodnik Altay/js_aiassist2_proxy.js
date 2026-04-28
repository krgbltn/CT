const AGENT_ID = agentSettings.agent_id;
const AGENT_OPER = agentSettings.agent_oper;
logger.info(`===> message:, ${JSON.stringify(message)}`);

if (message.message.text !== "/start") {
	logger.info("Message text !== /start");
	logger.info("===> after first if:", message);
	resolve([
		agentApi.makeTextReply(""),
		agentApi.makeSwitchRedirectReply(AGENT_ID, message.message.text),
	]);
} else if (
	message.message.text === "/start" &&
	message.context.findIndex(
		(el) => el[0] === "initialize_operator_id" && el[1] !== "__SYSTEM__"
	) !== -1
) {
	logger.info("===> after second if:", message);
	resolve([agentApi.makeTextReply(`/redirect ${AGENT_OPER}`, undefined, undefined, {sys_phone: message.user.channel_user_id} )]);
} else {
	logger.info("Incoming message on js_aiassist2_proxy in second if");
	resolve([
		agentApi.makeSwitchRedirectReply("finishdialogagent")
	])
}