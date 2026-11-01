// Подключаемый JS-модуль: функции из агентов идентификации и submit-readings.
// Не вызывать отдельно: модуль выполняется в контексте readings-controller.
const readingsSoap = (() => {
	// Ищем XML-поля по локальному имени: префиксы soap/env/api могут различаться.
	const localName = name => name.split(":").pop()
	const child = (node, name) => {
		if (!node || typeof node !== "object" || Array.isArray(node)) return undefined
		const key = Object.keys(node).find(key => localName(key) === name)
		return key === undefined ? undefined : node[key]
	}
	const object = value => value && typeof value === "object" && !Array.isArray(value)
	// Метка ошибки позволяет контроллеру отличить явный отказ от неизвестного результата.
	const failure = (text, submissionStatus) => Object.assign(new Error(text), { submissionStatus })

	// Сохраняем значения XML строками; одиночные узлы xml2js не оборачивает в массив.
	function parseXml(xml) {
		const parser = new xml2js.Parser({ explicitArray: false, trim: true })
		return new Promise((resolve, reject) => {
			parser.parseString(xml, (error, result) => error ? reject(error) : resolve(result))
		})
	}

	// Общий SOAP-конверт для чтения приборов и записи одной шкалы; экранирование делает генератор.
	function createXml(method, parameters) {
		const body = Object.fromEntries(Object.entries(parameters).map(([name, value]) => [`tem:${name}`, value]))
		return js2xmlparser.parse("soapenv:Envelope", {
			"@": {
				"xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
				"xmlns:tem": "http://tempuri.org/"
			},
			"soapenv:Header": "",
			"soapenv:Body": { [`tem:${method}`]: body }
		})
	}

	// Выполняем один HTTP-запрос с тайм-аутом. Повторных попыток внутри модуля нет.
	async function request(method, parameters) {
		logger.info({ method }, "Readings SOAP request")
		const response = await axios({
			method: "post",
			maxBodyLength: Infinity,
			url: agentSettings.url,
			timeout: agentSettings.timeoutMs,
			headers: {
				"Content-Type": "text/xml; charset=utf-8",
				"SOAPAction": `http://tempuri.org/${method}`
			},
			data: createXml(method, parameters),
			httpsAgent: new https.Agent({ rejectUnauthorized: agentSettings.rejectUnauthorized !== false })
		})
		if (response.status !== 200 || typeof response.data !== "string" || !response.data.trim()) {
			throw failure(`Invalid HTTP response for ${method}`, "unknown")
		}
		// HTTP 200 недостаточно: требуются корректные Body, Response и Result без SOAP Fault.
		const parsed = await parseXml(response.data)
		const body = child(child(parsed, "Envelope"), "Body")
		if (!object(body)) throw failure(`Missing SOAP body for ${method}`, "unknown")
		if (child(body, "Fault") !== undefined) throw failure(`SOAP Fault for ${method}`, "failed")
		const result = child(child(body, `${method}Response`), `${method}Result`)
		if (result === undefined || result === null) throw failure(`Missing SOAP result for ${method}`, "unknown")
		return result
	}

	// Получаем все приборы услуги и приводим одиночные приборы/шкалы к массивам.
	async function getMeters(accountId, serviceCode) {
		const result = await request("GetMDInfo_By_ContractIDAndNomenclatureCode", {
			ContractStrGUID: accountId,
			NomenclatureCode: serviceCode
		})
		if (result === "") return []
		if (!object(result)) throw new Error("Invalid meters result")
		const meters = child(result, "MDInfo")
		if (meters === undefined) {
			// Пустая коллекция допустима; неизвестную структуру ответа не считаем отсутствием ПУ.
			if (Object.keys(result).some(key => key !== "$")) throw new Error("Invalid meters collection")
			return []
		}
		return (Array.isArray(meters) ? meters : [meters]).map(meter => {
			if (!object(meter)) throw new Error("Invalid meter")
			const scales = child(child(meter, "MDScales"), "MDScaleInfo")
			return {
				number: child(meter, "MDSerialNumber"),
				location: child(meter, "MDInstallationLocation"),
				scales: scales === undefined ? [] : (Array.isArray(scales) ? scales : [scales]).map(scale => {
					if (!object(scale)) throw new Error("Invalid scale")
					// Передаем все шкалы без фильтров единиц измерения и без выбора первой.
					return {
						id: child(scale, "MDScaleID"),
						name: child(scale, "MDScaleName"),
						previous: child(scale, "LastReadings"),
						digits: child(scale, "MDSDigitsAfterDot"),
						maximum: child(scale, "MaxAcceptableNewMDReadingValue")
					}
				})
			}
		})
	}

	// Записываем ровно одну шкалу. Успехом считается только явный результат API 1.
	async function sendReading(scaleId, value) {
		const result = await request("InputOfReadingsWithDot", {
			MDScale_ID: scaleId,
			MDScale_NewReadings: value
		})
		if (typeof result !== "string" || !/^-?\d+$/.test(result.trim())) {
			throw failure("Invalid InputOfReadingsWithDot result", "unknown")
		}
		if (result.trim() !== "1") throw failure("InputOfReadingsWithDot rejected reading", "failed")
		logger.info("Readings SOAP submission accepted")
	}

	// Контроллер получает только функции; самостоятельного запуска и resolve у модуля нет.
	return { getMeters, sendReading }
})()
