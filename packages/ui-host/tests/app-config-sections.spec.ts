/**
 * 工作台自身设置那三段（`ui` / `themes` / `bgImage`）过桥的判据。
 *
 * 为什么用**真两半桥**而不是一个手搓的假桥：这一层最容易错的地方是"发出去的补丁到底长什么样"
 * —— 是窄补丁还是整份 Config。手搓的假桥只能验"我调了它"，真两半桥能验到外壳那一侧
 * `settings.update(ns, patch, revision)` **逐字收到的那份载荷**，以及服务端的合并语义
 * （`@deepseek-ai/dsh-settings` 的 `mergeLayers`：普通对象递归合并）在真实形状下成不成立。
 * 形状与手法沿用 `tests/persisted-state.spec.ts`（那边量的是 `state.*` 两条边）。
 *
 * 判据分三组：读的四种结局（有值 / 没存过 / 存了 null / 存的不是合法 JSON）、
 * 写的载荷形状（窄补丁 + 命名空间）、以及那条**体积闸**（超预算必须在下发之前拒）。
 *
 * @module xaihi-ui/tests/app-config-sections
 */

import { describe, expect, it } from 'vitest'
import {
  BRIDGE_MAX_MESSAGE_BYTES,
  BridgeError,
  NODE_CAPABILITY_IDS,
  STATE_SETTINGS_NS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type SettingsFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import {
  APP_CONFIG_BG_IMAGE_SECTION,
  APP_CONFIG_FIELD,
  APP_CONFIG_SECTION_BUDGET_BYTES,
  APP_CONFIG_THEMES_SECTION,
  APP_CONFIG_TOO_LARGE_REASON,
  APP_CONFIG_UI_SECTION,
  AppConfigSectionTooLargeError,
  createBridgeAppConfigCarrier,
} from '../src/backend/appConfigSections.ts'

const ORIGIN = 'http://127.0.0.1:3199'

interface Rig {
  carrier: ReturnType<typeof createBridgeAppConfigCarrier>
  /** 外壳那一侧真正收到的写，按顺序（`ns` + 载荷逐字）。 */
  writes: { ns: string, patch: Record<string, unknown> }[]
  /** 外壳那一侧收到的读次数。 */
  reads: () => number
  flushMicrotasks: () => Promise<void>
}

/**
 * 起一对真桥，外壳那侧接一条可控的设置面。
 * @param options.stored - `xaihi-core` 那一格此刻的值里，`appUi` 装了什么（键 = 段名，值 = JSON 文本）。
 * @param options.describeThrows - 让 `describe()` 抛（模拟远程面炸了）。
 */
function rig(options: {
  stored?: Record<string, string>
  describeThrows?: { reason: string, detail: string }
} = {}): Rig {
  const writes: { ns: string, patch: Record<string, unknown> }[] = []
  let reads = 0
  const appUi = { ...(options.stored ?? {}) }

  const settings: SettingsFace = {
    describe: () => {
      reads += 1
      if (options.describeThrows !== undefined) {
        throw Object.assign(new Error('host blew up'), options.describeThrows)
      }
      return { namespaces: [{ ns: STATE_SETTINGS_NS, revision: 7, value: { verbose: false, appUi } }] }
    },
    update: async (ns, patch) => {
      writes.push({ ns, patch })
      // 服务端的合并语义（`mergeLayers`）：这里按同一口径合并，好让"窄补丁不抹掉别的段"
      // 这件事在**下一发读**里也能被看见（判据里确实读了）。
      Object.assign(appUi, (patch[APP_CONFIG_FIELD] ?? {}) as Record<string, string>)
      return { revision: 8 }
    },
  }

  let docBridge: ReturnType<typeof createDocumentBridge> | undefined
  const shell = createShellBridge({ settings }, (message) => { void docBridge?.receive(message, ORIGIN) }, ORIGIN)
  docBridge = createDocumentBridge((message: BridgeMessage) => { void shell.receive(message, ORIGIN) }, ORIGIN, [...NODE_CAPABILITY_IDS])
  docBridge.hello('')

  return {
    carrier: createBridgeAppConfigCarrier(docBridge),
    writes,
    reads: () => reads,
    flushMicrotasks: async () => {
      for (let round = 0; round < 8; round += 1) await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}

describe('工作台设置的三段过桥', () => {
  it('读：从 config.getUi 的那一格里把 JSON 解回来', async () => {
    const r = rig({ stored: { [APP_CONFIG_UI_SECTION]: '{"version":3,"appearance":{"colorMode":"dark"}}' } })
    expect(await r.carrier.read(APP_CONFIG_UI_SECTION)).toEqual({ version: 3, appearance: { colorMode: 'dark' } })
    expect(r.reads()).toBe(1)
  })

  it('读：从来没存过这一段时是 undefined（不是空对象）', async () => {
    const r = rig({ stored: {} })
    expect(await r.carrier.read(APP_CONFIG_UI_SECTION)).toBeUndefined()
  })

  it('读：存过 null 与"没存过"必须分得开（清空 vs 迁移）', async () => {
    const r = rig({ stored: { [APP_CONFIG_BG_IMAGE_SECTION]: 'null' } })
    // `AppConfigSync` 的迁移那条路靠 `undefined` 触发，所以这两个值不许合并。
    expect(await r.carrier.read(APP_CONFIG_BG_IMAGE_SECTION)).toBeNull()
    expect(await r.carrier.read(APP_CONFIG_UI_SECTION)).toBeUndefined()
  })

  it('读：存的不是合法 JSON 时抛出并点名那一段（不猜它本来是什么）', async () => {
    const r = rig({ stored: { [APP_CONFIG_THEMES_SECTION]: '{不是 JSON' } })
    await expect(r.carrier.read(APP_CONFIG_THEMES_SECTION)).rejects.toThrow(/"themes" 这一段不是合法 JSON/)
  })

  it('写：发出去的是**窄补丁** —— 只带 appUi 自己那一段，命名空间是 xaihi-core', async () => {
    const r = rig()
    await r.carrier.write(APP_CONFIG_UI_SECTION, { version: 3 })
    await r.flushMicrotasks()
    expect(r.writes).toHaveLength(1)
    expect(r.writes[0]?.ns).toBe(STATE_SETTINGS_NS)
    // 逐字比对：多一个顶层键就会被 DSH 的第二道写闸按"没声明"拒，或者更糟——把别人的字段覆盖掉。
    expect(r.writes[0]?.patch).toEqual({ [APP_CONFIG_FIELD]: { [APP_CONFIG_UI_SECTION]: '{"version":3}' } })
  })

  it('写：三段各写各的，后面那一段不把前面的带走', async () => {
    const r = rig({ stored: { [APP_CONFIG_UI_SECTION]: '{"version":3}' } })
    await r.carrier.write(APP_CONFIG_THEMES_SECTION, [{ name: 'Mine' }])
    await r.flushMicrotasks()
    expect(r.writes[0]?.patch).toEqual({ [APP_CONFIG_FIELD]: { [APP_CONFIG_THEMES_SECTION]: '[{"name":"Mine"}]' } })
    // 服务端合过之后，上一段仍在（这就是"窄补丁"换来的东西，读得回来才算数）。
    expect(await r.carrier.read(APP_CONFIG_UI_SECTION)).toEqual({ version: 3 })
    expect(await r.carrier.read(APP_CONFIG_THEMES_SECTION)).toEqual([{ name: 'Mine' }])
  })

  it('写：null 是合法值（清空背景图那一格）', async () => {
    const r = rig({ stored: { [APP_CONFIG_BG_IMAGE_SECTION]: '"data:image/png;base64,AA"' } })
    await r.carrier.write(APP_CONFIG_BG_IMAGE_SECTION, null)
    await r.flushMicrotasks()
    expect(r.writes[0]?.patch).toEqual({ [APP_CONFIG_FIELD]: { [APP_CONFIG_BG_IMAGE_SECTION]: 'null' } })
    expect(await r.carrier.read(APP_CONFIG_BG_IMAGE_SECTION)).toBeNull()
  })

  it('体积闸：超预算那一段在下发**之前**就被拒，请求一条都不出去', async () => {
    const r = rig()
    const huge = `data:image/png;base64,${'A'.repeat(APP_CONFIG_SECTION_BUDGET_BYTES)}`
    let thrown: unknown
    try {
      await r.carrier.write(APP_CONFIG_BG_IMAGE_SECTION, huge)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AppConfigSectionTooLargeError)
    await r.flushMicrotasks()
    // "拒在下发之前"是这条闸的全部价值：发出去只会得到一条 too-large，而那句说不清是哪一段太大。
    expect(r.writes).toHaveLength(0)
    // 名字与数字也要读得回来（界面与日志按它们归因，不靠中文字符串匹配）。
    const error = thrown as AppConfigSectionTooLargeError
    expect(error.reason).toBe(APP_CONFIG_TOO_LARGE_REASON)
    expect(error.section).toBe(APP_CONFIG_BG_IMAGE_SECTION)
    expect(error.budgetBytes).toBe(APP_CONFIG_SECTION_BUDGET_BYTES)
    expect(error.bytes).toBeGreaterThan(APP_CONFIG_SECTION_BUDGET_BYTES)
  })

  it('体积闸的预算确实小于桥的单条消息上界（不然它挡不住什么）', () => {
    expect(APP_CONFIG_SECTION_BUDGET_BYTES).toBeGreaterThan(0)
    expect(APP_CONFIG_SECTION_BUDGET_BYTES).toBeLessThan(BRIDGE_MAX_MESSAGE_BYTES)
  })

  it('桥那侧的失败原样抛（不许吞成 undefined 让界面按空态画一遍）', async () => {
    const r = rig({ describeThrows: { reason: 'SETTINGS_CONFLICT', detail: 'revision 7 已经不是最新' } })
    await expect(r.carrier.read(APP_CONFIG_UI_SECTION)).rejects.toBeInstanceOf(BridgeError)
  })

  it('阳性对照：超预算的闸是"按段算的"，别的段照常写得出去', async () => {
    const r = rig()
    // 同一次里先写一个正常大小的段，再写一个超大的：只有后者被拒，前者真的落了。
    await r.carrier.write(APP_CONFIG_UI_SECTION, { version: 3 })
    await expect(r.carrier.write(APP_CONFIG_BG_IMAGE_SECTION, 'x'.repeat(APP_CONFIG_SECTION_BUDGET_BYTES + 1)))
      .rejects.toBeInstanceOf(AppConfigSectionTooLargeError)
    await r.flushMicrotasks()
    expect(r.writes).toHaveLength(1)
    expect(r.writes[0]?.patch).toEqual({ [APP_CONFIG_FIELD]: { [APP_CONFIG_UI_SECTION]: '{"version":3}' } })
  })
})
