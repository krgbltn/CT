// @module models/qwen_yandex
// Yandex Cloud Qwen3-235B-A22B-FP8 (gpt://qwen3-235b-a22b-fp8/latest):
// reasoning не виден наружу — нет ни <think> в content, ни reasoning_content.
// /think /no_think директивы модель игнорирует. Поведение downstream — как у default.

let supportsThinking = false


class QwenYandexMessageProcessor {
    fromModelFormat(response) {
        return response
    }

    toModelFormat(history) {
        return history.map(({ reasoning, ...rest }) => rest)
    }
}

let messageProcessor = new QwenYandexMessageProcessor()


// Контракт: каждый model-модуль объявляет THINK/NO_THINK.
// Yandex модель эти суффиксы игнорирует — пустые строки.
let THINK = ""
let NO_THINK = ""


function applyModelConfig() {
    /* /think /no_think игнорируются — суффиксы не добавляем */
}
