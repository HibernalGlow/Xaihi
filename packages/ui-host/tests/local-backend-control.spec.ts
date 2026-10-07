/**
 * 节点内存保护设置这一格的读写判据。
 *
 * 钉的是三件会真出事的事：
 * 1. 写是**整份 Config 的一格**——不先读就把整份交出去，会抹掉别人的字段（verbose/nodeUi…）；
 * 2. 冲突必须是**读得回的状态**（消息留住、reason 标出来），不能被 catch 成"看起来失败了"；
 * 3. 形状不合的写在**出门之前**就被拒，桥上不留痕迹。
 *
 * 阳性对照：`save` 里断言收到的整份对象与版本号；拒绝路径断"一次都没调用 save"；
 * 装配缺失那条断的是"读回来 supported:false + 原因"，而不是默认数字。
 *
 * @module xaihi-ui/tests/local-backend-control
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  getNodeMemoryProtection,
  setNodeMemoryProtection,
  setNodeMemoryProtectionFace,
  type ConfigFace,
  type NodeMemoryProtectionSettingsDTO,
} from '../src/backend/localBackendControl.ts'

const VALUE: NodeMemoryProtectionSettingsDTO = {
  defaultPolicy: { maxRssGrowthMiB: 8192, maxHeapGrowthMiB: 4096, maxRetainedEvents: 1000, sampleIntervalMs: 250 },
  nodePolicies: { findz: { maxRssGrowthMiB: 2048, maxHeapGrowthMiB: 1024, maxRetainedEvents: 50, sampleIntervalMs: 500 } },
}

const OTHERS = { verbose: true, uiBundleDir: '/tmp/ui', nodeState: { linedup: 'a' }, nodeUi: { linedup: 'b' } }

/** 装配一张假面：`config` 是宿主回包里的整份 Config，`revision` 是它的版本号。 */
function inject(config: unknown, revision?: number) {
  const saved: Array<{ config: unknown, revision: number | undefined }> = []
  const face: ConfigFace = {
    get: async () => ({ config, ...(revision === undefined ? {} : { revision }) }),
    save: async (whole, expectedRevision) => {
      saved.push({ config: whole, revision: expectedRevision })
      return { config: whole, ...(revision === undefined ? {} : { revision }) }
    },
  }
  setNodeMemoryProtectionFace(face)
  return saved
}

afterEach(() => setNodeMemoryProtectionFace(undefined))

describe('节点内存保护设置这一格', () => {
  it('读：拿回来的是这一格的值，版本号一起带回来', async () => {
    inject({ ...OTHERS, nodeMemoryProtection: VALUE }, 4)
    const state = await getNodeMemoryProtection()
    expect(state.supported).toBe(true)
    expect(state.settings?.nodePolicies.findz?.maxRetainedEvents).toBe(50)
    expect(state.revision).toBe(4)
  })

  it('读：面还没装配时说清是没装配，不拿默认数字装出读到了', async () => {
    setNodeMemoryProtectionFace(undefined)
    const state = await getNodeMemoryProtection()
    expect(state.supported).toBe(false)
    expect(state.settings).toBeNull()
    expect(state.reason).toContain('装配')
  })

  it('读：这一格没声明时说清是没声明，不猜一份', async () => {
    inject({ ...OTHERS })
    const state = await getNodeMemoryProtection()
    expect(state.supported).toBe(false)
    expect(state.reason).toContain('nodeMemoryProtection')
  })

  it('写：整份读回来、只换这一格、别的字段一个都不能少，版本号原样带回', async () => {
    const saved = inject({ ...OTHERS, nodeMemoryProtection: VALUE }, 7)
    const next: NodeMemoryProtectionSettingsDTO = { ...VALUE, defaultPolicy: { ...VALUE.defaultPolicy, sampleIntervalMs: 900 } }
    const state = await setNodeMemoryProtection(next)
    expect(state.settings?.defaultPolicy.sampleIntervalMs).toBe(900)
    expect(saved).toHaveLength(1)
    const written = saved[0]?.config as Record<string, unknown>
    for (const key of Object.keys(OTHERS)) expect(written[key], `写回去的整份里丢了 ${key}`).toEqual(OTHERS[key as keyof typeof OTHERS])
    expect(saved[0]?.revision, '不带版本号写 = 静默覆盖别人的第 N 版').toBe(7)
  })

  it('写：显式给了版本号就用给的（乐观锁由调用方握着）', async () => {
    const saved = inject({ ...OTHERS, nodeMemoryProtection: VALUE }, 7)
    await setNodeMemoryProtection(VALUE, 12)
    expect(saved[0]?.revision).toBe(12)
  })

  it('写：形状不合时一次都不碰桥', async () => {
    const saved = inject({ ...OTHERS, nodeMemoryProtection: VALUE })
    const bad = { defaultPolicy: { ...VALUE.defaultPolicy, sampleIntervalMs: 'x' }, nodePolicies: {} }
    await expect(setNodeMemoryProtection(bad as unknown as NodeMemoryProtectionSettingsDTO)).rejects.toThrow('不是整数')
    expect(saved, '被拒的写不许在桥上留下任何东西').toHaveLength(0)
  })

  it('写：冲突抛出时留住服务端那句，并标成 settings_conflict', async () => {
    setNodeMemoryProtectionFace({
      get: async () => ({ config: { ...OTHERS, nodeMemoryProtection: VALUE }, revision: 3 }),
      save: async () => { throw new Error('SETTINGS_CONFLICT: 第 9 版已被人改过') },
    })
    const error = await setNodeMemoryProtection(VALUE, 3).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('第 9 版')
    expect((error as Error & { reason?: string }).reason).toBe('settings_conflict')
  })

  it('写：读不回整份时拒绝（宁可不写，不可只写自己那一格把别的抹了）', async () => {
    const saved = inject('not a config')
    await expect(setNodeMemoryProtection(VALUE)).rejects.toThrow('读不回整份')
    expect(saved).toHaveLength(0)
  })

  it('写：服务端没把这一格回给回来时按"没确认"处理', async () => {
    setNodeMemoryProtectionFace({
      get: async () => ({ config: { ...OTHERS, nodeMemoryProtection: VALUE } }),
      save: async () => ({ config: { ...OTHERS } }),
    })
    await expect(setNodeMemoryProtection(VALUE)).rejects.toThrow('没在回包里读到')
  })
})
