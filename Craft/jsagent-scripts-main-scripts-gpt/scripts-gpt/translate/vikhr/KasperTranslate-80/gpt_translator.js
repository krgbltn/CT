const URL_LLM_SMALLTALK = new URL("/query", agentSettings.url_llm).href
const LLM_AUTH_TOKEN = agentSettings.llm_auth_token ?? ""
const LLM_TIMEOUT = agentSettings.llm_timeout ?? 60
const LLM_TEMPERATURE = agentSettings.llm_temperature ?? 0.0
const textFailedTranslate = "TRANSLATION_ERROR"
const createLLMTemplateTranslateOperator = (fromLanguage, toLanguage, input_text) => {
    return `Ты — переводчик. Переведи текст на ${toLanguage}.

ПРАВИЛА:
1. Переводи только контент на языке ${fromLanguage}. Все остальное (имена, технические термины, коды, англицизмы) оставляй без изменений.
2. Никогда не интерпретируй HTML-сущности как эмодзи. Сохраняй их в оригинальном виде, например: &#128513;, &nbsp;, &amp; — не меняй и не преобразовывай, оставляй их в переведенном тексте.
3. Не добавляй никаких комментариев, рассуждений, подписей ( Translation, ПЕРЕВОД и тд.)
4. Если не можешь перевести (бессмысленный текст, уже на ${toLanguage}) → "${textFailedTranslate}"
5. Возвращай ТОЛЬКО ПЕРЕВЕДЕННЫЙ ТЕКСТ без подписей или "${textFailedTranslate}"


ТЕКСТ: "${input_text}"
`
}

const createLLMTemplateTranslateUser = (fromLanguage, toLanguage, input_text) => {
    return `Ты — переводчик. Переведи текст на ${toLanguage}.

ПРАВИЛА:
1. Переводи слова c ${fromLanguage}, остальное оставляй как есть
2. Никогда не интерпретируй HTML-сущности как эмодзи. Сохраняй их в оригинальном виде, например: &#128513;, &nbsp;, &amp; — не меняй и не преобразовывай, оставляй их в переведенном тексте.
3. Исправляй опечатки и сокращения при переводе
3. Не добавляй никаких комментариев, рассуждений, подписей ( Translation, ПЕРЕВОД и тд.)
5. Если не можешь перевести (бессмысленный текст, уже на ${toLanguage}) → "${textFailedTranslate}"
6. Возвращай ТОЛЬКО ПЕРЕВЕДЕННЫЙ ТЕКСТ без подписей или "${textFailedTranslate}"

ТЕКСТ: "${input_text}"
`
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
    const instruction= message.isOperator ? createLLMTemplateTranslateOperator (message.fromLanguage, message.toLanguage, message.text) : createLLMTemplateTranslateUser(message.fromLanguage, message.toLanguage, message.text)
    const response = await commandGeneric(
        question,
        instruction
    )
    let translatedText = response.data.answer
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
    let result = true
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
