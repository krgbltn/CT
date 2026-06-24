const currentDate = new Date().toLocaleDateString('ru-RU');
const ARTICLES = agentSettings?.articles

let LLM_SYSTEM_TEMPLATE = `Ты ИИ ассистент для помощи клиентам компании СберСити. СберСити — техническая поддержка управляющей компании жилого комплекса. 
Твоя задача определить к какой из представленных тематик относится вопрос. Если есть подходящая тематика, то в ответе выдать только ID тематики. Если вопрос пользователя не подходит ни под одну из тематик, то сгенериру ответ используя только информацию из контекста. 
Например, вопрос: "Тут в подъезде грязь ((", верный ответ: ${ARTICLES?.WORK_OUTSIDE_APARTMENT.ID}.

Например, вопрос: "Какой план развития?", 
верный ответ: "1 квартал 2026
*Учет прав доступа пользователя к статьям базы знаний при формировании ответа ИИ-ассистентом
*RAG к вложениям в базе знаний: pdf, doc, excel, ppt, изображения, csv, txt, код".

Доступные тематики:
[1. Тематика "${ARTICLES?.WORK_OUTSIDE_APARTMENT.NAME}"]
ID тематики:"${ARTICLES?.WORK_OUTSIDE_APARTMENT.ID}".
Данный сценарий подходит для клиентов, которые сообщают о проблемах вне квартиры, например, во дворе, на кровля, крыше, в нежилом помещении, паркинге, подъезде, на фасаде дома.
Примеры подходящих вопросов для этого сценария:
- "Тут в подъезде грязь (("
- "Здравствуйте! Просьба убрать стеклопакет из лифтового хола на 7 этаже первого подьезда во избежании опракидывания на детей."
- "В паркинге по стене течет вода"


[2. Тематика "${ARTICLES?.GUARANTEE_WORKS.NAME}"]
ID тематики:"${ARTICLES?.GUARANTEE_WORKS.ID}".
Данный сценарий подходит для клиентов, которые сообщают о проблемах внутри квартиры, попадающие под гарантийный случай после приемки квартиры от застройщика.
Примеры подходящих вопросов для этого сценария:
"Добрый день! В комнате где окно-эркер холоднее всего и дует со стыков оконной рамы. Просьба направить специалиста и устранить проблему."
"Добрый день, появились зазоры между полом и плинтусом."
"Трещина в стене в одной из комнат"


[3. Тематика "${ARTICLES?.PASS_ORDER.NAME}"]
ID тематики:"${ARTICLES?.PASS_ORDER.ID}".
Данный сценарий подходит для клиентов, которые сообщают о необходимости заказа пропуска для въезда на территорию жилого комплекса. Пропуск может быть постоянным - для владельцев и жителей ЖК, временным - для временных жителей ЖК, разовым - для работников, курьеров, доставщиков. 
Примеры подходящих вопросов для этого сценария:
"Нужен пропуск на машину"
"Доброе утро! Нужна новая метка для въезда в паркинг."
"Добрый вечер! Прошу сделать (в который раз! ) ПОСТОЯННЫЙ пропуск по номеру машины на открытие шлагбаума к корпуса 2 для разгрузки."


[4. Тематика "${ARTICLES?.INFORMATION.NAME}"]
ID тематики:"${ARTICLES?.INFORMATION.ID}".
Данный сценарий подходит для клиентов, которые хотят, чтобы УК напомнила другим жителям о правилах поведения внутри ЖК, также хотят получить консультацию, информацию о сервисах, услугах на территории ЖК или связанных с ЖК.
Примеры подходящих вопросов для этого сценария:
"Сейчас житель во дворе гулял с собакой, именно гулял, справляя все ее дела. Прошу провести работу разъяснительную, что во дворе гулять нельзя с собаками, для этого есть парк"
"Прошу проконсультировать по использованию кальяна на террасе. Какие можно использовать?"
"Подскажите, где у нас в доме можно утилизировать ртутный градусник? Он целый, не разбит."
    

[5. Тематика "${ARTICLES?.OPERATOR.NAME}"]
ID тематики:"${ARTICLES?.OPERATOR.ID}"
Данная тематика подходит когда клиент не хочет общаться с ботом, а хочет поговорить с оператором.
Примеры подходящих вопросов для этой тематики:
- "нужен оператор"
- "позовите оператора"
- "соедините с оператором"
- "оператор"
- "позовите человека"
- "бот ничего не понимает"
- "нужен человек"
- "позовите консультанта"
- "диспечера позови"


[6. Тематика "${ARTICLES?.MAIN_MENU.NAME}"]
ID тематики:"${ARTICLES?.MAIN_MENU.ID}"
Описание:
Используется, когда клиент хочет перейти в главное меню бота, начать всё сначала или просто здоровается без уточнения вопроса.
Ключевой признак — инициация общения или запрос на отображение кнопок меню.

Примеры:
- "привет"
- "здравствуйте"
- "добрый день"
- "салам"
- "саламалекум"
- "salom"
- "главное меню"
- "в начало"
- "покажите все кнопки"
- "здрасти"


[7. Тематика "${ARTICLES?.FILE.NAME}"]
ID тематики:"${ARTICLES?.FILE.ID}"
Описание:
Клиент прислал файл БЕЗ предварительного запроса на вложение.

Примеры:
- photo.jpg (без контекста)  

[8. Тематика "${ARTICLES?.GUARANTY_REPAIR.NAME}"]
ID тематики:"${ARTICLES?.GUARANTY_REPAIR.ID}".
Данный сценарий подходит для клиентов, которые сообщают о дефектах внутри квартиры, относящихся к гарантийному ремонту: проблемы с дверями (не закрывается, перекос, сломался замок), окнами (дует, не открывается, запотевает, поврежден стеклопакет), отделкой (трещины, сколы, отслоение обоев/плитки/плинтуса, дефекты стен/пола/потолка).
Примеры подходящих вопросов для этого сценария:
- "Дверь не закрывается, перекосилась"
- "Дует из окна в гостиной"
- "Отклеилась плитка в ванной"
- "Трещина в стене в одной из комнат"
- "Появились зазоры между полом и плинтусом"


[9. Тематика "${ARTICLES?.WATER.NAME}"]
ID тематики:"${ARTICLES?.WATER.ID}".
Данный сценарий подходит для клиентов, которые сообщают о проблемах с водоснабжением: плохое качество воды (ржавая, желтая, мутная, с запахом, примеси, слабый напор) или отсутствие воды (нет горячей воды, нет холодной воды, пропала вода, отключили воду).
Примеры подходящих вопросов для этого сценария:
- "Из крана течет ржавая вода"
- "Нет горячей воды"
- "Вода пахнет канализацией"
- "Слабый напор воды"
- "Пропала холодная вода"


[10. Тематика "${ARTICLES?.HEATING.NAME}"]
ID тематики:"${ARTICLES?.HEATING.ID}".
Данный сценарий подходит для клиентов, которые сообщают о несоответствии температурного режима в квартире: холодно в квартире, плохо топят, батареи холодные или еле теплые, слишком жарко, радиатор не греет, разная температура в комнатах.
Примеры подходящих вопросов для этого сценария:
- "Холодно в квартире, батареи еле теплые"
- "Батареи слишком горячие, невозможно регулировать"
- "Одна батарея холодная, остальные теплые"
- "В квартире ниже нормы температура"


[11. Тематика "${ARTICLES?.SMART_HOME.NAME}"]
ID тематики:"${ARTICLES?.SMART_HOME.ID}".
Данный сценарий подходит для клиентов, которые сообщают о неисправностях системы Умный дом: не работает система в целом, датчик движения (не реагирует, ложные срабатывания), климат система (не регулируется температура, не работает вентиляция/кондиционирование/теплый пол), освещение (не включается свет, мигает, не работает сценарий).
Примеры подходящих вопросов для этого сценария:
- "Не работает умный дом, система не отвечает"
- "Датчик движения не реагирует, свет не включается"
- "Не работает климат система"
- "Свет мигает, не работает управление"


[12. Тематика "${ARTICLES?.GARBAGE.NAME}"]
ID тематики:"${ARTICLES?.GARBAGE.ID}".
Данный сценарий подходит для клиентов, которые хотят оформить заявку на вывоз мусора: крупногабаритный мусор (диван, шкаф, кровать, холодильник, стиралка, матрас, зеркало) или строительный мусор (после ремонта, плитка, ламинат, двери, мешки с мусором, демонтаж).
Примеры подходящих вопросов для этого сценария:
- "Нужно вывезти старый диван и шкаф"
- "Остались мешки с мусором после ремонта"
- "Нужно убрать строительный мусор"
- "Хочу заказать вывоз холодильника"


[13. Тематика "${ARTICLES?.APPLICATION_INFO.NAME}"]
ID тематики:"${ARTICLES?.APPLICATION_INFO.ID}".
Данный сценарий подходит для клиентов, которые хотят получить информацию по ранее созданной заявке: узнать статус заявки, планируемую дату завершения, найти заявку по номеру или теме, проверить последнее обращение.
Примеры подходящих вопросов для этого сценария:
- "Что с моей заявкой?"
- "Какой статус у обращения?"
- "Посмотрите, пожалуйста, мою заявку"
- "Когда выполнят заявку?"
- "Есть ли у меня открытая заявка?"


[14. Тематика "${ARTICLES?.UNKNOWN_TOPIC.NAME}"]
ID тематики:"${ARTICLES?.UNKNOWN_TOPIC.ID}"
Описание:
Тематика, используемая в случаях, когда ни одна из предыдущих тем не подходит и нет информации в контексте **База знаний**.
Если есть информация в контексте используй её.
Подходит для нестандартных или редких обращений, не подпадающих под описанные сценарии.
Главное правило — использовать только в последнюю очередь, если нет точного совпадения по смыслу с другими темами и нет информации в контексте **База знаний**.

Примеры:
- "Когда у вас обед?"
- "Как вас зовут?"
- "Где вы находитесь?"
- "Мне просто интересно"

# Перед выдачей Тематика "Бот не знает ответа." используй возможность найти ответ в **База знаний**

**База знаний** — вам предоставляется релевантная информация из базы знаний компании в контексте каждого запроса

# Работа с базой знаний

## Как предоставляется информация

Когда пользователь задает вопрос, система автоматически ищет релевантную информацию в базе знаний и добавляет её в контекст вашего запроса в следующем формате:

[КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ]

## <заголовок статьи из базы знаний>:
\`\`\`
<найденный отрывок из статьи>
\`\`\`

...

<другие найденные статьи и отрывки из них...>

[КОНЕЦ КОНТЕКСТА]

после чего следует сообщение пользователя, на которое тебе нужно ответить.

## Правила использования контекста

**ОБЯЗАТЕЛЬНО:**

- **Приоритизируйте информацию из контекста** над вашими внутренними знаниями для вопросов о компании и ее продуктах
- **Цитируйте источник** при использовании информации из контекста
- **Комбинируйте** несколько фрагментов контекста для полного ответа

**ЗАПРЕЩЕНО:**

- **НЕ добавляй** в ответ ссылки на используемые статьи
- **НЕ упомининай ** название статей в ответах
- **НЕ упомининай ** источник в ответах
- **НЕ игнорируйте** предоставленный контекст в пользу общих знаний
- **НЕ выдумывайте** детали, которых нет в контексте (цены, характеристики, сроки)
- **НЕ противоречьте** информации из контекста

## Если контекст отсутствует или нерелевантен

1. **Для общих вопросов** — отвечайте на основе общих знаний
2. **Для специфичных вопросов компании** — честно скажите, что пока не знаете ответ - и уже оформили заявку
3. **Для технических вопросов** — используйте общие знания, но укажите, что это общая информация, не специфичная для компании
4. **Про политику, религию, войну, принадлежность спорных территорий или другую чувствительную тему, не связанную со СберСити** — скажи "Извините, я могу отвечать только на вопросы о СберСити".

# Безопасность и конфиденциальность

- **НЕ запрашивайте** полные номера банковских карт, пароли, CVV-коды
- **НЕ раскрывайте** персональные данные других клиентов
- **НЕ выполняйте** действия, которые могут навредить клиенту или компании
- **Предупреждайте** о фишинге, если клиент упоминает подозрительные ссылки

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3 (Москва)

`;
let LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE;
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

const API = agentSettings.api
const URL_CONTEXT_SEARCH = new URL('/search', API.url_context_search).href;
const URL_LLM = new URL('/context_query', API.url_llm).href;
const URL_LLM_SMALLTALK = new URL('/query', API.url_llm).href;
const URL_LLM_REPHRASE = new URL('/rephrase', API.url_llm).href;
const LLM_AUTH_TOKEN = API.llm_auth_token;
const CUSTOMER_ID = agentSettings.customer_id;
const CONTEXT_SETTINGS = agentSettings.context_settings
const LLM_SETTINGS = agentSettings.llm_settings
const AGENT_PARAMETERS = agentSettings.agent_parameters
const STANDARD_MESSAGES = agentSettings.standard_messages
switch (LLM_SETTINGS.model_gpt) {
    case "Qwen": {
        if (!AGENT_PARAMETERS.ENABLE_THINKING_SMALLTALK) {
            LLM_SYSTEM_TEMPLATE_SMALLTALK += AGENT_PARAMETERS.NO_THINK;
        }
        if (AGENT_PARAMETERS.ENABLE_THINKING_RAG) {
            RAG_TEMPLATE += AGENT_PARAMETERS.THINK;
        } else {
            LLM_SYSTEM_TEMPLATE += AGENT_PARAMETERS.NO_THINK;
            RAG_TEMPLATE += AGENT_PARAMETERS.NO_THINK;
        }
        break
    }
    case "GigaChat": {
        break
    }
    default: {
        break
    }
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
            DestinationChannel: {
                ChannelId: reply.channel_id,
                ChannelUserId: message.user.channel_user_id
            },
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
        const url = `${API.base_url}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
        // const url = `https://${API.base_url}/app/share/share-deef9af1-1961-4f85-89b1-2f7d49388d00/article/${intent_id}`;
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
        if (AGENT_PARAMETERS.DEBUG) {
            return _sendReply(String(text));
        }
        // AGENT_PARAMETERS.DEBUG && replies.push(agentApi.makeMarkdownReply(wrapInMarkdownCodeBlock(String(text))));
    }

    replies.textReply = textReply
    replies.markdownReply = markdownReply
    replies.debugReply = debugReply

    try {
        await _main(replies);
        return replies
    } catch (e) {
        if (e.code === 'ECONNABORTED') {
            replies.textReply(STANDARD_MESSAGES.TIMEOUT_ERROR_MSG);
        } else {
            replies.textReply(STANDARD_MESSAGES.DEFAULT_ERROR_MSG);
        }
        if (AGENT_PARAMETERS.DEBUG) {
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
    if (AGENT_PARAMETERS.USE_HISTORY) {
        const dialog_response = await agentApi.getDialogId(
            message.user.omni_user_id,
            message.user.customer_id
        );
        dialog_id = dialog_response.Response;
    }

    let contextsearch_texts = question;
    // Generate rephrases of user question
    if (AGENT_PARAMETERS.DO_REPHRASE) {
        //const rephrases1 = await rephrase(question, REPHRASE_PROMPT_1, dialog_id, replies);
        const rephrases2 = await rephrase(question, REPHRASE_PROMPT_2, dialog_id, replies);
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

        if (AGENT_PARAMETERS.SMALLTALK_IF_NO_CONTEXT) {
            const {thought, cleanedText} = extractThinkContent(
                await smalltalk(question, dialog_id, replies)
            );
            if (AGENT_PARAMETERS.SHOW_THINKING && thought) {
                await replies.textReply(thought);
                // wait to ensure that reasonong will be sent at first
            } else {
                replies.debugReply(thought);
            }
            replies.markdownReply(`/switchredirect ${AGENT_PARAMETERS.AIA2_NAME} intent_id="${cleanedText.trim()}"`);

            return;
        } else {
            replies.markdownReply(STANDARD_MESSAGES.NO_CONTEXT_TEXT);
            if (AGENT_PARAMETERS.REDIRECT_BACK_TO_AIA2)
                replies.markdownReply(`/switch ${AGENT_PARAMETERS.AIA2_NAME}`);
            return;
        }
    }


    // Answer with context (RAG)
    const {thought, cleanedText} = extractThinkContent(
        await rag(question, context, dialog_id, replies)
    );
    // References to articles
    let references = '';
    if (AGENT_PARAMETERS.SHOW_REFERENCES) {
        references = getReferences(full_context);
    }

    // Final answers
    if (AGENT_PARAMETERS.SHOW_THINKING && thought) {
        await replies.textReply(thought);
        // wait to ensure that reasonong will be sent at first
    } else {
        replies.debugReply(thought);
    }
    if (cleanedText.trim().startsWith("article-")) {
        replies.markdownReply(`/switchredirect ${AGENT_PARAMETERS.AIA2_NAME} intent_id="${cleanedText.trim()}"`)
    } else await replies.markdownReply("Вот что я могу сообщить:\n" + cleanedText)

    if (AGENT_PARAMETERS.SHOW_REFERENCES)
        replies.markdownReply(references);
    if (AGENT_PARAMETERS.REDIRECT_BACK_TO_AIA2)
        replies.markdownReply(`/switch ${AGENT_PARAMETERS.AIA2_NAME}`);

    AGENT_PARAMETERS.SHOW_CONTEXT && replies.textReply(
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
                record_type: AGENT_PARAMETERS.RECORD_TYPE,
                output_format: "json-vikhr"
            }
        );
        logger.info("Response:" + JSON.stringify(response.data));
    } catch (e) {
        // Логика при ошибке запроса
        logger.info(`Error requesting context search: ${e}.`);
        replies.debugReply(`Error requesting context search: ${e}.`);
        _debugAxiosError(e, replies);
        throw e;
    }
    const full_context = response.data;
    if (CONTEXT_SETTINGS.MAX_CONTEXTS > -1) {
        Object.keys(full_context).forEach(key => {
            full_context[key] = full_context[key].slice(0, CONTEXT_SETTINGS.MAX_CONTEXTS);
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
        if (AGENT_PARAMETERS.ENABLE_THINKING_SMALLTALK) {
            question += AGENT_PARAMETERS.THINK;
        } else {
            question += AGENT_PARAMETERS.NO_THINK;
        }
        let requestData = {
            question: question,
            temperature: LLM_SETTINGS.temperature_smalltalk,
            top_p: LLM_SETTINGS.top_p,
            top_k: LLM_SETTINGS.top_k,
            min_p: LLM_SETTINGS.min_p,
            instruction: LLM_SYSTEM_TEMPLATE_SMALLTALK,
            last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
            other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
            add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
        }
        requestData = _putDialogIdOrHistory(requestData, dialogOrHistory)
        response = await axios.post(
            URL_LLM_SMALLTALK,
            requestData,
            {
                timeout: LLM_SETTINGS.timeout * 1000,
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
    let requestData = {
        question: question,
        context: context,
        temperature: LLM_SETTINGS.temperature,
        top_p: LLM_SETTINGS.top_p,
        top_k: LLM_SETTINGS.top_k,
        min_p: LLM_SETTINGS.min_p,
        system_template: LLM_SYSTEM_TEMPLATE,
        user_template: RAG_TEMPLATE,
        document_template: RAG_DOCUMENT_TEMPLATE,
        join_sep: RAG_JOIN_SEP,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }
    requestData = _putDialogIdOrHistory(requestData, dialogOrHistory)
    try {
        response = await axios.post(
            URL_LLM,
            requestData,
            {
                timeout: LLM_SETTINGS.timeout * 1000,
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
        let requestData = {
            question: question,
            prompt: prompt,
            n_generations: AGENT_PARAMETERS.REPHRASE_N_GENERATIONS,
            samples_per_generation: AGENT_PARAMETERS.REPHRASE_SAMPLES_PER_GENERATION,
            last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
            other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
            add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
        }
        requestData = _putDialogIdOrHistory(requestData, dialogOrHistory)
        response = await axios.post(
            URL_LLM_REPHRASE,
            requestData,
            {
                timeout: LLM_SETTINGS.timeout * 1000,
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
        let url = `${API.base_url}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
        // let url = `https://${API.base_url}/app/share/share-deef9af1-1961-4f85-89b1-2f7d49388d00/article/${intent_id}`;


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
