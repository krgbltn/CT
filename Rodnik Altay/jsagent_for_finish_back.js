async function run(){

	logger.info("Start check for Service message - type of 200.")

	let event = message.slot_context.filled_slots.find(

		(slot) => slot.slot_id == "domain_event_type"

	).value


	switch(event) {

		case "DialogFinished":

			logger.info("Dialog Finished event.")

			await agentStorage.omniUserStorage.set("FINISH_DIALOG", true)

			return []

		case "DialogScoreReceived":

			logger.info("Dialog Score Received.")

			if (await agentStorage.omniUserStorage.get("FINISH_DIALOG")) {

				// clear agentStorage finish dialog - поймали оценку, после завершения. Обнулили переменную завершения, чтобы при следующей оценке, которая произошла до завершения, не сработал повторно скрипт
				await agentStorage.omniUserStorage.del("FINISH_DIALOG")

				let last_client_message = message.slot_context.filled_slots.find(

					(slot) => slot.slot_id == "ep_Message"

				)
				let filled_slots = {}

				if (last_client_message) {

					logger.info(`Finded Last message. ${last_client_message}`)

					last_client_message = last_client_message.value
					last_client_message = JSON.parse(last_client_message)

					last_client_message.FilledSlots.map(
						(slot) => {
							filled_slots[slot.id] = slot.value
						}
					)
				} else {
					logger.info("Not finded Last message.")
				}
				logger.info(`Full message: ${JSON.stringify(message)}`)
				let score = message.slot_context.filled_slots.find(

					(slot) => slot.slot_id == "ep_Score"

				).value

				logger.info(`Dialog Score ${score}.`)

				// Берём актуальные заполненные слоты из сценариев
				let filled_slots_user = {}
				message.user.slot_context.filled_slots.map(
					(slot) => {
						if(slot.slot_id != "ep_Message"){
							filled_slots_user[slot.slot_id] = slot.value
						}
					}
				)

				let dialog_id = message.slot_context.filled_slots.find(

					(slot) => slot.slot_id == "ep_DialogId"

				).value

				logger.info(`Dialog Id ${dialog_id}.`)

				filled_slots = Object.assign(
					filled_slots,
					filled_slots_user,
					{
						"Score": score,
						"skip_score": "true",
						"dialog_id": dialog_id
					}
				)
				logger.info(`Filled slots: ${JSON.stringify(filled_slots)}`)

				let customer_id = message.user.customer_id || message.channel.customer_id
				logger.info(`Customer id last message: ${customer_id}`)

				logger.info(`Omni user id last message: ${message.user.omni_user_id}`)

				let sendMessageRequest = {
					MessageMarkdown: '/switchredirect js_aiassist2_proxy1 intent_id="article-65a448e5-e243-41f2-a505-4a3c09b2ca7c"',
					SendMessageParams: {
						ProjectId: customer_id,
						DestinationChannel: {
							ChannelId: message.channel?.channel_id,
							ChannelUserId: message.user.channel_user_id
						},
						Sender: {},
						FilledSlots: filled_slots
					}
				}
				logger.info(`Channel id: ${message.channel?.channel_id}, Channel user id: ${message.user.channel_user_id}`)
				logger.info(`'sendMessageRequest' == ${JSON.stringify(sendMessageRequest)}`)
				let status_new_dialog
				try {
					// Создание диалога
					status_new_dialog = await agentApi.sendMessage(sendMessageRequest, logger)
				} catch (error) {
					logger.info(`Error: ${error}`)
					return []
				}

				if (!status_new_dialog.Ok){
					logger.info("Not OK new dialog.")
					logger.info(`Error: ${status_new_dialog.Errors[0]}`)
					return []
				} else {
					logger.info("Success.")
					return []
				}

			} else {
				logger.info("No dialog finished.")
				return []
			}

		default:
			logger.info(`Event type: ${event}. Skip.`)
			return []
	}

}

if(message.message_type == 200){

	run()
		.then(res=>{
			resolve(res)
		})
		.catch(er=>{
			logger.info(`Error: ${er}`)
			resolve([])
		})

} else {
	resolve([]) // SKIP
}