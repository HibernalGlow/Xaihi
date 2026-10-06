export type FindzLaneId = "source" | "results" | "analysis"

export interface FindzWorkspaceLayout {
  version: 1
  laneOrder: FindzLaneId[]
  sourceWidth: number
  resultsWidth: number
  analysisWidth: number
  sourceCollapsed: boolean
  resultsCollapsed: boolean
  analysisCollapsed: boolean
  activeLane: FindzLaneId
  soloLane: FindzLaneId | null
  navigatorPositionX: number
  navigatorPositionY: number
}

export const FINDZ_WORKSPACE_DEFAULTS: FindzWorkspaceLayout = {
  version: 1,
  laneOrder: ["source", "results", "analysis"],
  sourceWidth: 340,
  resultsWidth: 660,
  analysisWidth: 400,
  sourceCollapsed: false,
  resultsCollapsed: false,
  analysisCollapsed: false,
  activeLane: "results",
  soloLane: null,
  navigatorPositionX: 96,
  navigatorPositionY: 94,
}

export function normalizeFindzWorkspaceLayout(value: Partial<FindzWorkspaceLayout> | undefined): FindzWorkspaceLayout {
  if (!value || value.version !== 1) return { ...FINDZ_WORKSPACE_DEFAULTS }
  return {
    version: 1,
    laneOrder: normalizeLaneOrder(value.laneOrder),
    sourceWidth: clamp(value.sourceWidth, 260, 540, FINDZ_WORKSPACE_DEFAULTS.sourceWidth),
    resultsWidth: clamp(value.resultsWidth, 420, 1_200, FINDZ_WORKSPACE_DEFAULTS.resultsWidth),
    analysisWidth: clamp(value.analysisWidth, 300, 680, FINDZ_WORKSPACE_DEFAULTS.analysisWidth),
    sourceCollapsed: value.sourceCollapsed === true,
    resultsCollapsed: value.resultsCollapsed === true,
    analysisCollapsed: value.analysisCollapsed === true,
    activeLane: isFindzLaneId(value.activeLane) ? value.activeLane : FINDZ_WORKSPACE_DEFAULTS.activeLane,
    soloLane: isFindzLaneId(value.soloLane) ? value.soloLane : null,
    navigatorPositionX: clamp(value.navigatorPositionX, 0, 100, FINDZ_WORKSPACE_DEFAULTS.navigatorPositionX),
    navigatorPositionY: clamp(value.navigatorPositionY, 0, 100, FINDZ_WORKSPACE_DEFAULTS.navigatorPositionY),
  }
}

export function updateFindzWorkspaceLayout(layout: FindzWorkspaceLayout, patch: Partial<Omit<FindzWorkspaceLayout, "version">>): FindzWorkspaceLayout {
  return normalizeFindzWorkspaceLayout({ ...layout, ...patch })
}

export function findzLaneWidth(layout: FindzWorkspaceLayout, laneId: FindzLaneId): number {
  return laneId === "source" ? layout.sourceWidth : laneId === "results" ? layout.resultsWidth : layout.analysisWidth
}

export function findzLaneCollapsed(layout: FindzWorkspaceLayout, laneId: FindzLaneId): boolean {
  return laneId === "source" ? layout.sourceCollapsed : laneId === "results" ? layout.resultsCollapsed : layout.analysisCollapsed
}

export function findzLanePatch(laneId: FindzLaneId, patch: { collapsed?: boolean; width?: number }): Partial<FindzWorkspaceLayout> {
  if (laneId === "source") return { ...(patch.collapsed === undefined ? {} : { sourceCollapsed: patch.collapsed }), ...(patch.width === undefined ? {} : { sourceWidth: patch.width }) }
  if (laneId === "results") return { ...(patch.collapsed === undefined ? {} : { resultsCollapsed: patch.collapsed }), ...(patch.width === undefined ? {} : { resultsWidth: patch.width }) }
  return { ...(patch.collapsed === undefined ? {} : { analysisCollapsed: patch.collapsed }), ...(patch.width === undefined ? {} : { analysisWidth: patch.width }) }
}

function normalizeLaneOrder(value: readonly string[] | undefined): FindzLaneId[] {
  const result: FindzLaneId[] = []
  for (const laneId of value ?? []) if (isFindzLaneId(laneId) && !result.includes(laneId)) result.push(laneId)
  for (const laneId of FINDZ_WORKSPACE_DEFAULTS.laneOrder) if (!result.includes(laneId)) result.push(laneId)
  return result
}

function isFindzLaneId(value: unknown): value is FindzLaneId {
  return value === "source" || value === "results" || value === "analysis"
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value! : fallback))
}
