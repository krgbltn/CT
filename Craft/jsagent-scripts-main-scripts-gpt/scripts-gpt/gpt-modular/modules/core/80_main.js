// @module core/main
// @requires modules/core/globals.js
// @requires modules/core/http.js
// @requires modules/core/dialog.js
// @requires modules/core/references.js
// @requires modules/core/context.js
// @requires modules/core/slots.js
// @requires modules/core/rag.js
// @requires modules/core/tools_loop.js
// _sendReply, _printResponse, sendMessageToLLM, main, _mainBody, setScenariosForTransfer, runEntrypoint

let IS_QUERY_REPORT = message?.meta?.isQueryReport

const _AP_MAIN = agentSettings.agent_parameters ?? {}
let {
    SHOW_REFERENCES = false,
    SHOW_CONTEXT = false,
    USE_HISTORY = true,
    HISTORY_FROM_BOT_MEDIATOR = false,
    ENABLE_SOURCE_HIGHLIGHTS = false,
} = _AP_MAIN

function _sendReply(text, slots, meta = {}) {
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
                            Sender: {},
                            FilledSlots: slotManager.replySlots
                        }
                    }, logger)
                }
            }
        })
        .catch(e => logger.error(`Error sending reply: ${e}.`))
    // don't block, return Promise
}


async function _printResponse(response, replies, commitId) {
    if (IS_QUERY_REPORT) {
        return null
    }

    const normalized = messageProcessor.fromModelFormat(response)
    const messages = responseFormatter.formatResponse(normalized)
    let pendingReasoning = null

    for (const msg of messages) {
        const meta = { ...msg.meta }
        if (commitId) {
            meta.commitId = commitId
        }

        if (msg.meta.isThinking) {
            if (SHOW_THINKING) {
                await replies.textReply(msg.text, meta)
            } else {
                pendingReasoning = msg.text
                replies.debugReply(msg.text)
            }
        } else {
            if (pendingReasoning) {
                meta.reasoning = pendingReasoning
                pendingReasoning = null
            }
            if (msg.isMarkdown) {
                await replies.markdownReply(msg.text, meta)
            } else {
                await replies.textReply(msg.text, meta)
            }
        }
    }

    // Если reasoning остался без основного сообщения (tool_calls кейс) —
    // возвращаем для записи в RedisQueue при enqueue тулзов
    return pendingReasoning
}


async function sendMessageToLLM(question, dialog_id, history, replies, opts = {}) {
    const {
        use_rag = true,
        use_think = ENABLE_THINKING_SMALLTALK,
        use_rephrase = DO_REPHRASE,
        use_smalltalk = SMALLTALK_IF_NO_CONTEXT,
        topicSlots = {}
    } = opts

    history = buildLLMHistory(history, [])

    let contextsearch_texts = question
    // Generate rephrases of user question
    if (use_rephrase) {
        // rephrases1 = await rephrase(question, REPHRASE_PROMPT_1, dialog_id, replies)
        let rephrases2 = await rephrase(question, REPHRASE_PROMPT_2, dialog_id, history, replies)
        logger.info(`rephrases2 значение: ${rephrases2}`)
        contextsearch_texts = [question]
        // contextsearch_texts = contextsearch_texts.concat(rephrases1)
        contextsearch_texts = contextsearch_texts.concat(rephrases2)
        logger.info(`contextsearch_texts значение: ${contextsearch_texts}`)
    }

    // Search for relevant context
    let context // [{doc_id: str, title: str, content: str, symbol_code?: str},...]
    let fullContext  // response from classical intent search
    let scenariosContext // response from scenario intent search
    let sourceHighlightValidationRangesByArticle = new Map()
    let sourceHighlightFallbackRangesByArticle = new Map()

    // Skip RAG if use_rag is disabled
    if (!use_rag) {
        context = []
    } else if (CONTEXT_FROM_SCENARIOS) {
        scenariosContext = await getContextFromScenarios(contextsearch_texts, replies)
        context = convertScenariosToContext(scenariosContext.simple)
        // Если нашелся сложный сценарий
        if (ADD_COMPLEX_SCENARIOS_TO_TOOLS && scenariosContext.complex) {
            addCustomScenariosToTools(convertScenariosToTools(scenariosContext.complex))
        }
    } else {
        fullContext = await getContext(contextsearch_texts, replies)

        if (ENABLE_SOURCE_HIGHLIGHTS) {
            const sourceHighlightRangeMaps = getSourceHighlightRangeMaps(fullContext)
            sourceHighlightValidationRangesByArticle =
                sourceHighlightRangeMaps.validationRangesByArticle
            sourceHighlightFallbackRangesByArticle =
                sourceHighlightRangeMaps.fallbackRangesByArticle
        }

        addUrlToContextTitle(fullContext, ENABLE_SOURCE_HIGHLIGHTS)
        context = fullContext.context
    }

    let response
    // Context not found
    if (context?.length === 0) {
        logger.info(`Context not found for question "${question}"`)
        replies.debugReply(`Context not found for question "${question}"`)

        if (use_smalltalk) {
            response = await smalltalk(question, dialog_id, history, replies)
            await _printResponse(response, replies)
            if (!use_rag) {
                replies.markdownReply(`_Внимание! При ответе не использовалась база знаний_`)
            }
            return response
        } else {
            replies.markdownReply(NO_CONTEXT_TEXT)
            return {answer: NO_CONTEXT_TEXT, tool_calls: [], log_id: null}
        }
    }

    // Answer with context (RAG)
    response = await rag(question, context, dialog_id, history, replies)
    response = enrichResponseArticleLinks(
        response,
        sourceHighlightValidationRangesByArticle,
        sourceHighlightFallbackRangesByArticle,
    )

    // References to articles
    let references = ''
    if (SHOW_REFERENCES) {
        references = CONTEXT_FROM_SCENARIOS
            ? getReferencesFromScenarios(context)
            : getReferences(fullContext, sourceHighlightFallbackRangesByArticle)
    }

    // Final answers
    await _printResponse(response, replies)

    if (SHOW_REFERENCES && references) {
        replies.markdownReply(references, { references: "true" })
    }

    if (SHOW_CONTEXT) {
        const contextToShow = CONTEXT_FROM_SCENARIOS ? scenariosContext : fullContext
        replies.textReply(
            "<h3>Контекст</h3>" + JSON.stringify(contextToShow, null, 2),
            {},
            true
        )
    }
    return response
}


async function main() {
    let replies = {}
    let response
    // Helpers to add reply
    function textReply(text, meta={},  wrapCodeBlock=false) {
        if (IS_QUERY_REPORT) {
            return
        }
        let reply
        if (wrapCodeBlock) {
            reply = wrapInMarkdownCodeBlock(String(text))
        } else {
            reply = String(text)
        }
        return _sendReply(reply, undefined, meta)
    }
    function markdownReply(text, meta={}) {
        logger.debug(`Message for user: ${text}`)
        if (!IS_QUERY_REPORT) {
            return _sendReply(String(text), undefined, meta)
        }
    }
    function debugReply(text) {
        // never await debugReply
        if (DEBUG && !IS_QUERY_REPORT) {
            return _sendReply(wrapInMarkdownCodeBlock(String(text)), undefined, { debug: "true" })
        }
    }
    function deleteSlot(slot) {
        slotManager.replySlots[slot] = null
    }
    replies.textReply = textReply
    replies.markdownReply = markdownReply
    replies.debugReply = debugReply
    replies.deleteSlot = deleteSlot

    try {
        response = await _main(replies)
    } catch (e) {
        if (e instanceof SwitchRedirectPropagate) {
            if (IS_QUERY_REPORT) {
                return e.switchredirect
            }
            await replies.markdownReply(e.switchredirect)
            return response
        }
        logger.error(`main error ${e}`)
        logger.error(JSON.stringify(e.stack))
        logger.error(JSON.stringify(e.cause))
        if (e.code === 'ECONNABORTED') {
            if (IS_QUERY_REPORT) {
                return TIMEOUT_ERROR_MSG
            }
            await replies.textReply(TIMEOUT_ERROR_MSG)
        } else {
            if (IS_QUERY_REPORT) {
                return DEFAULT_ERROR_MSG
            }
            await replies.textReply(DEFAULT_ERROR_MSG)
        }
        if (DEBUG) {
            replies.debugReply(`ERROR: ${e}`)
            replies.debugReply(e.stack)
        }
    }
    return response
}


async function _mainBody(replies, sendMessageToLLMOpts = {}) {
    // Main code
    let question = message.message.text
    logger.info(`question ${question}`)
    replies.debugReply(JSON.stringify(message.slot_context, null, 2))
    replies.debugReply(JSON.stringify(message.message, null, 2))

    // Get dialog_id
    let dialog_id = null
    let history = null
    if (USE_HISTORY) {
        if (IS_QUERY_REPORT) {
            dialog_id = message.meta?.dialog_id
            history = message.meta?.history
        } else {
            const dialog_response = await agentApi.getDialogId(
                message.user.omni_user_id,
                message.user.customer_id
            )

            dialog_id = dialog_response.Response
            history = HISTORY_FROM_BOT_MEDIATOR
                ? await getMediatorHistoryForQuery(dialog_id, question, message.user.customer_id, message.user.omni_user_id)
                : null
        }
    }

    logger.info(`ID диалога клиента: ${JSON.stringify(dialog_id)}`)
    logger.info(`История диалога клиента: ${JSON.stringify(history)}`)

    let finalAnswer

    // Регистрируем тулзы с MCP-серверов до первого обращения к LLM (TOOLS уходит
    // в LLM внутри runToolsLoop/sendMessageToLLM).
    if (typeof registerMcpTools === 'function' && MCP_SERVERS.length) {
        await registerMcpTools()
    }

    if (typeof runToolsLoop === 'function') {
        const result = await runToolsLoop(
            question,
            dialog_id,
            history,
            replies,
            sendMessageToLLMOpts,
            sendMessageToLLM,
            _printResponse
        )
        if (result.cancelled) return
        finalAnswer = result.finalAnswer
    } else {
        // Простой путь без тулзов
        const response = await sendMessageToLLM(question, dialog_id, history, replies, sendMessageToLLMOpts)
        finalAnswer = response.answer
    }

    if (IS_QUERY_REPORT) {
        const normalized = messageProcessor.fromModelFormat({ answer: finalAnswer })
        return normalized.answer
    }
}


function runEntrypoint() {
    if (message.message_type === 1 && !IS_QUERY_REPORT) {
        main()
            .then(_ => {
                resolve([])
            })
            .catch(error => {
                logger.error(`Error: ${error}`)
                resolve([agentApi.makeMarkdownReply(error)])
            })
    } else if (IS_QUERY_REPORT) {
        main()
            .then(res => {
                resolve({ answer: res })
            })
            .catch(error => {
                logger.error(`Error: ${error}`)
                resolve(error)
            })
    } else {
        logger.info(`Message type: ${message.message_type}. Skip.`)
        resolve([]) // SKIP
    }
}
