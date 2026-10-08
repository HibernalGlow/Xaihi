/**
 * 工作台自己那份界面设置（`app.ui` / 自定义主题 / 背景图）的**桥版载体**。
 *
 * 为什么有这个文件：`src/components/workspace/AppConfigSync.tsx` 过去把这三段打在
 * Xiranite 自己的 HTTP 后端上（`/config/app/<段>`、`/config/themes`、`/config/bg-image`，
 * 装配在 `src/backend/configRpcClient.ts`）。那份后端在本仓不存在，于是"改完设置、刷新就没了"，
 * 而界面上一句话都读不到。2026-10-07 使用者拍了口径"不再使用 rest 架构通信，一切都走
 * DSH 插件标准" —— 这三段今天落进**声明过的 volatile 落点**
 * `xaihi-core.appUi.<段>`（`packages/core/src/index.ts` 的 Config），唯一出口是桥的
 * `config.getUi` / `config.save`（ADR-0013）。
 *
 * 三条形状上的取舍，都不是省事：
 *
 * 1. **值的形状统一成"一段一个 JSON 文本"**，与 `nodeState` / `nodeUi` 同一条。
 *    `core` 那一格是 `Schema.dict(Schema.string())`——DSH 的 remote 边界只收受约束的数据，
 *    把整份 `AppUiConfig` 当任意 JSON 塞进去会被第二道写闸拒（`Config field "…" is not volatile`
 *    后面紧接着的就是投影失败）。编解码归这一层，宿主只管存一串文本。
 * 2. **写一律发窄补丁**：`{ appUi: { <段>: "<json>" } }`。DSH 的 `settings.update` 语义是
 *    `mergeLayers(current, patch)`——普通对象**递归合并**（`@deepseek-ai/dsh-settings` 的
 *    `lib/index.js:275-291/470-472`），所以只带自己那一段不会抹掉 `verbose` / `nodeState` /
 *    `nodeUi` / 别的段。这与 `localBackendControl.ts` 那份"先读整份、只换自己一格、写回整份"
 *    是**两种都对的写法**：那一格必须整份读是因为它要保住别人的字段，而这里窄补丁在服务端
 *    合的成本更低，也不会把 `nodeState`（可能很大）搬上来一趟再搬下去。
 * 3. **写不带 `expectedRevision`**。这一格的写者只有"正在看这份工作台的那个浏览器会话"，
 *    而 `expectedRevision` 是**整个命名空间**的版本号——工作区快照（`state.patchData`，
 *    落在同一个 `xaihi-core` 上）每存一次都会把它推进，带上旧版号只会换来一串与内容无关的
 *    `SETTINGS_CONFLICT`。冲突在这里的语义本来就是"后写的赢一段"，与 Xiranite 那份文件写一样。
 *    代价写在这里：两个窗口同时改同一段时后写的覆盖先写的。
 *
 * @module xaihi-ui/backend/app-config-sections
 */

import {
  BRIDGE_MAX_MESSAGE_BYTES,
  STATE_SETTINGS_NS,
  messageBytes,
  type DocumentBridge,
} from '@hibernalglow/xaihi-sdk/bridge'

/** `core` 那一格里装这几段的字段名（真源在 `packages/core/src/index.ts` 的 Config）。 */
export const APP_CONFIG_FIELD = 'appUi'

/** 段落名。三个都对应 `AppConfigSync` 原先一条独立的 REST 通路。 */
export const APP_CONFIG_UI_SECTION = 'ui'
export const APP_CONFIG_THEMES_SECTION = 'themes'
export const APP_CONFIG_BG_IMAGE_SECTION = 'bgImage'

/** 这一段里能出现的段名（三个都对应 `AppConfigSync` 原先一条独立的 REST 通路）。 */
export const APP_CONFIG_SECTIONS = [
  APP_CONFIG_UI_SECTION,
  APP_CONFIG_THEMES_SECTION,
  APP_CONFIG_BG_IMAGE_SECTION,
] as const

export type AppConfigSection = (typeof APP_CONFIG_SECTIONS)[number]

/**
 * 一段最多占多少字节。
 *
 * 数字是**推出来的**，不是挑的：桥的单条消息上界是 `BRIDGE_MAX_MESSAGE_BYTES`（256 KiB），
 * 而 `config.getUi` 回的是**整格**命名空间的值——读一次就把 `nodeState`（工作区快照 + 每个节点
 * 的 JSON 文本）、`nodeUi`、`nodeMemoryProtection` 和这里三段一起带上。所以一段最多吃四分之一，
 * 剩下的留给同格里的其他人。超了就在**写之前**拒（那条请求本身也已经超过桥的单条上界，
 * 让它发出去只会得到一条 `too-large`，而那句说不清是哪一段太大）。
 *
 * 背景图是唯一会被这条闸碰到的段：`BACKGROUND_IMAGE_MAX_DATA_URL_BYTES` 是 2 MiB
 * （`src/lib/backgroundImage.ts`），而这格放不下。这不是漏接线，是**载体能力的边界**：
 * blob 大小的东西在 DSH 里的对应物是 storage domain，本包今天没接（提案账上）。
 */
export const APP_CONFIG_SECTION_BUDGET_BYTES = Math.floor(BRIDGE_MAX_MESSAGE_BYTES / 4)

/** 超预算那一条的 `name`，界面与判据按它指认（不靠中文字符串匹配）。 */
export const APP_CONFIG_TOO_LARGE_REASON = 'app-config-section-too-large'

/** 一段装不下时抛这条：带上段名与两个数字，读到的人不需要回来看代码。 */
export class AppConfigSectionTooLargeError extends Error {
  readonly reason = APP_CONFIG_TOO_LARGE_REASON
  readonly section: AppConfigSection
  readonly bytes: number
  readonly budgetBytes: number

  constructor(section: AppConfigSection, bytes: number, budgetBytes: number) {
    super(`"${section}" 这一段有 ${String(bytes)} 字节，超过这一格能过的 ${String(budgetBytes)} 字节（桥的单条消息上界 ${String(BRIDGE_MAX_MESSAGE_BYTES)} B 的四分之一）`)
    this.name = 'AppConfigSectionTooLargeError'
    this.section = section
    this.bytes = bytes
    this.budgetBytes = budgetBytes
  }
}

/** 读一段 / 写一段。失败一律抛出（桥的 `BridgeError` 或上面那条超预算），不吞成 undefined。 */
export interface AppConfigCarrier {
  /** 读一段；**从来没存过**是 `undefined`（与"存了一个 null"区分开）。 */
  read(section: AppConfigSection): Promise<unknown>
  /** 写一段。值会被序列化成文本；`null` 是合法值（清空）。 */
  write(section: AppConfigSection, value: unknown): Promise<void>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 从 `config.getUi` 的回包里取出某一段的文本。
 * @param view - 桥回的那一份（`{ ns, value, revision? }`，见 `bridge-shell.ts` 的 `readNamespace`）。
 * @param section - 要哪一段。
 * @returns 那段的 JSON 文本（没存过时是 undefined）；回包形状不对也当"没读到"。
 */
function pickSectionText(view: unknown, section: AppConfigSection): string | undefined {
  if (!isRecord(view)) return undefined
  const sectionMap = (view.value as Record<string, unknown> | undefined)?.[APP_CONFIG_FIELD]
  if (!isRecord(sectionMap)) return undefined
  const text = sectionMap[section]
  return typeof text === 'string' ? text : undefined
}

/**
 * 把一条桥折成三段设置要的载体。
 *
 * 这里**不检查**握手授权：`bridge.call` 自己会拒（没握手是 `not-ready`、`config` 组没被授予是
 * `capability-refused`），而把那条原因换成这里自造一句会把"外壳没给"说成"我们这边不行"。
 * @param bridge - 这一份文档的桥（`document/bridge-context.tsx` 里那一份）。
 * @returns 载体。
 */
export function createBridgeAppConfigCarrier(bridge: DocumentBridge): AppConfigCarrier {
  return {
    async read(section) {
      const view = await bridge.call('config.getUi', STATE_SETTINGS_NS)
      const text = pickSectionText(view, section)
      // "没存过"与"存了一个 null"必须分开：前者让调用方走迁移/兜底那条路（原 REST 那版
      // 用 `config === undefined` 判），后者是使用者把这一格清空了。
      if (text === undefined) return undefined
      try {
        return JSON.parse(text) as unknown
      } catch {
        throw new Error(`"${section}" 这一段不是合法 JSON（读到 ${String(text.length)} 个字符），按读不到处理，不猜它本来是什么`)
      }
    },

    async write(section, value) {
      const text = JSON.stringify(value ?? null)
      const bytes = messageBytes(text)
      if (bytes > APP_CONFIG_SECTION_BUDGET_BYTES) {
        throw new AppConfigSectionTooLargeError(section, bytes, APP_CONFIG_SECTION_BUDGET_BYTES)
      }
      // 窄补丁（只带自己那一段）：`settings.update` 是递归合并，别人的字段与别的段都不动。
      await bridge.call('config.save', STATE_SETTINGS_NS, { [APP_CONFIG_FIELD]: { [section]: text } })
    },
  }
}
