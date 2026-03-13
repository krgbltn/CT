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
		channel_3b69d70: "test_queue_agent", // канал для тестирования
	};
	let default_queue_agent = "default_queue_agent";
	if (queues[channel_id]) {
		return queues[channel_id];
	}

	return default_queue_agent;
}

function getTelegramToken(channel_id) {
	let queues = {
		channel_14ab6e4: "1716146537:AAEvThFnumE8cP38xElMhA1i27uLlqqHlqc",
		channel_54c50e2: "6014912212:AAHeLd2KZaUl9y6b2g6XfMg1GhFoZ8bHEgs",
		channel_3b69d70: "6602601395:AAE2xi8wczUP4L8SQHfAXGh4X0WW4iiOTYA",
	};

	return queues[channel_id];
}

function getQueueId(channel_id) {
	let queues = {
		channel_14ab6e4: "c867f994-30b8-40f3-99b2-19451f27967c",
		channel_54c50e2: "8ee6c330-e953-446f-8440-aef0803e0ddf",
		channel_3b69d70: "297ae221-c37a-4821-8278-c6bfbf037574",
	};

	if (queues[channel_id]) {
		return queues[channel_id];
	}

	return "hiring_servispro_default";
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
				await extlogger({ chat_id: chatId }, "Имя пользователя не найдено");
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
		await extlogger(
			{ chat_id: chatId },
			`Ошибка при получении информации о чате: ${error.message}`,
		);
		return undefined;
	}
}

async function checkEvents(message, event) {
	logger.info(`Incoming event ${event}`);
	await extlogger(message, event);

	let chatId = message.user.channel_user_id;

	// operatorId нужен для сохранения в слот first_routing_operator и в финальном логировании
	let operatorId = "";
	try {
		operatorId = getSlot("routing_operator", message.slot_context.filled_slots);
		if (!operatorId) {
			operatorId = "";
		}
	} catch (e) {
		logger.error({
			chat_id: chatId,
			message: "routing_operator slot not found",
		});
		await extlogger({ chat_id: chatId }, "routing_operator slot not found");
	}

	let context = {};
	try {
		context = await agentStorage.omniUserStorage.getAll();
		context = context.operatorQueue;
		if (context && !operatorId) {
			operatorId = context.operatorId;
		}
	} catch (e) {
		logger.error({ chat_id: chatId, message: "get base operator error" });
		await extlogger({ chat_id: chatId }, "get base operator error");
	}

	let resolveMessage = [];
	switch (event) {
		case "UserFilledSlotsChanged":
			let amo_lead_url = getSlot(
				"amo_lead_url",
				message.slot_context.filled_slots,
			);
			let sign = message.user.channel_user_id;
			if (
				amo_lead_url &&
				amo_lead_url.indexOf("https://ucarpro.amocrm.ru/leads/detail/") != -1
			) {
				amo_lead_id = amo_lead_url.replace(
					"https://ucarpro.amocrm.ru/leads/detail/",
					"",
				);
				logger.info({ amo_lead_id, sign });
				let top_doer_bot_url = getSlot(
					"top_doer_bot_url",
					message.slot_context.filled_slots,
				);
				logger.info({ top_doer_bot_url, sign });
				let current_td_url =
					"https://t.me/TopDoerBot?start=amo_lead_id=" + amo_lead_id;
				logger.info({ current_td_url, sign });
				if (top_doer_bot_url != current_td_url) {
					return [
						agentApi.makeTextReply("", undefined, undefined, {
							top_doer_bot_url: current_td_url,
						}),
					];
				}
			}
		case "TaskRoutingFound":
			// Сохранения первого оператора в слот first_routing_operator

			if (operatorId && operatorId != "__SYSTEM__") {
				try {
					// Получаем firstRoutingOperator
					firstRoutingOperator = getSlot(
						"first_routing_operator",
						message.slot_context.filled_slots,
					);

					// Если не нашли firstRoutingOperator, используем operatorId
					if (!firstRoutingOperator) {
						firstRoutingOperator = operatorId;
					}

					// Получаем amo_lead_url
					amo_lead_url = getSlot(
						"amo_lead_url",
						message.slot_context.filled_slots,
					);

					// Проверяем, что amo_lead_url не пустой
					if (amo_lead_url) {
						lead_id = amo_lead_url.replace(
							"https://ucarpro.amocrm.ru/leads/detail/",
							"",
						);

						// Отправка PUT запроса на установку дефолтного оператора
						await axios.put(
							`${PROTECTED_URL}/leads/${lead_id}/events/on_crafttalk_dialog_updated`,
							{ email: firstRoutingOperator.replace("DEFAULT___", "") },
						);
					}
				} catch (e) {
					logger.error(`${message}, ${e.message}`);
					await extlogger(message, e.message);
				}

				return [
					agentApi.makeTextReply("", undefined, undefined, {
						first_routing_operator: firstRoutingOperator,
						routing_operator: null,
					}),
				];
			}
			break;
		case "DialogFinished":
			// Синк слотов крафта в амо
			try {
				// Получаем amo_lead_url
				const amo_lead_url = getSlot(
					"amo_lead_url",
					message.slot_context.filled_slots,
				);

				// Проверяем, что amo_lead_url не пустой
				if (amo_lead_url) {
					// Извлекаем lead_id из URL
					const lead_id = amo_lead_url.replace(
						"https://ucarpro.amocrm.ru/leads/detail/",
						"",
					);

					// Вызываем функцию для обновления полей в amoCRM
					await updateAmoCrmFields(message, lead_id);
				}
			} catch (e) {
				logger.error(`${message}, ${e.message}`);
				await extlogger(message, e.message);
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

				let filled_slots = {};

				let score = getSlot("ep_Score", message.slot_context.filled_slots);

				// Берём актуальные заполненные слоты из сценариев
				let filled_slots_user = {};
				message.user.slot_context.filled_slots.map((slot) => {
					if (slot.slot_id != "ep_Message") {
						filled_slots_user[slot.slot_id] = slot.value;
					}
				});

				let dialog_short_id = getSlot(
					"dialog_short_id",
					message.slot_context.filled_slots,
				);

				filled_slots = Object.assign(filled_slots, filled_slots_user, {
					score: score,
					skip_score: "true",
					dialog_short_id: dialog_short_id,
				});

				let status_new_dialog;
				try {
					status_new_dialog = await sendMessage(
						'/switchredirect aiassist2 intent_id="article-376abdad-22e7-4d77-98c1-7312c78007b8"',
						message,
						logger,
						filled_slots,
					);
				} catch (err) {
					logger.error({ on_score_received: err.message });
					await extlogger({ on_score_received: err.message });
					return [];
				}

				if (!status_new_dialog.Ok) {
					logger.error({
						on_score_received: "Not OK new dialog.",
						description: `Error: ${status_new_dialog.Errors[0]}`,
					});
					await extlogger({
						on_score_received: "Not OK new dialog.",
						description: `Error: ${status_new_dialog.Errors[0]}`,
					});
					return [];
				} else {
					logger.info("Success.");
					return [];
				}
			} else {
				logger.info({ on_score_received: "No dialog finished." });
				await extlogger({ on_score_received: "No dialog finished." });
				return [];
			}
		default:
			logger.info({
				chat_id: chatId,
				message: `default case: operatorId - ${operatorId} // event - ${event}`,
			});
			await extlogger(
				{ chat_id: chatId },
				`default case: operatorId - ${operatorId} // event - ${event}`,
			);
	}

	return resolveMessage;
}

async function main(message) {
	try {
		const event = getSlot(EVENT_SLOT_ID, message.slot_context.filled_slots);
		const resultMessage = await checkEvents(message, event);
		return resultMessage;
	} catch (error) {
		logger.error(`Error: ${error.message}`);
		await extlogger(`Error: ${error.message}`);
		throw error;
	}
}

async function getTgTag(message) {
	let tg_tag = "";

	try {
		tg_tag = getSlot("sys_username", message.slot_context.filled_slots);
		if (tg_tag) {
			return tg_tag;
		}
		tg_tag = getSlot("tg_tag", message.slot_context.filled_slots);
		let new_tg_tag = await getTelegramAccountLink(
			message.user.channel_user_id,
			message.channel.channel_id,
		);
		if (new_tg_tag != undefined) {
			tg_tag = new_tg_tag;
		}
		if (tg_tag == null) {
			tg_tag = "";
		}
	} catch (e) {
		logger.error(`${message}, ${e.message}`);
		await extlogger(message, e.message);
	}

	return tg_tag;
}

async function fillSlots(message) {
	logger.info(`${message}, "fillSlots"`);
	await extlogger(message, "fillSlots");
	const channel_id = message.channel.channel_id;
	let operatorId = "";
	let queueId = getQueueId(channel_id);
	let context = await agentStorage.omniUserStorage.getAll();
	try {
		if (context) {
			if (JSON.stringify(context) === "{}") {
				// если getAll пустой, то мы сделаем ключ с нужными пустыми переменными
				let emptyString = "";
				context.operatorQueue = {
					operatorId: emptyString,
					queueId: emptyString,
				};
			}
			logger.info(`Context4: ${JSON.stringify(context)}`);
		}

		if (context?.operatorQueue) {
			operatorId = context.operatorQueue.operatorId;
		}
	} catch (e) {
		logger.info(`${e.message}, "empty context handle error"`);
		await extlogger(e.message, "empty context handle error");
	}

	context = context.operatorQueue;
	const ragent = getQueueAgent(channel_id);

	let newSlots = {};
	newSlots.tg_tag = await getTgTag(message);

	firstRoutingOperator = getSlot(
		"first_routing_operator",
		message.slot_context.filled_slots,
	);

	try {
		if (context) {
			if (operatorId && operatorId != "__SYSTEM__") {
				if (!firstRoutingOperator) {
					newSlots.first_routing_operator = operatorId;
				}
			}
			if (queueId) {
				newSlots.routing_queue = queueId;
			}

			return [
				agentApi.makeTextReply("", undefined, undefined, newSlots),
				agentApi.makeTextReply(`/switchredirect ${ragent}`),
			];
		}
	} catch (e) {
		logger.error({ chat_id: chatId, err_message: e.message });
		await extlogger({ chat_id: chatId, err_message: e.message });
	}

	return [
		agentApi.makeTextReply("", undefined, undefined, newSlots),
		agentApi.makeTextReply(`/switchredirect ${ragent}`),
	];
}

// main function
if (message.message_type === 200) {
	logger.info(`Come message_type === 200`);
	main(message)
		.then((res) => {
			resolve(res);
		})
		.catch((e) => {
			logger.info(
				message,
				`Some error when run main func (200). ${JSON.stringify(e.message)}`,
			);
			resolve([]);
		});
} else if (message.message_type === 1) {
	logger.info(`Come message_type === 1`);
	fillSlots(message)
		.then((res) => resolve(res))
		.catch((e) => {
			logger.info(
				message,
				`Some error when run main func (1). ${JSON.stringify(e.message)}`,
			);
			resolve([
				agentApi.makeTextReply(
					`/switchredirect ${getQueueAgent(message.channel.channel_id)}`,
				),
			]);
		});
} else {
	logger.info(
		`Come ${message.message_type} ${message.message.text} type message`,
	);
	resolve([]);
}

async function updateAmoCrmFields(message, lead_id) {
	// Словари для замены значений
	const cityMapping = {
		city_1: "Москва",
		city_2: "Санкт-Петербург",
		city_3: "Сочи",
		city_3_1: "Адлер",
		city_4: "Краснодар",
		city_5: "Тула",
		city_6: "Екатеринбург",
		city_7: "Казань",
		city_11: "Нижний Новгород",
		city_12: "Калуга",
		city_13: "Тверь",
		city_14: "Новосибирск",
		city_16: "Уфа",
		city_17: "Томск",
		city_18: "Пермь",
		city_19: "Самара",
		city_20: "Ростов-на-Дону",
		city_42: "Подольск",
		city_43: "Домодедово",
		city_70: "Чехов",
		city_0: "Другой город",
		city_243: "Ярославль",
		city_107: "Московский",
		city_57: "Серпухов",
		city_153: "Троицк",
		city_238: "Можайск",
		city_61: "Орехово-Зуево",
		city_247: "Алматы",
		city_248: "Астана",
	};

	const nationalityMapping = {
		ru: "РФ",
		by: "Беларусь",
		kz: "Казахстан",
		kg: "Киргизия",
		am: "Армения",
		ua: "Украина",
		other: "Иное",
	};

	// Получаем слоты из CraftTalk
	const name = getSlot("name", message.slot_context.filled_slots); // только имя
	const age = getSlot("age", message.slot_context.filled_slots);
	let city = getSlot("city", message.slot_context.filled_slots);
	let nationality = getSlot("nationality", message.slot_context.filled_slots);
	const drivingExperience = getSlot(
		"driving_experience",
		message.slot_context.filled_slots,
	);
	const role = getSlot("role", message.slot_context.filled_slots);
	const tgTag = await getTgTag(message);

	// Преобразование города и национальности через словари
	if (city && cityMapping[city]) {
		city = cityMapping[city];
	}

	if (nationality && nationalityMapping[nationality]) {
		nationality = nationalityMapping[nationality];
	}

	// Формируем объект custom_fields_values для отправки в amoCRM, исключая пустые поля
	const customFieldsValues = [];

	if (age)
		customFieldsValues.push({ field_id: 433332, values: [{ value: age }] });
	if (city)
		customFieldsValues.push({ field_id: 433268, values: [{ value: city }] });
	if (drivingExperience)
		customFieldsValues.push({
			field_id: 433338,
			values: [{ value: drivingExperience }],
		});
	if (nationality)
		customFieldsValues.push({
			field_id: 433372,
			values: [{ value: nationality }],
		});
	if (role)
		customFieldsValues.push({ field_id: 433270, values: [{ value: role }] });
	if (tgTag)
		customFieldsValues.push({ field_id: 433396, values: [{ value: tgTag }] });

	// Формируем тело запроса
	const requestBody = {
		custom_fields_values: customFieldsValues,
	};

	// Если name не пустой, добавляем contact_name
	if (name) {
		requestBody.contact_name = name;
	}

	// Отправляем запросы параллельно
	try {
		await axios.put(
			`${PROTECTED_URL}/leads/${lead_id}/events/on_crafttalk_dialog_updated`,
			requestBody,
		);
	} catch (e) {
		logger.error("on_crafttalk_dialog_updated_error");
		logger.error({ error: e.message, customFieldsValues: customFieldsValues });
		await extlogger(
			{ error: e.message, customFieldsValues: customFieldsValues },
			"on_crafttalk_dialog_updated_error",
		);
	}
}
