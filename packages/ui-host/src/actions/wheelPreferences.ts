/**
 * 轮盘扇区的用户自定义（顺序 + 隐藏），纯函数、不依赖 store 与 React。
 *
 * 形状照抄节点卡片工具栏那套 `chromeActionPreferences`（order + hidden 两份数组、
 * 两列 kanban），这样仓里只有一种「界面元素自定义」的持久化语义。
 * 与那份的差别只有一个：动作集合是注册表动态给的，不是写死的常量表。
 */

export const WHEEL_VISIBLE_COLUMN = "visible"
export const WHEEL_HIDDEN_COLUMN = "hidden"

/**
 * 轮盘最多绑几格。
 */
export const WHEEL_MAX_SECTORS = 8

/**
 * 半径与间距是**两个独立的用户参数**，不互相推导：
 * 半径 = 格子离锚点多远；间距 = 相邻两格夹多少度。
 * （早先版本用「不重叠所需的最小半径」反推半径，于是绑得越多离得越远，用户判为难用。）
 */
export const WHEEL_RADIUS_DEFAULT_PX = 148
export const WHEEL_RADIUS_MIN_PX = 72
export const WHEEL_RADIUS_MAX_PX = 280
export const WHEEL_PITCH_DEFAULT_DEG = 15
export const WHEEL_PITCH_MIN_DEG = 8
export const WHEEL_PITCH_MAX_DEG = 45

/** 可用弧：从正下（180°）起，PieMenu 的罗盘口径（0=上、顺时针）。 */
export const WHEEL_ARC_FIRST_DEG = 180

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampWheelRadius(value: number): number {
  return clamp(value, WHEEL_RADIUS_MIN_PX, WHEEL_RADIUS_MAX_PX)
}

export function clampWheelPitch(value: number): number {
  return clamp(value, WHEEL_PITCH_MIN_DEG, WHEEL_PITCH_MAX_DEG)
}

/**
 * 整圈格子数 = 360 / 间距，取整到能整除的最近值，
 * 这样上游 `layoutItems(count, …)` 得到的实际间距与用户设的尽量一致。
 */
export function wheelSlotCount(pitchDeg: number): number {
  const pitch = clampWheelPitch(pitchDeg)
  return Math.max(1, Math.round(360 / pitch))
}

/** 实际间距（度），因为格子数必须整数，所以它可能与用户设的值差零点几度。 */
export function wheelActualPitchDeg(slotCount: number): number {
  return slotCount > 0 ? 360 / slotCount : WHEEL_PITCH_DEFAULT_DEG
}

/** 第一格的方向：正下偏半个间距，让绑定的格子从正下开始排。 */
export function wheelFirstItemDeg(slotCount: number): number {
  return WHEEL_ARC_FIRST_DEG + wheelActualPitchDeg(slotCount) / 2
}

/** 中心不选任何东西的半径，跟着半径走。 */
export function wheelDeadZonePx(radiusPx: number): number {
  return Math.max(22, Math.round(clampWheelRadius(radiusPx) / 4))
}

export type WheelPreferenceId = string

export type WheelKanbanColumns = Record<
  typeof WHEEL_VISIBLE_COLUMN | typeof WHEEL_HIDDEN_COLUMN,
  WheelPreferenceId[]
>

function onlyKnown(allIds: readonly WheelPreferenceId[], value: unknown): WheelPreferenceId[] {
  const known = new Set(allIds)
  const configured = Array.isArray(value) ? value : []
  const seen = new Set<WheelPreferenceId>()
  const result: WheelPreferenceId[] = []
  for (const entry of configured) {
    if (typeof entry !== "string" || !known.has(entry) || seen.has(entry)) continue
    seen.add(entry)
    result.push(entry)
  }
  return result
}

/** 配置里的已知 id 按配置顺序排在前面，注册表里新增的动作自动补在尾部（新动作不许凭空消失）。 */
export function normalizeWheelActionOrder(
  allIds: readonly WheelPreferenceId[],
  configured: unknown,
): WheelPreferenceId[] {
  const ordered = onlyKnown(allIds, configured)
  const seen = new Set(ordered)
  for (const id of allIds) {
    if (!seen.has(id)) ordered.push(id)
  }
  return ordered
}

export function normalizeWheelHiddenActions(
  allIds: readonly WheelPreferenceId[],
  configured: unknown,
): WheelPreferenceId[] {
  const hidden = new Set(onlyKnown(allIds, configured))
  return allIds.filter((id) => hidden.has(id))
}

export function splitWheelKanbanColumns(
  allIds: readonly WheelPreferenceId[],
  order: readonly WheelPreferenceId[],
  hiddenActions: readonly WheelPreferenceId[],
): WheelKanbanColumns {
  const normalizedOrder = normalizeWheelActionOrder(allIds, order)
  const hidden = new Set(normalizeWheelHiddenActions(allIds, hiddenActions))
  return {
    [WHEEL_VISIBLE_COLUMN]: normalizedOrder.filter((id) => !hidden.has(id)),
    [WHEEL_HIDDEN_COLUMN]: normalizedOrder.filter((id) => hidden.has(id)),
  }
}

/**
 * 两列 → order + hidden。
 *
 * 已知损失（照抄 `chromeActionPreferences` 的语义，不另造一套）：拼接顺序是「可见列在前、
 * 隐藏列在后」，所以被藏起来的项在 order 中的原始插位会丢。轮盘渲染前先滤隐藏项，
 * 因此这个损失不会体现在界面上；代价是 split→merge 不是严格幂等，只有第二轮起稳定。
 */
export function mergeWheelKanbanColumns(
  allIds: readonly WheelPreferenceId[],
  columns: Partial<WheelKanbanColumns>,
): { order: WheelPreferenceId[]; hiddenActions: WheelPreferenceId[] } {
  const visible = columns[WHEEL_VISIBLE_COLUMN] ?? []
  const hidden = columns[WHEEL_HIDDEN_COLUMN] ?? []
  const order = normalizeWheelActionOrder(allIds, [...visible, ...hidden])
  return { order, hiddenActions: normalizeWheelHiddenActions(allIds, hidden) }
}

/**
 * 把偏好作用到渲染器给的视图列表上：去隐藏、按 order 排、截到扇区上限。
 *
 * 上限按参数传而不是从这里 import 常量，是为了让 `actions/` 不反向依赖 `components/ui/`。
 */
export function applyWheelLayout<T extends { id: string }>(
  views: readonly T[],
  preferences: { order: readonly WheelPreferenceId[]; hiddenActions: readonly WheelPreferenceId[] },
  maxSectors: number,
): T[] {
  const hidden = new Set(preferences.hiddenActions)
  const rank = new Map(preferences.order.map((id, index) => [id, index]))
  return views
    .filter((view) => !hidden.has(view.id))
    .map((view, index) => ({ view, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.view.id) ?? Number.MAX_SAFE_INTEGER
      const rightRank = rank.get(right.view.id) ?? Number.MAX_SAFE_INTEGER
      return leftRank - rightRank || left.index - right.index
    })
    .slice(0, maxSectors)
    .map((entry) => entry.view)
}
