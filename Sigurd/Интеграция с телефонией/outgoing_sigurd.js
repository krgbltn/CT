const {
	storageKey: OUTGOING_TEXT_KEY,
	slots: SLOTS
} = agentSettings

const OMNI_USER_ID_SLOT_ID = "sys_omniuserid"
const OMNI_ID = "OMNI_ID"

const getStorageKey = (userId, key = OUTGOING_TEXT_KEY) => `${key}-${userId}`

const main = async () => {
	logger.info(`Incoming message: ${JSON.stringify(message)}`)
	const msg = message.data

	logger.info(`Message data: ${JSON.stringify(msg)}`)

	const userId = msg.slots.find(slot => slot.id === SLOTS.userId)?.value
	const omniUserId = msg.slots.find(slot => slot.id === OMNI_USER_ID_SLOT_ID)?.value
	logger.info(`Got user id: ${userId}. User omni: ${omniUserId}`)

	if (msg.message_type === 1) {
		logger.info(`Got message type 1`)
		await agentStorage.globalStorage.set(getStorageKey(userId), msg.content.text)
		await agentStorage.globalStorage.set(getStorageKey(userId, OMNI_ID), omniUserId)
	} else if (msg.message_type === 16) {
		logger.info(`Dialog was finished`)
		await agentStorage.globalStorage.del(getStorageKey(userId))
		await agentStorage.globalStorage.del(getStorageKey(userId, OMNI_ID))
	}
}

main()
	.catch(err => logger.error(err))
	.finally(() => resolve({}))