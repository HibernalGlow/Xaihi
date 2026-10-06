/**
 * `defineNode` 与运行账本的接线证伪测试。
 *
 * 尺子要能看见违规：每次调用必须留下 started/finished 两条，抛错必须是 failed 且原因在
 * 事件里，节点上报的三态必须按调用顺序进账。阳性对照是"没有账本也要能跑"——插件可以
 * 脱离 xaihi-core 单独安装，这时进度上报是无操作，但绝不允许把调用本身弄失败。
 *
 * @module xaihi-sdk/tests/define-node-operations
 */

import { describe, expect, it } from 'vitest'
import { defineNode, type NodeToolContext } from '../src/define-node.ts'
import type { ActiveRun, OperationEvent, OperationJournal, OperationRun, OperationSeq } from '../src/operations.ts'
import type { NodeDefinition } from '../src/node.ts'

const definition = {
  definitionVersion: 1,
  nodeId: 'streamer',
  title: { zh: '流式节点', en: 'Streaming node' },
  description: { zh: '账本夹具', en: 'Journal fixture' },
  actions: [{ id: 'run', label: { zh: '跑一次', en: 'Run once' } }],
  fields: [{ id: 'count', kind: 'number', label: { zh: '数量', en: 'Count' } }],
  groups: [{ id: 'main', fieldIds: ['count'] }],
  inputBindings: [{ fieldId: 'count', slot: 'count', transform: 'asInteger' }],
  danger: { type: 'none' },
  reportsProgress: true,
} as unknown as NodeDefinition

/** 只记事件的假账本：本测的是接线，不是 core 的缓冲策略。 */
function fakeJournal(): {
  journal: OperationJournal
  events: OperationEvent[]
  runs: ActiveRun[]
} {
  const events: OperationEvent[] = []
  const runs: ActiveRun[] = []
  let seq: OperationSeq = 0
  let counter = 0
  const push = (event: Omit<OperationEvent, 'seq' | 'at'>): void => {
    seq += 1
    events.push({ ...event, seq, at: seq })
  }
  const journal: OperationJournal = {
    open(identity) {
      counter += 1
      const runId = `${identity.nodeId}/${identity.actionId}#${counter}`
      runs.push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, startedAt: 0, outcome: 'running', lastSeq: seq })
      push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'started' })
      const run: OperationRun = {
        runId,
        progress: (progress) => push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'progress', progress }),
        preview: (payload) => push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'preview', payload }),
        resultView: (payload) => push({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'result_view', payload }),
      }
      return run
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
  return { journal, events, runs }
}

function context(): { ctx: NodeToolContext; tools: Array<Record<string, unknown>> } {
  const tools: Array<Record<string, unknown>> = []
  return {
    ctx: {
      tools: { register: (tool) => { tools.push(tool as Record<string, unknown>); return () => {} } },
      on: () => () => {},
    },
    tools,
  }
}

const executeOf = (tools: Array<Record<string, unknown>>): ((args: Record<string, unknown>) => Promise<string>) => {
  const tool = tools[0] as { execute: (args: Record<string, unknown>) => Promise<string> }
  return tool.execute
}

describe('defineNode 的运行账本接线', () => {
  it('一次成功调用留下 started→finished，且带节点与动作身份', async () => {
    const { journal, events, runs } = fakeJournal()
    const { ctx, tools } = context()
    defineNode(ctx, { definition, handlers: { run: async () => 'ok' }, journal })
    expect(await executeOf(tools)({ count: 3 })).toBe('ok')
    expect(events.map((event) => event.kind)).toEqual(['started', 'finished'])
    expect(events[0]).toMatchObject({ nodeId: 'streamer', actionId: 'run', runId: runs[0]?.runId })
    expect(runs[0]?.outcome).toBe('finished')
  })

  it('progress / preview / result_view 按调用顺序进账', async () => {
    const { journal, events } = fakeJournal()
    const { ctx, tools } = context()
    defineNode(ctx, {
      definition,
      journal,
      handlers: {
        run: async ({ run, inputs }) => {
          run.progress({ done: 0, total: 2 })
          run.preview({ note: inputs.count })
          run.progress({ done: 2 })
          run.resultView({ kept: 2 })
          return 'done'
        },
      },
    })
    await executeOf(tools)({ count: 2 })
    expect(events.map((event) => event.kind)).toEqual(['started', 'progress', 'preview', 'progress', 'result_view', 'finished'])
    expect(events[1]?.progress).toEqual({ done: 0, total: 2 })
    expect(events[2]?.payload).toEqual({ note: 2 })
  })

  it('动作抛错时账本记 failed 并带原因，且原样抛出', async () => {
    const { journal, events, runs } = fakeJournal()
    const { ctx, tools } = context()
    defineNode(ctx, {
      definition,
      journal,
      handlers: { run: async () => { throw new Error('boom') } },
    })
    await expect(executeOf(tools)({})).rejects.toThrow('boom')
    const failed = events.find((event) => event.kind === 'failed')
    expect(failed?.message).toBe('boom')
    expect(runs[0]?.outcome).toBe('failed')
  })

  it('阳性对照：没有账本时调用照样成功，进度上报是无操作', async () => {
    const { ctx, tools } = context()
    let sawRun = false
    defineNode(ctx, {
      definition,
      handlers: {
        run: async ({ run }) => {
          expect(() => run.progress({ done: 1 })).not.toThrow()
          sawRun = true
          return 'standalone'
        },
      },
    })
    expect(await executeOf(tools)({})).toBe('standalone')
    expect(sawRun).toBe(true)
  })

  it('声明 reportsProgress 却取不到账本时必须喊出来，而不是静默丢进度', async () => {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message?: unknown) => { warnings.push(String(message)) }
    try {
      const { ctx, tools } = context()
      defineNode(ctx, { definition, handlers: { run: async () => 'ok' } })
      expect(warnings).toHaveLength(0)
      await executeOf(tools)({})
    } finally {
      console.warn = original
    }
    expect(warnings.join('\n')).toContain('reportsProgress')
  })

  it('账本按调用现取：core 晚于节点激活也不会永久读空', async () => {
    const { journal, events } = fakeJournal()
    let available: OperationJournal | undefined
    const { ctx, tools } = context()
    defineNode(ctx, { definition, journal: () => available, handlers: { run: async () => 'ok' } })
    await executeOf(tools)({})
    expect(events).toHaveLength(0)
    available = journal
    await executeOf(tools)({})
    expect(events.map((event) => event.kind)).toEqual(['started', 'finished'])
  })
})
