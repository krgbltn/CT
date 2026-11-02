// SOAP-модуль readings-soap-module должен быть подключен перед этим скриптом.
// Очередь и результаты принадлежат этому агенту в пределах текущего диалога.
const RC_KEY = "readings_controller"
// Контракт со сценарием: настройки могут переопределить фактические ID слотов.
const RC_DEFAULT_SLOTS = {
	accountId: "account_id", contract: "account_number", address: "account_address",
	authSuccess: "successful_identification", addressSuccess: "address_success",
	service: "current_service", meterNumber: "current_meter_number",
	meterNumberShort: "current_meter_number_short", meterLocation: "current_meter_location",
	scaleName: "current_scale_name", previousReading: "current_previous_reading",
	digitsAfterDot: "current_digits_after_dot", scaleType: "scale_type",
	newReading: "current_new_reading", error: "reading_error", status: "reading_status",
	skip: "skip_service", action: "readings_action", stepId: "readings_step_id",
	sentCount: "readings_sent_count", skippedCount: "readings_skipped_count"
}
const RC_SLOTS = { ...RC_DEFAULT_SLOTS, ...agentSettings.slots }
// Чтение входных слотов и обязательных скалярных полей без подстановки нулей.
const rcSlot = name => message.slot_context?.filled_slots?.find(slot => slot.slot_id === RC_SLOTS[name])?.value
const rcText = value => typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
const rcRequired = (value, label) => {
	const text = rcText(value)
	if (!text) throw new Error(`Missing ${label}`)
	return text
}

// Диагностика переноса технических слотов. Не выводим ЛС, адрес, телефон и сырой контекст.
// getValue читает входные слоты либо конкретный набор слотов формируемого ответа.
function rcDiagnosticContext(state, getValue = rcSlot) {
	const item = state?.queue?.[state.index]
	const stepId = rcText(getValue("stepId"))
	const expectedStepId = item ? rcStep(state) : ""
	return {
		readingsAction: rcText(getValue("action")), readingStatus: rcText(getValue("status")),
		stepIdSlotId: RC_SLOTS.stepId, readingsStepId: stepId, stepIdPresent: Boolean(stepId),
		expectedStepId, stepIdMatches: Boolean(stepId && stepId === expectedStepId),
		queueIndex: state?.index ?? null, queueLength: state?.queue?.length ?? null,
		currentDigitsAfterDot: rcDecimal(getValue("digitsAfterDot"))?.text ?? null,
		scaleType: rcText(getValue("scaleType")),
		previousReading: rcDecimal(getValue("previousReading"))?.text ?? null,
		expectedDigitsAfterDot: item?.digits ?? null,
		expectedScaleType: item ? (item.digits === 0 ? "true" : "false") : "",
		newReadingPresent: Boolean(rcText(getValue("newReading"))),
		skipService: rcText(getValue("skip"))
	}
}

// Десятичная арифметика над строками: без float, BigInt и новых зависимостей.
// Проверяем число целиком, приводим запятую к точке, сохраняем дробную точность.
function rcDecimal(value) {
	const text = rcText(value).replace(",", ".")
	if (!/^\d+(?:\.\d+)?$/.test(text)) return null
	const [whole, fraction = ""] = text.split(".")
	const integer = whole.replace(/^0+(?=\d)/, "")
	return { integer, fraction, text: integer + (fraction ? `.${fraction}` : "") }
}
// Сравниваем целые части по длине, дробные дополняем нулями до общей разрядности.
function rcCompare(left, right) {
	if (left.integer.length !== right.integer.length) return left.integer.length < right.integer.length ? -1 : 1
	if (left.integer !== right.integer) return left.integer < right.integer ? -1 : 1
	const width = Math.max(left.fraction.length, right.fraction.length)
	const a = left.fraction.padEnd(width, "0")
	const b = right.fraction.padEnd(width, "0")
	return a === b ? 0 : (a < b ? -1 : 1)
}
// Точно вычисляем «предыдущее + допустимый расход», складывая по одной цифре.
function rcAdd(left, right) {
	const width = Math.max(left.fraction.length, right.fraction.length)
	const a = left.integer + left.fraction.padEnd(width, "0")
	const b = right.integer + right.fraction.padEnd(width, "0")
	let carry = 0
	let sum = ""
	for (let i = a.length - 1, j = b.length - 1; i >= 0 || j >= 0 || carry; i--, j--) {
		const digit = (i >= 0 ? Number(a[i]) : 0) + (j >= 0 ? Number(b[j]) : 0) + carry
		sum = String(digit % 10) + sum
		carry = Math.floor(digit / 10)
	}
	sum = sum.padStart(width + 1, "0")
	return rcDecimal(width ? `${sum.slice(0, -width)}.${sum.slice(-width)}` : sum)
}
// Точность шкалы должна быть явно заданным неотрицательным целым числом.
function rcDigits(value) {
	const text = rcRequired(value, "scale precision")
	const digits = Number(text)
	if (!/^\d+$/.test(text) || !Number.isSafeInteger(digits)) throw new Error("Invalid scale precision")
	return digits
}
// Проверяем настройки до HTTP: без маршрутов и корректных слотов прием не начинаем.
function rcCheckConfig() {
	const ids = Object.values(RC_SLOTS)
	if (ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
		throw new Error("Invalid slots mapping")
	}
	if (!/^https?:\/\//.test(agentSettings.url || "") || !Number.isSafeInteger(agentSettings.timeoutMs)
		|| agentSettings.timeoutMs <= 0) throw new Error("Configure SOAP URL and positive timeoutMs")
	if (!rcDecimal(agentSettings.maxConsumption)) throw new Error("Invalid maxConsumption")
	if (!Array.isArray(agentSettings.services) || !agentSettings.services.length) throw new Error("Missing services")
	for (const service of agentSettings.services) {
		rcRequired(service.code, "service code")
		rcRequired(service.name, "service name")
	}
	for (const id of [agentSettings.aiAgent, ...["input", "correction", "error", "finish"].map(key => agentSettings.articles?.[key])]) {
		if (!rcRouteId(id)) throw new Error("Configure aiAgent and all articles")
	}
}
// ID агента/статьи не должен менять структуру команды перехода.
const rcRouteId = value => typeof value === "string" && value.trim() && !/[\s"<>]/.test(value)
// Ошибка записи состояния останавливает переход: иначе возможна повторная отправка.
async function rcSave(state) {
	if (await agentStorage.dialogStorage.set(RC_KEY, JSON.stringify(state)) !== true) {
		throw new Error("Failed to save readings state")
	}
}
// Поврежденное сохраненное состояние ведет в техническую статью, без восстановления догадками.
function rcValidateState(state) {
	if (!state || state.version !== 1 || !state.account?.id || !Array.isArray(state.queue)
		|| !Array.isArray(state.initIds) || !Number.isSafeInteger(state.index) || state.index < 0
		|| state.index > state.queue.length || !Number.isSafeInteger(state.revision) || state.revision < 0
		|| typeof state.cycleId !== "string" || !state.cycleId || !state.initIds.includes(state.cycleId)
		|| state.initIds.some(id => typeof id !== "string" || !id)
		|| !rcDecimal(state.maxConsumption)) throw new Error("Invalid readings state")
	for (const key of ["id", "number", "address"]) {
		if (typeof state.account[key] !== "string" || !state.account[key].trim()) throw new Error("Invalid saved account")
	}
	const ids = new Set()
	for (const item of state.queue) {
		if (!item || ["id", "meterKey", "number", "name", "service"].some(key => typeof item[key] !== "string" || !item[key].trim())
			|| !rcDecimal(item.previous) || !rcDecimal(item.maximum)
			|| !Number.isSafeInteger(item.digits) || item.digits < 0
			|| typeof item.value !== "string" || !["", "1", "2", "3", "4"].includes(item.error)
			|| !["pending", "sending", "sent", "skipped", "failed", "unknown"].includes(item.status)) {
			throw new Error("Invalid saved scale")
		}
		if (ids.has(item.id)) throw new Error("Duplicate saved scale")
		ids.add(item.id)
		if (["sending", "sent", "failed", "unknown"].includes(item.status) && (!rcDecimal(item.value) || item.error)) {
			throw new Error("Invalid saved submission")
		}
	}
	if (state.queue.slice(0, state.index).some(item => !["sent", "skipped"].includes(item.status))) {
		throw new Error("Invalid saved position")
	}
	return state
}
// Цикл, позиция и версия ввода отличают текущий ответ от повторной доставки старого.
const rcStep = state => `${state.cycleId}:${state.index}:${state.revision}`
// Явно формируем весь набор слотов: чужие переменные сценария не переносим.
function rcOutput(state) {
	const slots = Object.fromEntries(Object.values(RC_SLOTS).map(id => [id, ""]))
	const set = (key, value) => { slots[RC_SLOTS[key]] = String(value ?? "") }
	const account = state?.account || {
		id: rcText(rcSlot("accountId")), number: rcText(rcSlot("contract")),
		address: rcText(rcSlot("address")), addressSuccess: rcText(rcSlot("addressSuccess"))
	}
	set("accountId", account.id)
	set("contract", account.number)
	set("address", account.address)
	set("authSuccess", account.id ? "true" : "false")
	set("addressSuccess", account.addressSuccess)
	if (!state) return slots
	set("sentCount", state.queue.filter(item => item.status === "sent").length)
	set("skippedCount", state.queue.filter(item => item.status === "skipped").length)
	const item = state.queue[state.index]
	if (!item) return slots
	set("service", item.service)
	set("meterNumber", item.number)
	set("meterNumberShort", item.number.slice(-3))
	set("meterLocation", item.location)
	set("scaleName", item.name)
	set("previousReading", item.previous)
	set("digitsAfterDot", item.digits)
	set("scaleType", item.digits === 0 ? "true" : "false")
	set("newReading", item.value)
	set("error", item.error)
	set("stepId", rcStep(state))
	// accepted доступен только для шкалы, успех которой уже сохранен.
	if (item.status === "pending") set("status", item.error ? "invalid" : "ready")
	if (item.status === "sent") set("status", "accepted")
	return slots
}
// Открываем статью с заполненными слотами; при неполных настройках используем резервный маршрут.
function rcReply(article, state, technical = false) {
	const slots = rcOutput(state)
	if (technical) slots[RC_SLOTS.status] = ""
	logger.info({ ...rcDiagnosticContext(state, key => slots[RC_SLOTS[key]]), technical }, "Readings controller output")
	if (rcRouteId(agentSettings.aiAgent) && rcRouteId(article)) {
		return [agentApi.makeTextReply(`/switchredirect ${agentSettings.aiAgent} intent_id="${article}"`, undefined, undefined, slots)]
	}
	if (rcRouteId(agentSettings.routingAgent)) {
		return [agentApi.makeTextReply(`/switchredirect ${agentSettings.routingAgent}`, undefined, undefined, slots)]
	}
	return [agentApi.makeTextReply("Не удалось продолжить прием показаний. Обратитесь к оператору.", undefined, undefined, slots)]
}
// Выбираем статью по сохраненному состоянию, не продвигая очередь и не вызывая API.
function rcRender(state) {
	const item = state.queue[state.index]
	if (!item) return rcReply(agentSettings.articles.finish, state)
	if (["sending", "unknown", "failed"].includes(item.status)) return rcReply(agentSettings.articles.error, state, true)
	if (item.status === "skipped") throw new Error("Current scale was already skipped")
	return rcReply(agentSettings.articles[item.error ? "correction" : "input"], state)
}
// Получаем услуги параллельно, но собираем очередь в заданном настройками порядке.
async function rcQueue(accountId) {
	const results = await Promise.all(agentSettings.services.map(service => readingsSoap.getMeters(accountId, service.code)))
	const seen = new Set()
	const queue = []
	results.forEach((meters, serviceIndex) => {
		logger.info({ serviceIndex, serviceCode: rcText(agentSettings.services[serviceIndex].code), meterCount: meters.length }, "Readings meters received")
	})
	results.forEach((meters, serviceIndex) => meters.forEach((meter, meterIndex) => {
		logger.info({ serviceIndex, meterIndex, meterNumberShort: rcText(meter.number).slice(-3), scaleCount: meter.scales.length }, "Readings meter received")
		if (!meter.scales.length) throw new Error("Meter has no scales")
		const number = rcRequired(meter.number, "meter number")
		for (const [scaleIndex, scale] of meter.scales.entries()) {
			const id = rcRequired(scale.id, "scale ID").toLowerCase()
			// Только числовые поля и позиции; без полного номера, ID шкалы, названия и места установки.
			const precision = rcText(scale.digits)
			logger.info({
				serviceIndex, meterIndex, scaleIndex, meterNumberShort: rcText(meter.number).slice(-3),
				apiPreviousReading: rcDecimal(scale.previous)?.text ?? null,
				apiDigitsAfterDot: /^\d+$/.test(precision) ? precision : null,
				apiMaximum: rcDecimal(scale.maximum)?.text ?? null, duplicateScale: seen.has(id)
			}, "Readings scale received")
			// Повторы шкал оставляют данные первой услуги; приборы группируются по исходному MDInfo.
			if (seen.has(id)) continue
			const previous = rcDecimal(scale.previous)
			const maximum = rcDecimal(scale.maximum)
			if (!previous || !maximum || rcCompare(maximum, previous) < 0) throw new Error("Invalid scale bounds")
			queue.push({
				id, meterKey: `${serviceIndex}:${meterIndex}`, number, location: rcText(meter.location),
				service: rcRequired(agentSettings.services[serviceIndex].name, "service name"),
				name: rcRequired(scale.name, "scale name"), previous: previous.text,
				maximum: maximum.text, digits: rcDigits(scale.digits), status: "pending", value: "", error: ""
			})
			seen.add(id)
		}
	}))
	logger.info({ serviceCount: results.length, queueLength: queue.length }, "Readings queue built")
	return queue
}
// Возвращаем только код ошибки. Вопросы, исправления и число попыток остаются в сценарии.
function rcValueError(item, value, maxConsumption) {
	const parsed = rcDecimal(value)
	if (!parsed) return "3"
	if (parsed.fraction.length > item.digits) return "4"
	if (rcCompare(parsed, rcDecimal(item.previous)) < 0) return "1"
	if (rcCompare(parsed, rcAdd(rcDecimal(item.previous), rcDecimal(maxConsumption))) > 0
		|| rcCompare(parsed, rcDecimal(item.maximum)) > 0) return "2"
	return ""
}
// После успеха или пропуска переходим к следующей непропущенной шкале и меняем ID шага.
async function rcAdvance(state) {
	do { state.index++ } while (state.queue[state.index]?.status === "skipped")
	state.revision++
	await rcSave(state)
	return rcRender(state)
}
async function rcRun() {
	// Системные события и статусы доставки не должны инициировать HTTP-отправку.
	if (![0, 1].includes(message.message_type)) return [agentApi.makeAckReply()]
	let state
	try {
		rcCheckConfig()
		// Каждый вызов загружает состояние заново: память между запусками не используется.
		const stored = await agentStorage.dialogStorage.get(RC_KEY)
		if (stored !== undefined && stored !== null && stored !== "") {
			state = rcValidateState(typeof stored === "string" ? JSON.parse(stored) : stored)
		}
		logger.info(rcDiagnosticContext(state), "Readings controller input")
		const action = rcText(rcSlot("action"))
		if (action === "init") {
			// Повтор одного init восстанавливает цикл; новый message.id начинает новый поиск шкал.
			const initId = rcRequired(message.id, "init message ID")
			if (state?.initIds.includes(initId)) return rcRender(state)
			const account = {
				id: rcRequired(rcSlot("accountId"), "account ID"),
				number: rcRequired(rcSlot("contract"), "account number"),
				address: rcRequired(rcSlot("address"), "account address"),
				addressSuccess: rcText(rcSlot("addressSuccess"))
			}
			state = {
				version: 1, account, queue: [], index: 0, revision: 0, cycleId: initId,
				initIds: [...(state?.initIds || []), initId], maxConsumption: rcDecimal(agentSettings.maxConsumption).text
			}
			state.queue = await rcQueue(account.id)
			await rcSave(state)
			return rcRender(state)
		}
		// Для продолжения обязательны выбранный ЛС и актуальный ID шага.
		if (!state) throw new Error("Initialize readings first")
		if (!["process", "next"].includes(action)) throw new Error("Invalid readings action")
		if (rcText(rcSlot("accountId")) !== state.account.id) throw new Error("Account does not match current cycle")
		const step = rcRequired(rcSlot("stepId"), "step ID")
		if (step !== rcStep(state)) return rcRender(state)
		const item = state.queue[state.index]
		if (!item) return rcRender(state)
		if (["sending", "failed", "unknown"].includes(item.status)) return rcRender(state)
		if (action === "next") {
			// Сценарий уже озвучил успех: только теперь разрешено заменить слоты следующей шкалой.
			if (item.status !== "sent") throw new Error("Cannot advance before successful submission")
			return await rcAdvance(state)
		}
		// Повтор подтвержденной отправки возвращает успех без нового POST.
		if (item.status === "sent") return rcRender(state)
		if (rcSlot("skip") === "true") {
			// Пропуск приоритетнее значения; ранее переданные шкалы прибора не меняем.
			for (const remaining of state.queue) {
				if (remaining.meterKey === item.meterKey && remaining.status === "pending") {
					remaining.status = "skipped"
					remaining.value = ""
					remaining.error = ""
				}
			}
			return await rcAdvance(state)
		}
		// Склеиваем цифры, разделенные пробельными символами при распознавании речи.
		item.value = rcText(rcSlot("newReading")).replace(/\s+/g, "")
		// Обрезаем только новый ввод до точности шкалы, без округления и float.
		const parsed = rcDecimal(item.value)
		if (parsed && parsed.fraction.length > item.digits) {
			const fraction = parsed.fraction.slice(0, item.digits)
			item.value = parsed.integer + (fraction ? `.${fraction}` : "")
		}
		item.error = rcValueError(item, item.value, state.maxConsumption)
		if (item.error) {
			// Остаемся на той же шкале; новый ID отделяет исправление от прежнего ввода.
			state.revision++
			await rcSave(state)
			return rcRender(state)
		}
		// Запись sending выполняется до POST, чтобы прерванный вызов нельзя было слепо повторить.
		item.value = rcDecimal(item.value).text
		item.status = "sending"
		await rcSave(state)
		try {
			await readingsSoap.sendReading(item.id, item.value)
		} catch (error) {
			// Явный отказ отделяем от тайм-аута или ответа, результат которого неизвестен.
			item.status = error.submissionStatus === "failed" ? "failed" : "unknown"
			await rcSave(state)
			throw error
		}
		// Успех сначала сохраняем, затем передаем сценарию данные именно отправленной шкалы.
		item.status = "sent"
		try {
			await rcSave(state)
		} catch (error) {
			// В хранилище осталось sending: успех нельзя объявлять до сохранения.
			item.status = "unknown"
			throw error
		}
		return rcRender(state)
	} catch (error) {
		// Техническая ошибка не маскируется под неверный ввод и не запускает автоматический повтор.
		logger.error({ ...rcDiagnosticContext(state), stack: error.stack }, "Readings controller failed")
		return rcReply(agentSettings.articles?.error, state, true)
	}
}

// Любой путь завершает вызов платформы; последний catch страхует ошибку формирования ответа.
rcRun()
	.then(result => resolve(result))
	.catch(error => {
		logger.error({ stack: error.stack }, "Readings controller fallback")
		resolve([agentApi.makeAckReply()])
	})
