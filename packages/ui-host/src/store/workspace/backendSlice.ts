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
 * ADR-0019（多工作空间退役，塌缩成单例）：
 * - 只保留快照里的第一个工作区；第 2..N 个连同其下组件与泳道级联丢弃
 *   （复用原 removeWorkspaceState 的级联语义，落点只在 hydrate 这一处）
 * - 快照为空时回退到 INITIAL_STATE.workspaces（单例 ws-alpha）
 * - 存量组件的 workspaceId 全部保留、零迁移：若第一个工作区存在，其 id 原样沿用
 * - 独立窗口归属恢复为 "floating"，旧快照和工作区归属恢复为 "docked"
 * - position/size 使用默认值（这两个字段不持久化到后端）
 * - activeWorkspaceId 恒等于保留下来的那条工作区 id
 * - zCounter 取现有值与所有组件 z 值的最大值，避免新组件 z 值冲突
 */
function hydrateState(state: WSState, workspaces: WorkspaceDTO[], lanes: LaneDTO[], components: ComponentDTO[]): WSState {
  const keptWorkspace: WorkspaceItem | null = workspaces.length
    ? {
      id: workspaces[0].id,
      label: workspaces[0].label,
      icon: workspaces[0].icon,
      flowCanvas: workspaces[0].flowCanvas,
      flowCamera: workspaces[0].flowCamera,
      createdAt: workspaces[0].createdAt,
      updatedAt: workspaces[0].updatedAt,
    }
    : null
  const nextWorkspaces: WorkspaceItem[] = keptWorkspace ? [keptWorkspace] : INITIAL_STATE.workspaces
  const keptWorkspaceId = nextWorkspaces[0].id

  const keptComponents = components.filter((component) => component.workspaceId === keptWorkspaceId)
  const nextComponents: ComponentInstance[] = keptComponents.map((component) => ({
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

  const keptLanes = lanes.filter((lane) => lane.workspaceId === keptWorkspaceId)
  const nextLanes: Lane[] = keptLanes.map((lane) => ({
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
    activeWorkspaceId: nextWorkspaces[0].id,
    zCounter: Math.max(state.zCounter, ...nextComponents.map((component) => component.z ?? 0)),
  }
}
