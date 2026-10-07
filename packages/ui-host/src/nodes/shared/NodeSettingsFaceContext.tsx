import { createContext, useContext, type ReactNode } from "react"

/**
 * 节点**配置**（`xaihi-<node>` 命名空间）的读 / 写缝。
 *
 * 与 `NodeUiConfigContext`（界面偏好，落 `xaihi-core.nodeUi`）同一条纪律的另一头：
 * 节点自己的配置值落在 DSH settings 的 `xaihi-<node>` 格（ADR-0013），唯一出口是桥的
 * `config.getUi` / `config.save`。`src/nodes/**` 不 import `src/backend/**`——所以由
 * 装配侧（`ModuleRenderer`）把载体**按结构**放进这个 context。
 *
 * 默认值是 `undefined`：消费方（`NodeConfigPopover`）读到时走读得回的退化，
 * 不把"没接线"报成"存好了"（ADR-0011 决定 4）。
 */

/** 与 `src/backend/nodeSettingsFace.ts` 的载体结构对齐；节点侧只认这份。 */
export interface NodeSettingsFace {
  /** 读一个设置命名空间的整格值与 revision。失败一律抛出（桥的 `BridgeError`）。 */
  read: (ns: string) => Promise<{ value?: unknown; revision?: number }>
  /** 发一份窄补丁（DSH 的 `settings.update` 是递归合并）。失败一律抛出。 */
  write: (ns: string, patch: Record<string, unknown>, expectedRevision?: number) => Promise<void>
}

const NodeSettingsFaceContext = createContext<NodeSettingsFace | undefined>(undefined)

export function NodeSettingsFaceProvider({ children, face }: { children: ReactNode; face: NodeSettingsFace | undefined }) {
  return <NodeSettingsFaceContext.Provider value={face}>{children}</NodeSettingsFaceContext.Provider>
}

export function useNodeSettingsFace(): NodeSettingsFace | undefined {
  return useContext(NodeSettingsFaceContext)
}

/** 节点短名 → 设置命名空间；已是全名（`xaihi-` 前缀）则原样返回。 */
export function namespaceForNode(nodeKey: string): string {
  return nodeKey.startsWith("xaihi-") ? nodeKey : `xaihi-${nodeKey}`
}
