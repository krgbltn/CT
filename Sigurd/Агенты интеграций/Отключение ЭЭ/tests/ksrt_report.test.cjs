const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../ksrt_report.js'), 'utf8')
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../ksrt_report_settings.json'), 'utf8'))

// All runtime globals and HTTP are mocked; production services are never called.
const run = async ({ response = { status: 200, data: '' }, fail = false, slots = {}, mapping = [] } = {}) => {
	let resolveResult
	const result = new Promise(resolve => { resolveResult = resolve })
	const requests = []
	const inputSlots = { uid: 'test-uid', phone: '79000000000', classifier: 'test-classifier', ...slots }
	vm.runInNewContext(source, {
		agentSettings: { ...settings, url: 'https://example.invalid/{{slots.uid}}/disconnection_report_info',
			authorizationToken: 'Basic <test-key>', nextArticle: 'next', operatorArticle: 'operator', slotsMapping: mapping },
		message: { message_type: 1, slot_context: { filled_slots: Object.entries(inputSlots).map(([slot_id, value]) => ({ slot_id, value })) } },
		agentApi: { makeTextReply: (text, attachment, actions, filledSlots) => ({ text, slots: filledSlots }) },
		logger: { info() {}, warn() {}, error() {} },
		https: { Agent: class {} },
		axios: async request => {
			requests.push(request)
			if (fail) throw new Error('Mock HTTP error')
			return response
		},
		resolve: resolveResult
	}, { timeout: 1000 })
	const replies = await result
	assert.equal(replies.length, 1)
	return { reply: JSON.parse(JSON.stringify(replies[0])), requests }
}

test('one POST, no GET: body matches contract and default comment has no literal quotes', async () => {
	const { reply, requests } = await run()
	assert.equal(requests.length, 1)
	const request = requests[0]
	assert.equal(request.method, 'post')
	assert.equal(request.url, 'https://example.invalid/test-uid/disconnection_report_info')
	assert.equal(request.headers.Host, 'api.enplus.ru')
	assert.equal(request.headers.Authorization, 'Basic <test-key>')
	assert.equal(request.headers['Content-Type'], 'application/json')
	assert.deepEqual(JSON.parse(JSON.stringify(request.data)), {
		isbuilding: true, iscounter: false, isfrequent: false,
		message: 'NoPower', comment: 'Отсутствует ЭЭ', phone: '79000000000'
	})
	assert.equal(reply.slots.final_answer, '1')
})

test('custom reason/comment/phone, next_article and frequent flag', async () => {
	const { reply, requests } = await run({ slots: {
		message: 'FrequentShutdowns', comment: 'Комментарий клиента', phone: '78000000000', next_article: 'slot-next'
	} })
	assert.equal(requests[0].data.isfrequent, true)
	assert.equal(requests[0].data.message, 'FrequentShutdowns')
	assert.equal(requests[0].data.comment, 'Комментарий клиента')
	assert.equal(requests[0].data.phone, '78000000000')
	assert.equal(reply.text, '/switchredirect test-classifier intent_id="slot-next"')
})

for (const data of ['', undefined, null, {}]) {
	test(`HTTP 200 succeeds with ${JSON.stringify(data)} body`, async () => {
		const { reply } = await run({ response: { status: 200, data } })
		assert.equal(reply.text, '/switchredirect test-classifier intent_id="next"')
		assert.equal(reply.slots.final_answer, '1')
	})
}

test('HTTP 204 succeeds without body', async () => {
	const { reply } = await run({ response: { status: 204 } })
	assert.equal(reply.slots.final_answer, '1')
})

test('existing optional response mapping still works', async () => {
	const { reply } = await run({ response: { status: 200, data: { result: { id: 'test-id' } } },
		mapping: [{ slotId: 'test_result', path: 'result.id' }] })
	assert.deepEqual(reply.slots, { test_result: 'test-id', final_answer: '1' })
})

for (const response of [null, {}, { status: 400, data: {} }, { status: 500, data: 'error' }]) {
	test(`invalid or failed response ${JSON.stringify(response)}: operator and no retry`, async () => {
		const { reply, requests } = await run({ response })
		assert.equal(reply.text, '/switchredirect test-classifier intent_id="operator"')
		assert.notEqual(reply.slots?.final_answer, '1')
		assert.equal(requests.length, 1)
	})
}

test('HTTP error/timeout: operator and no retry', async () => {
	const { reply, requests } = await run({ fail: true })
	assert.equal(reply.text, '/switchredirect test-classifier intent_id="operator"')
	assert.notEqual(reply.slots?.final_answer, '1')
	assert.equal(requests.length, 1)
})
