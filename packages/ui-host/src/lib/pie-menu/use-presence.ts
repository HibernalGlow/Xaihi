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
import { useEffect, useState, type RefObject } from "react"

/**
 * - `starting`: first frame after mount. Styles show the enter start state.
 * - `entering`: enter transitions run. Use it for enter-only effects, such as a stagger.
 * - `open`: idle.
 * - `ending`: exit transitions run. The element unmounts when they finish.
 */
export type PresenceStatus = "starting" | "entering" | "open" | "ending"

/**
 * Keeps an element mounted while its CSS transitions finish, in the style of
 * Base UI's `data-starting-style` and `data-ending-style`. It waits on the Web
 * Animations API, so it works with transitions and keyframes and needs no timers.
 */
export function usePresence(
  present: boolean,
  ref: RefObject<HTMLElement | null>
) {
  const [mounted, setMounted] = useState(present)
  const [status, setStatus] = useState<PresenceStatus>(
    present ? "starting" : "ending"
  )

  // Adjust the state when the prop changes, during render. This is the React pattern
  // for state that follows a prop, and it avoids an extra render from an effect.
  const [previous, setPrevious] = useState(present)
  if (present !== previous) {
    setPrevious(present)
    if (present) {
      setMounted(true)
      setStatus("starting")
    } else if (status !== "starting") {
      setStatus("ending")
    }
  }

  useEffect(() => {
    if (!mounted) return
    let cancelled = false
    let frame = 0

    if (status === "starting") {
      // Two frames: the browser must paint the start state before it can transition from it.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() =>
          setStatus(present ? "entering" : "ending")
        )
      })
    } else if (status === "entering" || status === "ending") {
      frame = requestAnimationFrame(() => {
        waitForAnimations(ref.current).then(() => {
          if (cancelled) return
          if (status === "entering") setStatus("open")
          else setMounted(false)
        })
      })
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [mounted, status, present, ref])

  return { mounted, status }
}

function waitForAnimations(element: HTMLElement | null) {
  if (!element || typeof element.getAnimations !== "function")
    return Promise.resolve()
  // Skip endless animations, such as a spinner inside the element. They never finish.
  const animations = element
    .getAnimations({ subtree: true })
    .filter(
      (animation) => animation.effect?.getComputedTiming().endTime !== Infinity
    )
  return Promise.allSettled(animations.map((animation) => animation.finished))
}
