const URL_REINDEX = new URL('/make_index', agentSettings.url_context_search_indexer || "http://localhost:8802").href;
const INTENT_INDEX = agentSettings.intent_index;

async function main() {
    let response

    if (message.message.text != "reindex") {
        return [];
    }

    try {
        response = await axios.post(
            URL_REINDEX,
            {
                source_index: INTENT_INDEX,
                autodeploy: true,
                chunk_size: 500,
                customer_id: ['ida'],
                format: {
                  strategy: "last_headers",
                  n_headers: 3,
                  delimiter: " >>> ",
                  add_title: true
                  },
                catalog_index: agentSettings.catalog_index
            }
        )
        logger.info(response.data)
    } catch(e) {
        // Логика при ошибке запроса
        logger.info(`Error requesting context search: ${e}.`);
        throw e;
    }

    return([
            agentApi.makeTextReply(
                `Created a new index for context search: ${response.data.created}`
            ),
        ])
}

if (message.message_type === 1) {
    logger.info(`Reindex started.`)
    main()
        .then(res => {
            resolve(res)
        })
        .catch(error => {
            logger.info(`Error: ${error}`)
            resolve([])
        })

} else {
    logger.info(`Message type: ${message.message_type}. Skip.`)
    resolve([]) // SKIP
}
