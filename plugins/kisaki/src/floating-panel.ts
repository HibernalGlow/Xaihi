export interface KisakiFloatingRect { x: number; y: number; width: number; height: number }
export interface KisakiFloatingViewport { width: number; height: number }
export interface KisakiFloatingPanelState { open: boolean; rect: KisakiFloatingRect }
export type KisakiResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw"

const MARGIN = 8
const MIN_WIDTH = 260
const MIN_HEIGHT = 220
const MAX_WIDTH = 900
const MAX_HEIGHT = 900

export function createDefaultKisakiFloatingPanel(viewport: KisakiFloatingViewport): KisakiFloatingPanelState {
  const width = Math.min(380, Math.max(0, viewport.width - MARGIN * 2))
  const height = Math.min(560, Math.max(0, viewport.height - MARGIN * 2))
  return { open: false, rect: clampKisakiFloatingRect({ x: viewport.width - width - 24, y: 64, width, height }, viewport) }
}

export function normalizeKisakiFloatingPanel(value: KisakiFloatingPanelState | undefined, viewport: KisakiFloatingViewport): KisakiFloatingPanelState {
  const fallback = createDefaultKisakiFloatingPanel(viewport)
  return value ? { open: Boolean(value.open), rect: clampKisakiFloatingRect(value.rect, viewport) } : fallback
}

export function clampKisakiFloatingRect(rect: KisakiFloatingRect, viewport: KisakiFloatingViewport): KisakiFloatingRect {
  const availableWidth = Math.max(0, viewport.width - MARGIN * 2)
  const availableHeight = Math.max(0, viewport.height - MARGIN * 2)
  const width = clamp(rect.width, Math.min(MIN_WIDTH, availableWidth), Math.min(MAX_WIDTH, availableWidth))
  const height = clamp(rect.height, Math.min(MIN_HEIGHT, availableHeight), Math.min(MAX_HEIGHT, availableHeight))
  const x = clamp(rect.x, MARGIN, Math.max(MARGIN, viewport.width - width - MARGIN))
  const y = clamp(rect.y, MARGIN, Math.max(MARGIN, viewport.height - height - MARGIN))
  return { x, y, width, height }
}

export function moveKisakiFloatingRect(rect: KisakiFloatingRect, deltaX: number, deltaY: number, viewport: KisakiFloatingViewport): KisakiFloatingRect {
  return clampKisakiFloatingRect({ ...rect, x: rect.x + deltaX, y: rect.y + deltaY }, viewport)
}

export function resizeKisakiFloatingRect(rect: KisakiFloatingRect, direction: KisakiResizeDirection, deltaX: number, deltaY: number, viewport: KisakiFloatingViewport): KisakiFloatingRect {
  let { x, y, width, height } = rect
  if (direction.includes("e")) width += deltaX
  if (direction.includes("s")) height += deltaY
  if (direction.includes("w")) { x += deltaX; width -= deltaX }
  if (direction.includes("n")) { y += deltaY; height -= deltaY }
  const clamped = clampKisakiFloatingRect({ x, y, width, height }, viewport)
  if (direction.includes("w")) clamped.x = Math.min(rect.x + rect.width - clamped.width, viewport.width - clamped.width - MARGIN)
  if (direction.includes("n")) clamped.y = Math.min(rect.y + rect.height - clamped.height, viewport.height - clamped.height - MARGIN)
  return clampKisakiFloatingRect(clamped, viewport)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(min, value), Math.max(min, max))
}
