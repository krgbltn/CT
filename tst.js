const INFORMED_CONSENT_PREFIX = "informedConsent"

logger.info(`start`);

const SLOT_TYPES = {
	isGreeting: `GREETING`,
	isNoAnswer: `NO_ANSWER`
}

// prod
const SLOT_REDIRECT = {
	isGreeting: `/switchredirect aiassist2 intent_id="article-3f4371e8-6621-4300-ae3d-d8f65afb2b1d"`,
	isNoAnswer: `/switchredirect aiassist2 intent_id="article-656969d7-e4c5-43d7-8587-0133d7798b13"`,
	isNoIDS: `/switchredirect aiassist2 intent_id="article-b29155ec-3514-4b45-84be-014ee1fb2ad6"`
}

// Функция для получения списка ИДС из глобального хранилища для пользователя omni_user_id
async function getInformedConsentList() {
	logger.info(`user_id ${message.user.omni_user_id}`);
	if (!message.user.omni_user_id) {
		logger.error(`Undefined field 'user' in 'omni_user_id'`);
	}

	let query = {
		"bool": {
			"must": [
				{
					"keyword_fields.type": {
						"term": {
							"value": INFORMED_CONSENT_PREFIX
						}
					}
				},
				{
					"keyword_fields.omni_user_id": {
						"term": {
							"value": message.user.omni_user_id
						}
					}
				}
			]
		}
	};

	let result = await agentApi.searchAll(agentStorage.globalStorage, query);
	logger.info(`Success getInformedConsentList. Result: ${JSON.stringify(result)}`);
	return result;
}

// Функция для проверки наличия активного ИДС у пользователя (ИДС находится в текущих)
async function checkActiveInformedConsent() {
	let consentList = await getInformedConsentList();
	logger.info(`Success getInformedConsentList. Result2: ${JSON.stringify(consentList)}`);
	let firstIdsCurrentAssignments = consentList.find(item => item.Status === 0);
	return !!firstIdsCurrentAssignments;
}

// Функция для вывода результата работы агента в чат
// has_consent - слот на проекте, куда записывается true, если есть хотя бы 1 активный ИДС и false, если ИДС еще не существует или все существующие ИДС не активны.
async function resultCheckInformedConsent(redirect) {
	let confirmation = await checkActiveInformedConsent()
	logger.info(`result assigment: ${JSON.stringify(confirmation)}`)
	if (!confirmation) {
		logger.info(`redirect: ${SLOT_REDIRECT.isNoIDS}`)
		return [
			agentApi.makeTextReply(
				SLOT_REDIRECT.isNoIDS,
				undefined,
				undefined,
				{has_consent: `${confirmation}`},
			),
		]
	} else {
		logger.info(`redirect: ${redirect}`)
		return [
			agentApi.makeTextReply(
				redirect,
				undefined,
				undefined,
				{has_consent: `${confirmation}`},
			),
		]
	}
}

async function run() {
	let actionType = message.slot_context.filled_slots.find(
		(slot) => slot.slot_id == 'type_slot'
	);
	if (actionType) {
		actionType = actionType.value
	}
	logger.info(`Current action type2: ${JSON.stringify(actionType)}`)
	let redirect = SLOT_REDIRECT.isNoIDS

	switch (actionType) {
		case SLOT_TYPES.isGreeting:
			redirect = SLOT_REDIRECT.isGreeting
			break;
		case SLOT_TYPES.isNoAnswer:
			redirect = SLOT_REDIRECT.isNoAnswer
			break;
	}
	logger.info(`redirect: ${JSON.stringify(redirect)}`)
	return await resultCheckInformedConsent(redirect);
}

run()
	.then(res => {
		logger.info(`res: ${JSON.stringify(res)}`)
		resolve(res)
	})
	.catch(err => {
		logger.info(`Error when run main: ${err}`)
	})