const BASE_URL = 'chat.idabot.ru';
const CUSTOMER_ID = agentSettings.customer_id;
const CATALOG_ID = agentSettings.catalog_id;
const RECORD_TYPE = agentSettings.record_type;

const SHOW_CONTEXT = false;
const SMALLTALK_IF_NO_CONTEXT = true;
const SHOW_REFERENCES = false;
const DEFINE_TOPIC = true;

const USE_HISTORY = true;
const LAST_CONTEXT_PRICE = 0.19;
const OTHER_CONTEXT_PRICE = 3.1;
const ADD_OTHER_CONTEXT = false;
const MAX_CONTEXTS = -1 // -1 for all

const DEBUG = false;  // print logs, errors to the chat
const USE_RAG = true;


// системный промпт, если нашли контекст
let LLM_SYSTEM_TEMPLATE = `Ты ИИ ассистент для помощи клиентам компании ИДА. ИДА - это AI-платформа управления знаниями и текстовыми коммуникациями для поддержки, маркетинга и продаж с использованием технологий искусственного интеллекта. Платформа создана для оказания услуг контакт-центра в текстовом режиме, работающий в web-чатах, мессенджерах, социальных сетях, e-mail. В Базе Знаний содержится информация о настройке и использовании платформы, чат-ботов, баз знаний, каналов, и т.п.

Сперва определи является ли вопрос личным (например, "как дела"). Если вопрос личный, то ответь дружелюбно, игнорируя найденную информацию, без ссылок, без картинок.

Если вопрос конкретный (например, "как сделать что-то" или "есть ли такая-то возможность"), то используя найденную информацию (контекст), ответь на вопрос максимально точно. Отвечай подробной инструкцией. Используй Markdown, включая ссылки и изображения (вида ![](/file/...). В ответ обязательно вставь ВСЕ изображения внутри статьи!. В ответ добавь список указанных в заголовках гиперссылок на использованные статьи. Итого, если вопрос конкретный, то ответ будет состоять из:
1. Ответ с использованием найденной информации
2. Список ссылок статей
3. Картинки из статей
4. Уточняющие вопросы (если уместно)
.
Если ответа нет в контексте, то скажи, что к сожалению я не смог найти ответ в Базе Знаний. Если спрашивают про политику, религию, войну, принадлежность спорных территорий или другую чувствительную тему, не связанную с ИДА, то скажи "Извините, я могу отвечать только на вопросы о ИДА".

Если в контексте присутствуют уточняющие вопросы, то используй их в ответе для уточнения`;

// системный промпт, если контекст не нашли
let LLM_SYSTEM_TEMPLATE_SMALLTALK = `ТЫ ИИ ассистент для помощи клиентам компании ИДА. ИДА - это AI-платформа управления знаниями и текстовыми коммуникациями для поддержки, маркетинга и продаж с использованием технологий искусственного интеллекта. Платформа создана для оказания услуг контакт-центра в текстовом режиме, работающий в web-чатах, мессенджерах, социальных сетях, e-mail. В Базе Знаний содержится информация о настройке и использовании платформы, чат-ботов, баз знаний, каналов, и т.п.

Отвечай кратко. Если спрашивают про политику, религию, войну, принадлежность спорных территорий или другую чувствительную тему, не связанную с ИДА, то скажи "Извините, я могу отвечать только на вопросы о ИДА". Но на личные вопросы, smalltalk обращения отвечай дружелюбно, чтобы поддержать разговор.`;

// промт определения тематики вопроса
let LLM_SYSTEM_TEMPLATE_TOPIC = `Определи тематику вопроса клиента. Ответь одним предложением, не более 10 слов. Не указывай в ответе, что это тематика. Не предоставляй ответ для клиента - нужно только определить тематику.`;

// user prompt, который будет отправляться на каждый запрос, когда нашелся контекст
// обязательно должен содержать {question} и {context}
let RAG_TEMPLATE = `{question}

# Найденная информация:

{context}"`;

// prompt обертка вокруг каждого найденного куска контента.
// Должен сдержать {content}. Также может содержать {title} и {doc_id}
// Не перепутайте: здесь - conteNt, в основном раг промпте - conteXt.
const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`;

// разделитель между статьями
const RAG_JOIN_SEP = "\n\n...\n\n";
// псевдопромпт для квена не нужен. Вместо него, используй напрямую RAG_TEMPLATE
// const LLM_PSEUDO_SYSTEM_PROMPT = "Answer briefly, use only the data that is in the context. Don't add anything extra. Compose an answer of up to 300 characters."
const DB_LANGUAGE = "на русском";
const REPHRASE_PROMPT_1 = `Сгенерируй {samples_per_generation} поисковых запросов ${DB_LANGUAGE} языке к фразе '{question}' с деталями из предыдущего диалога.
Не придумывай детали - бери только то, что было в диалоге.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример поискового запроса.`;
const REPHRASE_PROMPT_2 = `Ты - поисковая система. К тебе пришел запрос '{question}' с деталями из предыдущего диалога.
Сгенерируй {samples_per_generation} кратких вариантов сниппетов на ${DB_LANGUAGE} языке.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример сниппета.
Генерируй максимально отличающиеся друг от друга сниппеты`;


const DEFAULT_ERROR_MSG = "Что-то пошло не так, попробуйте еще раз.";
const TIMEOUT_ERROR_MSG = "Извините за задержку! Похоже, запрос занял больше времени, чем ожидалось. Пожалуйста, попробуйте снова позже.";


const THINK = " /think";
const NO_THINK = " /no_think";

let URL_CONTEXT_SEARCH;
let URL_LLM;
let URL_LLM_SMALLTALK;
let LLM_TIMEOUT;
let LLM_TEMPERATURE;
let LLM_TEMPERATURE_SMALLTALK;
let LLM_TOP_P;
let LLM_TOP_K;
let LLM_MIN_P;
let LLM_AUTH_TOKEN;
let DO_REPHRASE;
let REPHRASE_N_GENERATIONS;
let REPHRASE_SAMPLES_PER_GENERATION;
let NO_CONTEXT_TEXT;
let ENABLE_THINKING_SMALLTALK;
let ENABLE_THINKING_RAG;
let SHOW_THINKING;

try {
	URL_CONTEXT_SEARCH = new URL('/search', agentSettings.url_context_search).href;
	URL_LLM = new URL('/context_query', agentSettings.url_llm).href;
	URL_LLM_SMALLTALK = new URL('/query', agentSettings.url_llm).href;
	URL_LLM_REPHRASE = new URL('/rephrase', agentSettings.url_llm).href;
	LLM_TIMEOUT = agentSettings.llm_timeout ?? 60;
	LLM_TEMPERATURE = agentSettings.llm_temperature ?? 0.6;
	LLM_TEMPERATURE_SMALLTALK = agentSettings.llm_temperature_smalltalk ?? 0.7;
	LLM_TOP_P = agentSettings.llm_top_p ?? 0.95;
	LLM_TOP_K = agentSettings.llm_top_k ?? 20;
	LLM_MIN_P = agentSettings.llm_min_p ?? 0.0;
	LLM_AUTH_TOKEN = agentSettings.llm_auth_token;
	DO_REPHRASE = agentSettings.do_rephrase ?? false;
	REPHRASE_N_GENERATIONS = agentSettings.rephrase_n_generations ?? 4;
	REPHRASE_SAMPLES_PER_GENERATION = agentSettings.rephrase_samples_per_generation ?? 4;
	NO_CONTEXT_TEXT = agentSettings.no_context_text ?? "Я не знаю ответ на ваш вопрос";
	ENABLE_THINKING_SMALLTALK = agentSettings.enable_thinking_smalltalk ?? false;
	ENABLE_THINKING_RAG = agentSettings.enable_thinking_rag ?? false;
	SHOW_THINKING = agentSettings.show_thinking ?? false;
	if (!ENABLE_THINKING_SMALLTALK) {
		LLM_SYSTEM_TEMPLATE_SMALLTALK += NO_THINK;
	}
	if (ENABLE_THINKING_RAG) {
		RAG_TEMPLATE += THINK;
	} else {
		LLM_SYSTEM_TEMPLATE += NO_THINK;
		RAG_TEMPLATE += NO_THINK;
	}
} catch (e) {
	logger.info(`Error during constants initialization: ${e}.`);
	DEBUG && resolve([agentApi.makeTextReply(`Error during constants initialization: ${e}.`)]);
}


function _sendReply(text, slots={}) {
	reply = agentApi.makeMarkdownReply(text);
	return agentApi.sendMessage({
		MessageMarkdown: reply.message.text + (DEBUG && slots ?" slots: " + JSON.stringify(slots) : ""),
		SendMessageParams: {
			ProjectId: reply.customer_id,
			OmniUserId: reply.omni_user_id,
			Sender: {},
			FilledSlots: slots,
		}
	}, logger).catch(e => logger.info(`Error sending reply: ${e}.`));
	// don't block
}

function wrapInMarkdownCodeBlock(str) {
	// Экранируем только неэкранированные тройные кавычки
	const escapedStr = str.replace(/(?<!\\)```/g, '\\```');
	// Оборачиваем в markdown code block
	return `\`\`\`
${escapedStr}
\`\`\``;
}


function extractThinkContent(input) {
	const openTag = '<think>';
	const closeTag = '</think>';

	const startIdx = input.indexOf(openTag);
	const endIdx = input.indexOf(closeTag);

	input = input.replaceAll("cloud.craft-talk.com", "chat.idabot.ru");

	if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
		return {
			cleanedText: input,
			thought: ''
		};
	}

	const thoughtContent = input.substring(startIdx + openTag.length, endIdx).trim();
	const cleanedText = input.substring(0, startIdx) +
		input.substring(endIdx + closeTag.length);

	return {
		//cleanedText: cleanedText.replace(/[\u00A0-\u9999<>\&]/g, i => '&#'+i.charCodeAt(0)+';'),
		cleanedText: cleanedText,
		thought: thoughtContent ? '*Мои размышления:* \n\n' + thoughtContent : thoughtContent
	};
}


function addUrlToContextTitle(full_context) {
	full_context.symbol_code.forEach((intent_id, idx) => {
		const url = `https://${BASE_URL}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
		//const url = `https://${BASE_URL}/app/share/share-deef9af1-1961-4f85-89b1-2f7d49388d00/article/${intent_id}`;
		const title = full_context.context[idx].title;
		full_context.context[idx].title = `[${title}](${url})`;
	})
}

async function define_topic(question) {
	let response;
	try {
		question += NO_THINK;

		let requestData = {
			question: question,
			temperature: LLM_TEMPERATURE_SMALLTALK,
			top_p: LLM_TOP_P,
			top_k: LLM_TOP_K,
			min_p:LLM_MIN_P,
			instruction: LLM_SYSTEM_TEMPLATE_TOPIC,
			last_context_price: LAST_CONTEXT_PRICE,
			other_context_price: OTHER_CONTEXT_PRICE,
			add_other_context: ADD_OTHER_CONTEXT
		}
		response = await axios.post(
			URL_LLM_SMALLTALK,
			requestData,
			{
				timeout: LLM_TIMEOUT * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${LLM_AUTH_TOKEN}`
				}
			}
		);
	} catch(e) {
		// Логика при ошибке запроса
		logger.info(`Error requesting LLM: ${e}.`);
		replies.debugReply(`Error requesting LLM: ${e}.`);
		_debugAxiosError(e, replies);
		throw e;
	}
	return response.data.answer;
}

async function main() {
	let replies = [];
	// Helpers to add reply
	function textReply(text, wrap_code_block=false) {
		let reply;
		if (wrap_code_block) {
			text = wrapInMarkdownCodeBlock(String(text));
		} else {
			text = String(text);
		}
		// replies.push(agentApi.makeMarkdownReply(reply));
		return _sendReply(text);
	}
	function markdownReply(text, slots = {}) {
		// replies.push(agentApi.makeMarkdownReply(String(text)));
		return _sendReply(String(text), slots);
	}
	function debugReply(text) {
		if (DEBUG) {
			return _sendReply(String(text));
		}
		// DEBUG && replies.push(agentApi.makeMarkdownReply(wrapInMarkdownCodeBlock(String(text))));
	}
	replies.textReply = textReply
	replies.markdownReply = markdownReply
	replies.debugReply = debugReply

	try {
		await _main(replies);
		return replies
	} catch (e) {
		if (e.code === 'ECONNABORTED') {
			replies.textReply(TIMEOUT_ERROR_MSG);
		} else {
			replies.textReply(DEFAULT_ERROR_MSG);
		}
		if (DEBUG) {
			replies.debugReply(`ERROR: ${e}`);
			replies.debugReply(e.stack);
		}
		return replies;
	}
}



async function _main(replies) {
	// Main code
	let question = message.message.text;
	let slots = {};

	replies.debugReply(`question: ${question}`);

	// extract dialog topic if needed
	let current_topic =  message.slot_context.filled_slots.find((slot) => slot.slot_id === "dialog_topic_title")?.value;

	// extract requested ida topic
	let ida_topic =  message.slot_context.filled_slots.find((slot) => slot.slot_id === "sys_ida_topic")?.value;

	// RAG usage
	let rag_slot = message.slot_context.filled_slots.find((slot) => slot.slot_id === "use_rag")?.value;
	let use_rag = USE_RAG && rag_slot !== "false";

	// thinking usage
	let think_slot = message.slot_context.filled_slots.find((slot) => slot.slot_id === "use_think")?.value;
	let use_think = ENABLE_THINKING_SMALLTALK && think_slot !== "false";

	// rephrase usage
	let rephrase_slot = message.slot_context.filled_slots.find((slot) => slot.slot_id === "use_rephrase")?.value;
	let use_rephrase = DO_REPHRASE && rephrase_slot !== "false";

	// smalltalk usage
	let smalltalk_slot = message.slot_context.filled_slots.find((slot) => slot.slot_id === "use_smalltalk")?.value;
	let use_smalltalk = SMALLTALK_IF_NO_CONTEXT && smalltalk_slot !== "false";


	if (DEFINE_TOPIC && !current_topic)
	{
		let conversation_topic  = await define_topic(question);
		slots = { dialog_topic_title: conversation_topic?.replace('<think>', '').replace('</think>', '').replaceAll('\n', '' ) };
	}

	// replies.debugReply(JSON.stringify(message.slot_context, null, 2));
	// Get dialog_id
	let dialog_id = null;
	if (USE_HISTORY) {
		const dialog_response = await agentApi.getDialogId(
			message.user.omni_user_id,
			message.user.customer_id
		);
		dialog_id = dialog_response.Response;
	}

	let contextsearch_texts = question;
	// Generate rephrases of user question
	if (use_rephrase) {
		// rephrases1 = await rephrase(question, REPHRASE_PROMPT_1, dialog_id, replies);
		rephrases2 = await rephrase(question, REPHRASE_PROMPT_2, dialog_id, replies);
		contextsearch_texts = [question]
		// contextsearch_texts = contextsearch_texts.concat(rephrases1);
		contextsearch_texts = contextsearch_texts.concat(rephrases2);
	}

	// Search for relevant context
	let full_context = {context : []};
	if (use_rag) {
		full_context = await getContext(contextsearch_texts, replies);
		addUrlToContextTitle(full_context);
	}
	let context = full_context.context;

	replies.debugReply(`slots: use_rag: ${use_rag}, use_think: ${use_think}, use_rephrase: ${use_rephrase}, use_smalltalk: ${use_smalltalk}, sys_ida_topic: ${ida_topic}  `);

	// Context not found
	if (context?.length === 0) {
		logger.info(`Context not found for question "${question}"`);
		replies.debugReply(`Context not found for question "${question}"`);

		if (use_smalltalk) {
			const { thought, cleanedText } = extractThinkContent(
				await smalltalk(question, dialog_id, replies, use_think)
			);
			if (SHOW_THINKING && thought) {
				await replies.textReply(thought);
				// wait to ensure that reasonong will be sent at first
			} else {
				replies.debugReply(thought);
			}
			replies.markdownReply( cleanedText, slots);
			if (!use_rag)
				replies.markdownReply( `_Внимание! При ответе не использовалась база знаний_`, slots);

			return;
		} else {
			replies.markdownReply(NO_CONTEXT_TEXT, slots);
			return;
		}
	}

	// Answer with context (RAG)
	const { thought, cleanedText } = extractThinkContent(
		await rag(question, context, dialog_id, replies)
	);

	// References to articles
	let references = '';
	if (SHOW_REFERENCES) {
		references = getReferences(full_context);
	}

	// Final answers
	if (SHOW_THINKING && thought) {
		await replies.textReply(thought);
		// wait to ensure that reasonong will be sent at first
	} else {
		replies.debugReply(thought);
	}
	await replies.markdownReply(cleanedText, slots);

	if (SHOW_REFERENCES)
		replies.markdownReply(references);

	SHOW_CONTEXT && replies.textReply(
		"<h3>Контекст</h3>" + JSON.stringify(full_context, null, 2),
		true
	);
}


async function getContext(question, replies) {
	replies.debugReply(JSON.stringify(question));
	let response;
	try {
		response = await axios.post(
			URL_CONTEXT_SEARCH,
			{
				text: question,
				customer_id: CUSTOMER_ID,
//                record_type: RECORD_TYPE,
				catalog_symbol_code: ["classifier-13e19143-9496-4267-9c07-e77f49c0a488"],
				output_format: "json-vikhr"
			}
		);
		logger.info("Response:" + response.data);
	} catch(e) {
		// Логика при ошибке запроса
		logger.info(`Error requesting context search: ${e}.`);
		replies.debugReply(`Error requesting context search: ${e}.`);
		_debugAxiosError(e, replies);
		throw e;
	}
	const full_context = response.data;
	if (MAX_CONTEXTS > -1) {
		Object.keys(full_context).forEach(key => {
			full_context[key] = full_context[key].slice(0, MAX_CONTEXTS);
		});
	}
	return full_context;
}


function _putDialogIdOrHistory(requestData, dialogOrHistory) {
	if (typeof dialogOrHistory === 'string') {
		requestData["dialog_id"] = dialogOrHistory
	} else {
		requestData["history"] = dialogOrHistory
	}
	return requestData
}


async function smalltalk(question, dialogOrHistory, replies, thinking) {
	let response;
	try {
		if (thinking){
			question += THINK;
		} else {
			question += NO_THINK;
		}
		requestData = {
			question: question,
			temperature: LLM_TEMPERATURE_SMALLTALK,
			top_p: LLM_TOP_P,
			top_k: LLM_TOP_K,
			min_p:LLM_MIN_P,
			instruction: LLM_SYSTEM_TEMPLATE_SMALLTALK,
			last_context_price: LAST_CONTEXT_PRICE,
			other_context_price: OTHER_CONTEXT_PRICE,
			add_other_context: ADD_OTHER_CONTEXT
		}
		requestData = _putDialogIdOrHistory(requestData, dialogOrHistory)
		response = await axios.post(
			URL_LLM_SMALLTALK,
			requestData,
			{
				timeout: LLM_TIMEOUT * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${LLM_AUTH_TOKEN}`
				}
			}
		);
	} catch(e) {
		// Логика при ошибке запроса
		logger.info(`Error requesting LLM: ${e}.`);
		replies.debugReply(`Error requesting LLM: ${e}.`);
		_debugAxiosError(e, replies);
		throw e;
	}
	return response.data.answer;
}


async function rag(question, context, dialogOrHistory, replies) {
	let response;
	/*if (LLM_PSEUDO_SYSTEM_PROMPT) {
		question = `${LLM_PSEUDO_SYSTEM_PROMPT}\n${question}`;
	}*/
	requestData = {
		question: question,
		context: context,
		temperature: LLM_TEMPERATURE,
		top_p: LLM_TOP_P,
		top_k: LLM_TOP_K,
		min_p:LLM_MIN_P,
		system_template: LLM_SYSTEM_TEMPLATE,
		user_template: RAG_TEMPLATE,
		document_template: RAG_DOCUMENT_TEMPLATE,
		join_sep: RAG_JOIN_SEP,
		last_context_price: LAST_CONTEXT_PRICE,
		other_context_price: OTHER_CONTEXT_PRICE,
		add_other_context: ADD_OTHER_CONTEXT
	}
	requestData = _putDialogIdOrHistory(requestData, dialogOrHistory)
	try {
		response = await axios.post(
			URL_LLM,
			requestData,
			{
				timeout: LLM_TIMEOUT * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${LLM_AUTH_TOKEN}`
				}
			}
		);
		return response.data.answer;
	} catch(e) {
		// Логика при ошибке запроса
		logger.info(`Error requesting LLM: ${e}.`);
		replies.debugReply(`Error requesting LLM: ${e}.`);
		_debugAxiosError(e, replies);
		replies.debugReply("<h3>Контекст</h3>" + JSON.stringify(context, null, 2));
		throw e;
	}
}


async function rephrase(question, prompt, dialogOrHistory, replies) {
	let response;
	try {
		requestData = {
			question: question,
			prompt: prompt,
			n_generations: REPHRASE_N_GENERATIONS,
			samples_per_generation: REPHRASE_SAMPLES_PER_GENERATION,
			last_context_price: LAST_CONTEXT_PRICE,
			other_context_price: OTHER_CONTEXT_PRICE,
			add_other_context: ADD_OTHER_CONTEXT
		}
		requestData = _putDialogIdOrHistory(requestData, dialogOrHistory)
		response = await axios.post(
			URL_LLM_REPHRASE,
			requestData,
			{
				timeout: LLM_TIMEOUT * 1000,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${LLM_AUTH_TOKEN}`
				}
			}
		);
	} catch(e) {
		// Логика при ошибке запроса
		logger.info(`Error requesting LLM: ${e}.`);
		replies.debugReply(`Error requesting LLM: ${e}.`);
		_debugAxiosError(e, replies);
		throw e;
	}
	return response.data.texts;
}


function _debugAxiosError(error, replies) {
	if (error.response) {
		// The request was made and the server responded with a status code
		// that falls out of the range of 2xx
		replies.debugReply(JSON.stringify(error.response.data, null, 2));
		replies.debugReply(error.response.status);
		replies.debugReply(error.response.headers);
	} else if (error.request) {
		// The request was made but no response was received
		// `error.request` is an instance of XMLHttpRequest in the browser
		// and an instance of http.ClientRequest in node.js
		replies.debugReply(error.request);
	} else {
		// Something happened in setting up the request that triggered an Error
		replies.debugReply('Error', error.message);
	}
}


function getReferences(full_context) {
	let references = '';
	const articles_counts = new Map();
	const articles_titles = new Map();
	// Count unique articles
	full_context.symbol_code.forEach((intent_id, idx) => {
		const prev_count = articles_counts.get(intent_id) || 0;
		articles_counts.set(intent_id, prev_count + 1);
		articles_titles.set(intent_id, full_context.title[idx]);
	});

	// Sort by counts (desc)
	const sorted_counts = Array.from(articles_counts.entries())
		.sort((a, b) => b[1] - a[1]);

	// Add refs to the message
	sorted_counts.forEach(([intent_id, cnt]) => {
//        let url = `https://${BASE_URL}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
		let url = `https://${BASE_URL}/app/share/share-deef9af1-1961-4f85-89b1-2f7d49388d00/article/${intent_id}`;


//        references += `\n\n[${cnt}.
		references += `\n\n• [${articles_titles.get(intent_id)}](${url})`;
	});

	if (references != '')
		references = '### Ссылки для информации:\n\n' + references;
	return references
}


// Entrypoint
if (message.message_type === 1) {
	main()
		.then(res => {
			// resolve(res)
			// sendReplies(res)
			//.then(res2 => {
			// ok
			resolve([]);
			/*})
			.catch (error2 => {
				resolve([agentApi.makeTextReply(String(error2))]);
			});*/
		})
		.catch(error => {
			logger.info(`Error: ${error}`);
			resolve([agentApi.makeTextReply(error)]);
		})
} else {
	logger.info(`Message type: ${message.message_type}. Skip.`)
	resolve([]) // SKIP
}
