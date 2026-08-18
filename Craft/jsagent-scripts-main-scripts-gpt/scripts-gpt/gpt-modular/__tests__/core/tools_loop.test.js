import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadScript } from '../helpers/load-script.js'

function makeRedis() {
  const store = {}
  return {
    get: vi.fn(async (key) => store[key] ?? null),
    set: vi.fn(async (key, value, _ttl) => { store[key] = value }),
    _store: store,
  }
}

function makeCtx(overrides = {}) {
  const redis = overrides.redis ?? makeRedis()
  return {
    https: { Agent: class { constructor() {} } },
    URL, JSON, Date, RegExp, Object, Array, Map, Set, Promise, Error,
    parseInt, parseFloat, String, Number, Boolean,
    axios: { post: vi.fn(), get: vi.fn() },
    logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    agentSettings: {
      api: { url_llm: 'http://llm:3020', url_context_search: 'http://ctx:3030' },
      customer_id: 'test',
      agent_name: 'test-agent',
      standard_messages: {},
      agent_parameters: { MAX_CYCLES: overrides.maxCycles ?? 5 },
      llm_settings: {},
      articles: {},
      slots: {},
    },
    message: {
      id: 'msg-1',
      message: { text: 'test question', action: null },
      meta: {},
      user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
      slot_context: { filled_slots: [] },
    },
    agentStorage: { dialogStorage: redis },
    agentApi: {
      makeMarkdownReply: vi.fn((text) => ({
        message: { text },
        customer_id: 'c1',
        omni_user_id: 'ou1',
        channel_id: 'ch1',
      })),
      sendMessage: vi.fn(async () => ({ Ok: true })),
      getDialogId: vi.fn(async () => ({ Response: 'dialog-1' })),
    },
    availableFunctions: overrides.availableFunctions ?? {},
    TOOLS: overrides.TOOLS ?? [],
    uuid: { v4: overrides.uuidFn ?? (() => 'test-uuid') },
    ...overrides.extra,
  }
}

const MODULES = [
  'modules/core/10_globals.js',
  'modules/core/20_http.js',
  'modules/core/30_dialog.js',
  'modules/core/50_context.js',
  'modules/core/55_slots.js',
  'modules/core/60_rag.js',
  'modules/core/70_tools_loop.js',
  'modules/models/default.js',
]

const MODULES_QWEN = [
  'modules/core/10_globals.js',
  'modules/core/20_http.js',
  'modules/core/30_dialog.js',
  'modules/core/50_context.js',
  'modules/core/55_slots.js',
  'modules/core/60_rag.js',
  'modules/core/70_tools_loop.js',
  'modules/models/qwen.js',
]

function getClass(ctx, name) {
  return ctx.__getLetVar(name)
}


describe('scenario()', () => {
  it('marks function with scenarioName=null as fire-and-forget', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const fn = ctx.scenario(null)(function () { return 'test' })
    expect(fn.isScenario).toBe(true)
    expect(fn.returnsResult).toBe(false)
    expect(fn.scenarioName).toBeNull()
  })

  it('marks function with scenarioName=undefined as default slot', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const fn = ctx.scenario()(function () { return 'test' })
    expect(fn.isScenario).toBe(true)
    expect(fn.returnsResult).toBe(true)
    expect(fn.scenarioName).toBe(ctx.__getLetVar('AGENT_SLOTS').SCENARIO_RESULT)
  })

  it('marks function with string scenarioName', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const fn = ctx.scenario('my_slot')(function () { return 'test' })
    expect(fn.isScenario).toBe(true)
    expect(fn.returnsResult).toBe(true)
    expect(fn.scenarioName).toBe('my_slot')
  })

  it('calls the original function', async () => {
    const ctx = loadScript(MODULES, makeCtx())
    const fn = ctx.scenario(null)(function ({ x }) { return x * 2 })
    const result = await fn({ x: 21 })
    expect(result).toBe(42)
  })
})


describe('switchredirect()', () => {
  it('returns switchredirect command string', () => {
    const ctx = loadScript(MODULES, makeCtx())
    expect(ctx.switchredirect('intent_123')).toBe('/switchredirect aiassist2 intent_id="intent_123"')
  })
})


describe('RedisQueue', () => {
  let ctx, redis, rq

  beforeEach(() => {
    redis = makeRedis()
    ctx = loadScript(MODULES, makeCtx({ redis }))
    rq = new (getClass(ctx, 'RedisQueue'))(
      redis,
      vi.fn(),           // deleteSlot
      vi.fn(),           // debugReply
    )
  })

  describe('addFunction', () => {
    it('pushes correctly shaped item to queue', async () => {
      const queue = []
      await rq.addFunction(queue, 'myTool', { a: 1 }, 'call-1', 'some reasoning')
      expect(queue).toHaveLength(1)
      expect(queue[0]).toEqual({
        type: 'function',
        name: 'myTool',
        args: { a: 1 },
        toolCallId: 'call-1',
        executed: false,
        started: false,
        scenario: null,
        result: null,
        reasoning: 'some reasoning',
      })
    })

    it('sets reasoning to null when not provided', async () => {
      const queue = []
      await rq.addFunction(queue, 'myTool', {}, 'call-1')
      expect(queue[0].reasoning).toBeNull()
    })
  })

  describe('addCommit', () => {
    it('pushes commit item to queue', async () => {
      const queue = []
      await rq.addCommit(queue, 'commit-1', 'msg-1')
      expect(queue[0]).toEqual({
        type: 'commit',
        commitId: 'commit-1',
        replyGptToMessageId: 'msg-1',
        executed: false,
      })
    })
  })

  describe('getQueue / saveQueue', () => {
    it('returns empty array when no queue stored', async () => {
      expect(await rq.getQueue()).toEqual([])
    })

    it('round-trips queue through redis', async () => {
      const queue = [{ type: 'function', name: 'test' }]
      await rq.saveQueue(queue)
      expect(redis.set).toHaveBeenCalledWith(
        'function_queue',
        JSON.stringify(queue),
        86400
      )
      const loaded = await rq.getQueue()
      expect(loaded).toEqual(queue)
    })
  })

  describe('markAsExecuted', () => {
    it('sets executed=true and result, saves queue', async () => {
      const queue = [{ type: 'function', name: 'test', executed: false, result: null }]
      await rq.markAsExecuted(queue, 0, 'some result')
      expect(queue[0].executed).toBe(true)
      expect(queue[0].result).toBe('some result')
      expect(redis.set).toHaveBeenCalled()
    })
  })

  describe('markAsStartedScenario', () => {
    it('sets started=true and scenario name', async () => {
      const queue = [{ type: 'function', started: false, scenario: null }]
      await rq.markAsStartedScenario(queue, 0, 'my_slot')
      expect(queue[0].started).toBe(true)
      expect(queue[0].scenario).toBe('my_slot')
      expect(redis.set).toHaveBeenCalled()
    })
  })

  describe('incNCycles / resetNCycles', () => {
    it('increments cycle counter', async () => {
      expect(await rq.incNCycles()).toBe(1)
      expect(await rq.incNCycles()).toBe(2)
    })

    it('resets cycle counter', async () => {
      await rq.incNCycles()
      await rq.resetNCycles()
      expect(await rq.incNCycles()).toBe(1)
    })
  })

  describe('clearQueue', () => {
    it('clears queue, resets cycles, deletes scenario slots', async () => {
      const queue = [
        { type: 'function', name: 'fn1', scenario: 'slot_a' },
        { type: 'function', name: 'fn2', scenario: null },
      ]
      await rq.saveQueue(queue)
      await rq.clearQueue()

      expect(rq.deleteSlot).toHaveBeenCalledWith('slot_a')
      expect(rq.deleteSlot).toHaveBeenCalledTimes(1)
      const cleared = await rq.getQueue()
      expect(cleared).toEqual([])
    })
  })

  describe('cancelUnexecuted', () => {
    it('removes non-executed items, keeps executed history', async () => {
      const queue = [
        { type: 'function', name: 'fn1', executed: true, scenario: null, result: 'r1' },
        { type: 'commit', commitId: 'c1', executed: true },
        { type: 'function', name: 'fn2', executed: false, scenario: 'slot_a', result: null },
        { type: 'commit', commitId: 'c2', executed: false },
      ]
      await rq.saveQueue(queue)
      await rq.cancelUnexecuted()

      expect(rq.deleteSlot).toHaveBeenCalledWith('slot_a')
      expect(rq.deleteSlot).toHaveBeenCalledTimes(1)

      const remaining = await rq.getQueue()
      expect(remaining).toEqual([
        { type: 'function', name: 'fn1', executed: true, scenario: null, result: 'r1' },
        { type: 'commit', commitId: 'c1', executed: true },
      ])
    })

    it('resets cycles counter', async () => {
      await rq.incNCycles()
      await rq.cancelUnexecuted()
      expect(await rq.incNCycles()).toBe(1)
    })

    it('handles empty queue', async () => {
      await rq.cancelUnexecuted()
      expect(await rq.getQueue()).toEqual([])
    })
  })
})


describe('RedisQueue.processQueue', () => {
  function makeQueueCtx(opts = {}) {
    const redis = makeRedis()
    const myTool = vi.fn(async () => opts.toolResult ?? 'tool_result')
    myTool.isScenario = false
    const commitFn = vi.fn(async () => ({ answer: 'llm response', tool_calls: [] }))

    const ctxOpts = makeCtx({
      redis,
      availableFunctions: { myTool },
      ...opts,
    })
    const ctx = loadScript(MODULES, ctxOpts)

    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())
    return { ctx, redis, rq, myTool, commitFn }
  }

  it('returns undefined for empty queue', async () => {
    const { rq, commitFn } = makeQueueCtx()
    expect(await rq.processQueue([], commitFn, {})).toBeUndefined()
  })

  it('executes function and commits result', async () => {
    const { rq, redis, myTool, commitFn } = makeQueueCtx()

    // Set up queue: one function + one commit
    const queue = [
      {
        type: 'function', name: 'myTool', args: { q: 'test' },
        toolCallId: 'call-1', executed: false, started: false,
        scenario: null, result: null,
        reasoning: null,
      },
      {
        type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false,
      },
    ]
    await rq.saveQueue(queue)

    const result = await rq.processQueue(queue, commitFn, {})
    expect(myTool).toHaveBeenCalledWith({ q: 'test' })
    expect(commitFn).toHaveBeenCalled()
    expect(result).toEqual({ answer: 'llm response', tool_calls: [] })

    // commitFn receives executed functions, toolChoice, and full queue
    const [fcResults, toolChoice, fullQueue] = commitFn.mock.calls[0]
    expect(fcResults).toHaveLength(1)
    expect(fcResults[0].executed).toBe(true)
    expect(fcResults[0].result).toBe('tool_result')
    expect(toolChoice).toBe('auto')
    expect(fullQueue).toHaveLength(2)
  })

  it('skips already executed functions', async () => {
    const { rq, myTool, commitFn } = makeQueueCtx()

    const queue = [
      {
        type: 'function', name: 'myTool', args: {},
        toolCallId: 'call-1', executed: true, started: true,
        scenario: null, result: 'old_result',
        reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await rq.processQueue(queue, commitFn, {})
    expect(myTool).not.toHaveBeenCalled()
    expect(commitFn).toHaveBeenCalled()
  })

  it('sets toolChoice to "none" when max cycles reached', async () => {
    const { rq, redis, commitFn } = makeQueueCtx()

    // Pre-set cycle counter to MAX_CYCLES - 1 (so incNCycles makes it equal)
    redis._store['n_cycles'] = 4

    const queue = [
      {
        type: 'function', name: 'myTool', args: {},
        toolCallId: 'call-1', executed: false, started: false,
        scenario: null, result: null,
        reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)
    await rq.processQueue(queue, commitFn, {})

    const [, toolChoice] = commitFn.mock.calls[0]
    expect(toolChoice).toBe('none')
  })

  it('throws ScenarioNotReadyError for started scenario without result', async () => {
    const { ctx, rq, commitFn } = makeQueueCtx()

    const queue = [
      {
        type: 'function', name: 'myTool', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null,
        reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await expect(rq.processQueue(queue, commitFn, {})).rejects.toThrow(getClass(ctx, 'ScenarioNotReadyError'))
  })

  it('throws SwitchRedirectPropagate for scenario returning /switchredirect', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))
    ctx.availableFunctions.scenarioFn = ctx.scenario(null)(
      async () => '/switchredirect other_agent'
    )
    const commitFn = vi.fn()
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'scenarioFn', args: {},
        toolCallId: 'call-1', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await expect(rq.processQueue(queue, commitFn, {})).rejects.toThrow(getClass(ctx, 'SwitchRedirectPropagate'))
  })

  it('scenario first call: marks as started with scenarioName and throws without commit', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(
      async () => '/switchredirect other_agent'
    )
    const commitFn = vi.fn()
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'myScenario', args: { id: 'abc' },
        toolCallId: 'call-1', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await expect(rq.processQueue(queue, commitFn, {})).rejects.toThrow(getClass(ctx, 'SwitchRedirectPropagate'))

    const saved = await rq.getQueue()
    expect(saved[0].started).toBe(true)
    expect(saved[0].scenario).toBe('result_slot')
    expect(saved[0].executed).toBe(false)
    expect(commitFn).not.toHaveBeenCalled()
  })

  it('second scenario not started after first completed: throws without commit', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      extra: {
        message: {
          id: 'msg-1',
          message: { text: '', action: null },
          meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: {
            filled_slots: [
              { slot_id: 'result_slot', value: '42' },
            ],
          },
        },
      },
    }))
    ctx.availableFunctions.firstScenario = ctx.scenario('result_slot')(async () => {})
    ctx.availableFunctions.secondScenario = ctx.scenario(null)(
      async () => '/switchredirect another_agent'
    )
    const commitFn = vi.fn()
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'firstScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      {
        type: 'function', name: 'secondScenario', args: {},
        toolCallId: 'call-2', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await expect(rq.processQueue(queue, commitFn, {})).rejects.toThrow(getClass(ctx, 'SwitchRedirectPropagate'))

    const saved = await rq.getQueue()
    // Первый сценарий завершён
    expect(saved[0].executed).toBe(true)
    expect(saved[0].result).toBe('42')
    // Второй сценарий запущен, но не завершён
    expect(saved[1].started).toBe(true)
    expect(saved[1].executed).toBe(false)
    expect(commitFn).not.toHaveBeenCalled()
  })

  it('scenario resumed with result: reads slot, deletes it, marks executed', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      extra: {
        message: {
          id: 'msg-1',
          message: { text: '', action: null },
          meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: {
            filled_slots: [
              { slot_id: 'result_slot', value: '42' },
            ],
          },
        },
      },
    }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(async () => {})
    const deleteFn = vi.fn()
    const commitFn = vi.fn(async () => ({ answer: 'done', tool_calls: [] }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, deleteFn, vi.fn())

    // Сценарий уже запущен (started=true), ждём результат из слота
    const queue = [
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await rq.processQueue(queue, commitFn, {})

    // Слот прочитан и удалён
    expect(deleteFn).toHaveBeenCalledWith('result_slot')

    // В очередь записан сырой результат из слота
    const saved = await rq.getQueue()
    expect(saved[0].executed).toBe(true)
    expect(saved[0].result).toBe('42')

    // Дошли до коммита
    expect(commitFn).toHaveBeenCalled()
  })

  it('fire-and-forget scenario resumed: marks executed without reading slot', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))
    ctx.availableFunctions.myScenario = ctx.scenario(null)(async () => {})
    const deleteFn = vi.fn()
    const commitFn = vi.fn(async () => ({ answer: 'done', tool_calls: [] }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, deleteFn, vi.fn())

    // Fire-and-forget: started=true, scenario=null
    const queue = [
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await rq.processQueue(queue, commitFn, {})

    // Слот не читается и не удаляется
    expect(deleteFn).not.toHaveBeenCalled()

    const saved = await rq.getQueue()
    expect(saved[0].executed).toBe(true)
    expect(saved[0].result).toBeUndefined()

    expect(commitFn).toHaveBeenCalled()
  })

  it('onScenarioCompleted hook: subclass receives (item, scenarioResult, replies) for result-bearing scenario', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      extra: {
        message: {
          id: 'msg-1',
          message: { text: '', action: null },
          meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: { filled_slots: [{ slot_id: 'result_slot', value: '42' }] },
        },
      },
    }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(async () => {})

    const Base = getClass(ctx, 'RedisQueue')
    const hook = vi.fn()
    class CustomQueue extends Base {
      async onScenarioCompleted(item, scenarioResult, replies) {
        hook({ name: item.name, scenario: item.scenario, scenarioResult, hasReplies: !!replies })
      }
    }
    const commitFn = vi.fn(async () => ({ answer: 'done', tool_calls: [] }))
    const replies = { markdownReply: vi.fn() }
    const rq = new CustomQueue(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)
    await rq.processQueue(queue, commitFn, replies)

    expect(hook).toHaveBeenCalledWith({
      name: 'myScenario',
      scenario: 'result_slot',
      scenarioResult: '42',
      hasReplies: true,
    })
  })

  it('onScenarioCompleted hook: also fires for fire-and-forget scenario with scenarioResult=undefined', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))
    ctx.availableFunctions.myScenario = ctx.scenario(null)(async () => {})

    const Base = getClass(ctx, 'RedisQueue')
    const hook = vi.fn()
    class CustomQueue extends Base {
      async onScenarioCompleted(item, scenarioResult, replies) {
        hook({ name: item.name, scenario: item.scenario, scenarioResult })
      }
    }
    const commitFn = vi.fn(async () => ({ answer: 'done', tool_calls: [] }))
    const rq = new CustomQueue(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)
    await rq.processQueue(queue, commitFn, {})

    expect(hook).toHaveBeenCalledWith({
      name: 'myScenario',
      scenario: null,
      scenarioResult: undefined,
    })
  })

  it('scenario completes then regular function executes before commit', async () => {
    const redis = makeRedis()
    const regularFn = vi.fn(async () => 'regular_result')
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      availableFunctions: { regularFn },
      extra: {
        message: {
          id: 'msg-1',
          message: { text: '', action: null },
          meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: {
            filled_slots: [
              { slot_id: 'result_slot', value: 'scenario done' },
            ],
          },
        },
      },
    }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(async () => {})
    const commitFn = vi.fn(async () => ({ answer: 'final', tool_calls: [] }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      {
        type: 'function', name: 'regularFn', args: { q: 'test' },
        toolCallId: 'call-2', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await rq.processQueue(queue, commitFn, {})

    // Обычная функция вызвана после завершения сценария
    expect(regularFn).toHaveBeenCalledWith({ q: 'test' })

    const saved = await rq.getQueue()
    expect(saved[0].executed).toBe(true)
    expect(saved[0].result).toBe('scenario done')
    expect(saved[1].executed).toBe(true)
    expect(saved[1].result).toBe('regular_result')

    const [fcResults] = commitFn.mock.calls[0]
    expect(fcResults).toHaveLength(2)
  })

  it('executes multiple functions before commit and collects all results', async () => {
    const toolA = vi.fn(async () => 'result_a')
    toolA.isScenario = false
    const toolB = vi.fn(async () => 'result_b')
    toolB.isScenario = false

    const redis = makeRedis()
    const commitFn = vi.fn(async () => ({ answer: 'done', tool_calls: [] }))
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      availableFunctions: { toolA, toolB },
    }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'toolA', args: { x: 1 },
        toolCallId: 'call-a', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      {
        type: 'function', name: 'toolB', args: { x: 2 },
        toolCallId: 'call-b', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await rq.processQueue(queue, commitFn, {})
    expect(toolA).toHaveBeenCalledWith({ x: 1 })
    expect(toolB).toHaveBeenCalledWith({ x: 2 })

    const [fcResults] = commitFn.mock.calls[0]
    expect(fcResults).toHaveLength(2)
    expect(fcResults[0].result).toBe('result_a')
    expect(fcResults[1].result).toBe('result_b')
  })

  it('commits only current batch when previous batch is already executed', async () => {
    const { rq, myTool, commitFn } = makeQueueCtx()

    const queue = [
      // Предыдущий батч — всё executed
      {
        type: 'function', name: 'myTool', args: { round: 1 },
        toolCallId: 'call-old', executed: true, started: false,
        scenario: null, result: 'old_result', reasoning: null,
      },
      { type: 'commit', commitId: 'cid-old', replyGptToMessageId: 'msg-1', executed: true },
      // Текущий батч — не executed
      {
        type: 'function', name: 'myTool', args: { round: 2 },
        toolCallId: 'call-new', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-new', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await rq.processQueue(queue, commitFn, {})
    // myTool вызван только для нового батча
    expect(myTool).toHaveBeenCalledTimes(1)
    expect(myTool).toHaveBeenCalledWith({ round: 2 })
    expect(commitFn).toHaveBeenCalledTimes(1)

    // В fcResults только функции текущего батча
    const [fcResults, , fullQueue] = commitFn.mock.calls[0]
    expect(fcResults).toHaveLength(1)
    expect(fcResults[0].type).toBe('function')
    expect(fcResults[0].result).toBe('tool_result')
    expect(fullQueue).toHaveLength(4)
  })

  it('returns undefined when entire queue is already executed', async () => {
    const { rq, myTool, commitFn } = makeQueueCtx()

    const queue = [
      {
        type: 'function', name: 'myTool', args: {},
        toolCallId: 'call-1', executed: true, started: false,
        scenario: null, result: 'done', reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: true },
    ]
    await rq.saveQueue(queue)

    const result = await rq.processQueue(queue, commitFn, {})
    expect(result).toBeUndefined()
    expect(myTool).not.toHaveBeenCalled()
    expect(commitFn).not.toHaveBeenCalled()
  })

  it('commitFcResults receives queue where current commit is not yet executed', async () => {
    const redis = makeRedis()
    let capturedCommitExecuted = null
    const commitFn = vi.fn(async (fcResults, toolChoice, fullQueue) => {
      // Захватываем состояние на момент вызова, до мутации markAsExecuted
      const currentCommit = fullQueue.find(i => i.commitId === 'c-new')
      capturedCommitExecuted = currentCommit.executed
      return { answer: 'done', tool_calls: [] }
    })
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      availableFunctions: { myTool: vi.fn(async () => 'current_result') },
    }))

    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    const queue = [
      {
        type: 'function', name: 'myTool', args: { round: 1 },
        toolCallId: 'call-old', executed: true, started: false,
        scenario: null, result: 'old_result', reasoning: null,
      },
      { type: 'commit', commitId: 'c-old', replyGptToMessageId: 'msg-1', executed: true },
      {
        type: 'function', name: 'myTool', args: { round: 2 },
        toolCallId: 'call-new', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'c-new', replyGptToMessageId: 'msg-1', executed: false },
    ]
    await rq.saveQueue(queue)

    await rq.processQueue(queue, commitFn, {})
    // Значит buildLLMHistory (вызванный внутри commitFcResults) не включит текущий батч в history
    expect(capturedCommitExecuted).toBe(false)
  })

  it('history sent to commitToolResponses does not duplicate current batch', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(async () => ({ data: { answer: 'done', tool_calls: [], log_id: 'l1' } })), get: vi.fn() }
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      availableFunctions: { myTool: vi.fn(async () => 'current_result') },
      extra: { axios: mockAxios },
    }))

    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    const mediatorHistory = [
      { id: 'msg-1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ 1', role: 'assistant', meta: { commitId: 'c-old' } },
      { id: 'r2', type: 1, content: '', role: 'assistant', meta: { commitId: 'c-new' } },
    ]

    const queue = [
      {
        type: 'function', name: 'myTool', args: { round: 1 },
        toolCallId: 'call-old', executed: true, started: false,
        scenario: null, result: 'old_result', reasoning: null,
      },
      { type: 'commit', commitId: 'c-old', replyGptToMessageId: 'msg-1', executed: true },
      {
        type: 'function', name: 'myTool', args: { round: 2 },
        toolCallId: 'call-new', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'c-new', replyGptToMessageId: 'msg-1', executed: false },
    ]

    const commitFn = async (fcResults, toolChoice, fullQueue) => {
      const functionsToCommit = fcResults.map(t => ({
        role: 'function', content: t.result ?? 'Done', tool_call_id: t.toolCallId
      }))
      const llmHistory = ctx.buildLLMHistory(mediatorHistory, fullQueue)
      return await ctx.commitToolResponses(functionsToCommit, 'dialog-1', llmHistory, { debugReply: vi.fn() }, toolChoice)
    }

    await rq.processQueue(queue, commitFn, {})

    const [, requestData] = mockAxios.post.mock.calls[0]

    // History содержит предыдущий батч
    const oldResult = requestData.history.find(m => m.tool_call_id === 'call-old')
    expect(oldResult).toBeDefined()

    // History НЕ содержит текущий батч
    const newResult = requestData.history.find(m => m.tool_call_id === 'call-new')
    expect(newResult).toBeUndefined()

    // tool_responses содержат текущий батч
    expect(requestData.tool_responses).toEqual([
      { role: 'function', content: 'current_result', tool_call_id: 'call-new' },
    ])
  })
})


describe('processScenarios', () => {
  const ROUTE = '/switchredirect test-agent'

  function scenarioTool(name, args, callId, result, extra = {}) {
    return {
      type: 'function', name, args, toolCallId: callId,
      result, executed: true, started: true, scenario: 'scenario_result',
      ...extra,
    }
  }
  function scenarioCommit(commitId, messageId) {
    return { type: 'commit', commitId, replyGptToMessageId: messageId, executed: true }
  }

  it('extracts scenario messages, removes switchredirects around scenario', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Трек принят', role: 'assistant' },
      { id: 's2', type: 1, content: 'В пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
    ]
    const tools = [scenarioTool('transfer_to_tracking', { track: 'RA123' }, 'call_1', null), scenarioCommit('c1', 'm1')]

    const { history: newHistory, tools: newTools } = ctx.processScenarios(history, tools, ROUTE)

    expect(newHistory).toEqual([
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
    ])
    expect(newTools[0].result).toBeNull()
    expect(newTools[0]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Трек принят' },
      { actor: 'assistant', utterance: 'В пути' },
    ])
  })

  it('includes scenario_result when result from slot is present', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Ответ сценария', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Готово', role: 'assistant' },
    ]
    const tools = [scenarioTool('scenario_func', {}, 'call_1', 'slot_value'), scenarioCommit('c1', 'm1')]

    const { history: newHistory, tools: newTools } = ctx.processScenarios(history, tools, ROUTE)

    expect(newHistory).toEqual([
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Готово', role: 'assistant' },
    ])
    expect(newTools[0].result).toBe('slot_value')
    expect(newTools[0]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Ответ сценария' },
    ])
  })

  it('does not modify non-scenario tools or their history', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const tools = [{
      type: 'function', name: 'get_info', args: {}, toolCallId: 'call_1',
      result: 'данные',
      executed: true, started: false, scenario: null,
    }]

    const { history: newHistory, tools: newTools } = ctx.processScenarios(history, tools, ROUTE)

    expect(newHistory).toEqual(history)
    expect(newTools[0].result).toBe('данные')
    expect(newTools[0]._scenarioDialogue).toBeUndefined()
  })

  it('handles sequential scenarios and normalizes replyGptToMessageId', () => {
    // После switchredirect обратно скрипт получает новый message.id.
    // processScenarios заменяет replyGptToMessageId на id последнего user msg.
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Сделай два дела', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="a"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Сценарий A', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'sw3', type: 30, content: '/switchredirect aiassist2 intent_id="b"', role: 'assistant' },
      { id: 's2', type: 1, content: 'Сценарий B', role: 'assistant' },
      { id: 'sw4', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Всё готово', role: 'assistant' },
    ]
    const tools = [
      scenarioTool('scenario_a', {}, 'call_1', null),
      scenarioCommit('c1', 'm1'),
      // msg-002 — id от switchredirect, не совпадает с m1
      scenarioTool('scenario_b', {}, 'call_2', null),
      { type: 'commit', commitId: 'c2', replyGptToMessageId: 'msg-002', executed: true },
    ]

    const { history: newHistory, tools: newTools } = ctx.processScenarios(history, tools, ROUTE)

    expect(newHistory).toEqual([
      { id: 'm1', type: 1, content: 'Сделай два дела', role: 'user' },
      { id: 'r1', type: 1, content: 'Всё готово', role: 'assistant' },
    ])
    // replyGptToMessageId нормализован к m1 (последний user msg) в commit
    expect(newTools[1].replyGptToMessageId).toBe('m1')
    expect(newTools[3].replyGptToMessageId).toBe('m1')
    expect(newTools[0]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Сценарий A' },
    ])
    expect(newTools[2]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Сценарий B' },
    ])
    expect(newTools[0].result).toBeNull()
    expect(newTools[2].result).toBeNull()
  })

  it('handles nested switchredirects inside scenario', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Начало', role: 'assistant' },
      { id: 'sw_inner', type: 30, content: '/switchredirect inner_service', role: 'assistant' },
      { id: 's2', type: 1, content: 'Ответ вложенного', role: 'assistant' },
      { id: 'sw_inner_back', type: 30, content: '/switchredirect aiassist2', role: 'assistant' },
      { id: 's3', type: 1, content: 'Конец', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const tools = [scenarioTool('sc', {}, 'call_1', null), scenarioCommit('c1', 'm1')]

    const { history: newHistory, tools: newTools } = ctx.processScenarios(history, tools, ROUTE)

    expect(newHistory).toEqual([
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ])
    expect(newTools[0]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Начало' },
      { actor: 'assistant', utterance: 'Ответ вложенного' },
      { actor: 'assistant', utterance: 'Конец' },
    ])
    expect(newTools[0].result).toBeNull()
  })

  it('handles scenario with user messages inside', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Отследи', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Введите трек-номер', role: 'assistant' },
      { id: 's2', type: 1, content: 'RA123', role: 'user' },
      { id: 's3', type: 1, content: 'Статус: в пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
    ]
    const tools = [scenarioTool('transfer_to_tracking', {}, 'call_1', null), scenarioCommit('c1', 'm1')]

    const { history: newHistory, tools: newTools } = ctx.processScenarios(history, tools, ROUTE)

    expect(newHistory).toEqual([
      { id: 'm1', type: 1, content: 'Отследи', role: 'user' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
    ])
    expect(newTools[0]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Введите трек-номер' },
      { actor: 'user', utterance: 'RA123' },
      { actor: 'assistant', utterance: 'Статус: в пути' },
    ])
    expect(newTools[0].result).toBeNull()
  })

  it('handles mix of scenario and non-scenario tools', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Сценарий', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ]
    const regularTool = {
      type: 'function', name: 'get_info', args: {}, toolCallId: 'call_1',
      result: 'данные',
      executed: true, started: false, scenario: null,
    }
    const tools = [
      regularTool,
      scenarioTool('sc', {}, 'call_2', null),
      scenarioCommit('c1', 'm1'),
    ]

    const { history: newHistory, tools: newTools } = ctx.processScenarios(history, tools, ROUTE)

    // Сценарные сообщения и switchredirect-ы удалены
    expect(newHistory).toEqual([
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'r1', type: 1, content: 'Ответ', role: 'assistant' },
    ])
    // Обычная тулза не изменена
    expect(newTools[0].result).toBe('данные')
    expect(newTools[0]._scenarioDialogue).toBeUndefined()
    // Сценарная тулза получила scenario_dialogue
    expect(newTools[1]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Сценарий' },
    ])
    expect(newTools[1].result).toBeNull()
  })

  it('does not mutate input arrays', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="x"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Сценарий', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
    ]
    const tools = [scenarioTool('sc', {}, 'call_1', null), scenarioCommit('c1', 'm1')]
    const origHistLen = history.length
    const origResult = tools[0].result

    ctx.processScenarios(history, tools, ROUTE)

    expect(history).toHaveLength(origHistLen)
    expect(tools[0].result).toBe(origResult)
  })

  it('processScenarios output for two scenarios on different user msgs', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const history = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'В пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
      { id: 'm2', type: 1, content: 'Найди ОПС', role: 'user' },
      { id: 'sw3', type: 30, content: '/switchredirect aiassist2 intent_id="ops"', role: 'assistant' },
      { id: 's2', type: 1, content: 'Москва', role: 'assistant' },
      { id: 'sw4', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r2', type: 1, content: 'Нашёл', role: 'assistant' },
    ]
    const tools = [
      { type: 'function', name: 'track', args: {}, toolCallId: 'call_1', result: null, executed: true, started: true, scenario: 'scenario_result' },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
      { type: 'function', name: 'ops', args: {}, toolCallId: 'call_2', result: null, executed: true, started: true, scenario: 'scenario_result' },
      { type: 'commit', commitId: 'c2', replyGptToMessageId: 'm2', executed: true },
    ]
    const processed = ctx.processScenarios(history, tools, ROUTE)

    // history без сценарных сообщений и switchredirect-ов
    expect(processed.history).toEqual([
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
      { id: 'm2', type: 1, content: 'Найди ОПС', role: 'user' },
      { id: 'r2', type: 1, content: 'Нашёл', role: 'assistant' },
    ])
    // c1 и c2 не нормализуются (оба user msg в history)
    expect(processed.tools[1].replyGptToMessageId).toBe('m1')
    expect(processed.tools[3].replyGptToMessageId).toBe('m2')
    // _scenarioDialogue содержит диалог сценария
    expect(processed.tools[0]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'В пути' },
    ])
    expect(processed.tools[2]._scenarioDialogue).toEqual([
      { actor: 'assistant', utterance: 'Москва' },
    ])
    expect(processed.tools[0].result).toBeNull()
    expect(processed.tools[2].result).toBeNull()
  })
})


describe('buildLLMHistory (scenario integration)', () => {
  const ROUTE = '/switchredirect test-agent'

  it('handles scenario tools: packs scenario messages as function result, excludes from history', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Трек-номер принят', role: 'assistant' },
      { id: 's2', type: 1, content: 'Статус: в пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Ваша посылка в пути', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [
            { actor: 'assistant', utterance: 'Трек-номер принят' },
            { actor: 'assistant', utterance: 'Статус: в пути' },
          ],
          scenario_result: 'Done',
        }),
      },
      { role: 'assistant', message: 'Ваша посылка в пути' },
    ])
  })

  it('handles scenario tool with user messages and nested switchredirects inside', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Введите трек-номер', role: 'assistant' },
      { id: 's2', type: 1, content: 'RA123', role: 'user' },
      { id: 'sw_inner', type: 30, content: '/switchredirect tracking_service', role: 'assistant' },
      { id: 's3', type: 1, content: 'Статус: в пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Ваша посылка в пути', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [
            { actor: 'assistant', utterance: 'Введите трек-номер' },
            { actor: 'user', utterance: 'RA123' },
            { actor: 'assistant', utterance: 'Статус: в пути' },
          ],
          scenario_result: 'Done',
        }),
      },
      { role: 'assistant', message: 'Ваша посылка в пути' },
    ])
  })

  it('handles multiple scenario calls in one dialog', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'В пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Посылка в пути', role: 'assistant' },
      { id: 'm2', type: 1, content: 'Найди ОПС 101000', role: 'user' },
      { id: 'sw3', type: 30, content: '/switchredirect aiassist2 intent_id="start_ops"', role: 'assistant' },
      { id: 's2', type: 1, content: 'Москва, Главпочтамт', role: 'assistant' },
      { id: 'sw4', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r2', type: 1, content: 'Нашёл отделение', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
      {
        type: 'function', name: 'transfer_to_ops_search',
        args: { ops_index: '101000' },
        toolCallId: 'call_2', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c2', replyGptToMessageId: 'm2', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({ scenario_dialogue: [{ actor: 'assistant', utterance: 'В пути' }], scenario_result: 'Done' }),
      },
      { role: 'assistant', message: 'Посылка в пути' },
      { role: 'user', message: 'Найди ОПС 101000' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'transfer_to_ops_search', arguments: '{"ops_index":"101000"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_2',
        message: JSON.stringify({ scenario_dialogue: [{ actor: 'assistant', utterance: 'Москва, Главпочтамт' }], scenario_result: 'Done' }),
      },
      { role: 'assistant', message: 'Нашёл отделение' },
    ])
  })

  it('handles scenario that just returned — agent has not replied yet', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Трек-номер принят', role: 'assistant' },
      { id: 's2', type: 1, content: 'Статус: в пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [
            { actor: 'assistant', utterance: 'Трек-номер принят' },
            { actor: 'assistant', utterance: 'Статус: в пути' },
          ],
          scenario_result: 'Done',
        }),
      },
    ])
  })

  it('handles mix of regular and scenario tools for the same message', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123 и покажи инфо', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'В пути', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Вот информация', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'get_info', args: { q: 'info' },
        toolCallId: 'call_1', result: 'Данные о клиенте',
        executed: true, started: false, scenario: null,
      },
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_2', result: null,
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123 и покажи инфо' },
      {
        role: 'assistant', message: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{"q":"info"}' } },
          { id: 'call_2', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } },
        ],
      },
      { role: 'function', message: 'Данные о клиенте', tool_call_id: 'call_1' },
      {
        role: 'function', tool_call_id: 'call_2',
        message: JSON.stringify({ scenario_dialogue: [{ actor: 'assistant', utterance: 'В пути' }], scenario_result: 'Done' }),
      },
      { role: 'assistant', message: 'Вот информация' },
    ])
  })

  it('handles scenario with result from slot', () => {
    const ctx = loadScript(MODULES, makeCtx())
    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи RA123', role: 'user' },
      { id: 'sw1', type: 30, content: '/switchredirect aiassist2 intent_id="start_tracking"', role: 'assistant' },
      { id: 's1', type: 1, content: 'Трек принят', role: 'assistant' },
      { id: 'sw2', type: 30, content: ROUTE, role: 'assistant' },
      { id: 'r1', type: 1, content: 'Посылка доставлена', role: 'assistant' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'transfer_to_tracking',
        args: { track_number: 'RA123' },
        toolCallId: 'call_1',
        result: 'Доставлена 01.04.2026',
        executed: true, started: true,
        scenario: 'scenario_result',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, ROUTE)
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    expect(result).toEqual([
      { role: 'user', message: 'Отследи RA123' },
      {
        role: 'assistant', message: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'transfer_to_tracking', arguments: '{"track_number":"RA123"}' } }],
      },
      {
        role: 'function', tool_call_id: 'call_1',
        message: JSON.stringify({
          scenario_dialogue: [{ actor: 'assistant', utterance: 'Трек принят' }],
          scenario_result: 'Доставлена 01.04.2026',
        }),
      },
      { role: 'assistant', message: 'Посылка доставлена' },
    ])
  })

  it('does not apply unformatResponse to scenario messages', () => {
    const ctx = loadScript(MODULES, makeCtx())

    const mediatorHistory = [
      { id: 'm1', type: 1, content: 'Отследи посылку', role: 'user' },
      { id: 'r1', type: 1, content: '', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 's1', type: 30, content: '/switchredirect other_agent' },
      { id: 's2', type: 1, content: 'Статус: &#60;в пути&#62;', role: 'assistant', isThinking: true },
      { id: 's3', type: 1, content: 'Посылка в пути', role: 'assistant' },
      { id: 's4', type: 30, content: '/switchredirect test-agent' },
    ]
    const toolQueue = [
      {
        type: 'function', name: 'track', args: {},
        toolCallId: 'call_1', result: 'В пути',
        executed: true, started: true, scenario: 'result_slot',
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'm1', executed: true },
    ]

    const processed = ctx.processScenarios(mediatorHistory, toolQueue, '/switchredirect test-agent')
    const result = ctx.buildLLMHistory(processed.history, processed.tools)

    const funcMsg = result.find(m => m.tool_call_id === 'call_1')
    const parsed = JSON.parse(funcMsg.message)
    expect(parsed.scenario_dialogue).toEqual([
      { actor: 'assistant', utterance: 'Статус: &#60;в пути&#62;' },
      { actor: 'assistant', utterance: 'Посылка в пути' },
    ])
  })
})


describe('enqueueToolCalls', () => {
  it('enqueues tools, adds commit, saves queue', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      availableFunctions: { myTool: vi.fn() },
    }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())
    const queue = []

    const result = await ctx.enqueueToolCalls(
      rq, queue,
      [{ id: 'call-1', function: { name: 'myTool', arguments: '{"q":"test"}' } }],
      'cid-1', 'msg-1', null, { debugReply: vi.fn() }
    )

    expect(result).toBe(true)
    expect(queue).toEqual([
      {
        type: 'function', name: 'myTool', args: { q: 'test' },
        toolCallId: 'call-1', executed: false, started: false,
        scenario: null, result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'cid-1', replyGptToMessageId: 'msg-1', executed: false },
    ])
    expect(redis.set).toHaveBeenCalledWith('function_queue', expect.any(String), 86400)
  })

  it('skips calls without function name, resets cycles', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())
    const queue = []

    const result = await ctx.enqueueToolCalls(
      rq, queue, [{ id: 'c1' }, { id: 'c2', function: {} }],
      'cid-1', 'msg-1', null, { debugReply: vi.fn() }
    )

    expect(result).toBe(false)
    expect(queue).toEqual([])
    expect(redis.set).toHaveBeenCalledWith('n_cycles', 0, 86400)
  })

  it('throws on unknown function', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())

    await expect(ctx.enqueueToolCalls(
      rq, [], [{ id: 'c1', function: { name: 'unknown', arguments: '{}' } }],
      'cid-1', 'msg-1', null, { debugReply: vi.fn() }
    )).rejects.toThrow('Функция unknown не найдена')
  })

  it('attaches pendingReasoning only to first tool', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      availableFunctions: { toolA: vi.fn(), toolB: vi.fn() },
    }))
    const rq = new (getClass(ctx, 'RedisQueue'))(redis, vi.fn(), vi.fn())
    const queue = []

    await ctx.enqueueToolCalls(
      rq, queue,
      [
        { id: 'c1', function: { name: 'toolA', arguments: '{}' } },
        { id: 'c2', function: { name: 'toolB', arguments: '{}' } },
      ],
      'cid-1', 'msg-1', 'my reasoning', { debugReply: vi.fn() }
    )

    expect(queue[0].reasoning).toBe('my reasoning')
    expect(queue[1].reasoning).toBeNull()
  })
})


describe('addCustomScenariosToTools', () => {
  function makeTransferTool() {
    return {
      type: 'function',
      function: {
        name: 'transfer_to_scenario',
        parameters: {
          properties: {
            id: { description: '', enum: [] },
          },
        },
      },
    }
  }

  it('fills transfer_to_scenario tool description and enum', () => {
    const ctx = loadScript(MODULES, makeCtx({
      TOOLS: [makeTransferTool()],
    }))

    ctx.addCustomScenariosToTools([
      { title: 'Возврат товара', content: 'как вернуть?,возврат', symbol_code: 'return_flow' },
      { title: 'Доставка', content: 'где посылка?,статус', symbol_code: 'delivery' },
    ])

    const tool = ctx.TOOLS.find(t => t.function.name === 'transfer_to_scenario')
    expect(tool.function.parameters.properties.id.enum).toEqual([
      ctx.translit('Возврат товара'),
      ctx.translit('Доставка'),
    ])
    expect(tool.function.parameters.properties.id.description).toContain('Примеры вопросов')
    expect(tool.function.parameters.properties.id.description).toContain('как вернуть?,возврат')
  })

  it('creates transfer_to_scenario function in availableFunctions', () => {
    const ctx = loadScript(MODULES, makeCtx({
      TOOLS: [makeTransferTool()],
    }))

    ctx.addCustomScenariosToTools([
      { title: 'Возврат', content: 'q1', symbol_code: 'return_flow' },
    ])

    const fn = ctx.availableFunctions['transfer_to_scenario']
    expect(fn).toBeDefined()
    expect(fn.isScenario).toBe(true)
  })

  it('does nothing for empty or null input', () => {
    const tool = makeTransferTool()
    const ctx = loadScript(MODULES, makeCtx({ TOOLS: [tool] }))

    ctx.addCustomScenariosToTools([])
    expect(ctx.TOOLS[0].function.parameters.properties.id.enum).toEqual([])

    ctx.addCustomScenariosToTools(null)
    expect(ctx.TOOLS[0].function.parameters.properties.id.enum).toEqual([])
  })

  it('does not modify other tools', () => {
    const otherTool = { type: 'function', function: { name: 'search', parameters: {} } }
    const ctx = loadScript(MODULES, makeCtx({
      TOOLS: [otherTool, makeTransferTool()],
    }))

    ctx.addCustomScenariosToTools([
      { title: 'A', content: 'q', symbol_code: 'sc' },
    ])

    expect(ctx.TOOLS[0].function.name).toBe('search')
    expect(ctx.TOOLS[0].function.parameters).toEqual({})
  })
})


describe('runToolsLoop', () => {
  function makeReplies() {
    return {
      textReply: vi.fn(),
      markdownReply: vi.fn(),
      debugReply: vi.fn(),
      deleteSlot: vi.fn(),
    }
  }

  it('cancel command "прервать" cancels unexecuted and returns cancelled', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))

    // В очереди есть выполненный и невыполненный элементы
    redis._store['function_queue'] = JSON.stringify([
      { type: 'function', name: 'fn1', executed: true, scenario: null, result: 'r1' },
      { type: 'commit', commitId: 'c1', executed: true },
      { type: 'function', name: 'fn2', executed: false, scenario: null, result: null },
      { type: 'commit', commitId: 'c2', executed: false },
    ])
    const replies = makeReplies()

    const result = await ctx.runToolsLoop(
      'прервать', 'dialog-1', null, replies, {},
      vi.fn(), vi.fn()
    )

    expect(result).toEqual({ cancelled: true })
    expect(replies.markdownReply).toHaveBeenCalled()

    // Executed элементы остались, невыполненные удалены
    const remaining = JSON.parse(redis._store['function_queue'])
    expect(remaining).toEqual([
      { type: 'function', name: 'fn1', executed: true, scenario: null, result: 'r1' },
      { type: 'commit', commitId: 'c1', executed: true },
    ])
  })

  it('cancel via action="cancel"', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      extra: {
        message: {
          id: 'msg-1',
          message: { text: 'что-то', action: 'cancel' },
          meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: { filled_slots: [] },
        },
      },
    }))
    const replies = makeReplies()

    const result = await ctx.runToolsLoop(
      'что-то', 'dialog-1', null, replies, {},
      vi.fn(), vi.fn()
    )

    expect(result).toEqual({ cancelled: true })
  })

  it('empty queue — delegates to sendMessageToLLM, no commitToolResponses', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const ctx = loadScript(MODULES, makeCtx({ redis, extra: { axios: mockAxios } }))
    const replies = makeReplies()
    const mockSendMessage = vi.fn(async () => ({ answer: 'Привет!', tool_calls: [] }))
    const mockPrint = vi.fn()

    const result = await ctx.runToolsLoop(
      'Привет', 'd1', null, replies, { use_rag: false },
      mockSendMessage, mockPrint
    )

    expect(result).toEqual({ finalAnswer: 'Привет!' })
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('Привет', 'd1', null, replies, { use_rag: false })
    // sendMessageToLLM сама печатает ответ, _printResponse от runToolsLoop не вызывается
    expect(mockPrint).not.toHaveBeenCalled()
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('tool call → commit → final answer', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const myTool = vi.fn(async () => 'tool_result')
    const ctx = loadScript(MODULES, makeCtx({
      redis, availableFunctions: { myTool }, extra: { axios: mockAxios },
    }))
    mockAxios.post.mockImplementation(async () => ({
      data: { answer: 'Вот ответ', tool_calls: [], log_id: 'l1' },
    }))
    const mockSendMessage = vi.fn(async () => ({
      answer: '', tool_calls: [{ id: 'c1', function: { name: 'myTool', arguments: '{"q":"test"}' } }],
    }))
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()

    await ctx.runToolsLoop('Вопрос', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('Вопрос', 'd1', null, replies, {})
    expect(myTool).toHaveBeenCalledWith({ q: 'test' })
    expect(mockAxios.post).toHaveBeenCalledTimes(1)
    expect(mockPrint).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Вот ответ' }), expect.anything(), expect.any(String)
    )
  })

  it('two rounds: tool → commit → new tool → commit → answer', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const myTool = vi.fn(async () => 'res')
    const ctx = loadScript(MODULES, makeCtx({
      redis, availableFunctions: { myTool }, extra: { axios: mockAxios },
    }))
    let commitCall = 0
    mockAxios.post.mockImplementation(async (url) => {
      if (url.includes('/tool_responses')) {
        commitCall++
        if (commitCall === 1) return { data: { answer: '', tool_calls: [{ id: 'c2', function: { name: 'myTool', arguments: '{"round":2}' } }], log_id: 'l1' } }
        return { data: { answer: 'Финал', tool_calls: [], log_id: 'l2' } }
      }
      return { data: { answer: '', tool_calls: [], log_id: 'lo' } }
    })
    const mockSendMessage = vi.fn(async () => ({
      answer: '', tool_calls: [{ id: 'c1', function: { name: 'myTool', arguments: '{"round":1}' } }],
    }))
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()

    await ctx.runToolsLoop('Вопрос', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('Вопрос', 'd1', null, replies, {})
    expect(myTool).toHaveBeenCalledTimes(2)
    expect(myTool).toHaveBeenCalledWith({ round: 1 })
    expect(myTool).toHaveBeenCalledWith({ round: 2 })
    expect(mockAxios.post).toHaveBeenCalledTimes(2)
    // _printResponse вызван только для финального ответа, не для пустого промежуточного
    expect(mockPrint).toHaveBeenCalledTimes(1)
    expect(mockPrint).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Финал' }), expect.anything(), expect.any(String)
    )
  })

  it('sends tool_choice=none after MAX_CYCLES', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const myTool = vi.fn(async () => 'res')
    const ctx = loadScript(MODULES, makeCtx({
      redis, maxCycles: 2, availableFunctions: { myTool }, extra: { axios: mockAxios },
    }))
    let commitCall = 0
    mockAxios.post.mockImplementation(async (url) => {
      if (url.includes('/tool_responses')) {
        commitCall++
        if (commitCall < 2) return { data: { answer: '', tool_calls: [{ id: `c${commitCall+1}`, function: { name: 'myTool', arguments: '{}' } }], log_id: `l${commitCall}` } }
        return { data: { answer: 'Стоп', tool_calls: [], log_id: 'lf' } }
      }
      return { data: { answer: '', tool_calls: [], log_id: 'lo' } }
    })
    const mockSendMessage = vi.fn(async () => ({
      answer: '', tool_calls: [{ id: 'c1', function: { name: 'myTool', arguments: '{}' } }],
    }))
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()

    await ctx.runToolsLoop('Вопрос', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('Вопрос', 'd1', null, replies, {})
    const commitCalls = mockAxios.post.mock.calls.filter(([url]) => url.includes('/tool_responses'))
    expect(commitCalls).toHaveLength(2)
    expect(commitCalls[0][1].tool_choice).toBe('auto')
    expect(commitCalls[1][1].tool_choice).toBe('none')
    expect(mockPrint).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Стоп' }), expect.anything(), expect.any(String)
    )
  })

  it('scenario call throws SwitchRedirectPropagate, saves started=true', async () => {
    const redis = makeRedis()
    const ctx = loadScript(MODULES, makeCtx({ redis }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(
      async () => '/switchredirect other_agent'
    )
    const mockSendMessage = vi.fn(async () => ({
      answer: 'Подождите', tool_calls: [{ id: 'c1', function: { name: 'myScenario', arguments: '{}' } }],
    }))
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()

    await expect(ctx.runToolsLoop(
      'Вопрос', 'd1', null, replies, {}, mockSendMessage, mockPrint
    )).rejects.toThrow(getClass(ctx, 'SwitchRedirectPropagate'))

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('Вопрос', 'd1', null, replies, {})
    expect(mockPrint).not.toHaveBeenCalled()
    const queue = JSON.parse(redis._store['function_queue'])
    expect(queue[0].started).toBe(true)
    expect(queue[0].scenario).toBe('result_slot')
    expect(queue[0].executed).toBe(false)
  })

  it('return from scenario commits and gets final answer', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const ctx = loadScript(MODULES, makeCtx({
      redis,
      extra: {
        axios: mockAxios,
        message: {
          id: 'msg-1', message: { text: '', action: null }, meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: { filled_slots: [{ slot_id: 'result_slot', value: '42' }] },
        },
      },
    }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(async () => {})
    mockAxios.post.mockImplementation(async () => ({
      data: { answer: 'Результат: 42', tool_calls: [], log_id: 'l1' },
    }))
    redis._store['function_queue'] = JSON.stringify([
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'msg-1', executed: false },
    ])
    const mockSendMessage = vi.fn()
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()

    await ctx.runToolsLoop('', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockAxios.post).toHaveBeenCalledTimes(1)
    expect(mockPrint).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Результат: 42' }), expect.anything(), expect.any(String)
    )
  })

  // BUG: question="" после сценария блокирует новые tool_calls
  it('return from scenario with new tool_calls from LLM', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const myTool = vi.fn(async () => 'tool_done')
    const ctx = loadScript(MODULES, makeCtx({
      redis, availableFunctions: { myTool },
      extra: {
        axios: mockAxios,
        message: {
          id: 'msg-1', message: { text: '', action: null }, meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: { filled_slots: [{ slot_id: 'result_slot', value: '42' }] },
        },
      },
    }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(async () => {})
    let commitCall = 0
    mockAxios.post.mockImplementation(async (url) => {
      if (url.includes('/tool_responses')) {
        commitCall++
        if (commitCall === 1) return { data: { answer: '', tool_calls: [{ id: 'c2', function: { name: 'myTool', arguments: '{}' } }], log_id: 'l1' } }
        return { data: { answer: 'Финал', tool_calls: [], log_id: 'l2' } }
      }
      return { data: { answer: '', tool_calls: [], log_id: 'lo' } }
    })
    redis._store['function_queue'] = JSON.stringify([
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'msg-1', executed: false },
    ])
    const mockSendMessage = vi.fn()
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()

    await ctx.runToolsLoop('', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).not.toHaveBeenCalled()
    // myTool должна быть вызвана после сценария
    expect(myTool).toHaveBeenCalledTimes(1)
    expect(mockAxios.post).toHaveBeenCalledTimes(2)
  })

  it('parallel tools all execute and commit together', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const toolA = vi.fn(async () => 'resA')
    const toolB = vi.fn(async () => 'resB')
    const ctx = loadScript(MODULES, makeCtx({
      redis, availableFunctions: { toolA, toolB }, extra: { axios: mockAxios },
    }))
    mockAxios.post.mockImplementation(async () => ({
      data: { answer: 'Оба готовы', tool_calls: [], log_id: 'l1' },
    }))
    const mockSendMessage = vi.fn(async () => ({
      answer: '',
      tool_calls: [
        { id: 'c1', function: { name: 'toolA', arguments: '{}' } },
        { id: 'c2', function: { name: 'toolB', arguments: '{}' } },
      ],
    }))
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()

    await ctx.runToolsLoop('Вопрос', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('Вопрос', 'd1', null, replies, {})
    expect(toolA).toHaveBeenCalledTimes(1)
    expect(toolB).toHaveBeenCalledTimes(1)
    const commitCalls = mockAxios.post.mock.calls.filter(([url]) => url.includes('/tool_responses'))
    expect(commitCalls).toHaveLength(1)
    expect(commitCalls[0][1].tool_responses).toHaveLength(2)
    expect(mockPrint).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Оба готовы' }), expect.anything(), expect.any(String)
    )
  })

  it('commitToolResponses receives correct request format', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const myTool = vi.fn(async () => 'the result')
    const ctx = loadScript(MODULES, makeCtx({
      redis, availableFunctions: { myTool }, extra: { axios: mockAxios },
    }))
    mockAxios.post.mockImplementation(async () => ({
      data: { answer: 'Готово', tool_calls: [], log_id: 'l1' },
    }))
    const mockSendMessage = vi.fn(async () => ({
      answer: '', tool_calls: [{ id: 'call-1', function: { name: 'myTool', arguments: '{"x":1}' } }],
    }))
    const replies = makeReplies()

    await ctx.runToolsLoop('Вопрос', 'd1', null, replies, {}, mockSendMessage, vi.fn(async () => null))

    expect(mockSendMessage).toHaveBeenCalledWith('Вопрос', 'd1', null, replies, {})
    const [, requestData] = mockAxios.post.mock.calls.find(([url]) => url.includes('/tool_responses'))
    expect(requestData.tool_responses).toEqual([
      { role: 'function', content: 'the result', tool_call_id: 'call-1' },
    ])
    expect(requestData.dialog_id).toBe('d1')
    expect(requestData.tool_choice).toBe('auto')
  })

  it('_printResponse called for intermediate answers, not for sendMessageToLLM response', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const myTool = vi.fn(async () => 'res')
    const ctx = loadScript(MODULES, makeCtx({
      redis, availableFunctions: { myTool }, extra: { axios: mockAxios },
    }))
    let commitCall = 0
    mockAxios.post.mockImplementation(async (url) => {
      if (url.includes('/tool_responses')) {
        commitCall++
        if (commitCall === 1) return { data: { answer: 'Промежуточный', tool_calls: [{ id: 'c2', function: { name: 'myTool', arguments: '{}' } }], log_id: 'l1' } }
        return { data: { answer: 'Финал', tool_calls: [], log_id: 'l2' } }
      }
      return { data: { answer: '', tool_calls: [], log_id: 'lo' } }
    })
    const mockSendMessage = vi.fn(async () => ({
      answer: 'Первый ответ с тулзами',
      tool_calls: [{ id: 'c1', function: { name: 'myTool', arguments: '{}' } }],
    }))
    const mockPrint = vi.fn(async () => 'pending_reasoning')
    const replies = makeReplies()

    await ctx.runToolsLoop('Вопрос', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('Вопрос', 'd1', null, replies, {})
    const printedAnswers = mockPrint.mock.calls.map(([resp]) => resp.answer)
    // sendMessageToLLM ответ не печатается через _printResponse (она сама печатает)
    expect(printedAnswers).not.toContain('Первый ответ с тулзами')
    // Промежуточные ответы от commitToolResponses печатаются
    expect(printedAnswers).toContain('Промежуточный')
    expect(printedAnswers).toContain('Финал')
    for (const call of mockPrint.mock.calls) {
      expect(call[2]).toEqual(expect.any(String)) // commitId
    }
  })

  it('ScenarioNotReadyError with question returns cancelled', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const ctx = loadScript(MODULES, makeCtx({ redis, extra: { axios: mockAxios } }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(async () => {})
    redis._store['function_queue'] = JSON.stringify([
      {
        type: 'function', name: 'myScenario', args: {},
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'msg-1', executed: false },
    ])
    const mockSendMessage = vi.fn()
    const mockPrint = vi.fn()
    const replies = makeReplies()

    const result = await ctx.runToolsLoop('Привет', 'd1', null, replies, {}, mockSendMessage, mockPrint)

    expect(result).toEqual({ cancelled: true })
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockPrint).not.toHaveBeenCalled()
    expect(mockAxios.post).not.toHaveBeenCalled()
    expect(replies.markdownReply).toHaveBeenCalled()
  })

  // --- Интеграционные тесты с mediator-историей (qwen) ---

  it('two rounds with qwen: empty answer then reasoning — history includes reasoning as <think>', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const search = vi.fn(async () => 'Статья про возврат')
    const refine = vi.fn(async () => 'Уточнённый ответ')
    let uuidCounter = 0
    const ctx = loadScript(MODULES_QWEN, makeCtx({
      redis, availableFunctions: { search, refine },
      uuidFn: () => `uuid-${++uuidCounter}`,
      extra: { axios: mockAxios },
    }))

    // mediator history содержит текущее сообщение пользователя
    const mediatorHistory = [
      { id: 'msg-0', type: 1, content: 'Привет', role: 'user' },
      { id: 'r0', type: 1, content: 'Привет! Чем помочь?', role: 'assistant' },
      { id: 'msg-1', type: 1, content: 'Как вернуть товар?', role: 'user' },
    ]
    // _mainBody уже отрезал хвост через getMediatorHistoryForQuery —
    // в runToolsLoop приходит история без последнего user-msg.
    const trimmedHistory = mediatorHistory.slice(0, -1)

    let commitCall = 0
    mockAxios.post.mockImplementation(async (url) => {
      if (url.includes('/tool_responses')) {
        commitCall++
        if (commitCall === 1) {
          return { data: { answer: 'Нужно уточнить', tool_calls: [{ id: 'call-2', function: { name: 'refine', arguments: '{"q":"уточни"}' } }], log_id: 'l1' } }
        }
        return { data: { answer: 'Для возврата обратитесь в магазин', tool_calls: [], log_id: 'l2' } }
      }
      return { data: { answer: '', tool_calls: [], log_id: 'lo' } }
    })
    const mockSendMessage = vi.fn(async () => ({
      answer: '', tool_calls: [{ id: 'call-1', function: { name: 'search', arguments: '{"q":"возврат"}' } }],
    }))
    const mockPrint = vi.fn(async (response) => {
      if (response.answer === 'Нужно уточнить') return 'нужно уточнить'
      return null
    })
    const replies = makeReplies()
    // getDialogsHistory перезапрашивается в commitFcResults — мокаем ту же историю
    ctx.getDialogsHistory = vi.fn(async () => mediatorHistory)

    await ctx.runToolsLoop(
      'Как вернуть товар?', 'd1', trimmedHistory, replies, {},
      mockSendMessage, mockPrint
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith(
      'Как вернуть товар?', 'd1', trimmedHistory, replies, {}
    )
    const commitCalls = mockAxios.post.mock.calls.filter(([url]) => url.includes('/tool_responses'))
    expect(commitCalls).toHaveLength(2)

    // --- Первый коммит: пустой ответ ---
    expect(commitCalls[0][1].history).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Привет! Чем помочь?' },
      { role: 'user', message: 'Как вернуть товар?' },
      // non-executed commit: tool_calls без function results
      { role: 'assistant', message: '',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"q":"возврат"}' } }] },
    ])
    expect(commitCalls[0][1].tool_responses).toEqual([
      { role: 'function', content: 'Статья про возврат', tool_call_id: 'call-1' },
    ])

    // --- Второй коммит: первый раунд executed, reasoning в <think> тегах ---
    expect(commitCalls[1][1].history).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Привет! Чем помочь?' },
      { role: 'user', message: 'Как вернуть товар?' },
      { role: 'assistant', message: '',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"q":"возврат"}' } }] },
      { role: 'function', message: 'Статья про возврат', tool_call_id: 'call-1' },
      // reasoning через pendingReasoning → в <think> тегах (qwen toModelFormat)
      { role: 'assistant', message: '<think>\nнужно уточнить\n</think>\n\n',
        tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'refine', arguments: '{"q":"уточни"}' } }] },
    ])
    expect(commitCalls[1][1].tool_responses).toEqual([
      { role: 'function', content: 'Уточнённый ответ', tool_call_id: 'call-2' },
    ])
  })

  // BUG: при SHOW_THINKING=true _printResponse не возвращает pendingReasoning,
  // reasoning теряется из истории коммита (не попадает в очередь).
  // Также первый reasoning из sendMessageToLLM не захватывается runToolsLoop (responsePrinted=true).
  it('two rounds with SHOW_THINKING=true: reasoning appears in commit history', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const search = vi.fn(async () => 'Статья про возврат')
    const refine = vi.fn(async () => 'Уточнённый ответ')
    let uuidCounter = 0
    const globals = makeCtx({
      redis, availableFunctions: { search, refine },
      uuidFn: () => `uuid-${++uuidCounter}`,
      extra: { axios: mockAxios },
    })
    globals.agentSettings.agent_parameters.SHOW_THINKING = true
    const ctx = loadScript(MODULES_QWEN, globals)

    const mediatorHistory = [
      { id: 'msg-0', type: 1, content: 'Привет', role: 'user' },
      { id: 'r0', type: 1, content: 'Привет! Чем помочь?', role: 'assistant' },
      { id: 'msg-1', type: 1, content: 'Как вернуть товар?', role: 'user' },
    ]
    // _mainBody уже отрезал хвост — в runToolsLoop приходит без него.
    const trimmedHistory = mediatorHistory.slice(0, -1)

    let commitCall = 0
    mockAxios.post.mockImplementation(async (url) => {
      if (url.includes('/tool_responses')) {
        commitCall++
        if (commitCall === 1) {
          return { data: { answer: '<think>Нужно уточнить</think>', tool_calls: [{ id: 'call-2', function: { name: 'refine', arguments: '{"q":"уточни"}' } }], log_id: 'l1' } }
        }
        return { data: { answer: 'Для возврата обратитесь в магазин', tool_calls: [], log_id: 'l2' } }
      }
      return { data: { answer: '', tool_calls: [], log_id: 'lo' } }
    })
    const mockSendMessage = vi.fn(async () => ({
      answer: '<think>Поищу в базе</think>', tool_calls: [{ id: 'call-1', function: { name: 'search', arguments: '{"q":"возврат"}' } }],
    }))
    // SHOW_THINKING=true: _printResponse отправляет thinking в чат, но НЕ возвращает pendingReasoning
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()
    // getDialog перезапрашивается в commitFcResults (SHOW_THINKING=true) —
    // в медиаторе уже есть isThinking (отправлен _printResponse-ом внутри sendMessageToLLM)
    ctx.getDialogsHistory = vi.fn()
      .mockResolvedValueOnce([
        ...mediatorHistory,
        { id: 'think-1', type: 1, content: 'Поищу в базе', role: 'assistant', isThinking: true, meta: { commitId: 'uuid-1' } },
      ])
      .mockResolvedValueOnce([
        ...mediatorHistory,
        { id: 'think-1', type: 1, content: 'Поищу в базе', role: 'assistant', isThinking: true, meta: { commitId: 'uuid-1' } },
        { id: 'think-2', type: 1, content: 'Нужно уточнить', role: 'assistant', isThinking: true, meta: { commitId: 'uuid-2' } },
      ])

    await ctx.runToolsLoop(
      'Как вернуть товар?', 'd1', trimmedHistory, replies, {},
      mockSendMessage, mockPrint
    )

    const commitCalls = mockAxios.post.mock.calls.filter(([url]) => url.includes('/tool_responses'))
    expect(commitCalls).toHaveLength(2)

    // --- Первый коммит: reasoning "Поищу в базе" должен быть в истории ---
    expect(commitCalls[0][1].history).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Привет! Чем помочь?' },
      { role: 'user', message: 'Как вернуть товар?' },
      { role: 'assistant', message: '<think>\nПоищу в базе\n</think>\n\n',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"q":"возврат"}' } }] },
    ])

    // --- Второй коммит: оба reasoning должны быть в истории ---
    expect(commitCalls[1][1].history).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Привет! Чем помочь?' },
      { role: 'user', message: 'Как вернуть товар?' },
      { role: 'assistant', message: '<think>\nПоищу в базе\n</think>\n\n',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"q":"возврат"}' } }] },
      { role: 'function', message: 'Статья про возврат', tool_call_id: 'call-1' },
      { role: 'assistant', message: '<think>\nНужно уточнить\n</think>\n\n',
        tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'refine', arguments: '{"q":"уточни"}' } }] },
    ])
  })

  // SHOW_THINKING=true + сценарий: после switchredirect скрипт перезапустится,
  // mediator-история будет содержать isThinking → buildLLMHistory восстановит reasoning.
  // Проверяем: 1) очередь создаётся реально (не замокана), reasoning=null
  // 2) в истории коммита reasoning ровно один раз (не дублируется)
  it('scenario return with SHOW_THINKING=true: reasoning from mediator isThinking, not duplicated', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    let uuidCounter = 0
    const ctx = loadScript(MODULES_QWEN, makeCtx({
      redis,
      uuidFn: () => `uuid-${++uuidCounter}`,
      extra: {
        axios: mockAxios,
        message: {
          id: 'msg-1', message: { text: 'Вопрос', action: null }, meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: { filled_slots: [{ slot_id: 'result_slot', value: 'Результат сценария' }] },
        },
      },
    }))
    ctx.availableFunctions.myScenario = ctx.scenario('result_slot')(async () => {
      return ctx.switchredirect('scenario_intent')
    })

    // --- Run 1: LLM returns reasoning + scenario tool_call ---
    const mediatorHistory1 = [
      { id: 'msg-1', type: 1, content: 'Вопрос', role: 'user' },
    ]
    const mockSendMessage = vi.fn(async () => ({
      answer: '<think>Размышления</think>',
      tool_calls: [{ id: 'call-1', function: { name: 'myScenario', arguments: '{}' } }],
    }))
    // SHOW_THINKING=true: _printResponse отправляет thinking в чат, возвращает null
    const mockPrint = vi.fn(async () => null)
    const replies1 = makeReplies()

    const SRP = getClass(ctx, 'SwitchRedirectPropagate')
    await expect(ctx.runToolsLoop(
      'Вопрос', 'd1', mediatorHistory1, replies1, {},
      mockSendMessage, mockPrint
    )).rejects.toThrow(SRP)

    // Очередь создалась реально — reasoning=null (не вернулся из mockPrint)
    const savedQueue = JSON.parse(redis._store['function_queue'])
    expect(savedQueue.find(t => t.type === 'function').reasoning).toBeNull()

    // --- Run 2: Сценарий вернулся, mediator содержит isThinking ---
    // В реальности _printResponse в sendMessageToLLM отправил thinking БЕЗ commitId.
    const mediatorHistory2 = [
      { id: 'msg-1', type: 1, content: 'Вопрос', role: 'user' },
      { id: 'think-1', type: 1, content: 'Размышления', role: 'assistant', meta: { isThinking: true } },
      { id: 'sw1', type: 30, content: '/switchredirect test-agent', role: 'assistant' },
      { id: 'sc-1', type: 1, content: 'Ответ от сценария', role: 'assistant' },
      { id: 'sw2', type: 30, content: '/switchredirect test-agent', role: 'assistant' },
    ]

    mockAxios.post.mockResolvedValue({
      data: { answer: 'Финальный ответ', tool_calls: [], log_id: 'l1' },
    })
    const replies2 = makeReplies()
    ctx.getDialogsHistory = vi.fn(async () => mediatorHistory2)

    await ctx.runToolsLoop(
      '', 'd1', mediatorHistory2, replies2, {},
      vi.fn(), mockPrint
    )

    // reasoning из isThinking попал в историю ровно один раз
    const commitCalls = mockAxios.post.mock.calls.filter(([url]) => url.includes('/tool_responses'))
    expect(commitCalls).toHaveLength(1)

    const history = commitCalls[0][1].history
    const reasoningMatches = JSON.stringify(history).match(/Размышления/g) ?? []
    expect(reasoningMatches).toHaveLength(1)
  })

  it('scenario: tool_responses enriched with dialogue from mediator', async () => {
    const redis = makeRedis()
    const mockAxios = { post: vi.fn(), get: vi.fn() }
    const ctx = loadScript(MODULES_QWEN, makeCtx({
      redis,
      extra: {
        axios: mockAxios,
        message: {
          id: 'msg-return', message: { text: '', action: null }, meta: {},
          user: { channel_user_id: 'u1', omni_user_id: 'ou1', customer_id: 'c1' },
          slot_context: { filled_slots: [{ slot_id: 'result_slot', value: 'Доставлена 01.04' }] },
        },
      },
    }))
    ctx.availableFunctions.trackScenario = ctx.scenario('result_slot')(async () => {})

    const mediatorHistory = [
      { id: 'msg-1', type: 1, content: 'Привет', role: 'user' },
      { id: 'r1', type: 1, content: 'Привет! Чем помочь?', role: 'assistant' },
      { id: 'msg-2', type: 1, content: 'Отследи посылку RA123', role: 'user' },
      { id: 'r2', type: 1, content: 'Сейчас проверю статус', role: 'assistant', meta: { commitId: 'c1' } },
      { id: 's1', type: 30, content: '/switchredirect tracking_agent' },
      { id: 's2', type: 1, content: 'Номер RA123 принят, ищу...', role: 'assistant' },
      { id: 's3', type: 1, content: 'Нашёл, статус: доставлена', role: 'assistant' },
      { id: 's4', type: 30, content: '/switchredirect test-agent' },
    ]

    redis._store['function_queue'] = JSON.stringify([
      {
        type: 'function', name: 'trackScenario', args: { track: 'RA123' },
        toolCallId: 'call-1', executed: false, started: true,
        scenario: 'result_slot', result: null, reasoning: null,
      },
      { type: 'commit', commitId: 'c1', replyGptToMessageId: 'msg-2', executed: false },
    ])

    mockAxios.post.mockImplementation(async () => ({
      data: { answer: 'Посылка RA123 доставлена 01.04', tool_calls: [], log_id: 'l1' },
    }))
    const mockSendMessage = vi.fn()
    const mockPrint = vi.fn(async () => null)
    const replies = makeReplies()
    ctx.getDialogsHistory = vi.fn(async () => mediatorHistory)

    await ctx.runToolsLoop('', 'd1', mediatorHistory, replies, {}, mockSendMessage, mockPrint)

    expect(mockSendMessage).not.toHaveBeenCalled()
    const [, requestData] = mockAxios.post.mock.calls.find(([url]) => url.includes('/tool_responses'))

    // tool_responses обогащены историей сценарного агента
    expect(requestData.tool_responses).toHaveLength(1)
    const toolContent = JSON.parse(requestData.tool_responses[0].content)
    expect(toolContent.scenario_result).toBe('Доставлена 01.04')
    expect(toolContent.scenario_dialogue).toEqual([
      { actor: 'assistant', utterance: 'Номер RA123 принят, ищу...' },
      { actor: 'assistant', utterance: 'Нашёл, статус: доставлена' },
    ])

    // History: обычный диалог + tool_calls, без сценарных сообщений
    expect(requestData.history).toEqual([
      { role: 'user', message: 'Привет' },
      { role: 'assistant', message: 'Привет! Чем помочь?' },
      { role: 'user', message: 'Отследи посылку RA123' },
      { role: 'assistant', message: 'Сейчас проверю статус',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'trackScenario', arguments: '{"track":"RA123"}' } }] },
    ])
  })
})
