const FILE_STORAGE_API = agentSettings.fileStorageApi
const INTERNAL_API = agentSettings.internalApi
const FILE_NAME = `${agentSettings.fileName ?? "Без названия"}.xlsx`
const CHANNELS_IDS = agentSettings.channelIds

const AUTHOR = {
	BOT: "assistant",
	OPERATOR: "operator",
	USER: "user"
}

const SUPPORTED_MESSAGE_TYPES = [ 1 ]

const EXEL_HEADERS = {
	id: "ID диалога",
	omniUserId: "OmniUserId",
	channelId: "ID Канала",
	messages: "История диалога",
	requestMessage: "Последняя фраза пользователя",
	llmResult: "Ответ ЛЛМ"
}

const REPORT_STATUSES = {
	DONE: "done",
	ERROR: "error",
	PROGRESS: "progress"
}

const REPORT_PREFIX = "DIALOG_LLM_ANALYSIS"

const METHODS = {
	CREATE_REPORT: "create",
	GET_REPORTS: "get",
	GET_CHANNELS_IDS: "get_channels_ids"
}

const AGENT = new https.Agent({ rejectUnauthorized: false })

function successResponse(data) {
	return {
		success: true,
		data
	}
}

function errorResponse(errorMessage) {
	return {
		success: false,
		error: errorMessage
	}
}

main()
	.then(response => {
		resolve(
			successResponse(response)
		)
	})
	.catch(error => {
		logger.error(`Error when executing main function. ${error}. Stack: ${error.stack}`)
		resolve(
			errorResponse(error)
		)
	})

async function main() {
	const { method, projectId, dialogs, data = {} } = message

	const {
		id,
		dateRange,
		agent,
		dialogsCountLimit,
		mask
	} = data

	switch (method) {
		case METHODS.CREATE_REPORT:
			return await createReport(id, dateRange, projectId, dialogsCountLimit, agent, mask, dialogs)
		case METHODS.GET_REPORTS:
			return await getReports()
		case METHODS.GET_CHANNELS_IDS:
			return CHANNELS_IDS
		default:
			logger.warn(`Unknown method ${method}. Return`)
			return {}
	}
}

async function createReport(id, dateRange, projectId, dialogsCountLimit, agent, mask, dialogs) {
	const reportInfo = createReportInfo(id, REPORT_STATUSES.PROGRESS, dateRange, agent, mask, dialogsCountLimit)
	await saveReportToStorage(reportInfo, projectId)

	logger.info(`Dialogs count: ${dialogs.length}`)

	const dialogsInfo = await extractDialogInfo(dialogs, projectId, agent, mask.toLowerCase())

	logger.info(`Dialogs info count: ${dialogsInfo.length}`)
	if (dialogsInfo.length < 1) {
		logger.error(`Not found dialogs with LLM`)
		await updateReportRecord(REPORT_STATUSES.ERROR, "", id, projectId)
		return {}
	}

	logger.info(`Dialogs info first: ${JSON.stringify(dialogsInfo[0])}`)
	const dialogsInfoInExelFormat = transformDialogsInfoToExelFormat(dialogsInfo)

	const exelFile = saveToExelFormat(dialogsInfoInExelFormat)
	const fileLink = await uploadFileToStorage(exelFile)

	if (!fileLink) {
		logger.error(`Error while generate file link`)
		await updateReportRecord(REPORT_STATUSES.ERROR, "", id, projectId)
		return {}
	}

	await updateReportRecord(REPORT_STATUSES.DONE, fileLink, id, projectId)
	return {}
}

function createReportInfo(id, status, dateRange, agent, mask = "-", dialogCount, link = "") {
	return {
		id: id,
		status: status,
		dateRange: dateRange,
		createdAt: new Date().getTime(),
		agent: agent,
		dialogCount: dialogCount,
		mask: mask,
		link: link
	}
}

async function saveReportToStorage(report, projectId) {
	try {
		const reportTags = {
			keyword_fields: [
				{ key: "type", value: REPORT_PREFIX },
				{ key: "id", value: report.id },
				{ key: "project_id", value: projectId },
			]
		}

		await agentStorage.agentStorage.set(getReportStoreKey(report.id, projectId), report, reportTags)
	} catch (error) {
		logger.error(`Error while saving report: ${error}`)
	}
}

function getReportStoreKey(id, projectId) {
	return `${REPORT_PREFIX}-${projectId}-${id}`
}

const OPERATOR_REQUEST_SET = new Set([
	"оператор",
	"позови оператора", "позови человека", "пригласи оператора", "нужен оператор", "соедини с оператором",
	"специалист", "позови специалиста", "пригласи специалиста", "нужен специалист", "соедини со специалистом",
	"свяжите со специалистом", "свяжите с человеком", "свяжите с оператором",
	"переключите на оператора", "переключи на оператора", "переключите на специалиста", "переключи на специалиста",
	"переключите на человека", "переключи на человека",
	"связаться с оператором", "связаться со специалистом", "связаться с человеком",
	"не виртуальный есть", "нужен не виртуальный", "нужен невиртуальный",
	"переключи на поддержку", "связаться с поддержкой", "пригласи поддержку", "пригласи оператора поддержки",
	"связаться с подержкой",
	"можно пообщаться с человеком", "можно мне поговорить с человеком", "поговорить с поддержкой",
	"пообщаться с человеком", "поговорить с человеком", "позовите живых людей",
	"переведите на оператора", "переведите меня на оператора", "меня переведите на оператора",
	"можно пообщаться с оператором", "пообщаться с оператором",
	"перевод на оператора", "переведи на оператора",
	"с человеком можно поговорить",
	"бот подключите живого человека", "мне нужен консультант", "нужен консультант", "нужен консультант мне",
	"нужен оператор для выяснения обстоятельств", "мне нужен оператор для выяснения",
	"как написать оператору", "хочу поговорить с живым человеком", "бот меня не понимает",
	"переведите на опертора", "переведите на",
	"оаератор", "мой вопрос не решен", "не решен", "покажите человеку",
	"мне нечего уточнять", "дайте ответ по существу", "связь с техподдержкой",
	"я общался с менеджером нужно продолжить с ним общаться", "хочу продолжить беседу",
	"продолжить беседу с менеджером", "оператор живой есть", "прошу связать меня с оператором",
	"связать меня с оператором", "связаться с оператором",
	"операторр", "оппераор", "опаератор",
	"можно связать с оператором", "связь с оператором", "вызвать оператора",
	"переведите меня на специалиста", "соединить с оператором срочно",
	"уже сутки жду соединения с оператором", "уже сутки жду ответ оператора",
	"соединить с оператором", "вопрос не решен", "ответ не получен"
])

const DONT_ANSWER_SET = new Set([
	"я пока не знаю ответ на этот вопрос переключить вас на оператора",
	"не совсем понял ваш вопрос сформулируйте пожалуйста его иначе",
	"ой не совсем понял ваш вопрос сформулируйте пожалуйста его иначе"
])

function isOperatorRequest(text) {
	if (!text || typeof text !== 'string') return false
	const normalized = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').trim()
	return OPERATOR_REQUEST_SET.has(normalized)
}

function isDontKnowAnswerRequest(text) {
	if (!text || typeof text !== 'string') return false
	const normalized = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
	return DONT_ANSWER_SET.has(normalized)
}

function extractLastClientMessageAndTrimmedHistory(transformedMessages) {
	// Закомментировал, т.к. может потом понадобится эта логика
	// let lastUserIndexBeforeOperator = -1
	let lastUserIndexUserMessage = -1
	let isDontKnowAnswer = false

	// Ищем последнее сообщение пользователя ДО первого запроса на оператора
	for (let i = 0; i < transformedMessages.length; i++) {
		const msg = transformedMessages[i]
		// if (msg.role === AUTHOR.USER) {
		//     if (isOperatorRequest(msg.message)) {
		//         break // Нашли запрос на оператора — выходим
		//     } else {
		//         lastUserIndexBeforeOperator = i
		//     }
		// }
		if (msg.role === AUTHOR.USER) {
			lastUserIndexUserMessage = i
		} else if (msg.role === AUTHOR.BOT && isDontKnowAnswerRequest(msg.message)) {
			isDontKnowAnswer = true
			break // Нашли триггер фразу — выходим
		}
	}

	// Если нет ни одного сообщения пользователя до оператора
	// if (lastUserIndexBeforeOperator === -1) {
	//     return {
	//         lastClientMessage: "",
	//         trimmedMessages: []
	//     }
	// }

	// Если нет ни одного сообщения пользователя, когда бот выдал фразу о том, что не знает ответ
	if (lastUserIndexUserMessage === -1 || !isDontKnowAnswer) {
		return {
			lastClientMessage: "",
			trimmedMessages: []
		}
	}

	// Обрезаем массив ДО последнего валидного сообщения пользователя (включительно)
	// const trimmedMessages = transformedMessages.slice(0, lastUserIndexBeforeOperator + 1)
	// const lastClientMessage = transformedMessages[lastUserIndexBeforeOperator].message
	const trimmedMessages = transformedMessages.slice(0, lastUserIndexUserMessage + 1)
	const lastClientMessage = transformedMessages[lastUserIndexUserMessage].message

	return { lastClientMessage, trimmedMessages }
}

async function extractDialogInfo(dialogs, projectId, agent) {
	const dialogsInfo = []

	for (const messages of dialogs) {
		const transformedMessages = transformMessagesToTextAuthorStruct(messages)
		const { filledSlots, OmniUserId, DialogID, ChannelId } = messages[0]

		const { lastClientMessage, trimmedMessages } = extractLastClientMessageAndTrimmedHistory(transformedMessages)
		if (!lastClientMessage) {
			continue
		}

		const agentRate = await sendGPTAgentMessage(lastClientMessage, agent, OmniUserId, filledSlots, trimmedMessages, DialogID, projectId)
		// logger.error(`Agent rate: ${JSON.stringify(agentRate)}`)
		if (!agentRate?.answer) {
			// При таймауте эндпоинт /workplace возвращает {}
			logger.error("Unable to receive a response from the GPT. Might be a timeout")
		}
		// Форматируем историю как текст с новой строкой
		const formattedHistory = trimmedMessages
			.map(m => `role: ${m.role}, message: ${m.message}`)
			.join('\n')

		dialogsInfo.push({
			id: DialogID,
			omniUserId: OmniUserId,
			channelId: ChannelId,
			messages: formattedHistory,
			requestMessage: lastClientMessage.trim(),
			llmResult: agentRate?.answer
		})
	}

	return dialogsInfo
}

function isSystemOperator(operator) {
	return operator === "System System"
}

function transformMessagesToTextAuthorStruct(messages) {
	return messages.reduce((transformedMessages, message) => {
		if (message.Text && SUPPORTED_MESSAGE_TYPES.includes(message.MsgType)) {
			let author = ""

			if (!message.OperatorName) {
				author = AUTHOR.USER
			} else if (message.OperatorName) {
				if (isSystemOperator(message.OperatorName)) {
					author = AUTHOR.BOT
				} else {
					// Нужно тут выставить бота, вместо оператора(т.к. ллм не съедает историю), если на историю в отчете все равно.
					// В скрипте ллм(гпт-47 или гпт рупост) происходит замена оператора на BOT для ЛЛМ. Если потребуется, можно убрать и опираться на эту строку(отчет)
					author = AUTHOR.OPERATOR
				}
			}

			if (author) {
				transformedMessages.push({
					message: message.Text,
					role: author
				})
			}
		}

		return transformedMessages
	}, [])
}

async function sendGPTAgentMessage(text, agent, omni_user_id, slots, history, dialog_id, projectId) {
	try {
		const url = `${INTERNAL_API.agentAddress}/${projectId}/${agent}`
		const head = {
			headers: {
				'Content-Type': 'application/json'
			},
			httpsAgent: AGENT,
			timeout: INTERNAL_API.agentTimeout,
		}
		const data = {
			"id": uuid.v4(),
			"message_type": 1,
			"user": {
				"omni_user_id": omni_user_id,
				"customer_id": projectId
			},
			"message": {
				"text": text
			},
			"slot_context": {
				"filled_slots": slots
			},
			"meta": {
				"isQueryReport": true,
				"history": history,
				"dialog_id": dialog_id
			}
		}

		const response = await axios.post(url, data, head)
		return response.data
	} catch (error) {
		logger.error(`Error getLlmRate ${error}`)
		return ""
	}
}

function transformDialogsInfoToExelFormat(dialogsInfo) {
	return dialogsInfo.map(dialogInfo => {
		return Object.entries(dialogInfo).reduce((dialogInfoExelFormat, [key, value]) => {
			const header = EXEL_HEADERS[key]
			if (header) {
				dialogInfoExelFormat[header] = value
			}

			return dialogInfoExelFormat
		}, {})
	})
}

function saveToExelFormat(data) {
	try {
		logger.info(`Excel data: ${JSON.stringify(data)}`)
		const worksheet = XLSX.utils.json_to_sheet(data)
		const workbook = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(workbook, worksheet, "Report")

		const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
		const excelBase64 = excelBuffer.toString("base64")

		logger.info("Excel file has been generated and converted to base64.")
		return excelBase64
	} catch (error) {
		logger.error(`Error while converting JSON to Excel: ${error}`)
		return ""
	}
}

async function uploadFileToStorage(base64String) {
	try {
		logger.info(`Uploading file ${FILE_NAME}`)
		const fileLinkResponse = await axios.post(
			new URL(FILE_STORAGE_API.uploadB64, FILE_STORAGE_API.baseAddress).href,
			{
				fileName: FILE_NAME,
				fileB64: base64String
			}
		)
		logger.info(`Response after upload ${fileLinkResponse.data}`)
		return fileLinkResponse.data ?? ""
	} catch (error) {
		logger.error(`Error while uploading file to Storage: ${error}`)
		return ""
	}
}

async function updateReportRecord(status, link, id, projectId) {
	try {
		const report = await agentStorage.agentStorage.get(getReportStoreKey(id, projectId))

		if (!report) {
			logger.error(`No report found`)
			return
		}

		report.status = status
		report.link = link

		await saveReportToStorage(report, projectId)
	} catch (error) {
		logger.error(`Error while updating report: ${error}`)
	}
}

async function getReports() {
	const query = {
		"bool": {
			"must": [
				{
					"keyword_fields.type": {
						"term": {
							"value": REPORT_PREFIX
						}
					}
				}
			]
		}
	}

	const reports = await agentApi.searchAll(agentStorage.agentStorage, query)
	if (!reports) {
		logger.info(`No reports found`)
		return []
	}

	return reports.sort((a, b) => b.createdAt - a.createdAt)
}