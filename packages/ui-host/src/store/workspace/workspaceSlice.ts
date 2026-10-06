/**
 * 工作区（顶层容器）slice：增删改 + React Flow 画布/相机持久化。
 *
 * 工作区是最高层级业务对象，组件实例与泳道都从属于某个工作区。
 * 删除工作区时会级联清理其下全部组件与泳道；至少保留一个工作区。
 */
import type { FlowCanvasCamera, FlowCanvasSnapshot } from "@/types/workspace"
import type { WorkspaceListActions, WorkspaceStoreUpdater, WSState } from "./types"

export function createWorkspaceSlice(update: WorkspaceStoreUpdater): WorkspaceListActions {
  return {
    setActiveWorkspace: (id) => update("SET_ACTIVE_WORKSPACE", () => ({ activeWorkspaceId: id })),
    addWorkspace: () => update("ADD_WORKSPACE", addWorkspaceState),
    removeWorkspace: (id) => update("REMOVE_WORKSPACE", (state) => removeWorkspaceState(state, id)),
    renameWorkspace: (id, label) => update("RENAME_WORKSPACE", (state) => renameWorkspaceState(state, id, label)),
    setWorkspaceIcon: (id, icon) => update("SET_WORKSPACE_ICON", (state) => setWorkspaceIconState(state, id, icon)),
    setWorkspaceFlowCanvas: (id, flowCanvas) =>
      update("SET_WORKSPACE_FLOW_CANVAS", (state) => setWorkspaceFlowCanvasState(state, id, flowCanvas)),
    setWorkspaceFlowCamera: (id, flowCamera) =>
      update("SET_WORKSPACE_FLOW_CAMERA", (state) => setWorkspaceFlowCameraState(state, id, flowCamera)),
  }
}

/** 新增工作区：id 用时间戳，label 用 i18n key（按已有数量编号）。 */
function addWorkspaceState(state: WSState): WSState {
  const now = Date.now()
  const id = `ws-${now}`
  return {
    ...state,
    workspaces: [...state.workspaces, { id, label: `common:workspaceN:${state.workspaces.length + 1}`, createdAt: now, updatedAt: now }],
    activeWorkspaceId: id,
  }
}

/**
 * 删除工作区。
 *
 * 至少保留一个工作区：若只剩一个则直接返回原 state。
 * 级联清理：components / lanes 中匹配 workspaceId 的全部剔除。
 * 若删除的是当前激活工作区，自动切到剩余的第一个。
 */
function removeWorkspaceState(state: WSState, id: string): WSState {
  if (state.workspaces.length <= 1) return state
  const rest = state.workspaces.filter((workspace) => workspace.id !== id)
  return {
    ...state,
    workspaces: rest,
    activeWorkspaceId: state.activeWorkspaceId === id ? rest[0].id : state.activeWorkspaceId,
    components: state.components.filter((component) => component.workspaceId !== id),
    lanes: state.lanes.filter((lane) => lane.workspaceId !== id),
  }
}

function renameWorkspaceState(state: WSState, id: string, label: string): WSState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === id ? { ...workspace, label, updatedAt: Date.now() } : workspace,
    ),
  }
}

function setWorkspaceIconState(state: WSState, id: string, icon: string | undefined): WSState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === id ? { ...workspace, icon, updatedAt: Date.now() } : workspace,
    ),
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
