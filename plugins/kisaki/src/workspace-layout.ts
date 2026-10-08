export interface KisakiWorkspaceLayout {
  version: 1;
  toolRailWidth: number;
  sourcePanelWidth: number;
  resultPanelWidth: number;
  analysisPanelWidth: number;
  toolRailMinimized: boolean;
  sourcePanelMinimized: boolean;
  resultPanelMinimized: boolean;
  analysisPanelMinimized: boolean;
  laneOrder: KisakiLaneId[];
  activeLane: KisakiLaneId;
  soloLane: KisakiLaneId | null;
  focusOnHover: boolean;
  soloOnFocus: boolean;
  showNavigatorInSolo: boolean;
  focusDelayMs: number;
  edgeRevealDelayMs: number;
  barHandleStyle: KisakiBarHandleStyle;
  barHandlePosition: KisakiBarHandlePosition;
  navigatorPositionX: number;
  navigatorPositionY: number;
  navigatorDock: "floating" | "left" | "right" | "top" | "bottom";
  navigatorLane: KisakiLaneId;
  navigatorFollowsFocus: boolean;
  autoFitToViewport: boolean;
}

export type KisakiLaneId = "source" | "results" | "analysis";
export type KisakiBarHandleStyle = "grip" | "groove" | "move" | "grab" | "edge";
export type KisakiBarHandlePosition = "left" | "right";

export const KISAKI_WORKSPACE_DEFAULTS: KisakiWorkspaceLayout = {
  version: 1,
  toolRailWidth: 176,
  sourcePanelWidth: 300,
  resultPanelWidth: 720,
  analysisPanelWidth: 300,
  toolRailMinimized: false,
  sourcePanelMinimized: false,
  resultPanelMinimized: false,
  analysisPanelMinimized: false,
  laneOrder: ["source", "results", "analysis"],
  activeLane: "results",
  soloLane: null,
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
  navigatorLane: "results",
  navigatorFollowsFocus: false,
  autoFitToViewport: false,
};

export function normalizeKisakiWorkspaceLayout(
  value: Partial<KisakiWorkspaceLayout> | undefined,
): KisakiWorkspaceLayout {
  if (!value || value.version !== 1) return { ...KISAKI_WORKSPACE_DEFAULTS };
  return {
    version: 1,
    toolRailWidth: clamp(
      value.toolRailWidth,
      120,
      260,
      KISAKI_WORKSPACE_DEFAULTS.toolRailWidth,
    ),
    sourcePanelWidth: clamp(
      value.sourcePanelWidth,
      220,
      560,
      KISAKI_WORKSPACE_DEFAULTS.sourcePanelWidth,
    ),
    resultPanelWidth: clamp(
      value.resultPanelWidth,
      360,
      1200,
      KISAKI_WORKSPACE_DEFAULTS.resultPanelWidth,
    ),
    analysisPanelWidth: clamp(
      value.analysisPanelWidth,
      210,
      520,
      KISAKI_WORKSPACE_DEFAULTS.analysisPanelWidth,
    ),
    toolRailMinimized: value.toolRailMinimized === true,
    sourcePanelMinimized: value.sourcePanelMinimized === true,
    resultPanelMinimized: value.resultPanelMinimized === true,
    analysisPanelMinimized: value.analysisPanelMinimized === true,
    laneOrder: normalizeLaneOrder(value.laneOrder),
    activeLane: normalizeLaneId(value.activeLane, KISAKI_WORKSPACE_DEFAULTS.activeLane),
    soloLane: value.soloLane == null ? null : normalizeLaneId(value.soloLane, null),
    focusOnHover: value.focusOnHover === true,
    soloOnFocus: value.soloOnFocus === true,
    showNavigatorInSolo: value.showNavigatorInSolo !== false,
    focusDelayMs: clamp(value.focusDelayMs, 200, 5000, KISAKI_WORKSPACE_DEFAULTS.focusDelayMs),
    edgeRevealDelayMs: clamp(value.edgeRevealDelayMs, 100, 5000, KISAKI_WORKSPACE_DEFAULTS.edgeRevealDelayMs),
    barHandleStyle: normalizeHandleStyle(value.barHandleStyle),
    barHandlePosition: value.barHandlePosition === "right" ? "right" : "left",
    navigatorPositionX: clamp(value.navigatorPositionX, 0, 100, KISAKI_WORKSPACE_DEFAULTS.navigatorPositionX),
    navigatorPositionY: clamp(value.navigatorPositionY, 0, 100, KISAKI_WORKSPACE_DEFAULTS.navigatorPositionY),
    navigatorDock: normalizeNavigatorDock(value.navigatorDock),
    navigatorLane: normalizeLaneId(value.navigatorLane, KISAKI_WORKSPACE_DEFAULTS.navigatorLane),
    navigatorFollowsFocus: value.navigatorFollowsFocus === true,
    autoFitToViewport: value.autoFitToViewport === true,
  };
}

export function updateKisakiWorkspaceLayout(
  layout: KisakiWorkspaceLayout,
  patch: Partial<Omit<KisakiWorkspaceLayout, "version">>,
): KisakiWorkspaceLayout {
  return normalizeKisakiWorkspaceLayout({ ...layout, ...patch });
}

function clamp(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  return Math.min(
    max,
    Math.max(min, Number.isFinite(value) ? value! : fallback),
  );
}

function normalizeLaneOrder(value: KisakiLaneId[] | undefined): KisakiLaneId[] {
  const valid = new Set<KisakiLaneId>(["source", "results", "analysis"]);
  const next = (value ?? []).filter((id, index, items) => valid.has(id) && items.indexOf(id) === index);
  for (const id of KISAKI_WORKSPACE_DEFAULTS.laneOrder) if (!next.includes(id)) next.push(id);
  return next;
}

function normalizeLaneId<Fallback extends KisakiLaneId | null>(value: unknown, fallback: Fallback): KisakiLaneId | Fallback {
  return value === "source" || value === "results" || value === "analysis" ? value : fallback;
}

function normalizeHandleStyle(value: unknown): KisakiBarHandleStyle {
  return value === "groove" || value === "move" || value === "grab" || value === "edge" ? value : "grip";
}

function normalizeNavigatorDock(value: unknown): KisakiWorkspaceLayout["navigatorDock"] {
  if (value === "left" || value === "right" || value === "top" || value === "bottom") return value;
  if (value === "title") return "top";
  return "floating";
}
