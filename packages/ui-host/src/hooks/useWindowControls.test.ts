import { describe, expect, test, vi } from "vitest"
import { openComponentOnce, withRememberedComponentWindowSize } from "./useWindowControls"

const input = { componentId: "component-1", moduleId: "enginev" }

describe("openComponentOnce", () => {
  test("coalesces concurrent opens for the same component", async () => {
    let settle: ((value: { success: true; supported: true; message: string }) => void) | undefined
    const open = vi.fn(() => new Promise<{ success: true; supported: true; message: string }>((resolve) => {
      settle = resolve
    }))

    const first = openComponentOnce(input, open)
    const second = openComponentOnce(input, open)

    expect(open).toHaveBeenCalledTimes(1)
    settle?.({ success: true, supported: true, message: "Opened" })
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)

    const third = openComponentOnce(input, open)
    settle?.({ success: true, supported: true, message: "Opened again" })
    await third
    expect(open).toHaveBeenCalledTimes(2)
  })

  test("uses the database size and carries workspace identity into the native request", () => {
    expect(withRememberedComponentWindowSize(
      { ...input, width: 460, height: 380 },
      "ws-alpha",
      { width: 1180, height: 760 },
    )).toEqual({
      ...input,
      workspaceId: "ws-alpha",
      width: 1180,
      height: 760,
    })
  })
})
