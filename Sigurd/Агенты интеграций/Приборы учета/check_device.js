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

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${targetArticle}"`, undefined, undefined, slots)
}

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
	const deviceId = getSlotValueById('device')

	if (!userId) {
		logger.warn('user_id_tst slot is empty')
		return [operatorTransferReply()]
	}

	if (!deviceId) {
		logger.warn('device slot is empty')
		return [operatorTransferReply()]
	}

	const infoRequestUrl = infoUrl.replace('{{slots.user_id_tst}}', userId)
	logger.info(`Info request url: ${infoRequestUrl}`)

	const infoData = await sendRequest(infoRequestUrl)

	if (!infoData) {
		logger.warn('No info data or request failed')
		return [operatorTransferReply()]
	}

	logger.info(`Got info data: ${JSON.stringify(infoData)}`)

	const devices = infoData?.account?.devices
	const device = Array.isArray(devices)
		? devices.find(d => d.id === deviceId && d.service_name && d.service_name.includes('Электроснабжение'))
		: undefined

	if (!device) {
		logger.info(`Device with id '${deviceId}' and service 'Электроснабжение' not found`)
		const filledSlots = { final_answer: '2' }
		return [nextArticleReply(filledSlots)]
	}

	const reportUrl = disconnectionReportUrl.replace('{user_id}', userId)
	logger.info(`Report request url: ${reportUrl}`)

	const reportData = await sendRequest(reportUrl)
	const houseType = reportData?.housetype

	logger.info(`House type: ${houseType}`)

	const filledSlots = {
		device: normalizeSlotValue(deviceId),
		service_name: normalizeSlotValue(device.service_name),
		city: infoData?.account?.house?.address_object?.city
			? normalizeSlotValue(infoData.account.house.address_object.city)
			: undefined,
		house_type: houseType ? normalizeSlotValue(houseType) : undefined,
		readings_accept_type: device.readings_accept_type
			? normalizeSlotValue(device.readings_accept_type)
			: undefined,
		final_answer: '1'
	}

	logger.info(`All slots: ${JSON.stringify(filledSlots)}`)

	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
