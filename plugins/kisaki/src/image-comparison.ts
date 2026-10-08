import type { KisakiEntry, KisakiGroup } from "./core.js"

export type KisakiImageComparisonMode = "single" | "side-by-side" | "swipe" | "onion-skin"

export interface KisakiImageComparisonPreferences {
  mode: KisakiImageComparisonMode
  colorCoding: boolean
}

export interface KisakiImageComparisonState extends KisakiImageComparisonPreferences {
  activePath?: string
  targetPath?: string
  swipePercent: number
  onionOpacity: number
}

export const KISAKI_IMAGE_COMPARISON_DEFAULTS: KisakiImageComparisonPreferences = {
  mode: "single",
  colorCoding: false,
}

export function createKisakiImageComparison(
  preferences: Partial<KisakiImageComparisonPreferences> = {},
): KisakiImageComparisonState {
  return {
    mode: preferences.mode ?? KISAKI_IMAGE_COMPARISON_DEFAULTS.mode,
    colorCoding: preferences.colorCoding ?? KISAKI_IMAGE_COMPARISON_DEFAULTS.colorCoding,
    swipePercent: 50,
    onionOpacity: 50,
  }
}

export function openKisakiImageComparison(
  state: KisakiImageComparisonState,
  groups: readonly KisakiGroup[],
  activePath: string,
): KisakiImageComparisonState {
  const group = findGroup(groups, activePath)
  if (!group) return closeKisakiImageComparison(state)
  return {
    ...state,
    activePath,
    targetPath: group.entries.find((entry) => entry.path !== activePath)?.path,
    swipePercent: 50,
    onionOpacity: 50,
  }
}

export function closeKisakiImageComparison(
  state: KisakiImageComparisonState,
): KisakiImageComparisonState {
  return { ...state, activePath: undefined, targetPath: undefined }
}

export function setKisakiImageComparisonTarget(
  state: KisakiImageComparisonState,
  groups: readonly KisakiGroup[],
  targetPath: string,
): KisakiImageComparisonState {
  const group = state.activePath ? findGroup(groups, state.activePath) : undefined
  if (!group || targetPath === state.activePath || !group.entries.some((entry) => entry.path === targetPath)) return state
  return { ...state, targetPath, swipePercent: 50, onionOpacity: 50 }
}

export function setKisakiImageComparisonMode(
  state: KisakiImageComparisonState,
  mode: KisakiImageComparisonMode,
): KisakiImageComparisonState {
  return state.mode === mode ? state : { ...state, mode }
}

export function setKisakiImageComparisonColorCoding(
  state: KisakiImageComparisonState,
  colorCoding: boolean,
): KisakiImageComparisonState {
  return state.colorCoding === colorCoding ? state : { ...state, colorCoding }
}

export function setKisakiImageComparisonSwipe(
  state: KisakiImageComparisonState,
  swipePercent: number,
): KisakiImageComparisonState {
  const next = percentage(swipePercent)
  return state.swipePercent === next ? state : { ...state, swipePercent: next }
}

export function setKisakiImageComparisonOpacity(
  state: KisakiImageComparisonState,
  onionOpacity: number,
): KisakiImageComparisonState {
  const next = percentage(onionOpacity)
  return state.onionOpacity === next ? state : { ...state, onionOpacity: next }
}

export function getKisakiImageComparisonEntries(
  state: KisakiImageComparisonState,
  groups: readonly KisakiGroup[],
): { active?: KisakiEntry; target?: KisakiEntry; group: readonly KisakiEntry[] } {
  const group = state.activePath ? findGroup(groups, state.activePath) : undefined
  if (!group) return { group: [] }
  return {
    active: group.entries.find((entry) => entry.path === state.activePath),
    target: group.entries.find((entry) => entry.path === state.targetPath),
    group: group.entries,
  }
}

export function kisakiImageComparisonPreferences(
  state: KisakiImageComparisonState,
): KisakiImageComparisonPreferences {
  return { mode: state.mode, colorCoding: state.colorCoding }
}

function findGroup(groups: readonly KisakiGroup[], path: string): KisakiGroup | undefined {
  return groups.find((group) => group.entries.some((entry) => entry.path === path))
}

function percentage(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, Math.round(value)))
}
