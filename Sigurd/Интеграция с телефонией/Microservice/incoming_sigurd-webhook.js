const {
    incoming_api: INCOMING_API = `http://opbot-channels:8082/webhooks/integration_channel/channel_35328b3`, //пример
    authorization_token_incoming: AUTHORIZATION_TOKEN_INCOMING = ""
} = agentSettings

const getHeaders = () => ({
    'Authorization': AUTHORIZATION_TOKEN_INCOMING,
    'Content-Type': 'application/json'
})

const sendMessage = async (body) => {

    try {
        await axios.post(INCOMING_API, body, {headers: getHeaders()})
    } catch (error) {
        logger.error(`Error when sending request to ${INCOMING_API}: ${error}`)
    }
    return {}
}


const main = async () => {
    logger.info({"Incoming message": message})
    await sendMessage(message)
}

main()
    .then(response => {
        logger.info({response})
        resolve(response)
    })
    .catch(err => {
        logger.error(err)
        resolve({})
    })
