// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SwimlaneBarContent } from "./SwimlaneBarContent"

afterEach(cleanup)

describe("SwimlaneBarContent", () => {
  it("combines handle style and position while keeping actions scrollable", () => {
    const onContextMenu = vi.fn()
    render(<div style={{ width: 80 }}><SwimlaneBarContent horizontal handlePosition="right" handleStyle="groove" label="拖动操作栏" onHandleContextMenu={onContextMenu}><button>一</button><button>二</button></SwimlaneBarContent></div>)

    const handle = screen.getByRole("button", { name: "拖动操作栏" })
    expect(handle.dataset.swimlaneBarHandleStyle).toBe("groove")
    expect(handle.dataset.swimlaneBarHandlePosition).toBe("right")
    expect(handle.dataset.contextMenuStop).toBe("")
    expect(handle.parentElement?.lastElementChild).toBe(handle)
    const scrollArea = document.querySelector<HTMLElement>('[data-swimlane-bar-scroll="true"]')
    expect(scrollArea).toBeTruthy()
    expect(scrollArea?.dataset.scrollbar).toBe("hidden")
    fireEvent.contextMenu(handle)
    expect(onContextMenu).toHaveBeenCalledOnce()
  })
})
