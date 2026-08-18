const URL_LLM_SMALLTALK = new URL("/query", agentSettings.url_llm).href
const LLM_AUTH_TOKEN = agentSettings.llm_auth_token ?? ""
const LLM_TIMEOUT = agentSettings.llm_timeout ?? 60
const LLM_TEMPERATURE = agentSettings.llm_temperature ?? 0.0
const NO_THINK = agentSettings.no_think || ""

const createListLanguage = (languages) => {
    return languages.join(", ")
}

const createLLMLinguisticAnalyzer = (languages) => {
    return `Ты - лингвистический анализатор. Твоя задача - определить язык предоставленного текста.
    Игнорируй смайлики и специальные символы.
    Отвечай только названием (например ${languages}).    
    Не добавляй никаких пояснений или дополнительной информации. 
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

async function detectLanguage() {
    const listLanguages = createListLanguage(message.languages)
    const question = `Определи, на каком языке написан следующий текст. Ответь только названием (например ${listLanguages}).\n\nТекст\n`
        + message.text
    const response = await commandGeneric(question, createLLMLinguisticAnalyzer(listLanguages))
    const language = response.data.answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim() // Убирает тег размышления LLM
    const check = message.languages.some(value => value === language)
    if (check) {
        return language
    } else {
        return "Язык не входит в список разрешенных"
    }
}

async function main() {
    logger.info("message: " + JSON.stringify(message))
    const language = await detectLanguage()
    return {
        language: language
    }
}

main()
    .then((res) => {
        logger.info(JSON.stringify(res))
        resolve(res)
    })
    .catch((er) => {
            logger.error(JSON.stringify(er))
            resolve("Что-то пошло не так при определении языка")
        }
    )
