// @module core/http
// HTTP-клиент для LLM API
// Читает конфиг URL и таймаут из agentSettings

let PROXY = agentSettings.proxy ?? {USE_PROXY: false}
let REJECT_UNAUTHORIZED = agentSettings.api?.reject_unauthorized ?? true
if (!REJECT_UNAUTHORIZED) logger.warn('TLS certificate verification is disabled (reject_unauthorized=false)')
let AGENT = new https.Agent({ rejectUnauthorized: REJECT_UNAUTHORIZED })

let URL_LLM = new URL('/context_query', agentSettings.api?.url_llm).href
let URL_LLM_SMALLTALK = new URL('/query', agentSettings.api?.url_llm).href
let URL_LLM_REPHRASE = new URL('/rephrase', agentSettings.api?.url_llm).href
let URL_LLM_COMMIT_TOOL_RESPONSES = new URL('/tool_responses', agentSettings.api?.url_llm).href
let LLM_AUTH_TOKEN = agentSettings.api?.llm_auth_token
let LLM_SETTINGS_HTTP = agentSettings.llm_settings ?? {}
let LLM_TIMEOUT = LLM_SETTINGS_HTTP.timeout ?? 60


function _debugAxiosError(error, replies) {
    if (error.response) {
        replies.debugReply(JSON.stringify(error.response.data, null, 2))
        replies.debugReply(error.response.status)
        replies.debugReply(error.response.headers)
    } else if (error.request) {
        replies.debugReply(error.request)
    } else {
        replies.debugReply('Error', error.message)
    }
}


async function _callLLM(url, data, replies, extraErrorHandling = null) {
    try {
        logger.debug(`Call LLM`)
        const config = {
            timeout: LLM_TIMEOUT * 1000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_AUTH_TOKEN}`,
                'Connection': 'keep-alive',
            },
            httpsAgent: AGENT
        }

        if (PROXY.USE_PROXY) {
            config.proxy = {
                protocol: 'http',
                host: PROXY.url,
                port: PROXY.port
            }
        }

        const response = await axios.post(url, data, config)
        logger.debug(`Response from LLM: ${JSON.stringify(response.data)}`)
        return response.data
    } catch (e) {
        const errorMsg = `Error requesting LLM (POST ${url}): ${e}.`
        logger.error(errorMsg)
        replies.debugReply(errorMsg)
        _debugAxiosError(e, replies)
        if (extraErrorHandling) {
            extraErrorHandling(e)
        }
        throw e
    }
}
