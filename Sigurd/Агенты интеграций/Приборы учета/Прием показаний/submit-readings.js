const {
    url: INCOMING_API,
    slots: SLOTS,
    aiAgent: AI_AGENT,
    routingAgent: ROUTING_AGENT,
    nextArticle: NEXT_ARTICLE,
    debug: DEBUG,
    continueNextAccount: CONTINUE_NEXT_ACCOUNT
} = agentSettings

const SOAP_ACTION = "http://tempuri.org/InputOfReadingsWithDot"

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(
    slot => slot.slot_id === slotId
)?.value

const getClassifier = () => getSlotValueById("classifier") || AI_AGENT
const getNextArticle = () => getSlotValueById("next_article") || NEXT_ARTICLE

const parseJsonToXml = (tag, data) => js2xmlparser.parse(tag, data)

function createConfig(data) {
    return {
        method: "post",
        maxBodyLength: Infinity,
        url: INCOMING_API,
        headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": SOAP_ACTION
        },
        data,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
    }
}

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

const getReadings = () => [
    { service: "electricity", scaleId: getSlotValueById(SLOTS.electroScaleId), value: getSlotValueById(SLOTS.electroReadings) },
    { service: "hotWater", scaleId: getSlotValueById(SLOTS.hwScaleId), value: getSlotValueById(SLOTS.hwReadings) },
    { service: "coldWater", scaleId: getSlotValueById(SLOTS.cwScaleId), value: getSlotValueById(SLOTS.cwReadings) },
    { service: "heating", scaleId: getSlotValueById(SLOTS.heatingScaleId), value: getSlotValueById(SLOTS.heatingReadings) }
]

const isFilled = value => value !== undefined && value !== null && String(value).trim() !== ""

function createReadingXml(reading) {
    const requestBody = {
        "@": {
            "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
            "xmlns:tem": "http://tempuri.org/"
        },
        "soapenv:Header": "",
        "soapenv:Body": {
            "tem:InputOfReadingsWithDot": {
                "tem:MDScale_ID": reading.scaleId,
                "tem:MDScale_NewReadings": reading.value
            }
        }
    }
    return parseJsonToXml("soapenv:Envelope", requestBody)
}

async function submitReading(reading) {
    const xmlData = createReadingXml(reading)
    logger.info(`InputOfReadingsWithDot request for ${reading.service}: ${xmlData}`)

    const response = await axios(createConfig(xmlData))
    logger.info(`InputOfReadingsWithDot response for ${reading.service}: status=${response.status}, body=${response.data}`)

    const parsedResponse = await parseXmlToJson(response.data)
    logger.info(`InputOfReadingsWithDot parsed response for ${reading.service}: ${JSON.stringify(parsedResponse)}`)

    const result = parsedResponse["soap:Envelope"]?.["soap:Body"]
        ?.["InputOfReadingsWithDotResponse"]?.["InputOfReadingsWithDotResult"]
    logger.info(`InputOfReadingsWithDot result for ${reading.service}: ${result}`)

    if (String(result) !== "1") {
        throw new Error(`InputOfReadingsWithDot failed for ${reading.service}: result=${result}`)
    }

    return { service: reading.service, scaleId: reading.scaleId, value: reading.value, result }
}

const routingToOperator = () => [agentApi.makeTextReply(`/switchredirect ${ROUTING_AGENT}`)]

async function main() {
    const readings = getReadings()
    const invalidReadings = readings.filter(reading => isFilled(reading.scaleId) !== isFilled(reading.value))
    const readingsToSubmit = readings.filter(reading => isFilled(reading.scaleId) && isFilled(reading.value))

    logger.info(`Readings received: ${JSON.stringify(readings)}`)

    if (invalidReadings.length > 0 || readingsToSubmit.length === 0) {
        logger.error(`Invalid readings slots: ${JSON.stringify({ invalidReadings, readingsToSubmit })}`)
        return routingToOperator()
    }

    const invalidValues = readingsToSubmit.filter(reading => !Number.isFinite(Number(reading.value)))
    if (invalidValues.length > 0) {
        logger.error(`Non-numeric readings: ${JSON.stringify(invalidValues)}`)
        return routingToOperator()
    }

    if (DEBUG) {
        const requests = readingsToSubmit.map(reading => (
            `${reading.service}:\n${createReadingXml(reading)}`
        )).join("\n\n")
        logger.info(`Debug mode: requests will not be submitted: ${requests}`)
        return [agentApi.makeTextReply(`Debug: запросы не отправлены в API.\n\n${requests}`)]
    }

    const results = await Promise.all(readingsToSubmit.map(submitReading))
    logger.info(`All readings submitted successfully: ${JSON.stringify(results)}`)

    const hasNextAccount = CONTINUE_NEXT_ACCOUNT && getSlotValueById(SLOTS.hasNextAccount) === "true"
    const returnLookupAgent = getSlotValueById(SLOTS.returnLookupAgent)
    logger.info(`Next account check: enabled=${CONTINUE_NEXT_ACCOUNT === true}, hasNextAccount=${hasNextAccount}, returnLookupAgent=${returnLookupAgent}`)

    if (hasNextAccount) {
        if (!returnLookupAgent) {
            throw new Error("Return lookup agent slot is empty")
        }

        return [agentApi.makeTextReply(`/switchredirect ${returnLookupAgent}`)]
    }

    return [
        agentApi.makeTextReply(`/switchredirect ${getClassifier()} intent_id="${getNextArticle()}"`)
    ]
}

main()
    .then(res => resolve(res))
    .catch(err => {
        logger.error({ stack: err.stack }, `Error while submitting readings: ${err}`)
        resolve(routingToOperator())
    })
