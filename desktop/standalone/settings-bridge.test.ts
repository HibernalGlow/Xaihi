import { describe, expect, it } from 'vitest'
import type { DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import { STATE_SETTINGS_NS } from '@hibernalglow/xaihi-sdk/bridge'
import { coordinateProductSettings, touchedValuesUnchanged } from './settings-bridge'

function fixture() {
  let revision = 1
  let value = { appUi: { theme: 'dark' }, nodeUi: { kisaki: '{}' } }
  const data: Record<string, string> = { kisaki: '{"scan":0}', other: '{}' }
  const revisions: number[] = []
  const base = { call: async (method: string, ...args: unknown[]) => {
    if (method === 'config.getUi') return { revision, value: structuredClone(value) }
    if (method === 'state.getData') return { revision, json: data[String(args[0])] }
    if (args[2] !== revision) throw new Error('SETTINGS_CONFLICT')
    revisions.push(args[2] as number)
    if (method === 'config.save') {
      const patch = args[1] as Partial<typeof value>
      value = { appUi: { ...value.appUi, ...patch.appUi }, nodeUi: { ...value.nodeUi, ...patch.nodeUi } }
    } else if (method === 'state.patchData') data[String(args[0])] = JSON.stringify(args[1])
    revision++
    return { revision }
  } } as unknown as DocumentBridge
  return { base, bridge: coordinateProductSettings(base), revisions }
}

describe('共享 core revision 下的独立产品设置', () => {
  it('只比较窄补丁实际触及的叶子，包括数组', () => {
    expect(touchedValuesUnchanged({ x: [1], y: 2 }, { x: [1], y: 3 }, { x: [4] })).toBe(true)
    expect(touchedValuesUnchanged({ x: [1] }, { x: [2] }, { x: [4] })).toBe(false)
  })
  it('其他字段修改后重读 revision，并仍带 expectedRevision 写入', async () => {
    const { bridge, base, revisions } = fixture()
    await bridge.call('config.getUi', STATE_SETTINGS_NS)
    await base.call('config.save', STATE_SETTINGS_NS, { nodeUi: { kisaki: '{"restore":true}' } }, 1)
    await bridge.call('config.save', STATE_SETTINGS_NS, { appUi: { theme: 'light' } }, 1)
    expect(revisions).toEqual([1, 2])
    expect((await bridge.call('config.getUi', STATE_SETTINGS_NS) as any).value).toEqual({ appUi: { theme: 'light' }, nodeUi: { kisaki: '{"restore":true}' } })
  })
  it('同一叶子被另一处修改时拒绝覆盖，错误能读回版本号', async () => {
    const { bridge, base, revisions } = fixture()
    await bridge.call('config.getUi', STATE_SETTINGS_NS)
    await base.call('config.save', STATE_SETTINGS_NS, { appUi: { theme: 'system' } }, 1)
    await expect(bridge.call('config.save', STATE_SETTINGS_NS, { appUi: { theme: 'light' } }, 1)).rejects.toMatchObject({ reason: 'SETTINGS_CONFLICT', message: expect.stringContaining('当前第 2 版') })
    expect(revisions).toEqual([1])
  })
  it('另一节点的状态变化不挡住 Kisaki；同一节点变化必须拒绝', async () => {
    const { bridge, base, revisions } = fixture()
    await bridge.call('state.getData', 'kisaki')
    await base.call('state.patchData', 'other', { other: 1 }, 1)
    await bridge.call('state.patchData', 'kisaki', { scan: 1 }, 1)
    await bridge.call('state.getData', 'kisaki')
    await base.call('state.patchData', 'kisaki', { scan: 2 }, 3)
    await expect(bridge.call('state.patchData', 'kisaki', { scan: 3 }, 3)).rejects.toMatchObject({ reason: 'SETTINGS_CONFLICT' })
    expect(revisions).toEqual([1, 2, 3])
  })
  it('没有原始快照时不自动重试；去掉协调器则相同启动竞争会失败（阳性对照）', async () => {
    const { bridge, base } = fixture()
    await base.call('config.save', STATE_SETTINGS_NS, { nodeUi: { kisaki: '{}' } }, 1)
    await expect(bridge.call('config.save', STATE_SETTINGS_NS, { appUi: { theme: 'light' } }, 1)).rejects.toMatchObject({ reason: 'SETTINGS_CONFLICT' })
    await expect(base.call('config.save', STATE_SETTINGS_NS, { appUi: { theme: 'light' } }, 1)).rejects.toThrow('SETTINGS_CONFLICT')
  })
})
