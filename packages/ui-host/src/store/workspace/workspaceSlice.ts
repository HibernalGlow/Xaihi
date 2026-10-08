/**
 * 工作区（顶层容器）slice：flow 画布快照/相机持久化。
 *
 * ADR-0019：多工作空间退役，工作空间塌缩成单例。
 * 增删改/切换/重命名/图标动作整批删除——`workspaces` 恒为一条，
 * `activeWorkspaceId` 由 INITIAL_STATE 与 backendSlice 的 hydrate 保证恒等于它，
 * 不再存在任何能改它的动作。组件实例与泳道从属于该单例工作区。
 */
import type { FlowCanvasCamera, FlowCanvasSnapshot } from "@/types/workspace"
import type { WorkspaceListActions, WorkspaceStoreUpdater, WSState } from "./types"

export function createWorkspaceSlice(update: WorkspaceStoreUpdater): WorkspaceListActions {
  return {
    setWorkspaceFlowCanvas: (id, flowCanvas) =>
      update("SET_WORKSPACE_FLOW_CANVAS", (state) => setWorkspaceFlowCanvasState(state, id, flowCanvas)),
    setWorkspaceFlowCamera: (id, flowCamera) =>
      update("SET_WORKSPACE_FLOW_CAMERA", (state) => setWorkspaceFlowCameraState(state, id, flowCamera)),
  }
}

/** 持久化 React Flow 画布快照（引用相等时跳过更新，避免无谓 re-render）。 */
function setWorkspaceFlowCanvasState(state: WSState, id: string, flowCanvas: FlowCanvasSnapshot | undefined): WSState {
  let changed = false
  const now = Date.now()
  const workspaces = state.workspaces.map((workspace) => {
    if (workspace.id !== id) return workspace
    if (workspace.flowCanvas === flowCanvas) return workspace
    changed = true
    return { ...workspace, flowCanvas, updatedAt: now }
  })

  return changed ? { ...state, workspaces } : state
}

/** 持久化 React Flow 相机（x/y/z 三轴都相等时跳过更新）。 */
function setWorkspaceFlowCameraState(state: WSState, id: string, flowCamera: FlowCanvasCamera | undefined): WSState {
  let changed = false
  const now = Date.now()
  const workspaces = state.workspaces.map((workspace) => {
    if (workspace.id !== id) return workspace
    const current = workspace.flowCamera
    const same =
      current?.x === flowCamera?.x &&
      current?.y === flowCamera?.y &&
      current?.z === flowCamera?.z
    if (same) return workspace
    changed = true
    return { ...workspace, flowCamera, updatedAt: now }
  })

  return changed ? { ...state, workspaces } : state
}
