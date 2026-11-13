const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'gpt_21vek.js'), 'utf8');

async function invoke({ question = 'Test question', answer = 'Test answer', emptyContext = false,
	llmError = null, messageType = 1 } = {}) {
	const resolutions = [];
	const sentMessages = [];
	const requests = [];
	const logs = [];
	let complete;
	const completed = new Promise(resolve => { complete = resolve; });
	const sandbox = {
		URL,
		message: {
			id: 'input-fixture',
			message_type: messageType,
			message: { text: question },
			user: { omni_user_id: 'user-fixture', customer_id: 'project-fixture', session_id: 'session-fixture' }
		},
		agentSettings: {
			customer_id: 'project-fixture',
			aiai2_name: 'aiassist_fixture',
			redirect_back_to_aia2: true,
			url_context_search: 'https://search.invalid',
			url_llm: 'https://llm.invalid'
		},
		logger: {
			info: (...args) => logs.push(args),
			error: (...args) => logs.push(args)
		},
		agentApi: {
			getDialogId: async () => ({ Response: 'dialog-fixture' }),
			makeMarkdownReply: text => ({ message: { text }, format: 'markdown' }),
			makeTextReply: text => ({ message: { text }, format: 'text' }),
			sendMessage: async request => { sentMessages.push(request); return { Ok: true }; }
		},
		axios: {
			post: async (url, body) => {
				requests.push({ url, body });
				if (new URL(url).pathname === '/search') {
					return { data: emptyContext
						? { symbol_code: [], context: [] }
						: { symbol_code: ['article-fixture'], context: [{ title: 'Fixture', content: 'Fixture context' }] } };
				}
				assert.equal(new URL(url).pathname, '/context_query');
				if (llmError) throw llmError;
				return { data: { answer } };
			}
		},
		resolve: value => { resolutions.push(value); complete(); }
	};
	vm.runInNewContext(source, sandbox, { timeout: 1000 });
	await completed;
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(resolutions.length, 1, 'Each invocation must resolve once');
	assert.ok(Array.isArray(resolutions[0]), 'Dialog endpoint requires an array');
	assert.deepEqual(sentMessages, [], 'Replies and commands must use the current invocation, not sendMessage');
	return { replies: Array.from(resolutions[0], reply => reply.message.text), requests, logs };
}

test('returns the answer followed by one survey transfer in the current invocation', { timeout: 2000 }, async () => {
	const { replies, logs } = await invoke();
	assert.equal(replies.length, 2);
	assert.equal(replies[0], 'Test answer');
	assert.match(replies[1], /^\/switchredirect aiassist_fixture intent_id="article-[a-f0-9-]+"$/);
	assert.ok(logs.some(args => args[1] === 'GPT entry'));
});

test('a second question gets its own answer and one survey transfer', { timeout: 2000 }, async () => {
	for (const question of ['First question', 'Second question']) {
		const { replies, requests } = await invoke({ question, answer: `Answer: ${question}` });
		assert.equal(replies.length, 2);
		assert.equal(replies[0], `Answer: ${question}`);
		assert.equal(requests[1].body.question, question);
	}
});

test('an operator transfer in the model response is not followed by a survey', { timeout: 2000 }, async () => {
	const { replies } = await invoke({ answer: '/switchredirect operator_fixture' });
	assert.equal(replies.length, 1);
	assert.match(replies[0], /^\/switchredirect \S+ intent_id="article-[a-f0-9-]+"$/);
});

test('missing context returns one fallback transfer and does not query the LLM', { timeout: 2000 }, async () => {
	const { replies, requests } = await invoke({ emptyContext: true });
	assert.equal(replies.length, 1);
	assert.match(replies[0], /^\/switchredirect aiassist_fixture intent_id=/);
	assert.equal(requests.length, 1);
});

test('LLM timeout resolves with an error reply and no transfer', { timeout: 2000 }, async () => {
	const error = Object.assign(new Error('Fixture timeout'), { code: 'ECONNABORTED' });
	const { replies } = await invoke({ llmError: error });
	assert.equal(replies.length, 1);
	assert.match(replies[0], /Извините за задержку/);
});

test('system events do not query services or start the survey', { timeout: 2000 }, async () => {
	const { replies, requests } = await invoke({ messageType: 200 });
	assert.deepEqual(replies, []);
	assert.deepEqual(requests, []);
});
