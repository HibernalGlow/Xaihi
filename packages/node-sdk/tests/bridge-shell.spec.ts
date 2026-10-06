/**
 * 外壳那一半桥的证伪测试。
 *
 * 全部用注入的假面，不碰 DSH：这里要钉的是"授权顺序"和"没提供者就明说"。
 * 真远程面的行为已经在实机上读回来过一遍（2026-10-06，端口 3399 的隔离宿主：
 * `config.get` / `config.save` 与 `state` 那一条 volatile 字段的读写都走通了），
 * 所以这里的假面是按**读回来的形状**写的（`namespaces[]` 带 `ns` / `value` / `revision`），
 * 不是随手编的。
 * @module xaihi-ui/tests/bridge-shell
 */

import { describe, expect, it } from 'vitest'
import { BRIDGE_CONTRACT_VERSION, BRIDGE_SCHEMA, NODE_CAPABILITY_IDS, type BridgeMessage } from '@hibernalglow/xaihi-sdk'
import { createShellBridge, type SettingsFace } from '../src/bridge-shell.ts'

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
  it('给了 settings 面时 config 与 state 进 granted，没带的组各自以退化露出', async () => {
    const calls: string[] = []
    const { sent, bridge } = harness({ settings: settingsOf(calls) })
    await bridge.receive(hello(), ORIGIN)
    const ready = bridge.ready()
    expect(ready?.granted).toEqual(expect.arrayContaining(['config', 'state', 'contract']))
    // env 也在这串里：外壳没随 caps 带环境快照，那这一格就不能算给了（同一条说谎形状见 roundtrip 那条）。
    expect(ready?.refused).toEqual(expect.arrayContaining(['runner', 'clipboard', 'downloads', 'localFiles', 'env']))
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
    const { sent, bridge } = harness({ extra: ['workspace'] })
    await bridge.receive(hello(), ORIGIN)
    await bridge.receive(request('workspace.listComponents'), ORIGIN)
    const reply = sent.filter((m) => m.kind === 'response').at(-1)
    if (reply?.kind !== 'response') throw new Error('unreachable')
    expect(reply.error?.reason).toBe('document-owned')
  })

  describe('state 的持久快照', () => {
    /** 设置文档里我们那一格的真实形状（2026-10-06 在端口 3399 的宿主上读回来的字段名）。 */
    const stateFace = (calls: string[], rows: unknown[], withMutate = true): SettingsFace => ({
      describe: () => {
        calls.push('describe')
        return { namespaces: rows }
      },
      update: async (ns, patch, revision) => {
        calls.push(`update:${ns}:${JSON.stringify(patch)}:${revision ?? ''}`)
        return { revision: 9 }
      },
      ...(withMutate ? {
        mutate: async (ns: string, ops: readonly unknown[], revision?: number) => {
          calls.push(`mutate:${ns}:${JSON.stringify(ops)}:${revision ?? ''}`)
          return { revision: 7 }
        },
      } : {}),
    })

    const rowsWith = (node: string, json: string) => ([{
      ns: 'xaihi-core',
      revision: 4,
      value: { verbose: false, nodeState: { [node]: json, 'other-node': '{"keep":1}' } },
    }])

    it('只把问的那个节点那一条发回去，别的节点的数据不过桥', async () => {
      const calls: string[] = []
      const { sent, bridge } = harness({ settings: stateFace(calls, rowsWith('sleept', '{"a":1}')) })
      await bridge.receive(hello(), ORIGIN)
      await bridge.receive(request('state.getData', ['sleept']), ORIGIN)
      const reply = sent.filter((m) => m.kind === 'response').at(-1)
      if (reply?.kind !== 'response' || reply.ok !== true) throw new Error('期望一条成功应答')
      expect(reply.value).toEqual({ json: '{"a":1}', revision: 4 })
      expect(JSON.stringify(reply.value)).not.toContain('other-node')
    })

    it('写优先走路径级 mutate：各节点各写自己那一段', async () => {
      const calls: string[] = []
      const { sent, bridge } = harness({ settings: stateFace(calls, rowsWith('sleept', '{"a":1}')) })
      await bridge.receive(hello(), ORIGIN)
      await bridge.receive(request('state.patchData', ['sleept', '{"a":2}', 4]), ORIGIN)
      const write = calls.find((c) => c.startsWith('mutate:')) ?? ''
      expect(write).not.toBe('')
      expect(write).toContain('"path":["nodeState","sleept"]')
      expect(write).toContain(':4')
      const reply = sent.filter((m) => m.kind === 'response').at(-1)
      if (reply?.kind !== 'response' || reply.ok !== true) throw new Error('期望一条成功应答')
      expect(reply.value).toEqual({ revision: 7 })
    })

    it('面没给 mutate 时才整段回写，并且保住别的节点那几格', async () => {
      const calls: string[] = []
      const patches: Record<string, unknown>[] = []
      const face: SettingsFace = {
        describe: () => {
          calls.push('describe')
          return { namespaces: rowsWith('sleept', '{"a":1}') }
        },
        update: async (ns, patch, revision) => {
          calls.push(`update:${ns}:${revision ?? ''}`)
          patches.push(patch)
          return { revision: 9 }
        },
      }
      const { bridge } = harness({ settings: face })
      await bridge.receive(hello(), ORIGIN)
      await bridge.receive(request('state.replaceData', ['sleept', '{"a":3}', 4]), ORIGIN)
      expect(calls).toEqual(['describe', 'update:xaihi-core:4'])
      expect(patches[0]).toEqual({ nodeState: { 'sleept': '{"a":3}', 'other-node': '{"keep":1}' } })
    })

    it('节点 id 的形状闸与路由那侧同一份判据：空、过长、原型键、路径段、大写都拒', async () => {
      const calls: string[] = []
      const { sent, bridge } = harness({ settings: stateFace(calls, rowsWith('sleept', '{"a":1}')) })
      await bridge.receive(hello(), ORIGIN)
      // `../etc` 这条是 2026-10-06 真宿主上实测到的**两处门不一致**：路由按 NODE_PATTERN 拒，
      // 桥上当时把它当一个普通键收下了（写进 nodeState["../etc"]）。现在两道门读同一份判据。
      for (const bad of ['', 'x'.repeat(65), '__proto__', '../etc', 'Sleept', 'a/b']) {
        await bridge.receive(request('state.getData', [bad], `r-${bad.length}-${calls.length}`), ORIGIN)
      }
      const denials = sent.filter((m) => m.kind === 'response' && m.ok === false)
      expect(denials).toHaveLength(6)
      for (const denial of denials) {
        if (denial.kind !== 'response') continue
        expect(denial.error?.reason).toBe('bad-args')
        expect((denial.error?.detail ?? '').length).toBeGreaterThan(0)
      }
      // 阳性对照的反面：合形状的合法 id 必须走通，否则上面六条是恒真。
      await bridge.receive(request('state.getData', ['sleept'], 'r-ok'), ORIGIN)
      const okReply = sent.filter((m) => m.kind === 'response').at(-1)
      expect(okReply?.kind === 'response' && okReply.ok).toBe(true)
    })

    it('设置里没声明那一格时报 state-namespace-missing，而不是回一个 undefined 装作读到了', async () => {
      const calls: string[] = []
      const { sent, bridge } = harness({ settings: stateFace(calls, [{ ns: 'xaihi-core', revision: 1, value: { verbose: false } }]) })
      await bridge.receive(hello(), ORIGIN)
      await bridge.receive(request('state.getData', ['sleept']), ORIGIN)
      const reply = sent.filter((m) => m.kind === 'response').at(-1)
      if (reply?.kind !== 'response' || reply.ok === true) throw new Error('期望一条失败应答')
      expect(reply.error?.reason).toBe('state-namespace-missing')
    })

    it('没给设置面时 state 整组以退化露出（持久出口和 config 走同一条面）', async () => {
      const { bridge } = harness({})
      await bridge.receive(hello(), ORIGIN)
      expect(bridge.ready()?.refused).toEqual(expect.arrayContaining(['state']))
      expect(bridge.ready()?.degraded.some((row) => row.capability === 'state')).toBe(true)
    })
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
