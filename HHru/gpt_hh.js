const BASE_URL = 'cloud.craft-talk.ru';
const CUSTOMER_ID = agentSettings.customer_id;
const CATALOG_ID = agentSettings.catalog_id;
const RECORD_TYPE = agentSettings.record_type;

const SHOW_CONTEXT = false;
const SMALLTALK_IF_NO_CONTEXT = true;
const SHOW_REFERENCES = false;

const REDIRECT_BACK_TO_AIA2 = false;
const AIA2_NAME = "aiassist2";

const USE_HISTORY = false;
const LAST_CONTEXT_PRICE = 0.19;
const OTHER_CONTEXT_PRICE = 3.1;
const ADD_OTHER_CONTEXT = false;
const MAX_CONTEXTS = -1 // -1 for all

const DEBUG = false;  // print logs, errors to the chat
const SKIP_RAG = true;

// ФУНКЦИЯ ВАЛИДАЦИИ ТЕМАТИКИ - ИЗВЛЕКАЕТ НАЗВАНИЕ ДАЖЕ ИЗ НЕФОРМАТИРОВАННЫХ ОТВЕТОВ
function validateTheme(response) {
	const allowedThemes = [
		"Благоустройство", "ЖКХ", "Здравоохранение", "Культура", "Образование",
		"Экономика и бизнес", "Дороги", "Связь и телевидение", "Сельское хозяйство и охота",
		"Социальное обслуживание и защита", "Труд и занятость", "Строительство и архитектура",
		"Общественный транспорт", "Физическая культура и спорт", "Молодежная политика",
		"Обращение с отходами", "Экология", "Военная служба", "Туризм", "Энергетика",
		"Безопасность и правопорядок", "Имущественные и земельные отношения",
		"Межнациональные отношения", "Органы власти и подведомственные учреждения",
		"Спам", "Другая тематика"
	];

	const cleanResponse = response.trim();

	// Ищем любую тематику в тексте
	for (const theme of allowedThemes) {
		if (cleanResponse.includes(theme)) {
			return theme;
		}
	}

	return "Другая тематика";
}

// системный промпт, если нашли контекст
let LLM_SYSTEM_TEMPLATE = `
Ты — эксперт по классификации текстов обращений граждан.

ТВОЯ ЗАДАЧА:
1. Определи тему обращения из списка категорий ниже.
2. Отвечай ТОЛЬКО названием категории — без кавычек, без точки, без пояснений.
3. Если текст не содержит обращения, вопроса или проблемы — отвечай "Спам".

СПИСОК ВСЕХ КАТЕГОРИЙ (отвечай только одной из них):
Благоустройство, ЖКХ, Здравоохранение, Культура, Образование,
Экономика и бизнес, Дороги, Связь и телевидение, Сельское хозяйство и охота,
Социальное обслуживание и защита, Труд и занятость, Строительство и архитектура,
Общественный транспорт, Физическая культура и спорт, Молодежная политика,
Обращение с отходами, Экология, Военная служба, Туризм, Энергетика,
Безопасность и правопорядок, Имущественные и земельные отношения,
Межнациональные отношения, Органы власти и подведомственные учреждения,
Спам, Другая тематика

ПРИЗНАКИ СПАМА:
- Рекламные сообщения
- Поздравления и благодарности без просьбы или жалобы
- Репосты новостей без вопроса
- Бессмысленные или случайные тексты
- Приветствия и общие фразы без предмета обращения

ОСНОВНЫЕ ПРАВИЛА:
- Если обращение содержит признаки нескольких тем, выбери ту, которая отражает основной мотив.
- Если обращение не подходит ни под одну категорию, но явно содержит запрос, выбери "Другая тематика".
- Игнорируй приветствия, подписи и вежливые фразы, классифицируй по смыслу.
- Название категории пиши с заглавной буквы, точно как в списке выше.

ПРАВИЛА РАЗГРАНИЧЕНИЯ ТЕМ:

Безопасность и правопорядок — угрозы людям, детям, животным; нападения, правонарушения, полиция, общественная безопасность, нарушения ПДД.
  - Бродячие или агрессивные собаки — Безопасность и правопорядок.
  - Мусор и собаки: если основной мотив — опасность, это Безопасность и правопорядок; если уборка — Обращение с отходами.

Обращение с отходами — вывоз мусора, контейнеры, свалки, урны, операторы ТКО, раздельный сбор.
  - Неубранный мусор, переполненные баки — Обращение с отходами.
  - Акцент на антисанитарию и угрозу здоровью — Безопасность и правопорядок.

Экология — загрязнение воздуха, воды, почвы, выбросы, экологические риски, охрана природы.
  - Уборка мусора — Обращение с отходами, не Экология.

ЖКХ — эксплуатация и обслуживание многоквартирных домов: фасады, крыши, подъезды, подвалы, отопление, вода, лифты, счётчики, капремонт дома, УК.
  - Капремонт жилого дома — ЖКХ.
  - Строительство новых зданий — Строительство и архитектура.

Строительство и архитектура — проектирование, возведение и ввод новых объектов, подрядчики, торги, госзаказы, стройка.
  - Школа, садик или учебное учреждение — Образование (даже если речь о строительстве).
  - Капремонт жилого дома — ЖКХ.

Военная служба — СВО, ВБД, военкоматы, удостоверения, военные льготы, выплаты, мобилизация, призыв.
  - Если упомянут военный статус — приоритетно Военная служба, даже если тема касается выплат, МФЦ или ЖКХ.

Социальное обслуживание и защита — пособия, субсидии, льготы (не военные), доступная среда, соцподдержка, пенсионеры, ОВЗ.
  - Льготы по статусу СВО или ВБД — Военная служба.

Органы власти и подведомственные учреждения — работа МФЦ, ГАИ (очереди, экзамены), министерств, администраций; приём граждан, госуслуги, регламенты.
  - О нарушении ПДД или угрозе на дороге — Безопасность и правопорядок.

Энергетика — газификация, электроснабжение, уличное освещение, подключение домов к сетям, перебои света (не в квартире).
  - Газификация района — Энергетика.
  - Отопление в квартире — ЖКХ.

Благоустройство — дворы, детские и спортивные площадки, лавочки, озеленение, уборка двора, внутридворовые дороги, освещение двора.
  - Дорога во дворе — Благоустройство.
  - Улица или трасса — Дороги.

Дороги — улично-дорожная сеть, трассы, мосты, ямы, ремонт покрытия, тротуары, обочины, знаки, светофоры.
  - Внутридворовые проезды — Благоустройство.

Образование — школы, детские сады, вузы, колледжи, нехватка мест, питание, ремонт школ.
  - "Построить школу" — Образование, не Строительство.

Здравоохранение — поликлиники, больницы, ФАПы, приём врачей, качество лечения, лекарства, запись к врачу, скорая.
  - Сотрудник больницы жалуется на увольнение — Труд и занятость.

Труд и занятость — работа, приём/увольнение, трудовые договоры, зарплата, условия труда, сокращения, права работников.
  - Врач или учитель, но проблема в трудовых отношениях — Труд и занятость.

Общественный транспорт — маршруты, расписания, остановки, павильоны, городские/междугородние рейсы, авиарейсы, метро, электрички.
  - Авиарейсы и билеты — Общественный транспорт, не Туризм.

Туризм — путешествия, отдых, турмаршруты, гостиницы, экскурсии.
  - Авиарейсы или расписание аэропорта — Общественный транспорт.

Культура — музеи, театры, библиотеки, концерты, памятники, парки культуры, дома культуры, культурные мероприятия.
  - Строительство/ремонт объекта культуры — Культура, не Строительство.

Физическая культура и спорт — стадионы, спортзалы, секции, соревнования, спортивные мероприятия.
  - Спортивная площадка во дворе (как объект) — Благоустройство.

Молодежная политика — молодёжные центры, форумы, гранты, волонтёрство, патриотическое воспитание, мероприятия для молодёжи.

Связь и телевидение — интернет, телефонная/мобильная связь, телевидение, цифровое вещание, почта.

Экономика и бизнес — предпринимательство, налоги, госзакупки, торговля, цены, ярмарки, поддержка бизнеса.

Сельское хозяйство и охота — фермерство, животноводство, посевы, охота, рыболовство, ветеринария, земли с/х назначения.

Имущественные и земельные отношения — земельные участки, аренда, приватизация, кадастр, недвижимость, границы, наследование.

Межнациональные отношения — межнациональные конфликты, миграция, этнические вопросы, национально-культурные объединения.

Другая тематика — ни к чему не относится из списка выше, но содержит явный запрос или обращение.

ПРИОРИТЕТЫ (если совпадают несколько тем):
1. Военная служба > Социальное обслуживание, ЖКХ
2. Безопасность и правопорядок > Экология, Обращение с отходами
3. ЖКХ > Строительство (если объект — жилой дом)
4. Энергетика > ЖКХ (если речь о сетях/газификации)
5. Органы власти > общие темы (работа госорганов, МФЦ, ГАИ)
6. Благоустройство > Дороги (если речь о дворах)
7. Образование > Строительство (школы/сады)
8. Труд и занятость > Здравоохранение, Образование (трудовые отношения)
9. Культура > Строительство (объекты культуры)
10. Общественный транспорт > Туризм (авиарейсы, билеты)

ФОРМАТ ОТВЕТА:
- Только одно название категории из списка выше (с заглавной буквы).
- Никаких кавычек, точек, пояснений.
- Если нет обращения — "Спам".
- Примеры правильных ответов: Благоустройство | Спам | Другая тематика
`;

// системный промпт, если контекст не нашли
let LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE;

// user prompt, который будет отправляться на каждый запрос, когда нашелся контекст
let RAG_TEMPLATE = `{question}

# Найденная информация:

{context}"`;

const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`;

const RAG_JOIN_SEP = "\n\n...\n\n";
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
			OmniUserId: reply.omni_user_id,
			Sender: {},
			FilledSlots: slots,
		}
	}, logger).catch(e => logger.info(`Error sending reply: ${e}.`));
}

function wrapInMarkdownCodeBlock(str) {
	const escapedStr = str.replace(/(?<!\\)```/g, '\\```');
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
		cleanedText: cleanedText,
		thought: thoughtContent ? '*Мои размышления:* \n\n' + thoughtContent : thoughtContent
	};
}

function addUrlToContextTitle(full_context) {
	full_context.symbol_code.forEach((intent_id, idx) => {
		const url = `https://${BASE_URL}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
		const title = full_context.context[idx].title;
		full_context.context[idx].title = `[${title}](${url})`;
	})
}

async function main() {
	let replies = [];
	function textReply(text, wrap_code_block=false) {
		let reply;
		if (wrap_code_block) {
			text = wrapInMarkdownCodeBlock(String(text));
		} else {
			text = String(text);
		}
		return _sendReply(text);
	}
	function markdownReply(text) {
		return _sendReply(String(text));
	}
	function debugReply(text) {
		if (DEBUG) {
			return _sendReply(String(text));
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
			replies.textReply(`/switchredirect ggl_rest`);
		} else {
			replies.textReply(`/switchredirect ggl_rest`);
		}
		if (DEBUG) {
			replies.debugReply(`ERROR: ${e}`);
			replies.debugReply(e.stack);
		}
		return replies;
	}
}

async function _main(replies) {
	let question = message.message.text;
	let dialog_id = null;
	if (USE_HISTORY) {
		const dialog_response = await agentApi.getDialogId(
			message.user.omni_user_id,
			message.user.customer_id
		);
		dialog_id = dialog_response.Response;
	}

	let contextsearch_texts = question;
	if (DO_REPHRASE) {
		rephrases2 = await rephrase(question, REPHRASE_PROMPT_2, dialog_id, replies);
		contextsearch_texts = [question]
		contextsearch_texts = contextsearch_texts.concat(rephrases2);
	}

	let full_context = await getContext(contextsearch_texts, replies);
	addUrlToContextTitle(full_context);
	let context = full_context.context;

	if (context?.length === 0 || SKIP_RAG) {
		logger.info(`Context not found for question "${question}"`);
		replies.debugReply(`Context not found for question "${question}"`);

		if (SMALLTALK_IF_NO_CONTEXT) {
			const { thought, cleanedText } = extractThinkContent(
				await smalltalk(question, dialog_id, replies)
			)

			if (SHOW_THINKING && thought) {
				await replies.textReply(thought)
			} else {
				replies.debugReply(thought)
			}

			// ИСПОЛЬЗУЕМ ФУНКЦИЮ ВАЛИДАЦИИ ДЛЯ ИЗВЛЕЧЕНИЯ ТЕМАТИКИ
			const theme = validateTheme(cleanedText.trim())
			logger.info(`Определена тематика: "${theme}"`)

			return resolve([
				agentApi.makeTextReply("", undefined, undefined, { theme }),
				agentApi.makeTextReply(
					//`/switchredirect finishdialog`
					`/switchredirect aiassist2 intent_id="article-7d1f967a-9a3a-4f27-a087-b4c748c0e0e6"`
				),
			])
		}
		else {
			replies.markdownReply(NO_CONTEXT_TEXT);
			if (REDIRECT_BACK_TO_AIA2)
				replies.markdownReply(`/switch ${AIA2_NAME}`);
			return;
		}
	}

	const { thought, cleanedText } = extractThinkContent(
		await rag(question, context, dialog_id, replies)
	);

	let references = '';
	if (SHOW_REFERENCES) {
		references = getReferences(full_context);
	}

	if (SHOW_THINKING && thought) {
		await replies.textReply(thought);
	} else {
		replies.debugReply(thought);
	}
	await replies.markdownReply(cleanedText);

	if (SHOW_REFERENCES)
		replies.markdownReply(references);
	if (REDIRECT_BACK_TO_AIA2)
		replies.markdownReply(`/switch ${AIA2_NAME}`);

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
				catalog_symbol_code: CATALOG_ID ? [ CATALOG_ID ] : null,
				output_format: "json-vikhr"
			}
		);
		logger.info("Response:" + response.data);
	} catch(e) {
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
		if (ENABLE_THINKING_SMALLTALK){
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
		logger.info(`Error requesting LLM: ${e}.`);
		replies.debugReply(`Error requesting LLM: ${e}.`);
		_debugAxiosError(e, replies);
		throw e;
	}
	return response.data.answer;
}

async function rag(question, context, dialogOrHistory, replies) {
	let response;
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
		logger.info(`Error requesting LLM: ${e}.`);
		replies.debugReply(`Error requesting LLM: ${e}.`);
		_debugAxiosError(e, replies);
		throw e;
	}
	return response.data.texts;
}

function _debugAxiosError(error, replies) {
	if (error.response) {
		replies.debugReply(JSON.stringify(error.response.data, null, 2));
		replies.debugReply(error.response.status);
		replies.debugReply(error.response.headers);
	} else if (error.request) {
		replies.debugReply(error.request);
	} else {
		replies.debugReply('Error', error.message);
	}
}

function getReferences(full_context) {
	let references = '';
	const articles_counts = new Map();
	const articles_titles = new Map();
	full_context.symbol_code.forEach((intent_id, idx) => {
		const prev_count = articles_counts.get(intent_id) || 0;
		articles_counts.set(intent_id, prev_count + 1);
		articles_titles.set(intent_id, full_context.title[idx]);
	});

	const sorted_counts = Array.from(articles_counts.entries())
		.sort((a, b) => b[1] - a[1]);

	sorted_counts.forEach(([intent_id, cnt]) => {
		let url = `https://${BASE_URL}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
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
			resolve([]);
		})
		.catch(error => {
			logger.info(`Error: ${error}`);
			resolve([agentApi.makeTextReply(error)]);
		})
} else {
	logger.info(`Message type: ${message.message_type}. Skip.`)
	resolve([])
}