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
import { useSyncExternalStore } from "react"

import { radToDeg, vectorAngle } from "./geometry"

/**
 * Where the user "aims" inside an open pie menu: the pointer direction, or the
 * direction of the highlighted item when the user drives the menu by keyboard.
 * `x` and `y` are in the range [-1, 1], relative to the menu radius.
 */
export interface Aim {
  x: number
  y: number
  /** Degrees, clockwise from 12 o'clock. */
  angle: number
  /** 0 at the center, 1 at the item ring or farther. */
  distance: number
}

export const IDLE_AIM: Aim = { x: 0, y: 0, angle: 0, distance: 0 }

export function aimFromVector(dx: number, dy: number, radius: number): Aim {
  const length = Math.hypot(dx, dy)
  if (length === 0) return IDLE_AIM
  const distance = Math.min(length / radius, 1)
  return {
    x: (dx / length) * distance,
    y: (dy / length) * distance,
    angle: radToDeg(vectorAngle(dx, dy)),
    distance,
  }
}

type Listener = () => void

/**
 * A tiny external store. Pointer moves arrive at display rate, so the menu
 * writes them here and to CSS variables instead of into React state.
 */
export function createAimStore() {
  let aim = IDLE_AIM
  const listeners = new Set<Listener>()
  return {
    get: () => aim,
    set(next: Aim) {
      if (next.x === aim.x && next.y === aim.y) return
      aim = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type AimStore = ReturnType<typeof createAimStore>

export function useAimStore(store: AimStore | null) {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.get ?? getIdle,
    getIdle
  )
}

/** CSS custom properties that mirror the aim, for styles that follow the pointer. */
export function aimStyle(aim: Aim) {
  return {
    "--pie-aim-x": round(aim.x),
    "--pie-aim-y": round(aim.y),
    "--pie-aim-angle": `${round(aim.angle)}deg`,
    "--pie-aim-distance": round(aim.distance),
  }
}

const noopSubscribe = () => () => {}
const getIdle = () => IDLE_AIM

function round(value: number) {
  return String(Math.round(value * 1000) / 1000)
}
