async function getContext(question, replies) {
	replies.debugReply(JSON.stringify(question));
	let response;
	try {
		response = await axios.post(
			URL_CONTEXT_SEARCH,
			{
				text: question,
				customer_id: CUSTOMER_ID,
//                record_type: RECORD_TYPE,
				catalog_symbol_code: ["classifier-8f20dd02-5cbb-4739-8d18-dbcd3d96ae70"],
				output_format: "json-vikhr"
			}
		);
		logger.info("Response:" + response.data);
	} catch(e) {
		// Логика при ошибке запроса
		logger.info(`Error requesting context search: ${e}.`);
		replies.debugReply(`Error requesting context search: ${e}.`);
		_debugAxiosError(e, replies);
		throw e;
	}
	const full_context = response.data;
	if (MAX_CONTEXTS > -1) {
		Object.keys(full_context).forEach(key => {
			full_context[key] = full_context[key].slice(0, MAX_CONTEXTS);
		});
	}
	return full_context;
}