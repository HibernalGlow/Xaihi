// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { shouldDiscardStaleWindowAddress, shouldRenderFloatingWindow } from "@/App"
import { WorkspaceWindowRestorer } from "./WorkspaceWindowRestorer"

const openComponent = vi.hoisted(() => vi.fn())
const mockCapabilities = vi.hoisted(() => ({
  supported: true,
  nativeWindowControls: true,
  frameless: true,
  captionOwner: "renderer" as const,
  componentWindows: "native" as "native" | "browser-popup",
}))

vi.mock("@/hooks/useWindowControls", () => ({
  useWindowControls: () => ({
    capabilities: mockCapabilities,
    capabilitiesPending: false,
    openComponent,
  }),
}))

beforeEach(() => {
  openComponent.mockResolvedValue({ success: true, supported: true, message: "Opened" })
  mockCapabilities.componentWindows = "native"
  useWorkspaceStore.setState({ appConfigReady: true, backendReady: true, restoreWorkspaceComponents: false, components: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useWorkspaceStore.setState({ appConfigReady: false, backendReady: false, restoreWorkspaceComponents: false, components: [] })
})

describe("WorkspaceWindowRestorer", () => {
  test("does not treat a stale browser node URL as a floating window", () => {
    expect(shouldRenderFloatingWindow({ targetModuleId: "shellect" }, false)).toBe(false)
  })

  test("keeps native node windows and explicit browser popups supported", () => {
    expect(shouldRenderFloatingWindow({ targetModuleId: "shellect" }, true)).toBe(true)
    expect(shouldRenderFloatingWindow({ floatingComponent: "component-1" }, false, true)).toBe(true)
  })

  test("does not revive an orphaned browser popup URL", () => {
    expect(shouldRenderFloatingWindow({ floatingComponent: "component-1" }, false, false)).toBe(false)
  })

  test("discards stale browser node addresses", () => {
    expect(shouldDiscardStaleWindowAddress({ node: "shellect" }, false)).toBe(true)
    expect(shouldDiscardStaleWindowAddress({ moduleId: "shellect" }, false)).toBe(true)
    expect(shouldDiscardStaleWindowAddress({ node: "shellect" }, true)).toBe(false)
    expect(shouldDiscardStaleWindowAddress({}, false)).toBe(false)
  })

  test("restores only components owned by independent windows", async () => {
    useWorkspaceStore.setState({
      restoreWorkspaceComponents: true,
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
    useWorkspaceStore.setState({ restoreWorkspaceComponents: true, components: [component("window-component", "window")] })
    render(<WorkspaceWindowRestorer />)
    await waitFor(() => expect(openComponent).toHaveBeenCalledTimes(1))

    useWorkspaceStore.getState().patchComponentData("window-component", { value: "updated" })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(openComponent).toHaveBeenCalledTimes(1)
  })

  test("waits for app.ui before restoring a window", async () => {
    useWorkspaceStore.setState({ appConfigReady: false, restoreWorkspaceComponents: true, components: [component("window-component", "window")] })
    render(<WorkspaceWindowRestorer />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(openComponent).not.toHaveBeenCalled()

    useWorkspaceStore.getState().setAppConfigReady(true)
    await waitFor(() => expect(openComponent).toHaveBeenCalledTimes(1))
  })

  test("does not open an old floating window when startup restore is disabled", async () => {
    useWorkspaceStore.setState({ appConfigReady: true, components: [component("window-component", "window")] })

    render(<WorkspaceWindowRestorer />)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(openComponent).not.toHaveBeenCalled()
  })

  test("does not create browser popups during startup restore", async () => {
    useWorkspaceStore.setState({ appConfigReady: true, restoreWorkspaceComponents: true, components: [component("window-component", "window")] })
    mockCapabilities.componentWindows = "browser-popup"

    render(<WorkspaceWindowRestorer />)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(openComponent).not.toHaveBeenCalled()
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
