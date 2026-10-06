/**
 * 注册表侧读工作区 store 的唯一入口。
 *
 * 走 `selectWorkspaceActions(getState())` 这个非 React 读法，而且在调用时才取：
 * 模块加载期直接取会和 `store/workspaceStore` 形成加载环（builtins 被 store 侧的常量表间接引到）。
 */
import { selectWorkspaceActions, useWorkspaceStore } from "@/store/workspaceStore"
import type { WorkspaceActions } from "@/store/workspace/types"

export function workspaceStoreActions(): WorkspaceActions {
  return selectWorkspaceActions(useWorkspaceStore.getState())
}
