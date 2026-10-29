// prod

// Настройки поиска ЛС и выходных полей; все адреса API и маршруты берутся из agentSettings.
const {
    numberSlotId: NUMBER_SLOT_ID,
    url: INCOMING_API,
    slots: SLOTS,
    aiAgent: AI_AGENT,
    routingAgent: ROUTING_AGENT,
    operatorArticle: OPERATOR_ARTICLE,
    nextArticle: NEXT_ARTICLE
} = agentSettings

// Входные слоты маршрутизации имеют приоритет над настройками агента.
const getClassifier = () => getSlotValueById("classifier") || AI_AGENT

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(
        slot => slot.slot_id === slotId
    )?.value

const getNextArticle = () => getSlotValueById("next_article") || NEXT_ARTICLE




// Собираем параметры HTTP-запроса для существующего SOAP endpoint.
function createConfig(method, url, headers, data) {
    return {
        method,
        maxBodyLength: Infinity,
        url,
        headers,
        data
    }
}

// Отправляем SOAP; пустой ответ или ошибка HTTP прекращают идентификацию.
async function sendRequest(data, soapAction) {
    logger.info('Start sending request')

    const headers = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction
    }

    const config = createConfig("post", INCOMING_API, headers, data)
    config.httpsAgent = new https.Agent({ rejectUnauthorized: false })

    try {
        const response = await axios(config)
        if (response.status !== 200) {
            throw new Error(`SOAP request failed: status=${response.status}`)
        } else {
            if (!response.data) throw new Error('Empty SOAP response')
            logger.info(`Send status : ${response.status}`)
            return response.data
        }
    } catch (error) {
        logger.error(`Send error : ${error}`)
        logger.error(`Response data: ${JSON.stringify(error.response?.data)}`)
        throw error
    }
}

// Разбираем XML в объект; ошибка парсинга обрабатывается общим маршрутом ошибок.
function parseXmlToJson(xml) {
    const parser = new xml2js.Parser({
        explicitArray: false,
        preserveChildrenOrder: true,
        headlessRootTag: false,
        trim: true
    })
    return new Promise((resolve, reject) => {
        parser.parseString(xml, (err, result) => {
            if (err) reject(err)
            else resolve(result)
        })
    })
}

const parseJsonToXml = (tag, data) => js2xmlparser.parse(tag, data)

const exctractBody = (parsedData) => parsedData["soap:Envelope"]?.["soap:Body"]

const IDENTIFICATION_KEY = "readings_identification"

// Проверяем результат поиска и оставляем только поля, нужные для выбора ЛС.
const extractInfoFromResponse = async (parsedData) => {
    const body = exctractBody(parsedData)
    const result = body?.["FindAllByContractNumberResponse"]?.["FindAllByContractNumberResult"]
    if (body?.['soap:Fault'] || body?.Fault || result === undefined || result === null
        || (result !== '' && (typeof result !== 'object' || Array.isArray(result)))) throw new Error('Invalid contracts SOAP response')
    const contractsInfo = result.ContractInfo
    const contractsInfoArr = Array.isArray(contractsInfo)
        ? contractsInfo
        : (contractsInfo === undefined ? [] : [contractsInfo])
    return contractsInfoArr.map(({ ID, No, Adress, City }) => ({
        ID, No,
        Adress: typeof Adress === 'string' ? Adress.trim() : '',
        City: typeof City === 'string' ? City.trim() : ''
    }))
}

// Запрашиваем ЛС по цифровой части номера, без запроса приборов.
const getContractsInfoByContract = async (contractNumber) => {
    const requestBody = {
        "@": {
            "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
            "xmlns:tem": "http://tempuri.org/",
        },
        "soapenv:Header": "",
        "soapenv:Body": {
            "tem:FindAllByContractNumber": {
                "tem:contractNumberDigits": Number(contractNumber)
            }
        }
    }

    const xmlData = parseJsonToXml("soapenv:Envelope", requestBody)
    logger.info(`Created xml data: ${JSON.stringify(xmlData)}`)
    const xmlResponse = await sendRequest(xmlData, 'http://tempuri.org/FindAllByContractNumber')
    logger.info(`Got xml response: ${JSON.stringify(xmlResponse ?? {})}`)

    if (!xmlResponse) {
        throw new Error('Empty contracts SOAP response')
    }

    const parsedResponse = await parseXmlToJson(xmlResponse)
    return await extractInfoFromResponse(parsedResponse)
}

// Возвращаем результат выбранного ЛС либо очищенный набор при уточнении и ошибке.
const getSlots = (contract) => {
    // resetSlots очищает прежний цикл; slots содержит только пять полей идентификации.
    const slots = { ...agentSettings.resetSlots,
        ...Object.fromEntries(Object.values(SLOTS).filter(Boolean).map(id => [id, ""])) }
    slots[SLOTS.authSuccess] = contract ? "true" : "false"
    if (contract) {
        slots[SLOTS.accountId] = String(contract.ID).trim()
        slots[SLOTS.contract] = String(contract.No)
        if (SLOTS.address) slots[SLOTS.address] = contract.Adress
    }
    return slots
}

// Сопоставление и озвучивание адресов — по шаблону общей идентификации.
const normalizeAddress = (value) => (value || '').toLowerCase().replace(/ё/g, 'е').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
const ADDRESS_MARKERS = [
    { type: 'city', pattern: 'дачный\\s+поселок|рабочий\\s+поселок|населенный\\s+пункт|город|поселок|деревня|село|дп|рп|пгт|пос|г|п|с' },
    { type: 'street', pattern: 'улица|проспект|пр-кт|бульвар|б-р|переулок|площадь|шоссе|проезд|пр-д|микрорайон|мкр|квартал|кв-л|квл|ул|пер|пл' },
    { type: 'house', pattern: 'дом|д' },
    { type: 'apartment', pattern: 'квартира|кв' },
    { type: 'building', pattern: 'корпус|корп|к' },
    { type: 'structure', pattern: 'строение|стр' },
    { type: 'region', pattern: 'область|обл|район|р-н|р-он' }
]
// Словари числительных позволяют распознавать названия улиц, дома и номера вариантов.
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
// Преобразуем произнесенные числительные в число для сопоставления адреса.
const parseNumber = (words, allowOrdinals = true) => {
    if (!words.length) return null
    if (words.length === 1 && /^\d+$/.test(words[0])) return Number(words[0])
    let result = 0
    let previousRank = 4
    for (let index = 0; index < words.length; index++) {
        const ordinal = allowOrdinals ? ordinalValue(words[index]) : undefined
        const value = cardinalValues[words[index]] ?? ordinal
        if (value === undefined || (ordinal !== undefined && index !== words.length - 1)) return null
        const rank = value >= 100 ? 3 : value >= 20 ? 2 : 1
        if (rank >= previousRank || (value === 0 && words.length !== 1)) return null
        previousRank = rank
        result += value
    }
    return result
}
// Приводим словесную и цифровую запись адресных чисел к общей форме.
const normalizeNumbers = (value, allowOrdinals = true) => {
    const text = allowOrdinals ? value.replace(/(\d+)\s*-?\s*(?:ая|яя|ый|ий|ой|я|й|е)(?=\s|$)/g, '$1') : value
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
    const match = normalizeNumbers(value || '').replace(/№/g, '').trim().match(/^(\d+)(?:\s*([а-яa-z])(?=\s|\/|$))?(?:\s*\/\s*(\d+))?/)
    return match ? match[1] + (match[2] || '') + (match[3] ? '/' + match[3] : '') : ''
}
// Разделяем адрес на населенный пункт, улицу, дом и уточняющие части.
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
    const unique = markers.filter((marker, index) => !markers.slice(0, index).some(previous => previous.end > marker.start))
    const parts = {}
    unique.forEach((marker, index) => {
        const part = text.slice(marker.end, unique[index + 1]?.start ?? text.length).replace(/№/g, '').trim()
        parts[marker.type] = marker.type === 'region' && parts.region ? parts.region + ' ' + part : part
    })
    // SOAP может возвращать населённый пункт первым сегментом без «г.».
    if (!parts.city && (value || '').includes(',')) {
        const first = normalizeAddress(value.split(',').find(part => !/^\s*\d{6}\s*$/.test(part)) || '')
        const hasMarker = ADDRESS_MARKERS.some(({ pattern }) => new RegExp(`(^|\\s)(${pattern})(?=\\s|\\d|$)`).test(first))
        if (first && !hasMarker && !/\d/.test(first)) parts.city = first
    }
    const houseMarker = unique.find(marker => marker.type === 'house')
    const extraMarker = unique.find(marker => ['apartment', 'building', 'structure'].includes(marker.type))
    const prefix = normalizeNumbers(text.slice(0, houseMarker?.start ?? extraMarker?.start ?? text.length), false)
    const tail = prefix.match(/\d+(?:\s*[а-яa-z](?=\s|\/|$))?(?:\s*\/\s*\d+)?\s*$/)
    const inferred = tail && !/^\d+\s*[яйе]\s*$/.test(tail[0]) && !/^\d{6}\s*$/.test(prefix)
        && (!parts.street || parts.street !== tail[0].trim()) ? tail : null
    const houseFull = addressNumber(houseMarker ? parts.house : inferred?.[0])
    const nameText = !houseMarker && inferred ? prefix.slice(0, inferred.index) : prefix
    if (!houseMarker && inferred && parts.street) {
        parts.street = normalizeNumbers(parts.street, false).replace(/\d+(?:\s*[а-яa-z](?=\s|\/|$))?(?:\s*\/\s*\d+)?\s*$/, '').trim()
    }
    return { parts, house: houseFull.match(/^\d+/)?.[0], houseFull, words: addressWords(nameText), streetLabel: unique.find(marker => marker.type === 'street')?.label }
}
// Допускаем небольшие различия слов при сопоставлении произнесенного адреса.
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
            current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1))
        }
        previous = current
    }
    return previous[second.length] <= limit
}
const matchAddressName = (expected, words, used) => {
    if (!expected.length) return false
    for (let start = 0; start <= words.length - expected.length; start++) {
        if (expected.every((word, index) => !used.has(start + index) && addressWordMatches(word, words[start + index]))) {
            expected.forEach((_, index) => used.add(start + index))
            return true
        }
    }
    return false
}
const canonicalPart = (value) => addressWords(value || '').join(' ')
const streetType = (label) => ({ ул: 'улица', мкр: 'микрорайон', 'кв-л': 'квартал', квл: 'квартал', 'пр-кт': 'проспект', 'б-р': 'бульвар', пер: 'переулок', пл: 'площадь', 'пр-д': 'проезд' }[label] || label || '')
// Строим единое представление адреса с учетом отдельного поля City.
const getContractAddressOption = (contract) => {
    const rawAddress = contract.Adress.replace(/^\s*\d{6}(?:\s*,\s*|\s+|$)/, '').trim()
    const address = parseAddress(rawAddress)
    const cityValue = typeof contract.City === 'string' ? contract.City.trim() : ''
    const city = cityValue && (parseAddress(cityValue).parts.city || normalizeAddress(cityValue))
    const raw = city && canonicalPart(city) !== canonicalPart(address.parts.city)
        ? `${cityValue}, ${rawAddress}` : rawAddress
    if (city) address.parts.city = city
    return { address, raw }
}
// Объединяем одинаковые адреса; сохраняем связь с первым соответствующим ЛС.
const getAddressOptions = (contracts) => {
    const seen = new Set()
    return contracts.reduce((options, contract, index) => {
        const { address, raw } = getContractAddressOption(contract)
        const { parts, houseFull } = address
        const key = parts.city && parts.street && houseFull
            ? JSON.stringify([canonicalPart(parts.region), canonicalPart(parts.city), streetType(address.streetLabel), canonicalPart(parts.street), houseFull, ...['building', 'structure', 'apartment'].map(type => canonicalPart(parts[type]))])
            : canonicalPart(raw)
        if (!seen.has(key)) {
            seen.add(key)
            options.push({ index, address, raw })
        }
        return options
    }, [])
}
// Оцениваем полное и частичное совпадение слов клиента с найденными адресами.
const scoreAddresses = (options, text) => {
    const userAddress = parseAddress(text)
    const userWords = addressWords(normalizeAddress(text))
    return options.map(option => {
        const { address } = option
        const used = new Set()
        let score = address.house && address.house === userAddress.house ? 1 : 0
        for (const type of ['city', 'street']) {
            const expected = addressWords(address.parts[type] || '')
            const explicit = userAddress.parts[type]
            if ((!explicit || matchAddressName(expected, addressWords(explicit), new Set())) && matchAddressName(expected, userAddress.words, used)) score++
        }
        const detailConflict = ['apartment', 'building', 'structure'].some(type => userAddress.parts[type] && canonicalPart(userAddress.parts[type]) !== canonicalPart(address.parts[type]))
        const words = addressWords(['city', 'street', 'house', 'apartment', 'building', 'structure'].map(type => address.parts[type] || '').join(' '))
        const partial = [...new Set(userWords)].filter(word => words.some(expected => addressWordMatches(expected, word) || (/^[а-яa-z]{3,}$/.test(word) && expected.includes(word)))).length
        return { ...option, score, partial, full: score === 3 && !detailConflict && address.houseFull === userAddress.houseFull }
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
// Готовим адрес для озвучивания без индекса и дублирующего названия города.
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
    const raw = option.raw.replace(/^\s*\d{6}(?:\s*,\s*|\s+|$)/, '').trim()
    return parts.city && parts.street && result.length ? result.join(', ') : raw || 'адрес не указан'
}
const normalizeResponse = (text) => normalizeAddress(text).replace(/[^а-яa-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
// Распознаем подтверждение адреса; непонятный ответ остается отдельным исходом.
const confirmationAnswer = (text) => {
    const response = normalizeResponse(text)
    if (/^(?:да|yes|ага|конечно|верно|правильно|согласен|подтверждаю|угу|ok|okay)(?: (?:да|верно|правильно|конечно))?$/.test(response)) return 'yes'
    if (/^(?:нет|no|не|неверно|неправильно|не то|другой|нет не то|нет другой адрес)$/.test(response)) return 'no'
    return null
}
// Получаем номер адреса из списка либо явный отказ от предложенных вариантов.
const selectedNumber = (text) => {
    let response = normalizeResponse(text)
    if (response === 'нет') return 'no'
    response = response.replace(/^(?:номер|адрес|вариант)\s+/, '').replace(/\s+(?:адрес|вариант|номер)$/, '')
    return parseNumber(response.split(/\s+/))
}

// Состояние принадлежит этому агенту и хранится только до выбора адреса.
const clearLookupState = async () => {
    for (const key of [IDENTIFICATION_KEY, 'contracts', 'contracts_addresses', 'contracts_pagination']) await agentStorage.dialogStorage.del(key)
}
// Перед переводом очищаем кандидатов и выходные данные прошлого поиска.
const routingToOperator = async () => {
    try {
        await clearLookupState()
    } catch (error) {
        logger.error({ stack: error.stack }, 'Failed to clear identification state')
    }
    const command = OPERATOR_ARTICLE ? `/switchredirect ${getClassifier()} intent_id="${OPERATOR_ARTICLE}"` : `/switchredirect ${ROUTING_AGENT}`
    return [agentApi.makeTextReply(command, undefined, undefined, getSlots())]
}
// Не продолжаем выбор, если в ответе отсутствуют обязательные поля ЛС.
const validContracts = (contracts) => Array.isArray(contracts) && contracts.length > 0 && contracts.every(contract =>
    contract && typeof contract.ID === 'string' && contract.ID.trim() && contract.No && typeof contract.Adress === 'string' && contract.Adress.trim())
// Сохраняем шаг идентификации до вопроса, чтобы следующий вызов продолжил тот же выбор.
const questionReply = async (text, state) => {
    const saved = await agentStorage.dialogStorage.set(IDENTIFICATION_KEY, JSON.stringify(state))
    if (saved === false) throw new Error('Failed to save identification state')
    return [agentApi.makeTextReply(text, undefined, undefined, getSlots())]
}
const askAddressReply = (contracts) => questionReply('Назовите адрес, по которому Вы обращаетесь.', { contracts, step: 'ask_multiple' })
const confirmAddressReply = (state) => {
    const option = getContractAddressOption(state.contracts[state.selectedIndex])
    return questionReply(`Вы обращаетесь по адресу: ${formatAddress(option)}? Скажите «да» или «нет».`, state)
}
const addressListReply = (contracts, retry = 0) => {
    const list = getAddressOptions(contracts).map((option, index) => `Номер ${index + 1}: ${formatAddress(option)}.`).join('\n')
    return questionReply(`Сейчас я перечислю найденные адреса, после этого назовите номер нужного адреса.\n${list}\nЕсли нужного адреса нет в озвученном списке, ответьте словом «нет».`, { contracts, step: 'choose_address', retry })
}
// Фиксируем выбранный ЛС в пяти слотах; приборы получит отдельный контроллер.
const completeIdentification = async (contract, addressConfirmed = false) => {
    // Удаляем все варианты; результат остаётся только в слотах выбранного ЛС.
    await clearLookupState()
    const slots = getSlots(contract)
    if (addressConfirmed && SLOTS.addressSuccess) slots[SLOTS.addressSuccess] = "true"
    logger.info(`Contract selected: ${contract.No}, filled slots: ${JSON.stringify(slots)}`)
    return [agentApi.makeTextReply(`/switchredirect ${getClassifier()} intent_id="${getNextArticle()}"`, undefined, undefined, slots)]
}
// Разделяем пустой результат, единственный адрес и необходимость уточнения.
const startIdentification = async (contracts) => {
    if (Array.isArray(contracts) && contracts.length === 0) {
        await clearLookupState()
        logger.info('No contracts found; returning to next article')
        return [agentApi.makeTextReply(`/switchredirect ${getClassifier()} intent_id="${getNextArticle()}"`, undefined, undefined, getSlots())]
    }
    if (!validContracts(contracts)) return routingToOperator()
    const unique = getAddressOptions(contracts).map(option => contracts[option.index])
    return unique.length === 1 ? completeIdentification(unique[0]) : askAddressReply(unique)
}
// Продолжаем сохраненный этап: адрес, подтверждение совпадения или номер из списка.
const handleIdentification = async (state) => {
    if (!state || !validContracts(state.contracts) || !['ask_multiple', 'confirm_partial', 'choose_address'].includes(state.step)) return routingToOperator()
    const { contracts, step } = state
    const text = message?.message?.text || message?.text || ''
    logger.info(`User response (step=${step}): ${JSON.stringify(text)}`)
    if (step === 'confirm_partial') {
        if (!Number.isInteger(state.selectedIndex) || !contracts[state.selectedIndex] || ![0, 1].includes(state.retry)) return routingToOperator()
        if (message.message_type === 0) return confirmAddressReply(state)
        const answer = confirmationAnswer(text)
        if (answer === 'yes') return completeIdentification(contracts[state.selectedIndex], true)
        if (answer === 'no' || state.retry === 1) return addressListReply(contracts)
        return confirmAddressReply({ ...state, retry: 1 })
    }
    if (step === 'choose_address') {
        if (![0, 1].includes(state.retry)) return routingToOperator()
        const options = getAddressOptions(contracts)
        if (message.message_type === 0) return addressListReply(contracts, state.retry)
        const number = selectedNumber(text)
        if (number === 'no') return routingToOperator()
        if (Number.isSafeInteger(number) && number >= 1 && number <= options.length) return completeIdentification(contracts[options[number - 1].index])
        if (state.retry === 1) return routingToOperator()
        return questionReply(`Назовите номер адреса от 1 до ${options.length} или скажите «нет», если нужного адреса нет.`, { ...state, retry: 1 })
    }
    if (message.message_type === 0) return askAddressReply(contracts)
    const scored = scoreAddresses(getAddressOptions(contracts), text)
    const full = scored.filter(option => option.full)
    if (full.length === 1) return completeIdentification(contracts[full[0].index])
    if (full.length > 1) return addressListReply(contracts)
    scored.sort((first, second) => second.score - first.score || second.partial - first.partial)
    const best = scored[0]
    const tied = scored.filter(option => option.score === best.score && option.partial === best.partial)
    logger.info(`Address candidates: ${tied.length}, score: ${best.score}, partial: ${best.partial}`)
    return tied.length === 1 && (best.score > 0 || best.partial > 0)
        ? confirmAddressReply({ contracts, step: 'confirm_partial', selectedIndex: best.index, retry: 0 })
        : addressListReply(contracts)
}

// Системные события подтверждаем; обычный вызов продолжает выбор или начинает новый поиск.
const main = async () => {
    if (message.message_type !== undefined && ![0, 1].includes(message.message_type)) return [agentApi.makeAckReply()]
    const storedState = await agentStorage.dialogStorage.get(IDENTIFICATION_KEY)
    if (storedState) return handleIdentification(JSON.parse(storedState))
    await clearLookupState()
    const contractNumber = getSlotValueById(NUMBER_SLOT_ID)
    if (!contractNumber || !/^\d+$/.test(String(contractNumber))) return routingToOperator()
    return startIdentification(await getContractsInfoByContract(contractNumber))
}

// Завершаем запрос через resolve, в том числе при ошибке поиска или обработки ответа.
main()
    .then(res => resolve(res))
    .catch(async err => {
        logger.error({ stack: err.stack }, `Some error when main execute ${err}`)
        resolve(await routingToOperator())
    })
