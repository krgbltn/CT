const {
	url,
	method = "get",
	headers = {},
	authorizationToken,
	nextArticle,
	operatorArticle
} = agentSettings

const getSlotValueById = (slotId) => message.slot_context?.filled_slots?.find(slot => slot.slot_id === slotId)?.value

const classifier = () => getSlotValueById("classifier")

const nextArticleReply = (slots) => {
	const targetArticle = getSlotValueById("next_article") || nextArticle
	return agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${targetArticle}"`, undefined, undefined, slots)
}

const emptyResultSlots = () => ({
	network_organization_id: "",
	network_organization_message: "",
	network_organization_phone: "",
	request_text: ""
})

const operatorTransferReply = () =>
	agentApi.makeTextReply(`/switchredirect ${classifier()} intent_id="${operatorArticle}"`, undefined, undefined, emptyResultSlots())

const normalizePath = (path) => {
	if (path === undefined || path === null || path === "" || path === "$") {
		return []
	}

	return path
		.toString()
		.replace(/^\$\./, "")
		.replace(/\[(\d+)\]/g, ".$1")
		.replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
		.split(".")
		.map(part => part.trim())
		.filter(Boolean)
}

const getValueByPath = (data, path) => {
	return normalizePath(path).reduce((acc, key) => acc?.[key], data)
}

const getTemplateValue = (expression) => {
	const valuePath = expression.trim()

	if (valuePath.startsWith("message.")) {
		return getValueByPath(message, valuePath.substring("message.".length))
	}

	if (valuePath.startsWith("slots.")) {
		return getSlotValueById(valuePath.substring("slots.".length))
	}

	return valuePath
}

const renderTemplateString = (template) => {
	if (!template.includes("{{")) {
		return template
	}

	const templateParts = template.split(/\s+\|\|\s+/)

	for (const templatePart of templateParts) {
		const match = templatePart.match(/^\s*\{\{([\s\S]*?)}}\s*$/)

		if (match) {
			const value = getTemplateValue(match[1])
			if (value !== undefined && value !== null && value !== "") {
				return value
			}
			continue
		}

		let hasEmptyValue = false
		const renderedValue = templatePart.replace(/\{\{([\s\S]*?)}}/g, (_, expression) => {
			const value = getTemplateValue(expression)

			if (value === undefined || value === null || value === "") {
				hasEmptyValue = true
				return ""
			}

			return typeof value === "object" ? JSON.stringify(value) : value.toString()
		})

		if (!hasEmptyValue) {
			return renderedValue
		}
	}

	return ""
}

const isNonEmptyText = (value) => typeof value === "string" && value.trim() !== ""

const fillSlotsFromRequest = (data) => {
	if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.hasrequest !== "boolean") {
		throw new Error("Invalid disconnection report response or hasrequest")
	}

	const filledSlots = emptyResultSlots()

	// An existing request takes priority over organization and permission checks.
	if (data.hasrequest === true) {
		if (!isNonEmptyText(data.requesttext)) {
			throw new Error("Existing request has no requesttext")
		}

		return { ...filledSlots, network_organization_id: "4", request_text: data.requesttext }
	}

	const organizationData = data.network_organization_data
	const contacts = organizationData?.network_organization_contacts ?? []
	if (!Array.isArray(contacts)) {
		throw new Error("Invalid network organization contacts")
	}

	if (contacts.some(contact => contact?.networkorganizationid === "00000000-0000-0000-0000-000000000000")) {
		logger.info("Network organization is undefined: zero GUID returned")
		return { ...filledSlots, network_organization_id: "3" }
	}

	if (organizationData?.request_allowed === true) {
		return { ...filledSlots, network_organization_id: "1" }
	}

	if (organizationData?.request_allowed !== false) {
		throw new Error("Invalid network organization request_allowed")
	}

	const phoneContact = contacts.find(contact => contact?.contact_type === "Phone"
		&& isNonEmptyText(contact.contact) && isNonEmptyText(contact.message))
	if (!phoneContact) {
		throw new Error("Network organization has no phone contact with message")
	}

	return {
		...filledSlots,
		network_organization_id: "2",
		network_organization_message: phoneContact.message,
		network_organization_phone: phoneContact.contact
	}
}

const createRequestUrl = () => renderTemplateString(url)

const main = async () => {
	if (!isNonEmptyText(getSlotValueById("uid"))) {
		logger.error("uid slot is empty")
		return [operatorTransferReply()]
	}

	const requestUrl = createRequestUrl()

	try {
		const requestHeaders = authorizationToken
			? { ...headers, 'Authorization': authorizationToken }
			: headers
		const res = await axios({
			url: requestUrl,
			method,
			headers: requestHeaders,
			httpsAgent: new https.Agent({ rejectUnauthorized: false })
		})

		const responseData = res?.data

		const filledSlots = fillSlotsFromRequest(responseData)
		logger.info(`Network organization result: ${filledSlots.network_organization_id}`)

		return [nextArticleReply(filledSlots)]
	} catch (error) {
		logger.error({ stack: error.stack }, `Error when checking network organization: ${error}`)
		return [operatorTransferReply()]
	}
}

main()
	.then(res => resolve(res))
	.catch(error => {
		logger.error({ stack: error.stack }, `Error when execute main func. ${error}`)
		resolve([operatorTransferReply()])
	})
