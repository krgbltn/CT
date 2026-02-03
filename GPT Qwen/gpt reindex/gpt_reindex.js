//gpt_reindex
const URL_REINDEX = new URL('/make_index', agentSettings.url_context_search_indexer || "http://contextsearch:8802").href;


async function main() {
	let response

	if (!message.message.text =="reindex") {
		return [agentApi.makeTextReply(`No command found. Send "reindex" to reindex.`)
		];
	}
	try {
		response = await axios.post(
			URL_REINDEX,
			{
				autodeploy: true,
				chunk_size: 2000,
				customer_id: ['umka', 'docs', 'pony'],
				format: {
					strategy: "last_headers",
					n_headers: 3,
					delimiter: " >>> ",
					add_title: false
				},
				do_index_messages: false,
				text_analyzer: "russian",
			}
		)
		logger.info(response.data)
	} catch(e) {
		// Логика при ошибке запроса
		logger.info(`Error requesting context search: ${e}.`);
		//throw e;
		return([
			agentApi.makeTextReply(
				`Error: ${JSON.stringify(e)}`
			),
		])
	}

	return([
		agentApi.makeTextReply(
			`Created a new index for context search: ${JSON.stringify(response.data)}`
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
			//logger.info(`Error: ${error}`)          resolve([agentApi.makeTextReply(JSON.stringify(error))])
			resolve([]) // SKIP
		})

} else {
	logger.info(`Message type: ${message.message_type}. Skip.`)
	resolve([]) // SKIP
}