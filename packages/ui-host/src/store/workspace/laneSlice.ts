/**
 * Lane (泳道) slice —— 负责工作区中"泳道"容器的全部状态变更。
 *
 * 泳道是 lane 视图模式（多列垂直卡片堆叠）和 bento 视图模式（多列自由排版）
 * 共享的横向分栏容器；每个泳道维护自己的 widthRatio、collapsed、hidden、
 * cardOrder（卡片在前端的展示顺序，与 components 数组解耦）等独立状态。
 *
 * 该 slice 不直接持有组件实例，但 moveComponentToLane / setLaneBoardLayout
 * 会同步修改 component.laneId 与 lane.cardOrder，因此实现上需要小心双向同步。
 */
import { nextLaneId } from "./idCounters"
import type { WorkspaceLaneActions, WorkspaceStoreUpdater, WSState } from "./types"

/**
 * 创建泳道 slice 的工厂函数。
 *
 * 所有 action 都通过 `update(actionType, mutator)` 包装器写入 store，
 * 便于 devtools 中区分来源（每个 action 拥有独立的 action type 字符串）。
 */
export function createLaneSlice(update: WorkspaceStoreUpdater): WorkspaceLaneActions {
  return {
    addLane: (workspaceId, label) => update("ADD_LANE", (state) => addLaneState(state, workspaceId, label)),
    removeLane: (id) => update("REMOVE_LANE", (state) => removeLaneState(state, id)),
    renameLane: (id, label) => update("RENAME_LANE", (state) => renameLaneState(state, id, label)),
    setLaneWidthRatio: (id, ratio) => update("SET_LANE_WIDTH_RATIO", (state) => setLaneWidthRatioState(state, id, ratio)),
    toggleLaneCollapse: (id) => update("TOGGLE_LANE_COLLAPSE", (state) => toggleLaneCollapseState(state, id)),
    toggleLaneVisibility: (id) => update("TOGGLE_LANE_VISIBILITY", (state) => toggleLaneVisibilityState(state, id)),
    reorderLane: (fromId, toId) => update("REORDER_LANE", (state) => reorderLaneState(state, fromId, toId)),
    setLaneCardOrder: (id, cardOrder) => update("SET_LANE_CARD_ORDER", (state) => setLaneCardOrderState(state, id, cardOrder)),
    setLaneBoardLayout: (workspaceId, laneOrder, cardOrderByLane) =>
      update("SET_LANE_BOARD_LAYOUT", (state) => setLaneBoardLayoutState(state, workspaceId, laneOrder, cardOrderByLane)),
    moveComponentToLane: (componentId, toLaneId, targetCardId, insertAfter) =>
      update("MOVE_COMPONENT_TO_LANE", (state) => moveComponentToLaneState(state, componentId, toLaneId, targetCardId, insertAfter)),
  }
}

/**
 * 在指定工作区（默认当前激活工作区）尾部追加一条新泳道。
 * label 缺省时按"LANE N"规则生成，N 为该工作区已有泳道数 + 1。
 */
function addLaneState(state: WSState, workspaceId?: string, label?: string): WSState {
  const now = Date.now()
  const nextWorkspaceId = workspaceId ?? state.activeWorkspaceId
  const lane = {
    id: nextLaneId(now),
    label: label ?? `LANE ${state.lanes.filter((item) => item.workspaceId === nextWorkspaceId).length + 1}`,
    workspaceId: nextWorkspaceId,
    widthRatio: 1,
    collapsed: false,
    hidden: false,
    cardOrder: [],
    createdAt: now,
    updatedAt: now,
  }
  return { ...state, lanes: [...state.lanes, lane] }
}

/**
 * 删除泳道：泳道本身移除，挂在其下的组件不会删除，但 laneId 会被清空
 * （变成"无泳道"组件，可重新拖回任意泳道）。
 */
function removeLaneState(state: WSState, id: string): WSState {
  return {
    ...state,
    lanes: state.lanes.filter((lane) => lane.id !== id),
    components: state.components.map((component) =>
      component.laneId === id ? { ...component, laneId: undefined, updatedAt: Date.now() } : component,
    ),
  }
}

/** 重命名泳道。 */
function renameLaneState(state: WSState, id: string, label: string): WSState {
  return {
    ...state,
    lanes: state.lanes.map((lane) => lane.id === id ? { ...lane, label, updatedAt: Date.now() } : lane),
  }
}

/**
 * 设置泳道宽度比例。被限制在 [0.25, 4] 区间内，避免极端比例导致布局崩坏
 * （0.25 约占 1/4 列宽，4 约占 4 倍列宽，超出此区间视觉上无意义）。
 */
function setLaneWidthRatioState(state: WSState, id: string, ratio: number): WSState {
  return {
    ...state,
    lanes: state.lanes.map((lane) =>
      lane.id === id ? { ...lane, widthRatio: Math.max(0.25, Math.min(4, ratio)), updatedAt: Date.now() } : lane,
    ),
  }
}

/** 切换泳道折叠态（折叠后只显示标题条，节省横向空间）。 */
function toggleLaneCollapseState(state: WSState, id: string): WSState {
  return {
    ...state,
    lanes: state.lanes.map((lane) => lane.id === id ? { ...lane, collapsed: !lane.collapsed, updatedAt: Date.now() } : lane),
  }
}

/** 切换泳道可见性（隐藏后完全从布局中移除，区别于折叠）。 */
function toggleLaneVisibilityState(state: WSState, id: string): WSState {
  return {
    ...state,
    lanes: state.lanes.map((lane) => lane.id === id ? { ...lane, hidden: !lane.hidden, updatedAt: Date.now() } : lane),
  }
}

/**
 * 在 lanes 数组中把 fromId 位置的泳道移动到 toId 位置（基于 splice 的原地重排）。
 * 同位置 / 任一不存在时直接返回原 state，避免无意义更新。
 */
function reorderLaneState(state: WSState, fromId: string, toId: string): WSState {
  const fromIndex = state.lanes.findIndex((lane) => lane.id === fromId)
  const toIndex = state.lanes.findIndex((lane) => lane.id === toId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state
  const next = [...state.lanes]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, { ...moved, updatedAt: Date.now() })
  return { ...state, lanes: next }
}

/** 整体替换某条泳道的 cardOrder（用于拖拽排序后落库）。 */
function setLaneCardOrderState(state: WSState, id: string, cardOrder: string[]): WSState {
  return {
    ...state,
    lanes: state.lanes.map((lane) => lane.id === id ? { ...lane, cardOrder, updatedAt: Date.now() } : lane),
  }
}

/**
 * 一次性写入整个工作区的"泳道顺序 + 每条泳道内卡片顺序"。
 *
 * 这是 lane/bento 视图批量重排后的提交动作，避免逐条调用 reorderLane /
 * setLaneCardOrder 产生多次 store 更新。同时会根据 cardOrderByLane 反向
 * 同步 component.laneId，保证数据一致性。
 *
 * 注意未出现在 laneOrder 中的泳道会被追加到该工作区泳道列表末尾，
 * 不会被丢弃。
 */
function setLaneBoardLayoutState(
  state: WSState,
  workspaceId: string | undefined,
  laneOrder: string[],
  cardOrderByLane: Record<string, string[]>,
): WSState {
  const now = Date.now()
  const targetWorkspaceId = workspaceId ?? state.activeWorkspaceId
  const orderedLaneIds = new Set(laneOrder)
  const lanesById = new Map(state.lanes.map((lane) => [lane.id, lane]))
  const orderedWorkspaceLanes = laneOrder
    .map((id) => lanesById.get(id))
    .filter((lane): lane is NonNullable<typeof lane> => !!lane && lane.workspaceId === targetWorkspaceId)

  // 拼接：其他工作区的泳道（保持原序） → 本次重排的泳道（按 laneOrder） → 未参与重排的本工作区泳道
  const lanes = [
    ...state.lanes.filter((lane) => lane.workspaceId !== targetWorkspaceId),
    ...orderedWorkspaceLanes.map((lane) => ({
      ...lane,
      cardOrder: cardOrderByLane[lane.id] ?? lane.cardOrder ?? [],
      updatedAt: now,
    })),
    ...state.lanes.filter((lane) => lane.workspaceId === targetWorkspaceId && !orderedLaneIds.has(lane.id)),
  ]

  // 根据 cardOrderByLane 反查每张卡片应该归属的 laneId，需要变更的组件同步更新
  const componentLaneById = new Map<string, string>()
  for (const [laneId, cardIds] of Object.entries(cardOrderByLane)) {
    for (const cardId of cardIds) componentLaneById.set(cardId, laneId)
  }

  const components = state.components.map((component) => {
    const laneId = componentLaneById.get(component.id)
    if (!laneId || component.laneId === laneId) return component
    return { ...component, laneId, updatedAt: now }
  })

  return { ...state, lanes, components }
}

/**
 * 把一张卡片移动到指定泳道，可选择相对某张目标卡片的插入位置。
 *
 * - 从源泳道 cardOrder 中移除该卡片 id
 * - 在目标泳道 cardOrder 中按 targetCardId / insertAfter 决定插入位置
 * - 目标泳道自动展开（collapsed = false），避免移动后看不到结果
 * - 同泳道无 targetCardId 时直接 return，避免无意义更新
 */
function moveComponentToLaneState(
  state: WSState,
  componentId: string,
  toLaneId: string,
  targetCardId?: string | null,
  insertAfter?: boolean,
): WSState {
  const component = state.components.find((item) => item.id === componentId)
  if (!component) return state

  const fromLaneId = component.laneId
  if (fromLaneId === toLaneId && !targetCardId) return state

  const now = Date.now()
  const components = state.components.map((item) =>
    item.id === componentId ? { ...item, laneId: toLaneId, updatedAt: now } : item,
  )

  // 第一轮：从源泳道 cardOrder 中剔除
  let lanes = state.lanes.map((lane) => {
    if (lane.id !== fromLaneId) return lane
    return {
      ...lane,
      cardOrder: lane.cardOrder?.filter((id) => id !== componentId),
      updatedAt: now,
    }
  })

  // 第二轮：在目标泳道 cardOrder 中按位置插入，并展开目标泳道
  lanes = lanes.map((lane) => {
    if (lane.id !== toLaneId) return lane
    const order = (lane.cardOrder ?? []).filter((id) => id !== componentId)
    if (!targetCardId) {
      order.push(componentId)
    } else {
      const index = order.indexOf(targetCardId)
      if (index < 0) order.push(componentId)
      else order.splice(insertAfter ? index + 1 : index, 0, componentId)
    }
    return { ...lane, collapsed: false, cardOrder: order, updatedAt: now }
  })

  return { ...state, components, lanes }
}
