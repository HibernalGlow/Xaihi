import { describe, expect, it, vi } from "vitest"

import {
  createDragRegionHandler,
  currentWindowLabel,
  isDragRegionStart,
} from "./windowDragRegion"

/** The smallest thing `closest` is ever asked for: a node that matches the given selectors. */
function target(matching: string[]): { closest: (selector: string) => string | null } {
  return { closest: (selector: string) => (matching.includes(selector) ? selector : null) }
}

describe("isDragRegionStart", () => {
  it("starts a drag only inside a marked region", () => {
    expect(isDragRegionStart(target([".xiranite-app-region-drag"]))).toBe(true)
    expect(isDragRegionStart(target([]))).toBe(false)
  })

  /// The button-in-the-bar case: without this arm every caption control would move the window.
  it("gives the no-drag opt-out precedence over the region", () => {
    expect(isDragRegionStart(target([".xiranite-app-region-drag", ".xiranite-app-region-no-drag"]))).toBe(false)
  })

  it("survives a target that cannot answer closest", () => {
    expect(isDragRegionStart(null)).toBe(false)
    expect(isDragRegionStart({} as never)).toBe(false)
  })
})

describe("currentWindowLabel", () => {
  it("names the component window the host opened", () => {
    expect(currentWindowLabel("?floatingComponent=cmp-7&windowId=component-cmp-7")).toBe("component-cmp-7")
  })

  it("falls back to main for the workspace document", () => {
    expect(currentWindowLabel("")).toBe("main")
    expect(currentWindowLabel("?windowId=")).toBe("main")
  })
})

describe("createDragRegionHandler", () => {
  const startDragging = vi.fn(async (_id?: string) => ({ success: true, supported: true, message: "ok" }))
  const getWindows = async () => ({ startDragging })

  it("routes a primary press on a drag strip to the named window", async () => {
    startDragging.mockClear()
    const handler = createDragRegionHandler(getWindows, "component-cmp-7")

    handler({ target: target([".xiranite-app-region-drag"]), button: 0 })
    await vi.waitFor(() => expect(startDragging).toHaveBeenCalledWith("component-cmp-7"))
  })

  it("never resolves the runtime for a press outside a drag strip", async () => {
    startDragging.mockClear()
    const resolver = vi.fn(getWindows)
    const handler = createDragRegionHandler(resolver, "main")

    handler({ target: target([]), button: 0 })
    handler({ target: target([".xiranite-app-region-drag", ".xiranite-app-region-no-drag"]), button: 0 })
    await Promise.resolve()
    expect(resolver).not.toHaveBeenCalled()
    expect(startDragging).not.toHaveBeenCalled()
  })

  /// Right-click inside a caption opens the context menu; it must not move the window.
  it("ignores non-primary buttons", async () => {
    startDragging.mockClear()
    const handler = createDragRegionHandler(getWindows, "main")

    handler({ target: target([".xiranite-app-region-drag"]), button: 2 })
    await Promise.resolve()
    expect(startDragging).not.toHaveBeenCalled()
  })

  it("holds one drag at a time even when the host is slow", async () => {
    startDragging.mockClear()
    let release: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const handler = createDragRegionHandler(async () => ({
      startDragging: async () => {
        await pending
        startDragging("main")
        return { success: true, supported: true, message: "ok" }
      },
    }), "main")

    handler({ target: target([".xiranite-app-region-drag"]), button: 0 })
    handler({ target: target([".xiranite-app-region-drag"]), button: 0 })
    release()
    await vi.waitFor(() => expect(startDragging).toHaveBeenCalledTimes(1))
  })
})
