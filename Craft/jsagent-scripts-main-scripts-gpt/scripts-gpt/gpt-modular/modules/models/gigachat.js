// @module models/gigachat
// GigaChat-specific: no think tags

let supportsThinking = false

// Контракт: каждый model-модуль объявляет THINK/NO_THINK.
let THINK = ""
let NO_THINK = ""


function applyModelConfig() {
    /* GigaChat не использует think-теги */
}


class GigaChatMessageProcessor {
    /**
     * Извлекает reasoning из формата модели.
     * GigaChat не поддерживает reasoning в answer — возвращает as-is.
     * @param {object} response - {answer, reasoning?, tool_calls?, log_id?}
     * @returns {object} response без изменений
     */
    fromModelFormat(response) {
        return response
    }

    /**
     * Преобразует абстрактную историю в формат craftgpt для GigaChat.
     * Удаляет поле reasoning из сообщений.
     * @param {Array} history - [{role, message, reasoning?, tool_calls?, tool_call_id?}]
     * @returns {Array} [{role, message, tool_calls?, tool_call_id?}]
     */
    toModelFormat(history) {
        return history.map(({ reasoning, ...rest }) => rest)
    }
}

let messageProcessor = new GigaChatMessageProcessor()
