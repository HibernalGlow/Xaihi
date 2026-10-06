/**
 * Backend slice —— 处理后端 SQLite 与前端 Zustand store 之间的水合 (hydrate) 与就绪状态。
 *
 * 该 slice 只有两个 action：
 * - setBackendReady：标记后端是否可用，UI 根据此值决定是否显示加载态
 * - hydrate：把后端返回的 DTO 数组转换为前端模型并整体替换 store 的工作区/泳道/组件
 *
 * 注意：hydrate 只在初始化与后端主动覆盖时调用；正常运行时由 workspaceContext.tsx
 * 的 useMutation 把 store 状态持久化回后端，hydrate 不会反复触发。
 */
import type { ComponentInstance, Lane, WorkspaceItem } from "@/types/workspace"
import type { ComponentDTO, LaneDTO, WorkspaceDTO } from "@xiranite/shared"
import { INITIAL_STATE } from "./constants"
import type { WorkspaceBackendActions, WorkspaceStoreUpdater, WSState } from "./types"

/** 创建 backend slice 的工厂函数。 */
export function createBackendSlice(update: WorkspaceStoreUpdater): WorkspaceBackendActions {
  return {
    setBackendReady: (ready) => update("BACKEND_READY", () => ({ backendReady: ready })),
    hydrate: (workspaces, lanes, components) => update("HYDRATE", (state) => hydrateState(state, workspaces, lanes, components)),
  }
}

/**
 * 将后端 DTO 整体灌入 store，替换当前的工作区/泳道/组件集合。
 *
 * - 工作区为空时回退到 INITIAL_STATE.workspaces，避免首启时无工作区可用
 * - 独立窗口归属恢复为 "floating"，旧快照和工作区归属恢复为 "docked"
 * - position/size 使用默认值（这两个字段不持久化到后端）
 * - activeWorkspaceId 自动指向第一个工作区
 * - zCounter 取现有值与所有组件 z 值的最大值，避免新组件 z 值冲突
 */
function hydrateState(state: WSState, workspaces: WorkspaceDTO[], lanes: LaneDTO[], components: ComponentDTO[]): WSState {
  const nextWorkspaces: WorkspaceItem[] = workspaces.length
    ? workspaces.map((workspace) => ({
      id: workspace.id,
      label: workspace.label,
      icon: workspace.icon,
      flowCanvas: workspace.flowCanvas,
      flowCamera: workspace.flowCamera,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }))
    : INITIAL_STATE.workspaces

  const nextComponents: ComponentInstance[] = components.map((component) => ({
    id: component.id,
    moduleId: component.moduleId,
    state: component.placement === "window" ? "floating" : "docked",
    placement: component.placement ?? "workspace",
    windowSize: component.windowSize,
    workspaceId: component.workspaceId,
    data: component.data,
    flowPosition: component.flowPosition,
    flowSize: component.flowSize,
    bentoLayout: component.bentoLayout,
    laneSize: component.laneSize,
    dockPanel: component.dockPanel,
    laneId: component.laneId,
    hiddenIn: component.hiddenIn,
    tags: component.tags,
    z: component.z,
    collapsed: component.collapsed,
    position: { x: 20, y: 20 },
    size: { w: 340, h: 280 },
    createdAt: component.createdAt,
    updatedAt: component.updatedAt,
  }))

  const nextLanes: Lane[] = lanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    workspaceId: lane.workspaceId,
    widthRatio: lane.widthRatio,
    collapsed: lane.collapsed,
    hidden: lane.hidden,
    cardOrder: lane.cardOrder,
    createdAt: lane.createdAt,
    updatedAt: lane.updatedAt,
  }))

  return {
    ...state,
    workspaces: nextWorkspaces,
    lanes: nextLanes,
    components: nextComponents,
    activeWorkspaceId: nextWorkspaces[0]?.id ?? state.activeWorkspaceId,
    zCounter: Math.max(state.zCounter, ...nextComponents.map((component) => component.z ?? 0)),
  }
}
