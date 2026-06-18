//gpt_assistant_agent
const CUSTOMER_ID = agentSettings.customer_id;
const BASE_URL = agentSettings.base_url;
const RECORD_TYPE = agentSettings.record_type;
const URL_CONTEXT_SEARCH = new URL("/search", agentSettings.url_context_search)
	.href;
const URL_LLM = new URL("/context_query", agentSettings.url_llm).href;
const URL_LLM_SMALLTALK = new URL("/query", agentSettings.url_llm).href;
let LLM_AUTH_TOKEN = agentSettings.llm_auth_token;
const LLM_TIMEOUT = agentSettings.llm_timeout ?? 60;
const LLM_TEMPERATURE = agentSettings.llm_temperature ?? 0.0;
const NOTFOUND = "notfound"; // intent, that will be returned if context was not found
const IS_THINKING = agentSettings.isThinking ?? false;
const THINK = " /think";
const NO_THINK = " /no_think";
const IS_SUPPORT = agentSettings.isSupport ?? false;

function buildInstruction(baseTemplate) {
	return `${baseTemplate} ${IS_THINKING ? THINK : NO_THINK}`;
};
function cleanResponse(text) {
	if (!text) return "";
	return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};

const LLM_SYSTEM_TEMPLATE = agentSettings.llm_system_template;

const LLM_SYSTEM_TEMPLATE_SMALLTALK = agentSettings.llm_system_template_smalltalk;

const LLM_TEMPLATE_ENG_TRANSLATE = `
Ты - переводчик текста на английский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
`;

const LLM_TEMPLATE_CHI_TRANSLATE = `
Ты - переводчик текста на китайский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
`;

const LLM_TEMPLATE_UZ_TRANSLATE = `
Ты - переводчик текста на узбекский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
`;
const LLM_TEMPLATE_KG_TRANSLATE = `
Ты - переводчик текста на киргизский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
`;
const LLM_TEMPLATE_TJ_TRANSLATE = `
Ты - переводчик текста на таджикский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
`;
const LLM_TEMPLATE_RU_TRANSLATE = `
Ты - переводчик текста на русский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
`;

const LLM_TEMPLATE_FIX_SYNTAX = `
Ты — помощник контакт-центра национальный оператор почтовой связи Республики Беларусь "Белпочта", отвечающий за вежливое, подробное и грамматически правильное общение с клиентами. Начните ответ с приветствия. Сообщение должно содержать: 1) четкое и полное описание ситуации, о которой сообщает клиент; 2) конкретные и выполнимые инструкции, которые должен выполнить клиент; 3) точную информацию о контактном лице, в том числе о том, кого и как следует искать, с подробным указанием места и того, о чем следует сообщить. Не используйте местоимения в обращении «ты» с маленькой буквы, всегда пишите «Вы» с большой, избегайте формулировок «уважаемый клиент» и неопределенных выражений вроде «обратитесь в службу поддержки». Заменяйте общие рекомендации конкретными указаниями, избегайте повторов и словесных излишеств. Инструкции должны быть простыми, понятными и конкретными, чтобы клиент мог выполнить их с первого раза. 
`;

const LLM_TEMPLATE_SELL = `
Ты помогаешь оператору продать услугу или товар клиенту. Сформируй продающую фразу на основе фразы оператора.  
`;
const LLM_TEMPLATE_FIX_ERRORS = `
Ты - помощник оператора контакт-центра. Исправь орфографические и грамматические ошибки в тексте. Верни только исправленный текст, без дополнительных слов, комментариев или пояснений. Сохрани содержание и стиль исходного текста.
`;

const LLM_TEMPLATE_EMPATHY = `
Ты - помощник оператора контакт-центра. Проанализируй диалог по скрипту Академии наставников. Дай рекомендации: что сделано правильно, какие шаги пропущены, что нужно сделать дальше.
Скрипт:1. Перечисли форматы обучения (Интенсивы - трехдневное обучение практикам наставничества в проектной деятельности, Курсы - дистанционные курсы для наставников, вебинары и методические материалы) 2. Уточни, какой формат интересует клиента 3. Расскажи подробнее про выбранный формат 4. Предложи записаться на обучение.
`;

const LLM_TEMPLATE_SUGGEST_OUTGOING = `
Ты - помогаешь оператору, предлагая вариант сообщения, которым можно начать новый диалог с клиентом. Предлагай на русском языке, 1 или 2 предложения. 
`;

const LLM_TEMPLATE_SUMMARY = `
Ты - помогаешь оператору, создавая краткий реферат диалога. Отвечай на русском языке, 1 или 2 предложения. 
`;

const LLM_TEMPLATE_TONE = `
Ты - аналитик тональности диалогов в контакт-центре. Определи тональность диалога по следующим категориям:
- грубое общение
- заинтересованность в продукте/услуге
- нейтральное общение
- недовольство/жалоба
- дружелюбное общение

Определи категорию тональности и дай одну короткую рекомендацию (1-2 предложения), как свести диалог к дружелюбно-деловому общению.
`;

const LLM_TEMPLATE_ADAPTATION = `
Ты - помощник оператора контакт-центра. Адаптируй текст ответа оператора под манеру общения клиента, сохраняя профессионализм и вежливость. Учитывай тон, стиль и лексику сообщений клиента.
`;


if (Buffer.isBuffer(message)) {
	try {
		message = JSON.parse(message.toString());
	} catch (e) {}
}

/**
 * Реплики GPT <---> JsAgent
 */
async function gptReplicas(detailedAnswer=false) {
	let response = null;
	let question = PrepareQuestionToken(message);

	try {
		response = await axios.post(URL_CONTEXT_SEARCH, {
			text: question,
			customer_id: CUSTOMER_ID,
			record_type: RECORD_TYPE,
			output_format: "json-vikhr"
		});

		logger.info(response.data);
	} catch (e) {
		logger.info(`Error requesting context search: ${e}.`);
		throw e;
	}

	let context = response.data.context;
	let full_context = response.data;

	if (!context.length) {
		logger.info(`Context not found for question "${question}"`);
		logger.info(`question:${question}`);
		logger.info(`instruction:${LLM_SYSTEM_TEMPLATE_SMALLTALK}`);

		response = await axios.post(
			URL_LLM_SMALLTALK,
			{
				question,
				temperature: 0.5,
				instruction: buildInstruction(LLM_SYSTEM_TEMPLATE_SMALLTALK)
			},
			{
				timeout: LLM_TIMEOUT * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${LLM_AUTH_TOKEN}`
				}
			}
		);

		logger.info(response);

		return ResponseWrapper(cleanResponse(response.data.answer));
	}

	if (detailedAnswer === true)
		question += "\n Дай подробный ответ на вопрос.";

	try {
		logger.info(`message: ${message}`);
		response = await axios.post(
			URL_LLM,
			{
				question,
				context,
				temperature: LLM_TEMPERATURE,
				system_template: buildInstruction(LLM_SYSTEM_TEMPLATE)
			},
			{
				timeout: LLM_TIMEOUT * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${LLM_AUTH_TOKEN}`
				}
			}
		);
	} catch (e) {
		logger.info(`Error requesting LLM: ${e}.`);
		return ResponseWrapper("Что-то пошло не так");
	}
	const supportArticles = [];
	let idx = 0;
	let cnt = 1;
	let articles_map = new Map();
	if (IS_SUPPORT) {
		full_context.symbol_code.forEach(intent_id => {
			if (!(intent_id in articles_map)) {
				supportArticles.push({
					ref: `${BASE_URL}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`,
					title: full_context.title[idx]
				});

				articles_map[intent_id] = intent_id;
				cnt++;
			}

			idx++;
		})};

	let answer = cleanResponse(response.data.answer);

	return ResponseWrapper(
		answer,
		supportArticles
	);
}
/**
 * command: translate
 */
async function translate(lang_title, template) {
	let question = "";
	if (message.operatorMessage === null || message.operatorMessage.trim().length === 0) {
		/*return ResponseWrapper("❗️ Вставьте или напишите текст для перевода в поле ввода ответа", []);*/
		const clientMessages = message.messages.filter(x => x.side === "client");
		const messagesStr = `${clientMessages[0].text}`;

		question =
			"Переведи текст на " + lang_title + " язык. \n\nТекст\n" +
			messagesStr;
	}
	else
		question =
			"Переведи текст на " + lang_title + " язык. \n\nТекст\n" +
			message.operatorMessage;

	try {
		const response = await commandGeneric(
			question,
			template
		);
		return ResponseWrapper(cleanResponse(response.data.answer), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при переводе");
	}
}


/**
 * command: fix syntax
 */
async function fix_syntax() {
	if (message.operatorMessage === null || message.operatorMessage.trim().length === 0)
		return ResponseWrapper("❗️ Вставьте или напишите текст для улучшения в поле ввода ответа", []);

	let question =
		"Перепиши фразу как оператор контакт центра, без ошибок. \n\nФраза:\n" +
		message.operatorMessage;

	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_FIX_SYNTAX
		);

		return ResponseWrapper(cleanResponse(response.data.answer), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при исправлении ошибок");
	}
}

/**
 * command: sell
 */
async function sell() {
	if (message.operatorMessage === null || message.operatorMessage.trim().length === 0)
		return ResponseWrapper("❗️ Вставьте или напишите название продукта или услуги для продажи в поле ввода ответа", []);
	let question =
		"Напиши предложение о покупке для клиента на основе описания оператора. \n\nОписание оператора:\n" +
		message.operatorMessage;

	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_SELL
		);

		return ResponseWrapper(cleanResponse(response.data.answer), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при продаже");
	}
}

/**
 * command: reject (исправить ошибки)
 */
async function reject() {
	if (message.operatorMessage === null || message.operatorMessage.trim().length === 0)
		return ResponseWrapper("❗️ Вставьте или напишите текст для исправления ошибок в поле ввода ответа", []);

	let question =
		"Исправь ошибки в тексте:\n" +
		message.operatorMessage;
	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_FIX_ERRORS
		);

		return ResponseWrapper(cleanResponse(response.data.answer), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при исправлении ошибок");
	}
}

/**
 * command: summary
 */
async function summary_intl() {
	const messagesStr =       message.messages.filter(x => x.side === "client").reverse().map(x => x.side + ": " + x.text + "\n").join("")

	let question =
		"Кратко в виде 1 или 2 предложениий опиши запрос клиента. \n\nДиалог:\n" +
		messagesStr;

	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_SUMMARY
		);
		return "🔖 " + cleanResponse(response.data.answer);
	} catch (e) {
		return "Что-то пошло не так при создании реферата";
	}
}

async function summary() {
	return ResponseWrapper(await(summary_intl()));
}


/**
 * command: empathy
 */
async function empathy() {
	const messagesStr =       message.messages.reverse().map(x => x.side + ": " + x.text + "\n").join("\n");

	let question =
		"Проанализируй ответы оператора по скрипту Академии наставников. И дай короткий содержательный ответ до 300 символов \n\nДиалог:\n" + messagesStr;

	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_EMPATHY
		);

		let alarm = false;
		let answer = "Не удалось определить корректность общения";
		const cleaned = cleanResponse(response.data.answer);

		if (cleaned.startsWith("Да")) {
			answer = cleaned.replace(/^Да[:\s]*/i, '').trim();
			alarm = true;
		} else {
			answer = cleaned.replace(/^Нет[:\s]*/i, '').trim();
		}
		return ResponseWrapper("🧐 " + answer, [], alarm);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при определении корректности общения");
	}
}

/**
 * command: tone
 */
async function tone() {
	const messagesStr = message.messages.reverse().map(x => x.side + ": " + x.text + "\n").join("");

	let question = "Определи тональность диалога. \n\nДиалог:\n" + messagesStr;

	try {
		const response = await commandGeneric(question, LLM_TEMPLATE_TONE);
		return ResponseWrapper("🎭 " + cleanResponse(response.data.answer), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при определении тональности");
	}
}

/**
 * command: adaptation
 */
async function adaptation() {
	if (message.operatorMessage === null || message.operatorMessage.trim().length === 0)
		return ResponseWrapper("❗️ Вставьте или напишите в поле ввода ответа текст для адаптации под стиль клиента", []);

	const clientMessagesStr = message.messages.filter(x => x.side === "client").map(x => x.text + "\n").join("");

	let question =
		"Адаптируй ответ оператора под стиль общения клиента. \n\nСообщения клиента:\n" +
		clientMessagesStr +
		"\nОтвет оператора:\n" + message.operatorMessage;

	try {
		const response = await commandGeneric(question, LLM_TEMPLATE_ADAPTATION);
		return ResponseWrapper(cleanResponse(response.data.answer), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при адаптации стиля подсказки");
	}
}

/**
 * command: crm (Обратиться к CRM)
 */
async function crm_lookup() {
	const messages = message.messages || [];
	const allText = messages.map(x => x.text || "").join(" ");
	const targetPhone = "89999999999";

	if (allText.includes(targetPhone)) {
		const clientCard = {
			"ФИО": "Иван Петрович Сидоров",
			"Телефон": "89999999999",
			"Email": "ivan.sidorov@academy.ru",
			"Статус": "Постоянный клиент",
			"Последнее обращение": "Запись на интенсив по наставничеству"
		};
		return ResponseWrapper("🔍 Карточка клиента:\n" + JSON.stringify(clientCard, null, 2), []);
	} else {
		return ResponseWrapper("Клиент не найден", []);
	}
}

/**
 * command: nonActiveDialog
 */
async function nonActiveDialog_intl() {
	const messagesStr =       message.messages.reverse().map(x => x.side + ": " + x.text + "\n").join("")

	let question =
		"Предложи короткое вовлекающее и вежливое исходящее сообщение клиенту на основе предыдущих диалогов.  \n\nПредыдущий диалог:\n" +
		messagesStr;

	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_SUGGEST_OUTGOING
		);

		return "🔖 " + cleanResponse(response.data.answer);
	} catch (e) {
		return "Что-то пошло не так при создании реферата";
	}
}
async function nonActiveDialog() {
	return ResponseWrapper("В последних диалогах: " + await(summary_intl()) + " 👉РЕКОМЕНДУЕМОЕ НАЧАЛО ДИАЛОГА: " + await(nonActiveDialog_intl()), []);
}


/**
 * Generic command template
 */
async function commandGeneric(question, instruction) {
	logger.info(`question:${question}`);
	logger.info(`instruction:${instruction}`);
	const finalInstruction = buildInstruction(instruction);
	try {
		return axios.post(
			URL_LLM_SMALLTALK,
			{
				question,
				instruction: finalInstruction,
				temperature: LLM_TEMPERATURE
			},
			{
				timeout: LLM_TIMEOUT * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${LLM_AUTH_TOKEN}`
				}
			}
		);
	} catch (e) {
		logger.info(`Error requesting LLM: ${e}`);
		throw e;
	}
}
/**
 * Типы GPT-реплик
 */

const REQUEST_TYPES_LIST = {
	// gpt_answer: "Подсказка GPT",
	// syntax_corr: "Исправить орфографию"
	reject: "Исправить ошибки",
	gpt_answer: "Ответ на вопрос клиента",
	detailed: "Дай более подробный ответ",
	fix_syntax: "Улучшение ответа",
	summary: "Кратко опиши диалог",
	trans_en: "Перевести на английский",
	empathy: "Дай рекомендации по ведению диалога",
	tone: "Определи тональность диалога",
	adaptation: "Адаптируй стиль подсказки",
	crm: "Обратиться к CRM"

};

function getRequestTypes() {
	return REQUEST_TYPES_LIST;
}

async function getReply() {
	const cmdPromise = () => {
		switch (message.reqTypeCommand) {
			case "trans_en":
				return translate("английский", LLM_TEMPLATE_ENG_TRANSLATE);
			case "trans_chinese":
				return translate("китайский", LLM_TEMPLATE_CHI_TRANSLATE);
			case "trans_uz":
				return translate("узбекский", LLM_TEMPLATE_UZ_TRANSLATE);
			case "trans_kg":
				return translate("киргизский", LLM_TEMPLATE_KG_TRANSLATE);
			case "trans_ru":
				return translate("русский", LLM_TEMPLATE_RU_TRANSLATE);
			case "trans_tj":
				return translate("таджикский", LLM_TEMPLATE_TJ_TRANSLATE);
			case "fix_syntax":
				return fix_syntax();
			case "summary":
				return summary();
			case "sell":
				return sell();
			case "reject":
				return reject();
			case "empathy":
				return empathy();
			case "tone":
				return tone();
			case "adaptation":
				return adaptation();
			case "crm":
				return crm_lookup();
			case "detailed":
				return gptReplicas(true);
			default:
				if (message.nonActiveDialog === true)
					return nonActiveDialog();
				else
					return gptReplicas();
		}
	};

	return cmdPromise()
		.then(response => resolve(response))
		.catch(error => {
			logger.info(`Error: ${error}`);
			resolve(responseError(error));
		});
}

// AGENT ENTRIES ////////////////////////////////////////

function main() {
	logger.info("message: " + JSON.stringify(message));

	switch (message.mode) {
		case "gpt":
			return getReply();
		case "get_request_types":
			return resolve(getRequestTypes());
		default:
	}
}

main();

// UTILS /////////////////////////////////////////////////

function PrepareQuestionToken(messageEntry) {
	const {
		messages = [],
		operatorMessage = "",
		reqTypeCommand = null
	} = messageEntry;

	let messagesStr = reqTypeCommand;
	logger.info(`messagesStr: ${messagesStr}`);

	if (reqTypeCommand !== "gpt_answer" && reqTypeCommand !== "detailed" && reqTypeCommand !== null && reqTypeCommand  !== "") {
		messagesStr = `${REQUEST_TYPES_LIST[reqTypeCommand]}: ${operatorMessage}`;
	} else {
		const clientMessages = messages.filter(x => x.side === "client");
		messagesStr = `${clientMessages[0].text}`;
	}

	return [messagesStr, operatorMessage].join(" ");
}

function ResponseWrapper(message = "", supportArticles = [], alarm = false) {
	return {
		alarm,
		message,
		supportArticles
	};
}

function responseError(error) {
	return {
		error: JSON.stringify(error)
	};
}