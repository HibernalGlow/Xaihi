/**
 * 外壳能力面适配器的测试：远程信封必须拆，拆不开就必须抛，不能把 Promise 或 undefined 交出去。
 * @module xaihi-ui/tests/shell-caps
 */

import { describe, expect, it } from 'vitest'
import { resolveEnv, shellCapsFrom } from '../src/client/shell-caps.ts'
import { createShellBridge, type BridgeMessage } from '@hibernalglow/xaihi-sdk/bridge'

const okResult = (value: unknown) => ({ ok: true as const, value })
const failResult = (code: string, message: string) => ({ ok: false as const, error: { code, message } })

describe('resolveEnv', () => {
  it('偏好是显式值时直接用它', () => {
    expect(resolveEnv({ preference: 'dark' })).toEqual({ theme: 'dark', platform: 'web' })
  })

  it('偏好是 system 时用 matchMedia 落成两值之一，而不是把 system 交出去', () => {
    const dark = resolveEnv({ preference: 'system', prefersDark: () => ({ matches: true }) })
    const light = resolveEnv({ preference: 'system', prefersDark: () => ({ matches: false }) })
    expect(dark?.theme).toBe('dark')
    expect(light?.theme).toBe('light')
  })

  it('偏好读不到、或 system 却没有 matchMedia 可用时返回 undefined（宁缺勿造）', () => {
    expect(resolveEnv({})).toBeUndefined()
    expect(resolveEnv({ preference: 'system' })).toBeUndefined()
  })

  it('桌面壳的 UA 会被认成 electron，不是一律写 web', () => {
    expect(resolveEnv({ preference: 'light', userAgent: 'Mozilla/5.0 Electron/33.0.0' })?.platform).toBe('electron')
    expect(resolveEnv({ preference: 'light', userAgent: 'Mozilla/5.0 Chrome' })?.platform).toBe('web')
  })
})

describe('shellCapsFrom 的设置面', () => {
  it('describe 的 RemoteResult 被拆开，value 原样成为应答', async () => {
    const caps = shellCapsFrom({ settings: { describe: async () => okResult({ revision: 4 }), update: async () => okResult({}) } })
    const sent: BridgeMessage[] = []
    const bridge = createShellBridge(caps, (message) => sent.push(message), 'http://127.0.0.1:3199')
    await bridge.receive({ schema: 'xaihi.bridge/1', kind: 'hello', contractVersion: '1.0.0', node: '', requested: ['config'] }, 'http://127.0.0.1:3199')
    await bridge.receive({ schema: 'xaihi.bridge/1', kind: 'request', id: 'r1', method: 'config.get', args: ['sleept'] }, 'http://127.0.0.1:3199')
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('没等到应答')
    expect(reply.ok).toBe(true)
    expect(reply.value).toEqual({ revision: 4 })
    // 交出去的是拆过信封的值，不是一个 Promise（Promise 过不了结构化克隆）
    expect(typeof reply.value).toBe('object')
  })

  it('远程报失败时抛出的是带 reason 的错误，桥原样转成 no-provider 之外的真实失败', async () => {
    const caps = shellCapsFrom({ settings: { describe: async () => failResult('SETTINGS_CONFLICT', '第 7 版被别人改过'), update: async () => okResult({}) } })
    const sent: BridgeMessage[] = []
    const bridge = createShellBridge(caps, (message) => sent.push(message), 'http://127.0.0.1:3199')
    await bridge.receive({ schema: 'xaihi.bridge/1', kind: 'hello', contractVersion: '1.0.0', node: '', requested: ['config'] }, 'http://127.0.0.1:3199')
    await bridge.receive({ schema: 'xaihi.bridge/1', kind: 'request', id: 'r2', method: 'config.get', args: ['sleept'] }, 'http://127.0.0.1:3199')
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('没等到应答')
    expect(reply.ok).toBe(false)
    expect(reply.error?.reason).toBe('SETTINGS_CONFLICT')
    expect(reply.error?.detail).toContain('被别人改过')
  })

  it('没拿到远程设置面时，config 组整组不被授予，且退化原因说清是哪一格没读到', () => {
    const caps = shellCapsFrom({})
    const sent: BridgeMessage[] = []
    const bridge = createShellBridge(caps, (message) => sent.push(message), 'http://127.0.0.1:3199')
    void bridge.receive({ schema: 'xaihi.bridge/1', kind: 'hello', contractVersion: '1.0.0', node: '', requested: ['config'] }, 'http://127.0.0.1:3199')
    const ready = bridge.ready()
    expect(ready?.granted).not.toContain('config')
    expect(ready?.degraded.find((row) => row.capability === 'config')?.reason).toContain('ctx.remote.settings')
  })

  it('runner 组的退化原因点名 P1，而不是留一句通用文案', () => {
    const ready = shellCapsFrom({}).reasons?.runner
    expect(ready).toContain('agentId')
  })

  it('阳性对照：把设置面接上之后，同一份握手就必须授予 config（否则上面那两条是空判据）', async () => {
    const without = shellCapsFrom({})
    const withSettings = shellCapsFrom({ settings: { describe: async () => okResult({}), update: async () => okResult({}) } })
    const grantOf = async (caps: ReturnType<typeof shellCapsFrom>) => {
      const bridge = createShellBridge(caps, () => undefined, 'http://127.0.0.1:3199')
      await bridge.receive({ schema: 'xaihi.bridge/1', kind: 'hello', contractVersion: '1.0.0', node: '', requested: ['config'] }, 'http://127.0.0.1:3199')
      return bridge.ready()?.granted ?? []
    }
    expect(await grantOf(without)).not.toContain('config')
    expect(await grantOf(withSettings)).toContain('config')
  })

  it('阳性对照：注入 runner 时，runner 组被授予，且 reasons 中不含 runner 拒绝原因', async () => {
    const runner = {
      run: async (nodeId: string, input: unknown) => ({ success: true, message: 'ok', data: { nodeId, input } }),
    }
    const caps = shellCapsFrom({ runner })
    expect(caps.runner).toBe(runner)
    expect(caps.reasons?.runner).toBeUndefined()

    const sent: BridgeMessage[] = []
    const bridge = createShellBridge(caps, (message) => sent.push(message), 'http://127.0.0.1:3199')
    await bridge.receive({ schema: 'xaihi.bridge/1', kind: 'hello', contractVersion: '1.0.0', node: '', requested: ['runner'] }, 'http://127.0.0.1:3199')
    const ready = bridge.ready()
    expect(ready?.granted).toContain('runner')
    expect(ready?.refused).not.toContain('runner')

    await bridge.receive({ schema: 'xaihi.bridge/1', kind: 'request', id: 'run-1', method: 'runner.run', args: ['sleept', { minutes: 10 }] }, 'http://127.0.0.1:3199')
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('没等到应答')
    expect(reply.ok).toBe(true)
    expect(reply.value).toEqual({ success: true, message: 'ok', data: { nodeId: 'sleept', input: { minutes: 10 } } })
  })
})
