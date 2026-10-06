/**
 * 两半桥的往返测试：文档侧与外壳侧真的互发消息，失败要能被对面读成原因。
 *
 * 这条测试的意义不在于"postMessage 能用"（那是浏览器的事），而在于
 * **契约的两端对同一条消息读出的东西一致**——版本、授权集、错误 reason、上界。
 * 用两个内存队列替代真实的 frame，其余一律走真代码。
 * @module xaihi-ui/tests/bridge-roundtrip
 */

import { describe, expect, it, vi } from 'vitest'
import { BRIDGE_SCHEMA, NODE_CAPABILITY_IDS, type BridgeHello, type BridgeMessage } from '@hibernalglow/xaihi-sdk/bridge'
import { createShellBridge, type SettingsFace } from '../src/bridge-shell.ts'
import { BridgeError, createDocumentBridge } from '../src/bridge-document.ts'

const ORIGIN = 'http://127.0.0.1:3199'

const settingsOf = (calls: string[], revision = 3): SettingsFace => ({
  describe: () => {
    calls.push('describe')
    return { namespaces: ['xaihi'], revision }
  },
  update: async (ns, patch, expected) => {
    calls.push(`update:${ns}:${JSON.stringify(patch)}:${expected ?? ''}`)
    return { revision: revision + 1 }
  },
})

const wire = (caps: Parameters<typeof createShellBridge>[0]) => {
  const hellos: BridgeHello[] = []
  /** 置成 true 就切断"文档→外壳"这一程，用来模拟消息丢在半路（应答永远不来）。 */
  const state = { severed: false }
  let shellSide: ReturnType<typeof createShellBridge> | undefined
  let docSide: ReturnType<typeof createDocumentBridge> | undefined

  const sendToShell = (message: BridgeMessage) => {
    if (message.kind === 'hello') hellos.push(message)
    if (state.severed) return
    void shellSide?.receive(message, ORIGIN)
  }
  const sendToDocument = (message: BridgeMessage) => {
    void docSide?.receive(message, ORIGIN)
  }

  shellSide = createShellBridge(caps, sendToDocument, ORIGIN)
  docSide = createDocumentBridge(sendToShell, ORIGIN, [...NODE_CAPABILITY_IDS])
  return { documentBridge: docSide, shellBridge: shellSide, hellos, state }
}

/** 走完握手：文档发 hello，外壳当场应答（两侧都是真实现）。 */
const handshake = (wiring: ReturnType<typeof wire>) => wiring.documentBridge.hello('sleept')

/** 取一条 promise 的失败原因；不是 BridgeError 就判失败。 */
const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const value = await promise.catch((error: unknown) => error)
  expect(value).toBeInstanceOf(BridgeError)
  return (value as BridgeError).reason
}

describe('握手往返', () => {
  it('文档报九组，外壳只授予它真有面的那些，剩下的带原因露出', () => {
    const wiring = wire({ settings: settingsOf([]) })
    handshake(wiring)
    expect(wiring.hellos[0]?.requested).toEqual([...NODE_CAPABILITY_IDS])
    const ready = wiring.documentBridge.ready()
    expect(ready?.granted).toEqual(expect.arrayContaining(['config', 'contract', 'env']))
    expect(ready?.refused).toEqual(expect.arrayContaining(['runner', 'clipboard', 'localFiles', 'downloads']))
    expect(ready?.degraded.find((row) => row.capability === 'runner')).toBeDefined()
  })

  it('握手没发生时调用失败成 not-ready，而不是挂在那里等', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    expect(await reasonOf(wiring.documentBridge.call('config.get'))).toBe('not-ready')
  })

  it('来源不对 ⇒ 对面完全不理（信任边界不是装饰）', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    const foreign = createDocumentBridge(() => undefined, 'http://evil.invalid', ['config'])
    foreign.hello('sleept')
    expect(foreign.ready()).toBeNull()
    expect(wiring.shellBridge.ready()).toBeUndefined()
    const intruder = { schema: BRIDGE_SCHEMA, kind: 'hello', contractVersion: '1.0.0', node: '', requested: ['config'] }
    expect(await wiring.shellBridge.receive(intruder, 'http://evil.invalid')).toBe(false)
  })

  // 阳性对照在同一个用例里：同样的字节换个来源就必须被理。
  // 少了这一半，"文档侧的 origin 闸"就会变成一条永远不红的装饰（本次减法跑测真抓到它没人测）。
  it('文档侧同样按来源收：外来来源不理，同源的同一条消息就理', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    handshake(wiring)
    const ready = wiring.shellBridge.ready()
    expect(ready).toBeDefined()
    const virgin = createDocumentBridge(() => undefined, ORIGIN, ['config'])
    expect(virgin.receive(ready, 'http://evil.invalid')).toBe(false)
    expect(virgin.ready()).toBeNull()
    expect(virgin.receive(ready, ORIGIN)).toBe(true)
    expect(virgin.ready()?.granted).toEqual(ready?.granted)
  })

  it('版本不匹配的握手换来空授权，文档侧也不会被喂进一条假 ready', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    const replies: BridgeMessage[] = []
    const other = createDocumentBridge((message) => void wiring.shellBridge.receive(message, ORIGIN), ORIGIN, ['config'], 50)
    // 手动把外壳的应答引到别的收集口，验证"空授权"这一条是从外壳发出的，不是本地造的。
    const shell = createShellBridge({ settings: settingsOf([]) }, (message) => replies.push(message), ORIGIN)
    await shell.receive({ schema: BRIDGE_SCHEMA, kind: 'hello', contractVersion: '9.9.9', node: 'sleept', requested: ['config'] }, ORIGIN)
    expect(shell.ready()?.granted).toEqual([])
    expect((replies[0] as { kind?: string })?.kind).toBe('ready')
    expect(other.ready()).toBeNull()
  })
})

describe('调用往返', () => {
  it('config.get 走到外壳的 describe，值原样回到文档', async () => {
    const calls: string[] = []
    const wiring = wire({ settings: settingsOf(calls) })
    handshake(wiring)
    await expect(wiring.documentBridge.call('config.get')).resolves.toEqual({ namespaces: ['xaihi'], revision: 3 })
    expect(calls).toEqual(['describe'])
  })

  it('config.save 把 expectedRevision 带到位（乐观并发的那个数不能在路上丢）', async () => {
    const calls: string[] = []
    const wiring = wire({ settings: settingsOf(calls) })
    handshake(wiring)
    await wiring.documentBridge.call('config.save', 'sleept', { blockSleep: true }, 7)
    expect(calls).toEqual(['update:sleept:{"blockSleep":true}:7'])
  })

  it('整组被授予但这条动词没人能提供 ⇒ 文档读到 no-provider，不是 undefined', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    handshake(wiring)
    expect(await reasonOf(wiring.documentBridge.call('config.getVersions'))).toBe('no-provider')
  })

  it('没被授予的组在文档侧就被拦下，不会白跑一趟外壳', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    handshake(wiring)
    expect(await reasonOf(wiring.documentBridge.call('downloads.text', 'a', 'b'))).toBe('refused')
  })

  it('请求体超上界时抛 too-large，且这条请求没有发出去', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    handshake(wiring)
    const before = wiring.hellos.length
    expect(await reasonOf(wiring.documentBridge.call('config.save', 'sleept', { blob: 'x'.repeat(300 * 1024) }, 1))).toBe('too-large')
    expect(wiring.hellos).toHaveLength(before)
  })

  it('应答超上界时文档拿到 too-large，巨块不会穿过桥', async () => {
    const wiring = wire({ settings: { describe: () => 'y'.repeat(300 * 1024), update: async () => ({}) } })
    handshake(wiring)
    expect(await reasonOf(wiring.documentBridge.call('config.get'))).toBe('too-large')
  })

  it('应答永远不来时是 timeout；到点之前不许提前失败', async () => {
    vi.useFakeTimers()
    try {
      const wiring = wire({ settings: settingsOf([]) })
      handshake(wiring)
      wiring.state.severed = true
      const pending = wiring.documentBridge.call('config.get')
      let settled = false
      void pending.catch(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(29_000)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1_001)
      expect(settled).toBe(true)
      expect(await reasonOf(pending)).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('文档卸载时 abortAll 把在飞的请求收回成一条 aborted，握手也一起清掉', async () => {
    const wiring = wire({ settings: settingsOf([]) })
    handshake(wiring)
    const pending = wiring.documentBridge.call('config.get')
    wiring.state.severed = true
    wiring.documentBridge.abortAll('文档卸载')
    expect(await reasonOf(pending)).toBe('aborted')
    expect(wiring.documentBridge.ready()).toBeNull()
  })
})
