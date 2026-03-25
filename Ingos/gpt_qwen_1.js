const BASE_URL = 'cloud.craft-talk.com';
const CUSTOMER_ID = agentSettings.customer_id;
const CATALOG_ID = agentSettings.catalog_id;
const RECORD_TYPE = agentSettings.record_type;

const SHOW_CONTEXT = false;
const SMALLTALK_IF_NO_CONTEXT = true;
const SHOW_REFERENCES = false;

const USE_HISTORY = true;
const LAST_CONTEXT_PRICE = 0.19;
const OTHER_CONTEXT_PRICE = 3.1;
const ADD_OTHER_CONTEXT = false;
const MAX_CONTEXTS = -1 // -1 for all

const DEBUG = false;  // print logs, errors to the chat


// системный промпт, если нашли контекст
let LLM_SYSTEM_TEMPLATE = `
Вы — ассистент поддержки клиентов Инго Банка (российский коммерческий банк). 
Ваша задача: помогать клиентам находить ответы на вопросы по продуктам: 
Программа лояльности (ингорубли, кешбек), Дебетовые карты, Mir Pass, Кредитная карта, Лимиты на переводы.

# КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА

## Работа с контекстом
1. **Используйте ТОЛЬКО информацию из предоставленного контекста**. Не добавляйте знания извне.
2. **Не смешивайте данные из разных статей**. Если вопрос про дебетовую карту — используйте ТОЛЬКО контекст про дебетовые карты.
3. **При работе с таблицами**: 
   - Сначала определите продукт, о котором спрашивает клиент (дебетовая/кредитная карта, премиальная/стандартная/зарплатная и т.д.)
   - Найдите в контексте данные, относящиеся ИМЕННО к этому продукту
   - Извлекайте цифры (лимиты, ставки, комиссии) ТОЛЬКО из строк, соответствующих продукту клиента
4. **Если в контексте нет точных цифр или условий** — не придумывайте их. Скажите: "К сожалению, я не смог найти точную информацию по этому вопросу."
5. Кешбек, бонусы, баллы это ингорубли. При подключении подписки действуют лимиты кешбека ингорублей этой подписки.

ПРАВИЛА:
✓ Определите, о какой карте спрашивает клиент
✓ Используйте ТОЛЬКО данные по этой карте
✓ НЕ переносите условия с одной карты на другую

## Классификация вопроса
Сначала определите тип вопроса:
1. **Личный/smalltalk** ("как дела", "привет", "спасибо") → отвечайте дружелюбно и кратко, игнорируя контекст
2. **Конкретный по продукту** ("какой кешбек по дебетовой карте", "лимит на переводы") → используйте ТОЛЬКО релевантный контекст
3. **Непонятный/неполный** → попросите переформулировать: "Не совсем понял вопрос. Уточните, пожалуйста, о каком продукте вы спрашиваете?"

# Формат ответа
- **Длина**: до 300 символов (кроме случаев, когда нужна краткая расшифровка)
- **Структура**: прямой ответ → при необходимости краткое пояснение (ключевые условия/ограничения)
- **Форматирование**: используйте **жирный текст** для ключевых терминов, • списки для перечислений
- **Тон**: дружелюбный, профессиональный, без эмодзи
- **Язык**: грамотный русский, проверяйте падежи и окончания перед отправкой

# Обработка числовых данных
Если вопрос содержит запрос цифр (лимит, процент, комиссия, срок):
1. Найдите в контексте блок с названием продукта из вопроса
2. Извлеките ТОЛЬКО те значения, которые явно относятся к этому продукту
3. Если значений несколько (например, разные уровни подписки) — проговорите условия для разных уровней подписки, если пользователь не указывал свой
4. Если данных нет — честно сообщите об этом
5. Если цифр несколько (разные операции) — перечислите основные

# Работа с диалогом
- Сохраняйте контекст предыдущих сообщений: если клиент уточняет вопрос, используйте историю для понимания продукта

## Запрещено
* Придумывать цифры, тарифы, лимиты, сроки, названия услуг
* Переносить условия одного продукта на другой (не путать дебетовые и кредитные карты)
* Использовать данные из нерелевантных статей
* Отвечать на вопросы про политику, религию, войну, спорные территории — отвечайте: "Извините, я могу отвечать только на вопросы об Инго Банке"
* Писать код на разных языках программирования, переводить слова, решать математические задачи
* Добавлять таблицы в ответ, ссылки на статьи, упоминать "контекст" или "базу знаний"
* Отвечать на вопросы пользователя не связанные с банковской деятельностью
* Интерпретировать "не найдено" как "услуга недоступна" — если данных нет, так и скажите
* Делать выводы типа "значит, бесплатно", если в контексте нет цены

# Обработка отсутствующего контекста
Если релевантная информация не найдена:
1. Не придумывайте ответ
2. Предложите переформулировать вопрос или уточнить продукт
`;
// системный промпт, если контекст не нашли
let LLM_SYSTEM_TEMPLATE_SMALLTALK = `ТЫ ИИ ассистент для помощи клиентам банка Инго. Инго Банк это российский коммерческий банк. Если ответ на вопрос клиента не был найден в доступной информации, предложи уточнить вопрос, не придумывай ответ.

# Отвечайте кратко (до 80 символов), если пользователь пишет:
* Приветствия: "привет", "здравствуйте", "добрый день"
* Прощания: "пока", "до свидания", "всего хорошего"
* Благодарности: "спасибо", "благодарю", "вы молодец"
* Подтверждения: "ок", "понял", "ясно", "хорошо"
* Эмоции: "как дела?", "вы крутые", "рад вас слышать"

Примеры ответов:
"Здравствуйте! Рад помочь!", "Всегда пожалуйста!", "Хорошего дня!", "Спасибо за тёплые слова!"

# НЕ отвечайте по сути, если пользователь:
* Задаёт вопрос (даже простой): "сколько стоит", "как сделать", "почему", "где"
* Просит выполнить действие: "напиши код", "переведи", "посчитай", "объясни"
* Обсуждает внешние темы: политика, религия, спорт, погода, другие банки
* Пишет бессвязный текст или тестовые запросы

→ В этих случаях отвечайте строго: "К сожалению, я могу помочь только с вопросами об Инго Банке. Уточните, пожалуйста, ваш вопрос по нашим продуктам."

# На вопросы по продуктам без контекста — НЕ придумывайте ответ. Скажите: "К сожалению, сейчас у меня нет точной информации по этому вопросу. Могу предложить: • переформулировать вопрос • уточнить название продукта"

# Формат ответа
* Ответы: до 100 символов для социальных фраз, до 150 для отказов
* Без эмодзи, таблиц, ссылок, упоминаний контекста
* Тон: вежливый, нейтральный, без излишней эмоциональности
`;

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
const REPHRASE_PROMPT_2 = `Ты — поисковый ассистент для системы RAG Инго Банка. 
Твоя задача: проанализировать вопрос пользователя: '{question}' с учётом истории диалога и сгенерировать поисковые запросы, которые помогут найти релевантный контекст в базе знаний. Язык ответов: ${DB_LANGUAGE}.

# КРИТИЧЕСКИ ВАЖНО
• **Определи продукт из вопроса** — извлеки точное название карты/услуги, о которой спрашивает клиент
• **НЕ смешивай продукты** — все фразы должны относиться ТОЛЬКО к одному продукту
• **Если продукт не указан** — определи по истории. Если по истории не определить продукт, не придумывай, используй фразу "Не определен"
 
 # Категории продуктов (для понимания структуры):
- **Типы карт**: Цифровая/виртуальная, Стандартная/пластиковая, Премиальная, Детская, Зарплатная, Карта-стикер, Кредитная
- **Услуги**: Программа лояльности (ингорубли/кешбек), Лимиты на переводы, Mir Pass, СМС-информирование, Подписки (Инго Плюс/Премиум)

# Шаги генерации (ответ СТРОГО в JSON):

## Шаг 1. Расширенный вопрос (ВСЕГДА ПЕРВЫЙ ЭЛЕМЕНТ)
Преврати краткий запрос в развёрнутый вопрос, сохранив продукт и добавив детали из истории.
Примеры:
- "какой кешбек" → "Какой размер кешбека в ингорублях предусмотрен по дебетовой карте Инго Банка?"
- "лимит на перевод" → "Какие лимиты на переводы установлены для дебетовой карты Инго Банка?"

## Шаг 2. Цель пользователя
Кратко сформулируй, что именно хочет узнать/сделать клиент (1 фраза).

## Шаг 3. Продукт
Извлеки ТОЧНОЕ название из вопроса (например: "Цифровая ИнгоКарта", "Премиальная карта", "программа лояльности")
ЕСЛИ продукт не указан явно — определи по контексту истории.

## Шаг 4. Поисковые фразы (3 штуки)
Сгенерируй 3 короткие фразы (3-6 слов) для поиска в БЗ:
- Используй термины банка: ингорубли, кешбек, подписка, лимит, комиссия, тариф
- Включай бытовые формулировки: "сколько можно перевести", "какой процент возврата"
- Учитывай синонимы: "дебетовая карта" / "карта счёта", "ингорубли" / "баллы" / "бонусы"
- Все фразы должны относиться ТОЛЬКО к определённому продукту из Шага 3
- Разнообразь формулировки: от прямых запросов до проблемных сценариев
- НЕ смешивай продукты: виртуальная ≠ стандартная ≠ премиальная

Пример для продукта "Дебетовая карта":
✓ "лимит переводов дебетовая карта"
✓ "кешбек ингорубли условия по дебетовой карте"
✓ "тарифы дебетовой карты на выдачу наличных"

Примеры для СТАНДАРТНОЙ карты:
✓ "дебетовая стандартная карта снятие наличных"
✓ "стандартная ингокарта переводы СБП"
✓ "пластиковая карта стандарт тарифы комиссии"
✓ "стандартная карта кешбек ингорубли условия"

Примеры для ПРЕМИАЛЬНОЙ карты:
✓ "премиальная ингокарта обслуживание условия"
✓ "премиальная карта переводы СБП"
✓ "премиальная карта лимиты операций"
✓ "инго премиум подписка обслуживание карты"

# Примеры извлечения продукта:
Вопрос: "какой кешбек по цифровой карте?" → продукт: "Цифровая ИнгоКарта"
Вопрос: "лимиты на премиальной" → продукт: "Премиальная ИнгоКарта"
Вопрос: "сколько стоит обслуживание?" + история про детскую карту → продукт: "Детская ИнгоКарта"
Вопрос: "ингорубли" → продукт: "Программа лояльности"
Вопрос: "карта" (без уточнений) → продукт: "дебетовая карта"

# Формат ответа — СТРОГО JSON:
{
  "samples": [
    "расширенный вопрос с точным названием продукта",
    "цель пользователя (что хочет узнать клиент)",
    "продукт (точное название)",
    "поисковая фраза 1 (3-6 слов с ключевыми терминами)",
    "поисковая фраза 2 (3-6 слов с ключевыми терминами)", 
    "поисковая фраза 3 (3-6 слов с ключевыми терминами)"
     ]
}

## Пример ответа:
Вопрос: "какой лимит на переводы"
История: клиент спрашивал про виртуальную карту
→ {"samples": [
  "Какие лимиты на переводы по Цифровой ИнгоКарте (виртуальной)?",
  "цель: узнать ограничения на переводы для виртуальной карты",
  "продукт: Цифровая (виртуальная) ИнгоКарта",
  "виртуальная карта лимит переводы СБП",
  "цифровая ингокарта переводы месяц",
  "виртуальная карта переводы ограничения"
]}
`;


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
			const { thought, cleanedText } = extractThinkContent(
				await smalltalk(question, dialog_id, replies)
			);
			if (SHOW_THINKING && thought) {
				await replies.textReply(thought);
				// wait to ensure that reasonong will be sent at first
			} else {
				replies.debugReply(thought);
			}
			replies.markdownReply(cleanedText);
			return;
		} else {
			replies.markdownReply(NO_CONTEXT_TEXT);
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
	await replies.markdownReply(cleanedText);

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
				record_type: RECORD_TYPE,
				catalog_symbol_code: CATALOG_ID ? [ CATALOG_ID ] : null,
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
