/**
 * 节点内存保护设置这一格的读写判据。
 *
 * 钉的是四件会真出事的事：
 * 1. 写是**整份 Config 的一格**——不先读就把整份交出去，会抹掉别人的字段（verbose/nodeUi…）；
 * 2. 冲突必须是**读得回的状态**（消息留住、reason 标出来），不能被 catch 成"看起来失败了"；
 * 3. 形状不合的写在**出门之前**就被拒，桥上不留痕迹；
 * 4. 写成功的判据是**再读一次**，不是"回包里带值"——真桥的写应答特意只回版本号
 *    （`packages/node-sdk/src/bridge-shell.ts` 的 `config.save` 分支），按回包认成功会把
 *    每一次正常写都报成失败。
 *
 * 阳性对照：`save` 里断言收到的整份对象与版本号；拒绝路径断"一次都没调用 save"；
 * 装配缺失那条断的是"读回来 supported:false + 原因"，而不是默认数字；
 * 适配那两条分别喂真包法与一份形状不明的东西，后者必须报"读不到这一格"。
 *
 * @module xaihi-ui/tests/local-backend-control
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  configFaceFromDocumentConfig,
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

/**
 * 装配一张假面：存的是**可写的整份**，所以写完再读能读到刚写进去的东西
 * （真面就是这个行为，写成功的判据因此必须是回读）。
 */
function inject(config: unknown, revision?: number) {
  const saved: Array<{ config: unknown, revision: number | undefined }> = []
  let stored = config
  let storedRevision = revision
  const face: ConfigFace = {
    get: async () => ({ config: stored, ...(storedRevision === undefined ? {} : { revision: storedRevision }) }),
    save: async (whole, expectedRevision) => {
      saved.push({ config: whole, revision: expectedRevision })
      stored = whole
      if (storedRevision !== undefined) storedRevision += 1
      // 真桥的写应答就这一份（投影过）；这里刻意不多带值。
      return storedRevision === undefined ? {} : { revision: storedRevision }
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

  it('写：回包只带版本号也算成功（真桥就是这么回的）', async () => {
    inject({ ...OTHERS, nodeMemoryProtection: VALUE }, 7)
    const state = await setNodeMemoryProtection({ ...VALUE, defaultPolicy: { ...VALUE.defaultPolicy, maxRetainedEvents: 7 } })
    expect(state.supported).toBe(true)
    expect(state.settings?.defaultPolicy.maxRetainedEvents).toBe(7)
    expect(state.revision, '版本号要从写应答里读回来，界面才说得出"这是第几版"').toBe(8)
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

  it('写：回读时那一格不见了按"没确认"处理', async () => {
    setNodeMemoryProtectionFace({
      get: (() => {
        let calls = 0
        return async () => {
          calls += 1
          // 第一次（写之前）有这一格，回读时没了 ⇒ 不能报成功。
          return { config: calls === 1 ? { ...OTHERS, nodeMemoryProtection: VALUE } : { ...OTHERS }, revision: 1 }
        }
      })(),
      save: async () => ({ revision: 2 }),
    })
    await expect(setNodeMemoryProtection(VALUE)).rejects.toThrow('读不回这一格')
  })
})

describe('host 的 config 面到这一格之间的适配', () => {
  /** 真包法：`getUi()` 回 `{ ns, value, revision }`，`saveUi()` 只回 `{ revision }`。 */
  function fakeSurface(config: unknown, revision?: number) {
    const pushes: unknown[] = []
    let stored = config
    return {
      pushes,
      surface: {
        getUi: async () => ({ ns: 'xaihi-core', value: stored, ...(revision === undefined ? {} : { revision }) }),
        saveUi: async (whole: unknown) => {
          pushes.push(whole)
          stored = whole
          return { revision: (revision ?? 0) + pushes.length }
        },
      },
    }
  }

  it('按真包法拆得开：值从 value 拿，版本号从 revision 拿', async () => {
    const { surface, pushes } = fakeSurface({ ...OTHERS, nodeMemoryProtection: VALUE }, 5)
    setNodeMemoryProtectionFace(configFaceFromDocumentConfig(surface))
    const read = await getNodeMemoryProtection()
    expect(read.supported).toBe(true)
    expect(read.revision).toBe(5)
    const written = await setNodeMemoryProtection({ ...VALUE, defaultPolicy: { ...VALUE.defaultPolicy, maxRssGrowthMiB: 128 } })
    expect(written.settings?.defaultPolicy.maxRssGrowthMiB).toBe(128)
    expect((pushes[0] as Record<string, unknown>).nodeMemoryProtection, '过桥的整份里得带着这一格').toBeDefined()
    expect(written.revision).toBe(6)
  })

  it('阳性对照：包法认不出时报"读不到这一格"，不把那份东西当 Config 用', async () => {
    setNodeMemoryProtectionFace(configFaceFromDocumentConfig({
      getUi: async () => 'not-a-view',
      saveUi: async () => undefined,
    }))
    const read = await getNodeMemoryProtection()
    expect(read.supported).toBe(false)
    expect(read.settings).toBeNull()
    expect(read.reason, '原因要指向回包形状，而不是含糊的"不支持"').toContain('对象形')
  })
})
