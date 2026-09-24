const {
	url,
	method = "get",
	headers = {},
	authorizationToken,
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const nextArticleReply = (slots) =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${nextArticle}"`, undefined, undefined, slots)

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${operatorArticle}"`)

const normalizeSlotValue = (value) => {
	if (typeof value === "object") {
		return JSON.stringify(value)
	}

	return value.toString()
}

const sendRequest = async (requestUrl) => {
	try {
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method,
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending request to ${requestUrl}. ${error}`)
	}
}

const main = async () => {
	const userId = getSlotValueById('user_id_tst')
	const serviceName = getSlotValueById('service_name')

	if (!userId) {
		logger.warn('user_id_tst slot is empty')
		return [operatorTransferReply()]
	}

	if (!serviceName) {
		logger.warn('service_name slot is empty')
		return [operatorTransferReply()]
	}

	const requestUrl = url.replace('{{slots.user_id_tst}}', userId)
	logger.info(`Request url: ${requestUrl}`)

	const responseData = await sendRequest(requestUrl)

	if (!responseData) {
		logger.warn('No response data or request failed')
		return [operatorTransferReply()]
	}

	logger.info(`Got response data: ${JSON.stringify(responseData || {})}`)

	const transactions = Array.isArray(responseData?.transactions)
		? responseData.transactions
		: []

	const transaction = transactions.find(t =>
		t.service_name && t.service_name.includes(serviceName)
	)

	if (!transaction) {
		logger.info(`Transaction with service_name '${serviceName}' not found`)
		return [operatorTransferReply()]
	}

	const debt = Number(transaction.debt) || 0
	const amountToPay = debt > 0 ? debt : 0

	const filledSlots = {
		service_name: normalizeSlotValue(serviceName),
		amount_to_pay: normalizeSlotValue(amountToPay)
	}

	logger.info(`Amount to pay: ${amountToPay}`)
	logger.info(`All slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})