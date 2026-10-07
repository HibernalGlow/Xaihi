/**
 * 节点**界面设置**（`xaihi-core.nodeUi`）的桥版载体。
 *
 * 为什么有这个文件：`NodeConfigPopover` 的"开机恢复"偏好过去打 Xiranite 的 REST
 * （`nodeConfigApi.getUi/saveUi`，即 `/config/nodes/<id>/ui`）。那条通路已随
 * 2026-10-07 使用者口径"不再使用 rest 架构通信，一切都走 DSH 插件标准"整块裁掉，
 * 而这一偏好是真的要持久化（刷新后还得在），落 localStorage 只会让它"看起来坏了"。
 * 落点是 core 那行 Config 里**声明过的** volatile 字段 `nodeUi`
 * （`packages/core/src/index.ts:71-85`：键 = 节点 id，值 = 那份界面设置的 JSON 文本），
 * 唯一出口是桥的 `config.getUi` / `config.save`（ADR-0013）——与 `appConfigSections.ts`
 * 那三段是同一套纪律，这里只多一层"按节点 id 分格"。
 *
 * 两条与 `appConfigSections.ts` 一致的取舍，理由在那边写得更长：
 * - **写发窄补丁** `{ nodeUi: { <nodeId>: "<json>" } }`：DSH 的 `settings.update` 是
 *   递归合并，同格里的 `nodeState` / `appUi` / `verbose` 等别人的字段一概不动；
 * - **读是整格读**：`config.getUi` 回的是整个 `xaihi-core` 的值（含可能很大的
 *   `nodeState`），所以这一格的值要保持小 —— 一份界面偏好就是全部。
 *
 * 为什么没有 `expectedRevision`：与 `appConfigSections.ts` 第 3 条同理 —— 这一格的
 * 写者是"正在看这个节点的那份文档"，冲突的语义就是后写的赢一格。
 *
 * @module xaihi-ui/backend/node-ui-config
 */

import { STATE_SETTINGS_NS, type DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'

/** `core` 那格里装节点界面设置的字段名（真源在 `packages/core/src/index.ts` 的 Config）。 */
export const NODE_UI_CONFIG_FIELD = 'nodeUi'

/**
 * 按节点 id 读 / 写一份界面设置。失败一律抛出（桥的 `BridgeError`），不吞成 undefined。
 *
 * 形状刻意与 `src/nodes/shared/NodeUiConfigContext.tsx` 里那份 `NodeUiConfigStore`
 * 结构对齐：nodes/** 不许 import src/backend/**（node-ui 独立性审计），所以节点侧
 * 拿到的是这份载体**按结构**塞进 context 的值，而不是一个 backend 的 import。
 */
export interface NodeUiConfigCarrier {
  /** 读一个节点那格；**从来没存过**是 `undefined`（与"存了一个 null"区分开）。 */
  read(nodeId: string): Promise<unknown>
  /** 写一个节点那格。值会被序列化成 JSON 文本；`null` 是合法值（清空）。 */
  write(nodeId: string, value: unknown): Promise<void>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 从 `config.getUi` 的回包里取出某节点那格的 JSON 文本。
 * @param view - 桥回的那一份（`{ ns, value, revision? }`，见 `bridge-shell.ts` 的 `readNamespace`）。
 * @param nodeId - 要哪个节点的那格。
 * @returns 那格的 JSON 文本（没存过时是 undefined）；回包形状不对也当"没读到"。
 */
function pickNodeText(view: unknown, nodeId: string): string | undefined {
  if (!isRecord(view)) return undefined
  const nodeMap = (view.value as Record<string, unknown> | undefined)?.[NODE_UI_CONFIG_FIELD]
  if (!isRecord(nodeMap)) return undefined
  const text = nodeMap[nodeId]
  return typeof text === 'string' ? text : undefined
}

/**
 * 把一条桥折成节点界面设置要的载体。
 *
 * 这里**不检查**握手授权：`bridge.call` 自己会拒（没握手是 `not-ready`、`config` 组没被
 * 授予是 `capability-refused`），把那条原因换成这里自造的一句会把"外壳没给"说成"我们这边不行"
 * （与 `appConfigSections.ts` 同一条立场）。
 * @param bridge - 这一份文档的桥（`document/bridge-context.tsx` 里那一份）。
 * @returns 载体。
 */
export function createBridgeNodeUiConfigCarrier(bridge: DocumentBridge): NodeUiConfigCarrier {
  return {
    async read(nodeId) {
      const view = await bridge.call('config.getUi', STATE_SETTINGS_NS)
      const text = pickNodeText(view, nodeId)
      // "没存过"与"存了一个 null"必须分开：前者让调用方走迁移/兜底那条路
      // （原 REST 那版用 `config === undefined` 判），后者是使用者把这一格清空了。
      if (text === undefined) return undefined
      try {
        return JSON.parse(text) as unknown
      } catch {
        throw new Error(`节点 "${nodeId}" 的界面设置不是合法 JSON（读到 ${String(text.length)} 个字符），按读不到处理，不猜它本来是什么`)
      }
    },

    async write(nodeId, value) {
      // 窄补丁（只带自己那一格）：`settings.update` 是递归合并，别的节点与别的字段都不动。
      await bridge.call('config.save', STATE_SETTINGS_NS, { [NODE_UI_CONFIG_FIELD]: { [nodeId]: JSON.stringify(value ?? null) } })
    },
  }
}
