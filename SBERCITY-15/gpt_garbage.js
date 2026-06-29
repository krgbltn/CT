const currentDate = new Date().toLocaleDateString('ru-RU')

let LLM_SYSTEM_TEMPLATE = `
# Роль

Вы — модуль извлечения и верификации данных для оформления заявки на **вывоз мусора** в жилом комплексе "СберСити".

Ваша задача — **извлечь из слотов/диалога/обращения все необходимые слоты** и, **если какой-то слот не заполнен или неоднозначен**, вызвать **ровно один** инструмент запроса (\`ask_for_*\`).  
**Вы НЕ отвечаете клиенту напрямую** — только возвращаете структуру решения.

---

## Слоты:

| Слот | Описание | Как заполняется | Обязательность |
|------|----------|------------------|----------------|
| \`client_verified\` | Флаг авторизации: true — идентифицирован, false — нет, null — неизвестно | — | — |
| \`client_name_display\` | Имя/ФИО клиента | Из текста ИЛИ \`ask_for_client_name\` | Обяз. при !verified |
| \`client_status\` | "резидент" / "гость" | Из текста | Обяз. при !verified |
| \`building_number\` | Номер дома | Из адреса | **Обязательный** |
| \`corpus\` | Корпус/строение | Из адреса | Опционально |
| \`apartment_number\` | Номер квартиры | Из адреса | **Обязательный** |
| \`garbage_type\` | Тип мусора: "крупногабаритный" / "строительный" | Из текста или \`ask_for_garbage_type\` | **Обязательный** |
| \`garbage_items\` | Что именно нужно вывезти: диван, шкаф, холодильник, мешки и т.п. | Из текста или \`ask_for_garbage_items\` | **Обязательный** |
| \`garbage_volume\` | Объем: количество пакетов/мешков/предметов или примерное описание | Из текста или \`ask_for_garbage_volume\` | **Обязательный** |
| \`container_type\` | Вариант для строительного мусора: "контейнер_360л" / "бункер_8кубов" | Из текста или \`ask_for_container_type\` | Обяз. при garbage_type="строительный" |
| \`pickup_from\` | Откуда забирать: "из_квартиры" / "в_холле" | Из текста или \`ask_for_pickup_from\` | **Обязательный** |
| \`need_loaders\` | Нужны ли грузчики: true/false | Из текста | Опционально |
| \`demontage_needed\` | Нужен ли демонтаж/разбор: true/false/что именно | Из текста | Опционально |
| \`pickup_date\` | Удобная дата вывоза | Из текста или \`ask_for_pickup_date\` | **Обязательный** |
| \`pickup_time\` | Желаемый интервал времени (10:00–21:00) | Из текста или \`ask_for_pickup_time\` | **Обязательный** |
| \`phone_number\` | Номер телефона | При отсутствии верификации | Обяз. при !verified |
| \`event_type\` | Тип события | "Заявка" по умолч. | Фиксировано |
| \`object_type\` | Тип объекта | Всегда "МКД" | Фиксировано |
| \`type_of_premises_or_service\` | "Платные услуги" | Фиксировано | **Обязательный** |
| \`purpose_of_premises_or_service\` | "Вынос крупногабаритного мусора" / "Вынос строительного мусора" | Из garbage_type | **Обязательный** |
| \`problem_category\` | Категория | Из текста + словарь | Обяз. |
| \`priority\` | "Обычная" | Фиксировано | Обяз. |
| \`problem_description\` | **Полный исходный текст обращения** | Дословно | **Обязательный** |

---

## Правила извлечения

1. **Клиентские данные:**
   - Если есть history, то значения в ней актуальнее чем в Слотах
   - Если \`client_verified\` = **true** → \`client_name_display\` и \`client_status\` **не запрашиваем**.
   - Если \`client_verified\` = **false/null** → сначала \`client_name_display\`, потом \`client_status\`, потом адрес.

2. **Извлечение ответов из текста пользователя:**
   - Когда пользователь отвечает на вопрос — извлеките ответ и обновите соответствующий слот
   - "из квартиры" / "забирать из квартиры" → \`pickup_from\`: "из_квартиры"
   - "в холле" / "у двери" / "вынесу" → \`pickup_from\`: "в_холле"
   - "завтра" / "послезавтра" / конкретная дата → \`pickup_date\`
   - "в 15:00" / "утром" / "вечером" → \`pickup_time\`
   - "нужны грузчики" / "да" → \`need_loaders\`: true
   - "не нужны" / "нет" → \`need_loaders\`: false

3. **Тип мусора:**
   - \`garbage_type\` ∈ {**"крупногабаритный"**, **"строительный"**}
   - КГО: мебель, техника, матрасы, зеркала, крупный мусор > 0.5м
   - Строительный: после ремонта, плитка, ламинат, кирпич, бетон, мешки с мусором

4. **Для строительного мусора:**
   - Небольшой объем до 360 л → \`container_type\` = "контейнер_360л"
   - Большой объем → \`container_type\` = "бункер_8кубов"

5. **Время вывоза:** 10:00–21:00 ежедневно.
   - **ВАЖНО:** Если пользователь указал только время (например "в 12") → НЕ подставляйте дату автоматически. Оставьте \`pickup_date\` = null и спросите дату.
   - Если пользователь указал только дату (например "завтра") → НЕ подставляйте время автоматически. Оставьте \`pickup_time\` = null и спросите время.
   - "в 12" / "в 15:00" / "утром" → только \`pickup_time\`, дата остаётся null
   - "завтра" / "5 июня" / "в понедельник" → только \`pickup_date\`, время остаётся null
   - "завтра в 12" / "5 июня в 15:00" → заполните оба слота

6. **problem_description** — **дословный текст**.

---

## Инструменты уточнения (ТОЛЬКО ОДИН)

| Условие | Инструмент | Вопрос клиенту (notes) — БРАТЬ 1:1 ИЗ СЦЕНАРИЯ |
|---------|------------|------------------------|
| \`client_verified\` ≠ true && \`client_name_display\` == null | \`ask_for_client_name\` | "Назовите ваши фамилию и имя?" |
| \`client_verified\` ≠ true && \`client_name_display\` ≠ null && \`client_status\` == null | \`ask_for_client_status\` | "Вы проживаете в этом доме или в гостях?" |
| \`building_number\` == null **или** \`apartment_number\` == null | \`ask_for_address\` | "Назовите номер дома и квартиры." |
| \`garbage_type\` == null или неоднозначен | \`ask_for_garbage_type\` | "Подскажите, пожалуйста, какой у вас мусор: обычный, после ремонта или крупные предметы (мебель/техника)?" |
| \`garbage_items\` == null | \`ask_for_garbage_items\` | "Можете кратко описать, что именно нужно вывезти?" |
| \`garbage_volume\` == null | \`ask_for_garbage_volume\` | "Примерно какой объем — сколько предметов, пакетов или мешков?" |
| \`garbage_type\` = "строительный" && \`container_type\` == null | \`ask_for_container_type\` | "Подскажите, пожалуйста, какой объем строительного мусора: подойдет контейнер 360 л или требуется строительный бункер 8 кубов?" |
| \`pickup_from\` == null | \`ask_for_pickup_from\` | "Обычно мусор оставляют в приквартирном холле около квартиры, и мы его забираем, не беспокоя вас. Вам удобен такой подход или нужно вынести мусор прямо из квартиры?" |
| \`pickup_date\` == null && \`pickup_time\` == null | \`ask_for_pickup_datetime\` | "Подскажите удобную дату и интервал времени для вывоза. Услуга оказывается ежедневно с 10:00 до 21:00." |
| \`pickup_date\` == null && \`pickup_time\` ≠ null | \`ask_for_pickup_datetime\` | "На какую дату назначить вывоз?" |
| \`pickup_date\` ≠ null && \`pickup_time\` == null | \`ask_for_pickup_datetime\` | "На какое время назначить вывоз (10:00–21:00)?" |

> **ВАЖНО:**  
> - Не вызывайте 2+ инструментов за раз.  
> - Если клиент отказывается давать данные → \`transfer_to_operator\`.  
> - **notes** — это **прямой вопрос клиенту 1:1 из таблицы выше**. НЕ меняйте формулировку, НЕ сокращайте, НЕ добавляйте свои слова.

---

## Формат выхода

**ВАЖНО:** Вы должны вернуть **ТОЛЬКО JSON**. Никакого текста до или после JSON. Никаких markdown-блоков. Никаких пояснений.

{
  "slots": {
    "client_verified": boolean | null,
    "client_name_display": string | null,
    "client_status": string | null,
    "building_number": string | null,
    "corpus": string | null,
    "apartment_number": string | null,
    "garbage_type": string | null,
    "garbage_items": string | null,
    "garbage_volume": string | null,
    "container_type": string | null,
    "pickup_from": string | null,
    "need_loaders": boolean | null,
    "demontage_needed": string | null,
    "pickup_date": string | null,
    "pickup_time": string | null,
    "phone_number": string | null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": string | null,
    "purpose_of_premises_or_service": string | null,
    "problem_category": string | null,
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

#### 1. Все слоты есть → создавать заявку

{
  "slots": {
    "client_verified": true,
    "building_number": "22",
    "corpus": "2",
    "apartment_number": "34",
    "garbage_type": "крупногабаритный",
    "garbage_items": "диван, шкаф",
    "garbage_volume": "2 предмета",
    "container_type": null,
    "pickup_from": "в_холле",
    "need_loaders": false,
    "demontage_needed": false,
    "pickup_date": "15.06.2026",
    "pickup_time": "10:00-14:00",
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Платные услуги",
    "purpose_of_premises_or_service": "Вынос крупногабаритного мусора",
    "problem_category": "Вынос КГО",
    "priority": "Обычная",
    "problem_description": "Нужно вывезти старый диван и шкаф"
  },
  "action_required": {
    "tool": "transfer_to_scenario",
    "args": { "scenario": "create_work_order" }
  },
  "notes": null
}

#### 2. Нет адреса → запросить

{
  "slots": {
    "client_verified": true,
    "building_number": null,
    "apartment_number": null,
    "garbage_type": "крупногабаритный",
    "garbage_items": "диван",
    "garbage_volume": "1 предмет",
    "pickup_from": null,
    "pickup_date": null,
    "pickup_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Платные услуги",
    "purpose_of_premises_or_service": "Вынос крупногабаритного мусора",
    "problem_category": "Вынос КГО",
    "priority": "Обычная",
    "problem_description": "Нужно вывезти диван"
  },
  "action_required": {
    "tool": "ask_for_address",
    "args": {}
  },
  "notes": "Назовите номер дома и квартиры."
}

#### 3. Адрес есть, нет pickup_from → запросить

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "garbage_type": "крупногабаритный",
    "garbage_items": "диван, шкаф",
    "garbage_volume": "2 предмета",
    "pickup_from": null,
    "pickup_date": null,
    "pickup_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Платные услуги",
    "purpose_of_premises_or_service": "Вынос крупногабаритного мусора",
    "problem_category": "Вынос КГО",
    "priority": "Обычная",
    "problem_description": "Нужно вывезти старый диван и шкаф"
  },
  "action_required": {
    "tool": "ask_for_pickup_from",
    "args": {}
  },
  "notes": "Обычно мусор оставляют в приквартирном холле около квартиры, и мы его забираем, не беспокоя вас. Вам удобен такой подход или нужно вынести мусор прямо из квартиры?"
}

#### 3а. Пользователь ответил "из квартиры" → ОБНОВИТЬ pickup_from и перейти к следующему вопросу

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "garbage_type": "крупногабаритный",
    "garbage_items": "диван, шкаф",
    "garbage_volume": "2 предмета",
    "pickup_from": "из_квартиры",
    "pickup_date": null,
    "pickup_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Платные услуги",
    "purpose_of_premises_or_service": "Вынос крупногабаритного мусора",
    "problem_category": "Вынос КГО",
    "priority": "Обычная",
    "problem_description": "Нужно вывезти старый диван и шкаф"
  },
  "action_required": {
    "tool": "ask_for_pickup_datetime",
    "args": {}
  },
  "notes": "Подскажите удобную дату и интервал времени для вывоза. Услуга оказывается ежедневно с 10:00 до 21:00."
}

#### 4. pickup_from есть, нет даты/времени → запросить

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "garbage_type": "крупногабаритный",
    "garbage_items": "диван, шкаф",
    "garbage_volume": "2 предмета",
    "pickup_from": "в_холле",
    "pickup_date": null,
    "pickup_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Платные услуги",
    "purpose_of_premises_or_service": "Вынос крупногабаритного мусора",
    "problem_category": "Вынос КГО",
    "priority": "Обычная",
    "problem_description": "Нужно вывезти старый диван и шкаф"
  },
  "action_required": {
    "tool": "ask_for_pickup_datetime",
    "args": {}
  },
  "notes": "Подскажите удобную дату и интервал времени для вывоза. Услуга оказывается ежедневно с 10:00 до 21:00."
}

#### 4а. Пользователь указал только время "в 12" → НЕ подставлять дату, спросить дату

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "garbage_type": "крупногабаритный",
    "garbage_items": "диван, шкаф",
    "garbage_volume": "2 предмета",
    "pickup_from": "из_квартиры",
    "pickup_date": null,
    "pickup_time": "12:00",
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Платные услуги",
    "purpose_of_premises_or_service": "Вынос крупногабаритного мусора",
    "problem_category": "Вынос КГО",
    "priority": "Обычная",
    "problem_description": "Нужно вывезти старый диван и шкаф"
  },
  "action_required": {
    "tool": "ask_for_pickup_datetime",
    "args": {}
  },
  "notes": "На какую дату назначить вывоз?"
}

#### 4б. Пользователь указал только дату "завтра" → НЕ подставлять время, спросить время

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "garbage_type": "крупногабаритный",
    "garbage_items": "диван, шкаф",
    "garbage_volume": "2 предмета",
    "pickup_from": "из_квартиры",
    "pickup_date": "05.06.2026",
    "pickup_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Платные услуги",
    "purpose_of_premises_or_service": "Вынос крупногабаритного мусора",
    "problem_category": "Вынос КГО",
    "priority": "Обычная",
    "problem_description": "Нужно вывезти старый диван и шкаф"
  },
  "action_required": {
    "tool": "ask_for_pickup_datetime",
    "args": {}
  },
  "notes": "На какое время назначить вывоз (10:00–21:00)?"
}

---

# Безопасность и конфиденциальность

- **НЕ запрашивайте** полные номера банковских карт, пароли, CVV-коды
- **НЕ раскрывайте** персональные данные других клиентов

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3 (Москва)

Выполняйте ТОЛЬКО извлечение и принятие решения о следующем шаге.
ВЕРНИТЕ ТОЛЬКО JSON-ОБЪЕКТ. НИКАКОГО ТЕКСТА ДО ИЛИ ПОСЛЕ JSON.
Правила для notes:
- notes = ВОПРОС КЛИЕНТУ 1:1 ИЗ ТАБЛИЦЫ ИНСТРУМЕНТОВ ВЫШЕ
- НЕ меняйте формулировку, НЕ сокращайте, НЕ добавляйте свои слова
- НЕ рассуждение, НЕ объяснение, НЕ список чего не хватает

КРИТИЧЕСКИ ВАЖНО для даты и времени:
- Если пользователь сказал ТОЛЬКО время ("в 12") → НЕ подставляйте дату! Оставьте pickup_date = null
- Если пользователь сказал ТОЛЬКО дату ("завтра") → НЕ подставляйте время! Оставьте pickup_time = null
- Спросите недостающее отдельным вопросом
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
        logger.info({
            step: 'processQueue_start',
            queue_length: queue.length,
            queue_items: queue.map(item => ({
                type: item.type,
                name: item.name,
                executed: item.executed,
                started: item.started
            }))
        })
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
                logger.info({
                    step: 'commit_fcResults',
                    n_cycles,
                    max_cycles: AGENT_PARAMETERS.MAX_CYCLES,
                    tool_choice,
                    functions_count: functionsToCommit.length
                })
                const llm_res = await this.commitFcResults(functionsToCommit, tool_choice);
                queue.splice(0, commitIndex + 1);
                await this.saveQueue(queue);
                logger.info({
                    step: 'commit_fcResults_done',
                    has_answer: !!llm_res?.answer,
                    has_tool_calls: !!llm_res?.tool_calls
                })
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
        const jsonRegex = /```(?:json)?\s*([\s\S]*?)```/g;
        let match;
        while ((match = jsonRegex.exec(response)) !== null) {
            const jsonStr = match[1].trim();
            if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
                return JSON.parse(jsonStr);
            }
        }
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            let braceCount = 0;
            for (let i = jsonStart; i < response.length; i++) {
                if (response[i] === '{') braceCount++;
                if (response[i] === '}') braceCount--;
                if (braceCount === 0) {
                    return JSON.parse(response.substring(jsonStart, i + 1));
                }
            }
        }
    } catch (error) {
        return response
    }
    return response
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
        logger.info({step: '_main_error', error: String(e), stack: e.stack})
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
    logger.info({step: '_main_start', question, message_type: message.message_type, action: message.message.action})
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

    // --- Шаг 0: Обработка выбора объекта (если было показано несколько) ---
    const pendingObjectsRaw = await agentStorage.dialogStorage.get("PENDING_OBJECT_SELECTION")
    const pendingObjectsRawList = pendingObjectsRaw ? JSON.parse(pendingObjectsRaw) : null
    const pendingObjects = pendingObjectsRawList ? pendingObjectsRawList.filter(o => o.typeObjectUk !== 'Машиноместо') : null
    if (pendingObjects && pendingObjects.length > 0) {
        const choice = parseInt(question.trim())
        if (choice >= 1 && choice <= pendingObjects.length) {
            const selected = pendingObjects[choice - 1]
            const addr = parseObjectAddress(selected)
            await agentStorage.dialogStorage.set("SELECTED_OBJECT", JSON.stringify(addr))
            await agentStorage.dialogStorage.set("PENDING_OBJECT_SELECTION", null)

            const phone = message.user.phone || message.user.phone_number
            if (phone && addr.building && addr.apartment) {
                const existingApps = await checkExistingApplications(phone, addr.building, addr.apartment)
                if (existingApps && existingApps.length > 0) {
                    await agentStorage.dialogStorage.set("EXISTING_APPS_FOUND", true)
                    const appsText = existingApps.map(a => `№${a.number}`).join(', ')
                    replies.markdownReply(`У вас уже есть открытые заявки по вывозу мусора: ${appsText}. Создать новую?`)
                    return
                }
            }
        } else {
            const list = pendingObjects.map((o, i) => formatObjectLabel(o, i)).join('\n')
            replies.markdownReply(`Введите номер объекта (1-${pendingObjects.length}):\n${list}`)
            return
        }
    } else if (pendingObjectsRawList && pendingObjectsRawList.length > 0 && pendingObjects.length === 0) {
        // Все объекты — машино-места, очищаем и идём дальше
        await agentStorage.dialogStorage.set("PENDING_OBJECT_SELECTION", null)
    }

    // --- Шаг 1: Проверка открытых заявок (только первый вход) ---
    const alreadyChecked = await agentStorage.dialogStorage.get("EXISTING_APPS_CHECKED")
    if (!alreadyChecked) {
        await agentStorage.dialogStorage.set("EXISTING_APPS_CHECKED", true)

        const phone = message.user.phone || message.user.phone_number
        if (phone) {
            const token = await getTokenCRM()
            const client = await getClientByPhone(token, phone)
            if (client?.id) {
                const objects = await getClientObjects(token, client.id)
                const content = (objects?.content || []).filter(o => o.typeObjectUk !== 'Машиноместо')

                if (content.length === 0) {
                    // Только машино-места или нет объектов → обычный сбор слотов
                } else if (content.length === 1) {
                    // Одна квартира → берём её
                    const addr = parseObjectAddress(content[0])
                    await agentStorage.dialogStorage.set("SELECTED_OBJECT", JSON.stringify(addr))
                    if (addr.building && addr.apartment) {
                        const existingApps = await checkExistingApplications(phone, addr.building, addr.apartment)
                        if (existingApps && existingApps.length > 0) {
                            await agentStorage.dialogStorage.set("EXISTING_APPS_FOUND", true)
                            const appsText = existingApps.map(a => `№${a.number}`).join(', ')
                            replies.markdownReply(`У вас уже есть открытые заявки по вывозу мусора: ${appsText}. Создать новую?`)
                            return
                        }
                    }
                } else {
                    // Несколько квартир → показать список
                    const list = content.map((o, i) => formatObjectLabel(o, i)).join('\n')
                    await agentStorage.dialogStorage.set("PENDING_OBJECT_SELECTION", JSON.stringify(content))
                    replies.markdownReply(`Найдено несколько объектов. Выберите номер:\n${list}`)
                    return
                }
            }
            // Не нашли в CRM → обычный сбор слотов
        }
    }

    // --- Шаг 2: Ответ на вопрос про заявки ---
    const appsFound = await agentStorage.dialogStorage.get("EXISTING_APPS_FOUND")
    if (appsFound && question.toLowerCase() === "нет") {
        await agentStorage.dialogStorage.set("EXISTING_APPS_FOUND", false)
        replies.markdownReply("Хорошо, заявка не будет создана. Если понадобится помощь — обращайтесь!")
        if (dialog_id) await agentApi.finishDialog(dialog_id)
        return
    }
    if (appsFound) {
        await agentStorage.dialogStorage.set("EXISTING_APPS_FOUND", false)
    }

    if (question.toLowerCase() === "прервать" || message.message.action === "cancel") {
        await Promise.all([redisClient.clearQueue(), replies.markdownReply(STANDARD_MESSAGES.MESSAGE_CANCEL_WAITING)]);
        return
    }
    let response, finalAnswer, responsePrinted = false
    try {
        response = await redisClient.processQueue(replies)
        logger.info({
            step: 'processQueue_result',
            response_type: response ? typeof response : 'undefined',
            has_answer: !!response?.answer,
            has_tools: !!response?.tool_calls
        })
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
        if (response.answer && !responsePrinted) {
            await _printResponse(response, replies)
        }
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
    logger.info({step: '_main_end', final_answer_preview: finalAnswer?.substring(0, 200)})
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

async function getClientByPhone(token, phone) {
    const config = { headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token } }
    try {
        const response = await axios.get(`${API.base_url_crm}/api/client/client-full/by-phone/${phone}`, config)
        logger.info({ client: response.data }, "getClientByPhone")
        return response.data
    } catch (e) {
        logger.error({ e }, `Error getClientByPhone`)
        return null
    }
}

async function getClientApplications(token, clientId) {
    const config = { headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token } }
    const data = [{ logicalOperator: "", field: "clientId", operator: "like", value: clientId }]
    const params = { sort: 'number,desc', page: 0, size: 10, showArchive: false }
    try {
        const response = await axios.post(`${API.base_url_crm}/api/client-relations/application/filtering`, data, { ...config, params })
        logger.info({ applications: response.data }, "getClientApplications")
        return response.data
    } catch (e) {
        logger.error({ e }, `Error getClientApplications`)
        return null
    }
}

async function getClientObjects(token, clientId) {
    const config = { headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token } }
    const params = { sort: 'mailingAddress,desc', page: 0, size: 10, showArchive: false, clientId: clientId }
    try {
        const response = await axios.get(`${API.base_url_crm}/api/client-relations/tasks/proprietor/by-client`, { ...config, params })
        logger.info({ objects: response.data }, "getClientObjects")
        return response.data
    } catch (e) {
        logger.error({ e }, `Error getClientObjects`)
        return null
    }
}

async function checkExistingApplications(phone, building, apartment) {
    const token = await getTokenCRM()
    const client = await getClientByPhone(token, phone)
    if (!client?.id) return null

    const applications = await getClientApplications(token, client.id)
    if (!applications?.content || applications.content.length === 0) return null

    const closedStatuses = ['Закрыто', 'Отменено', 'Отмененная']

    return applications.content.filter(app => {
        if (closedStatuses.includes(app.statusApplication)) return false
        const objectUk = app.objectUk || ''
        const hasBuilding = objectUk.includes(`д.${building}`) || objectUk.includes(`дом ${building}`)
        const hasApartment = objectUk.includes(`кв.${apartment}`) || objectUk.includes(`кв. ${apartment}`)
        return hasBuilding && hasApartment
    })
}

function formatObjectLabel(obj, index) {
    const addr = obj.objectUkName || obj.objectUk || obj.mailingAddress || obj.address || ''
    return `${index + 1}) ${addr}`
}

function parseObjectAddress(obj) {
    if (obj.typeObjectUk === 'Машиноместо') {
        return { building: null, corpus: null, apartment: null, raw: '' }
    }
    const raw = obj.objectUkName || obj.objectUk || obj.mailingAddress || obj.address || ''
    const buildingMatch = raw.match(/[дД]ом[:\s]*(\d+)/) || raw.match(/,\s*д\.(\d+)/)
    const corpusMatch = raw.match(/[кК]орп\.?(\d+)/) || raw.match(/,\s*корп\.(\d+)/)
    const apartmentMatch = raw.match(/[кК]в\.?\s*(\d+)/) || raw.match(/[кК]вартира[:\s]*(\d+)/)

    return {
        building: buildingMatch ? buildingMatch[1] : null,
        corpus: corpusMatch ? corpusMatch[1] : (obj.corpus || obj.building || null),
        apartment: apartmentMatch ? apartmentMatch[1] : (obj.objectUkNumber || null),
        raw: raw
    }
}

function formatDateToRussian(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        return `${day}.${month}.${match[3]}`;
    }
    return dateStr;
}

function formatDataBlockGarbage(slots) {
    const order = ["type_of_premises_or_service", "purpose_of_premises_or_service", "garbage_type", "garbage_items", "garbage_volume", "container_type", "pickup_from", "need_loaders", "demontage_needed", "pickup_date", "pickup_time", "client_name_display", "client_status", "phone_number", "building_number", "corpus", "apartment_number", "problem_category", "priority", "problem_description"];
    const required = ["building_number", "apartment_number", "garbage_type", "garbage_items", "garbage_volume", "pickup_from", "pickup_date", "pickup_time", "type_of_premises_or_service", "purpose_of_premises_or_service", "priority", "problem_description"];
    const labels = {
        type_of_premises_or_service: "Платные услуги",
        purpose_of_premises_or_service: "Вынос мусора",
        garbage_type: "Тип мусора",
        garbage_items: "Что вывезти",
        garbage_volume: "Объем мусора",
        container_type: "Тип контейнера",
        pickup_from: "Откуда забирать",
        need_loaders: "Нужны грузчики",
        demontage_needed: "Нужен демонтаж",
        pickup_date: "Дата вывоза",
        pickup_time: "Время вывоза",
        client_name_display: "ФИО",
        client_status: "Статус",
        phone_number: "Номер телефона",
        building_number: "Дом",
        corpus: "Корпус",
        apartment_number: "Квартира",
        problem_category: "Категория проблемы",
        priority: "Приоритет",
        problem_description: "Описание проблемы"
    };
    const lines = [];
    for (const key of order) {
        if (!(key in slots)) continue;
        const label = labels[key] || key;
        let value = slots[key];
        if (value === null || value === undefined || value === '') {
            value = '—';
        } else {
            if (key === 'pickup_date') {
                value = formatDateToRussian(String(value)) || value;
            }
            if (typeof value === 'boolean') {
                value = value ? 'Да' : 'Нет';
            }
        }
        if (required.includes(key) && value !== '—') {
            lines.push(`**${label}**: ${value}`);
        } else {
            lines.push(`${label}: ${value}`);
        }
    }
    return '=== ДАННЫЕ ДЛЯ ВЫПОЛНЕНИЯ ===\n' + lines.join('\n');
}

function formatDialogBlock(dialogOrHistory) {
    if (!dialogOrHistory || !Array.isArray(dialogOrHistory) || dialogOrHistory.length === 0) {
        return '=== ДИАЛОГ С ЖИТЕЛЕМ ===\nДиалог отсутствует';
    }
    const lines = [];
    for (const msg of dialogOrHistory) {
        if (!msg.message || msg.message.trim() === '') continue;
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        const role = msg.role === 'user' ? 'Житель' : 'Виртуальный помощник';
        lines.push(`${timeStr} ${role}:\n${msg.message}`);
    }
    if (lines.length === 0) {
        return '=== ДИАЛОГ С ЖИТЕЛЕМ ===\nДиалог отсутствует';
    }
    return '=== ДИАЛОГ С ЖИТЕЛЕМ ===\n' + lines.join('\n\n');
}

function formatFullDescription(slots, dialogOrHistory) {
    return formatDataBlockGarbage(slots) + '\n\n' + formatDialogBlock(dialogOrHistory);
}

async function sendApplication(slots, dialogOrHistory, replies) {
    let result = formatFullDescription(slots, dialogOrHistory);
    logger.warn({result})
    // return `Спасибо, что обратились ко мне. \n✅Заявка **оформлена**. \n 📱 Статус заявки присылаем через пуш-уведомления мобильного приложения.`

    const token = await getTokenCRM()
    const config = {headers: {'content-type': 'application/json', 'authorization': 'Bearer ' + token}};
    const rawPhone = getSlotValue('sys_phone') || slots?.phone_number
    const phone = rawPhone ? rawPhone.replace(/[^\d]/g, '').replace(/^8(\d{10})$/, '+7$1').replace(/^7(\d{10})$/, '+7$1').replace(/^(\d{10})$/, '+7$1') : null
    let clientData = null
    if (phone) {
        clientData = await getClientByPhone(token, phone)
    }
    const data = {id: uuid.v4(), description: `${result}`, ...(clientData && {clientId: clientData})}
    try {
        const response = await axios.post(API.url_crm_create, data, config);
        logger.info({responseCrm: response.data}, "sendApplication");
        await agentStorage.omniUserStorage.set("APPLICATION_SEND", true);
        return `Спасибо, что обратились ко мне. \n✅Заявка №${response.data.number} **оформлена**. \n 📱 Статус заявки присылаем через пуш-уведомления мобильного приложения.`
    } catch (e) {
        logger.error({e}, `Error sendApplication`);
        return STANDARD_MESSAGES.DEFAULT_ERROR_MSG
    }
}

async function _printResponse(response, replies, dialogOrHistory, dialogId) {
    if (message?.meta?.isTest) return
    logger.info({step: '_printResponse_start', raw_answer_preview: response.answer?.substring(0, 200)})
    const {thought, cleanedText} = extractThinkContent(response.answer, false);
    logger.info({
        step: 'extractThinkContent',
        thought_preview: thought?.substring(0, 100),
        cleanedText_preview: cleanedText?.substring(0, 200)
    })

    let responseData

    // Сначала пробуем извлечь JSON (в т.ч. из markdown-блоков)
    responseData = extractJSON(cleanedText)

    if (typeof responseData === 'string') {
        // Не удалось извлечь JSON — это обычный текст
        logger.info({step: 'plain_text_response', text_preview: cleanedText?.substring(0, 200)})
        if (AGENT_PARAMETERS.SHOW_THINKING && thought) await replies.textReply(thought); else replies.debugReply(thought)
        if (cleanedText) await replies.markdownReply(cleanedText)
        return
    }

    logger.info({
        step: 'JSON_extracted',
        action_required: responseData?.action_required,
        notes_preview: responseData?.notes?.substring(0, 100),
        slots_changes: responseData?.slots
    })

    if (typeof responseData !== 'object' || responseData === null) responseData = cleanedText
    if (AGENT_PARAMETERS.SHOW_THINKING && thought) await replies.textReply(thought); else replies.debugReply(thought)
    logger.info({
        step: 'action_required_check',
        tool: responseData?.action_required?.tool,
        has_notes: responseData?.notes !== null && responseData?.notes !== undefined,
        has_slots: !!responseData?.slots
    })
    if (responseData?.action_required?.tool === "transfer_to_operator") {
        _sendReply(`/switchredirect aiassist2 intent_id="${ARTICLES.TRANSFER_FOR_OPERATOR.ID}"`)
    }
    if (responseData?.action_required?.tool === "transfer_to_scenario") {
        logger.info({step: 'transfer_to_scenario', slots: responseData?.slots})
        const numberApplication = await sendApplication(responseData?.slots, dialogOrHistory, replies);
        _sendReply(numberApplication, {response_crm: JSON.stringify(responseData?.slots)});
        await agentApi.finishDialog(dialogId)
    }
    if (cleanedText && responseData?.action_required?.tool !== "transfer_to_operator" && responseData?.action_required?.tool !== "transfer_to_scenario") {
        logger.info({
            step: 'sending_notes_or_text',
            notes: responseData?.notes,
            will_send_notes: responseData?.notes !== null && responseData?.notes !== undefined
        })
        if (responseData?.notes !== null && responseData?.notes !== undefined) {
            const cleanedSlots = Object.fromEntries(Object.entries(responseData?.slots || {}).filter(([key, value]) => value !== null && value !== undefined).map(([key, value]) => [key, String(value)]));
            logger.info({step: 'sending_notes_with_slots', notes: responseData?.notes, cleanedSlots})
            if (responseData?.slots) _sendReply(responseData?.notes, cleanedSlots); else await replies.markdownReply(cleanedText)
        } else {
            logger.info({step: 'sending_fallback_cleanedText', cleanedText_preview: cleanedText?.substring(0, 200)})
            await replies.markdownReply(cleanedText)
        }
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
    logger.info({step: 'slots_before_llm', slotsBlock, userSlots_count: userSlots.length})
    SYSTEM_WITH_SLOTS = LLM_SYSTEM_TEMPLATE.replace('## Слоты:', `## Заполненные слоты:\n        ${JSON.stringify(slotsBlock)}`)
    if (AGENT_PARAMETERS.DO_REPHRASE) {
        rephrases2 = await rephrase(question, REPHRASE_PROMPT, dialog_id, replies);
        contextsearch_texts = [question].concat(rephrases2)
    }
    let fullContext = await getContext(contextsearch_texts, replies);
    addUrlToContextTitle(fullContext);
    let context = fullContext.context;
    logger.info({step: 'context_search_result', context_count: context?.length, has_context: context?.length > 0})
    let response
    if (context?.length === 0) {
        replies.debugReply(`Context not found for question "${question}"`);
        logger.info({step: 'no_context_branch', smalltalk_enabled: AGENT_PARAMETERS.SMALLTALK_IF_NO_CONTEXT})
        if (AGENT_PARAMETERS.SMALLTALK_IF_NO_CONTEXT) {
            response = await smalltalk(question + "/n## Слоты:/n" + JSON.stringify(slotsBlock), dialogOrHistory, replies);
            logger.info({
                step: 'smalltalk_response',
                has_answer: !!response?.answer,
                has_tool_calls: !!response?.tool_calls
            })
            await _printResponse(response, replies, dialogOrHistory, dialog_id);
            return response
        } else {
            replies.markdownReply(STANDARD_MESSAGES.NO_CONTEXT_TEXT);
            return {answer: "", tool_calls: [], log_id: null}
        }
    }
    response = await rag(question, context, dialogOrHistory, replies);
    logger.info({
        step: 'rag_response_received',
        has_answer: !!response?.answer,
        has_tool_calls: !!response?.tool_calls,
        tool_calls_count: response?.tool_calls?.length ?? 0
    })
    let references = '';
    if (AGENT_PARAMETERS.SHOW_REFERENCES) references = getReferences(fullContext)
    await _printResponse(response, replies);
    if (AGENT_PARAMETERS.SHOW_REFERENCES) replies.markdownReply(references);
    if (AGENT_PARAMETERS.SHOW_CONTEXT) replies.textReply("<h3>Контекст</h3>" + JSON.stringify(fullContext, null, 2), true)
    logger.info({step: 'sendMessageToLLM_end', returning_answer_preview: response?.answer?.substring(0, 200)})
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
    logger.info({
        step: 'script_entry',
        message_text: message.message.text,
        message_type: message.message_type,
        user_id: message.user?.omni_user_id
    })
    main().then(res => {
        logger.info({
            step: 'script_resolve',
            result_type: typeof res,
            result_length: Array.isArray(res) ? res.length : (res ? String(res).length : 0)
        })
        res ? resolve(res) : resolve([])
    }).catch(error => {
        logger.error(`Error: ${error}`);
        resolve([agentApi.makeMarkdownReply(error)])
    })
} else {
    logger.info(`Message type: ${message.message_type}. Skip.`);
    resolve([])
}
