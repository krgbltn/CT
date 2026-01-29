//gpt_assistant_agent
const CUSTOMER_ID = agentSettings.customer_id;
const RECORD_TYPE = agentSettings.record_type;
const URL_CONTEXT_SEARCH = new URL("/search", agentSettings.url_context_search)
	.href;
const URL_LLM = new URL("/context_query", agentSettings.url_llm).href;
const URL_LLM_SMALLTALK = new URL("/query", agentSettings.url_llm).href;
let LLM_AUTH_TOKEN = agentSettings.llm_auth_token;
const LLM_TIMEOUT = agentSettings.llm_timeout ?? 60;
const LLM_TEMPERATURE = agentSettings.llm_temperature ?? 0.0;
const NOTFOUND = "notfound"; // intent, that will be returned if context was not found
const LLM_SYSTEM_TEMPLATE = `
Ты - помощник оператора "Название компании", который работает с клиентами. 
Ты помогаешь оператору вежливо общаться с клиентами и находить ответы на их вопросы.

Ты получаешь на вход найденную информацию и на основании только этой информации формируешь точный ответ с цитатой длиной до 200 символов.
Если в найденной информации нет подходящего ответа на вопрос, то попроси пользователя задать более конкретный вопрос.
/no_think
`;

const LLM_SYSTEM_TEMPLATE_SMALLTALK = `
Ты - помощник оператора "Название компании", который работает с клиентами. Ты помогаешь оператору вежливо общаться с клиентами и находить ответы на их вопросы.
Подготовь вежливый ответ для клиента и задай встречный вопрос.
/no_think

`;

const LLM_TEMPLATE_ENG_TRANSLATE = `
Ты - переводчик текста на английский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
/no_think
`;

const LLM_TEMPLATE_CHI_TRANSLATE = `
Ты - переводчик текста на китайский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
/no_think
`;

const LLM_TEMPLATE_UZ_TRANSLATE = `
Ты - переводчик текста на узбекский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
/no_think
`;
const LLM_TEMPLATE_KG_TRANSLATE = `
Ты - переводчик текста на киргизский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
/no_think
`;
const LLM_TEMPLATE_TJ_TRANSLATE = `
Ты - переводчик текста на таджикский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
/no_think
`;
const LLM_TEMPLATE_RU_TRANSLATE = `
Ты - переводчик текста на русский язык. Отвечай только переведенной фразой. Не ссылайся на входные данные.
/no_think
`;

const LLM_TEMPLATE_FIX_SYNTAX = `
Ты помогаешь оператору контакт-центра написать вежливую фразу клиенту без синтаксических и орфографических ошибок. Начни с приветствия. 

Например:
Фраза: заказз 1593 не прошел 
Результат: Уважаемый клиент, сожалеем, но заказ №1593 не был выполнен. Помочь Вам решить проблему?
/no_think
`;

const LLM_TEMPLATE_SELL = `
Ты помогаешь оператору продать услугу или товар клиенту. Сформируй продающую фразу на основе фразы оператора.  
/no_think
`;
const LLM_TEMPLATE_REJECT = `
Ты помогаешь оператору мягко отказать клиенту в его просьбе. Сформируй аккуратную вежливую фразу на основе фразы оператора.  
/no_think
`;

const LLM_TEMPLATE_EMPATHY = `
Ты определяешь вежливость, корректность ии профессиональность ответов оператора в диалога чата. 
/no_think
`;

const LLM_TEMPLATE_SUGGEST_OUTGOING = `
Ты - помогаешь оператору, предлагая вариант сообщения, которым можно начать новый диалог с клиентом. Предлагай на русском языке, 1 или 2 предложения. 
/no_think
`;

const LLM_TEMPLATE_SUMMARY = `
Ты - помогаешь оператору, создавая краткий реферат диалога. Отвечай на русском языке, 1 или 2 предложения. 
/no_think
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
	let record_type = null;

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
				instruction: LLM_SYSTEM_TEMPLATE_SMALLTALK
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
		const message = response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

		return ResponseWrapper(message);
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
				system_template: LLM_SYSTEM_TEMPLATE
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

	full_context.symbol_code.forEach(intent_id => {
		if (!(intent_id in articles_map)) {
			supportArticles.push({
				ref: `https://cloud-dev-5.craft-talk.com/app/project/dodopizza_demo/knowledge-base/article/view/${intent_id}`,
				title: full_context.title[idx]
			});

			articles_map[intent_id] = intent_id;
			cnt++;
		}

		idx++;
	});

	return ResponseWrapper(
		response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
		//supportArticles
		[]
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
		return ResponseWrapper(response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim(), []);
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

		return ResponseWrapper(response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim(), []);
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
			LLM_TEMPLATE_FIX_SYNTAX
		);

		return ResponseWrapper(response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim(), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при продаже");
	}
}

/**
 * command: reject
 */
async function reject() {
	if (message.operatorMessage === null || message.operatorMessage.trim().length === 0)
		return ResponseWrapper("❗️ Вставьте или напишите в поле ввода ответа – на какой запрос клиента необходимо подготовить отказ", []);

	let question =
		"Напиши отказ клиенту в его просьбе на основе описания оператора. \n\nОписание оператора:\n" +
		message.operatorMessage;
	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_FIX_SYNTAX
		);

		return ResponseWrapper(response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim(), []);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при отказе");
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
		return "🔖 " + response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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
		"Определи, есть ли в диалоге невежливое иили непрофессиональное обращение оператора контакт-центра к клиенту. Дай конкретную рекомендацию - какая фраза некорректная. Ответь \"да\" или \"нет\". Объясни причину своего ответа.  \n\nДиалог:\n" + messagesStr;

	try {
		const response = await commandGeneric(
			question,
			LLM_TEMPLATE_EMPATHY
		);

		let alarm = false;
		let answer = "Не удалось определить корректность общения";
		if (response.data.answer.startsWith("Да")) {
			answer = response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim().substring(3);
			alarm = true;
		}
		else {
			answer = response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim().substring(2);
		}
		return ResponseWrapper("🧐 " + answer, [], alarm);
	} catch (e) {
		return ResponseWrapper("Что-то пошло не так при определении корректности общения");
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

		return "🔖 " + response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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

	try {
		return axios.post(
			URL_LLM_SMALLTALK,
			{
				question,
				instruction,
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
	trans_en: "Перевести на английский",
	trans_chinese: "Перевести на китайский",
	trans_uz: "Перевести на узбекский",
	trans_kg: "Перевести на киргизский",
	trans_tj: "Перевести на таджикский",
	trans_ru: "Перевести на русский",
	fix_syntax: "Улучшение ответа",
	summary: "Кратко опиши диалог",
	sell: "Продай товар или услугу",
	reject: "Откажи клиенту",
	gpt_answer: "Ответ на вопрос клиента",
	detailed: "Дай более подробный ответ",
	empathy: "Дай рекомендации по ведению диалога"
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