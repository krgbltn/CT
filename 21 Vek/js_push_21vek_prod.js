const API_URL = agentSettings.push_api_url;
const ATTEMPT_TIMEOUT_MS = agentSettings.timeout_ms ?? 3000;
const TOTAL_TIMEOUT_MS = agentSettings.total_timeout_ms ?? 8000;
const MIN_ATTEMPT_MS = agentSettings.min_attempts_ms;
const MAX_ATTEMPTS = agentSettings.max_attempts
const OPERATOR_MESSAGE_TYPE = 1;

const isRetryable = (err) => !err.response || err.response.status >= 500;

async function send(payload) {
	const deadline = Date.now() + TOTAL_TIMEOUT_MS;
	const headers = { 'Content-Type': 'application/json' };

	for (let attempt = 1; ; attempt++) {
		const timeout = Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now());

		try {
			return await axios.post(API_URL, payload, { timeout, headers });
		} catch (err) {
			const canRetry =
				isRetryable(err) && attempt < MAX_ATTEMPTS && deadline - Date.now() >= MIN_ATTEMPT_MS;

			logger.warn(
				`push forward attempt ${attempt} failed: messageId=${payload.messageId}, ` +
				`status=${err.response?.status ?? err.code}, retry=${canRetry}`,
			);

			if (!canRetry) {
				throw err;
			}
		}
	}
}

async function run() {
	const { user = {}, message: msg = {} } = message;

	if (msg.message_type !== OPERATOR_MESSAGE_TYPE) {
		logger.info(`push skipped: messageId=${msg.id}, message_type=${msg.message_type}`);

		return true;
	}

	const payload = {
		userId: Number(user.uuid),
		channelId: msg.meta?.channel_id,
		messageId: msg.id,
		timestamp: Math.floor(msg.timestamp / 1000),
		type: String(msg.message_type),
	};

	const res = await send(payload);

	logger.info(`push forwarded: messageId=${msg.id} -> ${res.status}`);

	return true;
}

run()
	.then((ok) => resolve(ok))
	.catch((err) => {
		logger.error(`push forward failed: ${err}. Stack: ${err.stack}`);
		resolve(false);
	});