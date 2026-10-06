// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { WorkspaceWindowRestorer } from "./WorkspaceWindowRestorer"

const openComponent = vi.hoisted(() => vi.fn())

vi.mock("@/hooks/useWindowControls", () => ({
  useWindowControls: () => ({
    capabilities: {
      supported: true,
      nativeWindowControls: true,
      frameless: true,
      captionOwner: "renderer",
      componentWindows: "native",
    },
    capabilitiesPending: false,
    openComponent,
  }),
}))

beforeEach(() => {
  openComponent.mockResolvedValue({ success: true, supported: true, message: "Opened" })
  useWorkspaceStore.setState({ backendReady: true, components: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useWorkspaceStore.setState({ backendReady: false, components: [] })
})

describe("WorkspaceWindowRestorer", () => {
  test("restores only components owned by independent windows", async () => {
    useWorkspaceStore.setState({
      components: [
        component("workspace-component", "workspace"),
        component("window-component", "window"),
      ],
    })

    render(<WorkspaceWindowRestorer />)

    await waitFor(() => expect(openComponent).toHaveBeenCalledTimes(1))
    expect(openComponent).toHaveBeenCalledWith({
      componentId: "window-component",
      moduleId: "scratch",
      title: "SCRATCH",
    })
  })

  test("does not reopen a restored window when component data changes", async () => {
    useWorkspaceStore.setState({ components: [component("window-component", "window")] })
    render(<WorkspaceWindowRestorer />)
    await waitFor(() => expect(openComponent).toHaveBeenCalledTimes(1))

    useWorkspaceStore.getState().patchComponentData("window-component", { value: "updated" })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(openComponent).toHaveBeenCalledTimes(1)
  })
})

function component(id: string, placement: "workspace" | "window") {
  return {
    id,
    moduleId: "scratch",
    workspaceId: "ws-default",
    placement,
    state: placement === "window" ? "floating" as const : "docked" as const,
    position: { x: 20, y: 20 },
    size: { w: 340, h: 280 },
    z: 1,
    collapsed: false,
    createdAt: 1,
    updatedAt: 1,
  }
}
