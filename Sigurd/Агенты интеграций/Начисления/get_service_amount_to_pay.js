const {
	url,
	method = "get",
	headers = {},
	authorizationToken,
	serviceNames = {},
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

const normalizeName = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

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
	const serviceType = getSlotValueById('service_type')
	const aliases = serviceNames[serviceType]

	if (!userId) {
		logger.warn('uid slot is empty')
		return [operatorTransferReply()]
	}

	if (!serviceType || !Array.isArray(aliases)) {
		logger.warn(`Missing or unknown service_type slot: ${serviceType}`)
		return [operatorTransferReply()]
	}

	const requestUrl = url.replace('{{slots.uid}}', userId)
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

	const matched = transactions.filter(t =>
		t.service_name && aliases.some(name => normalizeName(t.service_name).includes(normalizeName(name)))
	)

	if (!matched.length) {
		logger.info(`Transactions for service_type '${serviceType}' (aliases: ${JSON.stringify(aliases)}) not found`)
		return [operatorTransferReply()]
	}

	const totalDebt = matched.reduce((acc, t) => acc + (Number(t.debt) || 0), 0)
	const amountToPay = totalDebt > 0 ? totalDebt : 0

	const filledSlots = {
		service_name: normalizeSlotValue(serviceType),
		amount_to_pay: normalizeSlotValue(amountToPay),
		final_answer: amountToPay > 0 ? '1' : '2'
	}

	logger.info(`Matched transactions: ${matched.length}, total debt: ${totalDebt}`)
	logger.info(`All slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
