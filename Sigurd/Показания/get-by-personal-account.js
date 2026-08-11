// https://cloud.craft-talk.ru/webchat/channel_4c4159d

const {
    numberSlotId: NUMBER_SLOT_ID,
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


function createConfig(method, url, headers, data) {
    return {
        method,
        maxBodyLength: Infinity,
        url,
        headers,
        data
    }
}

async function sendRequest(data) {
    logger.info('Start sending request')

    const headers = {
        'Content-Type': 'application/xml'
    }

    const config = createConfig("post", INCOMING_API, headers, data)

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
                                    "Adress": "Нижний Новгород, ул.Челюскинцев, д.107, кв.917",
                                    "Residents": "5",
                                    "FullArea": "19.17",
                                    "DateUpdate": "2022-11-03T15:36:43.76",
                                    "Stove": "тип плиты не указан",
                                    "Status": "Действует",
                                    "AbonentName": "Марина",
                                    "FirstName": "Тестовая",
                                    "Patronimic": "Сергеевна",
                                    "DivisionID": "9bad477b-26ee-11dc-8782-000423d10000"
                                },
                                {
                                    "ID": "4d21e098-fe41-11e6-80ce-002481f90000",
                                    "No": "ЕТСОО200763",
                                    "Adress": "Иркутск, ул.Бородина, д.79б, кв.17а",
                                    "Residents": "1",
                                    "FullArea": "19.60",
                                    "DateUpdate": "2022-07-08T11:50:24.923",
                                    "Stove": "тип плиты не указан",
                                    "Status": "Действует",
                                    "AbonentName": "Анна",
                                    "FirstName": "Перетест",
                                    "Patronimic": "Михайловна",
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
    // сохраняем в стор ключ - номер лиц счета, знач - ид лиц счета
    const contractIdMap = contractsInfo.reduce((acc, cur) => {
        acc[cur.No] = cur.ID
        return acc
    }, {})

    await agentStorage.dialogStorage.set(
        CONTRACTS_KEY,
        JSON.stringify(contractIdMap)
    )
    return { contracts: (contractsInfo ?? []).map(info => info.No), contractIdMap } // возвращаем номер лицевого счета
}

const getContractsInfoByContract = async (contractNumber) => {
    const requestBody = {
        "@": {
            "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
            "xmlns:tem": "http://tempuri.org/",
        },
        "soap:Header": "",
        "soap:Body": {
            "tem:FindAllByContractNumber": {
                "tem:contractNumberDigits": Number(contractNumber)
            }
        }
    }

    const xmlData = parseJsonToXml("soapenv:Envelope", requestBody)
    logger.info(`Created xml data: ${JSON.stringify(xmlData)}`)
    const xmlResponse = await sendRequest(xmlData)
    logger.info(`Got xml response: ${JSON.stringify(xmlResponse ?? {})}`)

    return xmlResponse ? await extractInfoFromResponse(xmlResponse) : { contracts: [], contractIdMap: {} }
}

/**
1 – ЭЭ
2 – ГВС
4 – ХВС
21 – Отопление
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
                                "MDInstallationLocation": "Кухня",
                                "MDNextVerificationDeadline": "2031-11-24T00:00:00",
                                "MDScales": {
                                    "MDScaleInfo": {
                                        "MDScaleID": "7C46D77E-D2DE-11E9-80C2-9457A553D5EB",
                                        "MDScaleName": "м3",
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
                                "MDInstallationLocation": "Санузел",
                                "MDNextVerificationDeadline": "2031-11-24T00:00:00",
                                "MDScales": {
                                    "MDScaleInfo": {
                                        "MDScaleID": "A1E01E62-D2DE-11E9-80C2-9457A553D5EB",
                                        "MDScaleName": "м3",
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
    return mdInfo[0]
}

// получаем данные счетчиков по лицевому счету
const getMDInfo = async (contractId, nomenclatureCode) => {
    const requestBody = {
        "@": {
            "xmlns:soap": "http://www.w3.org/2003/05/soap-envelope",
            "xmlns:tem": "http://tempuri.org/",
        },
        "soap:Header": "",
        "soap:Body": {
            "tem:GetMDInfo_By_ContractIDAndNomenclatureCode": {
                "tem:ContractStrGUID": contractId,
                "tem:NomenclatureCode": nomenclatureCode
            }
        }
    }

    const xmlData = parseJsonToXml("soapenv:Envelope", requestBody)
    logger.info(`Created xml data: ${JSON.stringify(xmlData)}`)
    const xmlResponse = await sendRequest(xmlData)
    logger.info(`Got xml response: ${JSON.stringify(xmlResponse ?? {})}`)

    if (getDebug()) {
        return {
            "MDSerialNumber": "007",
            "MDInstallationLocation": "Санузел",
            "MDNextVerificationDeadline": "2031-11-24T00:00:00",
            "MDScales": {
                "MDScaleInfo": {
                    "MDScaleID": "A1E01E62-D2DE-11E9-80C2-9457A553D5EB",
                    "MDScaleName": "м3",
                    "MDSDigitsAfterDot": "3",
                    "LastReadings": "40",
                    "LastReadingsDate": "2025-12-20T14:21:06.77",
                    "ReadingsExist": "true",
                    "MaxAcceptableNewMDReadingValue": "140"
                }
            }
        }
    }

    return xmlResponse ? await extractMdInfoFromResponse(xmlResponse) : []
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
                if (cur.status === "fulfilled") {
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
            "MDInstallationLocation": "Кухня",
            "MDNextVerificationDeadline": "2031-11-24T00:00:00",
            "MDScales": {
                "MDScaleInfo": {
                    "MDScaleID": "7C46D77E-D2DE-11E9-80C2-9457A553D5EB",
                    "MDScaleName": "м3",
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
        const scaleInfo = mdsInfo[nom].MDScales?.MDScaleInfo

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
        let contractNumber = getSlotValueById(NUMBER_SLOT_ID)
        logger.info(`Got contract number ${contractNumber}`)

        if (getDebug()) {
            contractNumber = "11189"
        }

        if (!contractNumber) {
            logger.info(`Contract number not found`)
            return [routingToOperatorAnswer]
        }

        const { contracts, contractIdMap } = await getContractsInfoByContract(contractNumber) // получили список лицевых счетов

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
            agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${NEXT_ARTICLE}"`, undefined, undefined, slots)
        ]
    }

    const mdsInfo = await getMDSInfo(Object.values(storedContracts)[contractsPagination.current - 1])
    logger.info(`Got mdsInfo ${JSON.stringify(mdsInfo)}`)
    const slots = getSlots(mdsInfo, Object.keys(storedContracts)[contractsPagination.current - 1])
    logger.info(`Filled slots: ${JSON.stringify(slots)}`)

    await agentStorage.dialogStorage.set(CONTRACTS_PAGINATION_KEY, JSON.stringify(contractsPagination))

    return [
        agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${NEXT_ARTICLE}"`, undefined, undefined, slots)
    ]
}

main()
    .then(res => resolve(res))
    .catch(err => {
        logger.error({ stack: err.stack }, `Some error when main execute ${err}`)
        resolve([routingToOperatorAnswer])
    })
