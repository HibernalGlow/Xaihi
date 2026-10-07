import { createContext, useContext, type ReactNode } from "react"

/**
 * 节点**界面设置**的存取缝：按节点 id 读 / 写一份可持久化的 UI 偏好。
 *
 * 为什么要有这一层：搬来的 `NodeConfigPopover`（"开机恢复"开关）过去直接打
 * Xiranite 的 REST（`nodeConfigApi.getUi/saveUi`），那条通路已裁（2026-10-07 口径
 * "一切都走 DSH 插件标准"）。真正的落点在桥那半边（`xaihi-core.nodeUi[nodeId]`，
 * 见 `src/backend/nodeUiConfig.ts`），但 `src/nodes/**` 不许 import `src/backend/**`
 * （node-ui 独立性审计）——所以由装配侧（`ModuleRenderer`）把载体**按结构**放进
 * 这个 context，节点组件只认这份接口。
 *
 * 默认值是 `undefined`："这一份渲染树没接界面设置载体"。消费方（`NodeConfigPopover`）
 * 读到 undefined 时退回本地遗留键——那是**读得回来的退化**（偏好还活着，只是不出
 * 这台机器），不是把"没接线"报成"存好了"（ADR-0011 决定 4）。
 */

/** 与 `src/backend/nodeUiConfig.ts` 的 `NodeUiConfigCarrier` 结构对齐；节点侧只认这份。 */
export interface NodeUiConfigStore {
  /** 读一个节点那格的界面设置；**从来没存过**是 `undefined`。失败一律抛出。 */
  read: (nodeId: string) => Promise<unknown>
  /** 写一个节点那格的界面设置（整格覆盖，值会被序列化成 JSON 文本）。失败一律抛出。 */
  write: (nodeId: string, value: unknown) => Promise<void>
}

const NodeUiConfigContext = createContext<NodeUiConfigStore | undefined>(undefined)

export function NodeUiConfigProvider({ children, store }: { children: ReactNode; store: NodeUiConfigStore | undefined }) {
  return <NodeUiConfigContext.Provider value={store}>{children}</NodeUiConfigContext.Provider>
}

/**
 * 读这一份渲染树的节点界面设置载体。
 * @returns 载体；没有 provider 或没接桥时返回 undefined（消费方自己决定怎么退化）。
 */
export function useNodeUiConfig(): NodeUiConfigStore | undefined {
  return useContext(NodeUiConfigContext)
}
