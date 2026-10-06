const {
	url,
	method = "get",
	headers = {},
	authorizationToken,
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const classifier = () => getSlotValueById("classifier")

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${targetArticle}"`, undefined, undefined, slots)
}

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${operatorArticle}"`)

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
	const userId = getSlotValueById('uid')

	if (!userId) {
		logger.warn('uid slot is empty')
		return [operatorTransferReply()]
	}

	const requestUrl = url.replace('{{slots.uid}}', userId)
	logger.info(`Request url: ${requestUrl}`)

	const responseData = await sendRequest(requestUrl)

	if (!responseData) {
		logger.warn('No response data or request failed')
		return [operatorTransferReply()]
	}

	const rawBalance = responseData?.account?.balance

	logger.info(`Raw account.balance: ${JSON.stringify(rawBalance)}`)
	logger.info(`Got response data: ${JSON.stringify(responseData || {})}`)

	if (rawBalance === undefined || rawBalance === null) {
		logger.warn('account.balance is missing in response')
		return [nextArticleReply({ final_answer: '3' })]
	}

	const balance = Number(rawBalance)

	if (Number.isNaN(balance)) {
		logger.warn(`account.balance is not a number: ${JSON.stringify(rawBalance)}`)
		return [operatorTransferReply()]
	}

	const amountToPay = balance > 0 ? balance : 0

	const filledSlots = {
		balance: normalizeSlotValue(balance),
		amount_to_pay: normalizeSlotValue(amountToPay),
		final_answer: amountToPay > 0 ? '1' : '2'
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
