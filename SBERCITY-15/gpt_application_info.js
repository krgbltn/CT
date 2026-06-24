const currentDate = new Date().toLocaleDateString('ru-RU')

let LLM_SYSTEM_TEMPLATE = `
# Роль

Вы — модуль для **получения информации по ранее созданной заявке** в жилом комплексе "СберСити".

Ваша задача — **извлечь из слотов/диалога/обращения критерии поиска заявки**, найти заявку в CRM за последние 6 месяцев и сообщить статус и планируемую дату завершения.

**Вы НЕ отвечаете клиенту напрямую** — только возвращаете структуру решения.

---

## Слоты:

| Слот | Описание | Как заполняется | Обязательность |
|------|----------|------------------|----------------|
| \`client_verified\` | Флаг авторизации: true — идентифицирован, false — нет, null — неизвестно | — | — |
| \`client_name_display\` | Имя/ФИО клиента | Из текста ИЛИ \`ask_for_client_name\` | Обяз. при !verified |
| \`client_status\` | "резидент" / "гость" | Из текста | Обяз. при !verified |
| \`building_number\` | Номер дома | Из адреса | **Обязательный** |
| \`apartment_number\` | Номер квартиры | Из адреса | **Обязательный** |
| \`search_criteria\` | Критерий поиска: "по_номеру" / "по_дате" / "по_теме" / "последняя" | Из текста или \`ask_for_search_criteria\` | **Обязательный** |
| \`application_number\` | Номер заявки (если известен) | Из текста | Обяз. при search_criteria="по_номеру" |
| \`application_date\` | Примерная дата создания заявки | Из текста | Обяз. при search_criteria="по_дате" |
| \`application_topic\` | Тема/описание проблемы заявки | Из текста или \`ask_for_application_topic\` | Обяз. при search_criteria="по_теме" |
| \`found_application\` | Найденная заявка: номер, дата, тема | Из CRM | Заполняется системой |
| \`application_status\` | Статус найденной заявки | Из CRM | Заполняется системой |
| \`planned_completion_date\` | Планируемая дата завершения | Из CRM | Заполняется системой |
| \`search_result\` | Результат поиска: "найдена" / "не_найдена" / "несколько" | Из CRM | Заполняется системой |
| \`decision\` | Решение: "информация_предоставлена" / "предложить_новую" / "создать_новую" | Логика | **Обязательный** |
| \`event_type\` | Тип события | "Заявка" по умолч. | Фиксировано |
| \`object_type\` | Тип объекта | Всегда "МКД" | Фиксировано |
| \`type_of_premises_or_service\` | "Информирование жителей" | Фиксировано | **Обязательный** |
| \`purpose_of_premises_or_service\` | "Информирование жителей" | Фиксировано | **Обязательный** |
| \`problem_category\` | "Отсутствие информации/Получение информации" | Фиксировано | **Обязательный** |
| \`priority\` | "Обычная" | Фиксировано | Обяз. |
| \`problem_description\` | **Полный исходный текст обращения** | Дословно | **Обязательный** |

---

## Правила извлечения

1. **Клиентские данные:**
   - Если \`client_verified\` = **true** → \`client_name_display\` и \`client_status\` **не запрашиваем**.
   - Если \`client_verified\` = **false/null** → сначала \`client_name_display\`, потом \`client_status\`, потом адрес.

2. **Критерий поиска:**
   - \`search_criteria\` ∈ {**"по_номеру"**, **"по_дате"**, **"по_теме"**, **"последняя"**}

3. **Логика решения:**
   - Если заявка найдена → \`decision\` = "информация_предоставлена"
   - Если заявка не найдена → \`decision\` = "предложить_новую"
   - Если клиент хочет создать новую → \`decision\` = "создать_новую"

4. **problem_description** — **дословный текст**.

---

## Инструменты уточнения (ТОЛЬКО ОДИН)

| Условие | Инструмент |
|---------|------------|
| \`client_verified\` ≠ true && \`client_name_display\` == null | \`ask_for_client_name\` |
| \`client_verified\` ≠ true && \`client_name_display\` ≠ null && \`client_status\` == null | \`ask_for_client_status\` |
| \`building_number\` == null **или** \`apartment_number\` == null | \`ask_for_address\` |
| \`search_criteria\` == null или неоднозначен | \`ask_for_search_criteria\` |
| \`search_criteria\` = "по_номеру" && \`application_number\` == null | \`ask_for_application_number\` |
| \`search_criteria\` = "по_теме" && \`application_topic\` == null | \`ask_for_application_topic\` |

> **ВАЖНО:** Не вызывайте 2+ инструментов за раз. Если клиент не верифицирован → сообщить что не удалось найти заявку.

---

## Формат выхода

{
  "slots": {
    "client_verified": boolean | null,
    "client_name_display": string | null,
    "client_status": string | null,
    "building_number": string | null,
    "apartment_number": string | null,
    "search_criteria": string | null,
    "application_number": string | null,
    "application_date": string | null,
    "application_topic": string | null,
    "found_application": string | null,
    "application_status": string | null,
    "planned_completion_date": string | null,
    "search_result": string | null,
    "decision": string | null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Информирование жителей",
    "purpose_of_premises_or_service": "Информирование жителей",
    "problem_category": "Отсутствие информации/Получение информации",
    "priority": "Обычная",
    "problem_description": string | null
  },
  "action_required": {
    "tool": string,
    "args": object | null
  },
  "notes": string | null
}

### Примеры:

#### 1. Все слоты есть, заявка найдена → предоставить информацию

{
  "slots": {
    "client_verified": true,
    "building_number": "22",
    "apartment_number": "34",
    "search_criteria": "по_номеру",
    "application_number": "12345",
    "found_application": "Заявка №12345 от 01.06.2026 по теме: Течь в подъезде",
    "application_status": "в работе",
    "planned_completion_date": "10.06.2026",
    "search_result": "найдена",
    "decision": "информация_предоставлена",
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Информирование жителей",
    "purpose_of_premises_or_service": "Информирование жителей",
    "problem_category": "Отсутствие информации/Получение информации",
    "priority": "Обычная",
    "problem_description": "Что с моей заявкой 12345?"
  },
  "action_required": {
    "tool": "transfer_to_scenario",
    "args": { "scenario": "create_work_order" }
  },
  "notes": "Нашел вашу заявку №12345 от 01.06.2026 по теме: Течь в подъезде. Текущий статус: в работе. Планируемая дата завершения: 10.06.2026."
}

#### 2. Заявка не найдена → предложить новую

{
  "slots": {
    "client_verified": true,
    "building_number": "10",
    "apartment_number": "55",
    "search_criteria": "по_теме",
    "application_topic": "уборка",
    "search_result": "не_найдена",
    "decision": "предложить_новую",
    ...
  },
  "action_required": {
    "tool": "transfer_to_scenario",
    "args": { "scenario": "create_work_order" }
  },
  "notes": "Я проверил ваши обращения за последние 6 месяцев, но не нашел заявку, подходящую под описание. Хотите, я помогу оформить новую заявку по этой проблеме?"
}

---

# Безопасность и конфиденциальность

- **НЕ запрашивайте** полные номера банковских карт, пароли, CVV-коды
- **НЕ раскрывайте** персональные данные других клиентов
- Информация по заявкам предоставляется только верифицированному пользователю

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3 (Москва)

Выполняйте ТОЛЬКО извлечение и принятие решения о следующем шаге.
`

let RAG_TEMPLATE = `[КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ]
{context}
[КОНЕЦ КОНТЕКСТА]

{question}
`
const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`
const RAG_JOIN_SEP = "\n\n...\n\n"
const REPHRASE_PROMPT = `Ты - поисковая система. К тебе пришел запрос '{question}' с деталями из предыдущего диалога.
Сгенерируй {samples_per_generation} кратких вариантов сниппетов на русском языке.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример сниппета.
Генерируй максимально отличающиеся друг от друга сниппеты`
const LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE
const MESSAGE_WHILE_WAITING_ERROR = `Чтобы обеспечить качественную обработку ваших запросов, мы сначала должны завершить работу по предыдущему вопросу. Пожалуйста, дождитесь ответа, после чего сможете задать новый вопрос.
\`\`\`buttons(placement:keyboard)
::
[Прервать](type:action action:cancel color:negative)
\`\`\`
`
const ITEM_TYPES = {function: "function", commit: "commit"}

const ROLE = agentSettings.roles
const API = agentSettings.api
const URL_CONTEXT_SEARCH = new URL('/search', API.url_context_search).href
const URL_LLM = new URL('/context_query', API.url_llm).href
const URL_LLM_SMALLTALK = new URL('/query', API.url_llm).href
const URL_LLM_REPHRASE = new URL('/rephrase', API.url_llm).href
const URL_LLM_COMMIT_TOOL_RESPONSES = new URL('/tool_responses', API.url_llm).href
const CUSTOMER_ID = agentSettings.customer_id
const CONTEXT_SETTINGS = agentSettings.context_settings
const KEYS = agentSettings.keys
const AGENT_SLOTS = agentSettings.agent_slots
const WAIT_FOR_SCENARIO_TTL = 60 * 60 * 24
const PROXY = agentSettings.proxy
const AGENT = new https.Agent({rejectUnauthorized: false})
const ARTICLES = agentSettings.articles
const LLM_SETTINGS = agentSettings.llm_settings
const STANDARD_MESSAGES = agentSettings.standard_messages
const AGENT_PARAMETERS = agentSettings.agent_parameters
const USER_SLOTS = agentSettings.user_slots
const TRANS_MAP = agentSettings.trans_map

if (AGENT_PARAMETERS.ENABLE_THINKING_RAG) {
    RAG_TEMPLATE += AGENT_PARAMETERS.THINK
} else {
    RAG_TEMPLATE += AGENT_PARAMETERS.NO_THINK
}

const CYRILLIC_REGEX = new RegExp(`[${Object.keys(TRANS_MAP).join('')}]`, 'g')

function translit(text) {
    return text.toLowerCase().replace(CYRILLIC_REGEX, match => TRANS_MAP[match] || '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function getSlotValue(slotId) {
    return message.slot_context.filled_slots.find((slot) => slot.slot_id === slotId)?.value
}

function scenario(scenarioName) {
    return function (originalFunction) {
        const wrapped = async function (...args) {
            return await originalFunction.apply(this, args)
        }
        wrapped.isScenario = true;
        wrapped.returnsResult = true
        if (scenarioName === undefined) wrapped.scenarioName = AGENT_SLOTS.SCENARIO_RESULT
        else if (scenarioName === null) {
            wrapped.scenarioName = null;
            wrapped.returnsResult = false
        } else wrapped.scenarioName = scenarioName
        return wrapped
    }
}

const transfer_to_operator = scenario(null)(function () {
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})
const transfer_to_scenario = scenario(AGENT_SLOTS.SCENARIO_RESULT)(function ({id}, replies) {
    const scenarios = {[translit(ARTICLES.TRANSFER_FOR_OPERATOR.NAME)]: ARTICLES.TRANSFER_FOR_OPERATOR.ID}
    if (scenarios[id] === undefined) return `ERROR: scenario ${id} is not defined`
    if (replies) {
        _sendReply.slots = _sendReply.slots || {};
        _sendReply.slots[AGENT_SLOTS.SCENARIO_SOURCE] = "true"
    }
    return switchredirect(scenarios[id])
})

function switchredirect(intent_id) {
    return `/switchredirect aiassist2 intent_id="${intent_id}"`
}

const availableFunctions = {transfer_to_operator, transfer_to_scenario}

TOOLS = [{
    "type": ITEM_TYPES.function,
    "function": {
        "name": "transfer_to_operator",
        "description": "Переводит диалог на оператора.",
        "parameters": {"type": "object", "properties": {}, "required": []}
    }
}]

class ScenarioNotReadyError extends Error {
    constructor(scenarioName) {
        super(`Unexpected run of the tools agent during waiting for ${scenarioName}`);
        this.name = "ScenarioNotReadyError"
    }
}

class SwitchRedirectPropagate extends Error {
    constructor(switchredirect) {
        super("switchredirect call");
        this.name = "SwitchRedirectPropagate";
        this.switchredirect = switchredirect
    }
}

class RedisQueue {
    constructor(redisClient, deleteSlotFn, debugLogFn, commitFcResults) {
        this.redis = redisClient;
        this.deleteSlot = deleteSlotFn;
        this.debugReply = debugLogFn;
        this.commitFcResults = commitFcResults
    }

    async addFunction(queue, name, args, toolCallId) {
        queue.push({
            type: ITEM_TYPES.function,
            name,
            args,
            toolCallId,
            executed: false,
            started: false,
            scenario: null,
            result: null
        });
    }

    async addCommit(queue, availableTools) {
        queue.push({type: ITEM_TYPES.commit, availableTools});
    }

    async processQueue(replies) {
        const queue = await this.getQueue()
        for (let i = 0; i < queue.length; i++) {
            const item = queue[i]
            if (item.type === ITEM_TYPES.function && item.executed) continue
            if (item.type === ITEM_TYPES.function) {
                if (item.started) {
                    let scenarioResult;
                    if (item.scenario !== null) {
                        scenarioResult = this.getScenarioAnswer(item.scenario);
                        if (scenarioResult === undefined) throw new ScenarioNotReadyError(item.scenario);
                        this.deleteSlot(item.scenario)
                    }
                    await this.markAsExecuted(queue, i, scenarioResult)
                } else {
                    const func = availableFunctions[item.name];
                    this.debugReply(`Calling ${item.name}(${JSON.stringify(item.args)})`);
                    if (func.isScenario) {
                        await this.markAsStartedScenario(queue, i, func.scenarioName);
                        const res = await func(item.args, replies);
                        if (res?.[0] === "/") throw new SwitchRedirectPropagate(res);
                        await this.markAsExecuted(queue, i, res)
                    } else {
                        await this.markAsExecuted(queue, i, await func(item.args))
                    }
                }
                continue
            }
            if (item.type === ITEM_TYPES.commit) {
                const functionsToCommit = [];
                let commitIndex = i
                for (let j = 0; j < commitIndex; j++) {
                    if (queue[j].type === ITEM_TYPES.function && queue[j].executed) functionsToCommit.push({
                        "content": queue[j].result ?? "Done",
                        "tool_call_id": queue[j].toolCallId
                    }); else {
                        logger.warn(`Unexpected item before commit: ${JSON.stringify(queue[j])}`);
                        this.debugReply(`Unexpected item before commit: ${JSON.stringify(queue[j])}`);
                    }
                }
                const n_cycles = await this.incNCycles();
                this.debugReply(`Cycle ${n_cycles} / ${AGENT_PARAMETERS.MAX_CYCLES}`);
                const tool_choice = n_cycles >= AGENT_PARAMETERS.MAX_CYCLES ? "none" : "auto"
                const llm_res = await this.commitFcResults(functionsToCommit, tool_choice);
                queue.splice(0, commitIndex + 1);
                await this.saveQueue(queue);
                return llm_res
            }
        }
    }

    getScenarioAnswer(scenarioName) {
        if (scenarioName === null) return null;
        return getSlotValue(scenarioName)
    }

    async markAsStartedScenario(queue, i, scenarioName) {
        queue[i].started = true;
        queue[i].scenario = scenarioName;
        await this.saveQueue(queue)
    }

    async markAsExecuted(queue, i, result) {
        queue[i].executed = true;
        queue[i].result = result;
        await this.saveQueue(queue);
        this.debugReply(`${queue[i].name} finished with ${result}`)
    }

    async clearQueue() {
        for (const item of await this.getQueue()) {
            if (item.scenario !== null && item.scenario !== undefined) this.deleteSlot(item.scenario)
        }
        await this.saveQueue([]);
        await this.resetNCycles()
    }

    async getQueue() {
        const data = await this.redis.get(KEYS.QUEUE_KEY);
        return data ? JSON.parse(data) : []
    }

    async saveQueue(queue) {
        return await this.redis.set(KEYS.QUEUE_KEY, JSON.stringify(queue), WAIT_FOR_SCENARIO_TTL)
    }

    async incNCycles() {
        let n_cycles = await this.redis.get(KEYS.N_CYCLES_KEY) ?? 0;
        n_cycles++;
        await this.redis.set(KEYS.N_CYCLES_KEY, n_cycles, WAIT_FOR_SCENARIO_TTL);
        return n_cycles;
    }

    async resetNCycles() {
        await this.redis.set(KEYS.N_CYCLES_KEY, 0, WAIT_FOR_SCENARIO_TTL);
    }
}

function updateAccumulatedSlot(slotId, newText, slotsStore) {
    if (slotsStore[slotId] === undefined) {
        const oldValue = getSlotValue(slotId);
        if (oldValue) slotsStore[slotId] = oldValue
    }
    const current = slotsStore[slotId] ?? "";
    slotsStore[slotId] = current ? `${current};${newText}` : newText;
    return slotsStore
}

function _sendReply(text, slots) {
    if (_sendReply.slots === undefined) _sendReply.slots = {}
    const reply = agentApi.makeMarkdownReply(text)
    updateAccumulatedSlot(AGENT_SLOTS.LLM_ANSWER_HISTORY, text, _sendReply.slots)
    Object.assign(_sendReply.slots, slots ?? {})
    return agentApi.sendMessage({
        MessageMarkdown: reply.message.text,
        SendMessageParams: {
            ProjectId: reply.customer_id,
            OmniUserId: reply.omni_user_id,
            Sender: {},
            FilledSlots: _sendReply.slots,
            DestinationChannel: {ChannelId: reply.channel_id, ChannelUserId: message.user.channel_user_id}
        }
    }, logger).then(result => {
        if (!result.Ok) logger.error(`${JSON.stringify(result.Errors)}`);
    }).catch(e => logger.info(`Error sending reply: ${e}.`))
}

function wrapInMarkdownCodeBlock(str) {
    const escapedStr = str.replace(/(?<!\\)```/g, '\\```');
    return `\`\`\`\n${escapedStr}\n\`\`\``;
}

function escapeHTML(text) {
    return text.replace(/[<>&"']/g, (match) => `&#${match.charCodeAt(0)};`);
}

function extractThinkContent(input, escapeHtml) {
    const openTag = '<think>';
    const closeTag = '</think>';
    const startIdx = input.indexOf(openTag);
    const endIdx = input.indexOf(closeTag);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return {cleanedText: input, thought: ''}
    const thoughtContent = input.substring(startIdx + openTag.length, endIdx);
    const cleanedText = input.substring(0, startIdx) + input.substring(endIdx + closeTag.length);
    return {
        cleanedText: escapeHtml ? escapeHTML(cleanedText) : cleanedText,
        thought: thoughtContent ? '*Мои размышления:* \n\n' + escapeHTML(thoughtContent) : thoughtContent
    };
}

function extractJSON(response) {
    try {
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) return JSON.parse(response.substring(jsonStart, jsonEnd + 1));
    } catch (error) {
        return response
    }
}

function addUrlToContextTitle(fullContext) {
    fullContext.symbol_code.forEach((intent_id, idx) => {
        const url = `${API.base_url}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
        fullContext.context[idx].title = `[${fullContext.context[idx].title}](${url})`;
    })
}

async function main() {
    let replies = [];
    let response

    function textReply(text, wrapCodeBlock = false) {
        return _sendReply(wrapCodeBlock ? wrapInMarkdownCodeBlock(String(text)) : String(text));
    }

    function markdownReply(text) {
        return _sendReply(String(text));
    }

    function debugReply(text) {
        if (AGENT_PARAMETERS.DEBUG) return _sendReply(wrapInMarkdownCodeBlock(String(text)));
    }

    function deleteSlot(slot) {
        if (_sendReply.slots === undefined) _sendReply.slots = {};
        _sendReply.slots[slot] = null;
    }

    replies.textReply = textReply;
    replies.markdownReply = markdownReply;
    replies.debugReply = debugReply;
    replies.deleteSlot = deleteSlot
    try {
        response = await _main(replies);
    } catch (e) {
        logger.info(`main error ${e}`)
        if (e instanceof SwitchRedirectPropagate) {
            if (message?.meta?.isTest) return e.switchredirect;
            await replies.markdownReply(e.switchredirect);
            return replies;
        }
        if (e.code === 'ECONNABORTED') await replies.textReply(STANDARD_MESSAGES.TIMEOUT_ERROR_MSG); else await replies.textReply(STANDARD_MESSAGES.DEFAULT_ERROR_MSG);
        if (AGENT_PARAMETERS.DEBUG) {
            replies.debugReply(`ERROR: ${e}`);
            replies.debugReply(e.stack);
        }
    }
    return response;
}

async function _main(replies) {
    let question = message.message.text;
    replies.debugReply(JSON.stringify(message.slot_context, null, 2));
    let dialog_id = null;
    if (AGENT_PARAMETERS.USE_HISTORY) {
        const dialog_response = await agentApi.getDialogId(message.user.omni_user_id, message.user.customer_id);
        dialog_id = dialog_response.Response;
    }
    const commitFcResults = async function (fcResults, tool_choice) {
        return await commitToolResponses(fcResults, dialog_id, replies, tool_choice);
    }
    const redisClient = new RedisQueue(agentStorage.dialogStorage, replies.deleteSlot, replies.debugReply, commitFcResults);
    if (question.toLowerCase() === "прервать" || message.message.action === "cancel") {
        await Promise.all([redisClient.clearQueue(), replies.markdownReply(STANDARD_MESSAGES.MESSAGE_CANCEL_WAITING)]);
        return
    }
    let response, finalAnswer, responsePrinted = false
    try {
        response = await redisClient.processQueue(replies)
    } catch (error) {
        if (error instanceof ScenarioNotReadyError && question) {
            await replies.markdownReply(MESSAGE_WHILE_WAITING_ERROR);
            return
        }
        throw error
    }
    if (response === undefined) {
        response = await sendMessageToLLM(question, dialog_id, replies);
        responsePrinted = true;
        finalAnswer = response.answer
    } else if (question) {
        logger.warn(`Both tools handling and user's question (${question}) have gotten. The user's question will be ignored.`);
    }
    while (response !== undefined) {
        let functionAdded = false;
        const taskQueue = await redisClient.getQueue()
        if (response.answer && !responsePrinted) await _printResponse(response, replies)
        if (response?.tool_calls) {
            for (const call of response.tool_calls) {
                if (!call.function || !call.function.name) continue;
                if (availableFunctions[call.function.name]) {
                    await redisClient.addFunction(taskQueue, call.function.name, JSON.parse(call.function.arguments), call.id);
                    functionAdded = true
                } else throw new Error(`Функция ${call.function.name} не найдена`)
            }
        }
        if (functionAdded) {
            await redisClient.addCommit(taskQueue);
            await redisClient.saveQueue(taskQueue);
        } else await redisClient.resetNCycles()
        response = await redisClient.processQueue(replies);
        responsePrinted = false
    }
    if (message?.meta?.isTest) {
        const {cleanedText} = extractThinkContent(finalAnswer);
        finalAnswer = cleanedText
    }
    return finalAnswer
}

function getClientVerified() {
    return true
}

async function getTokenCRM() {
    const config = {headers: {'content-type': 'application/json'}};
    const data = {"login": API.login, "password": API.password};
    const response = await axios.post(API.url_crm_token, data, config);
    return response.data.accessToken
}

function formattingMessage(dialogOrHistory) {
    return dialogOrHistory.filter(msg => msg.message && msg.message.trim() !== '').map(msg => msg.message).join(' / ')
}

async function sendApplication(slots, dialogOrHistory, replies) {
    let result = formattingMessage(dialogOrHistory);
    const token = await getTokenCRM()
    const config = {headers: {'content-type': 'application/json', 'authorization': 'Bearer ' + token}};
    const data = {id: uuid.v4(), description: result}
    try {
        const response = await axios.post(API.url_crm_create, data, config);
        logger.info({responseCrm: response.data}, "sendApplication");
        await agentStorage.omniUserStorage.set("APPLICATION_SEND", true);
        return `Заявка на получение информации создана. Могу ли я еще чем-нибудь помочь?`
    } catch (e) {
        logger.error({e}, `Error sendApplication`);
        return STANDARD_MESSAGES.DEFAULT_ERROR_MSG
    }
}

async function _printResponse(response, replies, dialogOrHistory, dialogId) {
    if (message?.meta?.isTest) return
    const {thought, cleanedText} = extractThinkContent(response.answer, false);
    let responseData
    try {
        responseData = JSON.parse(cleanedText);
        if (typeof responseData !== 'object' || responseData === null) responseData = cleanedText
    } catch (error) {
        responseData = extractJSON(cleanedText)
    }
    if (AGENT_PARAMETERS.SHOW_THINKING && thought) await replies.textReply(thought); else replies.debugReply(thought)
    if (responseData?.action_required?.tool === "transfer_to_operator") _sendReply(`/switchredirect aiassist2 intent_id="${ARTICLES.TRANSFER_FOR_OPERATOR.ID}"`)
    if (responseData?.action_required?.tool === "transfer_to_scenario") {
        const numberApplication = await sendApplication(responseData?.slots, dialogOrHistory, replies);
        _sendReply(numberApplication, {response_crm: JSON.stringify(responseData?.slots)});
        await agentApi.finishDialog(dialogId)
    }
    if (cleanedText && responseData?.action_required?.tool !== "transfer_to_operator" && responseData?.action_required?.tool !== "transfer_to_scenario") {
        if (responseData?.notes !== null) {
            const cleanedSlots = Object.fromEntries(Object.entries(responseData?.slots || {}).filter(([key, value]) => value !== null).map(([key, value]) => [key, String(value)]));
            if (responseData?.slots) _sendReply(responseData?.notes, cleanedSlots); else await replies.markdownReply(cleanedText)
        } else await replies.markdownReply(cleanedText)
    }
}

async function getBotMediatorDialogHistoryResponse(dialogId) {
    try {
        const config = {headers: {'Content-Type': 'application/json'}, httpsAgent: AGENT};
        const response = await axios.get(`${API.url_mediator_service}?dialog_id=${dialogId}`, config);
        return response.data
    } catch (error) {
        logger.error("Ошибка при вызове API opbot-botmediator: " + error.message)
    }
}

function createMessageItem(message, role) {
    return {message: message, role: role}
}

async function getDialog(dialog_id) {
    try {
        let clientDialogHistory = await getBotMediatorDialogHistoryResponse(dialog_id)
        if (clientDialogHistory) return clientDialogHistory.reduce((acc, message) => {
            const isUserMessage = !!message.msg;
            const source = isUserMessage ? message.msg : message.reply;
            const type = source?.message_type;
            const text = source?.message?.text;
            if (type === 1 || type === 19) {
                if (isUserMessage) acc.push(createMessageItem(text, ROLE.USER)); else {
                    const role = message.reply?.operator?.operator_id === "__SYSTEM__" ? ROLE.BOT : ROLE.OPERATOR;
                    acc.push(createMessageItem(text, role))
                }
            }
            return acc
        }, [])
        else return dialog_id
    } catch (e) {
        logger.error(`Error getDialog: ${JSON.stringify(e)}.`)
    }
}

function getSlots(slots) {
    if (!slots || !Array.isArray(slots)) return [];
    const filledSlots = message.slot_context.filled_slots;
    return slots.map(slot => {
        const filledSlot = filledSlots.find(filled => filled.slot_id === slot.id);
        let slotValue = null;
        if (filledSlot?.value) {
            const values = filledSlot.value.split(';');
            slotValue = values.length > 0 ? values[values.length - 1] : null
        }
        ;
        return {slotId: slot.id, slotDescription: slot.description, slotValue: slotValue}
    })
}

async function sendMessageToLLM(question, dialog_id, replies) {
    let contextsearch_texts = question;
    let dialogOrHistory = message?.meta?.isTest ? message.meta?.history : await getDialog(dialog_id)
    const userSlots = getSlots(USER_SLOTS);
    const slotsBlock = {};
    userSlots.length > 0 ? userSlots.forEach(s => {
        slotsBlock[s.slotId] = s.slotId === 'client_verified' ? getClientVerified() : s.slotValue
    }) : '- Нет заполненных слотов'
    SYSTEM_WITH_SLOTS = LLM_SYSTEM_TEMPLATE.replace('## Слоты:', `## Заполненные слоты:\n        ${JSON.stringify(slotsBlock)}`)
    if (AGENT_PARAMETERS.DO_REPHRASE) {
        rephrases2 = await rephrase(question, REPHRASE_PROMPT, dialog_id, replies);
        contextsearch_texts = [question].concat(rephrases2)
    }
    let fullContext = await getContext(contextsearch_texts, replies);
    addUrlToContextTitle(fullContext);
    let context = fullContext.context;
    let response
    if (context?.length === 0) {
        replies.debugReply(`Context not found for question "${question}"`);
        if (AGENT_PARAMETERS.SMALLTALK_IF_NO_CONTEXT) {
            response = await smalltalk(question + "/n## Слоты:/n" + JSON.stringify(slotsBlock), dialogOrHistory, replies);
            await _printResponse(response, replies, dialogOrHistory, dialog_id);
            return response
        } else {
            replies.markdownReply(STANDARD_MESSAGES.NO_CONTEXT_TEXT);
            return {answer: "", tool_calls: [], log_id: null}
        }
    }
    response = await rag(question, context, dialogOrHistory, replies);
    let references = '';
    if (AGENT_PARAMETERS.SHOW_REFERENCES) references = getReferences(fullContext)
    await _printResponse(response, replies);
    if (AGENT_PARAMETERS.SHOW_REFERENCES) replies.markdownReply(references);
    if (AGENT_PARAMETERS.SHOW_CONTEXT) replies.textReply("<h3>Контекст</h3>" + JSON.stringify(fullContext, null, 2), true)
    return response
}

function _debugAxiosError(error, replies) {
    if (error.response) {
        replies.debugReply(JSON.stringify(error.response.data, null, 2));
        replies.debugReply(error.response.status)
    } else if (error.request) replies.debugReply(error.request); else replies.debugReply('Error', error.message)
}

async function getContext(question, replies) {
    let response;
    try {
        response = await axios.post(URL_CONTEXT_SEARCH, {
            text: question,
            customer_id: CUSTOMER_ID,
            record_type: AGENT_PARAMETERS.RECORD_TYPE,
            output_format: "json-vikhr"
        });
        logger.info(response.data)
    } catch (e) {
        logger.info(`Error requesting context search: ${e}.`);
        _debugAxiosError(e, replies);
        throw e
    }
    const fullContext = response.data;
    if (CONTEXT_SETTINGS.MAX_CONTEXTS > -1) Object.keys(fullContext).forEach(key => {
        fullContext[key] = fullContext[key].slice(0, CONTEXT_SETTINGS.MAX_CONTEXTS)
    });
    return fullContext
}

function _putDialogIdOrHistory(requestData, dialogOrHistory) {
    if (typeof dialogOrHistory === "string") requestData["dialog_id"] = dialogOrHistory; else requestData["history"] = dialogOrHistory;
    return requestData
}

async function _callLLM(url, data, dialogOrHistory, replies, extraErrorHandling = null) {
    const processedData = _putDialogIdOrHistory(data, dialogOrHistory);
    try {
        const response = await axios.post(url, processedData, {
            timeout: LLM_SETTINGS.timeout * 1000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API.llm_auth_token}`,
                'Connection': 'keep-alive'
            },
            httpsAgent: AGENT
        });
        return response.data
    } catch (e) {
        logger.info(`Error requesting LLM (POST ${url}): ${e}.`);
        _debugAxiosError(e, replies);
        if (extraErrorHandling) extraErrorHandling(e);
        throw e
    }
}

async function smalltalk(question, dialogOrHistory, replies) {
    const thinkingPrompt = AGENT_PARAMETERS.ENABLE_THINKING_SMALLTALK ? AGENT_PARAMETERS.THINK : AGENT_PARAMETERS.NO_THINK;
    return await _callLLM(URL_LLM_SMALLTALK, {
        question: question + thinkingPrompt,
        temperature: LLM_SETTINGS.temperature_smalltalk,
        top_p: LLM_SETTINGS.top_p,
        top_k: LLM_SETTINGS.top_k,
        min_p: LLM_SETTINGS.min_p,
        instruction: SYSTEM_WITH_SLOTS,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }, dialogOrHistory, replies)
}

async function rag(question, context, dialogOrHistory, replies) {
    return await _callLLM(URL_LLM, {
        question: question,
        context: context,
        temperature: LLM_SETTINGS.temperature,
        top_p: LLM_SETTINGS.top_p,
        top_k: LLM_SETTINGS.top_k,
        min_p: LLM_SETTINGS.min_p,
        system_template: SYSTEM_WITH_SLOTS,
        user_template: RAG_TEMPLATE,
        document_template: RAG_DOCUMENT_TEMPLATE,
        join_sep: RAG_JOIN_SEP,
        tools: TOOLS,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }, dialogOrHistory, replies, (e) => {
        replies.debugReply("<h3>Контекст</h3>" + JSON.stringify(context, null, 2))
    })
}

async function rephrase(question, prompt, dialogOrHistory, replies) {
    const response = await _callLLM(URL_LLM_REPHRASE, {
        question: question,
        prompt: prompt,
        n_generations: AGENT_PARAMETERS.REPHRASE_N_GENERATIONS,
        samples_per_generation: AGENT_PARAMETERS.REPHRASE_SAMPLES_PER_GENERATION,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }, dialogOrHistory, replies);
    return response.texts
}

async function commitToolResponses(tool_responses, dialogOrHistory, replies, tool_choice) {
    return await _callLLM(URL_LLM_COMMIT_TOOL_RESPONSES, {
        tool_responses: tool_responses,
        temperature: LLM_SETTINGS.temperature,
        top_p: LLM_SETTINGS.top_p,
        top_k: LLM_SETTINGS.top_k,
        min_p: LLM_SETTINGS.min_p,
        tools: TOOLS,
        tool_choice: tool_choice,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }, dialogOrHistory, replies)
}

function getReferences(full_context) {
    let references = "";
    const articles_counts = new Map();
    const articles_titles = new Map();
    full_context.symbol_code.forEach((intent_id, idx) => {
        const prev_count = articles_counts.get(intent_id) || 0;
        articles_counts.set(intent_id, prev_count + 1);
        articles_titles.set(intent_id, full_context.title[idx])
    });
    Array.from(articles_counts.entries()).sort((a, b) => b[1] - a[1]).forEach(([intent_id, cnt]) => {
        references += `\n\n*  [${articles_titles.get(intent_id)}](${API.base_url}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id})`
    });
    if (references !== "") references = "### Ссылки для информации:" + references;
    return references
}

if (message.message_type === 1) {
    main().then(res => {
        res ? resolve(res) : resolve([])
    }).catch(error => {
        logger.error(`Error: ${error}`);
        resolve([agentApi.makeMarkdownReply(error)])
    })
} else {
    logger.info(`Message type: ${message.message_type}. Skip.`);
    resolve([])
}
