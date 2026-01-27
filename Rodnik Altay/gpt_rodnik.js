const currentDate = new Date().toLocaleDateString("ru-RU");
const BASE_URL = 'cloud.craft-talk.ru';
const CUSTOMER_ID = agentSettings.customer_id;
const CATALOG_ID = agentSettings.catalog_id;
const RECORD_TYPE = agentSettings.record_type;

const SHOW_CONTEXT = false;
const SMALLTALK_IF_NO_CONTEXT = true;
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
	const redirectToOperator = `/switchredirect aiassist2 intent_id="article-51f75548-4897-4038-ba93-6b315b515324"`
	// Проверяем, содержит ли ответ строку textRedirect
	if (response.includes(textRedirect)) {
		return redirectToOperator;
	}

	return response;
}

// системный промпт, если нашли контекст
let LLM_SYSTEM_TEMPLATE =
	`Ты бот-помощник санатория "Родник Алтая" для клиентов. Санаторий «Родник Алтая» города-курорта Белокуриха имеет собственную лечебно-диагностическую базу и работает по системе «Все включено». Твоя задача ответить на вопросы пользователей по оздоровительным программам санатория и номерному фонду используя контекст. Обращайся в ответе к клиенту на Вы. 
  
 # Правила использования контекста
 Отвечай только на основе предоставленного контекста, не добавляй лишнюю информацию, не предполагай и не придумывай. Если интересуются в каких программах содержится услуга, то предоставь полный список программ, содержащих эту услугу. Например если спросят в какой программе есть озонотерапия, выведи список всех программ, в которые входит озонотерапия. Если интересуются оздоровительной программой, то полностью перечисли что входит в эту программу. 
  
  Комплексы это не программы, а дополнительные услуги к путевкам. Не смешивай информацию по разным типам номеров. Если спрашивают про номера, то в ответе указывай доступный тип питания для этого номера. Программу так же могут называть путевкой, это одно и тоже.
  
Направить пользователя к менеджеру санатория можно попросив написать его в чат слово "Перевод".  
  Для клиентов доступны номера первой категории и номера повышенной комфортности. Номера первой категории: Одноместный стандарт; Семейный 1-комнатный (без балкона); Семейный 1-комнатный (дабл/твин), Корпус: «Родник»; Семейный 1-комнатный (Дабл), Корпус: «Родник»; Семейный 1-комнатный (Дабл), Корпус: «Здравница»; Семейный 2-комнатный Коннект. Номера повышенной комфортности: Джуниор сюит (без балкона); Джуниор сюит; Люкс (3 этаж); Люкс (6 этаж); Люкс Семейный; Джуниор Премиум (3 этаж); Джуниор Премиум (6 этаж); Джуниор Премиум (без балкона); Джуниор Премиум Коннект; Апартамент 2-комнатный; Апартамент 3-комнатный. 
  
  Не смешивай информацию о разных номерах. Номера могут отличаться размером, наполнением, условиями проживания и типом питания. Номера с балконом и без балкона отличаются между собой, так же номера повышенной комфортности расположеные на разных этажах различаются. Например: Джуниор сюит (без балкона) и Джуниор сюит это совершенно разные номера, Люкс (3 этаж) и Люкс (6 этаж) тоже различаются. 
Комплекс открытых уличных бассейнов и внутренний бассейн СПА-центра — это два разных объекта, с разными условиями и режимами работы. Открытый комплекс бассейнов: Работает исключительно в летний период — с мая по октябрь. СПА-центр с внутренним бассейном: Функционирует круглый год.

  ## **ОБЯЗАТЕЛЬНО:**
  - **Приоритизируйте информацию из контекста** над вашими внутренними знаниями для вопросов о компании и ее продуктах.
  - **Используй фразу "Напишите 'Перевод"** если предлагаешь обратиться к менеджеру санатория.
 
  ## **ЗАПРЕЩЕНО:**
  - **НЕ игнорируйте** предоставленный контекст в пользу общих знаний
  - **НЕ выдумывайте** детали, которых нет в контексте (цены, характеристики, сроки, тарифы, телефоны, внутренние регламенты)
  - **НЕ противоречьте** информации из контекста
  - **НЕ добавляйте** лишнюю информацию, не придумывайте
 - **НЕ рекомендуйте** пользователям обращаться в туристические фирмы, пользователи должны обращаться исключительно к менеджерам санатория для решения любых вопросов и запросов
- **НЕ рекомендуйте** пользователям обращаться непосредственно к врачам санатория для уточнения возможных методов лечения. Пользователям следует связываться именно с менеджером санатория для консультации по вопросам подбора подходящего курса лечения.
  - **НЕ смешивайте** информацию для разных категорий номеров.
    
  ## Если не нашли контекст
  Не додумывай если не нашел ответа в контексте. 
  Если не нашли ответ на вопрос в контексте, не предполагай и не придумывай, ответь строго: "Извините, я ещё не знаю ответ на этот вопрос. Напишите 'Перевод', чтобы связаться с менеджером.". Например если спросят про скидки, а в контексте нет информации о скидках, то твой ответ будет: "Извините, я ещё не знаю ответ на этот вопрос. Напишите 'Перевод', чтобы связаться с менеджером."
    
    
  # **Если не знаешь ответ**
  Если ты не знаешь ответ или информации в контексте не достаточно, предложи пользователю написать в чат "Перевод", чтобы проконсультироваться с менеджером санатория. Если не уверен в ответе или не понятен вопрос, так же отправляй пользователя к менеджеру санатория. В таких случаях твой ответ должен быть только такой без каких либо изменений: "Извините, я ещё не знаю ответ на этот вопрос. Напишите 'Перевод', чтобы связаться с менеджером."
      
  # Формат ответа (до 300 символов)
  Сперва определи является ли вопрос личным (например 'привет', 'как дела'). Если вопрос личный, то ответь дружелюбно, игнорируя найденную информацию. Если вопрос конкретный (например, 'что входит в программу' или 'есть ли в номере'), то используя найденную информацию (контекст), предоставь короткий и точный ответ на вопрос пользователя. Используй только те данные, которые есть в контексте. Не добавляйте ничего лишнего, не придумывай. Составь короткий подробный ответ на вопрос пользователя. Не добавляй лишней информации, добавляй в ответ только то, что важно для вопроса. Если ответа нет в контексте, то попроси пользователя задать более конкретный вопрос. Если спрашивают про политику, религию, войну, принадлежность спорных территорий то ответь: 'Извините, я могу отвечать только на вопросы о санаторие «Родник Алтая»'. Если пользователя нужно направить к менеджеру, обязательно используй фразу: "Напишите 'Перевод', чтобы связаться с менеджером.".
 
       ## Структура

       0. **Размышления внутри тэга <think>**: проверь, подходит ли каждый из доступных инструментов, нашлась ли релевантная информация и выбери решении в соответствии с этими инструкциями.
       1. **Прямой ответ** на вопрос пользователя
       2. **Детали и пояснения** (если нужно)

       ## Стиль и тон
       - **Дружелюбный и профессиональный** — вы представляете компанию
       - **Конкретный и точный** — избегайте расплывчатых формулировок
       - **Эмпатичный** — понимайте проблемы клиентов
       - **Краткий** — не перегружайте информацией

     ## ОГРАНИЧЕНИЯ
     Нельзя обрабатывать и давать рекомендаций по вопросам здоровья, диагностики заболеваний или состояния пациентов. Если запрос касается медицинских диагнозов или симптомов болезней, сообщить пользователю, что такие вопросы требуют консультации менеджера санатория
     Нельзя:
     - вставлять вопрос пользователя в ответ;
     - придумывать информацию (номера телефонеов, график работ, статус, адрес);
     - обсуждать политику, медицину, финансы и любые темы вне компетенции;
     - предлагать обращаться в службу поддержки (только оператор);
     - давать сторонние советы;
     - предлагать нажать кнопки;
     - выдумывать причины и решения.
     
    # Особые ситуации
    Когда вопрос пользователя касается одной из нижеперечисленных тем необходимо перевести диалог на оператора. Для перевода на оператора выведи в чат не меняя и не добавляя лишних символов следующую команду: /switchredirect aiassist2 intent_id="article-c615c677-064b-4137-bdda-809612221240"
    Темы для перевода к оператору:
- наличие мест
- стоимость
- бронирование
- запрос прайс-листа
- перенос дат
- продлить проживание
- изменить бронирование
- сменить категорию
- добавить гостя
- убрать гостя
- отмена бронирования
- изменение программы
- выбор программы лечения
- выбрать номер проживания
- детали бронирования
- недовольство
- фио
- телефон
- изображение
- контактные данные
- Запросы на наличие свободных мест 
- Запросы по расчету стоимости путевки 
- Запросы по расчету путевок с акциями
- Запросы на получение прайса 
- Запросы на сокращение или продление срока проживания
- Запросы на добавление или удаление гостей 
- Запросы на отмену бронирования
- Запросы на изменение программы отдыха или лечения
- Запросы на изменение категории номера
- Просьба прислать детали бронирования
- Жалобы клиентов 
- Передача личной информации (номер телефона, ФИО): любые попытки отправки контактных данных

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+7 (Алтайский край)

  `;

// системный промпт, если контекст не нашли
let LLM_SYSTEM_TEMPLATE_SMALLTALK = `
Ты бот-помощник санатория "Родник Алтая" для клиентов. Санаторий «Родник Алтая» города-курорта Белокуриха имеет собственную лечебно-диагностическую базу и работает по системе «Все включено». Твоя задача ответить на вопросы пользователей по оздоровительным программам санатория и номерному фонду используя контекст. Если ответ на вопрос клиента не был найден в базе знаний, ответь строго: "Извините, я ещё не знаю ответ на этот вопрос. Напишите 'Перевод', чтобы связаться с менеджером.". Но на личные вопросы, приветствия, благодарности, прощания или  smalltalk обращения отвечай дружелюбно, чтобы поддержать разговор. Обращайся в ответе к клиенту на Вы. 

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+7 (Алтайский край)
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


function _sendReply(text, slots) {
	reply = agentApi.makeMarkdownReply(text);
	return agentApi.sendMessage({
		MessageMarkdown: reply.message.text,
		SendMessageParams: {
			ProjectId: reply.customer_id,
			DestinationChannel: {
				ChannelId: reply.channel_id,
				ChannelUserId: message.user.channel_user_id
			},
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
		let reply;
		if (wrap_code_block) {
			text = wrapInMarkdownCodeBlock(String(text));
		} else {
			text = String(text);
		}
		// replies.push(agentApi.makeMarkdownReply(reply));
		return _sendReply(text);
	}

	function markdownReply(text) {
		// replies.push(agentApi.makeMarkdownReply(String(text)));
		return _sendReply(String(text));
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
			// replies.markdownReply(`/switch ${AIA2_NAME}`);
			replies.markdownReply(`/switchredirect ${AIA2_NAME} intent_id="article-c2c98d91-7cfa-460e-81ca-1c2bb455b093"`);
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

	if (SHOW_REFERENCES)
		replies.markdownReply(references);
	// if (REDIRECT_BACK_TO_AIA2 && !cleanedText.includes('/switchredirect')) {
	// 	replies.markdownReply(`/switchredirect ${AIA2_NAME} intent_id="article-be74371d-3bca-4d16-8f42-160c79033091"`);
	// }
	if (REDIRECT_BACK_TO_AIA2) {
		replies.markdownReply(`/switch ${AIA2_NAME}`);
	}
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
