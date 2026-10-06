/**
 * Vendored from PieMenu — joaopmarques/pie-menu, distributed as the shadcn registry
 * item `@jpmarques/pie-menu` (https://piemenu.jpmarqu.es/r/pie-menu.json), MIT licensed.
 * Fetched 2026-10-06. Third-party surface is react / react-dom / radix-ui only, all of
 * which this repo already carries, so this adds no dependency.
 *
 * Kept byte-identical to upstream on purpose: the pie geometry (centered wedges,
 * disabled-item aiming, measured extents + viewport clamping) is the reason it is used
 * instead of the repo's own first attempt. Any local change here must be recorded below.
 *
 * Departures from upstream: none.
 */
/**
 * Pure math for pie menus. Angles are in radians, measured clockwise from
 * 12 o'clock, so 0 is "up" and PI / 2 is "right". Screen y grows downward.
 */

export const TAU = Math.PI * 2

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface ItemLayout {
  index: number
  angle: number
  /** Offset of the anchor point from the menu center, in px. */
  x: number
  y: number
  sin: number
  cos: number
}

export function degToRad(degrees: number) {
  return (degrees * Math.PI) / 180
}

export function radToDeg(radians: number) {
  return (radians * 180) / Math.PI
}

export function normalizeAngle(angle: number) {
  return ((angle % TAU) + TAU) % TAU
}

/** Angle of a vector in screen space. */
export function vectorAngle(dx: number, dy: number) {
  return normalizeAngle(Math.atan2(dx, -dy))
}

/** Smallest distance between two angles, in the range [0, PI]. */
export function angularDistance(a: number, b: number) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  return Math.min(diff, TAU - diff)
}

export function itemAngle(index: number, count: number, startAngle = 0) {
  return normalizeAngle(startAngle + (index * TAU) / count)
}

export function layoutItems(
  count: number,
  radius: number,
  startAngle = 0
): ItemLayout[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = itemAngle(index, count, startAngle)
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    return { index, angle, sin, cos, x: sin * radius, y: -cos * radius }
  })
}

/** Index of the wedge that contains the angle. Each wedge is centered on its item. */
export function wedgeIndex(angle: number, count: number, startAngle = 0) {
  if (count === 0) return -1
  const slice = TAU / count
  return Math.round(normalizeAngle(angle - startAngle) / slice) % count
}

/** Index of the enabled item closest to the angle, or -1 when no item is enabled. */
export function nearestIndex(
  angle: number,
  angles: readonly number[],
  enabled: readonly boolean[]
) {
  let best = -1
  let bestDistance = Infinity
  angles.forEach((itemAngle, index) => {
    if (!enabled[index]) return
    const distance = angularDistance(angle, itemAngle)
    if (distance < bestDistance - 1e-9) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/** Next enabled index when walking the ring. Returns -1 when no item is enabled. */
export function stepIndex(
  from: number,
  step: 1 | -1,
  enabled: readonly boolean[]
) {
  const count = enabled.length
  for (let offset = 1; offset <= count; offset++) {
    const index = (((from + step * offset) % count) + count) % count
    if (enabled[index]) return index
  }
  return -1
}

/**
 * Where an item box sits relative to its anchor point. Boxes grow away from the
 * center: a right-side label starts at the anchor, a top label ends at it.
 * The result is a fraction of the box size, in the range [-1, 0].
 */
export function anchorOffset(sin: number, cos: number) {
  return { x: -0.5 + 0.5 * sin, y: -0.5 - 0.5 * cos }
}

/** CSS `translate` value that puts an item box at its anchor point. */
export function itemTranslate(layout: ItemLayout) {
  const offset = anchorOffset(layout.sin, layout.cos)
  const px = (value: number) => `${round(value)}px`
  const pct = (value: number) => `${round(value * 100)}%`
  return `calc(${px(layout.x)} + ${pct(offset.x)}) calc(${px(layout.y)} + ${pct(offset.y)})`
}

export interface Extents {
  left: number
  right: number
  top: number
  bottom: number
}

/** Bounding box of all item boxes and a centered box, relative to the menu center. */
export function menuExtents(
  layouts: readonly ItemLayout[],
  sizes: readonly Size[],
  centerSize?: Size
): Extents {
  const extents: Extents = { left: 0, right: 0, top: 0, bottom: 0 }
  const include = (left: number, top: number, size: Size) => {
    extents.left = Math.min(extents.left, left)
    extents.top = Math.min(extents.top, top)
    extents.right = Math.max(extents.right, left + size.width)
    extents.bottom = Math.max(extents.bottom, top + size.height)
  }
  layouts.forEach((layout, index) => {
    const size = sizes[index]
    if (!size) return
    const offset = anchorOffset(layout.sin, layout.cos)
    include(
      layout.x + offset.x * size.width,
      layout.y + offset.y * size.height,
      size
    )
  })
  if (centerSize)
    include(-centerSize.width / 2, -centerSize.height / 2, centerSize)
  return extents
}

/** Scale that makes the menu fit inside the viewport, never above 1 and never below `min`. */
export function fitScale(
  extents: Extents,
  viewport: Size,
  padding = 8,
  min = 0.5
) {
  const width = extents.right - extents.left
  const height = extents.bottom - extents.top
  const scale = Math.min(
    1,
    (viewport.width - padding * 2) / width,
    (viewport.height - padding * 2) / height
  )
  return Math.max(min, Number.isFinite(scale) ? scale : 1)
}

export function scaleExtents(extents: Extents, scale: number): Extents {
  return {
    left: extents.left * scale,
    right: extents.right * scale,
    top: extents.top * scale,
    bottom: extents.bottom * scale,
  }
}

/** Moves the center so the whole menu stays inside the viewport. */
export function clampCenter(
  point: Point,
  extents: Extents,
  viewport: Size,
  padding = 8
): Point {
  const clampAxis = (value: number, min: number, max: number, size: number) =>
    min > max ? size / 2 : Math.min(Math.max(value, min), max)
  return {
    x: clampAxis(
      point.x,
      padding - extents.left,
      viewport.width - padding - extents.right,
      viewport.width
    ),
    y: clampAxis(
      point.y,
      padding - extents.top,
      viewport.height - padding - extents.bottom,
      viewport.height
    ),
  }
}

/** Rotation target in degrees that turns the shortest way from the current value. */
export function shortestRotation(fromDegrees: number, toDegrees: number) {
  const delta = ((((toDegrees - fromDegrees) % 360) + 540) % 360) - 180
  return fromDegrees + delta
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
