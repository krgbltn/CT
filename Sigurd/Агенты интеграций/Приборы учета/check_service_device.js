const {
	infoUrl,
	disconnectionReportUrl,
	method = 'get',
	headers = {},
	authorizationToken,
	serviceNames = {},
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const classifier = () => getSlotValueById('classifier')

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById('next_article') || nextArticle
	return agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${targetArticle}"`, undefined, undefined, slots)
}

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${operatorArticle}"`)

const normalizeName = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

const sendRequest = async (requestUrl) => {
	const requestHeaders = authorizationToken
		? { ...headers, Authorization: authorizationToken }
		: headers
	const res = await axios({
		url: requestUrl,
		method,
		headers: requestHeaders,
		httpsAgent: new https.Agent({ rejectUnauthorized: false })
	})
	return res?.data
}

const main = async () => {
	const userId = getSlotValueById('uid')
	const serviceType = getSlotValueById('service_type')
	const names = serviceNames[serviceType]

	if (!userId || !names || !Array.isArray(names.accounts) || !Array.isArray(names.devices)) {
		logger.error(`Missing uid or unknown service_type: ${serviceType}`)
		return [operatorTransferReply()]
	}

	const infoData = await sendRequest(infoUrl.replace('{{slots.uid}}', encodeURIComponent(userId)))
	const account = infoData?.account
	if (!account || typeof account.number !== 'string' || !Array.isArray(account.accounts) || !Array.isArray(account.devices)) {
		logger.error('Invalid /info response: account, number, accounts or devices missing')
		return [operatorTransferReply()]
	}

	const accountServices = account.accounts
		.filter(item => item?.account === account.number)
		.flatMap(item => Array.isArray(item.services) ? item.services : [])
	const matchedService = accountServices.find(service =>
		names.accounts.some(name => normalizeName(service) === normalizeName(name))
	)
	const matchedDevices = account.devices.filter(device =>
		names.devices.some(name => normalizeName(device?.service_name).includes(normalizeName(name)))
	)
	const activeDevice = matchedDevices.find(device =>
		device.accepts_readings === true
	)
	const selectedDevice = activeDevice || matchedDevices[0]

	const filledSlots = {
		service_exists: String(Boolean(matchedService)),
		service_active: String(Boolean(matchedService && matchedDevices.some(device => device.service_active === true))),
		device_exists: String(matchedDevices.length > 0),
		device_active: String(Boolean(activeDevice))
	}

	if (matchedService) filledSlots.service_name = matchedService
	if (selectedDevice?.readings_accept_type != null) {
		filledSlots.readings_accept_type = String(selectedDevice.readings_accept_type)
	}
	if (account.house?.address_object?.city) filledSlots.city = String(account.house.address_object.city)

	if (selectedDevice && disconnectionReportUrl) {
		const reportData = await sendRequest(disconnectionReportUrl.replace('{user_id}', encodeURIComponent(userId)))
		if (!reportData) {
			logger.error('No disconnection_report_info response')
			return [operatorTransferReply()]
		}
		if (reportData.housetype != null) filledSlots.house_type = String(reportData.housetype)
	}

	logger.info(`Service/device check: ${JSON.stringify({ serviceType, ...filledSlots })}`)
	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
