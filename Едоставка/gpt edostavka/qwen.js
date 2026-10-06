// @module models/qwen
// Qwen-specific: QwenMessageProcessor, applyModelConfig

// Модель показывает reasoning через <think>...</think> в content
let supportsThinking = true

const _SM_QWEN = typeof agentSettings === 'undefined'
    ? {}
    : agentSettings.standard_messages ?? {}
let {
    THINKING_INTERRUPTED_ERROR_MSG = "Не удалось подготовить ответ. Пожалуйста, повторите запрос.",
} = _SM_QWEN


class QwenMessageProcessor {
    /**
     * Извлекает reasoning из формата Qwen (<think> теги в answer).
     * @param {object} response - {answer, reasoning?, tool_calls?, log_id?}
     * @returns {object} response с reasoning в отдельном поле, answer без <think> тегов
     */
    fromModelFormat(response) {
        // Если reasoning уже как отдельное поле — ничего не делаем
        if (response.reasoning) return response

        const answer = response.answer || ''
        const openTag = '<think>'
        const closeTag = '</think>'
        const startIdx = answer.indexOf(openTag)
        const endIdx = answer.indexOf(closeTag)

        if (startIdx === -1) {
            return response
        }

        // The model was interrupted before closing its reasoning block.
        // Never expose the raw chain of thought as a user-facing answer.
        if (endIdx === -1 || endIdx < startIdx) {
            return {
                ...response,
                answer: THINKING_INTERRUPTED_ERROR_MSG,
                reasoning: undefined,
            }
        }

        const reasoning = answer.substring(startIdx + openTag.length, endIdx).trim()
        const cleanedText = (
            answer.substring(0, startIdx) +
            answer.substring(endIdx + closeTag.length)
        ).trim()

        return {
            ...response,
            answer: cleanedText,
            reasoning: reasoning || undefined,
        }
    }

    /**
     * Преобразует абстрактную историю в формат craftgpt для Qwen.
     * reasoning → <think>\n...\n</think>\n\n перед message.
     * @param {Array} history - [{role, message, reasoning?, tool_calls?, tool_call_id?}]
     * @returns {Array} [{role, message, tool_calls?, tool_call_id?}]
     */
    toModelFormat(history) {
        return history.map(({ reasoning, message, ...rest }) => {
            if (reasoning) {
                return { ...rest, message: `<think>\n${reasoning}\n</think>\n\n${message || ''}` }
            }
            return { ...rest, message }
        })
    }
}

let messageProcessor = new QwenMessageProcessor()


// Qwen-специфичные суффиксы. Доступны клиентам после @requires qwen.js
// (используются, например, в gpt_ida_qwen.define_topic).
let THINK = " /think"
let NO_THINK = " /no_think"


function applyModelConfig() {
    const smalltalkSuffix = ENABLE_THINKING_SMALLTALK ? THINK : NO_THINK
    LLM_SYSTEM_TEMPLATE_SMALLTALK += smalltalkSuffix
    SMALLTALK_TEMPLATE += smalltalkSuffix

    const ragSuffix = ENABLE_THINKING_RAG ? THINK : NO_THINK
    LLM_SYSTEM_TEMPLATE += ragSuffix
    RAG_TEMPLATE += ragSuffix
}
