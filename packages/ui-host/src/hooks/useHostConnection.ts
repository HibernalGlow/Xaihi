/**
 * 宿主连接状态 hook（DSH 桥版）。
 *
 * 过去这一位是 `useLocalBackendStatus()`——每 2 秒轮询 Xiranite 那个独立 Go 后端的
 * `/health`。那条通路整块作废（2026-10-07 使用者口径："不再使用 rest 架构通信，
 * 一切都走 DSH 插件标准来"），连接状态的真源换成**桥握手本身**：
 *
 * - 桥建立了、握手拿到了 ⇒ 已接通，`granted` 就是宿主授予的能力组（读得回的名字）；
 * - 桥是 null（文档不在宿主里）⇒ 未接通，`granted` 是空表。
 *
 * 握手是一次性的协商，不是会崩溃的长连接，所以这里**没有轮询**：
 * `useBridgeReady` 已经在轮询 ready 的就绪位，本 hook 只把它的布尔结果展开成
 * 界面要用的形状。设置页（RuntimeSection / DataSection）与仪表盘（UsageDashboard）
 * 的"连接状态"一格都从这里读。
 */
import { useMemo } from "react"

import { useDocumentBridge, useBridgeReady } from "@/document/bridge-context"

export interface HostConnectionStatus {
  /** 桥在宿主里并且握手拿到了 granted（可以打过桥的真判据，不是猜的）。 */
  ready: boolean
  /** 宿主授予的能力组名（如 `["contract", "state", "config"]`）；未接通时是空表。 */
  granted: readonly string[]
  /** 文档不在宿主里（没有 `window.__XAIHI_UI__` / 桥是 null）。 */
  detached: boolean
}

export function useHostConnection(): HostConnectionStatus {
  const bridge = useDocumentBridge()
  const bridgeReady = useBridgeReady(bridge)

  const granted = useMemo<readonly string[]>(() => {
    if (!bridgeReady || bridge === null) return []
    try {
      return bridge.ready()?.granted ?? []
    } catch {
      return []
    }
  }, [bridge, bridgeReady])

  return {
    ready: bridgeReady,
    granted,
    detached: bridge === null,
  }
}
