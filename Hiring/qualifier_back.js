const cityMapping = {
	"Другой город": "city_0",
	Москва: "city_1",
	"Санкт-Петербург": "city_2",
	Сочи: "city_3",
	Адлер: "city_3_1",
	Краснодар: "city_4",
	Тула: "city_5",
	Екатеринбург: "city_6",
	Казань: "city_7",
	"Нижний Новгород": "city_11",
	Калуга: "city_12",
	Тверь: "city_13",
	Новосибирск: "city_14",
	Уфа: "city_16",
	Томск: "city_17",
	Пермь: "city_18",
	Самара: "city_19",
	"Ростов-на-Дону": "city_20",
	Подольск: "city_42",
	Домодедово: "city_43",
	Чехов: "city_70",
	Ярославль: "city_243",
	Московский: "city_107",
	Серпухов: "city_57",
	Троицк: "city_153",
	Можайск: "city_238",
	"Орехово-Зуево": "city_61",
	Алматы: "city_247",
	Астана: "city_248",
};

const nationalityMapping = {
	РФ: "ru",
	Беларусь: "by",
	Казахстан: "kz",
	Киргизия: "kg",
	Армения: "am",
	Украина: "ua",
	ДРУГОЕ: "other",
};

const PROTECTED_URL = "https://api.ucar.pro/proteted/9d90f3a2-df78-4201-ae3d-af6a1a4e380d/leads";

// Список известных ID телеграм-каналов
const tgChannels = ["channel_14ab6e4", "channel_54c50e2", "channel_3b69d70"];
const maxChannels = ["integration_channel_max_hiring"];
const vkChannels = ["integration_vk_hiring_servispro"];

async function extlogger(txt, level = "info") {
	try {
		logger[level](txt);
		await axios.post("http://dev.ucar.pro:9880/http", {
			log: JSON.stringify({agent: "qualifier", log: txt}),
			level: level,
		});
	} catch (e) {
		logger.error(`external log error: ${e.message}`);
	}
}

async function set_crafttalk_url(message_id, amo_lead_id, utm = null) {
	let custom_fields_values = [{field_id: 453276, values: [{value: message_id}]}];
	if (utm) {
		custom_fields_values.push({field_id: 397519, values: [{value: utm}]});
	}
	try {
		await axios.put(`${PROTECTED_URL}/${amo_lead_id}`, {custom_fields_values});
	} catch (e) {
		await extlogger(`Ошибка обновления ссылки в Amo: ${e.message}`, "error");
	}
}

function getSlot(slotId, filled_slots) {
	return (filled_slots || []).find((slot) => slot.slot_id === slotId)?.value;
}

async function sendToGoogleScript(message) {
	const googleScriptUrl = "https://script.google.com/macros/s/AKfycbxmRUL08rYQ639YrWd3HuF18zkNDocb-YtTl4Y5jJ7xR107nKC19jdCl9TMnLhBAM25Yg/exec";
	try {
		await axios.post(googleScriptUrl, {message: JSON.stringify(message)});
	} catch (e) {
		await extlogger(`Google Script error: ${e.message}`, "error");
	}
}

async function run(message) {
	logger.info("=== QUALIFIER START ===");
	logger.info(message);

	const channelId = message.channel?.channel_id || "";
	const chatId = message.user?.channel_user_id || "";
	const isTg = tgChannels.includes(channelId);
	const isMax = maxChannels.includes(channelId);
	const isVk = vkChannels.includes(channelId);

	logger.info(`channelId: ${channelId}, chatId: ${chatId}, isTg: ${isTg}, isMax: ${isMax}, isVk: ${isVk}`);

	// Инициализируем базовые слоты, которые нужны ВСЕГДА (в т.ч. для ВК и МАКС)
	let newSlots = {
		channel_id: channelId,
		telegram_chat_id: chatId
	};
	let deepLinkingTokenEntry
	let deepLinkingToken
	// Безопасный поиск токена
	if (isTg) {
		deepLinkingTokenEntry = (message.context || []).find((entry) => entry[0] === "deep_linking:token");
		deepLinkingToken = deepLinkingTokenEntry ? deepLinkingTokenEntry[1] : null;
	}

	if (isMax || isVk) {
		deepLinkingToken = getSlot("deep_linking_token", message.slot_context?.filled_slots);
	}

	logger.info(`deepLinkingTokenEntry: ${JSON.stringify(deepLinkingTokenEntry)}`);
	logger.info(`deepLinkingToken: ${deepLinkingToken}`);

	await extlogger({token: deepLinkingTokenEntry, chat_id: chatId, channel_id: channelId});

	// 1. Если токен не найден (прямой вход в канал)
	if (!deepLinkingToken) {
		logger.info("BRANCH: No deep link token - direct channel entry");
		try {
			await sendToGoogleScript(message);

			// Ссылку на ТГ бота предлагаем ТОЛЬКО если мы в ТГ
			if (isTg || isMax || isVk) {
				let top_doer_bot_url = getSlot("top_doer_bot_url", message.slot_context?.filled_slots);
				if (!top_doer_bot_url) newSlots.top_doer_bot_url = "https://t.me/TopDoerBot";
			}
		} catch (e) {
			await extlogger(`Error in no-token block: ${e.message}`, "error");
		}
		logger.info("EXIT: redirecting to initialmsgagent (no token)");
		return [
			agentApi.makeTextReply("", undefined, undefined, newSlots),
			agentApi.makeTextReply("/switchredirect initialmsgagent"),
		];
	}

	// 2. Если токен есть (переход по ссылке)
	logger.info("BRANCH: Deep link token found - processing");
	try {
		const query = Object.fromEntries(deepLinkingToken.split("-").map((pair) => pair.split("=")));
		const cleanedToken = query.amo_lead_id;
		const utm = query.utm;

		logger.info(`Parsed token - amo_lead_id: ${cleanedToken}, utm: ${utm}`);

		newSlots.amo_lead_url = `https://ucarpro.amocrm.ru/leads/detail/${cleanedToken}`;

		if (isTg || isMax || isVk) {
			newSlots.top_doer_bot_url = `https://t.me/TopDoerBot?start=amo_lead_id=${cleanedToken}`;
		}

		logger.info(`amo_lead_url: ${newSlots.amo_lead_url}`);
		logger.info(`top_doer_bot_url: ${newSlots.top_doer_bot_url}`);

		// Обновления в AmoCRM
		await set_crafttalk_url(message.id, cleanedToken, utm).catch(() => {
		});
		await axios.put(`${PROTECTED_URL}/${cleanedToken}/events/on_crafttalk_dialog_updated`, {status_id: 50970108}).catch(() => {
		});

		// Получение данных лида
		let data;
		try {
			const resp = await axios.get(`${PROTECTED_URL}/${cleanedToken}?converted=true&cached=true`);
			data = resp.data;
			if (data) delete data.time_custom_fields;
			logger.info(`Amo data received: ${JSON.stringify(data)}`);
		} catch (e) {
			await extlogger(`Ошибка получения данных Amo: ${e.message}`, "error");
		}

		if (!data) {
			logger.info("No data from Amo");
			let welcomeMessage = "";
			if (!getSlot("flow", message.slot_context?.filled_slots)) {
				welcomeMessage = `Добро пожаловать!\n\nЭто чат с куратором — мы поможем Вам оформить документы, расскажем, как всё устроено, и доведем до первой смены`;
			}
			return [
				agentApi.makeTextReply(welcomeMessage, undefined, undefined, newSlots),
				agentApi.makeTextReply("/switchredirect initialmsgagent"),
			];
		}

		// Вопросы кандидата
		try {
			const qResp = await axios.get(`https://api.ucar.pro/protected/96f0c9b8-6961-48bf-ad6f-1508c6e78564/wa/bot/user-questions?amo_lead_id=${cleanedToken}`);
			if (qResp.data?.questions) {
				newSlots.candidate_questions = qResp.data.questions.map(q => q.question_text).join("\n");
				logger.info(`candidate_questions: ${newSlots.candidate_questions}`);
			}
		} catch (e) {
		}

		// Маппинг данных из AmoCRM в слоты
		if (data.contact_phone_number) newSlots.phone_numer = data.contact_phone_number;
		if (data.id) newSlots.amo_lead_url = "https://ucarpro.amocrm.ru/leads/detail/" + data.id;

		newSlots.name = data.contact_name || data.candidate_first_name || data.candidate_last_name || "";

		if (data.age) newSlots.age = data.age;
		if (data.role_BD) newSlots.role = data.role_BD;
		if (nationalityMapping[data.nationality]) newSlots.nationality = nationalityMapping[data.nationality];
		if (cityMapping[data.city]) newSlots.city = cityMapping[data.city];
		if (data.driving_experience) newSlots.driving_experience = data.driving_experience;
		if (utm) newSlots.utm = utm;

		logger.info(`Mapped slots - name: ${newSlots.name}, phone: ${newSlots.phone_numer}, age: ${newSlots.age}, role: ${newSlots.role}, city: ${newSlots.city}`);

		let welcomeMessage = "";
		if (!getSlot("flow", message.slot_context?.filled_slots)) {
			welcomeMessage = `Добро пожаловать!\n\nЭто чат с куратором — мы поможем Вам оформить документы, расскажем, как всё устроено, и доведем до первой смены`;
		}

		logger.info("EXIT: redirecting to initialmsgagent (with token)");
		return [
			agentApi.makeTextReply(welcomeMessage, undefined, undefined, newSlots),
			agentApi.makeTextReply("/switchredirect initialmsgagent"),
		];

	} catch (error) {
		await extlogger(`Критическая ошибка квалифаера: ${error.message}`, "error");
		logger.error(`Critical error: ${error.message}`);
		return [
			agentApi.makeTextReply("", undefined, undefined, newSlots),
			agentApi.makeTextReply("/switchredirect initialmsgagent")
		];
	}
}

run(message)
	.then((res) => resolve(res))
	.catch((e) => {
		logger.error(`Qualifier fatal error: ${e.message}`);
		resolve([agentApi.makeTextReply("/switchredirect initialmsgagent")]);
	});