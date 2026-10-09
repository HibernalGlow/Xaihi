/**
 * 文档侧 `host.runner.run` 的端到端等待形状：扫描中的长任务不许被截，真卡死仍要红。
 *
 * 这一档对着的是使用者读到的那一句：`timeout: runner.run 在 30000ms 内没有应答`。
 * 症状出现在面板上，所以判据也必须打在面板用的那一层（`createDocumentHost`），
 * 而不是只测桥的原语——`run-wait-policy.spec.ts` 已经测过原语了。
 *
 * 三条判据：
 * 1. 账本每出一帧就把上界推后一次 ⇒ 一次跑 40 秒、中途有进度的运行活着；
 * 2. 阳性对照：一条帧都不来 ⇒ 30 秒处仍报 `timeout`（"心跳"不是把防御关掉）；
 * 3. 节点声明的 `runTimeoutMs` 压得住一路续期 ⇒ 报的是 `run-timeout`，念的是"超出你自己声明的上限"。
 *
 * 进度流是假的（`createSource` 注入），其余两半桥、feed、host 全是生产实现。
 * @module xaihi-ui/tests/document-host-run-timeout
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BRIDGE_RUN_IDLE_TIMEOUT_MS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type RunFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentHost } from '../src/client/document-host.ts'
import { resetDocumentRunProgressFeed, documentRunProgressFeed } from '../src/lib/nodeRunProgress.ts'
import type { RunProgressFeedOptions } from '../src/lib/nodeRunProgress.ts'

const ORIGIN = 'http://127.0.0.1:3199'

interface SourceLike {
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
  close: () => void
  onerror?: (() => void) | null
}

/** 一条能被测试手动喂帧的假 `EventSource`。 */
function fakeSource(): { options: RunProgressFeedOptions; frame: (kind: string, payload: Record<string, unknown>) => void } {
  const listeners = new Map<string, (event: { data?: unknown }) => void>()
  const source: SourceLike = {
    addEventListener: (type, listener) => { listeners.set(type, listener) },
    close: () => {},
  }
  listeners.set('hello', () => {})
  return {
    options: { createSource: () => source },
    frame: (kind, payload) => {
      listeners.get('hello')?.({ data: JSON.stringify({ schema: 'xaihi.operations/1' }) })
      listeners.get(kind)?.({ data: JSON.stringify(payload) })
    },
  }
}

const runFrame = (nodeId: string, runId: string, actionId: string, extra: Record<string, unknown> = {}) => ({
  runId, nodeId, actionId, ...extra,
})

/** 一次"挂在半空、由测试决定何时落地"的运行面。 */
function hangingRunner(getInfo: RunFace['getInfo']): { face: RunFace; finish: () => void } {
  let finish: () => void = () => undefined
  const face: RunFace = {
    run: () => new Promise((resolve) => {
      finish = () => { resolve({ success: true, message: '扫完了 12,480 个文件' }) }
    }),
    getInfo,
  }
  return { face, finish: () => finish() }
}

async function wired(getInfo: RunFace['getInfo']): Promise<{
  host: ReturnType<typeof createDocumentHost>
  runner: ReturnType<typeof hangingRunner>
}> {
  const runner = hangingRunner(getInfo)
  let docBridge: ReturnType<typeof createDocumentBridge> | undefined
  const shellBridge = createShellBridge(
    { runner: runner.face },
    (message: BridgeMessage) => { queueMicrotask(() => { void docBridge?.receive(message, ORIGIN) }) },
    ORIGIN,
  )
  docBridge = createDocumentBridge(
    (message) => { queueMicrotask(() => { void shellBridge.receive(message, ORIGIN) }) },
    ORIGIN,
    ['contract', 'state', 'env', 'runner'],
  )
  docBridge.hello('bitv')
  for (let attempt = 0; attempt < 200 && docBridge.ready() === null; attempt += 1) {
    await vi.advanceTimersByTimeAsync(0)
  }
  expect(docBridge.ready(), '桥没握手成功').not.toBeNull()
  return {
    host: createDocumentHost({
      bridge: docBridge,
      state: { getData: () => undefined, patchData: () => undefined, replaceData: () => undefined },
    }),
    runner,
  }
}

const stateOf = (promise: Promise<unknown>): (() => string) => {
  let state = 'pending'
  promise.then(() => { state = 'resolved' }, () => { state = 'rejected' })
  return () => state
}

beforeEach(() => {
  vi.useFakeTimers()
  resetDocumentRunProgressFeed()
})
afterEach(() => {
  resetDocumentRunProgressFeed()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('文档侧长任务不被截', () => {
  it('① 每 10 秒一帧进度，跑 40 秒的运行活着拿到结果（旧那条固定 30 秒在这里必红）', async () => {
    const feed = fakeSource()
    documentRunProgressFeed(feed.options)
    const { host, runner } = await wired(undefined)
    const call = host.runner.run('bitv', { action: 'analyze', path: '/Users/glow/Downloads' })
    const seen = stateOf(call)
    await vi.advanceTimersByTimeAsync(0)
    feed.frame('started', runFrame('bitv', 'bitv/analyze#1', 'analyze'))
    for (let second = 0; second < 4; second += 1) {
      await vi.advanceTimersByTimeAsync(10_000)
      feed.frame('progress', runFrame('bitv', 'bitv/analyze#1', 'analyze', { progress: { done: (second + 1) * 25, total: 100 } }))
      expect(seen()).toBe('pending')
    }
    runner.finish()
    await vi.advanceTimersByTimeAsync(0)
    await expect(call).resolves.toMatchObject({ success: true })
  })

  it('② 阳性对照：一条帧都不来，30 秒处照样报 timeout', async () => {
    const feed = fakeSource()
    documentRunProgressFeed(feed.options)
    const { host } = await wired(undefined)
    const call = host.runner.run('bitv', { action: 'analyze' })
    const settled = call.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(BRIDGE_RUN_IDLE_TIMEOUT_MS + 1_000)
    const failure = await settled
    expect((failure as { reason?: string }).reason).toBe('timeout')
  })

  it('③ 阳性对照：节点声明 8 秒上限时，一路进度也在 8 秒处落定，念的是"超出声明的上限"', async () => {
    const feed = fakeSource()
    documentRunProgressFeed(feed.options)
    const getInfo = async (nodeId: string) => ({ nodeId, runTimeoutMs: 8_000, reportsProgress: true })
    const { host } = await wired(getInfo)
    const call = host.runner.run('bitv', { action: 'analyze' })
    const settled = call.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    feed.frame('started', runFrame('bitv', 'bitv/analyze#1', 'analyze'))
    for (let tick = 0; tick < 3; tick += 1) {
      await vi.advanceTimersByTimeAsync(2_000)
      feed.frame('progress', runFrame('bitv', 'bitv/analyze#1', 'analyze', { progress: { done: tick, total: 10 } }))
    }
    // 一路每 2 秒一帧，到第 9 秒仍然要落定：证明封顶的是那 8 秒，而不是心跳。
    await vi.advanceTimersByTimeAsync(3_000)
    const failure = await settled
    expect((failure as { reason?: string }).reason).toBe('run-timeout')
    expect(String((failure as { detail?: string }).detail)).toContain('上限')
  })

  it('④ 没声明 = 不设上限，但这条上限是从对面读回的、不是界面自己猜的', async () => {
    const feed = fakeSource()
    documentRunProgressFeed(feed.options)
    const asked: string[] = []
    const { host } = await wired(async (nodeId) => { asked.push(nodeId); return { nodeId, runTimeoutMs: null, reportsProgress: true } })
    const call = host.runner.run('bitv', { action: 'analyze' })
    const settled = call.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    feed.frame('started', runFrame('bitv', 'bitv/analyze#1', 'analyze'))
    // 跑到四倍于旧上界还没落定 ⇒ "没声明"没被折成任何一个猜出来的硬上限。
    await vi.advanceTimersByTimeAsync(BRIDGE_RUN_IDLE_TIMEOUT_MS * 4 - 1_000)
    expect(asked).toEqual(['bitv'])
    const failure = await settled
    // 最后仍要红，而且红的是"没心跳"：不设上限不等于永远转圈。
    expect((failure as { reason?: string }).reason).toBe('timeout')
  })
})
