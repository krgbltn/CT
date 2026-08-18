// @module core/tools_loop
// @requires modules/core/http.js
// @requires modules/core/dialog.js
// @requires modules/core/slots.js
// Цикл выполнения tool calls: ScenarioNotReadyError, SwitchRedirectPropagate,
// RedisQueue, runToolsLoop

let AGENT_NAME = agentSettings.agent_name
let ROUTE_TO_SELF_AGENT = `/switchredirect ${AGENT_NAME}`


class SwitchRedirectPropagate extends Error {
    constructor(switchredirect) {
        super("switchredirect call")
        this.name = "SwitchRedirectPropagate"
        this.switchredirect = switchredirect
    }
}

const _AP_TOOLS = agentSettings.agent_parameters ?? {}
let {
    MAX_CYCLES = 5,
    TOOL_DONE_MESSAGE = "Done",
} = _AP_TOOLS

const _SM_TOOLS = agentSettings.standard_messages ?? {}
// action и текст кнопки должны совпадать с обработкой в runToolsLoop (action:"cancel" / "прервать")
let {
    MESSAGE_CANCEL_WAITING = "Готов ответить на ваш следующий вопрос! Чем ещё могу помочь?",
    MESSAGE_WHILE_WAITING_ERROR = `Чтобы обеспечить качественную обработку ваших запросов, мы сначала должны завершить работу по предыдущему вопросу. Пожалуйста, дождитесь ответа, после чего сможете задать новый вопрос.
\`\`\`buttons(placement:keyboard)
::
[Прервать](type:action action:cancel color:negative)
\`\`\`
`,
} = _SM_TOOLS


function scenario(scenarioName) {
    return function(originalFunction) {
        const wrapped = async function(...args) {
            // Вызываем оригинальную функцию
            return await originalFunction.apply(this, args)
        }

        // Помечаем как сценарную
        wrapped.isScenario = true
        wrapped.returnsResult = true
        // Ожидаем, что результат сценария будет записан в слот с именем scenarioName
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

function switchredirect(intent_id) {
    return `/switchredirect aiassist2 intent_id="${intent_id}"`
}


let KEYS = {
    QUEUE_KEY: "function_queue",
    N_CYCLES_KEY: "n_cycles",
}

let WAIT_FOR_SCENARIO_TTL = 60 * 60 * 24  // 24 часа


/**
 * Обрабатывает сценарные тулзы: извлекает сценарные сообщения из истории,
 * сохраняет scenario_dialogue в поле _scenarioDialogue тулзы.
 * Удаляет switchredirect-ы и сценарные сообщения из истории.
 * Не мутирует входные массивы.
 *
 * @param {Array} history - история из getDialog()
 * @param {Array} tools - очередь из RedisQueue
 * @param {string} routeToSelfAgent - строка switchredirect обратно на наш агент
 * @returns {{ history: Array, tools: Array }}
 */
function processScenarios(history, tools, routeToSelfAgent) {
    const newHistory = [...history]
    const newTools = tools.map(t => ({ ...t }))
    const indicesToRemove = new Set()
    let currentAnchorIndex = -1  // трекаем текущий user message

    for (let i = 0; i < newTools.length; i++) {
        const tool = newTools[i]
        if (tool.type !== 'function' || !tool.started || tool.scenario === null) continue

        const commit = newTools.slice(i + 1).find(t => t.type === ITEM_TYPES.commit)
        if (!commit?.replyGptToMessageId) continue

        let anchorIndex = newHistory.findIndex(m => m.id === commit.replyGptToMessageId)
        if (anchorIndex !== -1) {
            currentAnchorIndex = anchorIndex
        } else {
            anchorIndex = currentAnchorIndex
        }
        if (anchorIndex === -1) continue

        // Найти диапазон сценария: от первого switchredirect (не наш) после якоря
        // до switchredirect обратно (наш), включая оба
        let scenarioStart = -1
        let scenarioEnd = -1
        for (let j = anchorIndex + 1; j < newHistory.length; j++) {
            if (indicesToRemove.has(j)) continue
            if (newHistory[j].type === 30) {
                if (scenarioStart === -1 && newHistory[j].content !== routeToSelfAgent) {
                    scenarioStart = j
                } else if (scenarioStart !== -1 && newHistory[j].content === routeToSelfAgent) {
                    scenarioEnd = j
                    break
                }
            }
        }

        if (scenarioStart === -1) continue

        // Извлечь сценарные сообщения (type !== 30, между switchredirect-ами)
        const scenarioDialogue = []
        const endIdx = scenarioEnd !== -1 ? scenarioEnd : newHistory.length
        for (let j = scenarioStart; j <= endIdx && j < newHistory.length; j++) {
            indicesToRemove.add(j)
            if (newHistory[j].type !== 30) {
                scenarioDialogue.push({
                    actor: newHistory[j].role,
                    utterance: newHistory[j].content,
                })
            }
        }

        newTools[i] = { ...tool, _scenarioDialogue: scenarioDialogue }

        // Нормализация replyGptToMessageId в commit — только если id не найден в history
        const commitMsgExists = newHistory.some(m => m.id === commit.replyGptToMessageId)
        if (!commitMsgExists) {
            const lastUserMsg = newHistory.filter((m, idx) => m.role === 'user' && !indicesToRemove.has(idx)).pop()
            if (lastUserMsg) {
                const commitIdx = newTools.indexOf(commit)
                newTools[commitIdx] = { ...newTools[commitIdx], replyGptToMessageId: lastUserMsg.id }
            }
        }
    }

    return {
        history: newHistory.filter((_, idx) => !indicesToRemove.has(idx)),
        tools: newTools,
    }
}


class ScenarioNotReadyError extends Error {
    constructor(scenarioName) {
        super(`Unexpected run of the tools agent during waiting for ${scenarioName}`)
        this.name = "ScenarioNotReadyError"
    }
}


let RedisQueue = class {
    constructor(redisClient, deleteSlotFn, debugLogFn) {
        this.redis = redisClient
        this.deleteSlot = deleteSlotFn
        this.debugReply = debugLogFn
    }

    // Хук: вызывается после завершения сценарной тулзы, до markAsExecuted.
    // Для fire-and-forget сценариев scenarioResult === undefined.
    // Дефолт — no-op. Клиенты переопределяют для side-эффектов (например, markdownReply).
    async onScenarioCompleted(item, scenarioResult, replies) {}

    // Добавление задачи в очередь
    async addFunction(queue, name, args, toolCallId, reasoning) {
        const newItem = {
            type: ITEM_TYPES.function,
            name: name,
            args: args,
            toolCallId: toolCallId,
            executed: false,
            started: false,
            scenario: null,
            result: null,
            reasoning: reasoning ?? null,
        }
        queue.push(newItem)
    }

    // Добавление коммита
    async addCommit(queue, commitId, replyGptToMessageId) {
        queue.push({
            type: ITEM_TYPES.commit,
            commitId: commitId,
            replyGptToMessageId: replyGptToMessageId,
            executed: false,
        })
    }

    // Получение и обработка очереди
    async processQueue(queue, commitFcResults, replies) {  // -> {answer, tool_calls, log_id} | undefined
        let lastCommitIndex = -1

        for (let i = 0; i < queue.length; i++) {
            const item = queue[i]

            // пропустим выполненные элементы
            if (item.type === ITEM_TYPES.function && item.executed) {
                continue
            }
            if (item.type === ITEM_TYPES.commit && item.executed) {
                lastCommitIndex = i
                continue
            }
            // Обработка невыполненной функции
            if (item.type === ITEM_TYPES.function) {
                if (item.started) {
                    // запущенные сценарии
                    let scenarioResult
                    if (item.scenario !== null) {
                        // scenario that returns a result
                        scenarioResult = this.getScenarioAnswer(item.scenario)
                        logger.debug(`scenarioResult ${scenarioResult}`)
                        if (scenarioResult === undefined) {
                            throw new ScenarioNotReadyError(item.scenario)
                        }
                        this.deleteSlot(item.scenario)
                    }
                    await this.onScenarioCompleted(item, scenarioResult, replies)
                    await this.markAsExecuted(queue, i, scenarioResult)
                } else {
                    // Запускаем функции
                    const func = availableFunctions[item.name]
                    this.debugReply(
                        `Calling ${item.name}(${JSON.stringify(item.args)})`
                    )
                    if (func.isScenario) {
                        await this.markAsStartedScenario(queue, i, func.scenarioName)
                        const res = await func(item.args, replies)

                        if (res?.[0] === "/") {  // /switchredirect as expected
                            throw new SwitchRedirectPropagate(res)
                        }
                        // else it is probably an error, so return it as result
                        await this.markAsExecuted(queue, i, res)
                    } else {
                        const res = await func(item.args)
                        await this.markAsExecuted(queue, i, res)
                    }
                }
                continue
            }

            // Обработка коммита
            if (item.type === ITEM_TYPES.commit && !item.executed) {
                const functionsToCommit = []
                let commitIndex = i

                // Сбор выполненных функций текущего батча
                for (let j = lastCommitIndex + 1; j < commitIndex; j++) {
                    if (queue[j].type === ITEM_TYPES.function && queue[j].executed) {
                        functionsToCommit.push(queue[j])
                    } else if (!queue[j].executed) {
                        logger.warn(`Unexpected item before commit: ${JSON.stringify(queue[j])}`)
                        this.debugReply(`Unexpected item before commit: ${JSON.stringify(queue[j])}`)
                    }
                }
                this.debugReply(`Comitting ${JSON.stringify(functionsToCommit, null, 2)}`)
                const nCycles = await this.incNCycles()
                this.debugReply(`Cycle ${nCycles} / ${MAX_CYCLES}`)
                const toolСhoice = nCycles >= MAX_CYCLES ? "none" : "auto"

                const llmRes = await commitFcResults(
                    functionsToCommit,
                    toolСhoice,
                    queue
                )
                await this.markAsExecuted(queue, commitIndex)
                return llmRes
            }
        }
    }

    // Получить результат сценария из слота
    getScenarioAnswer(scenarioName) {
        if (scenarioName === null) {
            return null
        }
        return getSlotValue(scenarioName)
    }

    // Пометить функцию как запущенную
    async markAsStartedScenario(queue, i, scenarioName) {
        const item = queue[i]
        item.started = true
        item.scenario = scenarioName
        await this.saveQueue(queue)
    }

    // Пометить функцию как выполненную
    async markAsExecuted(queue, i, result) {
        const item = queue[i]
        item.executed = true
        item.result = result
        await this.saveQueue(queue)
        if (item.name) this.debugReply(`${item.name} finished with ${result}`)
    }

    async clearQueue() {
        for (const item of await this.getQueue()) {
            if (item.scenario !== null && item.scenario !== undefined) {
                this.deleteSlot(item.scenario)
            }
        }
        this.debugReply(JSON.stringify(
            await this.saveQueue([])
        ))
        this.debugReply(await this.getQueue())
        await this.resetNCycles()
    }

    async cancelUnexecuted() {
        const queue = await this.getQueue()
        for (const item of queue) {
            if (!item.executed && item.scenario !== null && item.scenario !== undefined) {
                this.deleteSlot(item.scenario)
            }
        }
        const remaining = queue.filter(item => item.executed)
        await this.saveQueue(remaining)
        await this.resetNCycles()
    }

    async getQueue() {
        const data = await this.redis.get(KEYS.QUEUE_KEY)
        this.debugReply(`Get queue: ${JSON.stringify(data)}`)
        return data ? JSON.parse(data) : []
    }

    async saveQueue(queue) {
        // Удаляем _scenarioDialogue перед записью — обогащение хранится только в памяти
        const clean = queue.map(item => {
            if (item._scenarioDialogue !== undefined) {
                const { _scenarioDialogue, ...rest } = item
                return rest
            }
            return item
        })
        return await this.redis.set(KEYS.QUEUE_KEY, JSON.stringify(clean), WAIT_FOR_SCENARIO_TTL)
    }

    async incNCycles() {
        let n_cycles = await this.redis.get(KEYS.N_CYCLES_KEY) ?? 0
        n_cycles++
        await this.redis.set(KEYS.N_CYCLES_KEY, n_cycles, WAIT_FOR_SCENARIO_TTL)
        return n_cycles
    }

    async resetNCycles() {
        await this.redis.set(KEYS.N_CYCLES_KEY, 0, WAIT_FOR_SCENARIO_TTL)
    }
}


function setScenariosForTransfer(scenarios) {
    availableFunctions["transfer_to_scenario"] = scenario(null)(function ({id}) {
        const scenarios_ = scenarios
        if (scenarios_[id] === undefined) {
            logger.error(`Scenario ${id} is not defined. Available: ${JSON.stringify(Object.keys(scenarios_))}`)
            return `ERROR: scenario ${id} is not defined`
        }
        return switchredirect(scenarios_[id])
    })
}


/**
 * Добавляет сценарии в tool transfer_to_scenario.
 * @param {Array<{title: string, content: string, symbol_code: string}>} scenarios
 */
function addCustomScenariosToTools(scenarios) {
    if (!scenarios || scenarios.length === 0) return

    TOOLS = TOOLS.map(tool => {
        if (tool.function.name !== "transfer_to_scenario") return tool
        const content = scenarios
            .map(s => `- ${translit(s.title)} Примеры вопросов: ${s.content}`)
            .join('\n')
        tool.function.parameters.properties.id.description =
            `Идентификатор сценария, на который выполняешь перевод. Доступные значения и примеры вопросов (вызывай этот сценарий, если сообщение пользователя похоже на один из примеров вопросов):\n${content}`
        tool.function.parameters.properties.id.enum = scenarios.map(s => translit(s.title))
        return tool
    })

    const scenarioMap = scenarios.reduce((dict, s) => {
        dict[translit(s.title)] = s.symbol_code
        return dict
    }, {})
    logger.info(`Formatted scenarios for tool 'transfer_to_scenario'. ${JSON.stringify(scenarioMap)}`)
    setScenariosForTransfer(scenarioMap)
}


async function enqueueToolCalls(redisClient, queue, toolCalls, commitId, replyMessageId, pendingReasoning, replies) {
    let functionAdded = false
    for (const call of toolCalls) {
        if (!call.function || !call.function.name) continue
        const funcName = call.function.name
        if (!availableFunctions[funcName]) {
            throw new Error(`Функция ${funcName} не найдена`)
        }
        const funcArgs = JSON.parse(call.function.arguments)
        replies.debugReply(`Enqueuing tool ${funcName}(${JSON.stringify(funcArgs, null, 2)})`)
        await redisClient.addFunction(queue, funcName, funcArgs, call.id, pendingReasoning)
        pendingReasoning = null  // привязываем только к первой тулзе
        functionAdded = true
    }
    if (functionAdded) {
        await redisClient.addCommit(queue, commitId, replyMessageId)
        await redisClient.saveQueue(queue)
    } else {
        await redisClient.resetNCycles()
    }
    return functionAdded
}


async function runToolsLoop(question, dialog_id, history, replies, sendMessageToLLMOpts, sendMessageToLLM, _printResponse) {
    const redisClient = new RedisQueue(
        agentStorage.dialogStorage,
        replies.deleteSlot,
        replies.debugReply
    )

    // check whether we want to erase the queue
    if (question.toLowerCase() === "прервать" || message.message.action === "cancel") {
        replies.debugReply("Cancelling all tool calls")
        await Promise.all([
            redisClient.cancelUnexecuted(),
            replies.markdownReply(MESSAGE_CANCEL_WAITING)
        ])
        return { cancelled: true }
    }

    // Обработка сценариев: извлечение scenario_dialogue из истории,
    // обогащение results тулзов. До buildLLMHistory, чтобы
    // сценарные сообщения от других агентов не прошли через unformatResponse.
    let queue = await redisClient.getQueue()
    if (history !== null) {
        const processed = processScenarios(history, queue, ROUTE_TO_SELF_AGENT)
        history = processed.history
        queue = processed.tools
    }

    const commitFcResults = async function (fcResults, toolСhoice, fullQueue) {
        logger.debug("fcResults " + JSON.stringify(fcResults))
        const functionsToCommit = fcResults.map(tool => ({
            role: ROLE.FUNCTION,
            content: getToolResult(tool),
            tool_call_id: tool.toolCallId
        }))
        // Перезапрашиваем историю из медиатора напрямую (без trim
        // через getMediatorHistoryForQuery): для /tool_responses
        // craftgpt не приклеивает question отдельно, поэтому в
        // истории должен остаться оригинальный user-msg. Заодно
        // подхватывается isThinking при SHOW_THINKING=true.
        let currentHistory = history
        if (history !== null && dialog_id) {
            const freshHistory = await getDialogsHistory(message.user.customer_id, message.user.omni_user_id)
            const processed = processScenarios(freshHistory, fullQueue, ROUTE_TO_SELF_AGENT)
            currentHistory = processed.history
        }
        const llmHistory = buildLLMHistory(currentHistory, fullQueue)
        return await commitToolResponses(
            functionsToCommit, dialog_id, llmHistory, replies, toolСhoice
        )
    }

    // pull scenario answers, call next functions
    let response
    let finalAnswer
    let responsePrinted = false
    try {
        response = await redisClient.processQueue(queue, commitFcResults, replies)
    } catch (error) {
        if (error instanceof ScenarioNotReadyError) {
            if (question) {
                await replies.markdownReply(MESSAGE_WHILE_WAITING_ERROR)
                replies.debugReply(error.message)
                return { cancelled: true }
            }
        }
        throw error
    }

    // Если не было обработки тулзов, то отправляем сообщение пользователя на ллмку
    if (response === undefined) {
        if (!question) {
            logger.warn("Empty question with empty queue, skipping")
            replies.debugReply("Empty question with empty queue, skipping")
            return { cancelled: true }
        }
        response = await sendMessageToLLM(question, dialog_id, history, replies, sendMessageToLLMOpts)
        responsePrinted = true
        finalAnswer = response.answer
    } else if (question) {
        logger.warn(`Both tools handling and user's question (${question}) have gotten. The user's question will be ignored.`)
        replies.debugReply(`Both tools handling and user's question (${question}) have gotten. The user's question will be ignored.`)
    }

    while (response !== undefined) {
        const commitId = uuid.v4()
        let pendingReasoning = null
        if (response.answer && !responsePrinted) {
            pendingReasoning = await _printResponse(response, replies, commitId)
        }
        await enqueueToolCalls(
            redisClient, queue, response.tool_calls ?? [],
            commitId, message.id,
            pendingReasoning, replies
        )
        response = await redisClient.processQueue(queue, commitFcResults, replies)
        responsePrinted = false
    }
    replies.debugReply("Finish")
    return { finalAnswer }
}
