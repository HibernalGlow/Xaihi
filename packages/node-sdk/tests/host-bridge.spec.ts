/**
 * 消息桥契约的证伪测试。
 *
 * 每条守卫都配"关掉它这条必须红"的形状：解析器对畸形输入必须返回 null 而不是"尽力读出字段"，
 * 版本不匹配必须让整桥拒绝，上界必须能因一条真超限的消息而触发。
 * @module xaihi-sdk/tests/host-bridge
 */

import { describe, expect, it } from 'vitest'
import {
  BRIDGE_CONTRACT_VERSION,
  BRIDGE_METHODS,
  BRIDGE_SCHEMA,
  NODE_CAPABILITY_IDS,
  REQUIRED_CAPABILITIES,
  SHELL_SERVED_METHODS,
  describeNegotiation,
  exceedsMessageBudget,
  groupOf,
  messageBytes,
  negotiateBridge,
  parseBridgeMessage,
  providerOf,
  type BridgeHello,
} from '../src/host-bridge.ts'

const hello = (over: Partial<BridgeHello> = {}): BridgeHello => ({
  schema: BRIDGE_SCHEMA,
  kind: 'hello',
  contractVersion: BRIDGE_CONTRACT_VERSION,
  node: 'sleept',
  requested: [...NODE_CAPABILITY_IDS],
  ...over,
})

describe('动词表的出处', () => {
  it('九组能力名逐字对齐上游的 NodeHostCapabilities', () => {
    expect(NODE_CAPABILITY_IDS).toEqual([
      'contract',
      'state',
      'workspace',
      'runner',
      'clipboard',
      'downloads',
      'localFiles',
      'config',
      'env',
    ])
  })

  it('桥上每个方法名都归属一个真实存在的能力组', () => {
    for (const method of BRIDGE_METHODS) {
      expect(NODE_CAPABILITY_IDS).toContain(groupOf(method))
    }
  })

  it('方法数按组对得上上游那份接口的成员数（少了就是桥漏了动词）', () => {
    const perGroup = NODE_CAPABILITY_IDS.map((group) => [group, BRIDGE_METHODS.filter((m) => groupOf(m) === group).length] as const)
    expect(Object.fromEntries(perGroup)).toEqual({
      contract: 0,
      state: 3,
      workspace: 2,
      runner: 3,
      clipboard: 7,
      downloads: 1,
      localFiles: 7,
      config: 18,
      env: 0,
    })
  })

  it('contract 与 env 不上桥：一个只在握手里出现，一个是数据不是方法', () => {
    expect(BRIDGE_METHODS.filter((m) => m.startsWith('contract.') || m.startsWith('env.'))).toEqual([])
    expect(NODE_CAPABILITY_IDS).toContain('contract')
  })

  it('不可序列化的两个上游方法明确不上桥（stageFiles 收 File、subscribeDrops 交回函数）', () => {
    expect(BRIDGE_METHODS).not.toContain('localFiles.stageFiles')
    expect(BRIDGE_METHODS).not.toContain('localFiles.subscribeDrops')
  })
})

describe('parseBridgeMessage', () => {
  it('合法 hello 被接受且 requested 被拷成新数组（不是把外来的数组交出去）', () => {
    const raw = { ...hello(), requested: ['state' as const] }
    const parsed = parseBridgeMessage(raw, 'from-document')
    expect(parsed?.kind).toBe('hello')
    if (parsed?.kind !== 'hello') throw new Error('unreachable')
    expect(parsed.requested).toEqual(['state'])
    expect(parsed.requested).not.toBe(raw.requested)
  })

  it('schema 不对、kind 不认识、方向不对，三种都返回 null', () => {
    expect(parseBridgeMessage({ ...hello(), schema: 'other/1' }, 'from-document')).toBeNull()
    expect(parseBridgeMessage({ ...hello(), kind: 'nonsense' }, 'from-document')).toBeNull()
    expect(parseBridgeMessage(hello(), 'from-shell')).toBeNull()
  })

  it('方法名拼错就整条拒（不"尽力读出字段"，否则症状会漂到运行时）', () => {
    expect(parseBridgeMessage({ schema: BRIDGE_SCHEMA, kind: 'request', id: '1', method: 'config.ge', args: [] }, 'from-document')).toBeNull()
    expect(parseBridgeMessage({ schema: BRIDGE_SCHEMA, kind: 'request', id: '1', method: 'runner.run', args: [] }, 'from-shell')).toBeNull()
  })

  it('response 的 error 形状不整就不收（reason 缺失会静默变成 undefined 文案）', () => {
    expect(parseBridgeMessage({ schema: BRIDGE_SCHEMA, kind: 'response', id: '1', ok: false, error: {} }, 'from-shell')).toBeNull()
    // 失败且**完全没带原因**也必须拒——"红了但没说为什么"是这条桥上最贵的一类错误。
    expect(parseBridgeMessage({ schema: BRIDGE_SCHEMA, kind: 'response', id: '1', ok: false }, 'from-shell')).toBeNull()
    expect(parseBridgeMessage({ schema: BRIDGE_SCHEMA, kind: 'response', id: '1', ok: false, error: { reason: '' } }, 'from-shell')).toBeNull()
    const ok = parseBridgeMessage({ schema: BRIDGE_SCHEMA, kind: 'response', id: '1', ok: false, error: { reason: 'no-agent' } }, 'from-shell')
    expect(ok?.kind).toBe('response')
  })

  it('hello 里混进未知能力组就整条拒（未知组不能被当成"没要到"）', () => {
    expect(parseBridgeMessage({ ...hello(), requested: ['state', 'printing'] }, 'from-document')).toBeNull()
  })
})

describe('negotiateBridge', () => {
  it('全给时 granted 覆盖请求、没有退化条目', () => {
    const ready = negotiateBridge(hello(), NODE_CAPABILITY_IDS)
    expect(ready.granted).toEqual([...NODE_CAPABILITY_IDS])
    expect(ready.refused).toEqual([])
    expect(ready.degraded).toEqual([])
  })

  it('版本不匹配 ⇒ 整桥拒绝（不是按低版本行事），且每条都带说明', () => {
    const ready = negotiateBridge(hello({ contractVersion: '0.9.0' }), NODE_CAPABILITY_IDS)
    expect(ready.granted).toEqual([])
    expect(ready.refused).toHaveLength(NODE_CAPABILITY_IDS.length)
    expect(ready.degraded.every((row) => row.reason.includes('合同版本不匹配'))).toBe(true)
  })

  it('必给的三组即使文档没在 requested 里点名，也会以 refused 露出来', () => {
    const ready = negotiateBridge(hello({ requested: ['runner'] }), [])
    expect(ready.refused).toEqual(expect.arrayContaining([...REQUIRED_CAPABILITIES]))
    expect(describeNegotiation(ready)).toContain('degraded=')
  })

  it('拒绝原因用装配侧给的那句话，不回落到通用文案', () => {
    const ready = negotiateBridge(hello({ requested: ['runner'] }), [], { runner: '面板拿不到 agentId（上游提案 P1）' })
    expect(ready.degraded[0]?.reason).toContain('agentId')
  })

  it('阳性对照：把 required 三组真的给出去，degraded 必须变空（否则这条守卫是自证的）', () => {
    const ready = negotiateBridge(hello({ requested: [...REQUIRED_CAPABILITIES] }), REQUIRED_CAPABILITIES)
    expect(ready.degraded).toEqual([])
    expect(ready.granted).toHaveLength(REQUIRED_CAPABILITIES.length)
  })
})

describe('动词的归属（谁能兑现它）', () => {
  it('每条动词都恰好落在 document / shell / unprovided 之一，没有"没登记"的那类', () => {
    const counts = { document: 0, shell: 0, unprovided: 0 }
    for (const method of BRIDGE_METHODS) counts[providerOf(method)] += 1
    expect(counts.document + counts.shell + counts.unprovided).toBe(BRIDGE_METHODS.length)
  })

  it('state 与 workspace 归文档：把同一份状态放两个 realm 就是 ADR-0009 实测崩掉的那种形状', () => {
    expect(providerOf('state.getData')).toBe('document')
    expect(providerOf('workspace.listComponents')).toBe('document')
    expect(providerOf('runner.run')).not.toBe('document')
  })

  // 阳性对照：这条把"没提供者"钉成一个数，谁偷偷给 config 历史接了个假实现就会变红。
  it('DSH 的 settings 面只有五个动词 ⇒ 桥上 18 条 config.* 里有 13 条今天没人能提供', () => {
    const unservedConfig = BRIDGE_METHODS.filter((m) => m.startsWith('config.') && providerOf(m) === 'unprovided')
    expect(unservedConfig).toHaveLength(13)
    expect(unservedConfig).toContain('config.getVersions')
    expect(unservedConfig).toContain('config.syncHistory')
    expect(SHELL_SERVED_METHODS).toEqual(['config.get', 'config.save', 'config.getUi', 'config.saveUi', 'config.openFile'])
  })
})

describe('消息上界', () => {
  it('一条真超限的消息被判超限，一条普通请求不被判超限', () => {
    const small = { schema: BRIDGE_SCHEMA, kind: 'request' as const, id: '1', method: 'config.get' as const, args: [] }
    expect(exceedsMessageBudget(small)).toBe(false)
    expect(exceedsMessageBudget({ ...small, args: ['x'.repeat(300 * 1024)] })).toBe(true)
  })

  it('序列化不了的形状算超限，不算放行（循环引用不能被当成"很小"）', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(messageBytes(circular)).toBe(Number.POSITIVE_INFINITY)
    expect(exceedsMessageBudget(circular)).toBe(true)
  })

  it('字节数按 UTF-8 而不是按 JS 字符数（中文文案一条就差好几倍）', () => {
    // 期望值独立算出：`{"t":"啊"}` 是 9 个 JS 字符、11 个 UTF-8 字节（那个汉字 3 字节）。
    const payload = { t: '啊' }
    expect(JSON.stringify(payload).length).toBe(9)
    expect(messageBytes(payload)).toBe(11)
  })
})
