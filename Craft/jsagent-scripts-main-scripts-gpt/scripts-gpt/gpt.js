const BASE_URL = 'cloud.craft-talk.ru';
const CUSTOMER_ID = 'ml-1';
const RECORD_TYPE = null;

const SHOW_CONTEXT = true;
const SMALLTALK_IF_NO_CONTEXT = true;
const SHOW_REFERENCES = false;

const USE_HISTORY = true;
const LAST_CONTEXT_PRICE = 0.19;
const OTHER_CONTEXT_PRICE = 3.1;
const ADD_OTHER_CONTEXT = true;
const MAX_CONTEXTS = -1 // -1 for all

const DEBUG = true;  // print logs, errors to the chat

const NOTFOUND = "notfound"; // intent, that will be returned if context was not found
const LLM_SYSTEM_TEMPLATE = null; /*`
You are an FAQ bot designed to help users find answers to their questions using the documentation loaded into the knowledge base. Please adhere to the following guidelines:
1) Provide answers strictly based on the information available in the knowledge base. Do not make up any information or provide answers based on assumptions.
2) If the answer to a question is not available in the knowledge base, ask the user to clarify their question or inform them that the information is not available.
3) When providing instructions or steps, present them clearly and sequentially, following the order outlined in the knowledge base.
4) if there is an answer to a question, answer strictly in context
5) if there is no answer in context, always say that you don't know the answer and never under any circumstances give advice if you haven't found the answer.
`;*/
const LLM_SYSTEM_TEMPLATE_SMALLTALK = null;
const LLM_PSEUDO_SYSTEM_PROMPT = "Answer briefly, use only the data that is in the context. Don't add anything extra. Compose an answer of up to 300 characters."
const DB_LANGUAGE = "на английском";
const REPHRASE_PROMPT_1 = `Сгенерируй {samples_per_generation} поисковых запросов ${DB_LANGUAGE} языке к фразе '{question}' с деталями из предыдущего диалога.
Не придумывай детали - бери только то, что было в диалоге.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример поискового запроса.`
const REPHRASE_PROMPT_2 = `Ты - поисковая система. К тебе пришел запрос '{question}' с деталями из предыдущего диалога.
Сгенерируй {samples_per_generation} кратких вариантов сниппетов на ${DB_LANGUAGE} языке.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример сниппета.
Генерируй максимально отличающиеся друг от друга сниппеты`


const DEFAULT_ERROR_MSG = "Что-то пошло не так, попробуйте еще раз."
const TIMEOUT_ERROR_MSG = "Извините за задержку! Похоже, запрос занял больше времени, чем ожидалось. Пожалуйста, попробуйте снова позже."

let URL_CONTEXT_SEARCH;
let URL_LLM;
let URL_LLM_SMALLTALK;
let LLM_TIMEOUT;
let LLM_TEMPERATURE;
let LLM_TEMPERATURE_SMALLTALK;
let LLM_AUTH_TOKEN;
let DO_REPHRASE;
let REPHRASE_N_GENERATIONS;
let REPHRASE_SAMPLES_PER_GENERATION;

try {
    URL_CONTEXT_SEARCH = new URL('/search', agentSettings.url_context_search).href;
    URL_LLM = new URL('/context_query', agentSettings.url_llm).href;
    URL_LLM_SMALLTALK = new URL('/query', agentSettings.url_llm).href;
    URL_LLM_REPHRASE = new URL('/rephrase', agentSettings.url_llm).href;
    LLM_TIMEOUT = agentSettings.llm_timeout ?? 60;
    LLM_TEMPERATURE = agentSettings.llm_temperature ?? 0.0;
    LLM_TEMPERATURE_SMALLTALK = agentSettings.llm_temperature_smalltalk ?? 0.5;
    LLM_AUTH_TOKEN = agentSettings.llm_auth_token;
    DO_REPHRASE = agentSettings.do_rephrase ?? false;
    REPHRASE_N_GENERATIONS = agentSettings.rephrase_n_generations ?? 4;
    REPHRASE_SAMPLES_PER_GENERATION = agentSettings.rephrase_samples_per_generation ?? 8;
} catch (e) {
    logger.info(`Error during constants initialization: ${e}.`);
    DEBUG && resolve([agentApi.makeTextReply(`Error during constants initialization: ${e}.`)]);
}


async function sendReplies(replies) {
    for (const reply of replies) {
        await agentApi.sendMessage({
            MessageMarkdown: reply.message.text,
            SendMessageParams: {
                ProjectId: reply.customer_id,
                OmniUserId: reply.omni_user_id,
                Sender: {}
            }
        }, logger)
    }
}


function wrapInMarkdownCodeBlock(str) {
  // Экранируем только неэкранированные тройные кавычки
  const escapedStr = str.replace(/(?<!\\)```/g, '\\```');
  // Оборачиваем в markdown code block
  return `\`\`\`
${escapedStr}
\`\`\``;
}


async function main() {
    let replies = [];
    // Helpers to add reply
    function text_reply(text, wrap_code_block=false) {
        let reply;
        if (wrap_code_block) {
            reply = wrapInMarkdownCodeBlock(String(text));
        } else {
            reply = String(text);
        }
        replies.push(agentApi.makeMarkdownReply(reply));
    }
    function markdown_reply(text) {
        replies.push(agentApi.makeMarkdownReply(String(text)));
    }
    function debug_reply(text) {
        DEBUG && replies.push(agentApi.makeMarkdownReply(wrapInMarkdownCodeBlock(String(text))));
    }
    replies.text_reply = text_reply
    replies.markdown_reply = markdown_reply
    replies.debug_reply = debug_reply

    try {
        await _main(replies);
        return replies
    } catch (e) {
        if (e.code === 'ECONNABORTED') {
            replies.text_reply(TIMEOUT_ERROR_MSG);
        } else {
            replies.text_reply(DEFAULT_ERROR_MSG);
        }
        if (DEBUG) {
            replies.debug_reply(`ERROR: ${e}`);
            replies.debug_reply(e.stack);
        }
        return replies;
    }
}


async function _main(replies) {
    // Main code
    let question = message.message.text;
    // replies.debug_reply(JSON.stringify(message.slot_context, null, 2));
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
        rephrases1 = await rephrase(question, REPHRASE_PROMPT_1, dialog_id, replies);
        rephrases2 = await rephrase(question, REPHRASE_PROMPT_2, dialog_id, replies);
        contextsearch_texts = [question]
        contextsearch_texts = contextsearch_texts.concat(rephrases1);
        contextsearch_texts = contextsearch_texts.concat(rephrases2);
    }

    // Search for relevant context
    let full_context = await get_context(contextsearch_texts, replies);
    let context = full_context.context;

    // Context not found
    if (context?.length === 0) {
        logger.info(`Context not found for question "${question}"`);
        replies.debug_reply(`Context not found for question "${question}"`);

        if (SMALLTALK_IF_NO_CONTEXT) {
            answer = await smalltalk(question, dialog_id, replies);
            replies.markdown_reply(
                answer.replace("Выход:", "")
            );
            return;
        } else {
            replies.text_reply("Я не знаю ответ на ваш вопрос");
            return;
        }
    }
    
    // Answer with context (RAG)
    answer = await rag(question, context, dialog_id, replies);

    // References to articles
    let references = '';
    if (SHOW_REFERENCES) {
        references = get_references(full_context);
    }

    // Final answers
    replies.markdown_reply(answer.replace("Выход:", ""));
    if (SHOW_REFERENCES)
        replies.markdown_reply(references);

    SHOW_CONTEXT && replies.text_reply("<h3>Контекст</h3>" + JSON.stringify(full_context, null, 2), true);
}

async function get_context(question, replies) {
    replies.debug_reply(JSON.stringify(question));
    let response;
    try {
        response = await axios.post(
            URL_CONTEXT_SEARCH,
            {
                text: question,
                customer_id: CUSTOMER_ID,
                record_type: RECORD_TYPE,
                output_format: "json-vikhr"
            }
        );
        logger.info("Response:" + response.data);
    } catch(e) {
        // Логика при ошибке запроса
        logger.info(`Error requesting context search: ${e}.`);
        replies.debug_reply(`Error requesting context search: ${e}.`);
        _debug_axios_error(e, replies);
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


async function smalltalk(question, dialog_id, replies) {
    let response;
    try {
        response = await axios.post(
            URL_LLM_SMALLTALK,
            {
                question: question,
                temperature: LLM_TEMPERATURE_SMALLTALK,
                instruction: LLM_SYSTEM_TEMPLATE_SMALLTALK,
                dialog_id: dialog_id,
                last_context_price: LAST_CONTEXT_PRICE,
                other_context_price: OTHER_CONTEXT_PRICE,
                add_other_context: ADD_OTHER_CONTEXT
            }, {
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
        replies.debug_reply(`Error requesting LLM: ${e}.`);
        _debug_axios_error(e, replies);
        throw e;
    }
    return response.data.answer;
}


async function rag(question, context, dialog_id, replies) {
    let response;
    if (LLM_PSEUDO_SYSTEM_PROMPT) {
        question = `${LLM_PSEUDO_SYSTEM_PROMPT}\n${question}`;
    }
    try {
        response = await axios.post(
            URL_LLM,
            {
                question: question,
                context: context,
                temperature: LLM_TEMPERATURE,
                system_template: LLM_SYSTEM_TEMPLATE,
                dialog_id: dialog_id,
                last_context_price: LAST_CONTEXT_PRICE,
                other_context_price: OTHER_CONTEXT_PRICE,
                add_other_context: ADD_OTHER_CONTEXT
            }, {
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
        replies.debug_reply(`Error requesting LLM: ${e}.`);
        _debug_axios_error(e, replies);
        replies.debug_reply("<h3>Контекст</h3>" + JSON.stringify(context, null, 2));
        throw e;
    }
}


async function rephrase(question, prompt, dialog_id, replies) {
    let response;
    try {
        response = await axios.post(
            URL_LLM_REPHRASE,
            {
                question: question,
                prompt: prompt,
                dialog_id: dialog_id,
                n_generations: REPHRASE_N_GENERATIONS,
                samples_per_generation: REPHRASE_SAMPLES_PER_GENERATION,
                last_context_price: LAST_CONTEXT_PRICE,
                other_context_price: OTHER_CONTEXT_PRICE,
                add_other_context: ADD_OTHER_CONTEXT
            }, {
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
        replies.debug_reply(`Error requesting LLM: ${e}.`);
        _debug_axios_error(e, replies);
        throw e;
    }
    return response.data.texts;
}


function _debug_axios_error(error, replies) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      replies.debug_reply(JSON.stringify(error.response.data, null, 2));
      replies.debug_reply(error.response.status);
      replies.debug_reply(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser 
      // and an instance of http.ClientRequest in node.js
      replies.debug_reply(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      replies.debug_reply('Error', error.message);
    }
}


function get_references(full_context) {
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
        references += `\n\n[${cnt}. ${articles_titles.get(intent_id)}](${url})`;
    });
    
    if (references != '')
        references = '### Ссылки для информации:' + references;
    return references
}


// Entrypoint
if (message.message_type === 1) {
    main()
        .then(res => {
            // resolve(res)
            sendReplies(res)
                .then(res2 => {
                    // ok
                    resolve([]);
                })
                .catch (error2 => {
                    resolve([agentApi.makeTextReply(String(error2))]);
                });
        })
        .catch(error => {
            logger.info(`Error: ${error}`);
            resolve([agentApi.makeTextReply(error)]);
        })
} else {
    logger.info(`Message type: ${message.message_type}. Skip.`)
    resolve([]) // SKIP
}
