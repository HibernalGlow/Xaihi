/**
 * 外壳那一半桥的证伪测试。
 *
 * 全部用注入的假面，不碰 DSH：这里要钉的是"授权顺序"和"没提供者就明说"，
 * 而不是某个真远程接口的行为（后者还没在实机上读回来，见模块注释里那条）。
 * @module xaihi-ui/tests/bridge-shell
 */

import { describe, expect, it } from 'vitest'
import { BRIDGE_CONTRACT_VERSION, BRIDGE_SCHEMA, NODE_CAPABILITY_IDS, type BridgeMessage } from '@hibernalglow/xaihi-sdk'
import { createShellBridge, type SettingsFace } from '../src/client/bridge-shell.ts'

const ORIGIN = 'http://127.0.0.1:3199'

const hello = (over: Record<string, unknown> = {}) => ({
  schema: BRIDGE_SCHEMA,
  kind: 'hello',
  contractVersion: BRIDGE_CONTRACT_VERSION,
  node: 'sleept',
  requested: [...NODE_CAPABILITY_IDS],
  ...over,
})

const request = (method: string, args: readonly unknown[] = [], id = 'r1') => ({
  schema: BRIDGE_SCHEMA,
  kind: 'request',
  id,
  method,
  args,
})

const harness = (caps: Parameters<typeof createShellBridge>[0]) => {
  const sent: BridgeMessage[] = []
  const bridge = createShellBridge(caps, (message) => sent.push(message), ORIGIN)
  return { sent, bridge }
}

const settingsOf = (calls: string[]): SettingsFace => ({
  describe: () => {
    calls.push('describe')
    return { namespaces: ['xaihi'] }
  },
  update: async (ns, patch, revision) => {
    calls.push(`update:${ns}:${JSON.stringify(patch)}:${revision ?? ''}`)
    return { revision: 3 }
  },
})

describe('握手', () => {
  it('给了 settings 面时 config 进 granted，没给 runner 时 runner 以退化露出', async () => {
    const calls: string[] = []
    const { sent, bridge } = harness({ settings: settingsOf(calls) })
    await bridge.receive(hello(), ORIGIN)
    const ready = bridge.ready()
    expect(ready?.granted).toEqual(expect.arrayContaining(['config', 'contract', 'env']))
    expect(ready?.refused).toEqual(expect.arrayContaining(['runner', 'clipboard', 'downloads', 'localFiles']))
    expect(sent).toHaveLength(1)
    expect(ready?.degraded.some((row) => row.capability === 'runner')).toBe(true)
  })

  it('握手前来的请求被拒，且不落到任何实现上（授权集还没定）', async () => {
    const calls: string[] = []
    const { sent, bridge } = harness({ settings: settingsOf(calls) })
    await bridge.receive(request('config.get'), ORIGIN)
    const reply = sent[0]
    expect(reply?.kind).toBe('response')
    if (reply?.kind !== 'response') throw new Error('unreachable')
    expect(reply.error?.reason).toBe('not-negotiated')
    expect(calls).toEqual([])
  })

  it('来源不对就整条不理（连握手都不答）', async () => {
    const { sent, bridge } = harness({})
    expect(await bridge.receive(hello(), 'http://evil.invalid')).toBe(false)
    expect(sent).toEqual([])
    expect(bridge.ready()).toBeUndefined()
  })

  it('版本不匹配的握手不会留下一个"半授权"的状态', async () => {
    const { bridge } = harness({ settings: settingsOf([]) })
    await bridge.receive(hello({ contractVersion: '9.9.9' }), ORIGIN)
    expect(bridge.ready()?.granted).toEqual([])
  })
})

describe('请求求值', () => {
  it('config.get 打到注入的 describe 上，config.save 带上 expectedRevision', async () => {
    const calls: string[] = []
    const { sent, bridge } = harness({ settings: settingsOf(calls) })
    await bridge.receive(hello(), ORIGIN)
    await bridge.receive(request('config.get'), ORIGIN)
    await bridge.receive(request('config.save', ['sleept', { blockSleep: true }, 2]), ORIGIN)
    expect(calls).toEqual(['describe', 'update:sleept:{"blockSleep":true}:2'])
    const replies = sent.filter((m): m is Extract<BridgeMessage, { kind: 'response' }> => m.kind === 'response')
    expect(replies[1]?.ok).toBe(true)
  })

  it('没给的面一律 no-provider，而不是返回一个看起来成功的空值', async () => {
    const { sent, bridge } = harness({})
    await bridge.receive(hello(), ORIGIN)
    await bridge.receive(request('config.get'), ORIGIN)
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('unreachable')
    expect(reply.ok).toBe(false)
    expect(reply.error?.reason).toBe('capability-refused')
  })

  it('config 里那批 DSH 没提供物的动词即使组被授予，也单独报 no-provider', async () => {
    const { sent, bridge } = harness({ settings: settingsOf([]) })
    await bridge.receive(hello(), ORIGIN)
    await bridge.receive(request('config.getVersions'), ORIGIN)
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('unreachable')
    expect(reply.error?.reason).toBe('no-provider')
    expect(reply.error?.detail).toContain('ADR-0013')
  })

  it('归文档的动词过桥就是错的形状，要拒而不是代做', async () => {
    const { sent, bridge } = harness({ extra: ['state'] })
    await bridge.receive(hello(), ORIGIN)
    await bridge.receive(request('state.getData'), ORIGIN)
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('unreachable')
    expect(reply.error?.reason).toBe('document-owned')
  })

  it('runner.run 的第三段（回调）不可能过桥：只认 (nodeId, input)', async () => {
    const runs: string[] = []
    const { sent, bridge } = harness({
      runner: { run: async (nodeId) => { runs.push(nodeId); return { runId: `run-${nodeId}` } } },
    })
    await bridge.receive(hello(), ORIGIN)
    await bridge.receive(request('runner.run', ['sleept', { minutes: 5 }, () => undefined]), ORIGIN)
    expect(runs).toEqual(['sleept'])
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('unreachable')
    expect(reply.value).toEqual({ runId: 'run-sleept' })
  })

  it('应答超过桥上界时换成一条 too-large，不把巨块丢进外壳', async () => {
    const { sent, bridge } = harness({
      settings: { describe: () => 'x'.repeat(300 * 1024), update: async () => ({}) },
    })
    await bridge.receive(hello(), ORIGIN)
    await bridge.receive(request('config.get'), ORIGIN)
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('unreachable')
    expect(reply.error?.reason).toBe('too-large')
  })

  it('非桥消息（比如别的插件的 postMessage）返回 false，让监听方继续处理', async () => {
    const { bridge } = harness({})
    expect(await bridge.receive({ hello: 'world' }, ORIGIN)).toBe(false)
    expect(await bridge.receive(null, ORIGIN)).toBe(false)
  })
})
