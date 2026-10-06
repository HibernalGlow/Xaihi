// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ContextMenuProvider, useContextMenuBuilder } from "@/components/context-menu"
import { SwimlaneBarMenuItem, SwimlaneNavigatorBar } from "./SwimlaneNavigatorBar"

function WorkspaceMenu() {
  useContextMenuBuilder("workspace-canvas", () => [{ label: "viewMode", onSelect: vi.fn() }])
  return null
}

afterEach(cleanup)

describe("SwimlaneNavigatorBar", () => {
  it("stops the workspace menu and opens only its native handle menu", () => {
    render(
      <ContextMenuProvider>
        <WorkspaceMenu />
        <div data-context-menu="workspace-canvas">
          <SwimlaneNavigatorBar items={[{ id: "lane", label: "泳道" }]} activeId="lane" onSelect={vi.fn()} menu={<SwimlaneBarMenuItem onSelect={vi.fn()}>泳道设置</SwimlaneBarMenuItem>} />
        </div>
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByRole("button", { name: "拖动或设置泳道切换栏" }))
    expect(screen.getByRole("menuitem", { name: "泳道设置" })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: "viewMode" })).toBeNull()
  })

  it("drags directly out of a pinned edge and shows all four dock previews", async () => {
    const workspace = document.createElement("div")
    const host = document.createElement("section")
    const secondHost = document.createElement("section")
    host.dataset.laneId = "lane"
    secondHost.dataset.laneId = "second"
    workspace.append(host, secondHost)
    document.body.append(workspace)
    workspace.getBoundingClientRect = () => rect(0, 0, 800, 300)
    host.getBoundingClientRect = () => rect(0, 0, 400, 300)
    secondHost.getBoundingClientRect = () => rect(400, 0, 400, 300)
    const onDockChange = vi.fn()
    render(<SwimlaneNavigatorBar items={[{ id: "lane", label: "泳道" }, { id: "second", label: "第二泳道" }]} activeId="lane" compactItems dock="left" dockTargetId="lane" dockTargets={[{ id: "lane", host }, { id: "second", host: secondHost }]} boundsHost={workspace} onSelect={vi.fn()} onDockChange={onDockChange} />)
    const navigator = screen.getByRole("navigation", { name: "泳道快速切换" })
    navigator.getBoundingClientRect = () => rect(4, 120, 72, 48)
    const handle = screen.getByRole("button", { name: "拖动或设置泳道切换栏" })

    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientX: 10, clientY: 140 })
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 200, clientY: 150 })
    await waitFor(() => expect(document.querySelectorAll("[data-swimlane-navigator-dropzone]")).toHaveLength(8))
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 200, clientY: 150 })
    expect(onDockChange).toHaveBeenLastCalledWith("floating")

    const currentNavigator = screen.getByRole("navigation", { name: "泳道快速切换" })
    currentNavigator.getBoundingClientRect = () => rect(4, 120, 72, 48)
    const currentHandle = screen.getByRole("button", { name: "拖动或设置泳道切换栏" })
    fireEvent.pointerDown(currentHandle, { pointerId: 8, button: 0, clientX: 10, clientY: 140 })
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 790, clientY: 150 })
    await waitFor(() => expect(secondHost.querySelector('[data-swimlane-navigator-dropzone="right"]')?.getAttribute("data-active")).toBe("true"))
    fireEvent.pointerUp(window, { pointerId: 8, clientX: 790, clientY: 150 })
    expect(onDockChange).toHaveBeenLastCalledWith("right", "second")
    workspace.remove()
  })
})

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }
}
