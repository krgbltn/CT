// Ассистент оператора 21 век; основа: Skolkovo/gpt_assistant_agent_skolkovo.js
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

const LLM_SYSTEM_TEMPLATE = agentSettings.llm_system_template || `Ты — ассистент оператора контакт-центра онлайн-гипермаркета «21 век» (21vek.by). Помогаешь оператору подготовить точный и вежливый ответ клиенту по вопросам товаров, оформления заказа, оплаты, доставки, получения, возврата, гарантии и других услуг, только если соответствующие сведения есть в найденном контексте.
Подготовь готовый текст ответа клиенту от лица оператора, без вступления «оператору следует». По умолчанию отвечай кратко, до 300 символов; для запроса подробного ответа можно увеличить объём, сохраняя только сведения по вопросу.
Используй исключительно релевантный контекст. Не выдумывай наличие и характеристики товаров, цены, ставки, скидки, сроки, телефоны, адреса, статус заказа или условия обслуживания. История и черновик оператора не подтверждают новые условия компании.
По умолчанию речь о рознице. Оптовые условия допустимы только при явном упоминании клиентом опта; несколько товаров или упаковок не означают опт. Не смешивай разные виды покупки, оплаты и доставки. Если условия относятся к другой ситуации, ответа на вопрос нет.
Если точного ответа недостаточно, прямо сообщи, что нужно уточнить информацию, без догадок и добавления телефонов или советов из соседней темы. Не упоминай внутренний контекст или поиск. Ссылки используй только из подходящего контекста и только по вопросу.
При намерении купить помоги оператору сформулировать следующий шаг, не утверждай, что заказ уже создан, оплачен или передан специалисту. Не выполняй переводы между агентами и не выдавай платформенные команды.
На приветствия отвечай кратко и дружелюбно. Не повторяй приветствие и предложение помощи в каждом ответе.`;

const LLM_SYSTEM_TEMPLATE_SMALLTALK = agentSettings.llm_system_template_smalltalk || `Ты — ассистент оператора контакт-центра онлайн-гипермаркета «21 век» (21vek.by). Для этого запроса подходящий контекст базы знаний не найден.
На приветствие или личное вежливое обращение подготовь краткий дружелюбный ответ. На предметный вопрос клиента подготовь краткую честную фразу о необходимости уточнить информацию. Если вопрос неполон, можно задать один конкретный уточняющий вопрос.
Не отвечай на вопросы об условиях компании по общим знаниям. Не выдумывай цены, ставки, сроки, наличие, телефоны, ссылки, адреса, статус или результат действий. Не добавляй контактные данные из памяти и не обещай оформление заказа, возврат денег или перевод на оператора. Не упоминай контекст или технические системы. Верни только текст для проверки оператором.`;

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
Ты — помощник оператора контакт-центра «21 век». Улучши ясность, вежливость и грамматику черновика ответа клиенту. Обращайся на «Вы». Сохрани исходный смысл, конкретные факты, номера заказов, даты и ссылки. Не добавляй обязательное приветствие, если оно не нужно по исходному тексту. Не добавляй неподтверждённые действия, причины, гарантии, инструкции, сроки или контакты. Верни только улучшенный текст.
`;

const LLM_TEMPLATE_SELL = `
Ты помогаешь оператору «21 век» сформулировать ненавязчивое предложение покупки товара или услуги на основе описания оператора. Используй только указанные свойства и преимущества. Не выдумывай наличие, цены, скидки, гарантию, доставку или срочность. Не утверждай, что заказ оформлен. Верни только короткую фразу для клиента.
`;
const LLM_TEMPLATE_FIX_ERRORS = `
Ты — помощник оператора контакт-центра «21 век». Исправь орфографические, пунктуационные и грамматические ошибки. Сохрани смысл, стиль, суммы, даты, номера заказов и ссылки. Верни только исправленный текст без комментариев.
`;

const LLM_TEMPLATE_EMPATHY = `
Ты — помощник оператора контакт-центра «21 век». Оцени предоставленный диалог: понял ли оператор вопрос клиента, учёл ли уточнения, отвечает ли по существу, вежлив ли, проявил ли уместную эмпатию и предложил ли понятный следующий шаг. Не навязывай продажу при возврате, жалобе или другом вопросе. Не оценивай достоверность условий компании без базы знаний и не объявляй действия выполненными без подтверждения в диалоге.
Ответь до 300 символов. Если есть ошибка, пропущенный шаг или нужна корректировка, начни строго с «Да:», затем назови проблему и конкретную рекомендацию. Если корректировка не нужна, начни с «Нет:», затем кратко отметь, что сделано правильно. При недостатке диалога укажи это и не делай категоричных выводов.
`;

const LLM_TEMPLATE_SUGGEST_OUTGOING = `
Ты — помощник оператора «21 век». Предложи вежливое сообщение для возобновления общения с клиентом по предоставленному предыдущему диалогу. На русском языке, 1–2 предложения. Учитывай последний нерешённый вопрос. Не придумывай новые события, акции, статус заказа, согласие клиента или результат действий. Верни только сообщение.
`;

const LLM_TEMPLATE_SUMMARY = `
Ты — помощник оператора «21 век». Кратко изложи запрос клиента по предоставленным сообщениям на русском языке, в 1–2 предложениях. Сохрани важные явно указанные товары, номера заказов, даты и пожелания. Не додумывай причины, результат обработки или действия оператора.
`;

const LLM_TEMPLATE_TONE = `
Ты — аналитик тональности диалогов контакт-центра «21 век». Определи преобладающую тональность: грубое общение; заинтересованность в товаре или услуге; нейтральное общение; недовольство или жалоба; дружелюбное общение. Укажи категорию и одну короткую рекомендацию оператору (1–2 предложения). Оценивай только предоставленный диалог; не приписывай клиенту скрытых намерений.
`;

const LLM_TEMPLATE_ADAPTATION = `
Ты — помощник оператора «21 век». Адаптируй черновик ответа под манеру общения клиента, сохраняя профессионализм, вежливость и обращение на «Вы». Не перенимай грубость. Сохрани смысл, факты, номера заказов, даты, суммы и ссылки; не добавляй новые обещания или условия. Верни только адаптированный текст.
`;


/**
 * Реплики GPT <---> JsAgent
 */
async function gptReplicas(detailedAnswer=false) {
	let response = null;
	let question = PrepareQuestionToken(message);
	if (!question.trim()) {
		return ResponseWrapper("❗️ Выберите сообщение клиента или введите вопрос в поле ответа", []);
	}

	try {
		response = await axios.post(URL_CONTEXT_SEARCH, {
			text: question,
			customer_id: CUSTOMER_ID,
			record_type: RECORD_TYPE,
			output_format: "json-vikhr"
		});

		logger.info({ event: 'assistant_context', count: response.data.context?.length ?? 0 });
	} catch (e) {
		logger.info(`Error requesting context search: ${e}.`);
		throw e;
	}

	let context = response.data.context;
	let full_context = response.data;

	if (!context.length) {
		logger.info('Assistant: context not found');

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

		logger.info('Assistant: no-context reply received');

		return ResponseWrapper(cleanResponse(response.data.answer));
	}

	if (detailedAnswer === true)
		question += "\n Дай подробный ответ на вопрос.";

	try {
		logger.info('Assistant: requesting knowledge-base reply');
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
	let articles_map = new Set();
	if (IS_SUPPORT) {
		(full_context.symbol_code || []).forEach(intent_id => {
			if (!articles_map.has(intent_id)) {
				supportArticles.push({
					ref: `${BASE_URL.replace(/\/$/, '')}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`,
					title: full_context.title?.[idx] || context[idx]?.title || intent_id
				});

				articles_map.add(intent_id);
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
		if (!clientMessages.length) {
			return ResponseWrapper("❗️ Вставьте текст для перевода или выберите сообщение клиента", []);
		}
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
	const messagesStr =       [...message.messages].reverse().map(x => x.side + ": " + x.text + "\n").join("\n");

	let question =
		"Проанализируй ответы оператора контакт-центра 21 век. И дай короткий содержательный ответ до 300 символов \n\nДиалог:\n" + messagesStr;

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
	const messagesStr = [...message.messages].reverse().map(x => x.side + ": " + x.text + "\n").join("");

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
	// В исходнике CRM была локальной демонстрацией, а не HTTP-интеграцией.
	// Сохраняем команду, но используем только явно настроенные карточки.
	const clients = agentSettings.crm_clients ?? [];
	if (!clients.length) return ResponseWrapper("Источник данных CRM не настроен", []);
	const phoneTexts = messages.map(x => (x.text || '').replace(/\D/g, ''));
	const client = clients.find(item => {
		const phone = String(item.phone || '').replace(/\D/g, '');
		return phone.length >= 7 && phoneTexts.some(text => text.includes(phone));
	});
	const title = client?.demo
		? "🧪 Демонстрационная карточка клиента (тестовые данные):\n"
		: "🔍 Карточка клиента:\n";
	return client
		? ResponseWrapper(title + JSON.stringify(client.card, null, 2), [])
		: ResponseWrapper("Клиент не найден", []);
}

/**
 * command: nonActiveDialog
 */
async function nonActiveDialog_intl() {
	const messagesStr =       [...message.messages].reverse().map(x => x.side + ": " + x.text + "\n").join("")

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
	logger.info({ event: 'assistant_command', command: message.reqTypeCommand });
	const finalInstruction = buildInstruction(instruction);
	try {
		return await axios.post(
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
	const cmdPromise = async () => {
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
			logger.error({ event: 'assistant_error', status: error.response?.status });
			resolve(responseError(error));
		});
}

// AGENT ENTRIES ////////////////////////////////////////

async function main() {
	if (Buffer.isBuffer(message)) message = JSON.parse(message.toString());
	if (!message || typeof message !== 'object') throw new Error('Invalid assistant request');
	message.messages = Array.isArray(message.messages) ? message.messages : [];
	message.operatorMessage = typeof message.operatorMessage === 'string' ? message.operatorMessage : '';
	logger.info({ event: 'assistant_request', mode: message.mode, command: message.reqTypeCommand });

	switch (message.mode) {
		case "gpt":
			return getReply();
		case "get_request_types":
			return resolve(getRequestTypes());
		default:
			return resolve(ResponseWrapper("Неизвестный режим ассистента", []));
	}
}

main().catch(error => {
	logger.error({ event: 'assistant_error', status: error.response?.status });
	resolve(responseError(error));
});

// UTILS /////////////////////////////////////////////////

function PrepareQuestionToken(messageEntry) {
	const {
		messages = [],
		operatorMessage = "",
		reqTypeCommand = null
	} = messageEntry;

	let messagesStr = reqTypeCommand;

	if (reqTypeCommand !== "gpt_answer" && reqTypeCommand !== "detailed" && reqTypeCommand !== null && reqTypeCommand  !== "") {
		messagesStr = `${REQUEST_TYPES_LIST[reqTypeCommand]}: ${operatorMessage}`;
	} else {
		const clientMessages = messages.filter(x => x.side === "client");
		messagesStr = clientMessages[0]?.text || '';
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
		error: "Не удалось обработать запрос ассистента. Попробуйте ещё раз."
	};
}
