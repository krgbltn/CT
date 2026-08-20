const {
	infoUrl,
	disconnectionReportUrl,
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

	if (!userId) {
		logger.warn('user_id_tst slot is empty')
		return [operatorTransferReply()]
	}

	logger.info(`Using user_id_tst: ${userId}`)

	const infoRequestUrl = infoUrl.replace('{{slots.user_id_tst}}', userId)
	logger.info(`Info request url: ${infoRequestUrl}`)

	const infoData = await sendRequest(infoRequestUrl)

	if (!infoData) {
		logger.warn('No info data or request failed')
		return [operatorTransferReply()]
	}

	logger.info(`Got info data: ${JSON.stringify(infoData)}`)

	const status = infoData?.status

	const reportUrl = disconnectionReportUrl.replace('{user_id}', userId)
	logger.info(`Report request url: ${reportUrl}`)

	const reportData = await sendRequest(reportUrl)
	const houseType = reportData?.housetype

	logger.info(`Status: ${status}, House type: ${houseType}`)

	let finalAnswer = '4'

	if (status === 'Действует') {
		finalAnswer = '1'
	} else if (status === 'Выключен') {
		finalAnswer = '2'
	} else if (status === 'Закрыт' || status === 'Ликвидирован') {
		finalAnswer = '3'
	}

	const filledSlots = {
		house_type: houseType ? normalizeSlotValue(houseType) : undefined,
		final_answer: finalAnswer
	}

	logger.info(`Final answer: ${finalAnswer}`)
	logger.info(`All slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})