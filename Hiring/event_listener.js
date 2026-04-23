const EVENT_SLOT_ID = "domain_event_type";
const TELEGRAM_API_URL = "https://api.telegram.org/bot";
const PROTECTED_URL =
	"http://api.ucar.pro/proteted/9d90f3a2-df78-4201-ae3d-af6a1a4e380d";

function getSlot(slotId, filled_slots) {
	return filled_slots.find((slot) => slot.slot_id === slotId)?.value;
}

function getContextSlot(key, context) {
	return context.find((slot) => slot[0] === key)?.[1];
}

function getQueueAgent(channel_id) {
	let queues = {
		channel_14ab6e4: "routingagent", // канал Каршеринга
		channel_54c50e2: "kikshagent", // канал Кикшеринга
		integration_channel_max_hiring: "kikshagent", // канал Кикшеринга (НОВЫЙ)
		integration_vk_hiring_servispro: "kikshagent", // канал Кикшеринга (НОВЫЙ)
		channel_3b69d70: "test_queue_agent", // канал для тестирования
	};
	let default_queue_agent = "default_queue_agent";
	return queues[channel_id] || default_queue_agent;
}

function getTelegramToken(channel_id) {
	let tokens = {
		channel_14ab6e4: "1716146537:AAEvThFnumE8cP38xElMhA1i27uLlqqHlqc",
		channel_54c50e2: "6014912212:AAHeLd2KZaUl9y6b2g6XfMg1GhFoZ8bHEgs",
		channel_3b69d70: "6602601395:AAE2xi8wczUP4L8SQHfAXGh4X0WW4iiOTYA",
	};

	return tokens[channel_id];
}

function getQueueId(channel_id) {
	let queues = {
		channel_14ab6e4: "c867f994-30b8-40f3-99b2-19451f27967c",
		channel_54c50e2: "8ee6c330-e953-446f-8440-aef0803e0ddf",
		integration_channel_max_hiring: "8ee6c330-e953-446f-8440-aef0803e0ddf",
		integration_vk_hiring_servispro: "8ee6c330-e953-446f-8440-aef0803e0ddf",
		channel_3b69d70: "297ae221-c37a-4821-8278-c6bfbf037574",
	};

	return queues[channel_id] || "hiring_servispro_default";
}

async function extlogger(txt, note = null) {
	try {
		logger.info(
			JSON.stringify({ agent: "event_listener", log: txt, note: note }),
		);
		await axios.post("http://dev.ucar.pro:9880/http", {
			log: JSON.stringify({ agent: "event_listener", note: note, log: txt }),
			level: "info",
		});
	} catch (e) {
		logger.error(`external logger error ${e.message}`);
	}
}

async function sendMessage(text, message, logger, slots = {}) {
	const sendMessageRequest = {
		MessageMarkdown: text,
		SendMessageParams: {
			ProjectId: message.user.customer_id || message.channel.customer_id,
			OmniUserId: message.user.omni_user_id,
			Sender: { operator_id: "__SYSTEM__" },
			FilledSlots: slots,
		},
	};

	return await agentApi.sendMessage(sendMessageRequest, logger);
}

async function getTelegramAccountLink(chatId, channel_id) {
	try {
		const token = getTelegramToken(channel_id);
		// ЗАЩИТА: Если токена нет, это не Телеграм канал, выходим сразу
		if (!token) {
			return null;
		}

		const response = await axios.get(`${TELEGRAM_API_URL}${token}/getChat`, {
			params: { chat_id: chatId },
		});

		if (response.data.ok) {
			const chat = response.data.result;
			if (chat.username) {
				const link = `@${chat.username}`;
				logger.info({ chat_id: chatId, message: `Ссылка на аккаунт: ${link}` });
				await extlogger({ chat_id: chatId }, `Ссылка на аккаунт: ${link}`);
				return link;
			} else {
				logger.info({
					chat_id: chatId,
					message: "Имя пользователя не найдено",
				});
				return null;
			}
		} else {
			throw new Error("Не удалось получить информацию о чате");
		}
	} catch (error) {
		logger.error({
			chat_id: chatId,
			message: `Ошибка при получении информации о чате: ${error.message}`,
		});
		return undefined;
	}
}

async function checkEvents(message, event) {
	logger.info(`Incoming event ${event}`);
	await extlogger(message, event);

	let chatId = message.user.channel_user_id;
	let operatorId = "";

	try {
		operatorId = getSlot("routing_operator", message.slot_context.filled_slots) || "";
	} catch (e) {
		logger.error({ chat_id: chatId, message: "routing_operator slot not found" });
	}

	let context = {};
	try {
		const storageData = await agentStorage.omniUserStorage.getAll();
		context = storageData.operatorQueue;
		if (context && !operatorId) {
			operatorId = context.operatorId;
		}
	} catch (e) {
		logger.error({ chat_id: chatId, message: "get base operator error" });
	}

	let resolveMessage = [];
	switch (event) {
		case "UserFilledSlotsChanged":
			let amo_lead_url = getSlot("amo_lead_url", message.slot_context.filled_slots);
			let sign = message.user.channel_user_id;
			if (amo_lead_url && amo_lead_url.includes("https://ucarpro.amocrm.ru/leads/detail/")) {
				let amo_lead_id = amo_lead_url.replace("https://ucarpro.amocrm.ru/leads/detail/", "");
				let top_doer_bot_url = getSlot("top_doer_bot_url", message.slot_context.filled_slots);
				let current_td_url = "https://t.me/TopDoerBot?start=amo_lead_id=" + amo_lead_id;

				// Обновляем ссылку, даже если это не ТГ канал (если логика Амо этого требует)
				if (top_doer_bot_url != current_td_url) {
					return [
						agentApi.makeTextReply("", undefined, undefined, {
							top_doer_bot_url: current_td_url,
						}),
					];
				}
			}
			break;

		case "TaskRoutingFound":
			if (operatorId && operatorId != "__SYSTEM__") {
				try {
					let firstRoutingOperator = getSlot("first_routing_operator", message.slot_context.filled_slots) || operatorId;
					let amo_lead_url = getSlot("amo_lead_url", message.slot_context.filled_slots);

					if (amo_lead_url) {
						let lead_id = amo_lead_url.replace("https://ucarpro.amocrm.ru/leads/detail/", "");
						await axios.put(
							`${PROTECTED_URL}/leads/${lead_id}/events/on_crafttalk_dialog_updated`,
							{ email: firstRoutingOperator.replace("DEFAULT___", "") },
						);
					}

					return [
						agentApi.makeTextReply("", undefined, undefined, {
							first_routing_operator: firstRoutingOperator,
							routing_operator: null,
						}),
					];
				} catch (e) {
					logger.error(`${message}, ${e.message}`);
				}
			}
			break;

		case "DialogFinished":
			try {
				const amo_lead_url = getSlot("amo_lead_url", message.slot_context.filled_slots);
				if (amo_lead_url) {
					const lead_id = amo_lead_url.replace("https://ucarpro.amocrm.ru/leads/detail/", "");
					await updateAmoCrmFields(message, lead_id);
				}
			} catch (e) {
				logger.error(`${message}, ${e.message}`);
			}

			await agentStorage.omniUserStorage.set("FINISH_DIALOG", true);
			await agentStorage.omniUserStorage.del("operatorQueue");
			return [
				agentApi.makeTextReply("", undefined, undefined, {
					routing_operator: null,
				}),
			];

		case "DialogScoreReceived":
			if (await agentStorage.omniUserStorage.get("FINISH_DIALOG")) {
				await agentStorage.omniUserStorage.del("FINISH_DIALOG");
				let score = getSlot("ep_Score", message.slot_context.filled_slots);
				let filled_slots_user = {};
				message.user.slot_context.filled_slots.forEach((slot) => {
					if (slot.slot_id != "ep_Message") {
						filled_slots_user[slot.slot_id] = slot.value;
					}
				});

				let dialog_short_id = getSlot("dialog_short_id", message.slot_context.filled_slots);
				let filled_slots = Object.assign({}, filled_slots_user, {
					score: score,
					skip_score: "true",
					dialog_short_id: dialog_short_id,
				});

				try {
					let status_new_dialog = await sendMessage(
						'/switchredirect aiassist2 intent_id="article-376abdad-22e7-4d77-98c1-7312c78007b8"',
						message,
						logger,
						filled_slots,
					);
					if (!status_new_dialog.Ok) throw new Error(status_new_dialog.Errors[0]);
				} catch (err) {
					logger.error({ on_score_received: err.message });
					return [];
				}
			}
			return [];

		default:
			logger.info({
				chat_id: chatId,
				message: `default case: operatorId - ${operatorId} // event - ${event}`,
			});
	}

	return resolveMessage;
}

async function main(message) {
	try {
		const event = getSlot(EVENT_SLOT_ID, message.slot_context.filled_slots);
		return await checkEvents(message, event);
	} catch (error) {
		logger.error(`Error: ${error.message}`);
		throw error;
	}
}

async function getTgTag(message) {
	let tg_tag = "";
	try {
		tg_tag = getSlot("sys_username", message.slot_context.filled_slots);
		if (tg_tag) return tg_tag;

		tg_tag = getSlot("tg_tag", message.slot_context.filled_slots);

		// ЗАЩИТА: проверяем, есть ли смысл вообще лезть за ссылкой в Телеграм
		const token = getTelegramToken(message.channel.channel_id);
		if (token) {
			let new_tg_tag = await getTelegramAccountLink(
				message.user.channel_user_id,
				message.channel.channel_id,
			);
			if (new_tg_tag !== undefined) {
				tg_tag = new_tg_tag;
			}
		}

		if (tg_tag == null) tg_tag = "";
	} catch (e) {
		logger.error(`${message}, ${e.message}`);
	}
	return tg_tag;
}

async function fillSlots(message) {
	const channel_id = message.channel.channel_id;
	let operatorId = "";
	let queueId = getSlot("routing_queue", message.slot_context.filled_slots) || getQueueId(channel_id);
	let contextData = await agentStorage.omniUserStorage.getAll();

	if (contextData && JSON.stringify(contextData) === "{}") {
		contextData.operatorQueue = { operatorId: "", queueId: "" };
	}

	let context = contextData?.operatorQueue;
	operatorId = context?.operatorId || "";

	const ragent = getQueueAgent(channel_id);
	let newSlots = {};
	newSlots.tg_tag = await getTgTag(message);

	let firstRoutingOperator = getSlot("first_routing_operator", message.slot_context.filled_slots);

	if (context) {
		if (operatorId && operatorId != "__SYSTEM__" && !firstRoutingOperator) {
			newSlots.first_routing_operator = operatorId;
		}
		if (queueId) {
			newSlots.routing_queue = queueId;
		}
	}

	return [
		agentApi.makeTextReply("", undefined, undefined, newSlots),
		agentApi.makeTextReply(`/switchredirect ${ragent}`),
	];
}

// Entry Point
if (message.message_type === 200) {
	main(message).then(res => resolve(res)).catch(e => resolve([]));
} else if (message.message_type === 1) {
	fillSlots(message).then(res => resolve(res)).catch(e => {
		resolve([agentApi.makeTextReply(`/switchredirect ${getQueueAgent(message.channel.channel_id)}`)]);
	});
} else {
	resolve([]);
}

async function updateAmoCrmFields(message, lead_id) {
	const cityMapping = {
		city_1: "Москва", city_2: "Санкт-Петербург", city_3: "Сочи", city_3_1: "Адлер",
		city_4: "Краснодар", city_5: "Тула", city_6: "Екатеринбург", city_7: "Казань",
		city_11: "Нижний Новгород", city_12: "Калуга", city_13: "Тверь", city_14: "Новосибирск",
		city_16: "Уфа", city_17: "Томск", city_18: "Пермь", city_19: "Самара",
		city_20: "Ростов-на-Дону", city_42: "Подольск", city_43: "Домодедово", city_70: "Чехов",
		city_0: "Другой город", city_243: "Ярославль", city_107: "Московский", city_57: "Серпухов",
		city_153: "Троицк", city_238: "Можайск", city_61: "Орехово-Зуево", city_247: "Алматы", city_248: "Астана"
	};

	const nationalityMapping = {
		ru: "РФ", by: "Беларусь", kz: "Казахстан", kg: "Киргизия", am: "Армения", ua: "Украина", other: "Иное"
	};

	const name = getSlot("name", message.slot_context.filled_slots);
	const age = getSlot("age", message.slot_context.filled_slots);
	let city = getSlot("city", message.slot_context.filled_slots);
	let nationality = getSlot("nationality", message.slot_context.filled_slots);
	const drivingExperience = getSlot("driving_experience", message.slot_context.filled_slots);
	const role = getSlot("role", message.slot_context.filled_slots);
	const tgTag = await getTgTag(message);

	if (city && cityMapping[city]) city = cityMapping[city];
	if (nationality && nationalityMapping[nationality]) nationality = nationalityMapping[nationality];

	const customFieldsValues = [];
	if (age) customFieldsValues.push({ field_id: 433332, values: [{ value: age }] });
	if (city) customFieldsValues.push({ field_id: 433268, values: [{ value: city }] });
	if (drivingExperience) customFieldsValues.push({ field_id: 433338, values: [{ value: drivingExperience }] });
	if (nationality) customFieldsValues.push({ field_id: 433372, values: [{ value: nationality }] });
	if (role) customFieldsValues.push({ field_id: 433270, values: [{ value: role }] });
	if (tgTag) customFieldsValues.push({ field_id: 433396, values: [{ value: tgTag }] });

	const requestBody = { custom_fields_values: customFieldsValues };
	if (name) requestBody.contact_name = name;

	try {
		await axios.put(`${PROTECTED_URL}/leads/${lead_id}/events/on_crafttalk_dialog_updated`, requestBody);
	} catch (e) {
		logger.error({ error: e.message, customFieldsValues });
	}
}