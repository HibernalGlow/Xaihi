// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LaneResizer } from "./LaneResizer"

afterEach(cleanup)

describe("LaneResizer", () => {
  it("freezes the resize session on pointer release", () => {
    const onResize = vi.fn()
    const onResizeEnd = vi.fn()
    render(<LaneResizer label="调整泳道宽度" onResize={onResize} onResizeEnd={onResizeEnd} />)

    const separator = screen.getByRole("separator", { name: "调整泳道宽度" })
    expect(separator.tagName).toBe("DIV")
    expect(separator.className).not.toContain("hover:bg-primary")
    fireEvent.pointerDown(separator, { pointerId: 7, clientX: 100, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 132 })
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 132 })
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 180 })

    expect(onResize).toHaveBeenCalledOnce()
    expect(onResize).toHaveBeenCalledWith(0.1)
    expect(onResizeEnd).toHaveBeenCalledOnce()
  })

  it("commits and removes global listeners when the handle unmounts", () => {
    const onResize = vi.fn()
    const onResizeEnd = vi.fn()
    const view = render(<LaneResizer label="调整泳道宽度" onResize={onResize} onResizeEnd={onResizeEnd} />)

    fireEvent.pointerDown(screen.getByRole("separator"), { pointerId: 11, clientX: 200, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 216 })
    view.unmount()
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 260 })

    expect(onResize).toHaveBeenCalledOnce()
    expect(onResizeEnd).toHaveBeenCalledOnce()
  })
})
