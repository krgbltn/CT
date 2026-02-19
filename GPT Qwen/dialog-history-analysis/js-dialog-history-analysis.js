const EXTERNAL_API = agentSettings.externalApi
const LLM_API = agentSettings.llmApi
const CHANNEL_TYPES = agentSettings.channelTypes
const FILE_STORAGE_API = agentSettings.fileStorageApi
const FILE_NAME = `${agentSettings.fileName ?? "Без названия"}.xlsx`
const IS_THINKING = LLM_API.isThinking ?? false
const THINK = " /think"
const NO_THINK = " /no_think"
const AUTH_TYPE = {
	BEARER: "Bearer"
}

const REQUEST_METHOD = {
	GET: "get",
	POST: "post"
}

const AUTHOR = {
	BOT: "bot",
	OPERATOR: "operator",
	USER: "user"
}

const AUTHOR_TRANSLATE = {
	bot: "бот",
	operator: "оператор",
	user: "пользователь"
}

const SUPPORTED_MESSAGE_TYPES = [ 1 ]

const SYSTEM_OPERATOR_REGEX = /^__\w+__$/gi
const SYSTEM_OPERATOR = "__SYSTEM__"

const NO_DATA = "Нет данных"

const EXEL_HEADERS = {
	id: "ID диалога",
	omniUserId: "OmniUserId",
	userFio: "ФИО пользователя",
	channelType: "Тип канала",
	channelId: "ID Канала",
	startedAt: "Время старта диалога",
	requestMessage: "Текст диалога",
	llmResult: "Результат"
}

const REPORT_STATUSES = {
	DONE: "done",
	ERROR: "error",
	PROGRESS: "progress"
}

const REPORT_PREFIX = "DIALOG_HISTORY_ANALYSIS"

const METHODS = {
	CREATE_REPORT: "create",
	GET_REPORTS: "get"
}

const externalApiInstance = axios.create({
	baseURL: EXTERNAL_API.baseAddress,
	headers: {
		Authorization: `${AUTH_TYPE.BEARER} ${EXTERNAL_API.token}`,
	}
})

function extractThinkContent(input) {
	const openTag = '<think>';
	const closeTag = '</think>';

	const startIdx = input.indexOf(openTag);
	const endIdx = input.indexOf(closeTag);

	if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
		return input;
	}
		const cleanedText = input.substring(0, startIdx) +
		input.substring(endIdx + closeTag.length);

	return cleanedText.trim();
}


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
	const { method, projectId, data = {} } = message

	const {
		id,
		dateRange,
		prompt,
		dialogsCountLimit,
		mask
	} = data

	switch (method) {
		case METHODS.CREATE_REPORT:
			return await createReport(id, dateRange, projectId, dialogsCountLimit, prompt, mask)
		case METHODS.GET_REPORTS:
			return await getReports()
		default:
			logger.warn("Unknown method. Return")
			return {}
	}
}

async function createReport(id, dateRange, projectId, dialogsCountLimit, prompt, mask) {
	const reportInfo = createReportInfo(id, REPORT_STATUSES.PROGRESS, dateRange, prompt, mask)
	await saveReportToStorage(reportInfo, projectId)

	const dialogs = await getDialogsByRange(dateRange, projectId)

	logger.info(`Dialogs count: ${dialogs.length}`)

	const dialogsLimited = dialogs.slice(0, dialogsCountLimit)
	logger.info(`Dialogs limited count: ${dialogsLimited.length}`)

	const dialogsInfo = await extractDialogInfo(dialogsLimited, projectId, prompt, mask.toLowerCase())

	logger.info(`Dialogs info count: ${dialogsInfo.length}`)
	logger.info(`Dialogs info first: ${JSON.stringify(dialogsInfo[0])}`)

	const dialogsInfoInExelFormat = transformDialogsInfoToExelFormat(dialogsInfo)

	const exelFile = saveToExelFormat(dialogsInfoInExelFormat)
	const fileLink = await uploadFileToStorage(exelFile)

	if (dialogsInfo.length > 0 && fileLink) {
		await updateReportRecord(REPORT_STATUSES.DONE, fileLink, id, projectId)
	} else {
		await updateReportRecord(REPORT_STATUSES.ERROR, "", id, projectId)
	}

	return {}
}

function createReportInfo(id, status, dateRange, prompt, mask = "-", link = "") {
	return {
		id: id,
		status: status,
		dateRange: dateRange,
		createdAt: new Date().getTime(),
		prompt: prompt,
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

async function getDialogsByRange(range, projectId) {
	const dialogsByRangeRequestBody = createDialogsByRangeRequestBody(range, projectId)

	return await getDialogs(dialogsByRangeRequestBody)
}

function createDialogsByRangeRequestBody(range, projectId) {
	return {
		DateFrom: range.start,
		DateTo: range.end,
		CustomerId: projectId
	}
}

async function getDialogs(requestBody) {
	try {
		const dialogsResponse = await externalApiInstance({
			method: REQUEST_METHOD.GET,
			url: EXTERNAL_API.dialogsSearch,
			data: requestBody
		})

		return dialogsResponse?.data?.Dialogs ?? []
	} catch (error) {
		logger.error(`Error when executing getDialogs request. ${error}`)
		return []
	}
}

async function extractDialogInfo(dialogs, projectId, prompt, mask) {
	const dialogsInfo = []

	for (const dialog of dialogs) {
		const messagesByDialog = await getMessagesByDialogId(dialog.Id, projectId)

		const operator = messagesByDialog.find(message => message.Operator && !isSystemOperator(message.Operator))
		const operatorName = operator ? getUserFio(operator.Operator) : SYSTEM_OPERATOR

		const user = await getUserByOmniId(dialog.OmniUserId)
		const userFio = getUserFio(user)

		const channelId = (dialog.Sessions ?? [])[0]?.ChannelId
		const channelType = getChannelTypeById(channelId)

		const transformedMessages = transformMessagesToTextAuthorStruct(messagesByDialog)
		const requestText = transformDialogMessagesToAiRequestText(transformedMessages, operatorName)

		if (!requestText) {
			continue
		}

		const requestTextWithPrompt = addPromptToAiRequestText(prompt, requestText)

		const llmRate = extractThinkContent (await getLlmRate(requestTextWithPrompt))

		const isRateMatchToMask = !mask || (mask && llmRate.toLowerCase().includes(mask))

		if (isRateMatchToMask) {
			dialogsInfo.push({
				id: dialog.Id,
				omniUserId: dialog.OmniUserId,
				userFio: userFio ?? "",
				channelType: channelType,
				channelId: channelId ?? "",
				startedAt: formatDate(dialog.Stat?.Started ?? 0),
				messages: transformedMessages,
				operator: operatorName,
				requestMessage: requestText.trim(),
				llmResult: llmRate
			})
		}
	}

	return dialogsInfo
}

async function getMessagesByDialogId(dialogId, projectId) {
	const dialogMessagesRequestBody = createDialogMessagesRequestBody(dialogId, projectId)

	logger.info(`dialogMessagesRequestBody: ${JSON.stringify(dialogMessagesRequestBody)}`)

	return await getMessagesFromDialog(dialogMessagesRequestBody)
}

function isSystemOperator(operator) {
	return operator.FirstName?.match(SYSTEM_OPERATOR_REGEX) || operator.Id?.match(SYSTEM_OPERATOR_REGEX)
}

function createDialogMessagesRequestBody(dialogId, projectId) {
	return {
		DialogId: dialogId,
		CustomerId: projectId
	}
}

async function getMessagesFromDialog(requestBody) {
	try {
		const messagesResponse = await externalApiInstance.post(EXTERNAL_API.messageHistory, requestBody)

		return messagesResponse.data?.Messages ?? []
	} catch (error) {
		logger.error(`Error when executing getMessagesFromDialog. ${error}. Stack: ${JSON.stringify(error.stack)}`)
		return []
	}
}

function transformMessagesToTextAuthorStruct(messages) {
	return messages.reduce((transformedMessages, message) => {
		if (message.Text && SUPPORTED_MESSAGE_TYPES.includes(message.MessageType)) {
			let author = ""

			if (!message.IsReply) {
				author = AUTHOR.USER
			}
			else if (message.IsReply && message.Operator) {
				if (isSystemOperator(message.Operator)) {
					author = AUTHOR.BOT
				} else {
					author = AUTHOR.OPERATOR
				}
			}

			if (author) {
				transformedMessages.push({
					text: message.Text,
					author
				})
			}
		}

		return transformedMessages
	}, [])
}

function getUserFio(user) {
	return `${user.LastName ?? NO_DATA} ${user.FirstName ?? NO_DATA}${user.MiddleName ? " " + user.MiddleName : ""}`
}

function transformDialogMessagesToAiRequestText(messages, operatorFio) {
	let requestText = ""

	for (const message of messages) {
		const operatorTag = `${AUTHOR_TRANSLATE[message.author]} ${message.author === AUTHOR.OPERATOR ? operatorFio : ""}`
		requestText += `\n\n\n${operatorTag}: ${message.text}`
	}

	return requestText
}

function addPromptToAiRequestText(prompt, text) {
	return prompt + `${IS_THINKING ? THINK : NO_THINK}` + text
}

async function getUserByOmniId(omniUserId) {
	try {
		const userResponse = await externalApiInstance.post(EXTERNAL_API.getByOmniUserId, {
			OmniUserId: omniUserId
		})

		return userResponse.data?.User ?? {}
	} catch (error) {
		logger.error(`Error when executing getUserByOmniId. ${error}. Stack: ${JSON.stringify(error.stack)}`)
		return {}
	}
}

function getChannelTypeById(channelId) {
	if (!channelId || !CHANNEL_TYPES) return NO_DATA

	for (const channelType of Object.keys(CHANNEL_TYPES)) {
		const isChannelIdExist = CHANNEL_TYPES[channelType].includes(channelId)

		if (isChannelIdExist) {
			return channelType
		}
	}

	return NO_DATA
}

async function getLlmRate(text) {
	try {
		// Правильное формирование URL
		const llmUrl = `${LLM_API.baseAddress}${LLM_API.query}`;

		// Используем полученный API ключ
		const llmResponse = await axios.post(
			llmUrl,
			{
				question: text,
				instruction: "",
				temperature: LLM_API.temperature > 0 ? LLM_API.temperature : 0
			},
			{
				timeout: LLM_API.timeout * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `${AUTH_TYPE.BEARER} ${LLM_API.token}`  // Добавляем токен
				}
			}
		);

		return llmResponse?.data?.answer?.replace("Выход:", "").trim() ?? "";
	} catch (error) {
		logger.error(`Error getLlmRate ${error.message}`);
		if (error.response) {
			logger.error(`Status: ${error.response.status}`);
			logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
		}
		return "";
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

function formatDate(timestamp) {
	const date = new Date(timestamp)
	date.setHours(date.getHours() + 3)
	return date.toISOString().replace("T", " ").slice(0, -5)
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
