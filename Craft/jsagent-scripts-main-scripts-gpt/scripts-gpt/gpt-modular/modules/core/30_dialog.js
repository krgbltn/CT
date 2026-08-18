// @module core/dialog
// @requires modules/core/globals.js
// @requires modules/core/http.js
// Парсинг истории диалога и получение истории из bot mediator

let URL_MEDIATOR_SERVICE = agentSettings.api?.url_mediator_service ?? 'http://localhost:8080'


function escapeHTML(text) {
    return text.replace(/[<>&"']/g, (match) => `&#${match.charCodeAt(0)};`)
}

function unescapeHTML(text) {
    return text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
}


/**
 * Форматирование и деформатирование ответов для mediator.
 * formatResponse: ответ craftgpt → сообщения для пользователя (с reasoning в meta/isThinking).
 * unformatResponse: история из mediator → очищенные сообщения (убрать prefix, unescape HTML).
 */
class ResponseFormatter {
    /**
     * @param {string} thinkingPrefix - префикс для thinking-сообщений (напр. "*Мои размышления:* \n\n")
     */
    constructor(thinkingPrefix) {
        this.thinkingPrefix = thinkingPrefix || ''
    }

    /**
     * Преобразует нормализованный ответ в массив сообщений для отправки пользователю.
     * Ожидает, что reasoning уже извлечён в отдельное поле (через messageProcessor.fromModelFormat).
     * Добавляет артефакты для mediator: prefix и escapeHTML к reasoning.
     * @param {object} response - {answer, reasoning?, tool_calls?, log_id?}
     * @returns {Array<{text: string, meta: object, isMarkdown: boolean}>}
     */
    formatResponse(response) {
        const messages = []
        if (response.reasoning) {
            const text = this.thinkingPrefix + escapeHTML(response.reasoning)
            messages.push({ text, meta: { isThinking: "true" }, isMarkdown: false })
        }
        if (response.answer) {
            messages.push({ text: response.answer, meta: {}, isMarkdown: true })
        }
        return messages
    }

    /**
     * Очищает артефакты formatResponse из истории mediator.
     * isThinking сообщения: убирает prefix, unescape HTML.
     * Не объединяет, не удаляет — только очистка.
     * @param {Array} history - массив из getDialog()
     * @returns {Array} очищенная копия
     */
    unformatResponse(history) {
        return history.map(item => {
            if (item.isThinking) {
                let content = item.content
                if (this.thinkingPrefix && content.startsWith(this.thinkingPrefix)) {
                    content = content.slice(this.thinkingPrefix.length)
                }
                content = unescapeHTML(content)
                return { ...item, content }
            }
            return item
        })
    }
}

let responseFormatter = new ResponseFormatter(
    (_STANDARD_MESSAGES.THINKING_PREFIX) ?? ''
)


/**
 * Возвращает результат тулзы для отправки на LLM.
 * Для сценариев формирует JSON с scenario_dialogue и scenario_result.
 * @param {object} tool - элемент очереди
 * @returns {string}
 */
function getToolResult(tool) {
    const result = tool.result ?? TOOL_DONE_MESSAGE
    if (tool._scenarioDialogue) {
        return JSON.stringify({
            scenario_dialogue: tool._scenarioDialogue,
            scenario_result: result,
        })
    }
    return result
}


/**
 * Собирает нормализованную историю с явным полем reasoning.
 * Группирует сообщения по commitId (из meta) и тулзы по commit items.
 * Объединяет thinking + answer + tool_calls в одно сообщение.
 * @param {Array} history - очищенная история (после unformatResponse и processScenarios)
 * @param {Array} toolQueue - очередь из RedisQueue (тулзы + коммиты)
 * @returns {Array} [{role, message, reasoning?, tool_calls?, tool_call_id?}]
 */
function prepareHistoryWithReasoning(history, toolQueue) {
    if (!history) return []
    const filtered = history.filter(mes => mes.type !== 30)

    // Группируем тулзы по commit-ам
    const commitGroups = []
    if (toolQueue && toolQueue.length > 0) {
        let currentTools = []
        for (const item of toolQueue) {
            if (item.type === ITEM_TYPES.function && item.executed) {
                currentTools.push(item)
            } else if (item.type === ITEM_TYPES.commit) {
                commitGroups.push({
                    tools: currentTools,
                    commitId: item.commitId,
                    replyGptToMessageId: item.replyGptToMessageId,
                    reasoning: currentTools.find(t => t.reasoning)?.reasoning ?? null,
                    executed: !!item.executed,
                })
                currentTools = []
            }
        }
        // Тулзы без коммита (commit ещё не executed)
        if (currentTools.length > 0) {
            logger.warn(
                `No commit after tools in tools history: ${JSON.stringify(toolQueue)}`
            )
        }
    }

    // Индекс commitId → commit group
    const commitById = new Map()
    for (const group of commitGroups) {
        commitById.set(group.commitId, group)
    }

    // Собираем сообщения, привязанные к commitId
    const messagesByCommit = new Map()
    const commitIdSet = new Set()
    for (const mes of filtered) {
        const cid = mes.meta?.commitId
        if (cid) {
            if (!messagesByCommit.has(cid)) messagesByCommit.set(cid, [])
            messagesByCommit.get(cid).push(mes)
            commitIdSet.add(cid)
        }
    }

    // Хелпер: построить элемент результата для commit group
    function buildCommitItem(group) {
        const commitMsgs = messagesByCommit.get(group.commitId) || []
        const thinkingMsg = commitMsgs.find(m => m.isThinking)
        const answerMsg = commitMsgs.find(m => !m.isThinking)

        const reasoning = thinkingMsg?.content
            ?? answerMsg?.meta?.reasoning
            ?? group.reasoning

        const item = {
            role: 'assistant',
            message: answerMsg ? (answerMsg.content ?? answerMsg.message) : '',
            ...(reasoning && { reasoning }),
            ...(group.tools.length > 0 && {
                tool_calls: group.tools.map(t => ({
                    id: t.toolCallId,
                    type: 'function',
                    function: { name: t.name, arguments: JSON.stringify(t.args) }
                }))
            }),
        }

        const items = [item]
        // Для non-executed коммитов function results не включаем —
        // они придут отдельно как tool_responses
        if (group.executed) {
            for (const t of group.tools) {
                items.push({
                    role: ROLE.FUNCTION,
                    message: getToolResult(t),
                    tool_call_id: t.toolCallId,
                })
            }
        }
        return items
    }

    // Два итератора: по history и по commitGroups
    const result = []
    const insertedCommits = new Set()
    let gi = 0  // индекс в commitGroups

    // Хелпер: вставить следующие commit groups привязанные к данному якорю
    function insertGroupsForAnchor(anchorId) {
        while (gi < commitGroups.length) {
            const group = commitGroups[gi]
            if (group.replyGptToMessageId !== anchorId) break

            if (insertedCommits.has(group.commitId) || group.tools.length === 0) {
                gi++
                continue
            }

            result.push(...buildCommitItem(group))
            insertedCommits.add(group.commitId)
            gi++
        }
    }

    for (let i = 0; i < filtered.length; i++) {
        const mes = filtered[i]
        const cid = mes.meta?.commitId

        // Пропускаем сообщения привязанные к commitId — уже вставлены через insertGroupsForAnchor
        if (cid && insertedCommits.has(cid)) continue

        // Обычное thinking без commitId (без тулзов)
        if (mes.isThinking && !cid) {
            const next = filtered[i + 1]
            if (next && next.role === 'assistant' && !next.isThinking && !next.meta?.commitId) {
                result.push({
                    role: 'assistant',
                    message: next.content ?? next.message,
                    reasoning: mes.content,
                })
                i++
            } else {
                result.push({
                    role: 'assistant',
                    message: '',
                    reasoning: mes.content,
                })
            }
            continue
        }

        // Обычное сообщение (не привязанное к commitId)
        if (!cid) {
            const item = {
                role: mes.role,
                message: mes.content ?? mes.message,
                ...(mes.meta?.reasoning && { reasoning: mes.meta.reasoning }),
                ...(mes.tool_calls && { tool_calls: mes.tool_calls }),
                ...(mes.tool_call_id && { tool_call_id: mes.tool_call_id }),
            }
            result.push(item)

            // После user message — вставить commit groups
            if (mes.role === 'user') {
                insertGroupsForAnchor(mes.id)
            }
            continue
        }

        // Сообщение с commitId, но commit group ещё не вставлена — вставляем
        if (cid && !insertedCommits.has(cid)) {
            const group = commitById.get(cid)
            if (group) {
                result.push(...buildCommitItem(group))
            } else {
                // commitId есть в истории, но тулзы пропали — объединяем без tool_calls
                const commitMsgs = messagesByCommit.get(cid) || []
                const thinkingMsg = commitMsgs.find(m => m.isThinking)
                const answerMsg = commitMsgs.find(m => !m.isThinking)
                const reasoning = thinkingMsg?.content ?? answerMsg?.meta?.reasoning
                const item = {
                    role: 'assistant',
                    message: answerMsg ? (answerMsg.content ?? answerMsg.message) : '',
                    ...(reasoning && { reasoning }),
                }
                result.push(item)
            }
            insertedCommits.add(cid)
        }
    }

    // Оставшиеся commit groups — только если якорь существует в history
    for (; gi < commitGroups.length; gi++) {
        const group = commitGroups[gi]
        if (insertedCommits.has(group.commitId)) continue
        if (group.tools.length === 0) continue
        if (group.replyGptToMessageId && !filtered.some(m => m.id === group.replyGptToMessageId)) continue
        result.push(...buildCommitItem(group))
    }

    return result
}


function createMessageItem(id, type, message, role, meta) {
    const itemMeta = {
        ...(meta?.reasoning && { reasoning: meta.reasoning }),
        ...(meta?.commitId && { commitId: meta.commitId }),
        ...(meta?.debug && { debug: true }),
        ...(meta?.references && { references: true }),
    }
    return {
        id,
        type,
        content: message,
        role,
        ...(meta?.isThinking && { isThinking: true }),
        ...(Object.keys(itemMeta).length > 0 && { meta: itemMeta }),
    }
}


async function getBotMediatorDialogHistoryResponse(dialogId) {
    try {
        const config = {
            headers: {
                'Content-Type': 'application/json'
            },
            httpsAgent: AGENT
        }
        const requestUrl = new URL('/webhooks/mediator/messages', URL_MEDIATOR_SERVICE)
        requestUrl.searchParams.set('dialog_id', dialogId)
        const response = await axios.get(requestUrl.href, config)
        return response.data
    } catch (error) {
        logger.error("Ошибка при вызове API opbot-botmediator: " + error.message)
    }
}


function parseMediatorDialogHistory(clientDialogHistory) {
    if (!clientDialogHistory) return []
    return clientDialogHistory.reduce((acc, message) => {
        const isUserMessage = !!message.msg
        const source = isUserMessage ? message.msg : message.reply
        const { id: msgId, meta, message_type: type, message: { text } = {} } = source ?? {}
        if (type === 1 || type === 19 || type === 30) {
            const role = isUserMessage ? ROLE.USER : ROLE.BOT
            acc.push(createMessageItem(msgId, type, text, role, meta))
        }
        return acc
    }, [])
}


function getConversationId() {
    const slots = message?.slot_context?.filled_slots || []
    const slotConvId = slots.find(s => s.slot_id === 'conversation_id')
    if (slotConvId?.value) return slotConvId.value
    const metaConvId = message?.meta?.conversation_id
    if (metaConvId) return metaConvId
    return null
}

async function getMessagesByMetaResponse(customerId, omniUserId, conversationId) {
    try {
        const config = {
            headers: {
                'Content-Type': 'application/json'
            },
            httpsAgent: AGENT
        }
        const requestUrl = new URL('/mediator/messages_by_meta', URL_MEDIATOR_SERVICE)
        const response = await axios.post(requestUrl.href, {
            CustomerId: customerId,
            OmniUserId: omniUserId,
            MetaFilter: { conversation_id: conversationId },
            SortBy: "timestamp",
            SortOrder: "Asc",
            Limit: 10000
        }, config)
        return response.data
    } catch (error) {
        logger.error("Ошибка при вызове API opbot-botmediator: " + error.message)
    }
}

async function getDialog(dialog_id) {
    try {
        let clientDialogHistory = await getBotMediatorDialogHistoryResponse(dialog_id)
        return parseMediatorDialogHistory(clientDialogHistory)
    } catch (e) {
        logger.error(`Error getDialog: ${e.message}; ${JSON.stringify(e)}.`)
    }
}

async function getDialogsHistory(customerId, omniUserId) {
    try {
        const conversationId = getConversationId()
        if (!conversationId) return []
        const history = parseMediatorDialogHistory(
            await getMessagesByMetaResponse(customerId, omniUserId, conversationId)
        )
        return history || []
    } catch (e) {
        logger.error(`Error getDialogsHistory: ${e.message}; ${JSON.stringify(e)}.`)
        return []
    }
}


/**
 * Получить историю из ботмедиатора по conversation_id и убрать
 * с конца текущий вопрос, если он там есть.
 *
 * Ботмедиатор добавляет входящее сообщение в историю активного
 * диалога до того, как вызывает /message, поэтому возвращаемая
 * история заканчивается этим сообщением. craftgpt-у мы передаём
 * текущий вопрос отдельным параметром, и он сам добавляет его в
 * историю при логировании (craftgpt/llms/llm_agent.py — history +
 * [user_message]). Если не отрезать дубликат — модель увидит вопрос
 * два раза подряд.
 *
 * Использовать только там, где история точно пришла из ботмедиатора
 * (HISTORY_FROM_BOT_MEDIATOR=true).
 *
 * Между хвостовым вопросом и концом истории могут идти служебные
 * сообщения маршрутизации (type 30: switchredirect/redirect/ack):
 * в IDA-окружении входящий сценарий проходит через aiassist2, который
 * выбирает конкретного агента (gpt_ida_qwen), и этот маршрут остаётся
 * в истории после сообщения пользователя. Поэтому ищем последнее
 * «настоящее» (не type 30) сообщение, а не просто последний элемент.
 * Сами type 30 не трогаем — они нужны processScenarios.
 */
async function getMediatorHistoryForQuery(dialog_id, question, customerId, omniUserId) {
    const history = await getDialogsHistory(customerId, omniUserId)
    if (!history || history.length === 0) return history
    let lastIdx = history.length - 1
    while (lastIdx >= 0 && history[lastIdx].type === 30) lastIdx--
    if (lastIdx < 0) return history
    const last = history[lastIdx]
    if (last.role === ROLE.USER && last.content === question) {
        return [...history.slice(0, lastIdx), ...history.slice(lastIdx + 1)]
    }
    return history
}


/**
 * Собирает историю для LLM из mediator-истории и очереди тулзов.
 * Если toolQueue пуст — возвращает историю без tool_calls.
 * Если есть выполненные тулзы — вставляет tool_calls и function results,
 * сценарные сообщения упаковываются как content функции.
 *
 * @param {Array|null} mediatorHistory - из getDialog(): [{id, type, content, role, isThinking?, meta?}], null если история не управляется агентом
 * @param {Array} toolQueue - из RedisQueue.getQueue(): [{type, name, args, toolCallId, result, executed}] + commit items
 * @returns {Array|null} история в формате craftgpt, null если входная история null
 */
function buildLLMHistory(mediatorHistory, toolQueue) {
    if (mediatorHistory === null) return null
    if (mediatorHistory.length === 0) return []

    // 1. Очистка артефактов formatResponse — только наши сообщения
    //    (processScenarios должна быть вызвана до buildLLMHistory,
    //    чтобы сценарные сообщения от других агентов не прошли через unformatResponse)
    let history = responseFormatter.unformatResponse(mediatorHistory)

    // 2. Фильтруем служебные сообщения, не относящиеся к диалогу с LLM:
    //    debug (debugReply) и references (блок «Ссылки для информации»
    //    при SHOW_REFERENCES=true — нужен пользователю, но не в истории).
    history = history.filter(mes => !mes.meta?.debug && !mes.meta?.references)

    // 3. Собираем нормализованную историю с reasoning и tool_calls
    const tools = toolQueue || []
    const normHistory = prepareHistoryWithReasoning(history, tools)

    // 4. Преобразуем в формат конкретной модели
    return typeof messageProcessor !== 'undefined'
        ? messageProcessor.toModelFormat(normHistory)
        : normHistory
}


// --- Утилиты для работы со сценарной историей ---

/**
 * Возвращает подмассив arr начиная с первого элемента >= index, с index в начале.
 * Используется для нахождения позиций switchredirect-ов после заданного сообщения.
 * @param {number[]} arr - отсортированный массив индексов (напр. позиции type=30 в истории)
 * @param {number} index - начальная позиция
 * @returns {number[]}
 */
function getArrayFromInsertPosition(arr, index) {
    const insertIndex = arr.findIndex(el => el > index)
    if (insertIndex === -1) {
        return [index]
    }
    return [index, ...arr.slice(insertIndex)]
}


/**
 * Извлекает сообщения сценария между двумя switchredirect-ами в истории.
 * Возвращает [{ scenario_dialogue: [{actor, utterance}] }, [ids]] — диалог сценария и id сообщений для исключения.
 * @param {number[]} indices - индексы switchredirect-ов (из getArrayFromInsertPosition)
 * @param {Array} history - история диалога из getDialog()
 * @param {number} inputIndex - номер группы сценарных сообщений (смещение в indices)
 * @returns {[object, string[]] | []}
 */
function getScenarioMessages(indices, history, inputIndex) {
    const currentIndex = indices[inputIndex]

    if (currentIndex === undefined) {
        return []
    }

    const nextIndex = indices[inputIndex + 1]

    let messages
    if (nextIndex === undefined) {
        messages = history.slice(currentIndex + 1)
    } else {
        messages = history.slice(currentIndex + 1, nextIndex)
    }
    const reduced = messages
        .reduce((acc, mes) => {
            if (mes.type !== 30) {
                acc.messages.push({
                    actor: mes.role,
                    utterance: mes.content
                })
                acc.ids.push(mes.id)
            }
            return acc
        }, { messages: [], ids: [] })
    return [{ scenario_dialogue: reduced.messages }, reduced.ids]
}
