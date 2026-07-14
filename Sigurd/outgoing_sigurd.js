const {
	storageKey: OUTGOING_TEXT_KEY,
	slots: SLOTS
} = agentSettings

const REQUEST_ID_KEY = "OUTGOING_REQ"

const getStorageKey = (userId) => `${OUTGOING_TEXT_KEY}-${userId}`
const getRequestKey = (userId) => `${REQUEST_ID_KEY}-${userId}`

const main = async () => {
	logger.info(`Incoming message: ${JSON.stringify(message)}`)
	const msg = message.data

	logger.info(`Message data: ${JSON.stringify(msg)}`)

	if (msg.message_type === 1) {
		logger.info(`Got message type 1`)
		const userId = msg.slots.find(slot => slot.id === SLOTS.userId)?.value
		logger.info(`Got user id: ${userId}`)
		const requestId = await agentStorage.globalStorage.get(getRequestKey(userId))
		if (requestId) {
			await agentStorage.globalStorage.set(`${getStorageKey(userId)}-${requestId}`, msg.content.text)
		}
	}
}

main()
	.catch(err => logger.error(err))
	.finally(() => resolve({}))