// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SwimlaneCollapseDragButton } from "./SwimlaneCollapseDragButton"

describe("SwimlaneCollapseDragButton", () => {
  it("keeps collapse as the click action and exposes one drag affordance", () => {
    const onClick = vi.fn()
    render(<SwimlaneCollapseDragButton collapsed={false} laneLabel="结果泳道" draggable onClick={onClick} />)
    const button = screen.getByRole("button", { name: "折叠结果泳道；按住可拖动" })
    expect(button.getAttribute("draggable")).toBe("true")
    expect(button.querySelector("[data-swimlane-collapse-icon]")).toBeTruthy()
    expect(button.querySelector("[data-swimlane-drag-icon]")).toBeTruthy()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
