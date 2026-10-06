import { getRuntime } from "./client"
import type { WindowRuntime } from "./runtime/runtime"
import { createLogger } from "@/lib/logger"

const logger = createLogger("backend.window-drag")

/** The class every frameless caption marks its draggable strip with (`TopBar`, `FloatingWindowFrame`). */
export const DRAG_REGION_SELECTOR = ".xiranite-app-region-drag"
/** Controls inside a drag region opt back out with this one. */
export const NO_DRAG_REGION_SELECTOR = ".xiranite-app-region-no-drag"

/** The window label a component window was opened with; the main document has no `windowId`. */
export const MAIN_WINDOW_LABEL = "main"

interface ClosestTarget {
  closest: (selector: string) => unknown
}

/**
 * Whether a pointerdown on `target` should start moving the OS window.
 *
 * The two classes are the whole vocabulary — the same one the retired Wails bridge read out of
 * `-webkit-app-region`. Keeping it a predicate over `closest` is what makes it testable without a DOM and
 * what stops every caption from re-deciding the rule.
 */
export function isDragRegionStart(target: ClosestTarget | null | undefined): boolean {
  if (!target || typeof target.closest !== "function") return false
  if (target.closest(NO_DRAG_REGION_SELECTOR)) return false
  return Boolean(target.closest(DRAG_REGION_SELECTOR))
}

/** Which window this document is: `?windowId=component-<id>` for a component window, else `main`. */
export function currentWindowLabel(search: string = typeof window === "undefined" ? "" : window.location.search): string {
  const label = new URLSearchParams(search).get("windowId")?.trim()
  return label && label.length > 0 ? label : MAIN_WINDOW_LABEL
}

/** The part of a pointer event this handler reads, kept structural so it is testable without an `Event`. */
export interface DragRegionPointerEvent {
  target: unknown
  button: number
}

/**
 * The routing decision, separate from the listener so the rule can be driven directly: a primary press on
 * a drag strip asks the host to move this window, and anything else is ignored without ever touching the
 * runtime (a click on a caption must not become a runtime-selection cost).
 */
export function createDragRegionHandler(
  getWindows: () => Promise<Pick<WindowRuntime, "startDragging">>,
  windowLabel: string = currentWindowLabel(),
): (event: DragRegionPointerEvent) => void {
  let dragging = false
  return (event) => {
    // A secondary-button press inside a caption is a context menu, not a move.
    if (event.button !== 0 || dragging) return
    if (!isDragRegionStart(event.target as ClosestTarget | null)) return

    dragging = true
    void getWindows()
      .then((windows) => windows.startDragging(windowLabel))
      .catch((error: unknown) => {
        logger.warn("Window drag request failed", error)
      })
      .finally(() => {
        dragging = false
      })
  }
}

/**
 * Route the caption's drag regions to the host's window manager.
 *
 * Installed once at bootstrap because the rule belongs to the shell, not to a caption: a node component
 * that wants to be draggable only adds the class, exactly as it did under Wails. Returns the teardown so
 * a test (or a hot reload) can undo it.
 */
export function installNativeWindowDragRegion(
  webView: EventTarget = typeof window === "undefined" ? new EventTarget() : window,
): () => void {
  const handler = createDragRegionHandler(async () => (await getRuntime()).windows)
  const listener = (event: Event) => handler(event as unknown as DragRegionPointerEvent)

  webView.addEventListener("pointerdown", listener)
  return () => webView.removeEventListener("pointerdown", listener)
}
