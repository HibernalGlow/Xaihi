/**
 * `runner.run` 的等待策略：心跳续期 + 节点声明的硬上限。
 *
 * 判据要证的是三件事，缺一件就是这次改动没落地：
 * 1. **有心跳就不截**——一次跑得比 `idleMs` 久的运行必须能活着等到应答（这是"扫描大目录被
 *    30 秒判失败"那条病根的正面对照）。
 * 2. **没心跳一定截**——把续期关掉必须红，否则"心跳"只是文案。
 * 3. **上限压得住心跳**——节点声明的 `runTimeoutMs` 是一条硬上界，不能被一路续期绕过去；
 *    否则"节点可声明上限"是装饰品（声明了却管不住）。
 *
 * 两半桥都走真实现，只有定时器是假的；运行的长短由注入的 `RunFace` 自己用计时器决定。
 * @module xaihi-ui/tests/run-wait-policy
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_CAPABILITY_IDS } from '@hibernalglow/xaihi-sdk/bridge'
// 新加的常量与折算函数从 `src` 取，不从包别名取：别名解析到的是**上次构建的 dist**，
// 在那里 `runWaitPolicyFor` 还不存在（实测拿到 undefined，红成"函数不是函数"而不是红在判据上）。
import {
  BRIDGE_REQUEST_TIMEOUT_MS,
  BRIDGE_RUN_IDLE_TIMEOUT_MS,
  runWaitPolicyFor,
  type RunWaitPolicy,
} from '../src/host-bridge.ts'
import { createShellBridge, type RunFace } from '../src/bridge-shell.ts'
import { BridgeError, createDocumentBridge } from '../src/bridge-document.ts'

const ORIGIN = 'http://127.0.0.1:3199'

/** 两半桥接起来，问的是 `runner.run`，答的快慢由传进来的那面决定。 */
function wired(runner: RunFace): ReturnType<typeof createDocumentBridge> {
  let doc: ReturnType<typeof createDocumentBridge> | undefined
  const shell = createShellBridge({ runner }, (outbound) => { void doc?.receive(outbound, ORIGIN) }, ORIGIN)
  doc = createDocumentBridge(
    (message) => { void shell.receive(message, ORIGIN) },
    ORIGIN,
    [...NODE_CAPABILITY_IDS],
  )
  doc.hello('bitv')
  return doc
}

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const value = await promise.catch((error: unknown) => error)
  expect(value).toBeInstanceOf(BridgeError)
  return (value as BridgeError).reason
}

/** 挂一条"它落定成了什么"的读数，用来区分"还在等"与"已经结算"。 */
function track(promise: Promise<unknown>): () => string {
  let state = 'pending'
  promise.then(() => { state = 'resolved' }, () => { state = 'rejected' })
  return () => state
}

/** 每 `everyMs` 续期一次，直到调用落定；返回续期次数，用来证明"确实续过"。 */
function beating(renew: () => void, promise: Promise<unknown>, everyMs: number): () => number {
  let ticks = 0
  const timer = setInterval(() => { ticks += 1; renew() }, everyMs)
  // 先接住失败再挂 finally：`promise.finally()` 会派生出**另一条**被拒的 promise，
  // 没人接就是整轮测试的未处理拒绝（这是夹具的噪声，不是被测代码的）。
  void promise.catch(() => undefined).finally(() => clearInterval(timer))
  return () => ticks
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('等待策略的折算', () => {
  it('未声明与声明 0 都不设硬上限，声明正数才封顶', () => {
    expect(runWaitPolicyFor(undefined)).toEqual({ idleMs: BRIDGE_RUN_IDLE_TIMEOUT_MS, ceilingMs: null })
    expect(runWaitPolicyFor(0)).toEqual({ idleMs: BRIDGE_RUN_IDLE_TIMEOUT_MS, ceilingMs: null })
    expect(runWaitPolicyFor(5_000)).toEqual({ idleMs: BRIDGE_RUN_IDLE_TIMEOUT_MS, ceilingMs: 5_000 })
  })
})

describe('心跳续期', () => {
  /** 一次"要跑 `ms` 才回"的运行面。 */
  const runThatTakes = (ms: number): RunFace => ({
    run: () => new Promise((resolve) => { setTimeout(() => resolve({ success: true, message: '扫完了' }), ms) }),
  })

  it('① 每 500ms 续一次，跑 10 分钟的调用活着拿到结果（旧那条固定 30 秒在这里必红）', async () => {
    const doc = wired(runThatTakes(600_000))
    const policy: RunWaitPolicy = { idleMs: 1_000, ceilingMs: null }
    const handle = doc.beginCall('runner.run', ['bitv', {}], policy)
    const ticks = beating(handle.renew, handle.promise, 500)
    const seen = track(handle.promise)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(ticks()).toBeGreaterThan(0)
    expect(seen()).toBe('pending')
    await vi.advanceTimersByTimeAsync(400_000)
    expect(seen()).toBe('resolved')
    await expect(handle.promise).resolves.toMatchObject({ success: true, message: '扫完了' })
  })

  it('② 阳性对照：同样这条调用，一次都不续期就在 idleMs 处判 timeout', async () => {
    const doc = wired(runThatTakes(600_000))
    const handle = doc.beginCall('runner.run', ['bitv', {}], { idleMs: 1_000, ceilingMs: null })
    const settled = reasonOf(handle.promise)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await settled).toBe('timeout')
  })

  it('③ 阳性对照：上限压得住心跳——声明 3 秒的节点，一路续期也在 3 秒落定', async () => {
    const doc = wired(runThatTakes(600_000))
    const handle = doc.beginCall('runner.run', ['bitv', {}], { idleMs: 1_000, ceilingMs: 3_000 })
    const ticks = beating(handle.renew, handle.promise, 100)
    const settled = reasonOf(handle.promise)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await settled).toBe('run-timeout')
    expect(ticks()).toBeGreaterThan(0)
  })

  it('④ 迟到的续期不许复活已结算的请求', async () => {
    const doc = wired({ run: async () => ({ success: true, message: 'ok' }) })
    const handle = doc.beginCall('runner.run', ['bitv', {}], { idleMs: 1_000, ceilingMs: null })
    await vi.advanceTimersByTimeAsync(0)
    await expect(handle.promise).resolves.toMatchObject({ success: true })
    handle.renew()
    // 复活的话这一轮里会冒出一条未落定的 rejection（进程级噪声）；走完十轮 idle 仍无事 = 没复活。
    await vi.advanceTimersByTimeAsync(10_000)
    expect(handle.id).not.toBe('')
  })

  it('⑤ 不给策略就是原来那条固定上界（普通动词的形状没被顺手改掉）', async () => {
    const doc = wired({ run: () => new Promise(() => undefined) })
    const settled = reasonOf(doc.call('runner.run', 'bitv', {}))
    await vi.advanceTimersByTimeAsync(BRIDGE_REQUEST_TIMEOUT_MS)
    expect(await settled).toBe('timeout')
  })
})
