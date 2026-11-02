async function run() {
	try {
		const CLOUD_DOMAIN = agentSettings.cloud_domain;

		const attachSlot = message.slot_context.filled_slots.find(
			slot => slot.slot_id === 'attach'
		);

		let links;
		// Получаем user_id из message
		const user_id = message?.user?.channel_user_id || "unknown";
		logger.info(`user_id = ${user_id}`);

		if (!attachSlot || !attachSlot.value) {
			links = "Файлов нет";
		} else {
			let attach = attachSlot.value;
			logger.info(`attach (raw) = ${JSON.stringify(attach)}`);

			// Если attach — строка JSON, парсим
			if (typeof attach === "string") {
				try {
					attach = JSON.parse(attach);
				} catch (e) {
					logger.info("Ошибка парсинга attach, оставляем как есть");
				}
			}

			// Если attach не массив — превращаем в массив из одного элемента
			if (!Array.isArray(attach)) {
				attach = [attach];
			}

			// Парсим каждый объект (если это строка) и добавляем домен
			const formatted = attach.map(item => {
				try {
					if (typeof item === "string") {
						item = JSON.parse(item);
					}

					if (item.attachment_url && !item.attachment_url.startsWith("http")) {
						item.attachment_url = `${CLOUD_DOMAIN}${item.attachment_url}`;
					}

					return item;
				} catch (e) {
					logger.info(`Ошибка парсинга вложения: ${e.message}`);
					return null;
				}
			}).filter(Boolean);

			links = formatted.length > 0
				? formatted.map(item => `${item.attachment_name}: ${item.attachment_url}`).join("\n")
				: "Файлов нет";
		}

		return resolve([
			agentApi.makeTextReply(
				"",
				undefined,
				undefined,
				{ attach_links: links, user_id_max: user_id }
			),
			agentApi.makeTextReply(
				`/switchredirect aiassist2 intent_id="article-f934ba08-08dc-4617-bb09-c7acaddba959"`
			),
		]);

	} catch (error) {
		logger.info(`Error: ${error.message}`);
		return resolve([
			agentApi.makeTextReply("Произошла ошибка при обработке вложений."),
			agentApi.makeTextReply(
				`/switchredirect aiassist2 intent_id="article-73590fa6-62c8-4a16-ac39-fc835753c5a9"`
			),
		]);
	}
}

run();