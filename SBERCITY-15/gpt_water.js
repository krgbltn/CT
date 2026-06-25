const currentDate = new Date().toLocaleDateString('ru-RU')

let LLM_SYSTEM_TEMPLATE = `
# Роль

Вы — модуль извлечения и верификации данных для оформления заявки на **проблемы с водоснабжением** в жилом комплексе "СберСити".

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
| \`water_problem_type\` | Тип проблемы: "качество_воды" / "отсутствие_воды" | Из текста | **Обязательный** |
| \`water_type\` | Тип воды: "ХВС" / "ГВС" / "обе" | Из текста или \`ask_for_water_type\` | Обяз. при water_problem_type |
| \`water_issue\` | Конкретная проблема: цвет/запах/примеси/напор/ржавая/мутная и т.п. | Из текста или \`ask_for_water_issue\` | **Обязательный** |
| \`water_color\` | Цвет воды: ржавая/желтая/коричневая/мутная | Из текста | Опционально |
| \`water_smell\` | Запах воды: канализации/химический/другой | Из текста | Опционально |
| \`water_pressure\` | Напор: слабый/нет/нормальный | Из текста | Опционально |
| \`problem_since\` | Когда проблема появилась | Из текста или \`ask_for_problem_since\` | **Обязательный** |
| \`problem_scope\` | Масштаб: вся квартира/отдельные краны/у соседей тоже | Из текста или \`ask_for_problem_scope\` | **Обязательный** |
| \`is_permanent\` | Проблема постоянная или периодическая | Из текста | Опционально |
| \`contact_date\` | Удобная дата для связи | Из текста или \`ask_for_contact_date\` | **Обязательный** |
| \`contact_time\` | Удобный интервал для связи | Из текста или \`ask_for_contact_time\` | **Обязательный** |
| \`phone_number\` | Номер телефона | При отсутствии верификации | Обяз. при !verified |
| \`event_type\` | Тип события | "Заявка" по умолч. | Фиксировано |
| \`object_type\` | Тип объекта | Всегда "МКД" | Фиксировано |
| \`type_of_premises_or_service\` | "Вода" | Фиксировано | **Обязательный** |
| \`purpose_of_premises_or_service\` | "Качество воды" / "Нет воды" | Из water_problem_type | **Обязательный** |
| \`problem_category\` | Категория | Из текста + словарь | Обяз. |
| \`priority\` | "Аварийная" / "Обычная" | Авария → "Аварийная" | Обяз. |
| \`problem_description\` | **Полный исходный текст обращения** | Дословно | **Обязательный** |

---

## Правила извлечения

1. **Клиентские данные:**
   - Если \`client_verified\` = **true** → \`client_name_display\` и \`client_status\` **не запрашиваем**.
   - Если \`client_verified\` = **false/null** → сначала \`client_name_display\`, потом \`client_status\`, потом адрес.
   - Если есть history, то значения в ней актуальнее чем в Слотах

2. **Классификация проблемы:**
   - \`water_problem_type\` ∈ {**"качество_воды"**, **"отсутствие_воды"**}
   - Если "качество_воды" → \`purpose_of_premises_or_service\` = "Качество воды (цвет, примеси, запах, напор)"
   - Если "отсутствие_воды" → \`purpose_of_premises_or_service\` = "Нет холодной или горячей воды"

3. **Приоритет:**
   - **"Аварийная"**: полное отсутствие воды в квартире, протечка, затопление
   - **"Обычная"**: всё остальное

4. **problem_description** — **дословный текст**.

5. **Массовые и аварийные отключения:**
   - При массовом аварийном отключении — сообщить известные сроки восстановления, заявку не дублировать.
   - При плановых работах — предоставить информацию о сроках завершения.
   - Если проблема локальная — оформить заявку.

6. **Извлечение ответов из текста пользователя:**
   - Когда пользователь отвечает на вопрос — извлеките ответ и обновите соответствующий слот
   - "нет воды" / "отсутствует" / "нет холодной" / "нет горячей" → \`water_problem_type\`: "отсутствие_воды"
   - "ржавая" / "желтая" / "коричневая" / "мутная" → \`water_issue\`: "цвет", \`water_color\`: соответствующий
   - "запах" / "воняет" / "химический" → \`water_issue\`: "запах", \`water_smell\`: соответствующий
   - "слабый напор" / "плохой напор" / "не течет" → \`water_issue\`: "напор", \`water_pressure\`: "слабый"
   - "горячая" / "холодная" → \`water_type\`: "ГВС" / "ХВС"
   - "вчера" / "сегодня утром" / "неделю назад" → \`problem_since\`
   - "только у меня" / "везде" / "у соседей тоже" → \`problem_scope\`
   - конкретная дата → \`contact_date\`
   - временной интервал → \`contact_time\`

---

## Инструменты уточнения (ТОЛЬКО ОДИН)

| Условие | Инструмент | Вопрос клиенту (notes) — БРАТЬ 1:1 ИЗ СЦЕНАРИЯ |
|---------|------------|------------------------|
| \`client_verified\` ≠ true && \`client_name_display\` == null | \`ask_for_client_name\` | "Назовите ваши фамилию и имя?" |
| \`client_verified\` ≠ true && \`client_name_display\` ≠ null && \`client_status\` == null | \`ask_for_client_status\` | "Вы проживаете в этом доме или в гостях?" |
| \`building_number\` == null **или** \`apartment_number\` == null | \`ask_for_address\` | "Назовите номер дома и квартиры." |
| \`water_problem_type\` == null или неоднозначен | \`ask_for_water_problem_type\` | "Подскажите, пожалуйста, какая именно проблема с водой наблюдается?" |
| \`water_type\` == null | \`ask_for_water_type\` | "Отсутствует горячая или холодная вода?" |
| \`water_issue\` == null | \`ask_for_water_issue\` | "Подскажите, пожалуйста, что именно вас беспокоит: цвет воды, запах, примеси или слабый напор?" |
| \`problem_since\` == null | \`ask_for_problem_since\` | "Как давно наблюдается проблема?" |
| \`problem_scope\` == null | \`ask_for_problem_scope\` | "Проблема только у вас или у соседей тоже?" |
| \`contact_date\` == null **или** \`contact_time\` == null | \`ask_for_contact_datetime\` | "Укажите удобную дату и интервал для связи." |

> **ВАЖНО:**  
> - Не вызывайте 2+ инструментов за раз.  
> - Если клиент отказывается давать данные → \`transfer_to_operator\`.  
> - **notes** — это **прямой вопрос клиенту 1:1 из таблицы выше**. НЕ меняйте формулировку, НЕ сокращайте, НЕ добавляйте свои слова.

---

## Формат выхода

{
  "slots": {
    "client_verified": boolean | null,
    "client_name_display": string | null,
    "client_status": string | null,
    "building_number": string | null,
    "corpus": string | null,
    "apartment_number": string | null,
    "water_problem_type": string | null,
    "water_type": string | null,
    "water_issue": string | null,
    "water_color": string | null,
    "water_smell": string | null,
    "water_pressure": string | null,
    "problem_since": string | null,
    "problem_scope": string | null,
    "is_permanent": boolean | null,
    "contact_date": string | null,
    "contact_time": string | null,
    "phone_number": string | null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Вода",
    "purpose_of_premises_or_service": string | null,
    "problem_category": string | null,
    "priority": string | null,
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
    "water_problem_type": "качество_воды",
    "water_type": "ХВС",
    "water_issue": "ржавая вода с запахом",
    "water_color": "ржавая",
    "water_smell": "неприятный",
    "water_pressure": "слабый",
    "problem_since": "вчера",
    "problem_scope": "все краны в квартире",
    "is_permanent": true,
    "contact_date": "15.06.2026",
    "contact_time": "10:00-12:00",
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Вода",
    "purpose_of_premises_or_service": "Качество воды (цвет, примеси, запах, напор)",
    "problem_category": "Ржавая вода",
    "priority": "Обычная",
    "problem_description": "Из крана течет ржавая вода с неприятным запахом"
  },
  "action_required": {
    "tool": "transfer_to_scenario",
    "args": { "scenario": "create_work_order" }
  },
  "notes": null
}

#### 2. Неясен тип проблемы → запросить

{
  "slots": {
    "client_verified": true,
    "building_number": "10",
    "apartment_number": "55",
    "water_problem_type": null,
    "problem_description": "Что-то с водой не так",
    ...
  },
  "action_required": {
    "tool": "ask_for_water_problem_type",
    "args": {}
  },
  "notes": "Подскажите, пожалуйста, какая именно проблема с водой наблюдается?"
}

#### 2а. Пользователь ответил "нет горячей воды" → ОБНОВИТЬ problem_type + water_type и задать следующий вопрос

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "water_problem_type": "отсутствие_воды",
    "water_type": "ГВС",
    "water_issue": null,
    "water_color": null,
    "water_smell": null,
    "water_pressure": null,
    "problem_since": null,
    "problem_scope": null,
    "is_permanent": null,
    "contact_date": null,
    "contact_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Вода",
    "purpose_of_premises_or_service": "Нет холодной или горячей воды",
    "problem_category": "Нет ГВС",
    "priority": "Обычная",
    "problem_description": "Нет горячей воды"
  },
  "action_required": {
    "tool": "ask_for_problem_scope",
    "args": {}
  },
  "notes": "Проблема только у вас или у соседей тоже?"
}

#### 2б. Пользователь ответил "только у меня" → ОБНОВИТЬ problem_scope и задать следующий вопрос

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "water_problem_type": "отсутствие_воды",
    "water_type": "ГВС",
    "water_issue": null,
    "water_color": null,
    "water_smell": null,
    "water_pressure": null,
    "problem_since": null,
    "problem_scope": "только у меня",
    "is_permanent": null,
    "contact_date": null,
    "contact_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Вода",
    "purpose_of_premises_or_service": "Нет холодной или горячей воды",
    "problem_category": "Нет ГВС",
    "priority": "Обычная",
    "problem_description": "Нет горячей воды"
  },
  "action_required": {
    "tool": "ask_for_problem_since",
    "args": {}
  },
  "notes": "Как давно наблюдается проблема?"
}

#### 2в. Пользователь ответил "сегодня утром" → ОБНОВИТЬ problem_since и задать следующий вопрос

{
  "slots": {
    "client_verified": true,
    "building_number": "4",
    "apartment_number": "15",
    "water_problem_type": "отсутствие_воды",
    "water_type": "ГВС",
    "water_issue": null,
    "water_color": null,
    "water_smell": null,
    "water_pressure": null,
    "problem_since": "сегодня утром",
    "problem_scope": "только у меня",
    "is_permanent": null,
    "contact_date": null,
    "contact_time": null,
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Вода",
    "purpose_of_premises_or_service": "Нет холодной или горячей воды",
    "problem_category": "Нет ГВС",
    "priority": "Обычная",
    "problem_description": "Нет горячей воды"
  },
  "action_required": {
    "tool": "ask_for_contact_datetime",
    "args": {}
  },
  "notes": "Укажите удобную дату и интервал для связи."
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
ВАЖНО: \`action_required.tool\` всегда должен быть одним из инструментов из таблицы выше. НЕ возвращайте пустой \`action_required\` — если слоты не заполнены, укажите соответствующий \`ask_for_*\` инструмент; если все заполнены — \`transfer_to_scenario\`.
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
const ITEM_TYPES = {
    function: "function",
    commit: "commit"
}

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
    return text
        .toLowerCase()
        .replace(CYRILLIC_REGEX, match => TRANS_MAP[match] || '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

function getSlotValue(slotId) {
    return message.slot_context.filled_slots.find((slot) => slot.slot_id === slotId)?.value
}

function scenario(scenarioName) {
    return function (originalFunction) {
        const wrapped = async function (...args) {
            return await originalFunction.apply(this, args)
        }
        wrapped.isScenario = true
        wrapped.returnsResult = true
        if (scenarioName === undefined) {
            wrapped.scenarioName = AGENT_SLOTS.SCENARIO_RESULT
        } else if (scenarioName === null) {
            wrapped.scenarioName = null
            wrapped.returnsResult = false
        } else {
            wrapped.scenarioName = scenarioName
        }
        return wrapped
    }
}

const transfer_to_operator = scenario(null)(function () {
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})

const transfer_to_scenario = scenario(AGENT_SLOTS.SCENARIO_RESULT)(function ({id}, replies) {
    const scenarios = {
        [translit(ARTICLES.TRANSFER_FOR_OPERATOR.NAME)]: ARTICLES.TRANSFER_FOR_OPERATOR.ID
    }
    if (scenarios[id] === undefined) {
        return `ERROR: scenario ${id} is not defined`
    }
    if (replies) {
        _sendReply.slots = _sendReply.slots || {}
        _sendReply.slots[AGENT_SLOTS.SCENARIO_SOURCE] = "true"
    }
    return switchredirect(scenarios[id])
})

function switchredirect(intent_id) {
    return `/switchredirect aiassist2 intent_id="${intent_id}"`
}

const availableFunctions = {
    transfer_to_operator,
    transfer_to_scenario
}

TOOLS = [
    {
        "type": ITEM_TYPES.function,
        "function": {
            "name": "transfer_to_operator",
            "description": "Переводит диалог на оператора. Вызывай, если не нашел ответа, не можешь решить проблему или пользователь попросил оператора.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    }
]

class ScenarioNotReadyError extends Error {
    constructor(scenarioName) {
        super(`Unexpected run of the tools agent during waiting for ${scenarioName}`);
        this.name = "ScenarioNotReadyError"
    }
}

class SwitchRedirectPropagate extends Error {
    constructor(switchredirect) {
        super("switchredirect call");
        this.name = "SwitchRedirectPropagate"
        this.switchredirect = switchredirect
    }
}

class RedisQueue {
    constructor(redisClient, deleteSlotFn, debugLogFn, commitFcResults) {
        this.redis = redisClient
        this.deleteSlot = deleteSlotFn
        this.debugReply = debugLogFn
        this.commitFcResults = commitFcResults
    }

    async addFunction(queue, name, args, toolCallId) {
        queue.push({
            type: ITEM_TYPES.function,
            name: name,
            args: args,
            toolCallId: toolCallId,
            executed: false,
            started: false,
            scenario: null,
            result: null
        });
    }

    async addCommit(queue, availableTools) {
        queue.push({type: ITEM_TYPES.commit, availableTools: availableTools});
    }

    async processQueue(replies) {
        const queue = await this.getQueue()
        for (let i = 0; i < queue.length; i++) {
            const item = queue[i]
            if (item.type === ITEM_TYPES.function && item.executed) continue
            if (item.type === ITEM_TYPES.function) {
                if (item.started) {
                    let scenarioResult
                    if (item.scenario !== null) {
                        scenarioResult = this.getScenarioAnswer(item.scenario)
                        if (scenarioResult === undefined) throw new ScenarioNotReadyError(item.scenario)
                        this.deleteSlot(item.scenario)
                    }
                    await this.markAsExecuted(queue, i, scenarioResult)
                } else {
                    const func = availableFunctions[item.name]
                    this.debugReply(`Calling ${item.name}(${JSON.stringify(item.args)})`)
                    if (func.isScenario) {
                        await this.markAsStartedScenario(queue, i, func.scenarioName)
                        const res = await func(item.args, replies)
                        if (res?.[0] === "/") throw new SwitchRedirectPropagate(res)
                        await this.markAsExecuted(queue, i, res)
                    } else {
                        const res = await func(item.args)
                        await this.markAsExecuted(queue, i, res)
                    }
                }
                continue
            }
            if (item.type === ITEM_TYPES.commit) {
                const functionsToCommit = []
                let commitIndex = i
                for (let j = 0; j < commitIndex; j++) {
                    if (queue[j].type === ITEM_TYPES.function && queue[j].executed) {
                        functionsToCommit.push({
                            "content": queue[j].result ?? "Done",
                            "tool_call_id": queue[j].toolCallId
                        })
                    } else {
                        logger.warn(`Unexpected item before commit: ${JSON.stringify(queue[j])}`);
                        this.debugReply(`Unexpected item before commit: ${JSON.stringify(queue[j])}`);
                    }
                }
                const n_cycles = await this.incNCycles()
                this.debugReply(`Cycle ${n_cycles} / ${AGENT_PARAMETERS.MAX_CYCLES}`)
                const tool_choice = n_cycles >= AGENT_PARAMETERS.MAX_CYCLES ? "none" : "auto"
                const llm_res = await this.commitFcResults(functionsToCommit, tool_choice)
                queue.splice(0, commitIndex + 1)
                await this.saveQueue(queue)
                return llm_res
            }
        }
    }

    getScenarioAnswer(scenarioName) {
        if (scenarioName === null) return null
        return getSlotValue(scenarioName)
    }

    async markAsStartedScenario(queue, i, scenarioName) {
        queue[i].started = true
        queue[i].scenario = scenarioName
        await this.saveQueue(queue)
    }

    async markAsExecuted(queue, i, result) {
        queue[i].executed = true
        queue[i].result = result
        await this.saveQueue(queue)
        this.debugReply(`${queue[i].name} finished with ${result}`)
    }

    async clearQueue() {
        for (const item of await this.getQueue()) {
            if (item.scenario !== null && item.scenario !== undefined) this.deleteSlot(item.scenario)
        }
        await this.saveQueue([])
        await this.resetNCycles()
    }

    async getQueue() {
        const data = await this.redis.get(KEYS.QUEUE_KEY)
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
        const oldValue = getSlotValue(slotId)
        if (oldValue) slotsStore[slotId] = oldValue
    }
    const current = slotsStore[slotId] ?? ""
    slotsStore[slotId] = current ? `${current};${newText}` : newText
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
            DestinationChannel: {ChannelId: reply.channel_id, ChannelUserId: message.user.channel_user_id},
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
    let replies = []
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

    replies.textReply = textReply
    replies.markdownReply = markdownReply
    replies.debugReply = debugReply
    replies.deleteSlot = deleteSlot

    try {
        response = await _main(replies);
    } catch (e) {
        logger.info(`main error ${e}`)
        if (e instanceof SwitchRedirectPropagate) {
            if (message?.meta?.isTest) return e.switchredirect
            await replies.markdownReply(e.switchredirect);
            return replies;
        }
        if (e.code === 'ECONNABORTED') await replies.textReply(STANDARD_MESSAGES.TIMEOUT_ERROR_MSG);
        else await replies.textReply(STANDARD_MESSAGES.DEFAULT_ERROR_MSG);
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
        await Promise.all([redisClient.clearQueue(), replies.markdownReply(STANDARD_MESSAGES.MESSAGE_CANCEL_WAITING)])
        return
    }

    let response, finalAnswer, responsePrinted = false
    try {
        response = await redisClient.processQueue(replies)
    } catch (error) {
        if (error instanceof ScenarioNotReadyError && question) {
            await replies.markdownReply(MESSAGE_WHILE_WAITING_ERROR)
            return
        }
        throw error
    }

    if (response === undefined) {
        response = await sendMessageToLLM(question, dialog_id, replies)
        responsePrinted = true
        finalAnswer = response.answer
    } else if (question) {
        logger.warn(`Both tools handling and user's question (${question}) have gotten. The user's question will be ignored.`);
    }

    while (response !== undefined) {
        let functionAdded = false
        const taskQueue = await redisClient.getQueue()
        if (response.answer && !responsePrinted) await _printResponse(response, replies)
        if (response?.tool_calls) {
            for (const call of response.tool_calls) {
                if (!call.function || !call.function.name) continue
                const funcName = call.function.name
                const funcArgs = JSON.parse(call.function.arguments)
                if (availableFunctions[funcName]) {
                    await redisClient.addFunction(taskQueue, funcName, funcArgs, call.id)
                    functionAdded = true
                } else throw new Error(`Функция ${funcName} не найдена`)
            }
        }
        if (functionAdded) {
            await redisClient.addCommit(taskQueue);
            await redisClient.saveQueue(taskQueue);
        } else await redisClient.resetNCycles()
        response = await redisClient.processQueue(replies)
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
    const config = {headers: {'content-type': 'application/json'}}
    const data = {"login": API.login, "password": API.password}
    const response = await axios.post(API.url_crm_token, data, config)
    return response.data.accessToken
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

function formatDataBlockWater(slots) {
    const order = ["type_of_premises_or_service", "purpose_of_premises_or_service", "water_problem_type", "water_type", "water_issue", "water_color", "water_smell", "water_pressure", "problem_since", "problem_scope", "is_permanent", "contact_date", "contact_time", "client_name_display", "client_status", "phone_number", "building_number", "corpus", "apartment_number", "problem_category", "priority", "problem_description"];
    const required = ["building_number", "apartment_number", "water_problem_type", "water_type", "water_issue", "problem_since", "problem_scope", "contact_date", "contact_time", "type_of_premises_or_service", "purpose_of_premises_or_service", "priority", "problem_description"];
    const labels = {
        type_of_premises_or_service: "Вода",
        purpose_of_premises_or_service: "Качество воды / Нет воды",
        water_problem_type: "Тип проблемы",
        water_type: "Тип воды (ХВС/ГВС)",
        water_issue: "Описание проблемы",
        water_color: "Цвет воды",
        water_smell: "Запах воды",
        water_pressure: "Напор воды",
        problem_since: "Когда появилась проблема",
        problem_scope: "Масштаб проблемы",
        is_permanent: "Характер проблемы",
        contact_date: "Дата связи",
        contact_time: "Время связи",
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
            if (key === 'contact_date' || key === 'problem_since') {
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
    return formatDataBlockWater(slots) + '\n\n' + formatDialogBlock(dialogOrHistory);
}

async function sendApplication(slots, dialogOrHistory, replies) {
    let result = formatFullDescription(slots, dialogOrHistory);
    logger.warn({result})
    //return `Спасибо, что обратились ко мне. \n✅Заявка **оформлена**. \n 📱 Статус заявки присылаем через пуш-уведомления мобильного приложения.`

    const token = await getTokenCRM()
    const config = {headers: {'content-type': 'application/json', 'authorization': 'Bearer ' + token}}
    const data = {id: uuid.v4(), description: result}
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
    const {thought, cleanedText} = extractThinkContent(response.answer, false)

    if (!cleanedText) return

    const extracted = extractJSON(cleanedText)
    const responseData = (typeof extracted === 'object' && extracted !== null && extracted.action_required) ? extracted : null

    if (!responseData) {
        logger.info({step: 'plain_text_response', text_preview: cleanedText?.substring(0, 200)})
        if (AGENT_PARAMETERS.SHOW_THINKING && thought) await replies.textReply(thought)
        else replies.debugReply(thought)
        await replies.markdownReply(cleanedText)
        return
    }

    if (AGENT_PARAMETERS.SHOW_THINKING && thought) await replies.textReply(thought)
    else replies.debugReply(thought)

    if (responseData.action_required.tool === "transfer_to_operator") {
        _sendReply(`/switchredirect aiassist2 intent_id="${ARTICLES.TRANSFER_FOR_OPERATOR.ID}"`)
        return
    }
    if (responseData.action_required.tool === "transfer_to_scenario") {
        const numberApplication = await sendApplication(responseData.slots, dialogOrHistory, replies)
        _sendReply(numberApplication, {response_crm: JSON.stringify(responseData.slots)})
        await agentApi.finishDialog(dialogId)
        return
    }

    if (responseData.notes !== null && responseData.notes !== undefined) {
        const cleanedSlots = Object.fromEntries(Object.entries(responseData.slots || {}).filter(([key, value]) => value !== null).map(([key, value]) => [key, String(value)]))
        _sendReply(responseData.notes, cleanedSlots)
    } else {
        await replies.markdownReply(cleanedText)
    }
}

async function getBotMediatorDialogHistoryResponse(dialogId) {
    try {
        const config = {headers: {'Content-Type': 'application/json'}, httpsAgent: AGENT}
        const response = await axios.get(`${API.url_mediator_service}?dialog_id=${dialogId}`, config)
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
        if (clientDialogHistory) {
            return clientDialogHistory.reduce((acc, message) => {
                const isUserMessage = !!message.msg
                const source = isUserMessage ? message.msg : message.reply
                const type = source?.message_type
                const text = source?.message?.text
                if (type === 1 || type === 19) {
                    if (isUserMessage) acc.push(createMessageItem(text, ROLE.USER))
                    else {
                        const role = message.reply?.operator?.operator_id === "__SYSTEM__" ? ROLE.BOT : ROLE.OPERATOR
                        acc.push(createMessageItem(text, role))
                    }
                }
                return acc
            }, [])
        } else return dialog_id
    } catch (e) {
        logger.error(`Error getDialog: ${JSON.stringify(e)}.`)
    }
}

function getSlots(slots) {
    if (!slots || !Array.isArray(slots)) return []
    const filledSlots = message.slot_context.filled_slots
    return slots.map(slot => {
        const filledSlot = filledSlots.find(filled => filled.slot_id === slot.id)
        let slotValue = null
        if (filledSlot?.value) {
            const values = filledSlot.value.split(';');
            slotValue = values.length > 0 ? values[values.length - 1] : null
        }
        return {slotId: slot.id, slotDescription: slot.description, slotValue: slotValue}
    })
}

async function sendMessageToLLM(question, dialog_id, replies) {
    let contextsearch_texts = question
    let dialogOrHistory = message?.meta?.isTest ? message.meta?.history : await getDialog(dialog_id)
    const userSlots = getSlots(USER_SLOTS)
    const slotsBlock = {}
    userSlots.length > 0 ? userSlots.forEach(s => {
        slotsBlock[s.slotId] = s.slotId === 'client_verified' ? getClientVerified() : s.slotValue
    }) : '- Нет заполненных слотов'
    SYSTEM_WITH_SLOTS = LLM_SYSTEM_TEMPLATE.replace('## Слоты:', `## Заполненные слоты:\n        ${JSON.stringify(slotsBlock)}`)
    if (AGENT_PARAMETERS.DO_REPHRASE) {
        rephrases2 = await rephrase(question, REPHRASE_PROMPT, dialog_id, replies)
        contextsearch_texts = [question].concat(rephrases2)
    }
    let fullContext = await getContext(contextsearch_texts, replies)
    addUrlToContextTitle(fullContext)
    let context = fullContext.context
    let response
    if (context?.length === 0) {
        replies.debugReply(`Context not found for question "${question}"`);
        if (AGENT_PARAMETERS.SMALLTALK_IF_NO_CONTEXT) {
            response = await smalltalk(question + "/n## Слоты:/n" + JSON.stringify(slotsBlock), dialogOrHistory, replies)
            await _printResponse(response, replies, dialogOrHistory, dialog_id)
            return response
        } else {
            replies.markdownReply(STANDARD_MESSAGES.NO_CONTEXT_TEXT)
            return {answer: "", tool_calls: [], log_id: null}
        }
    }
    response = await rag(question, context, dialogOrHistory, replies)
    let references = ''
    if (AGENT_PARAMETERS.SHOW_REFERENCES) references = getReferences(fullContext)
    await _printResponse(response, replies)
    if (AGENT_PARAMETERS.SHOW_REFERENCES) replies.markdownReply(references)
    if (AGENT_PARAMETERS.SHOW_CONTEXT) replies.textReply("<h3>Контекст</h3>" + JSON.stringify(fullContext, null, 2), true)
    return response
}

function _debugAxiosError(error, replies) {
    if (error.response) {
        replies.debugReply(JSON.stringify(error.response.data, null, 2));
        replies.debugReply(error.response.status)
    } else if (error.request) replies.debugReply(error.request)
    else replies.debugReply('Error', error.message)
}

async function getContext(question, replies) {
    let response
    try {
        response = await axios.post(URL_CONTEXT_SEARCH, {
            text: question,
            customer_id: CUSTOMER_ID,
            record_type: AGENT_PARAMETERS.RECORD_TYPE,
            output_format: "json-vikhr"
        })
        logger.info(response.data)
    } catch (e) {
        logger.info(`Error requesting context search: ${e}.`)
        _debugAxiosError(e, replies)
        throw e
    }
    const fullContext = response.data
    if (CONTEXT_SETTINGS.MAX_CONTEXTS > -1) Object.keys(fullContext).forEach(key => {
        fullContext[key] = fullContext[key].slice(0, CONTEXT_SETTINGS.MAX_CONTEXTS)
    })
    return fullContext
}

function _putDialogIdOrHistory(requestData, dialogOrHistory) {
    if (typeof dialogOrHistory === "string") requestData["dialog_id"] = dialogOrHistory
    else requestData["history"] = dialogOrHistory
    return requestData
}

async function _callLLM(url, data, dialogOrHistory, replies, extraErrorHandling = null) {
    const processedData = _putDialogIdOrHistory(data, dialogOrHistory)
    try {
        const response = await axios.post(url, processedData, {
            timeout: LLM_SETTINGS.timeout * 1000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API.llm_auth_token}`,
                'Connection': 'keep-alive'
            },
            httpsAgent: AGENT
        })
        return response.data
    } catch (e) {
        logger.info(`Error requesting LLM (POST ${url}): ${e}.`)
        _debugAxiosError(e, replies)
        if (extraErrorHandling) extraErrorHandling(e)
        throw e
    }
}

async function smalltalk(question, dialogOrHistory, replies) {
    const thinkingPrompt = AGENT_PARAMETERS.ENABLE_THINKING_SMALLTALK ? AGENT_PARAMETERS.THINK : AGENT_PARAMETERS.NO_THINK
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
    }, dialogOrHistory, replies)
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
    let references = ""
    const articles_counts = new Map()
    const articles_titles = new Map()
    full_context.symbol_code.forEach((intent_id, idx) => {
        const prev_count = articles_counts.get(intent_id) || 0
        articles_counts.set(intent_id, prev_count + 1)
        articles_titles.set(intent_id, full_context.title[idx])
    })
    Array.from(articles_counts.entries()).sort((a, b) => b[1] - a[1]).forEach(([intent_id, cnt]) => {
        references += `\n\n*  [${articles_titles.get(intent_id)}](${API.base_url}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id})`
    })
    if (references !== "") references = "### Ссылки для информации:" + references
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
    logger.info(`Message type: ${message.message_type}. Skip.`)
    resolve([])
}
