export type SwimlaneBarHandleStyle = "grip" | "groove" | "move" | "grab" | "edge"
export type SwimlaneBarHandlePosition = "left" | "right"
export type SwimlaneBarDock = "left" | "right" | "top" | "bottom" | "floating"
export type SwimlaneNavigatorDock = SwimlaneBarDock

export interface SwimlaneInteractionState<Id extends string = string> {
  laneOrder: Id[]
  activeLaneId: Id
  soloLaneId?: Id
}

export interface SwimlaneWorkspaceSessionState {
  activeLaneId?: string
  soloLaneId?: string | null
}

export interface SwimlaneWorkspacePreferences {
  focusOnHover: boolean
  soloOnFocus: boolean
  showNavigatorInSolo: boolean
  focusDelayMs: number
  edgeRevealDelayMs: number
  barHandleStyle: SwimlaneBarHandleStyle
  barHandlePosition: SwimlaneBarHandlePosition
  navigatorPositionX: number
  navigatorPositionY: number
  navigatorDock: SwimlaneNavigatorDock
  navigatorLaneId?: string
  navigatorFollowsFocus: boolean
  autoFitToViewport: boolean
}

export const DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES: SwimlaneWorkspacePreferences = {
  focusOnHover: false,
  soloOnFocus: false,
  showNavigatorInSolo: true,
  focusDelayMs: 650,
  edgeRevealDelayMs: 250,
  barHandleStyle: "grip",
  barHandlePosition: "left",
  navigatorPositionX: 96,
  navigatorPositionY: 94,
  navigatorDock: "floating",
  navigatorFollowsFocus: false,
  autoFitToViewport: false,
}

export function normalizeSwimlanePreferences(value: Partial<SwimlaneWorkspacePreferences & SwimlaneWorkspaceSessionState> | undefined): SwimlaneWorkspacePreferences {
  return {
    focusOnHover: value?.focusOnHover === true,
    soloOnFocus: value?.soloOnFocus === true,
    showNavigatorInSolo: value?.showNavigatorInSolo !== false,
    focusDelayMs: clamp(value?.focusDelayMs, 200, 5000, DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES.focusDelayMs),
    edgeRevealDelayMs: clamp(value?.edgeRevealDelayMs, 100, 5000, DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES.edgeRevealDelayMs),
    barHandleStyle: value?.barHandleStyle === "groove" || value?.barHandleStyle === "move" || value?.barHandleStyle === "grab" || value?.barHandleStyle === "edge" ? value.barHandleStyle : "grip",
    barHandlePosition: value?.barHandlePosition === "right" ? "right" : "left",
    navigatorPositionX: clamp(value?.navigatorPositionX, 0, 100, DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES.navigatorPositionX),
    navigatorPositionY: clamp(value?.navigatorPositionY, 0, 100, DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES.navigatorPositionY),
    navigatorDock: normalizeNavigatorDock(value?.navigatorDock),
    navigatorLaneId: typeof value?.navigatorLaneId === "string" ? value.navigatorLaneId : undefined,
    navigatorFollowsFocus: value?.navigatorFollowsFocus === true,
    autoFitToViewport: value?.autoFitToViewport === true,
  }
}

export function legacySwimlaneSessionState(value: Partial<SwimlaneWorkspaceSessionState> | undefined): SwimlaneWorkspaceSessionState | undefined {
  const activeLaneId = typeof value?.activeLaneId === "string" && value.activeLaneId ? value.activeLaneId : undefined
  const soloLaneId = typeof value?.soloLaneId === "string" && value.soloLaneId
    ? value.soloLaneId
    : value?.soloLaneId === null
      ? null
      : undefined
  return activeLaneId !== undefined || soloLaneId !== undefined ? { activeLaneId, soloLaneId } : undefined
}

export interface SwimlaneWidthConstraint<Id extends string = string> {
  id: Id
  width: number
  collapsed?: boolean
  collapsedWidth?: number
  minimumWidth?: number
  maximumWidth?: number
}

export function fitSwimlaneWidthsToViewport<Id extends string>(viewportWidth: number, lanes: readonly SwimlaneWidthConstraint<Id>[]): Record<Id, number> {
  const expanded = lanes.filter((lane) => !lane.collapsed)
  const collapsedWidth = lanes.reduce((sum, lane) => sum + (lane.collapsed ? Math.max(0, lane.collapsedWidth ?? 44) : 0), 0)
  const minimumTotal = expanded.reduce((sum, lane) => sum + Math.max(1, lane.minimumWidth ?? 1), 0)
  const available = Math.max(minimumTotal, Math.round(Math.max(1, viewportWidth) - collapsedWidth))
  const result = {} as Record<Id, number>
  const pending = new Set(expanded.map((lane) => lane.id))
  let remaining = available

  while (pending.size > 0) {
    const candidates = expanded.filter((lane) => pending.has(lane.id))
    const totalWeight = candidates.reduce((sum, lane) => sum + Math.max(1, lane.width), 0)
    const bounded = candidates.find((lane) => {
      const target = remaining * Math.max(1, lane.width) / totalWeight
      return target < Math.max(1, lane.minimumWidth ?? 1) || target > Math.max(1, lane.maximumWidth ?? Number.POSITIVE_INFINITY)
    })
    if (!bounded) break
    const target = remaining * Math.max(1, bounded.width) / totalWeight
    const width = Math.round(Math.min(Math.max(1, bounded.maximumWidth ?? Number.POSITIVE_INFINITY), Math.max(Math.max(1, bounded.minimumWidth ?? 1), target)))
    result[bounded.id] = width
    remaining -= width
    pending.delete(bounded.id)
  }

  const candidates = expanded.filter((lane) => pending.has(lane.id))
  const totalWeight = candidates.reduce((sum, lane) => sum + Math.max(1, lane.width), 0)
  let assigned = 0
  candidates.forEach((lane, index) => {
    const width = index === candidates.length - 1 ? remaining - assigned : Math.round(remaining * Math.max(1, lane.width) / totalWeight)
    result[lane.id] = Math.max(1, width)
    assigned += result[lane.id]
  })
  return result
}

export function normalizeSwimlaneOrder<Id extends string>(value: readonly string[] | undefined, knownIds: readonly Id[]): Id[] {
  const known = new Set<string>(knownIds)
  const next: Id[] = []
  for (const id of value ?? []) {
    if (!known.has(id) || next.includes(id as Id)) continue
    next.push(id as Id)
  }
  for (const id of knownIds) if (!next.includes(id)) next.push(id)
  return next
}

export function reorderSwimlanes<Id extends string>(laneOrder: readonly Id[], draggedLaneId: Id, targetLaneId: Id): Id[] {
  if (draggedLaneId === targetLaneId || !laneOrder.includes(draggedLaneId) || !laneOrder.includes(targetLaneId)) return [...laneOrder]
  const next = laneOrder.filter((id) => id !== draggedLaneId)
  next.splice(next.indexOf(targetLaneId), 0, draggedLaneId)
  return next
}

export function adjacentSwimlane<Id extends string>(laneOrder: readonly Id[], laneId: Id, edge: "left" | "right"): Id | undefined {
  const index = laneOrder.indexOf(laneId)
  if (index < 0) return undefined
  return laneOrder[index + (edge === "left" ? -1 : 1)]
}

export function activateSwimlane<Id extends string>(state: SwimlaneInteractionState<Id>, laneId: Id, options: { soloOnFocus?: boolean } = {}): SwimlaneInteractionState<Id> {
  return { ...state, activeLaneId: laneId, soloLaneId: options.soloOnFocus ? laneId : state.soloLaneId }
}

export function effectiveSwimlaneWidth(width: number, collapsed: boolean, laneId: string, state: SwimlaneInteractionState, viewportWidth: number, collapsedWidth = 44): number {
  if (collapsed) return collapsedWidth
  if (state.soloLaneId === laneId) return Math.max(1, viewportWidth)
  return Math.max(1, width)
}

function normalizeNavigatorDock(value: unknown): SwimlaneNavigatorDock {
  if (value === "left" || value === "right" || value === "top" || value === "bottom") return value
  if (value === "title") return "top"
  return "floating"
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value! : fallback))
}
