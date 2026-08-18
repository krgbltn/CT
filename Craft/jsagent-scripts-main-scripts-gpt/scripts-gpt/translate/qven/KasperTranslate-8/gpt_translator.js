const URL_LLM_SMALLTALK = new URL("/query", agentSettings.url_llm).href
const LLM_AUTH_TOKEN = agentSettings.llm_auth_token ?? ""
const LLM_TIMEOUT = agentSettings.llm_timeout ?? 60
const LLM_TEMPERATURE = agentSettings.llm_temperature ?? 0.0
const textFailedTranslate = "TRANSLATION_ERROR"
const NO_THINK = agentSettings.no_think || ""
const createLLMTemplateTranslate = (fromLanguage, toLanguage) => {
    return `Ты — профессиональный переводчик. Твоя задача — переводить текст строго с ${fromLanguage} на ${toLanguage}.

Правила:
1. Переводи только осмысленный текст на ${fromLanguage}. Если текст не на ${fromLanguage}, верни строго следующую строку без кавычек: ${textFailedTranslate}.
2. Если текст уже на ${toLanguage} (даже частично), или представляет собой бессмысленный набор букв, цифр, символов, эмодзи, смешанных языков — верни строго следующую строку без кавычек: ${textFailedTranslate}.
3. Никогда не интерпретируй HTML-сущности как эмодзи. Сохраняй их в оригинальном виде, например: &#128513;, &nbsp;, &amp; — не меняй и не преобразовывай.
4. Не добавляй пояснений, комментариев, не оформляй ответ. Отвечай ТОЛЬКО переведённым текстом или верни строго следующую строку без кавычек: ${textFailedTranslate}.
5. Если текст нельзя перевести (не на языке ${fromLanguage}, бессмысленный, технический, содержит смесь языков и т.п.), верни строго следующую строку без кавычек: ${textFailedTranslate}.

Примеры:
- Ввод: "Hello world &#128513;" → Вывод: "Привет, мир &#128513;"
- Ввод: "Привет, мир!" → Вывод: ${textFailedTranslate}
- Ввод: "a1b2c3 😊 qwerty" → Вывод: ${textFailedTranslate}
- Ввод: "Valid ${fromLanguage} sentence" → Вывод: переведённый текст на ${toLanguage}

Ты должен строго следовать этим правилам. Никаких исключений.
${NO_THINK}`
}

async function commandGeneric(question, instruction) {
    let headers
    if (LLM_AUTH_TOKEN) {
        headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LLM_AUTH_TOKEN}`
        }
    }
    try {
        return axios.post(
            URL_LLM_SMALLTALK,
            {
                question,
                instruction,
                temperature: LLM_TEMPERATURE
            },
            {
                timeout: LLM_TIMEOUT * 1000,
                headers: headers
            }
        )
    } catch (e) {
        logger.error(`Error requesting LLM: ${e}`)
        throw e
    }
}

async function translate() {
    const question = `Переведи текст с ${message.fromLanguage} на ${message.toLanguage} язык. \n\nТекст\n` +
        message.text
    const response = await commandGeneric(
        question,
        createLLMTemplateTranslate(message.fromLanguage, message.toLanguage)
    )
    const translatedText = response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim() // Убирает тег размышления LLM

    if (translatedText === textFailedTranslate) {
        let noTranslatedText = message.text
        if (!message?.isOperator) {
            noTranslatedText = message.text + "\n" + textFailedTranslate
        }
        return {
            textAfterTranslation: noTranslatedText,
            success: false
        }
    }

    return {
        textAfterTranslation: translatedText,
        success: true
    }
}

async function main() {
    logger.info("message: " + JSON.stringify(message))
    let text = message.text
    let result = false
    const isNotOnlyDigits = /[^0-9]/.test(text)
    if (isNotOnlyDigits) {
        const {textAfterTranslation, success} = await translate()
        text = textAfterTranslation
        result = success
    }
    return {
        translatedText: text,
        success: result

    }
}

main()
    .then((res) => {
        logger.info(JSON.stringify(res))
        resolve(res)
    })
    .catch((er) => {
            logger.error(JSON.stringify(er))
            resolve("Что-то пошло не так при переводе")
        }
    )
