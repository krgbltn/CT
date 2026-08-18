// @module core/rag
// @requires modules/core/http.js
// @requires modules/core/slots.js
// LLM-запросы: smalltalk, rag, rephrase, commitToolResponses

const _LLM_SETTINGS_RAG = agentSettings.llm_settings ?? {}
let LLM_TEMPERATURE = _LLM_SETTINGS_RAG.temperature ?? 0.6
let LLM_TEMPERATURE_SMALLTALK = _LLM_SETTINGS_RAG.temperature_smalltalk ?? 0.7
let LLM_TOP_P = _LLM_SETTINGS_RAG.top_p ?? 0.95
let LLM_TOP_K = _LLM_SETTINGS_RAG.top_k ?? 20
let LLM_MIN_P = _LLM_SETTINGS_RAG.min_p ?? 0.0
// null → craftgpt применит свой дефолт (config.max_tokens)
let LLM_MAX_TOKENS = _LLM_SETTINGS_RAG.max_tokens ?? null

const _AP_RAG = agentSettings.agent_parameters ?? {}
let {
    DO_REPHRASE = false,
    REPHRASE_N_GENERATIONS = 4,
    REPHRASE_SAMPLES_PER_GENERATION = 4,
    ENABLE_THINKING_SMALLTALK = true,
    ENABLE_THINKING_RAG = true,
    SMALLTALK_IF_NO_CONTEXT = true,
} = _AP_RAG


function applyPromptOverrides() {
    const prompts = agentSettings.prompts
    if (!prompts) return
    if (prompts.system_template) LLM_SYSTEM_TEMPLATE = prompts.system_template
    if (prompts.system_template_smalltalk) LLM_SYSTEM_TEMPLATE_SMALLTALK = prompts.system_template_smalltalk
    if (prompts.rag_template) RAG_TEMPLATE = prompts.rag_template
    if (prompts.smalltalk_template) SMALLTALK_TEMPLATE = prompts.smalltalk_template
    if (prompts.rag_document_template) RAG_DOCUMENT_TEMPLATE = prompts.rag_document_template
    if (prompts.rephrase_prompt_1) REPHRASE_PROMPT_1 = prompts.rephrase_prompt_1
    if (prompts.rephrase_prompt_2) REPHRASE_PROMPT_2 = prompts.rephrase_prompt_2
}


async function smalltalk(question, dialogId, history, replies) {
    const requestData = {
        question: SMALLTALK_TEMPLATE.replace('{question}', question),
        dialog_id: dialogId,
        history: history,
        temperature: LLM_TEMPERATURE_SMALLTALK,
        top_p: LLM_TOP_P,
        top_k: LLM_TOP_K,
        min_p: LLM_MIN_P,
        max_tokens: LLM_MAX_TOKENS,
        instruction: slotManager.injectSlotsIntoPrompt(LLM_SYSTEM_TEMPLATE_SMALLTALK),
        tools: TOOLS,
        last_context_price: LAST_CONTEXT_PRICE,
        other_context_price: OTHER_CONTEXT_PRICE,
        add_other_context: ADD_OTHER_CONTEXT
    }

    return await _callLLM(
        URL_LLM_SMALLTALK,
        requestData,
        replies
    )
}


async function rag(question, context, dialogId, history, replies) {
    const requestData = {
        question: question,
        dialog_id: dialogId,
        history: history,
        context: context,
        temperature: LLM_TEMPERATURE,
        top_p: LLM_TOP_P,
        top_k: LLM_TOP_K,
        min_p: LLM_MIN_P,
        max_tokens: LLM_MAX_TOKENS,
        system_template: slotManager.injectSlotsIntoPrompt(LLM_SYSTEM_TEMPLATE),
        user_template: RAG_TEMPLATE,
        document_template: RAG_DOCUMENT_TEMPLATE,
        join_sep: RAG_JOIN_SEP,
        tools: TOOLS,
        last_context_price: LAST_CONTEXT_PRICE,
        other_context_price: OTHER_CONTEXT_PRICE,
        add_other_context: ADD_OTHER_CONTEXT
    }

    return await _callLLM(
        URL_LLM,
        requestData,
        replies,
        (e) => {
            replies.debugReply(
                "<h3>Контекст</h3>" + JSON.stringify(context, null, 2)
            )
        }
    )
}


async function commitToolResponses(
    tool_responses, dialogId, history, replies, tool_choice
) {
    const requestData = {
        tool_responses: tool_responses,
        dialog_id: dialogId,
        history: history,
        temperature: LLM_TEMPERATURE,
        top_p: LLM_TOP_P,
        top_k: LLM_TOP_K,
        min_p: LLM_MIN_P,
        max_tokens: LLM_MAX_TOKENS,
        tools: TOOLS,
        tool_choice: tool_choice,
        last_context_price: LAST_CONTEXT_PRICE,
        other_context_price: OTHER_CONTEXT_PRICE,
        add_other_context: ADD_OTHER_CONTEXT
    }

    logger.debug(`User question ${message.message.text}. Commit tool responses: ${JSON.stringify(tool_responses)}`)
    return await _callLLM(
        URL_LLM_COMMIT_TOOL_RESPONSES,
        requestData,
        replies
    )
}


async function rephrase(question, prompt, dialogId, history, replies) {
    const requestData = {
        question: question,
        prompt: prompt,
        dialog_id: dialogId,
        history: history,
        n_generations: REPHRASE_N_GENERATIONS,
        samples_per_generation: REPHRASE_SAMPLES_PER_GENERATION,
        last_context_price: LAST_CONTEXT_PRICE,
        other_context_price: OTHER_CONTEXT_PRICE,
        add_other_context: ADD_OTHER_CONTEXT
    }

    const response = await _callLLM(
        URL_LLM_REPHRASE,
        requestData,
        replies
    )
    return response.texts
}
