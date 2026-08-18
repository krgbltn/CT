// @requires modules/models/qwen.js
// @requires gpt_core.js

// === Промпты ===

let LLM_SYSTEM_TEMPLATE = `Ты ИИ ассистент для помощи клиентам компании ИДА. ИДА - это AI-платформа управления знаниями и текстовыми коммуникациями для поддержки, маркетинга и продаж с использованием технологий искусственного интеллекта. Платформа создана для оказания услуг контакт-центра в текстовом режиме, работающий в web-чатах, мессенджерах, социальных сетях, e-mail. В Базе Знаний содержится информация о настройке и использовании платформы, чат-ботов, баз знаний, каналов, и т.п.

Сперва определи является ли вопрос личным (например, "как дела"). Если вопрос личный, то ответь дружелюбно, игнорируя найденную информацию, без ссылок, без картинок.

Если вопрос конкретный (например, "как сделать что-то" или "есть ли такая-то возможность"), то используя найденную информацию (контекст), ответь на вопрос максимально точно. Отвечай подробной инструкцией. Используй Markdown, включая ссылки и изображения (вида ![](/file/...). В ответ обязательно вставь ВСЕ изображения внутри статьи!. В ответ добавь список указанных в заголовках гиперссылок на использованные статьи. Итого, если вопрос конкретный, то ответ будет состоять из:
1. Ответ с использованием найденной информации
2. Список ссылок статей
3. Картинки из статей
.
Если ответа нет в контексте, то скажи, что к сожалению я не смог найти ответ в Базе Знаний. Если спрашивают про политику, религию, войну, принадлежность спорных территорий или другую чувствительную тему, не связанную с ИДА, то скажи "Извините, я могу отвечать только на вопросы о ИДА".`
let LLM_SYSTEM_TEMPLATE_SMALLTALK = `ТЫ ИИ ассистент для помощи клиентам компании ИДА. ИДА - это AI-платформа управления знаниями и текстовыми коммуникациями для поддержки, маркетинга и продаж с использованием технологий искусственного интеллекта. Платформа создана для оказания услуг контакт-центра в текстовом режиме, работающий в web-чатах, мессенджерах, социальных сетях, e-mail. В Базе Знаний содержится информация о настройке и использовании платформы, чат-ботов, баз знаний, каналов, и т.п.

Отвечай кратко. Если спрашивают про политику, религию, войну, принадлежность спорных территорий или другую чувствительную тему, не связанную с ИДА, то скажи "Извините, я могу отвечать только на вопросы о ИДА". Но на личные вопросы, smalltalk обращения отвечай дружелюбно, чтобы поддержать разговор.`

// промпт определения тематики вопроса
let LLM_SYSTEM_TEMPLATE_TOPIC = `Определи тематику вопроса клиента. Ответь одним предложением, не более 10 слов. Не указывай в ответе, что это тематика. Не предоставляй ответ для клиента - нужно только определить тематику.`

let SMALLTALK_TEMPLATE = `{question}`

let RAG_TEMPLATE = `{question}

# Найденная информация:

{context}"`

// prompt обертка вокруг каждого найденного куска контента.
const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`

const RAG_JOIN_SEP = "\n\n...\n\n"
const DB_LANGUAGE = "на русском"
let REPHRASE_PROMPT_1 = `Сгенерируй {samples_per_generation} поисковых запросов ${DB_LANGUAGE} языке к фразе '{question}' с деталями из предыдущего диалога.
Не придумывай детали - бери только то, что было в диалоге.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример поискового запроса.`
let REPHRASE_PROMPT_2 = `Ты - поисковая система. К тебе пришел запрос '{question}' с деталями из предыдущего диалога.
Сгенерируй {samples_per_generation} кратких вариантов сниппетов на ${DB_LANGUAGE} языке.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример сниппета.
Генерируй максимально отличающиеся друг от друга сниппеты`


// === IDA-specific config ===
// SHARE_ID объявлен в core/40_references.js — читается из agent_parameters автоматически
let DEFINE_TOPIC = (agentSettings.agent_parameters ?? {}).DEFINE_TOPIC ?? false
let USE_RAG = (agentSettings.agent_parameters ?? {}).USE_RAG ?? true
let URL_REPLACE_FROM = (agentSettings.agent_parameters ?? {}).URL_REPLACE_FROM ?? null
let URL_REPLACE_TO = (agentSettings.agent_parameters ?? {}).URL_REPLACE_TO ?? null


// === Prompt & Model config ===
applyPromptOverrides()
if (agentSettings.prompts?.system_template_topic) LLM_SYSTEM_TEMPLATE_TOPIC = agentSettings.prompts.system_template_topic
applyModelConfig()


// === IDA-specific message processor: replaces domain in answers ===
// Наследуется от того процессора, который подключён через @requires (Qwen/Default/GigaChat),
// чтобы при смене модели не нужно было править этот файл.
const _BaseMessageProcessor = messageProcessor.constructor
class IDAMessageProcessor extends _BaseMessageProcessor {
    fromModelFormat(response) {
        if (URL_REPLACE_FROM && URL_REPLACE_TO && response.answer) {
            response = { ...response, answer: response.answer.replaceAll(URL_REPLACE_FROM, URL_REPLACE_TO) }
        }
        return super.fromModelFormat(response)
    }
}
messageProcessor = new IDAMessageProcessor()


// === IDA-specific functions ===

async function define_topic(question, replies) {
    const requestData = {
        question: question + NO_THINK,
        temperature: LLM_TEMPERATURE_SMALLTALK,
        top_p: LLM_TOP_P,
        top_k: LLM_TOP_K,
        min_p: LLM_MIN_P,
        instruction: LLM_SYSTEM_TEMPLATE_TOPIC,
        last_context_price: LAST_CONTEXT_PRICE,
        other_context_price: OTHER_CONTEXT_PRICE,
        add_other_context: ADD_OTHER_CONTEXT
    }

    const response = await _callLLM(
        URL_LLM_SMALLTALK,
        requestData,
        replies
    )
    return response.answer
}


// === Tool functions ===

const transfer_to_operator = scenario(null)(function () {
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})


const transfer_to_scenario = scenario(null)(function ({ id }) {
    const scenarios = {
        [translit("Test Scenario")]: "article-5ce41239-a4d5-48c7-8c11-7df100ba1685",
        [translit("Проверить код активации")]: "article-d948bdd4-4a8f-460a-b285-c10fae33c67d",
    }
    if (scenarios[id] === undefined) {
        return `ERROR: scenario ${id} is not defined`
    }
    return switchredirect(scenarios[id])
})


const availableFunctions = {
    transfer_to_operator,
    transfer_to_scenario
}


let TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "transfer_to_operator",
            "description": "Переводит диалог на оператора. Вызывай, если не нашел ответа, не можешь самостоятельно решить проблему пользователя или если пользователь явно попросил тебя соединить его с оператором.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "transfer_to_scenario",
            "description": `
Переводит диалог на выбранный сценарий. Вызывай сценарий, если он подходит в текущей ситуации или если сообщение пользователя похоже на один из примеров вопросов для сценария.
Доступные сценарии перечислены в формате \`- <id сценария> <Описание сценария (может отсутствовать)> Примеры вопросов <примеры сообщений, на которые нужно ответить этим сценарием через запятую> \`.
После выполнения сценария (Done) спроси 'У вас остались еще вопросы?'`,
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        // заполняется в реалтайме. Это пример, который будет перезаписан
                        "description": `Идентификатор сценария, на который выполняешь перевод. Доступные значения и примеры вопросов (вызывай этот сценарий, если сообщение пользователя похоже на один из примеров вопросов):
- ${translit("Test Scenario")} Примеры вопросов: тест, Тест, test, пройти тест
- ${translit("Проверить код активации")} Вызывайте этот сценарий, когда пользователь:
        Просит проверить код активации (например, вводит код или задает вопрос о его проверке).
        Вводит код, но получает ошибку (например, «код неверный»).
        Столкнулся с проблемами активации (например, не может войти в личный кабинет, связанные с кодом).
        Не уверен в корректности кода и хочет уточнить правила проверки.
        Примеры вопросов: проверь код активации, код 123 верный?, код активации пробить.
`,
                        // заполняется в реалтайме. Это пример, который будет перезаписан
                        "enum": [translit("Test Scenario"), translit("Проверить код активации")]
                    }
                },
                "required": ["id"],
            },
        },
    },
]


// === Override _sendReply: прокидываем conversation_id из слотов в meta ===
// Переопределяет core-овую _sendReply (modules/core/80_main.js), добавляя в meta
// каждой исходящей реплики значение слота "conversation_id". Благодаря hoisting
// function declarations версия из клиентского скрипта (concatenated после gpt_core.js)
// побеждает core-овую — все хелперы (textReply/markdownReply/debugReply и _printResponse)
// автоматически зовут эту реализацию.
function _sendReply(text, slots, meta = {}) {
    const conversationId = getSlotValue("conversation_id")
    if (conversationId) {
        meta = { ...meta, conversation_id: conversationId }
    }

    const reply = agentApi.makeMarkdownReply(text)
    slotManager.mergeSlots(slots)
    logger.debug(JSON.stringify(reply.message.text))

    return agentApi.sendMessage({
        MessageMarkdown: reply.message.text,
        SendMessageParams: {
            ProjectId: reply.customer_id,
            OmniUserId: reply.omni_user_id,
            Sender: {},
            DestinationChannel: {
                ChannelId: reply.channel_id,
                ChannelUserId: message.user.channel_user_id
            },
            FilledSlots: slotManager.replySlots,
            Meta: meta
        }
    }, logger)
        .then(result => {
            if (!result.Ok) {
                const errMsg = `${JSON.stringify(result.Errors)} during sending ${JSON.stringify(reply)}`
                logger.error(errMsg)
                if (DEBUG) {
                    agentApi.sendMessage({
                        MessageMarkdown: errMsg,
                        SendMessageParams: {
                            ProjectId: reply.customer_id,
                            OmniUserId: reply.omni_user_id,
                            Sender: {}
                        }
                    }, logger)
                }
            }
        })
        .catch(e => logger.error(`Error sending reply: ${e}.`))
}


// === _main с IDA-спецификой ===
async function _main(replies) {
    // Slot-based runtime toggles
    let current_topic = getSlotValue("dialog_topic_title")
    let ida_topic = getSlotValue("sys_ida_topic")
    let linked_dialog_ids = getSlotValue("linked_dialog_ids")

    let rag_slot = getSlotValue("use_rag")
    let use_rag = USE_RAG && rag_slot !== "false"

    let think_slot = getSlotValue("use_think")
    let use_think = ENABLE_THINKING_SMALLTALK && think_slot !== "false"

    let rephrase_slot = getSlotValue("use_rephrase")
    let use_rephrase = DO_REPHRASE && rephrase_slot !== "false"

    let smalltalk_slot = getSlotValue("use_smalltalk")
    let use_smalltalk = SMALLTALK_IF_NO_CONTEXT && smalltalk_slot !== "false"

    replies.debugReply(`slots: use_rag: ${use_rag}, use_think: ${use_think}, use_rephrase: ${use_rephrase}, use_smalltalk: ${use_smalltalk}, sys_ida_topic: ${ida_topic}, linked_dialog_ids: ${linked_dialog_ids}`)

    // Define topic if needed
    let topicSlots = {}
    if (DEFINE_TOPIC && !current_topic) {
        let question = message.message.text
        let conversation_topic = await define_topic(question, replies)
        topicSlots = { dialog_topic_title: conversation_topic?.replace('<think>', '').replace('</think>', '').replaceAll('\n', '') }
        // Записываем в replySlots — попадут во все последующие _sendReply
        slotManager.mergeSlots(topicSlots)
    }

    return _mainBody(replies, {
        use_rag,
        use_think,
        use_rephrase,
        use_smalltalk,
        topicSlots,
    }, linked_dialog_ids)
}

runEntrypoint()
