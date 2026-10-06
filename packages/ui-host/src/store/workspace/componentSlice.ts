/**
 * 组件实例 slice：组件的部署、删除、状态切换、位置/尺寸、数据、可见性、
 * 聚焦/全屏/置顶/折叠/复制、多选与批量操作。
 *
 * 这是最大的 slice，覆盖了工作区中组件的所有交互行为。
 * 每个 action 都对应一个 reducer 函数（XxxState），保持 action 入口与纯函数分离。
 */
import type { ComponentInstance, ComponentState, DeployComponentOptions, Lane, ViewMode } from "@/types/workspace"
import { COMPONENT_VIEW_MODES, type ComponentViewMode } from "./constants"
import { nextComponentCounter, nextLaneId } from "./idCounters"
import type { ComponentPatch, WorkspaceComponentActions, WorkspaceStoreUpdater, WSState, WSStore } from "./types"

export function createComponentSlice(update: WorkspaceStoreUpdater): WorkspaceComponentActions {
  return {
    deployComponent: (moduleId, viewModeOrOptions) =>
      update("DEPLOY_COMPONENT", (state) => deployComponentState(state, moduleId, normalizeDeployOptions(viewModeOrOptions))),
    ensureComponent: (component) => update("ENSURE_COMPONENT", (state) => ensureComponentState(state, component)),
    removeComponent: (id) => update("REMOVE_COMPONENT", (state) => removeComponentState(state, id)),
    removeComponentsByModule: (moduleId) =>
      update("REMOVE_COMPONENTS_BY_MODULE", (state) => removeComponentsByModuleState(state, moduleId)),
    setComponentState: (id, state) => update("SET_COMPONENT_STATE", (store) => setComponentRuntimeState(store, id, state)),
    setComponentPosition: (id, x, y) => update("SET_COMPONENT_POSITION", (state) => setComponentPositionState(state, id, x, y)),
    moveComponent: (id, x, y) => update("MOVE_COMPONENT", (state) => setComponentPositionState(state, id, x, y)),
    setComponentFlowPos: (id, x, y) => update("SET_COMPONENT_FLOW_POS", (state) => setComponentFlowPosState(state, id, x, y)),
    setComponentFlowSize: (id, width, height) => update("SET_COMPONENT_FLOW_SIZE", (state) => setComponentFlowSizeState(state, id, width, height)),
    setComponentBentoLayout: (id, layout) => update("SET_COMPONENT_BENTO_LAYOUT", (state) => setComponentBentoLayoutState(state, id, layout)),
    setComponentLaneSize: (id, size) => update("SET_COMPONENT_LANE_SIZE", (state) => setComponentLaneSizeState(state, id, size)),
    setComponentData: (id, data) => update("SET_COMPONENT_DATA", (state) => setComponentDataState(state, id, data)),
    patchComponentData: (id, patch) => update("PATCH_COMPONENT_DATA", (state) => patchComponentDataState(state, id, patch)),
    updateComponent: (id, patch) => update("UPDATE_COMPONENT", (state) => updateComponentState(state, id, patch)),
    setComponentDockPanel: (id, panelId) => update("SET_COMPONENT_DOCK_PANEL", (state) => setComponentDockPanelState(state, id, panelId)),
    setComponentVisibility: (id, viewMode, visible) =>
      update("SET_COMPONENT_VISIBILITY", (state) => setComponentVisibilityState(state, id, viewMode, visible)),
    toggleComponentVisibility: (id, viewMode) =>
      update("TOGGLE_COMPONENT_VISIBILITY", (state) => toggleComponentVisibilityState(state, id, viewMode)),
    setComponentTags: (id, tags) => update("SET_COMPONENT_TAGS", (state) => setComponentTagsState(state, id, tags)),
    focusComponent: (id) => update("FOCUS_COMPONENT", () => ({ focusedComponentId: id })),
    setFullscreen: (id) => update("SET_FULLSCREEN", (state) => setFullscreenState(state, id)),
    raiseComponent: (id) => update("RAISE_COMPONENT", (state) => raiseComponentState(state, id)),
    toggleCollapse: (id) => update("TOGGLE_COLLAPSE", (state) => toggleCollapseState(state, id)),
    duplicateComponent: (id) => update("DUPLICATE_COMPONENT", (state) => duplicateComponentState(state, id)),
    setSelection: (ids) => update("SET_SELECTION", () => ({ selectedComponentIds: dedupeIds(ids) })),
    toggleSelection: (id) => update("TOGGLE_SELECTION", (state) => toggleSelectionState(state, id)),
    addToSelection: (ids) => update("ADD_TO_SELECTION", (state) => addToSelectionState(state, ids)),
    clearSelection: () => update("CLEAR_SELECTION", () => ({ selectedComponentIds: [] })),
    removeComponents: (ids) => update("REMOVE_COMPONENTS", (state) => removeComponentsState(state, ids)),
    duplicateComponents: (ids) => update("DUPLICATE_COMPONENTS", (state) => duplicateComponentsState(state, ids)),
    toggleCollapseComponents: (ids) => update("TOGGLE_COLLAPSE_COMPONENTS", (state) => toggleCollapseComponentsState(state, ids)),
    setComponentsVisibility: (ids, viewMode, visible) =>
      update("SET_COMPONENTS_VISIBILITY", (state) => setComponentsVisibilityState(state, ids, viewMode, visible)),
  }
}

/** 兼容旧签名：传入字符串视为 viewMode，否则视为完整 options。 */
function normalizeDeployOptions(viewModeOrOptions?: ViewMode | DeployComponentOptions): DeployComponentOptions {
  if (!viewModeOrOptions) return {}
  return typeof viewModeOrOptions === "string" ? { viewMode: viewModeOrOptions } : viewModeOrOptions
}

/** ViewMode 类型守卫：dashboard 不承载组件。 */
function isComponentViewMode(viewMode: ViewMode): viewMode is ComponentViewMode {
  return (COMPONENT_VIEW_MODES as readonly ViewMode[]).includes(viewMode)
}

/**
 * 部署（添加）组件实例到当前激活工作区。
 *
 * 行为：
 *  1. 若指定 viewMode（非 dashboard），通过 hiddenIn 让组件仅在该视图可见；
 *  2. 若工作区没有可见泳道，自动创建一个默认泳道并把组件挂上去；
 *  3. 否则把组件追加到 options.laneId 或第一个可见泳道，并更新该泳道的 cardOrder；
 *  4. 默认布局：position/flowPosition/bentoLayout 按计数器散开避免完全重叠。
 */
function deployComponentState(state: WSState, moduleId: string, options: DeployComponentOptions = {}): WSState {
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId)
  if (!workspace) return state

  const instanceCounter = nextComponentCounter()
  const now = Date.now()
  const zCounter = state.zCounter + 1
  const deploymentViewMode: ComponentViewMode | undefined = options.viewMode === "dashboard" ? "cards" : options.viewMode
  const visibleLanes = state.lanes.filter((lane) => lane.workspaceId === workspace.id && !lane.hidden)
  const laneId = visibleLanes.some((lane) => lane.id === options.laneId) ? options.laneId : visibleLanes[0]?.id
  const newComponent: ComponentInstance = {
    id: `comp-${instanceCounter}-${now}`,
    moduleId,
    state: "docked",
    placement: "workspace",
    position: options.position ?? { x: 20 + (instanceCounter % 5) * 20, y: 20 + (instanceCounter % 4) * 20 },
    size: { w: 340, h: 280 },
    z: zCounter,
    collapsed: false,
    workspaceId: workspace.id,
    laneId,
    flowPosition: options.flowPosition ?? { x: 100 + (instanceCounter % 4) * 280, y: 100 + Math.floor(instanceCounter / 4) * 200 },
    flowSize: { width: 384, height: 320 },
    bentoLayout: options.bentoLayout ?? defaultBentoLayout(instanceCounter),
    laneSize: { height: 420 },
    dockPanel: options.dockPanel ?? "default",
    hiddenIn: deploymentViewMode
      ? (Object.fromEntries(COMPONENT_VIEW_MODES.map((mode) => [mode, mode !== deploymentViewMode])) as Partial<Record<ViewMode, boolean>>)
      : undefined,
    tags: options.tags,
    createdAt: now,
    updatedAt: now,
  }

  let lanes = state.lanes
  if (visibleLanes.length === 0) {
    const defaultLane: Lane = {
      id: nextLaneId(now),
      label: "view:lane.defaultName",
      workspaceId: workspace.id,
      widthRatio: 1,
      collapsed: false,
      hidden: false,
      cardOrder: [newComponent.id],
      createdAt: now,
      updatedAt: now,
    }
    newComponent.laneId = defaultLane.id
    lanes = [...state.lanes, defaultLane]
  } else if (laneId) {
    lanes = state.lanes.map((lane) =>
      lane.id === laneId ? { ...lane, cardOrder: [...(lane.cardOrder ?? []), newComponent.id], updatedAt: now } : lane,
    )
  }

  return { ...state, components: [...state.components, newComponent], lanes, zCounter }
}

/** 幂等插入：若已存在同 id 组件则不动；否则追加并同步 zCounter。 */
function ensureComponentState(state: WSState, component: ComponentInstance): WSState {
  if (state.components.some((item) => item.id === component.id)) return state
  return {
    ...state,
    components: [...state.components, component],
    zCounter: Math.max(state.zCounter, component.z ?? 0),
  }
}

/** 删除单个组件：同时从所属泳道的 cardOrder 中移除，并清空 focused/fullscreen 引用。 */
function removeComponentState(state: WSState, id: string): WSState {
  const now = Date.now()
  return {
    ...state,
    components: state.components.filter((component) => component.id !== id),
    lanes: state.lanes.map((lane) => ({
      ...lane,
      cardOrder: lane.cardOrder?.filter((cardId) => cardId !== id),
      updatedAt: lane.cardOrder?.includes(id) ? now : lane.updatedAt,
    })),
    focusedComponentId: state.focusedComponentId === id ? null : state.focusedComponentId,
    fullscreenComponentId: state.fullscreenComponentId === id ? null : state.fullscreenComponentId,
  }
}

/** 按 moduleId 批量删除：用于"移除某 node 的全部实例"。 */
function removeComponentsByModuleState(state: WSState, moduleId: string): WSState {
  const now = Date.now()
  const idsToRemove = new Set(
    state.components.filter((component) => component.moduleId === moduleId).map((component) => component.id),
  )
  if (idsToRemove.size === 0) return state
  return {
    ...state,
    components: state.components.filter((component) => !idsToRemove.has(component.id)),
    lanes: state.lanes.map((lane) => {
      const hadAny = lane.cardOrder?.some((cardId) => idsToRemove.has(cardId))
      if (!hadAny) return lane
      return {
        ...lane,
        cardOrder: lane.cardOrder?.filter((cardId) => !idsToRemove.has(cardId)),
        updatedAt: now,
      }
    }),
    focusedComponentId: state.focusedComponentId && idsToRemove.has(state.focusedComponentId) ? null : state.focusedComponentId,
    fullscreenComponentId: state.fullscreenComponentId && idsToRemove.has(state.fullscreenComponentId) ? null : state.fullscreenComponentId,
  }
}

/**
 * 切换组件运行时状态（docked/focused/fullscreen/...）。
 *
 * 进入 focused 时同步 focusedComponentId；进入 fullscreen 时同步 fullscreenComponentId；
 * 退出 fullscreen 时清空对应引用，避免悬空指针。
 */
function setComponentRuntimeState(state: WSState, id: string, componentState: ComponentState): WSState {
  const component = state.components.find((item) => item.id === id)
  if (!component) return state
  const wasFullscreen = component.state === "fullscreen"
  return {
    ...state,
    components: state.components.map((item) =>
      item.id === id
        ? {
          ...item,
          state: componentState,
          placement: componentState === "floating"
            ? "window"
            : componentState === "docked"
              ? "workspace"
              : item.placement,
          updatedAt: Date.now(),
        }
        : item,
    ),
    focusedComponentId: componentState === "focused" ? id : wasFullscreen ? null : state.focusedComponentId,
    fullscreenComponentId: componentState === "fullscreen" ? id : wasFullscreen ? null : state.fullscreenComponentId,
  }
}

function setComponentPositionState(state: WSState, id: string, x: number, y: number): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id ? { ...component, position: { x, y }, updatedAt: Date.now() } : component,
    ),
  }
}

function setComponentFlowPosState(state: WSState, id: string, x: number, y: number): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id ? { ...component, flowPosition: { x, y }, updatedAt: Date.now() } : component,
    ),
  }
}

function setComponentFlowSizeState(state: WSState, id: string, width: number, height: number): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id ? { ...component, flowSize: { width, height }, updatedAt: Date.now() } : component,
    ),
  }
}

/** 设置 Bento 布局（先 normalize 到合法范围，再比较是否真的变化才更新）。 */
function setComponentBentoLayoutState(
  state: WSState,
  id: string,
  layout: { x: number; y: number; w: number; h: number },
): WSState {
  const nextLayout = normalizeBentoLayout(layout)
  let changed = false
  const components = state.components.map((component) => {
    if (component.id !== id) return component
    const current = component.bentoLayout
    if (
      current
      && current.x === nextLayout.x
      && current.y === nextLayout.y
      && current.w === nextLayout.w
      && current.h === nextLayout.h
    ) {
      return component
    }
    changed = true
    return { ...component, bentoLayout: nextLayout, updatedAt: Date.now() }
  })
  return changed ? { ...state, components } : state
}

/** 设置泳道卡片高度，限制在 [220, 1200] 区间。 */
function setComponentLaneSizeState(state: WSState, id: string, size: { height: number }): WSState {
  const nextSize = { height: Math.max(220, Math.min(1200, Math.round(size.height))) }
  let changed = false
  const components = state.components.map((component) => {
    if (component.id !== id) return component
    if (component.laneSize?.height === nextSize.height) return component
    changed = true
    return { ...component, laneSize: nextSize, updatedAt: Date.now() }
  })
  return changed ? { ...state, components } : state
}

function setComponentDataState(state: WSState, id: string, data: Record<string, unknown>): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id ? { ...component, data, updatedAt: Date.now() } : component,
    ),
  }
}

/** 浅合并 patch 到现有 data（不深合并）。 */
function patchComponentDataState(state: WSState, id: string, patch: Record<string, unknown>): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id
        ? { ...component, data: { ...component.data, ...patch }, updatedAt: Date.now() }
        : component,
    ),
  }
}

/**
 * 通用 patch 更新：支持 data/tags/hiddenIn/state 字段。
 *
 * state 字段会同步更新 focusedComponentId/fullscreenComponentId，
 * 与 setComponentRuntimeState 行为一致。
 */
function updateComponentState(state: WSState, id: string, patch: ComponentPatch): WSState {
  let focusedComponentId = state.focusedComponentId
  let fullscreenComponentId = state.fullscreenComponentId
  let changed = false

  const components = state.components.map((component) => {
    if (component.id !== id) return component
    let next = component
    const now = Date.now()

    if (patch.data) {
      next = { ...next, data: { ...next.data, ...patch.data } }
      changed = true
    }
    if (patch.tags) {
      next = { ...next, tags: patch.tags }
      changed = true
    }
    if (patch.hiddenIn) {
      next = { ...next, hiddenIn: { ...next.hiddenIn, ...patch.hiddenIn } }
      changed = true
    }
    if (patch.state) {
      const wasFullscreen = next.state === "fullscreen"
      next = {
        ...next,
        state: patch.state,
        placement: patch.state === "floating"
          ? "window"
          : patch.state === "docked"
            ? "workspace"
            : next.placement,
      }
      focusedComponentId = patch.state === "focused" ? id : wasFullscreen ? null : focusedComponentId
      fullscreenComponentId = patch.state === "fullscreen" ? id : wasFullscreen ? null : fullscreenComponentId
      changed = true
    }

    return changed ? { ...next, updatedAt: now } : component
  })

  return changed ? { ...state, components, focusedComponentId, fullscreenComponentId } : state
}

function setComponentDockPanelState(state: WSState, id: string, panelId: string): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id ? { ...component, dockPanel: panelId, updatedAt: Date.now() } : component,
    ),
  }
}

/** 设置某视图下组件可见性（dashboard 不支持）。值未变时跳过更新。 */
function setComponentVisibilityState(state: WSState, id: string, viewMode: ViewMode, visible: boolean): WSState {
  if (!isComponentViewMode(viewMode)) return state

  let changed = false
  const components = state.components.map((component) => {
    if (component.id !== id) return component
    const current = component.hiddenIn ?? {}
    const nextHidden = !visible
    if (current[viewMode] === nextHidden) return component
    changed = true
    return { ...component, hiddenIn: { ...current, [viewMode]: nextHidden }, updatedAt: Date.now() }
  })
  return changed ? { ...state, components } : state
}

/** 切换某视图下组件可见性（dashboard 不支持）。 */
function toggleComponentVisibilityState(state: WSState, id: string, viewMode: ViewMode): WSState {
  if (!isComponentViewMode(viewMode)) return state

  return {
    ...state,
    components: state.components.map((component) => {
      if (component.id !== id) return component
      const current = component.hiddenIn ?? {}
      const currentlyVisible = current[viewMode] !== true
      return { ...component, hiddenIn: { ...current, [viewMode]: currentlyVisible }, updatedAt: Date.now() }
    }),
  }
}

function setComponentTagsState(state: WSState, id: string, tags: string[]): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id ? { ...component, tags, updatedAt: Date.now() } : component,
    ),
  }
}

/**
 * 设置全屏组件。
 *
 * id=null 时退出全屏（所有 fullscreen 状态组件回退到 docked）；
 * id=非空 时该组件进入 fullscreen，其余 fullscreen 组件回退到 docked。
 */
function setFullscreenState(state: WSState, id: string | null): WSState {
  return {
    ...state,
    components: state.components.map((component) => {
      if (id === null) {
        return component.state === "fullscreen" ? { ...component, state: "docked" as ComponentState, updatedAt: Date.now() } : component
      }
      if (component.id === id) return { ...component, state: "fullscreen" as ComponentState, updatedAt: Date.now() }
      return component.state === "fullscreen" ? { ...component, state: "docked" as ComponentState, updatedAt: Date.now() } : component
    }),
    fullscreenComponentId: id,
  }
}

/** 置顶组件：zCounter 自增并赋给该组件。 */
function raiseComponentState(state: WSState, id: string): WSState {
  const zCounter = state.zCounter + 1
  return {
    ...state,
    zCounter,
    components: state.components.map((component) =>
      component.id === id ? { ...component, z: zCounter, updatedAt: Date.now() } : component,
    ),
  }
}

function toggleCollapseState(state: WSState, id: string): WSState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.id === id ? { ...component, collapsed: !component.collapsed, updatedAt: Date.now() } : component,
    ),
  }
}

/** 默认 Bento 布局：按计数器散开，每 5 个一宽、每 7 个一高，避免完全重叠。 */
function defaultBentoLayout(instanceCounter: number): { x: number; y: number; w: number; h: number } {
  const index = Math.max(0, instanceCounter - 1)
  const wide = index % 5 === 0
  const tall = index % 7 === 2
  const w = wide ? 6 : 4
  const h = tall ? 5 : 4
  return {
    x: (index % 3) * 4,
    y: Math.floor(index / 3) * 4,
    w,
    h,
  }
}

/** 规范化 Bento 布局：w 限制 [2,12]，h 最小 2，x 限制 [0, 12-w]，y 最小 0。 */
function normalizeBentoLayout(layout: { x: number; y: number; w: number; h: number }) {
  const w = Math.max(2, Math.min(12, Math.round(layout.w)))
  const h = Math.max(2, Math.round(layout.h))
  const x = Math.max(0, Math.min(12 - w, Math.round(layout.x)))
  const y = Math.max(0, Math.round(layout.y))
  return { x, y, w, h }
}

/**
 * 复制单个组件实例。
 *
 * - 新 id 用计数器+时间戳生成；
 * - position/flowPosition 偏移 24px 避免完全重叠；
 * - state 强制为 docked（不复制 fullscreen 状态）；
 * - data 使用 structuredClone 深拷贝；
 * - 若源组件在泳道中，克隆插入到同泳道源组件之后。
 */
function duplicateComponentState(state: WSState, id: string): WSState {
  const source = state.components.find((component) => component.id === id)
  if (!source) return state

  const now = Date.now()
  const instanceCounter = nextComponentCounter()
  const newId = `comp-${instanceCounter}-${now}`
  const zCounter = state.zCounter + 1

  // Offset positions to avoid full overlap with the source.
  const OFFSET = 24
  const newPosition = source.position
    ? { x: source.position.x + OFFSET, y: source.position.y + OFFSET }
    : { x: 20 + OFFSET, y: 20 + OFFSET }
  const newFlowPosition = source.flowPosition
    ? { x: source.flowPosition.x + OFFSET, y: source.flowPosition.y + OFFSET }
    : { x: 100 + OFFSET, y: 100 + OFFSET }

  const clone: ComponentInstance = {
    id: newId,
    moduleId: source.moduleId,
    // New components default to docked state, never copy fullscreen state.
    state: "docked",
    placement: "workspace",
    windowSize: source.windowSize ? { ...source.windowSize } : undefined,
    position: newPosition,
    size: source.size ? { ...source.size } : undefined,
    z: zCounter,
    collapsed: false,
    workspaceId: source.workspaceId,
    laneId: source.laneId,
    flowPosition: newFlowPosition,
    flowSize: source.flowSize ? { ...source.flowSize } : undefined,
    bentoLayout: source.bentoLayout ? { ...source.bentoLayout } : undefined,
    laneSize: source.laneSize ? { ...source.laneSize } : undefined,
    dockPanel: source.dockPanel,
    data: source.data ? structuredCloneSafe(source.data) : {},
    tags: source.tags ? [...source.tags] : undefined,
    hiddenIn: source.hiddenIn ? { ...source.hiddenIn } : undefined,
    createdAt: now,
    updatedAt: now,
  }

  // Insert into the same lane right after the source.
  let lanes = state.lanes
  if (source.laneId) {
    lanes = state.lanes.map((lane) => {
      if (lane.id !== source.laneId || !lane.cardOrder) return lane
      const idx = lane.cardOrder.indexOf(id)
      if (idx === -1) return lane
      const nextCardOrder = [...lane.cardOrder]
      nextCardOrder.splice(idx + 1, 0, newId)
      return { ...lane, cardOrder: nextCardOrder, updatedAt: now }
    })
  }

  return {
    ...state,
    components: [...state.components, clone],
    lanes,
    zCounter,
  }
}

// structuredClone is available in Node 17+ and modern browsers. Fall back to
// JSON-based cloning if unavailable (e.g. older test environments).
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

// ── 选中状态 ──

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)]
}

function toggleSelectionState(state: WSState, id: string): Partial<WSStore> {
  const current = state.selectedComponentIds
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  return { selectedComponentIds: next }
}

function addToSelectionState(state: WSState, ids: string[]): Partial<WSStore> {
  const current = new Set(state.selectedComponentIds)
  for (const id of ids) current.add(id)
  return { selectedComponentIds: [...current] }
}

// ── 批量操作 ──

/** 批量删除：同时清理泳道 cardOrder、focused/fullscreen 引用，并清空选中。 */
function removeComponentsState(state: WSState, ids: string[]): Partial<WSStore> {
  if (ids.length === 0) return {}
  const now = Date.now()
  const idSet = new Set(ids)
  return {
    components: state.components.filter((component) => !idSet.has(component.id)),
    lanes: state.lanes.map((lane) => {
      const hadAny = lane.cardOrder?.some((cardId) => idSet.has(cardId))
      if (!hadAny) return lane
      return {
        ...lane,
        cardOrder: lane.cardOrder?.filter((cardId) => !idSet.has(cardId)),
        updatedAt: now,
      }
    }),
    focusedComponentId: state.focusedComponentId && idSet.has(state.focusedComponentId) ? null : state.focusedComponentId,
    fullscreenComponentId: state.fullscreenComponentId && idSet.has(state.fullscreenComponentId) ? null : state.fullscreenComponentId,
    selectedComponentIds: [],
  }
}

function toggleCollapseComponentsState(state: WSState, ids: string[]): Partial<WSStore> {
  if (ids.length === 0) return {}
  const idSet = new Set(ids)
  // 多选时以第一个选中项的反状态作为目标，统一折叠或统一展开。
  const first = state.components.find((component) => idSet.has(component.id))
  if (!first) return {}
  const targetCollapsed = !first.collapsed
  const now = Date.now()
  return {
    components: state.components.map((component) =>
      idSet.has(component.id) && component.collapsed !== targetCollapsed
        ? { ...component, collapsed: targetCollapsed, updatedAt: now }
        : component,
    ),
  }
}

function setComponentsVisibilityState(
  state: WSState,
  ids: string[],
  viewMode: ViewMode,
  visible: boolean,
): Partial<WSStore> {
  if (!isComponentViewMode(viewMode) || ids.length === 0) return {}
  const idSet = new Set(ids)
  let changed = false
  const now = Date.now()
  const components = state.components.map((component) => {
    if (!idSet.has(component.id)) return component
    const current = component.hiddenIn ?? {}
    const nextHidden = !visible
    if (current[viewMode] === nextHidden) return component
    changed = true
    return { ...component, hiddenIn: { ...current, [viewMode]: nextHidden }, updatedAt: now }
  })
  return changed ? { components } : {}
}

/**
 * 批量复制组件。
 *
 * 与 duplicateComponentState 类似，但循环处理多个源组件：
 *  - 每个克隆插入到源组件同泳道之后；
 *  - 共享 zCounter 自增；
 *  - 通过 laneUpdates Map 累积泳道 cardOrder 变更，最后一次性应用。
 */
function duplicateComponentsState(state: WSState, ids: string[]): Partial<WSStore> {
  if (ids.length === 0) return {}
  const now = Date.now()
  const idSet = new Set(ids)
  const sources = state.components.filter((component) => idSet.has(component.id))
  if (sources.length === 0) return {}

  const clones: ComponentInstance[] = []
  const laneUpdates = new Map<string, string[]>()
  let zCounter = state.zCounter

  for (const source of sources) {
    const instanceCounter = nextComponentCounter()
    const newId = `comp-${instanceCounter}-${now}`
    zCounter += 1
    const OFFSET = 24
    const newPosition = source.position
      ? { x: source.position.x + OFFSET, y: source.position.y + OFFSET }
      : { x: 20 + OFFSET, y: 20 + OFFSET }
    const newFlowPosition = source.flowPosition
      ? { x: source.flowPosition.x + OFFSET, y: source.flowPosition.y + OFFSET }
      : { x: 100 + OFFSET, y: 100 + OFFSET }

    clones.push({
      id: newId,
      moduleId: source.moduleId,
      state: "docked",
      windowSize: source.windowSize ? { ...source.windowSize } : undefined,
      position: newPosition,
      size: source.size ? { ...source.size } : undefined,
      z: zCounter,
      collapsed: false,
      workspaceId: source.workspaceId,
      laneId: source.laneId,
      flowPosition: newFlowPosition,
      flowSize: source.flowSize ? { ...source.flowSize } : undefined,
      bentoLayout: source.bentoLayout ? { ...source.bentoLayout } : undefined,
      laneSize: source.laneSize ? { ...source.laneSize } : undefined,
      dockPanel: source.dockPanel,
      data: source.data ? structuredCloneSafe(source.data) : {},
      tags: source.tags ? [...source.tags] : undefined,
      hiddenIn: source.hiddenIn ? { ...source.hiddenIn } : undefined,
      createdAt: now,
      updatedAt: now,
    })

    if (source.laneId) {
      const order = laneUpdates.get(source.laneId) ?? state.lanes.find((lane) => lane.id === source.laneId)?.cardOrder ?? []
      const idx = order.indexOf(source.id)
      const next = [...order]
      if (idx === -1) {
        next.push(newId)
      } else {
        next.splice(idx + 1, 0, newId)
      }
      laneUpdates.set(source.laneId, next)
    }
  }

  const lanes = laneUpdates.size === 0
    ? state.lanes
    : state.lanes.map((lane) => {
      const updated = laneUpdates.get(lane.id)
      if (!updated) return lane
      return { ...lane, cardOrder: updated, updatedAt: now }
    })

  return {
    components: [...state.components, ...clones],
    lanes,
    zCounter,
  }
}
