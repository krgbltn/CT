// @module models/default
// Модель по умолчанию — без think-тегов

let supportsThinking = false

// Контракт: каждый model-модуль объявляет THINK/NO_THINK, чтобы
// клиентские скрипты могли ссылаться на них без проверки.
let THINK = ""
let NO_THINK = ""


function applyModelConfig() {
    /* Модель по умолчанию — без think-тегов */
}


class DefaultMessageProcessor {
    /**
     * Извлекает reasoning из формата модели.
     * Default модель не поддерживает reasoning в answer — возвращает as-is.
     * @param {object} response - {answer, reasoning?, tool_calls?, log_id?}
     * @returns {object} response без изменений
     */
    fromModelFormat(response) {
        return response
    }

    /**
     * Преобразует абстрактную историю в формат craftgpt для модели без reasoning.
     * Удаляет поле reasoning из сообщений.
     * @param {Array} history - [{role, message, reasoning?, tool_calls?, tool_call_id?}]
     * @returns {Array} [{role, message, tool_calls?, tool_call_id?}]
     */
    toModelFormat(history) {
        return history.map(({ reasoning, ...rest }) => rest)
    }
}

let messageProcessor = new DefaultMessageProcessor()
