const {
	url,
	method = 'get',
	headers = {},
	authorizationToken,
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

const formatDate = (date) => {
	const text = String(date).trim()
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/)
	return match ? `${match[3]}.${match[2]}.${match[1]}` : text
}

const main = async () => {
	const userId = getSlotValueById('uid')
	if (!userId) {
		logger.error('uid slot is empty')
		return [operatorTransferReply()]
	}

	const requestUrl = url.replace('{{slots.uid}}', encodeURIComponent(userId))
	const devices = await sendRequest(requestUrl)
	if (!Array.isArray(devices)) {
		logger.error('Invalid /devices response: expected an array')
		return [operatorTransferReply()]
	}

	const results = devices.map(device => {
		const reading = device?.last_reading?.readings?.[0]
		const hasReading = reading && reading.value !== undefined && reading.value !== null && reading.value !== '' &&
			reading.date !== undefined && reading.date !== null && String(reading.date).trim() !== ''

		return {
			device_id: device?.id || null,
			device_number: device?.number || null,
			service_name: device?.service_name || null,
			last_reading: hasReading ? { value: reading.value, date: reading.date } : null
		}
	})
	const withReadings = results.filter(device => device.last_reading)
	const readingsText = withReadings.length > 0
		? `По вашему лицевому счёту последние показания: ${withReadings.map(device => {
			const name = device.device_number ? `прибор № ${device.device_number}` : 'прибор учёта'
			return `${name} — ${device.last_reading.value} от ${formatDate(device.last_reading.date)}`
		}).join('; ')}.`
		: ''

	const filledSlots = {
		final_answer: withReadings.length > 0 ? '1' : devices.length === 0 ? '2' : '3',
		readings_text: readingsText,
		devices_readings: JSON.stringify(results)
	}
	logger.info(`Found ${devices.length} devices, ${withReadings.length} with last readings`)
	return [nextArticleReply(filledSlots)]
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
