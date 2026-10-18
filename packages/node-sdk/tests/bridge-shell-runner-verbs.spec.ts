/**
 * 桥上 `runner.*` 三条动词的归属：谁被叫到、参数怎么落。
 *
 * 这一档修的是两条"看起来接了其实没接"：
 * - `runner.getInfo` 之前被写成永远 `no-provider`，于是文档侧读不回节点声明的
 *   `runTimeoutMs`，等待策略只能在桥里写死一个常量（扫描大目录被 30 秒判失败就是这么来的）。
 * - `runner.cancelCurrent` 之前无条件走 `cancel(args[0])`，而桥上这一格**永远不带参数**，
 *   实际发出的是 `cancel(undefined)`：取消既没取消谁，也读不回原因。
 * @module xaihi-ui/tests/bridge-shell-runner-verbs
 */

import { describe, expect, it } from 'vitest'
import { BRIDGE_SCHEMA, type BridgeMessage } from '../src/host-bridge.ts'
import { createShellBridge, type RunFace } from '../src/bridge-shell.ts'

const ORIGIN = 'http://127.0.0.1:3199'

/** 发一条请求，把外壳回的那一条应答收下来。 */
async function ask(caps: Parameters<typeof createShellBridge>[0], method: string, args: readonly unknown[]) {
  const sent: BridgeMessage[] = []
  const bridge = createShellBridge(caps, (message) => { sent.push(message) }, ORIGIN)
  await bridge.receive({
    schema: BRIDGE_SCHEMA, kind: 'hello', contractVersion: '1.0.0', node: 'bitv',
    requested: ['runner', 'contract', 'state', 'env'],
  }, ORIGIN)
  await bridge.receive({ schema: BRIDGE_SCHEMA, kind: 'request', id: 'q1', method: method as never, args }, ORIGIN)
  const reply = sent.find((message) => message.kind === 'response')
  if (reply === undefined || reply.kind !== 'response') throw new Error('外壳没回答应')
  return reply
}

describe('runner.getInfo 真的有对面', () => {
  it('① 把注入面的读数原样交出去（不再永远 no-provider）', async () => {
    const face: RunFace = {
      run: async () => ({}),
      getInfo: async (nodeId) => ({ nodeId, runTimeoutMs: 9_000, reportsProgress: true }),
    }
    const reply = await ask({ runner: face }, 'runner.getInfo', ['bitv'])
    expect(reply.ok).toBe(true)
    expect(reply.value).toEqual({ nodeId: 'bitv', runTimeoutMs: 9_000, reportsProgress: true })
  })

  it('② 阳性对照：缺了 nodeId 要点名原因，而不是回一条空值', async () => {
    const face: RunFace = { run: async () => ({}), getInfo: async () => ({ nodeId: 'x' }) }
    const reply = await ask({ runner: face }, 'runner.getInfo', [''])
    expect(reply.ok).toBe(false)
    expect(reply.error?.reason).toBe('bad-args')
  })

  it('③ 面没给 getInfo 时仍按退化说，不编一份看起来对的信息', async () => {
    const reply = await ask({ runner: { run: async () => ({}) } }, 'runner.getInfo', ['bitv'])
    expect(reply.ok).toBe(false)
    expect(reply.error?.reason).toBe('no-provider')
  })
})

describe('runner.cancelCurrent 走对的那一条', () => {
  it('④ 带 cancelCurrent 时叫的是它，不是 cancel(undefined)', async () => {
    const calls: string[] = []
    const face: RunFace = {
      run: async () => ({}),
      cancel: async (runId) => { calls.push(`cancel:${runId}`); return true },
      cancelCurrent: async () => { calls.push('cancelCurrent'); return true },
    }
    const reply = await ask({ runner: face }, 'runner.cancelCurrent', [])
    expect(calls).toEqual(['cancelCurrent'])
    expect(reply.value).toBe(true)
  })

  it('⑤ 阳性对照：只有 cancel(runId) 的那一侧，缺 runId 必须回 bad-args', async () => {
    const calls: string[] = []
    const face: RunFace = {
      run: async () => ({}),
      cancel: async (runId) => { calls.push(`cancel:${String(runId)}`); return true },
    }
    const reply = await ask({ runner: face }, 'runner.cancelCurrent', [])
    expect(calls).toEqual([])
    expect(reply.ok).toBe(false)
    expect(reply.error?.reason).toBe('bad-args')
    // 补上 runId 就真能取消：证明这一格不是永远挡着。
    const withId = await ask({ runner: face }, 'runner.cancelCurrent', ['bitv/analyze#1'])
    expect(withId.value).toBe(true)
    expect(calls).toEqual(['cancel:bitv/analyze#1'])
  })
})
