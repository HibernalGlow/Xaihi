/**
 * 聚合五个 slice 工厂，组装出完整的 WorkspaceActions。
 *
 * - UI slice 直接使用原始 set（每个 action 内部自带 label）；
 * - 其余 slice 通过 update 包装器统一注入 action label，便于 Redux DevTools 调试。
 */
import { createBackendSlice } from "./backendSlice"
import { createComponentSlice } from "./componentSlice"
import { createLaneSlice } from "./laneSlice"
import type { SetWorkspaceStore, WorkspaceActions, WSStore } from "./types"
import { createUiSlice } from "./uiSlice"
import { createWorkspaceSlice } from "./workspaceSlice"

export function createWorkspaceActions(set: SetWorkspaceStore): WorkspaceActions {
  const update = (action: string, updater: (state: WSStore) => Partial<WSStore>) => set(updater, false, action)

  return {
    ...createUiSlice(set),
    ...createWorkspaceSlice(update),
    ...createComponentSlice(update),
    ...createLaneSlice(update),
    ...createBackendSlice(update),
  }
}
