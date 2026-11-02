const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../check_network_organization.js'), 'utf8')
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../check_network_organization_settings.json'), 'utf8'))
const zeroGuid = '00000000-0000-0000-0000-000000000000'
const phone = { contact_type: 'Phone', contact: '<phone>', message: 'Просьба обратиться в контакт-центр <organization>' }
const emptySlots = {
	network_organization_id: '', network_organization_message: '', network_organization_phone: '', request_text: ''
}
const report = (allowed, contacts = []) => ({
	hasrequest: false,
	network_organization_data: { request_allowed: allowed, network_organization_contacts: contacts }
})

// Every platform global is mocked. No live requests or real authorization are used.
const run = async (data, { missingUid = false, httpError = false, nextArticle = 'slot-next' } = {}) => {
	const requests = []
	const logs = []
	let resolveResult
	const result = new Promise(resolve => { resolveResult = resolve })
	const slots = { ...emptySlots, network_organization_id: 'old-id', request_text: 'old text',
		network_organization_phone: 'old phone', network_organization_message: 'old message',
		classifier: 'test-classifier', next_article: nextArticle }
	if (!missingUid) slots.uid = 'test-uid'
	vm.runInNewContext(source, {
		agentSettings: { ...settings, url: 'https://example.invalid/{{slots.uid}}/disconnection_report_info',
			authorizationToken: 'Basic <test-key>', nextArticle: 'settings-next', operatorArticle: 'operator' },
		message: { message_type: 1, slot_context: { filled_slots: Object.entries(slots).map(([slot_id, value]) => ({ slot_id, value })) } },
		agentApi: { makeTextReply: (text, attachment, actions, filledSlots) => ({ text, slots: filledSlots }) },
		logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
		https: { Agent: class {} },
		axios: async request => {
			requests.push(request)
			if (httpError) throw new Error('Mock HTTP failure')
			return { status: 200, data }
		},
		resolve: resolveResult
	}, { timeout: 1000 })
	const replies = await result
	assert.equal(replies.length, 1)
	return { reply: JSON.parse(JSON.stringify(replies[0])), requests, logs }
}

test('allowed request with no contacts: branch 1, old output slots cleared, configured HTTP headers', async () => {
	const { reply, requests } = await run(report(true))
	assert.deepEqual(reply.slots, { ...emptySlots, network_organization_id: '1' })
	assert.equal(reply.text, '/switchredirect test-classifier intent_id="slot-next"')
	assert.equal(requests.length, 1)
	assert.equal(requests[0].method, 'get')
	assert.equal(requests[0].url, 'https://example.invalid/test-uid/disconnection_report_info')
	assert.equal(requests[0].headers.Host, 'api.enplus.ru')
	assert.equal(requests[0].headers.Authorization, 'Basic <test-key>')
	assert.ok(settings.url.endsWith('/{{slots.uid}}/disconnection_report_info'))
	assert.equal(settings.slotsMapping, undefined)
})

test('denied request: branch 2 selects Phone after social contacts and uses response message', async () => {
	const { reply } = await run(report(false, [{ contact_type: 'Telegram', contact: '<link>' }, phone]))
	assert.deepEqual(reply.slots, { ...emptySlots, network_organization_id: '2',
		network_organization_message: phone.message, network_organization_phone: phone.contact })
})

test('phone selection skips incomplete entries', async () => {
	const { reply } = await run(report(false, [{ contact_type: 'Phone', contact: '' }, phone]))
	assert.equal(reply.slots.network_organization_phone, phone.contact)
})

for (const allowed of [true, false, undefined]) {
	test(`zero GUID in any contact takes priority over permission ${allowed}: branch 3 and log`, async () => {
		const { reply, logs } = await run(report(allowed, [phone, { contact_type: 'Max', networkorganizationid: zeroGuid }]))
		assert.deepEqual(reply.slots, { ...emptySlots, network_organization_id: '3' })
		assert.ok(logs.some(args => String(args[0]).includes('zero GUID')))
	})
}

for (const data of [
	{ ...report(true, [{ networkorganizationid: zeroGuid }]), hasrequest: true, requesttext: 'Existing request text' },
	{ ...report(false, [phone]), hasrequest: true, requesttext: 'Existing request text' },
	{ hasrequest: true, requesttext: 'Existing request text' }
]) {
	test('existing request takes priority: branch 4 returns requesttext and clears contacts', async () => {
		const { reply } = await run(data)
		assert.deepEqual(reply.slots, { ...emptySlots, network_organization_id: '4', request_text: data.requesttext })
	})
}

for (const [name, data] of [
	['empty response', null], ['array response', []], ['missing hasrequest', { network_organization_data: { request_allowed: true } }],
	['string hasrequest', { ...report(true), hasrequest: 'false' }],
	['missing existing request text', { ...report(true), hasrequest: true }],
	['blank existing request text', { hasrequest: true, requesttext: '   ' }],
	['invalid existing request text', { hasrequest: true, requesttext: {} }],
	['missing organization data', { hasrequest: false }],
	['missing permission', report(undefined)], ['string permission', report('true')],
	['invalid contacts', report(false, {})], ['missing phone', report(false)],
	['empty phone', report(false, [{ ...phone, contact: ' ' }])],
	['missing phone message', report(false, [{ ...phone, message: '' }])]
]) {
	test(`${name}: operator transfer clears old output slots`, async () => {
		const { reply } = await run(data)
		assert.equal(reply.text, '/switchredirect test-classifier intent_id="operator"')
		assert.deepEqual(reply.slots, emptySlots)
	})
}

test('missing uid: operator transfer without HTTP call', async () => {
	const { reply, requests } = await run(report(true), { missingUid: true })
	assert.equal(requests.length, 0)
	assert.equal(reply.text, '/switchredirect test-classifier intent_id="operator"')
	assert.deepEqual(reply.slots, emptySlots)
})

test('HTTP error: operator transfer and resolve', async () => {
	const { reply } = await run(null, { httpError: true })
	assert.equal(reply.text, '/switchredirect test-classifier intent_id="operator"')
	assert.deepEqual(reply.slots, emptySlots)
})

test('empty next_article uses nextArticle from settings', async () => {
	const { reply } = await run(report(true), { nextArticle: '' })
	assert.equal(reply.text, '/switchredirect test-classifier intent_id="settings-next"')
})
