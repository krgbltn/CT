const {
	notificationsUrl,
	infoUrl,
	authorizationToken,
	headers = {},
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const nextArticleReply = (slots) =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${nextArticle}"`, undefined, undefined, slots)

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${operatorArticle}"`)

const getTemplateValue = (expression) => {
	const valuePath = expression.trim()

	if (valuePath.startsWith("slots.")) {
		return getSlotValueById(valuePath.substring("slots.".length))
	}

	return valuePath
}

const renderTemplateString = (template) => {
	if (!template.includes("{{")) {
		return template
	}

	const templateParts = template.split(/\s+\|\|\s+/)

	for (const templatePart of templateParts) {
		const match = templatePart.match(/^\s*\{\{([\s\S]*?)}}\s*$/)

		if (match) {
			const value = getTemplateValue(match[1])
			if (value !== undefined && value !== null && value !== "") {
				return value
			}
		}
	}

	return ""
}

const sendRequest = async (requestUrl) => {
	try {
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method: "get",
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending request to ${requestUrl}. ${error}`)
	}
}

const main = async () => {
	const userId = getSlotValueById("user_id_tst")
	if (!userId) {
		logger.warn('No user_id_tst found')
		return [operatorTransferReply()]
	}

	const notificationsUrlRendered = renderTemplateString(notificationsUrl)
	const infoUrlRendered = renderTemplateString(infoUrl)
	logger.info(`Notifications url: ${notificationsUrlRendered}`)
	logger.info(`Info url: ${infoUrlRendered}`)

	const [notificationsData, infoData] = await Promise.all([
		sendRequest(notificationsUrlRendered),
		sendRequest(infoUrlRendered)
	])

	if (!notificationsData && !infoData) {
		logger.warn('No response data from both requests')
		return [operatorTransferReply()]
	}

	logger.info(`Notifications response: ${JSON.stringify(notificationsData || {})}`)
	logger.info(`Info response: ${JSON.stringify(infoData || {})}`)

	const hasNotifications = Array.isArray(notificationsData) && notificationsData.length > 0
	const finalAnswer = hasNotifications ? '2' : '1'

	const fio = infoData
		? [infoData.last_name, infoData.first_name, infoData.second_name].filter(Boolean).join(' ')
		: ''

	const filledSlots = {
		fio,
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
