/**
 * 取消是不是真的：`cancel` 按下中止键、调用立刻结算、账本记下那一笔。
 *
 * 这条改动修的是"取消是桩"：`NodeRegistry.cancel` 之前无条件 `return false`，
 * 于是面板既停不下那次运行，也读不回"到底取消没取消"。判据分两侧：
 * - **理会中断的节点**：`signal.aborted` 变真，它自己停下。
 * - **不理会中断的节点**：这次调用仍然**立刻**以「已取消」结算（不再等它），
 *   而文案照实说"它可能还在跑"——不许把"没停下"洗成"已取消"。
 *
 * 另一半判据是节点声明的 `runTimeoutMs`：形状闸必须看得见非法值，
 * 否则一个写错的数会在运行时被折成 NaN，把每次运行都秒判失败。
 * @module xaihi-ui/tests/node-run-cancel
 */

import { describe, expect, it } from 'vitest'
import type { NodeDefinition } from '../src/node.ts'
import { validateNodeDefinition } from '../src/node.ts'
import { CANCELLED_MESSAGE, defineNode, type NodeToolContext } from '../src/define-node.ts'
import { NodeRegistry } from '../src/node-registry.ts'
import { NULL_RUN, type ActiveRun, type OperationEvent, type OperationJournal, type OperationRun, type OperationSeq } from '../src/operations.ts'

const definition = (extra: Record<string, unknown> = {}): unknown => ({
  definitionVersion: 1,
  nodeId: 'sleeper',
  title: { zh: '睡眠节点', en: 'Sleeper' },
  description: { zh: '取消夹具', en: 'Cancel fixture' },
  actions: [{ id: 'work', label: { zh: '干活', en: 'Work' } }],
  fields: [{ id: 'ms', kind: 'number', label: { zh: '毫秒', en: 'Ms' } }],
  groups: [{ id: 'main', fieldIds: ['ms'] }],
  inputBindings: [{ fieldId: 'ms', slot: 'ms', transform: 'asInteger' }],
  danger: { type: 'none' },
  reportsProgress: true,
  ...extra,
})

/** 一份真账本的最小实现：`cancel` 必须真的 abort，不然这条测的又是替身。 */
function journal(): { face: OperationJournal; events: OperationEvent[]; runs: ActiveRun[] } {
  const events: OperationEvent[] = []
  const runs: ActiveRun[] = []
  const controllers = new Map<string, AbortController>()
  let seq: OperationSeq = 0
  let counter = 0
  const push = (event: Omit<OperationEvent, 'seq' | 'at'>): void => {
    seq += 1
    events.push({ ...event, seq, at: seq })
  }
  const face: OperationJournal = {
    open(identity) {
      counter += 1
      const runId = `${identity.nodeId}/${identity.actionId}#${counter}`
      const controller = new AbortController()
      controllers.set(runId, controller)
      runs.push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, startedAt: 0, outcome: 'running', lastSeq: seq })
      push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'started' })
      const run: OperationRun = {
        runId,
        signal: controller.signal,
        progress: (progress) => push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'progress', progress }),
        preview: (payload) => push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'preview', payload }),
        resultView: (payload) => push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'result_view', payload }),
        checkpoint: (payload) => push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'checkpoint', payload }),
      }
      return run
    },
    cancel(runId, reason = '已取消') {
      const run = runs.find((entry) => entry.runId === runId)
      if (run === undefined || run.outcome !== 'running') return false
      controllers.get(runId)?.abort()
      run.outcome = 'failed'
      run.message = reason
      push({ runId, nodeId: run.nodeId, actionId: run.actionId, kind: 'failed', message: reason })
      return true
    },
    finish(runId) {
      const run = runs.find((entry) => entry.runId === runId)
      if (run === undefined) return
      run.outcome = 'finished'
      push({ runId, nodeId: run.nodeId, actionId: run.actionId, kind: 'finished' })
    },
    fail(runId, message) {
      const run = runs.find((entry) => entry.runId === runId)
      if (run === undefined) return
      run.outcome = 'failed'
      push({ runId, nodeId: run.nodeId, actionId: run.actionId, kind: 'failed', message })
    },
    subscribe: () => () => {},
    since: () => [],
    runs: () => runs,
    seq: () => seq,
  }
  return { face, events, runs }
}

/** 与 `define-node-operations.spec.ts` 同一条纪律：`inject` 的回调必须真跑，否则注册是假绿。 */
function context(face: OperationJournal | undefined): { ctx: NodeToolContext; registry: NodeRegistry } {
  const registry = new NodeRegistry()
  return {
    registry,
    ctx: {
      tools: { register: () => () => {} },
      on: () => () => {},
      inject: (_deps, callback) => { callback({ get: () => registry }); return () => {} },
      get: (name: string) => (name === 'xaihiOperations' ? face : registry),
    },
  }
}

/** 挂一次运行，返回它的句柄：`never` 那一形用来证"不理会中断也照样结算"。 */
function started(handler: (call: { run: OperationRun }) => Promise<string>): { promise: Promise<unknown>; registry: NodeRegistry; face: ReturnType<typeof journal> } {
  const j = journal()
  const { ctx, registry } = context(j.face)
  defineNode(ctx, {
    definition: definition(),
    handlers: { work: handler as never },
    journal: () => j.face,
  })
  return { promise: registry.run('sleeper', { action: 'work', ms: 1 }), registry, face: j }
}

/** 等一次运行真的登记上：`registry.run` 到 `journal.open` 之间是异步的，一次微任务不够。 */
async function firstRunId(registry: NodeRegistry): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = registry.list()[0]?.inFlightRuns?.()[0]
    if (typeof id === 'string') return id
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  }
  throw new Error('没有登记到在飞运行（inFlightRuns 一直是空的）')
}

describe('取消真的按下中止键', () => {
  it('① 不理会中断的节点：调用仍立刻以「已取消」结算，且文案说清可能还在跑', async () => {
    let resolveRun: (value: string) => void = () => {}
    const { promise, registry } = started(() => new Promise<string>((resolve) => { resolveRun = resolve }))
    const runId = await firstRunId(registry)
    const cancelled = await registry.cancel(runId)
    expect(cancelled).toBe(true)
    const settled = await promise
    // 到这里处理器还挂着（resolveRun 还没被叫）：能结算就说明 race 生效了。
    resolveRun('太晚了')
    expect(settled).toMatchObject({ success: false, message: CANCELLED_MESSAGE })
    expect(CANCELLED_MESSAGE).toContain('仍在继续')
  })

  it('② 理会中断的节点：signal 真的翻了，它自己停下并立刻结算', async () => {
    const seen: boolean[] = []
    const { promise, registry } = started(async (call) => {
      await new Promise<void>((resolve) => {
        call.run.signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
      seen.push(call.run.signal.aborted)
      throw new Error('被中断停下')
    })
    await registry.cancel(await firstRunId(registry))
    const settled = await promise
    expect(seen).toEqual([true])
    // 念「已取消」而不是处理器自己那句错：取消这一格的真源是"谁按下了中止键"，
    // 不是"处理器在被打断的那一刻恰好抛了什么"。两条路径（理会/不理会）在这里给同一个读回。
    expect(settled).toMatchObject({ success: false, message: CANCELLED_MESSAGE })
  })

  it('②b 阳性对照：没取消时正常跑完的那次，不许被 race 吃成「已取消」', async () => {
    const { promise } = started(async () => '正常结束')
    await expect(promise).resolves.toMatchObject({ success: true, message: '正常结束' })
  })

  it('③ 账本里留下那一笔 failed（界面上的"已取消"必须有地方读回来）', async () => {
    const { promise, registry, face } = started(() => new Promise<string>(() => undefined))
    await registry.cancel(await firstRunId(registry))
    await promise
    const failed = face.events.filter((event) => event.kind === 'failed')
    expect(failed.length).toBe(1)
    expect(String(failed[0]?.message)).toContain('已取消')
    expect(face.runs[0]?.outcome).toBe('failed')
  })

  it('④ 阳性对照：未知 runId 回 false，一条都没在飞时 cancelCurrent 也回 false', async () => {
    const j = journal()
    const { ctx, registry } = context(j.face)
    defineNode(ctx, { definition: definition(), handlers: { work: async () => 'ok' }, journal: () => j.face })
    expect(await registry.cancel('sleeper/work#999')).toBe(false)
    expect(await registry.cancelCurrent()).toBe(false)
  })

  it('⑤ 没装账本时取消不了，而不是回 true 假装取消过', async () => {
    const { ctx, registry } = context(undefined)
    defineNode(ctx, {
      definition: definition(),
      handlers: { work: () => new Promise<string>(() => undefined) },
    })
    const running = registry.run('sleeper', { action: 'work', ms: 1 })
    await Promise.resolve()
    expect(registry.list()[0]?.inFlightRuns?.()).toEqual([])
    expect(await registry.cancelCurrent()).toBe(false)
    void running
  })

  it('⑥ NULL_RUN 也带一条信号：脱离 core 单独装时动作实现读它不必判空', () => {
    expect(NULL_RUN.signal).toBeDefined()
    expect(NULL_RUN.signal.aborted).toBe(false)
  })
})

describe('节点声明的 runTimeoutMs', () => {
  it('正数与 0 都收，非法形状逐条点名', () => {
    expect(validateNodeDefinition(definition({ runTimeoutMs: 0 })).ok).toBe(true)
    expect(validateNodeDefinition(definition({ runTimeoutMs: 5_000 })).ok).toBe(true)
    const bad = validateNodeDefinition(definition({ runTimeoutMs: 'soon' }))
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.join(' ')).toContain('runTimeoutMs')
  })

  it('阳性对照：负数与 NaN 必须红（不红就是这把尺看不见违规）', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const checked = validateNodeDefinition(definition({ runTimeoutMs: value }))
      expect(checked.ok, `runTimeoutMs=${String(value)}`).toBe(false)
    }
  })

  it('注册表把声明原样交出去：没声明是 null，不是猜一个数', () => {
    const { ctx, registry } = context(undefined)
    defineNode(ctx, { definition: definition({ runTimeoutMs: 12_345 }) as NodeDefinition, handlers: { work: async () => 'ok' } })
    expect(registry.runTimeoutFor('sleeper')).toBe(12_345)
    const plain = new NodeRegistry()
    const other = context(undefined)
    defineNode(other.ctx, { definition: definition() as NodeDefinition, handlers: { work: async () => 'ok' } })
    const entry = other.registry.list()[0]
    if (entry === undefined) throw new Error('节点没进注册表')
    plain.register(entry)
    expect(plain.runTimeoutFor('sleeper')).toBeNull()
    expect(plain.runTimeoutFor('nope')).toBeNull()
  })
})
