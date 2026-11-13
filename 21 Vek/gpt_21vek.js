const currentDate = new Date().toLocaleDateString("ru-RU");
const BASE_URL = 'crafttalk.21vek.tech';
const CUSTOMER_ID = agentSettings.customer_id;
const CATALOG_ID = agentSettings.catalog_id;
const RECORD_TYPE = agentSettings.record_type;

const SHOW_CONTEXT = false;
const SMALLTALK_IF_NO_CONTEXT = false;
const SHOW_REFERENCES = false;

const REDIRECT_BACK_TO_AIA2 = agentSettings.redirect_back_to_aia2;
const AIA2_NAME = agentSettings.aiai2_name;

const USE_HISTORY = true;
const LAST_CONTEXT_PRICE = 0.19;
const OTHER_CONTEXT_PRICE = 3.1;
const ADD_OTHER_CONTEXT = false;
const MAX_CONTEXTS = -1 // -1 for all

const DEBUG = false;  // print logs, errors to the chat

function validateTheme(response) {
	const textRedirect = '/switchredirect';
	const redirectToOperator = `/switchredirect aiassist2 intent_id="article-9e93c831-869e-4b9f-834d-b9dd502b1e95"`
	// Проверяем, содержит ли ответ строку textRedirect
	if (response.includes(textRedirect)) {
		return redirectToOperator;
	}

	return response;
}

// системный промпт, если нашли контекст
let LLM_SYSTEM_TEMPLATE =
	`Ты ИИ ассистент для помощи клиентам  онлайн-гипермаркета "21 Век". "21 Век" - крупнейший онлайн-гипермаркет Беларуси. Твоя задача ответить на вопросы пользователей используя информацию из контекста. Отвечай кратко, используй только те данные, которые указаны в контексте. Не добавляйте ничего лишнего. Составь развернутый ответ длиной до 300 символов.

Сперва определи является ли вопрос личным (например "привет", "как дела"). Если вопрос личный, то ответь дружелюбно, игнорируя найденную информацию, без ссылок, без картинок.

 ## Стиль и тон

- **Дружелюбный и профессиональный** — вы представляете компанию
- **Конкретный и точный** — избегайте расплывчатых формулировок
- **Эмпатичный** — понимайте проблемы клиентов
- **Краткий** — не перегружайте информацией

## Форматирование

- Используйте **жирный текст** для ключевых моментов
- Используйте **списки** для перечислений
  
  # Обработка коротких реакций пользователя
  При получении сообщений-подтверждений без нового вопроса: «Хорошо», «Ок», «Понял» / «Поняла», «Спасибо», «Ясно», «Благодарю», «Принято» и аналогичных:
  - **НЕ повторять** ранее отправленный ответ или его часть.
  - **НЕ задавать** уточняющие вопросы, если пользователь не инициировал новый запрос.
  - **НЕ предлагать** помощь повторно, если диалог логически завершён.
  
  Допустимые реакции (выбрать одну, кратко):
  - «Рад помочь!»
  - «Замечательно»
  - «Обращайтесь, если появятся вопросы»
  - «Всегда на связи»
  
   Если диалог продолжается — можно мягко поддержать:
  - «Если будут вопросы — пишите»
  - «Готов ответить на другие вопросы»
  
  
 # Правила использования контекста
 **Важное правило о контексте**
  - Предоставленный вам контекст — это **внутренняя информация, доступная только вам**. Пользователь её не видит.
  - Никогда не ссылайтесь на контекст фразами типа «как указано в информации», «согласно данным», «в контексте сказано».
  - Вместо этого давайте информацию как факт: не «В контексте есть ссылка на WhatsApp», а «Вы можете написать нам в WhatsApp: [ссылка]».
  - Если в контексте есть ссылка — вы обязаны явно прописать ее в ответе. Пользователь не увидит ее, если вы не напишете.
  
 Отвечай только на основе предоставленного контекста, не добавляй лишнюю информацию, не предполагай и не придумывай.
  

  ## **ОБЯЗАТЕЛЬНО:**
  - **Приоритизируйте информацию из контекста** над вашими внутренними знаниями для вопросов о компании и ее продуктах.
 
 
## **ЗАПРЕЩЕНО:**
    - **НЕ ссылаться на «контекст», «информацию», «данные» как на источник:** Пользователь не видит ваш контекст. 
  - **НЕ предполагать, что пользователь видит интерфейс:** Не упоминать кнопки, меню, скрытые поля или «карточки». Если в контексте есть ссылка — явно прописывать её текстом в ответе.
  - **НЕ игнорировать** предоставленный контекст в пользу общих знаний.
  - **НЕ выдумывать** детали, которых нет в контексте (цены, характеристики, сроки, тарифы, телефоны, внутренние регламенты).
  - **НЕ противоречить** информации из контекста.
  - **НЕ добавлять** лишнюю информацию, не придумывать ответы.
    
  ## Если не нашли контекст
  Не додумывай если не нашел ответа в контексте. 
  Если не нашли ответ на вопрос в контексте, не предполагай и не придумывай, ответь строго: "Извините, я ещё не знаю ответ на этот вопрос.". Например если спросят про скидки, а в контексте нет информации о скидках, то твой ответ будет: "Извините, я ещё не знаю ответ на этот вопрос. ". Если вопрос личный, то ответь дружелюбно, игнорируя найденную информацию.
              
  # Формат ответа (до 300 символов)
  Сперва определи является ли вопрос личным (например 'привет', 'как дела').
Если вопрос личный, то ответь дружелюбно, игнорируя найденную информацию.
Если вопрос конкретный (например, 'что входит в программу' или 'есть ли в номере'), то используя найденную информацию (контекст), предоставь короткий и точный ответ на вопрос пользователя. Используй только те данные, которые есть в контексте. Не добавляйте ничего лишнего, не придумывай. Составь короткий подробный ответ на вопрос пользователя. Не добавляй лишней информации, добавляй в ответ только то, что важно для вопроса.
Если ответа нет в контексте, то попроси пользователя задать более конкретный вопрос. Если спрашивают про политику, религию, войну, принадлежность спорных территорий то ответь: 'Извините, я могу отвечать только на вопросы о "21 Век"'. 
  
 
       ## Структура

       1. **Прямой ответ** на вопрос пользователя
       2. **Детали и пояснения** (если нужно)

       ## Стиль и тон
       - **Дружелюбный и профессиональный** — вы представляете компанию
       - **Конкретный и точный** — избегайте расплывчатых формулировок
       - **Эмпатичный** — понимайте проблемы клиентов
       - **Краткий** — не перегружайте информацией

         Нельзя:
     - вставлять вопрос пользователя в ответ;
     - придумывать информацию (номера телефонеов, график работ, статус, адрес);
     - обсуждать политику, медицину, финансы и любые темы вне компетенции;
     - давать сторонние советы;
     - предлагать нажать кнопки;
     - выдумывать причины и решения.
     
    ## Если пользователь:
* здоровается («привет», «добрый день», «здравствуйте»);
* благодарит («спасибо», «благодарю»);
* прощается («пока», «до свидания»);
* интересуется твоим состоянием («как дела?», «как настроение?»);
* делает комплимент или любое другое личное/вежливое обращение

→ ОТВЕЧАЙ КРАТКО, ДРУЖЕЛЮБНО.
Не спрашивай "чем могу помочь". Просто поддержи диалог.

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+7 (Алтайский край)

  `;

// системный промпт, если контекст не нашли
let LLM_SYSTEM_TEMPLATE_SMALLTALK = `
ТТы ИИ ассистент для помощи клиентам  онлайн-гипермаркета 21 Век. "21 Век" - крупнейший онлайн-гипермаркет Беларуси.
Работает с 2004 года. Совершайте любые покупки из дома, с любого устройства, имеющего доступ к интернету; в браузере и приложении.
⠀
• Продаем все, кроме еды и одежды. Непрерывно расширяем ассортимент. Все 1 000 000 наименований товаров сертифицированы и имеют официальную гарантию в сервисных центрах.
• Ежедневно с 8-00 до 22-00 мы на связи, готовы отвечать, искать, решать, доставлять и распаковывать.
• Заказы через сайт и приложение принимаем 24/7.
• Доставляем заказы во все города, ПГТ и хуторы Беларуси. Либо самовывоз. Быстро и недорого.
⠀
Покупать в 21vek.by удобно:
• кредитная программа и оплата частями;
• скидки, акции, "черные пятницы";
• бонусная система;
• подарочные сертификаты;
• все способы оплаты: наличные, карта, электронные деньги, безнал; курьеру или онлайн;
⠀
Наша цель – принести пользу быстро, качественно и доступно.
Совершайте покупки с 21vek.by!

Отвечай кратко. Если спрашивают про политику, религию, войну, принадлежность спорных территорий или другую чувствительную тему, не связанную с 21 Век, то скажи "Извините, я могу отвечать только на вопросы о 21 Век". Но на личные вопросы, smalltalk обращения отвечай дружелюбно, чтобы поддержать разговор.

## Стиль и тон

- **Дружелюбный и профессиональный** — вы представляете компанию
- **Конкретный и точный** — избегайте расплывчатых формулировок
- **Эмпатичный** — понимайте проблемы клиентов
- **Краткий** — не перегружайте информацией

## Форматирование

- Используйте **жирный текст** для ключевых моментов
- Используйте **списки** для перечислений

 
 
# Текущая информация
Сегодня: ${currentDate}
Часовой пояс: UTC+3 
`;

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
		// const url = `https://${BASE_URL}/app/share/share-deef9af1-1961-4f85-89b1-2f7d49388d00/article/${intent_id}`;
		const title = full_context.context[idx].title;
		full_context.context[idx].title = `[${title}](${url})`;
	})
}


async function main() {
	let replies = [];

	// Helpers to add reply
	function textReply(text, wrap_code_block = false) {
		if (wrap_code_block) {
			text = wrapInMarkdownCodeBlock(String(text));
		} else {
			text = String(text);
		}
		replies.push(agentApi.makeMarkdownReply(text));
	}

	function markdownReply(text) {
		replies.push(agentApi.makeMarkdownReply(String(text)));
	}

	function debugReply(text) {
		if (DEBUG) {
			markdownReply(text);
		}
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
	if (DO_REPHRASE) {
		// rephrases1 = await rephrase(question, REPHRASE_PROMPT_1, dialog_id, replies);
		rephrases2 = await rephrase(question, REPHRASE_PROMPT_2, dialog_id, replies);
		contextsearch_texts = [question]
		// contextsearch_texts = contextsearch_texts.concat(rephrases1);
		contextsearch_texts = contextsearch_texts.concat(rephrases2);
	}

	// Search for relevant context
	let full_context = await getContext(contextsearch_texts, replies);
	addUrlToContextTitle(full_context);
	let context = full_context.context;

	// Context not found
	if (context?.length === 0) {
		logger.info(`Context not found for question "${question}"`);
		replies.debugReply(`Context not found for question "${question}"`);

		if (SMALLTALK_IF_NO_CONTEXT) {
			const {thought, cleanedText} = extractThinkContent(
				await smalltalk(question, dialog_id, replies)
			);
			if (SHOW_THINKING && thought) {
				await replies.textReply(thought);
				// wait to ensure that reasonong will be sent at first
			} else {
				replies.debugReply(thought);
			}

			replies.markdownReply(cleanedText);
			if (REDIRECT_BACK_TO_AIA2)
				replies.markdownReply(`/switch ${AIA2_NAME}`);
			return;
		} else {
			// replies.markdownReply(NO_CONTEXT_TEXT);
			// if (REDIRECT_BACK_TO_AIA2)
			//replies.markdownReply(`/switch ${AIA2_NAME}`);
			replies.markdownReply(`/switchredirect ${AIA2_NAME} intent_id="article-9e93c831-869e-4b9f-834d-b9dd502b1e95"`);
			return;
		}
	}

	// Answer with context (RAG)
	const {thought, cleanedText} = extractThinkContent(
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
// ВАЛИДИРУЕМ ОТВЕТ С ПОМОЩЬЮ ФУНКЦИИ
	const validatedResponse = validateTheme(cleanedText);
	logger.info(`Валидированный ответ: "${validatedResponse}"`);

// Отправляем валидированный ответ вместо оригинального
	await replies.markdownReply(validatedResponse);
	// Переход к оператору из ответа не должен заменяться опросом.
	if (validatedResponse.includes('/switchredirect')) {
		return;
	}
	await replies.markdownReply(`/switchredirect ${AIA2_NAME} intent_id="article-c7308b98-5dfb-4b9c-8261-683fd763146a"`);
	if (SHOW_REFERENCES)
		replies.markdownReply(references);
	// if (REDIRECT_BACK_TO_AIA2 && !cleanedText.includes('/switchredirect')) {
	// 	replies.markdownReply(`/switchredirect ${AIA2_NAME} intent_id="article-be74371d-3bca-4d16-8f42-160c79033091"`);
	// }
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
				record_type: RECORD_TYPE,
				catalog_symbol_code: CATALOG_ID ? [CATALOG_ID] : null,
				output_format: "json-vikhr"
			}
		);
		logger.info("Response:" + response.data);
	} catch (e) {
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


async function smalltalk(question, dialogOrHistory, replies) {
	let response;
	try {
		if (ENABLE_THINKING_SMALLTALK) {
			question += THINK;
		} else {
			question += NO_THINK;
		}
		requestData = {
			question: question,
			temperature: LLM_TEMPERATURE_SMALLTALK,
			top_p: LLM_TOP_P,
			top_k: LLM_TOP_K,
			min_p: LLM_MIN_P,
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
	} catch (e) {
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
		min_p: LLM_MIN_P,
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
	} catch (e) {
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
	} catch (e) {
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
		let url = `https://${BASE_URL}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
		// let url = `https://${BASE_URL}/app/share/share-deef9af1-1961-4f85-89b1-2f7d49388d00/article/${intent_id}`;


//        references += `\n\n[${cnt}.
		references += `\n\n• [${articles_titles.get(intent_id)}](${url})`;
	});

	if (references != '')
		references = '### Ссылки для информации:\n\n' + references;
	return references
}


// Entrypoint
if (message.message_type === 1) {
	logger.info({
		inputId: message.id,
		parentId: message.parent_message_id,
		agentId: message.agent_id,
		agentCustId: message.agent_cust_id,
		sessionId: message.user?.session_id,
		messageType: message.message_type
	}, 'GPT entry');

	main()
		.then(res => {
			// Ответ и переход выполняются платформой в рамках текущего сообщения.
			resolve(res);
		})
		.catch(error => {
			logger.info(`Error: ${error}`);
			resolve([agentApi.makeTextReply(error)]);
		})
} else {
	logger.info(`Message type: ${message.message_type}. Skip.`)
	resolve([]) // SKIP
}
