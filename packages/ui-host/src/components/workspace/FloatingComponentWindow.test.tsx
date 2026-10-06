import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { FloatingComponentWindow } from "./FloatingComponentWindow"

const mocks = vi.hoisted(() => ({
  floatingWindowCaptionAutoCollapse: true,
  floatingWindowCaptionPosition: "right" as "left" | "right" | "island",
  floatingWindowCaptionStyle: "windows" as "windows" | "capsule" | "traffic-light",
  nativeWindowControls: false,
  captionOwner: "renderer" as "system" | "renderer",
  component: {
    id: "component-1",
    moduleId: "scratch",
    state: "floating",
  },
  ensureComponent: vi.fn(),
  controlMain: vi.fn().mockResolvedValue({ success: true, supported: true }),
  controlComponent: vi.fn().mockResolvedValue({ success: true, supported: true }),
  closeComponent: vi.fn().mockResolvedValue({ success: true, supported: true }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/hooks/useWindowControls", () => ({
  useWindowControls: () => ({
    capabilities: {
      supported: true,
      nativeWindowControls: mocks.nativeWindowControls,
      frameless: mocks.nativeWindowControls,
      componentWindows: mocks.nativeWindowControls ? "native" : "browser-popup",
      captionOwner: mocks.captionOwner,
      captionInset: mocks.captionOwner === "system" ? { x: 16, y: 26 } : undefined,
    },
    controlMain: mocks.controlMain,
    controlMainPending: false,
    controlComponent: mocks.controlComponent,
    controlComponentPending: false,
    closeComponent: mocks.closeComponent,
  }),
}))

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceActions: () => ({ ensureComponent: mocks.ensureComponent }),
  useWorkspaceComponent: () => mocks.component,
  useWorkspaceShallowSelector: (selector: (state: Record<string, unknown>) => unknown) => selector({
    activeCustomThemeName: null,
    activeWorkspaceId: "workspace-1",
    floatingWindowCaptionAutoCollapse: mocks.floatingWindowCaptionAutoCollapse,
    floatingWindowCaptionPosition: mocks.floatingWindowCaptionPosition,
    floatingWindowCaptionStyle: mocks.floatingWindowCaptionStyle,
    theme: "wuling",
    zCounter: 1,
  }),
}))

vi.mock("@/components/modules/nodeWindowPreferences", () => ({
  loadNodeMaximizeAction: vi.fn().mockResolvedValue("maximize"),
}))

vi.mock("@/components/modules/ModuleRenderer", async () => {
  const { FloatingWindowNodeHeader } = await import("./FloatingWindowFrame")
  return {
    ModuleRenderer: () => (
      <div data-testid="module-renderer">
        <FloatingWindowNodeHeader>Module title</FloatingWindowNodeHeader>
      </div>
    ),
  }
})

afterEach(() => {
  cleanup()
  mocks.nativeWindowControls = false
  mocks.captionOwner = "renderer"
  mocks.component = {
    id: "component-1",
    moduleId: "scratch",
    state: "floating",
  }
  mocks.floatingWindowCaptionAutoCollapse = true
  mocks.floatingWindowCaptionPosition = "right"
  mocks.floatingWindowCaptionStyle = "windows"
  mocks.ensureComponent.mockClear()
})

describe("FloatingComponentWindow", () => {
  test("uses the URL workspace when hydrating a newly opened window", async () => {
    mocks.component = undefined as never

    render(<FloatingComponentWindow compId="component-1" moduleIdFallback="fixture-module" workspaceIdFallback="ws-default" />)

    await waitFor(() => expect(mocks.ensureComponent).toHaveBeenCalledWith(expect.objectContaining({
      id: "component-1",
      moduleId: "fixture-module",
      workspaceId: "ws-default",
    })))
  })

  test("uses browser chrome without rendering internal window controls on the web", () => {
    render(<FloatingComponentWindow compId="component-1" />)

    expect(screen.getByTestId("module-renderer")).toBeTruthy()
    expect(screen.queryByTestId("floating-window-integrated-controls")).toBeNull()
    expect(screen.queryByTestId("floating-window-fallback-controls")).toBeNull()
    expect(screen.queryByTestId("floating-window-fallback-drag-region")).toBeNull()
  })

  test("overlays right-aligned Windows controls without adding a titlebar row", async () => {
    mocks.nativeWindowControls = true

    render(<FloatingComponentWindow compId="component-1" />)

    const controls = await screen.findByTestId("floating-window-integrated-controls")
    expect(controls.dataset.windowCaptionPosition).toBe("right")
    expect(controls.dataset.windowCaptionStyle).toBe("windows")
    expect(controls.className).toContain("fixed")
    expect(controls.className).toContain("right-1.5")
    expect(controls.className).toContain("bg-transparent")
    expect(controls.className).not.toContain("border")
    expect(controls.className).not.toContain("shadow")
    expect(screen.queryByTestId("floating-window-fallback-drag-region")).toBeNull()
    const titlebar = document.querySelector('[data-floating-window-titlebar="true"]')
    expect(titlebar?.className).toContain("xiranite-app-region-drag")
    expect(screen.getByTestId("module-renderer").parentElement?.previousElementSibling).toBeNull()
    expect(controls.className).not.toContain("xiranite-node-chrome-pill")
    expect([...controls.querySelectorAll("button")].every((button) => button.className.includes("rounded-none"))).toBe(true)
    await waitFor(() => expect(screen.queryByTestId("floating-window-fallback-controls")).toBeNull())
  })

  test("uses the node toolbar surface for the capsule style", async () => {
    mocks.nativeWindowControls = true
    mocks.floatingWindowCaptionStyle = "capsule"

    render(<FloatingComponentWindow compId="component-1" />)

    const controls = await screen.findByTestId("floating-window-integrated-controls")
    expect(controls.dataset.windowCaptionStyle).toBe("capsule")
    expect(controls.dataset.windowCaptionVisibility).toBe("expand-on-hover")
    expect(controls.className).toContain("h-6")
    expect(controls.className).toContain("overflow-hidden")
    expect(controls.querySelector("[data-node-chrome-idle-indicator]")).toBeTruthy()
    const expandedSurface = controls.querySelector<HTMLElement>("[data-node-chrome-expanded-surface]")
    expect(expandedSurface?.className).toContain("xiranite-node-chrome-pill")
    expect(expandedSurface?.className).toContain("bg-background/45")
    expect(expandedSurface?.className).toContain("ring-1")
    expect(expandedSurface?.className).toContain("rounded-full")
    expect([...controls.querySelectorAll("button")].every((button) => button.dataset.slot === "button" && button.dataset.variant === "ghost" && button.dataset.size === "icon-xs")).toBe(true)
    expect([...controls.querySelectorAll("button")].every((button) => button.hasAttribute("data-node-chrome-action"))).toBe(true)
    expect([...controls.querySelectorAll("button")].every((button) => button.className.includes("size-5") && button.className.includes("rounded-full"))).toBe(true)
  })

  test("keeps the capsule expanded when auto-collapse is disabled", async () => {
    mocks.nativeWindowControls = true
    mocks.floatingWindowCaptionStyle = "capsule"
    mocks.floatingWindowCaptionAutoCollapse = false

    render(<FloatingComponentWindow compId="component-1" />)

    const controls = await screen.findByTestId("floating-window-integrated-controls")
    expect(controls.dataset.windowCaptionVisibility).toBe("always-expanded")
    expect(controls.querySelector("[data-node-chrome-idle-indicator]")).toBeNull()
    expect(controls.querySelectorAll("[data-node-chrome-action]")).toHaveLength(3)
  })

  test("centers traffic-light controls and uses close-minimize-maximize order", async () => {
    mocks.nativeWindowControls = true
    mocks.floatingWindowCaptionPosition = "island"
    mocks.floatingWindowCaptionStyle = "traffic-light"

    render(<FloatingComponentWindow compId="component-1" />)

    const controls = await screen.findByTestId("floating-window-integrated-controls")
    expect(controls.dataset.windowCaptionPosition).toBe("island")
    expect(controls.dataset.windowCaptionStyle).toBe("traffic-light")
    expect(controls.className).toContain("left-1/2")
    expect([...controls.querySelectorAll("button")].map((button) => button.dataset.windowControlAction)).toEqual([
      "close",
      "minimize",
      "maximize",
    ])
  })

  test("leaves the caption to the OS and draws no second set over the traffic lights", () => {
    mocks.nativeWindowControls = true
    mocks.captionOwner = "system"

    render(<FloatingComponentWindow compId="component-1" />)

    const windowRoot = document.querySelector<HTMLElement>(".xiranite-floating-window")
    expect(windowRoot?.dataset.floatingWindowCaption).toBe("system")
    // The host reported x=16; the band is that inset plus the measured 60pt group and clearance.
    const titlebar = document.querySelector<HTMLElement>('[data-floating-window-titlebar="true"]')
    expect(titlebar?.style.paddingLeft).toBe("84px")
    expect(screen.queryByTestId("floating-window-integrated-controls")).toBeNull()
    expect(screen.queryByTestId("floating-window-fallback-controls")).toBeNull()
    expect(document.querySelectorAll("[data-window-caption-button]")).toHaveLength(0)
  })
})
