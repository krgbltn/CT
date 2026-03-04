const {
	maxBotToken: MAX_API_TOKEN,
	maxBotHost: MAX_BOT_HOST,
	host: HOST,
	customerId: CUSTOMER_ID,
	incomingAgent: INCOMING_AGENT,
	slots: SLOTS,
	webhook_events: WEBHOOK_EVENTS,
	button_text: TEXT_FOR_BUTTON_MESSAGE,
	useLegacy: USE_LEGACY,
	proxy: PROXY,
	disableLinkPreview: DISABLE_LINK_PREVIEW,
	incomingProcessor: INCOMING_PROCESSOR,
} = agentSettings;

const DELETION_MESSAGE_ATTACHMENT = "Вложение удалено";

function createFinishMessage() {
	return `Для старта бота нажмите "Начать"\n\n\`\`\`buttons\n::\n[Начать](type:action action:/start)\`\`\``
}

const METHOD_API = Object.freeze({
	POST: "post",
	PUT: "put",
	DELETE: "delete",
});

const ATTACHMENT_TYPES = Object.freeze({
	TEXT: "text",
	IMAGE: "image",
	VIDEO: "video",
	AUDIO: "audio",
	FILE: "file",
});

const MESSAGE_TYPES = Object.freeze({
	start: "start",
	send_message: "send_message",
});

const MESSAGE_TYPES_SEND_MESSAGE = Object.freeze({
	MESSAGE: 1,
	EDITED_BY_OPERATOR: 31,
	FINISH_DIALOG: 16,
	DELETED_BY_OPERATOR: 32
});

const ATTACHMENT_EXTENSION = Object.freeze({
	IMAGE: /\.(jpeg|jpg|gif|png)$/i,
	VIDEO: /\.(mp4|mov)$/i,
	AUDIO: /\.(mp3|wav)$/i,
});

const BUTTON_TYPES = Object.freeze({
	inline: "inline_keyboard",
	url: 0,
	link: "link",
	callback: "callback",
	message: "message",
});

const TEXT_FORMAT = Object.freeze({
	html: "html",
	markdown: "markdown",
});

const MAX_TEXT_LENGTH = 4000;
const markdownConverter = agentApi.createConverterMarkdown(
	agentApi.getPredefinedMarkdownRules().Empty,
);

const getHttpsAgent = () => {
	const baseAgent = new https.Agent({
		rejectUnauthorized: false,
		secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
	});

	if (!PROXY) {
		return baseAgent;
	}

	try {
		return new HttpsProxyAgent(`http://${PROXY.host}:${PROXY.port}`);
	} catch (error) {
		logger.warn(`Can't create HttpProxyAgent: ${error}`);
		return baseAgent;
	}
};

const httpsAgent = getHttpsAgent();

const isHttpsProxyAgentNowAvailable = httpsAgent instanceof https.Agent;

const proxyConfig =
	PROXY && isHttpsProxyAgentNowAvailable
		? {
			protocol: "http",
			host: PROXY.host,
			port: PROXY.port,
		}
		: undefined;

const AUTH_HEADERS = USE_LEGACY
	? {}
	: {
		Authorization: MAX_API_TOKEN,
	};

const AUTH_QUERY_STRING = USE_LEGACY ? `&access_token=${MAX_API_TOKEN}` : "";

function isErrorMessage(data) {
	return (
		data?.success === false &&
		(data?.message?.includes(
				"errors.process.attachment.file.not.processed",
			) ||
			data?.message?.includes(
				"errors.process.attachment.video.not.processed",
			) ||
			data?.message?.includes("EJB service unavailable"))
	);
}

function axiosCreateWithAttachmentRetry() {
	const api = axios.create({
		baseURL: MAX_BOT_HOST,
		timeout: 50000,
		httpsAgent,
		proxy: proxyConfig,
		headers: AUTH_HEADERS,
	});
	const retriesCount = 3;
	const retriesTimeout = 2000;
	axiosRetry(api, {
		retries: retriesCount,
		retryCondition: (error) => {
			logger.warn(`The reason for the repeat: ${error}`);
			const data = error.response?.data;
			if (data?.code === "attachment.not.ready") {
				return true;
			}
			return isErrorMessage(data);
		},
		validateResponse: (response) => {
			if (response.status === 200) {
				if (isErrorMessage(response.data)) {
					logger.warn(
						`Attachment not ready in 200 response. Retrying...`,
					);
					return false;
				}
			}
			if (response.status >= 400) {
				return false;
			}
			return true;
		},
		retryDelay: (retryCount) => {
			logger.warn(
				`Attachment not ready. Retry attempt ${retryCount} in ${retryCount * 2} seconds...`,
			);
			return retryCount * retriesTimeout;
		},
	});

	return api;
}

const createAttachment = (type, token) => ({ type, payload: { token } });

const createButton = (button) => [
	{
		type: BUTTON_TYPES.callback,
		text: button.caption,
		payload: button.payload,
	},
];

const createInlineButton = (btn) => {
	const button = btn[0];
	return button.type === BUTTON_TYPES.url
		? [{ type: BUTTON_TYPES.link, text: button.title, url: button.action }]
		: [
			{
				type: BUTTON_TYPES.callback,
				text: button.title,
				payload: button.action,
			},
		];
};

const getSlotValue = (slotId) =>
	message.data.slots.find((slot) => slot.id === slotId)?.value;

function fixEmptyMarkdownLink(_, fullUrl, filename) {
	return `[${filename}](${fullUrl})`;
}

// Удаляем блоки кнопок из текста
function removeButtonsFromText(text, complexAnswer) {
	const buttonPattern = /```buttons[\s\S]*?```/g; // Ищем блоки кнопок (с пометкой buttons)
	const buttonPattern2 = /::::[\s\S]*?(?=\n::::|\n```|$)/g; // Ищем блоки кнопок с ::::
	const internalArticlePattern = /buttons\n::\n.*?```/gi; // Ищем блоки вложенные статьи
	const imageHyperLinkPattern = /\[\]\((https?:\/\/[^\s)]+\/([^/\s)]+))\)/g; // Ищем ссылки на изображения

	let cleanedText = text
		.replace(buttonPattern, "") // удаляем кнопки
		.replace(internalArticlePattern, "") // удаляем вложенные статьи
		.replace(imageHyperLinkPattern, fixEmptyMarkdownLink) // чиним пустые ссылки
		.replace(/\\+/g, "") // удаляем экранирующие слеши
		.replace(/\n{2,}/g, (match) => "\n".repeat(match.length - 1)) // два и больше переносов схлопываем
		.replace(/(#{1,6} .+)\n+/g, "$1\n\n") // после заголовков уровня 1-6 оставляем пустую строку
		.trim();

	// Удаляем кнопки с :::: только если есть complexAnswer
	if (complexAnswer) {
		cleanedText = cleanedText.replace(buttonPattern2, "");
	}

	return cleanedText;
}

function addInlineButtonsFromText(attachments, inlineButtons) {
	if (inlineButtons.length) {
		attachments.push({
			type: BUTTON_TYPES.inline,
			payload: { buttons: inlineButtons.map(createInlineButton) },
		});
	}
}

function addActionButtons(attachments, actions) {
	attachments.push({
		type: BUTTON_TYPES.inline,
		payload: { buttons: actions.map(createButton) },
	});
}

async function addStickerAttachment(attachments, sticker) {
	const uploaded = await getUploadUrl(ATTACHMENT_TYPES.IMAGE);
	const token = await uploadToMax(
		sticker.sticker_url,
		ATTACHMENT_TYPES.IMAGE,
		uploaded.url,
		sticker.sticker_id,
	);
	attachments.push(createAttachment(ATTACHMENT_TYPES.IMAGE, token));
}

async function addMediaAttachments(attachments, files) {
	for (const file of files) {
		const messageType = detectMediaType(file.attachment_url);
		const uploaded = await getUploadUrl(messageType);
		const token = await uploadToMax(
			file.attachment_url,
			messageType,
			uploaded.url,
			file.attachment_name,
		);

		const baseAttachment = createAttachment(messageType, token);

		if (messageType === ATTACHMENT_TYPES.FILE) {
			baseAttachment.filename = file.attachment_name;
		} else if (
			[ATTACHMENT_TYPES.AUDIO, ATTACHMENT_TYPES.VIDEO].includes(
				messageType,
			)
		) {
			baseAttachment.payload.token = uploaded.token;
		}

		attachments.push(baseAttachment);
	}
}

async function getUploadUrl(type) {
	const url = `${MAX_BOT_HOST}/uploads?type=${type}${AUTH_QUERY_STRING}`;
	const { data } = await axios.post(
		url,
		{},
		{ httpsAgent, proxy: proxyConfig, headers: AUTH_HEADERS },
	);
	return data;
}

async function uploadToMax(url, type, uploadUrl, name) {
	const { data: stream } = await axios.get(url, {
		responseType: "stream",
		httpsAgent,
		proxy: proxyConfig,
		headers: AUTH_HEADERS,
	});
	const form = new FormData();
	form.append("data", stream, { filename: name });

	const { data } = await axios.post(uploadUrl, form, {
		headers: { ...form.getHeaders(), ...AUTH_HEADERS },
		httpsAgent,
		proxy: proxyConfig,
	});

	if (type === ATTACHMENT_TYPES.IMAGE && data.photos)
		return Object.values(data.photos)[0].token;
	if (type === ATTACHMENT_TYPES.FILE && data.token) return data.token;
	if ([ATTACHMENT_TYPES.AUDIO, ATTACHMENT_TYPES.VIDEO].includes(type))
		return true;
	if (type === ATTACHMENT_TYPES.STICKER && data.token) return data.token;
}

function detectMediaType(url) {
	if (ATTACHMENT_EXTENSION.IMAGE.test(url)) return ATTACHMENT_TYPES.IMAGE;
	if (ATTACHMENT_EXTENSION.VIDEO.test(url)) return ATTACHMENT_TYPES.VIDEO;
	if (ATTACHMENT_EXTENSION.AUDIO.test(url)) return ATTACHMENT_TYPES.FILE;
	return ATTACHMENT_TYPES.FILE;
}

function splitTextByLength(text, maxLength = MAX_TEXT_LENGTH) {
	const chunks = [];
	let start = 0;

	while (start < text.length) {
		if (start + maxLength >= text.length) {
			chunks.push(text.slice(start));
			break;
		}

		const end = start + maxLength;
		const lastNewline = text.lastIndexOf("\n", end);

		const splitPoint = lastNewline > start ? lastNewline : end;

		chunks.push(text.slice(start, splitPoint).trim());
		start = splitPoint + 1;
	}

	return chunks.filter((chunk) => chunk.length > 0);
}

function createMessage(text = "", attachments = [], format) {
	const messages = [];

	const textChunks = splitTextByLength(text);
	if (!attachments.length) {
		textChunks.forEach((chunk) => messages.push({ text: chunk, format }));
		return messages;
	}

	const inlineAttachments = attachments.filter(
		(a) => a.type === BUTTON_TYPES.inline,
	);
	const imageAttachments = attachments.filter(
		(a) => a.type === ATTACHMENT_TYPES.IMAGE,
	);
	const otherAttachments = attachments.filter(
		(a) =>
			a.type !== ATTACHMENT_TYPES.IMAGE && a.type !== BUTTON_TYPES.inline,
	);

	if (inlineAttachments.length) {
		const lastChunk = textChunks.pop() || "";
		textChunks.forEach((chunk) => messages.push({ text: chunk, format }));
		const combinedButtons = [];
		for (const attachment of inlineAttachments) {
			if (attachment.payload?.buttons) {
				combinedButtons.push(...attachment.payload.buttons);
			}
		}
		const combinedAttachment = {
			type: BUTTON_TYPES.inline,
			payload: {
				buttons: combinedButtons,
			},
		};
		messages.push({
			text: lastChunk || TEXT_FOR_BUTTON_MESSAGE,
			format,
			attachments: [combinedAttachment],
		});
	} else {
		textChunks.forEach((chunk) => messages.push({ text: chunk, format }));
	}

	if (imageAttachments.length) {
		messages.push({ text: "", format, attachments: imageAttachments });
	}

	for (const file of otherAttachments) {
		messages.push({ text: "", format, attachments: [file] });
	}

	return messages;
}

async function preprocessMessage(msg) {
	const attachments = [];

	const markdownAnswers = markdownConverter.Parse(msg.content.text);
	logger.info(`markdownAnswers ${JSON.stringify(markdownAnswers)}`);
	let text = removeButtonsFromText(msg.content.text);

	for (let markdownAnswer of markdownAnswers) {
		logger.info(`Create message from Markdown ${markdownAnswer.type}.`);
		switch (markdownAnswer.type) {
			case "TextAnswer":
				break;
			case "FileAnswer":
				break;
			case "ButtonsAnswer":
				addInlineButtonsFromText(
					attachments,
					markdownAnswer.buttonsAnswer?.buttons,
				);
				break;
			case "ComplexAnswer":
				text = removeButtonsFromText(msg.content.text, true);
				addInlineButtonsFromText(
					attachments,
					markdownAnswer.buttonsAnswer?.buttons,
				);
				break;
			default:
				logger.info(`Markdown ${markdownAnswer.type}. Skip.`);
				break;
		}
	}

	if (msg.content.actions?.length) {
		addActionButtons(attachments, msg.content.actions);
	}

	if (msg.content?.sticker) {
		await addStickerAttachment(attachments, msg.content.sticker);
	}

	if (msg.content.attachments?.length) {
		await addMediaAttachments(attachments, msg.content.attachments);
	}

	const format =
		msg.content.text_type === TEXT_FORMAT.html
			? TEXT_FORMAT.html
			: TEXT_FORMAT.markdown;
	return createMessage(text, attachments, format);
}

async function sendMessages(method, url, payload = {}) {
	try {
		const api = axiosCreateWithAttachmentRetry();
		logger.info(`payload: ${JSON.stringify(payload)}`);
		const { data } = await api[method](url, payload);
		logger.info(`MAX Message sent successfully: ${JSON.stringify(data)}`);
		return data;
	} catch (error) {
		logger.error(
			`Error sending MAX message: ${JSON.stringify(error.response?.data || error.message)}`,
		);
		throw new Error(
			`Error sending MAX message: ${JSON.stringify(error.response?.data || error.message)}`,
		);
	}
}

function createResponseForChannel(chatId, userId, messages, error = []) {
	return {
		data: {
			chat_id: chatId,
			user_id: userId,
			messages: messages,
		},
		errors: error,
	};
}

async function handleSendMessage(data) {
	logger.info(`Incoming data ${JSON.stringify(data)}`);
	const chatId = getSlotValue(SLOTS.maxChatId);
	const userId = getSlotValue(SLOTS.maxUserId);
	const replies = await preprocessMessage(data);
	const messages = [];
	const url = `/messages?user_id=${userId}&chat_id=${chatId}${AUTH_QUERY_STRING}&disable_link_preview=${DISABLE_LINK_PREVIEW}`;
	for (const reply of replies) {
		try {
			const responseData = await sendMessages(
				METHOD_API.POST,
				url,
				reply,
			);
			const infoMessages = {
				message_id: responseData?.message?.body?.mid,
				timestamp: responseData?.message?.timestamp,
			};
			messages.push(infoMessages);
		} catch (error) {
			logger.error(`Send message error: ${error}`);
			return createResponseForChannel(
				chatId,
				userId,
				[],
				[error.message],
			);
		}
	}
	return createResponseForChannel(chatId, userId, messages);
}

async function handleSendModifiedMessage(data) {
	logger.info(`Incoming modified data ${JSON.stringify(data)}`);
	const replies = await preprocessMessage(data);
	const chatId = getSlotValue(SLOTS.maxChatId);
	const userId = getSlotValue(SLOTS.maxUserId);
	const idMessages = JSON.parse(data.meta?.channel_message_ids);
	if (replies.length < idMessages.length) {
		const diff = idMessages.length - replies.length;
		replies.push(
			...Array(diff)
				.fill()
				.map(() => ({
					text: DELETION_MESSAGE_ATTACHMENT,
					format: TEXT_FORMAT.markdown,
					attachments: [],
				})),
		);
	}
	if (replies.length > idMessages.length) {
		if (
			replies.length - idMessages.length === 1 &&
			idMessages.length === 1
		) {
			const lastIndex = idMessages.length - 1;
			const extraElements = replies.slice(idMessages.length);

			const extraAttachments = extraElements.flatMap(
				(item) => item.attachments || [],
			);
			if (extraAttachments.length > 0) {
				replies[lastIndex].attachments = [
					...(replies[lastIndex].attachments || []),
					...extraAttachments,
				];
			}
		} else replies.length = idMessages.length;
	}
	for (const [index, reply] of replies.entries()) {
		try {
			const url = `/messages?message_id=${idMessages[index]}`;
			const isAttachmentsNotExist =
				!reply.attachments || reply.attachments.length === 0;
			if (
				reply.text &&
				reply.text !== DELETION_MESSAGE_ATTACHMENT &&
				isAttachmentsNotExist
			) {
				reply.attachments = null;
			}
			await sendMessages(METHOD_API.PUT, url, reply);
		} catch (error) {
			logger.error(`Send message Modified error: ${error}`);
			return createResponseForChannel(
				chatId,
				userId,
				[],
				[error.message],
			);
		}
	}
	return {};
}

async function handleDeletionMessage(data) {
	logger.info(`Incoming deletion data ${JSON.stringify(data)}`);
	const chatId = getSlotValue(SLOTS.maxChatId);
	const userId = getSlotValue(SLOTS.maxUserId);
	const idMessages = JSON.parse(data.meta?.channel_message_ids);
	for (const id of idMessages) {
		try {
			const url = `/messages?message_id=${id}`;
			await sendMessages(METHOD_API.DELETE, url);
		} catch (error) {
			logger.error(`Send message Modified error: ${error}`);
			return createResponseForChannel(
				chatId,
				userId,
				[],
				[error.message],
			);
		}
	}
	return {};
}

async function bindWebhook() {
	let INCOMING_WEBHOOK = INCOMING_PROCESSOR;
	logger.info(`INCOMING WEBHOOK ${INCOMING_WEBHOOK}`);
	if (!INCOMING_WEBHOOK)
		INCOMING_WEBHOOK = `${HOST}/workplace/${CUSTOMER_ID}/${INCOMING_AGENT}`;
	logger.info(`Start binding webhook ${INCOMING_WEBHOOK} for max.`);
	const url = `${MAX_BOT_HOST}/subscriptions?${AUTH_QUERY_STRING.slice(1)}`;
	const data = { url: INCOMING_WEBHOOK, update_types: WEBHOOK_EVENTS };

	try {
		await axios.post(url, data, {
			httpsAgent,
			proxy: proxyConfig,
			headers: AUTH_HEADERS,
		});
	} catch (error) {
		logger.error(
			`Failed bind webhooks from max. ${error}. Description ${error.response?.data?.description}`,
		);
	}
}

async function run() {
	let response = {};
	switch (message.type) {
		case MESSAGE_TYPES.send_message:
			switch (message.data.message_type) {
				case MESSAGE_TYPES_SEND_MESSAGE.MESSAGE:
					response = await handleSendMessage(message.data);
					logger.info(
						`Message sent successfully: ${JSON.stringify(response)}`,
					);
					break;
				case MESSAGE_TYPES_SEND_MESSAGE.FINISH_DIALOG:
					message.data.content.text = createFinishMessage()
					message.data.content.text_type = TEXT_FORMAT.markdown
					await handleSendMessage(message.data)
					break
				case MESSAGE_TYPES_SEND_MESSAGE.EDITED_BY_OPERATOR:
					response = await handleSendModifiedMessage(message.data);
					logger.info(
						`Message sent Modified successfully: ${JSON.stringify(response)}`,
					);
					break;
				case MESSAGE_TYPES_SEND_MESSAGE.DELETED_BY_OPERATOR:
					response = await handleDeletionMessage(message.data);
					logger.info(
						`Message sent Deletion successfully: ${JSON.stringify(response)}`,
					);
					break;
				default:
					logger.info(
						`Message type: ${message.data.message_type}. SKIP.`,
					);
			}
			break;
		case MESSAGE_TYPES.start:
			await bindWebhook();
			break;
		default:
			logger.info(`Another type: ${message.type}. SKIP.`);
	}
	return response;
}

run()
	.then((res) => resolve(res))
	.catch((er) => {
		logger.error(er);
		resolve({});
	});
