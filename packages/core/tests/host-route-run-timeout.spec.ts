/**
 * `/xaihi/host` 上那道**服务端**等待闸：`runner.run` 按心跳续期，节点声明的上限压得住它。
 *
 * 为什么这条必须单独有判据：桥上有两道 30 秒闸（文档侧 `bridge-document.ts` 与这条路由），
 * 只改客户端的结果是"面板还在等，路由先回 502"——症状一模一样，而查起来更远。
 * 所以服务端这一侧要自己证三件事：
 * 1. 有账本事件就不截（跑 40 秒的运行活着回 200）；
 * 2. 没事件一定截（阳性对照：同样这条调用在 30 秒处 502）；
 * 3. 节点声明的 `runTimeoutMs` 是硬上限，心跳绕不过去。
 *
 * 再加一条退化判据：装配侧没给 `onRunActivity` 时退回固定上界，而不是假装自己有心跳。
 * @module xaihi-core/tests/host-route-run-timeout
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  BRIDGE_CONTRACT_VERSION,
  BRIDGE_REQUEST_TIMEOUT_MS,
  BRIDGE_SCHEMA,
  NODE_CAPABILITY_IDS,
  STATE_SETTINGS_NS,
  type BridgeMethod,
} from '@hibernalglow/xaihi-sdk/bridge'
import { HOST_PATH, hostBridgeHandler, type SettingsServiceLike } from '../src/host-routes.ts'

const SID = 'ab'.repeat(16)

const fakeRequest = (body: string, url = `${HOST_PATH}?sid=${SID}`): IncomingMessage =>
  Object.assign(Readable.from([Buffer.from(body, 'utf8')]), { method: 'POST', url }) as unknown as IncomingMessage

const helloBody = (): string => JSON.stringify({
  schema: BRIDGE_SCHEMA,
  kind: 'hello',
  contractVersion: BRIDGE_CONTRACT_VERSION,
  node: 'bitv',
  requested: [...NODE_CAPABILITY_IDS],
})

const requestBody = (method: BridgeMethod, args: readonly unknown[], id = `r-${Math.random().toString(16).slice(2, 8)}`): string =>
  JSON.stringify({ schema: BRIDGE_SCHEMA, kind: 'request', id, method, args })

interface Captured { status?: number, body?: Record<string, unknown> }

/** 走一次处理器，把状态码与 JSON 体收下来。 */
async function ask(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, body: string): Promise<Captured> {
  const seen: Captured = {}
  const res = {
    writeHead(status: number) { seen.status = status; return this },
    setHeader() { return this },
    end(chunk?: string) {
      if (typeof chunk === 'string') { try { seen.body = JSON.parse(chunk) as Record<string, unknown> } catch { /* 非 JSON 的体不参与判据 */ } }
      return this
    },
  } as unknown as ServerResponse
  await handler(fakeRequest(body), res)
  return seen
}

/** 只认 `runner.run` 的假设置面：路由要求 settings 在场才谈 config/state，值本身不是这里的判据。 */
const settings = (): SettingsServiceLike => ({
  describe: () => [{ ns: STATE_SETTINGS_NS, revision: 1, value: {} }],
  update: async () => ({ ns: STATE_SETTINGS_NS, revision: 2 }),
} as unknown as SettingsServiceLike)

/** 一条"要跑 `ms` 才回"的运行面；`beatEveryMs` 决定它多久发一次心跳。 */
function runFace(options: { resolvesInMs: number, beatEveryMs?: number, ceiling?: number | null }): {
  face: Record<string, unknown>
  listeners: () => number
} {
  const listeners = new Set<() => void>()
  if (options.beatEveryMs !== undefined) {
    setInterval(() => { for (const listener of listeners) listener() }, options.beatEveryMs)
  }
  const face = {
    run: () => new Promise((resolve) => {
      setTimeout(() => resolve({ success: true, message: '扫完了' }), options.resolvesInMs)
    }),
    getInfo: async () => ({ nodeId: 'bitv', reportsProgress: true, runTimeoutMs: options.ceiling ?? null }),
    ...(options.ceiling === undefined ? {} : { runTimeoutFor: () => options.ceiling }),
    onRunActivity: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return { face, listeners: () => listeners.size }
}

const handlerFor = (runner: Record<string, unknown> | undefined) => hostBridgeHandler({
  settings: () => settings(),
  allowedNamespaces: () => new Set([STATE_SETTINGS_NS]),
  ...(runner === undefined ? {} : { runner: () => runner as never }),
})

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('/xaihi/host 的 runner.run 等待闸', () => {
  it('① 每 5 秒一条心跳，跑 40 秒的运行活着回 200', async () => {
    const handler = handlerFor(runFace({ resolvesInMs: 40_000, beatEveryMs: 5_000 }).face)
    await ask(handler, helloBody())
    let captured: Captured | undefined
    void ask(handler, requestBody('runner.run', ['bitv', {}])).then((value) => { captured = value })
    await vi.advanceTimersByTimeAsync(41_000)
    expect(captured?.status).toBe(200)
    expect(captured?.body?.ok).toBe(true)
  })

  it('② 阳性对照：同样这条调用，一条心跳都没有就在 30 秒处 502', async () => {
    const handler = handlerFor(runFace({ resolvesInMs: 40_000 }).face)
    await ask(handler, helloBody())
    let captured: Captured | undefined
    void ask(handler, requestBody('runner.run', ['bitv', {}])).then((value) => { captured = value })
    await vi.advanceTimersByTimeAsync(BRIDGE_REQUEST_TIMEOUT_MS + 1_000)
    expect(captured?.status).toBe(502)
    expect(String(captured?.body?.detail)).toContain('没有新的账本事件')
    // 502 说的是"不再等它"，不许顺手宣称那次运行已经停了。
    expect(String(captured?.body?.detail)).toContain('可能还在继续')
  })

  it('③ 阳性对照：节点声明 6 秒上限时，一路心跳也在 6 秒处 502', async () => {
    const handler = handlerFor(runFace({ resolvesInMs: 40_000, beatEveryMs: 1_000, ceiling: 6_000 }).face)
    await ask(handler, helloBody())
    let captured: Captured | undefined
    void ask(handler, requestBody('runner.run', ['bitv', {}])).then((value) => { captured = value })
    await vi.advanceTimersByTimeAsync(7_000)
    expect(captured?.status).toBe(502)
  })

  it('④ 退化照实说：装配没给 onRunActivity 时退回固定上界，而不是假装有心跳', async () => {
    const bare = {
      run: () => new Promise((resolve) => { setTimeout(() => resolve({ success: true, message: 'ok' }), 40_000) }),
    }
    const handler = handlerFor(bare)
    await ask(handler, helloBody())
    let captured: Captured | undefined
    void ask(handler, requestBody('runner.run', ['bitv', {}])).then((value) => { captured = value })
    await vi.advanceTimersByTimeAsync(BRIDGE_REQUEST_TIMEOUT_MS + 1_000)
    expect(captured?.status).toBe(502)
  })

  it('⑤ 阳性对照：心跳只救 `runner.run`，别的动词一路 502', async () => {
    // 这一条挂着的动词故意选 `runner.cancelCurrent`：它同样过 runner 面，
    // 所以"有心跳就放宽"如果漏了动词判据，这里会被一起放宽掉。
    const listeners = new Set<() => void>()
    setInterval(() => { for (const listener of listeners) listener() }, 1_000)
    const handler = handlerFor({
      run: async () => ({ success: true, message: 'unused' }),
      cancelCurrent: () => new Promise(() => undefined),
      onRunActivity: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    })
    await ask(handler, helloBody())
    let captured: Captured | undefined
    void ask(handler, requestBody('runner.cancelCurrent', [])).then((value) => { captured = value })
    await vi.advanceTimersByTimeAsync(BRIDGE_REQUEST_TIMEOUT_MS + 1_000)
    expect(captured?.status).toBe(502)
  })
})
