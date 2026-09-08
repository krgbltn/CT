// prod

const {
    phoneSlotId: PHONE_SLOT_ID,
    url: INCOMING_API,
    slots: SLOTS,
    nextArticle: NEXT_ARTICLE,
    debug: DEBUG
} = agentSettings

const getDebug = () => {
    return (DEBUG && Object.keys(DEBUG).length > 0) ? {
        contractsCount: DEBUG.contractsCount,
        electricity: DEBUG.electricity,
        hotWater: DEBUG.hotWater,
        coldWater: DEBUG.coldWater,
        heating: DEBUG.heating
    } : undefined
}

const routingToOperatorAnswer = agentApi.makeTextReply("/switchredirect routingagent")

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(
    slot => slot.slot_id === slotId
)?.value

const getNextArticle = () => getSlotValueById("next_article") || NEXT_ARTICLE

const classifier = () => getSlotValueById("classifier")


function createConfig(method, url, headers, data) {
    return {
        method,
        maxBodyLength: Infinity,
        url,
        headers,
        data
    }
}

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
            logger.error(`Bad request : status - ${response.status} - ${response.syscall} ${response.code} ${response.hostname}`)
        } else {
            logger.info(`Send status : ${response.status}`)
            return response.data
        }
    } catch (error) {
        logger.error(`Send error : ${error}`)
        logger.error(`Response data: ${JSON.stringify(error.response?.data)}`)
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

const parseJsonToXml = (tag, data) => js2xmlparser.parse(tag, data)

const exctractBody = (parsedData) => parsedData["soap:Envelope"]?.["soap:Body"]

const CONTRACTS_KEY = "contracts"
const CONTRACTS_PAGINATION_KEY = "contracts_pagination"

const extractInfoFromResponse = async (parsedData) => {
    /**
        {
            "soap:Envelope": {
                "xmlns:soap": "http://www.w3.org/2003/05/soap-envelope",
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
                "soap:Body": {
                    "GetContractsInfo_By_PhoneResponse": {
                        "xmlns": "http://tempuri.org/",
                        "GetContractsInfo_By_PhoneResult": {
                            "ContractInfo": [
                                {
                                    "ID": "0e114d18-62b6-11e7-80de-00237d360000",
                                    "No": "103800120",
                                    "Adress": "               ,   .           ,  .107,   .917",
                                    "Residents": "5",
                                    "FullArea": "19.17",
                                    "DateUpdate": "2022-11-03T15:36:43.76",
                                    "Stove": "                   ",
                                    "Status": "         ",
                                    "AbonentName": "      ",
                                    "FirstName": "        ",
                                    "Patronimic": "         ",
                                    "DivisionID": "9bad477b-26ee-11dc-8782-000423d10000"
                                },
                                {
                                    "ID": "4d21e098-fe41-11e6-80ce-002481f90000",
                                    "No": "     200763",
                                    "Adress": "       ,   .        ,  .79 ,   .17 ",
                                    "Residents": "1",
                                    "FullArea": "19.60",
                                    "DateUpdate": "2022-07-08T11:50:24.923",
                                    "Stove": "                   ",
                                    "Status": "         ",
                                    "AbonentName": "    ",
                                    "FirstName": "        ",
                                    "Patronimic": "          ",
                                    "DivisionID": "f59a8382-235d-11e9-80c2-9457a550000"
                                }
                            ]
                        }
                    }
                }
            },
            "otherParameters": ""
        }
     */

    const body = exctractBody(parsedData)

    if (!body) {
        logger.info(`No body founded in response`)
        return []
    }

    const contractsInfo = body["GetContractsInfo_By_PhoneResponse"]?.["GetContractsInfo_By_PhoneResult"]?.["ContractInfo"]
    const contractsInfoArr = Array.isArray(contractsInfo)
        ? contractsInfo
        : (contractsInfo ? [contractsInfo] : [])
    //                       -                ,      -
    const contractIdMap = contractsInfoArr.reduce((acc, cur) => {
        acc[cur.No] = cur.ID
        return acc
    }, {})

    await agentStorage.dialogStorage.set(
        CONTRACTS_KEY,
        JSON.stringify(contractIdMap)
    )
    return { contracts: contractsInfoArr.map(info => info.No), contractIdMap } //
}

const getContractsInfoByPhone = async (phoneNumber) => {
    const requestBody = {
        "@": {
            "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
            "xmlns:tem": "http://tempuri.org/",
        },
        "soapenv:Header": "",
        "soapenv:Body": {
            "tem:GetContractsInfo_By_Phone": {
                "tem:PhoneNumber": phoneNumber
            }
        }
    }

    const xmlData = parseJsonToXml("soapenv:Envelope", requestBody)
    logger.info(`Created xml data: ${JSON.stringify(xmlData)}`)
    const xmlResponse = await sendRequest(xmlData, 'http://tempuri.org/GetContractsInfo_By_Phone')
    logger.info(`Got xml response: ${JSON.stringify(xmlResponse ?? {})}`)

    if (!xmlResponse) {
        return { contracts: [], contractIdMap: {} }
    }

    const parsedResponse = await parseXmlToJson(xmlResponse)
    return await extractInfoFromResponse(parsedResponse)
}

/**
1
2
4
21
 */
const NOMENCLATURES = [1, 2, 4, 21]

const extractMdInfoFromResponse = async (parsedData) => {
    /*
    {
        "soap:Envelope": {
            "xmlns:soap": "http://www.w3.org/2003/05/soap-envelope",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
            "soap:Body": {
                "GetMDInfo_By_ContractIDAndNomenclatureCodeResponse": {
                    "xmlns": "http://tempuri.org/",
                    "GetMDInfo_By_ContractIDAndNomenclatureCodeResult": {
                        "MDInfo": [
                            {
                                "MDSerialNumber": "981",
                                "MDInstallationLocation": "     ",
                                "MDNextVerificationDeadline": "2031-11-24T00:00:00",
                                "MDScales": {
                                    "MDScaleInfo": {
                                        "MDScaleID": "7C46D77E-D2DE-11E9-80C2-9457A553D5EB",
                                        "MDScaleName": " 3",
                                        "MDSDigitsAfterDot": "3",
                                        "LastReadings": "2",
                                        "LastReadingsDate": "2025-12-20T14:20:35.973",
                                        "ReadingsExist": "true",
                                        "MaxAcceptableNewMDReadingValue": "102"
                                    }
                                }
                            },
                            {
                                "MDSerialNumber": "007",
                                "MDInstallationLocation": "       ",
                                "MDNextVerificationDeadline": "2031-11-24T00:00:00",
                                "MDScales": {
                                    "MDScaleInfo": {
                                        "MDScaleID": "A1E01E62-D2DE-11E9-80C2-9457A553D5EB",
                                        "MDScaleName": " 3",
                                        "MDSDigitsAfterDot": "3",
                                        "LastReadings": "40",
                                        "LastReadingsDate": "2025-12-20T14:21:06.77",
                                        "ReadingsExist": "true",
                                        "MaxAcceptableNewMDReadingValue": "140"
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        },
        "otherParameters": ""
    }

    */
    const body = exctractBody(parsedData)

    if (!body) {
        logger.info(`No body founded in response`)
        return []
    }

    const mdInfo = body?.["GetMDInfo_By_ContractIDAndNomenclatureCodeResponse"]?.["GetMDInfo_By_ContractIDAndNomenclatureCodeResult"]?.["MDInfo"]
    const mdInfoArr = Array.isArray(mdInfo) ? mdInfo : (mdInfo ? [mdInfo] : [])
    return mdInfoArr[0]
}

//
const getMDInfo = async (contractId, nomenclatureCode) => {
    const requestBody = {
        "@": {
            "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
            "xmlns:tem": "http://tempuri.org/",
        },
        "soapenv:Header": "",
        "soapenv:Body": {
            "tem:GetMDInfo_By_ContractIDAndNomenclatureCode": {
                "tem:ContractStrGUID": contractId,
                "tem:NomenclatureCode": nomenclatureCode
            }
        }
    }

    const xmlData = parseJsonToXml("soapenv:Envelope", requestBody)
    logger.info(`Created xml data: ${JSON.stringify(xmlData)}`)
    const xmlResponse = await sendRequest(xmlData, 'http://tempuri.org/GetMDInfo_By_ContractIDAndNomenclatureCode')
    logger.info(`Got xml response: ${JSON.stringify(xmlResponse ?? {})}`)

    if (getDebug()) {
        return {
            "MDSerialNumber": "007",
            "MDInstallationLocation": "       ",
            "MDNextVerificationDeadline": "2031-11-24T00:00:00",
            "MDScales": {
                "MDScaleInfo": {
                    "MDScaleID": "A1E01E62-D2DE-11E9-80C2-9457A553D5EB",
                    "MDScaleName": " 3",
                    "MDSDigitsAfterDot": "3",
                    "LastReadings": "40",
                    "LastReadingsDate": "2025-12-20T14:21:06.77",
                    "ReadingsExist": "true",
                    "MaxAcceptableNewMDReadingValue": "140"
                }
            }
        }
    }

    if (!xmlResponse) {
        return []
    }

    const parsedResponse = await parseXmlToJson(xmlResponse)
    return await extractMdInfoFromResponse(parsedResponse)
}

const getMDSInfo = async (contractId) => {
    try {
        const mdsResultPromises = await Promise.allSettled(
            [
                getMDInfo(contractId, NOMENCLATURES[0]),
                getMDInfo(contractId, NOMENCLATURES[1]),
                getMDInfo(contractId, NOMENCLATURES[2]),
                getMDInfo(contractId, NOMENCLATURES[3])
            ]
        )

        logger.info(`PROMISES: ${JSON.stringify(mdsResultPromises)}`)

        return mdsResultPromises.reduce(
            (acc, cur, indx) => {
                if (cur.status === "fulfilled" && cur.value !== undefined) {
                    acc[NOMENCLATURES[indx]] = cur.value
                }

                return acc
            },
            {}
        )
    } catch (err) {
        logger.error(`Err when get mds info: ${err}`)
        return undefined
    }
}

const getSlots = (mdsInfo, contract) => {
    /**
     * {
            "MDSerialNumber": "981",
            "MDInstallationLocation": "     ",
            "MDNextVerificationDeadline": "2031-11-24T00:00:00",
            "MDScales": {
                "MDScaleInfo": {
                    "MDScaleID": "7C46D77E-D2DE-11E9-80C2-9457A553D5EB",
                    "MDScaleName": " 3",
                    "MDSDigitsAfterDot": "3",
                    "LastReadings": "2",
                    "LastReadingsDate": "2025-12-20T14:20:35.973",
                    "ReadingsExist": "true",
                    "MaxAcceptableNewMDReadingValue": "102"
                }
            }
        }
     */

    const slots = {
        [SLOTS.authSuccess]: "false"
    }

    if (!mdsInfo && !contract) {
        return slots
    }

    slots[SLOTS.authSuccess] = "true"
    slots[SLOTS.contract] = contract

    if (!mdsInfo) {
        return slots
    }

    for (const nom of Object.keys(mdsInfo)) {
        let scaleInfo = mdsInfo[nom]?.MDScales?.MDScaleInfo
        logger.info(`Slots: ${JSON.stringify(scaleInfo)}`)
        scaleInfo = Array.isArray(scaleInfo) ? scaleInfo[0] : scaleInfo

        if (!scaleInfo) {
            continue
        }

        switch (Number(nom)) {
            case 1:
                if (!getDebug() || getDebug().electricity) {
                    slots[SLOTS.electro] = mdsInfo[nom].MDSerialNumber
                    slots[SLOTS.electroLast] = scaleInfo.LastReadings
                    slots[SLOTS.electroScale] = "true"
                }
                break

            case 2:
                if (!getDebug() || getDebug().hotWater) {
                    slots[SLOTS.hw] = mdsInfo[nom].MDSerialNumber
                    slots[SLOTS.hwLast] = scaleInfo.LastReadings
                    slots[SLOTS.hwScale] = "true"
                }
                break

            case 4:
                if (!getDebug() || getDebug().coldWater) {
                    slots[SLOTS.cw] = mdsInfo[nom].MDSerialNumber
                    slots[SLOTS.cwLast] = scaleInfo.LastReadings
                    slots[SLOTS.cwScale] = "true"
                }
                break

            case 21:
                if (!getDebug() || getDebug().heating) {
                    slots[SLOTS.heating] = mdsInfo[nom].MDSerialNumber
                    slots[SLOTS.heatingLast] = scaleInfo.LastReadings
                    slots[SLOTS.heatingScale] = "true" //scaleInfo.MaxAcceptableNewMDReadingValue
                }
                break
        }
    }

    return slots
}

const main = async () => {
    let storedContracts = await agentStorage.dialogStorage.get(CONTRACTS_KEY)
    storedContracts = storedContracts ? JSON.parse(storedContracts) : ""
    let contractsPagination

    if (!storedContracts) {
        let phoneNumber = "89501074005"//getSlotValueById(PHONE_SLOT_ID)
        logger.info(`Got phone number ${phoneNumber}`)

        if (getDebug()) {
            phoneNumber = "78005553535"
        }

        if (!phoneNumber) {
            logger.info(`Phone not found`)
            return [routingToOperatorAnswer]
        }

        const { contracts, contractIdMap } = await getContractsInfoByPhone(phoneNumber) //

        if (getDebug()) {
            for (let i = 0; i < getDebug().contractsCount; i++) {
                const contractNo = `NO_${uuid.v4()}`
                const contractId = `ID_${uuid.v4()}`
                contracts.push(contractNo)
                contractIdMap[contractNo] = contractId
            }
        }

        contractsPagination = { max: contracts.length, current: 1 }
        await agentStorage.dialogStorage.set(CONTRACTS_PAGINATION_KEY, JSON.stringify(contractsPagination))
        storedContracts = contractIdMap
    } else {
        contractsPagination = JSON.parse(await agentStorage.dialogStorage.get(CONTRACTS_PAGINATION_KEY))
        contractsPagination.current++
    }

    if (Object.keys(storedContracts).length === 0) {
        logger.info(`Empty contracts stored or got`)
        const slots = getSlots(undefined, undefined)
        return [
            agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${getNextArticle()}"`, undefined, undefined, slots)
        ]
    }

    const mdsInfo = await getMDSInfo(Object.values(storedContracts)[contractsPagination.current - 1])
    logger.info(`Got mdsInfo ${JSON.stringify(mdsInfo)}`)
    const slots = getSlots(mdsInfo, Object.keys(storedContracts)[contractsPagination.current - 1])
    logger.info(`Filled slots: ${JSON.stringify(slots)}`)

    await agentStorage.dialogStorage.set(CONTRACTS_PAGINATION_KEY, JSON.stringify(contractsPagination))

    return [
        agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${getNextArticle()}"`, undefined, undefined, slots)
    ]
}

main()
    .then(res => resolve(res))
    .catch(err => {
        logger.error({ stack: err.stack }, `Some error when main execute ${err}`)
        resolve([routingToOperatorAnswer])
    })
