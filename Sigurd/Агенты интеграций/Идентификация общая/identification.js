// --- Настройки агента (из agentSettings) ---
const {
	url,
	method = "post",
	headers = {},
	authorizationToken,
	requestBody = {},
	slotsMapping = [],
	nextArticle,
	operatorArticle,
	disconnectionReportUrl,
	infoUrl,
	stub,
	stubResponse,
	city1Values = [],
	eddsMapping = []
} = agentSettings

// --- Утилиты для работы со слотами и message ---
const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const classifier = () => getSlotValueById("classifier")

const emptyIdentificationSlots = () => ({
	id_step: "",
	id_contracts_data: "",
	id_selected_index: "",
	id_address_options: "[]",
	id_confirm_retry: "0",
	id_number_retry: "0"
})

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${targetArticle}"`, undefined, undefined, { ...emptyIdentificationSlots(), ...slots })
}

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${operatorArticle}"`, undefined, undefined, emptyIdentificationSlots())

// --- Шаблонизация (подстановка {{ }} в url, requestBody и т.д.) ---
const normalizePath = (path) => {
	if (path === undefined || path === null || path === "" || path === "$") {
		return []
	}

	return path
		.toString()
		.replace(/^\$\./, "")
		.replace(/\[(\d+)\]/g, ".$1")
		.replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
		.split(".")
		.map(part => part.trim())
		.filter(Boolean)
}

const getValueByPath = (data, path) => {
	return normalizePath(path).reduce((acc, key) => acc?.[key], data)
}

const isFilledValue = (value) => value !== undefined && value !== null && value !== ""

const getTemplateValue = (expression) => {
	const valuePath = expression.trim()

	if (valuePath.startsWith("message.")) {
		return getValueByPath(message, valuePath.substring("message.".length))
	}

	if (valuePath.startsWith("slots.")) {
		return getSlotValueById(valuePath.substring("slots.".length))
	}

	return valuePath
}

const parseTemplateExpression = (templatePart) => {
	const match = templatePart.match(/^\s*\{\{([\s\S]*?)}}\s*$/)

	if (!match) {
		return undefined
	}

	return getTemplateValue(match[1])
}

const renderTemplatePart = (templatePart) => {
	const expressionValue = parseTemplateExpression(templatePart)

	if (expressionValue !== undefined) {
		return expressionValue
	}

	let hasEmptyValue = false
	const renderedValue = templatePart.replace(/\{\{([\s\S]*?)}}/g, (_, expression) => {
		const value = getTemplateValue(expression)

		if (!isFilledValue(value)) {
			hasEmptyValue = true
			return ""
		}

		return typeof value === "object" ? JSON.stringify(value) : value.toString()
	})

	return hasEmptyValue ? undefined : renderedValue
}

const renderTemplateString = (template) => {
	if (!template.includes("{{")) {
		return template
	}

	const templateParts = template.split(/\s+\|\|\s+/)

	for (const templatePart of templateParts) {
		const value = renderTemplatePart(templatePart)

		if (isFilledValue(value)) {
			return value
		}
	}

	return ""
}

const resolveTemplates = (data) => {
	if (typeof data === "string") {
		return renderTemplateString(data)
	}

	if (Array.isArray(data)) {
		return data.map(item => resolveTemplates(item))
	}

	if (data && typeof data === "object") {
		return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, resolveTemplates(value)]))
	}

	return data
}

const createRequestBody = () => resolveTemplates(requestBody)
const createRequestUrl = () => renderTemplateString(url)

const normalizeSlotValue = (value) => {
	if (typeof value === "object") {
		return JSON.stringify(value)
	}

	return value.toString()
}

// --- Отправка запроса (реальная или заглушка) ---
const sendRequest = async (requestUrl, body) => {
	if (stub && stubResponse) {
		logger.info('Using stub response')
		return typeof stubResponse === 'string' ? JSON.parse(stubResponse) : stubResponse
	}

	try {
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method,
			headers: requestHeaders,
			data: body,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when sending request to ${url}. ${error}`)
		throw error
	}
}

// --- Заполнение слотов из одного объекта контракта (очищает [0] из путей) ---
const fillSlotsFromContract = (contract) => {
	const filledSlots = {}

	for (const mapping of slotsMapping) {
		const relativePath = mapping.path.replace(/^\[\d+\]\.?/, '')
		const value = getValueByPath(contract, relativePath)
		const slotValue = value === undefined || value === null ? mapping.defaultValue : value

		if (slotValue === undefined || slotValue === null) {
			logger.warn(`Value by path '${mapping.path}' for slot '${mapping.slotId}' was not found`)
			continue
		}

		filledSlots[mapping.slotId] = normalizeSlotValue(slotValue)
	}

	return filledSlots
}

const getCity1 = (address) => {
	const normalizedAddress = (address || '').toLowerCase()
	return city1Values
		.slice()
		.sort((first, second) => second.length - first.length)
		.find(city => normalizedAddress.includes(city.toLowerCase()))
}

const normalizeAddress = (address) => (address || '')
	.toLowerCase()
	.replace(/ё/g, 'е')
	.replace(/[.,]/g, ' ')
	.replace(/\s+/g, ' ')
	.trim()

const getEdds = (address) => {
	const normalizedAddress = normalizeAddress(address)
	const matchedLocation = eddsMapping.find(({ locations = [] }) =>
		locations.some(location => normalizedAddress.includes(normalizeAddress(location)))
	)

	return matchedLocation?.phone
}

// --- Запрос house_type из disconnection_report_info ---
const fetchHouseType = async (userId) => {
	if (!disconnectionReportUrl || !userId) return undefined

	if (stub && stubResponse) {
		return "MKD"
	}

	try {
		const requestUrl = disconnectionReportUrl.replace("{user_id}", userId)
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method: "get",
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data?.housetype
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when fetching house type: ${error}`)
		return undefined
	}
}

// --- Запрос города из карточки ЛС ---
const fetchCity = async (userId) => {
	if (!infoUrl || !userId) return undefined

	if (stub && stubResponse) {
		return "Иркутск"
	}

	try {
		const requestUrl = infoUrl.replace("{user_id}", userId)
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method: "get",
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data?.account?.house?.address_object?.city
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when fetching city: ${error}`)
		return undefined
	}
}

// --- Запрос status из карточки ЛС ---
const fetchStatus = async (userId) => {
	if (!infoUrl || !userId) return undefined

	if (stub && stubResponse) {
		return "Действует"
	}

	try {
		const requestUrl = infoUrl.replace("{user_id}", userId)
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method: "get",
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})
		return res?.data?.status
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when fetching status: ${error}`)
		return undefined
	}
}

// --- Сопоставление адресов с учётом ошибок распознавания речи ---
const ADDRESS_MARKERS = [
	{ type: 'city', pattern: 'дачный\\s+поселок|рабочий\\s+поселок|населенный\\s+пункт|город|поселок|деревня|село|дп|рп|пгт|пос|г|п|с' },
	{ type: 'street', pattern: 'улица|проспект|пр-кт|бульвар|б-р|переулок|площадь|шоссе|проезд|пр-д|микрорайон|мкр|ул|пер|пл' },
	{ type: 'house', pattern: 'дом|д' },
	{ type: 'apartment', pattern: 'квартира|кв' },
	{ type: 'building', pattern: 'корпус|корп|к' },
	{ type: 'structure', pattern: 'строение|стр' },
	{ type: 'region', pattern: 'область|обл|район|р-н|р-он' }
]

const SMALL_NUMBERS = 'ноль один два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать'.split(' ')
const TENS = 'двадцать тридцать сорок пятьдесят шестьдесят семьдесят восемьдесят девяносто'.split(' ')
const HUNDREDS = 'сто двести триста четыреста пятьсот шестьсот семьсот восемьсот девятьсот'.split(' ')
const ORDINALS = 'нулевой первый второй третий четвертый пятый шестой седьмой восьмой девятый десятый одиннадцатый двенадцатый тринадцатый четырнадцатый пятнадцатый шестнадцатый семнадцатый восемнадцатый девятнадцатый'.split(' ')
const ORDINAL_TENS = 'двадцатый тридцатый сороковой пятидесятый шестидесятый семидесятый восьмидесятый девяностый'.split(' ')
const ORDINAL_HUNDREDS = 'сотый двухсотый трехсотый четырехсотый пятисотый шестисотый семисотый восьмисотый девятисотый'.split(' ')
const cardinalValues = { одна: 1, одно: 1, две: 2, нуль: 0 }
const ordinalValues = {}
for (const [words, step, offset] of [[SMALL_NUMBERS, 1, 0], [TENS, 10, 2], [HUNDREDS, 100, 1]]) {
	words.forEach((word, index) => cardinalValues[word] = (index + offset) * step)
}
for (const [words, step, offset] of [[ORDINALS, 1, 0], [ORDINAL_TENS, 10, 2], [ORDINAL_HUNDREDS, 100, 1]]) {
	words.forEach((word, index) => ordinalValues[word.slice(0, -2)] = (index + offset) * step)
}
const ordinalValue = (word) => {
	const match = word.match(/^(.*?)(?:ый|ой|ий|ая|яя|ья|ое|ее|ье|ую|юю|ью|ого|его|ьего|ому|ему|ьему|ым|им|ьим|ом|ем|ьем|ей|ьей)$/)
	return match ? ordinalValues[match[1]] : undefined
}

// Одно числительное, а не перечисление: «двадцать первый» допустимо, «один два» — нет.
const parseNumber = (words, allowOrdinals = true) => {
	if (!words.length) return null
	if (words.length === 1 && /^\d+$/.test(words[0])) return Number(words[0])
	let result = 0
	let previousRank = 4
	for (let index = 0; index < words.length; index++) {
		const word = words[index]
		const ordinal = allowOrdinals ? ordinalValue(word) : undefined
		const value = cardinalValues[word] ?? ordinal
		if (value === undefined || (ordinal !== undefined && index !== words.length - 1)) return null
		const rank = value >= 100 ? 3 : value >= 20 ? 2 : 1
		if (rank >= previousRank || (value === 0 && words.length !== 1)) return null
		previousRank = rank
		result += value
	}
	return result
}

const normalizeNumbers = (value, allowOrdinals = true) => {
	const text = allowOrdinals
		? value.replace(/(\d+)\s*-?\s*(?:ая|яя|ый|ий|ой|я|й|е)(?=\s|$)/g, '$1')
		: value
	const tokens = [...text.matchAll(/[а-яa-z]+|\d+/g)]
	let result = ''
	let position = 0
	for (let index = 0; index < tokens.length; index++) {
		let last = index
		let number = parseNumber([tokens[index][0]], allowOrdinals)
		if (number === null) continue
		for (let end = index + 1; end < tokens.length; end++) {
			if (!/^\s+$/.test(text.slice(tokens[end - 1].index + tokens[end - 1][0].length, tokens[end].index))) break
			const next = parseNumber(tokens.slice(index, end + 1).map(token => token[0]), allowOrdinals)
			if (next === null) break
			number = next
			last = end
		}
		result += text.slice(position, tokens[index].index) + number
		position = tokens[last].index + tokens[last][0].length
		index = last
	}
	return result + text.slice(position)
}

const addressWords = (value) => normalizeNumbers(value).match(/[а-яa-z]+|\d+/g) || []
const addressNumber = (value) => {
	const normalized = normalizeNumbers(value || '').replace(/№/g, '').trim()
	const match = normalized.match(/^(\d+)(?:\s*([а-яa-z])(?=\s|\/|$))?(?:\s*\/\s*(\d+))?/)
	return match ? match[1] + (match[2] || '') + (match[3] ? '/' + match[3] : '') : ''
}

const parseAddress = (value) => {
	const text = normalizeAddress(value).replace(/[;:]/g, ' ')
	const markers = []
	for (const { type, pattern } of ADDRESS_MARKERS) {
		const regex = new RegExp(`(^|[\\s])(${pattern})(?=\\s|\\d|$)`, 'g')
		let match
		while ((match = regex.exec(text))) {
			let markerType = type
			if (type === 'house' && match[2] === 'д') {
				const following = text.slice(regex.lastIndex).trim().split(/\s+/)[0]
				if (/^[а-я]/.test(following) && parseNumber([following]) === null) markerType = 'city'
			}
			markers.push({ type: markerType, label: match[2], start: match.index + match[1].length, end: regex.lastIndex })
		}
	}
	markers.sort((first, second) => first.start - second.start || second.end - first.end)
	const uniqueMarkers = markers.filter((marker, index) =>
		!markers.slice(0, index).some(previous => previous.end > marker.start)
	)
	const parts = {}
	uniqueMarkers.forEach((marker, index) => {
		const end = uniqueMarkers[index + 1]?.start ?? text.length
		const part = text.slice(marker.end, end).replace(/№/g, '').trim()
		parts[marker.type] = marker.type === 'region' && parts.region ? parts.region + ' ' + part : part
	})

	const houseMarker = uniqueMarkers.find(marker => marker.type === 'house')
	const extraMarker = uniqueMarkers.find(marker => ['apartment', 'building', 'structure'].includes(marker.type))
	const addressEnd = houseMarker?.start ?? extraMarker?.start ?? text.length
	const prefix = normalizeNumbers(text.slice(0, addressEnd), false)
	const tail = prefix.match(/\d+(?:\s*[а-яa-z](?=\s|\/|$))?(?:\s*\/\s*\d+)?\s*$/)
	const inferredHouse = tail && !/^\d+\s*[яйе]\s*$/.test(tail[0]) && !/^\d{6}\s*$/.test(prefix)
		&& (!parts.street || parts.street !== tail[0].trim()) ? tail : null
	const houseFull = addressNumber(houseMarker ? parts.house : inferredHouse?.[0])
	const nameText = !houseMarker && inferredHouse ? prefix.slice(0, inferredHouse.index) : prefix
	if (!houseMarker && inferredHouse && parts.street) {
		parts.street = normalizeNumbers(parts.street, false).replace(/\d+(?:\s*[а-яa-z](?=\s|\/|$))?(?:\s*\/\s*\d+)?\s*$/, '').trim()
	}
	return { parts, house: houseFull.match(/^\d+/)?.[0], houseFull, words: addressWords(nameText), streetLabel: uniqueMarkers.find(marker => marker.type === 'street')?.label }
}

const addressWordMatches = (first, second) => {
	if (first === second) return true
	if (/\d/.test(first) || /\d/.test(second)) return false
	const length = Math.min(first.length, second.length)
	const limit = length >= 7 ? 2 : length >= 5 ? 1 : 0
	if (!limit || Math.abs(first.length - second.length) > limit) return false
	let previous = Array.from({ length: second.length + 1 }, (_, index) => index)
	for (let row = 1; row <= first.length; row++) {
		const current = [row]
		for (let column = 1; column <= second.length; column++) {
			current[column] = Math.min(
				current[column - 1] + 1,
				previous[column] + 1,
				previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1)
			)
		}
		previous = current
	}
	return previous[second.length] <= limit
}

const matchAddressName = (expected, words, used) => {
	if (!expected.length) return false
	// Название должно совпасть целиком, в том числе если оно состоит из нескольких слов.
	for (let start = 0; start <= words.length - expected.length; start++) {
		if (expected.every((word, index) =>
			!used.has(start + index) && addressWordMatches(word, words[start + index])
		)) {
			expected.forEach((_, index) => used.add(start + index))
			return true
		}
	}
	return false
}

const canonicalPart = (value) => addressWords(value || '').join(' ')
const streetType = (label) => ({ ул: 'улица', мкр: 'микрорайон', 'пр-кт': 'проспект', 'б-р': 'бульвар', пер: 'переулок', пл: 'площадь', 'пр-д': 'проезд' }[label] || label || '')
const getAddressOptions = (contracts) => {
	const seen = new Set()
	return contracts.reduce((options, contract, index) => {
		const raw = contract?.WebProperties?.Address || ''
		const address = parseAddress(raw)
		const { parts, houseFull } = address
		const key = parts.city && parts.street && houseFull
			? JSON.stringify([canonicalPart(parts.region), canonicalPart(parts.city), streetType(address.streetLabel), canonicalPart(parts.street), houseFull, ...['building', 'structure', 'apartment'].map(type => canonicalPart(parts[type]))])
			: canonicalPart(raw) || `missing_address_${index}`
		if (!seen.has(key)) {
			seen.add(key)
			options.push({ index, address, raw })
		}
		return options
	}, [])
}

const scoreAddresses = (options, text) => {
	const userAddress = parseAddress(text)
	return options.map(option => {
		const { address } = option
		const used = new Set()
		let score = address.house && address.house === userAddress.house ? 1 : 0
		for (const type of ['city', 'street']) {
			const expected = addressWords(address.parts[type] || '')
			const explicitName = userAddress.parts[type]
			if ((!explicitName || matchAddressName(expected, addressWords(explicitName), new Set())) && matchAddressName(expected, userAddress.words, used)) score++
		}
		const detailConflict = ['apartment', 'building', 'structure'].some(type =>
			userAddress.parts[type] && canonicalPart(userAddress.parts[type]) !== canonicalPart(address.parts[type])
		) || (userAddress.houseFull && userAddress.houseFull !== userAddress.house && userAddress.houseFull !== address.houseFull)
		return { ...option, score, full: score === 3 && !detailConflict }
	})
}

const title = (value) => value.replace(/(^|[\s-])([а-яa-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase())
const spokenOrdinal = (number) => {
	const n = Number(number)
	if (n < 1 || n > 99) return number + '-я'
	const word = n < 20 ? ORDINALS[n] : n % 10 ? ORDINALS[n % 10] : ORDINAL_TENS[n / 10 - 2]
	const feminine = word === 'третий' ? 'третья' : word.slice(0, -2) + 'ая'
	return n >= 20 && n % 10 ? TENS[Math.floor(n / 10) - 2] + ' ' + feminine : feminine
}

const formatAddress = (option) => {
	const { parts, houseFull, streetLabel } = option.address
	const result = []
	if (parts.city) result.push(title(parts.city))
	if (parts.street) {
		const name = parts.street.replace(/(\d+)\s*-?\s*(?:ая|яя|я|й)(?=\s|$)/g, (_, n) => spokenOrdinal(n))
		const label = streetType(streetLabel)
		result.push(['ул', 'улица'].includes(label) ? title(name) + (/^\d+$/.test(canonicalPart(name)) ? ' улица' : '') : label + ' ' + title(name))
	}
	if (houseFull) result.push('дом ' + houseFull.toUpperCase())
	for (const [type, label] of [['building', 'корпус'], ['structure', 'строение'], ['apartment', 'квартира']]) {
		if (parts[type]) result.push(label + ' ' + parts[type])
	}
	return result.length && parts.city && parts.street ? result.join(', ') : option.raw || 'адрес не указан'
}

const normalizeResponse = (text) => normalizeAddress(text).replace(/[^а-яa-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
const confirmationAnswer = (text) => {
	const response = normalizeResponse(text)
	if (/^(?:да|yes|ага|конечно|верно|правильно|согласен|подтверждаю|угу|ok|okay)(?: (?:да|верно|правильно|конечно))?$/.test(response)) return 'yes'
	if (/^(?:нет|no|не|неверно|неправильно|не то|другой|нет не то|нет другой адрес)$/.test(response)) return 'no'
	return null
}

const selectedNumber = (text) => {
	let response = normalizeResponse(text)
	if (response === 'нет') return 'no'
	response = response.replace(/^(?:номер|адрес|вариант)\s+/, '').replace(/\s+(?:адрес|вариант|номер)$/, '')
	return parseNumber(response.split(/\s+/))
}

// Каждый вопрос содержит всё состояние следующего входа и ровно один ReplyMessage.
const questionReply = (text, contracts, step, slots = {}) => [agentApi.makeTextReply(text, undefined, undefined, {
	...emptyIdentificationSlots(),
	id_step: step,
	id_contracts_data: JSON.stringify(contracts),
	...slots
})]

const confirmAddressReply = (contracts, index, step, retry = '0') => {
	const option = { address: parseAddress(contracts[index]?.WebProperties?.Address), raw: contracts[index]?.WebProperties?.Address || '' }
	return questionReply(`Вы обращаетесь по адресу: ${formatAddress(option)}? Скажите «да» или «нет».`, contracts, step, {
		id_selected_index: String(index), id_confirm_retry: retry
	})
}

const addressListReply = (contracts) => {
	const options = getAddressOptions(contracts)
	const list = options.map((option, index) => `Номер ${index + 1}: ${formatAddress(option)}.`).join('\n')
	return questionReply(`Сейчас я перечислю найденные адреса, после этого назовите номер нужного адреса.\n${list}\nЕсли нужного адреса нет в озвученном списке, ответьте словом «нет».`, contracts, 'choose_address', {
		id_address_options: JSON.stringify(options.map(option => option.index))
	})
}

const completeIdentification = async (contract) => {
	const filledSlots = fillSlotsFromContract(contract)
	const city1 = getCity1(contract.WebProperties?.Address)
	if (city1) filledSlots.city_1 = city1
	const edds = getEdds(contract.WebProperties?.Address)
	if (edds) filledSlots.edds = edds
	const status = await fetchStatus(filledSlots.uid)
	if (status) filledSlots.status_ls = status
	const houseType = await fetchHouseType(filledSlots.uid)
	if (houseType) filledSlots.house_type = houseType
	const city = await fetchCity(filledSlots.uid)
	if (city) filledSlots.city = city
	logger.info(`Contract selected: ${contract.UserId}`)
	return [nextArticleReply(filledSlots)]
}

const jsonSlot = (slotId) => {
	try {
		return JSON.parse(getSlotValueById(slotId) || 'null')
	} catch (error) {
		logger.warn(`Invalid JSON in ${slotId}`)
		return null
	}
}

// --- Основная логика агента (повторный вход всегда обрабатывается до запроса API) ---
const main = async () => {
	if (message.message_type !== undefined && ![0, 1].includes(message.message_type)) return [agentApi.makeAckReply()]
	const idStep = getSlotValueById('id_step')
	if (idStep) {
		const contracts = jsonSlot('id_contracts_data')
		if (!Array.isArray(contracts) || !contracts.length || !['confirm_single', 'ask_multiple', 'confirm_partial', 'choose_address'].includes(idStep)) {
			logger.warn('Invalid identification state')
			return [operatorTransferReply()]
		}
		const userText = message?.message?.text || message?.text || ''
		logger.info(`User response (idStep=${idStep}): "${userText}"`)
		if (idStep === 'confirm_single' || idStep === 'confirm_partial') {
			const selected = getSlotValueById('id_selected_index')
			const index = selected === undefined && idStep === 'confirm_single' ? 0 : /^\d+$/.test(selected || '') ? Number(selected) : -1
			if (!contracts[index]) return [operatorTransferReply()]
			const retry = getSlotValueById('id_confirm_retry') || '0'
			if (message.message_type === 0) return confirmAddressReply(contracts, index, idStep, retry)
			const answer = confirmationAnswer(userText)
			if (answer === 'yes') return completeIdentification(contracts[index])
			if (answer === 'no') return idStep === 'confirm_partial' ? addressListReply(contracts) : [operatorTransferReply()]
			if (retry !== '0') return idStep === 'confirm_partial' ? addressListReply(contracts) : [operatorTransferReply()]
			return confirmAddressReply(contracts, index, idStep, '1')
		}
		if (idStep === 'choose_address') {
			const indices = jsonSlot('id_address_options')
			const expected = getAddressOptions(contracts).map(option => option.index)
			if (!Array.isArray(indices) || !indices.length || JSON.stringify(indices) !== JSON.stringify(expected)) return [operatorTransferReply()]
			const retry = getSlotValueById('id_number_retry') || '0'
			if (message.message_type !== 0) {
				const number = selectedNumber(userText)
				if (number === 'no') return [operatorTransferReply()]
				if (Number.isSafeInteger(number) && number >= 1 && number <= indices.length) return completeIdentification(contracts[indices[number - 1]])
				if (retry !== '0') return [operatorTransferReply()]
			}
			return questionReply(`Назовите номер адреса от 1 до ${indices.length} или скажите «нет», если нужного адреса нет.`, contracts, idStep, {
				id_address_options: JSON.stringify(indices), id_number_retry: message.message_type === 0 ? retry : '1'
			})
		}
		if (message.message_type === 0) return questionReply('Назовите адрес, по которому Вы обращаетесь.', contracts, idStep)
		const scored = scoreAddresses(getAddressOptions(contracts), userText)
		const full = scored.filter(option => option.full)
		if (full.length === 1) return completeIdentification(contracts[full[0].index])
		if (full.length > 1) return addressListReply(contracts)
		const maxScore = Math.max(...scored.map(option => option.score))
		const best = scored.filter(option => option.score === maxScore && maxScore > 0)
		logger.info(`Address candidates: ${best.length}, score: ${maxScore}`)
		return best.length === 1 ? confirmAddressReply(contracts, best[0].index, 'confirm_partial') : addressListReply(contracts)
	}

	// === Первый вызов — запрос к API ===
	const requestUrl = createRequestUrl()
	logger.info(`Created request url: ${requestUrl}`)

	const body = createRequestBody()
	logger.info(`Created request body: ${JSON.stringify(body)}`)

	let responseData
	try {
		responseData = await sendRequest(requestUrl, body)
	} catch (error) {
		logger.error({ stack: error.stack }, `Request failed, transferring to operator: ${error}`)
		return [operatorTransferReply()]
	}

	logger.info(`Got response data: ${JSON.stringify(responseData || {})}`)

	if (!responseData || !Array.isArray(responseData) || responseData.length === 0) {
		logger.warn('No contracts found or invalid response')
		return [nextArticleReply({ final_answer: 'error' })]
	}

	const contracts = responseData
	// Один лицевой счёт — спрашиваем подтверждение
	if (contracts.length === 1) {
		return confirmAddressReply(contracts, 0, 'confirm_single')
	}

	// Несколько лицевых счетов — спрашиваем адрес
	logger.info(`${contracts.length} contracts found, asking for address`)
	return questionReply('Назовите адрес, по которому Вы обращаетесь.', contracts, 'ask_multiple')
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([nextArticleReply({ final_answer: 'error' })])
	})
