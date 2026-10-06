// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { OverlayHost } from "./OverlayHost"

const setOverlayMock = vi.hoisted(() => vi.fn())
const setOverlayModeMock = vi.hoisted(() => vi.fn())
const setOverlayWidthMock = vi.hoisted(() => vi.fn())
const setOverlayFloatingMetricsMock = vi.hoisted(() => vi.fn())
const overlayState = vi.hoisted(() => ({
  value: null as null | "registry" | "settings" | "operations" | "history" | "deletions",
  mode: "docked" as "docked" | "floating",
  width: 440,
  floatingMetrics: {
    widthRatio: 0.5,
    heightRatio: 0.5,
    xRatio: 0.25,
    yRatio: 0.25,
  },
}))
const moduleLoadCounts = vi.hoisted(() => ({
  registry: vi.fn(),
  settings: vi.fn(),
  operations: vi.fn(),
  history: vi.fn(),
  deletions: vi.fn(),
}))

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceActions: () => ({
    setOverlay: setOverlayMock,
    setOverlayMode: setOverlayModeMock,
    setOverlayWidth: setOverlayWidthMock,
    setOverlayFloatingMetrics: setOverlayFloatingMetricsMock,
  }),
  useWorkspaceSelector: (selector: (state: {
    overlay: typeof overlayState.value
    overlayMode: typeof overlayState.mode
    overlayWidth: typeof overlayState.width
    overlayFloatingMetrics: typeof overlayState.floatingMetrics
  }) => unknown) =>
    selector({
      overlay: overlayState.value,
      overlayMode: overlayState.mode,
      overlayWidth: overlayState.width,
      overlayFloatingMetrics: overlayState.floatingMetrics,
    }),
}))

vi.mock("@/components/views/ModuleRegistry", () => {
  moduleLoadCounts.registry()
  return { ModuleRegistry: () => <div data-testid="registry-view">Registry view</div> }
})

vi.mock("@/components/views/ThemeSettings", () => {
  moduleLoadCounts.settings()
  return { ThemeSettings: () => <div data-testid="settings-view">Settings view</div> }
})

vi.mock("@/components/views/NodeOperationMonitor", () => {
  moduleLoadCounts.operations()
  return { NodeOperationMonitor: () => <div data-testid="operations-view">Operations view</div> }
})

vi.mock("@/components/views/NodeRunHistoryView", () => {
  moduleLoadCounts.history()
  return { NodeRunHistoryView: () => <div data-testid="history-view">History view</div> }
})

vi.mock("@/components/views/FileDeletionHistoryView", () => {
  moduleLoadCounts.deletions()
  return { FileDeletionHistoryView: () => <div data-testid="deletions-view">Deletions view</div> }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  overlayState.value = null
  overlayState.mode = "docked"
  overlayState.width = 440
  overlayState.floatingMetrics = {
    widthRatio: 0.5,
    heightRatio: 0.5,
    xRatio: 0.25,
    yRatio: 0.25,
  }
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("OverlayHost", () => {
  test("keeps overlay views unloaded while the overlay is closed", () => {
    render(<OverlayHost />)

    expect(screen.queryByTestId("workspace-push-panel")).toBeNull()
    expect(screen.queryByTestId("registry-view")).toBeNull()
    expect(moduleLoadCounts.registry).not.toHaveBeenCalled()
    expect(moduleLoadCounts.settings).not.toHaveBeenCalled()
    expect(moduleLoadCounts.operations).not.toHaveBeenCalled()
    expect(moduleLoadCounts.history).not.toHaveBeenCalled()
    expect(moduleLoadCounts.deletions).not.toHaveBeenCalled()
  })

  test("loads only the active overlay view", async () => {
    overlayState.value = "registry"

    render(<OverlayHost />)

    expect(await screen.findByTestId("registry-view")).toBeTruthy()
    expect(screen.getByTestId("workspace-push-panel")).toBeTruthy()
    expect(screen.getByTestId("workspace-push-panel").getAttribute("data-overlay-mode")).toBe("docked")
    expect(moduleLoadCounts.registry).toHaveBeenCalledTimes(1)
    expect(moduleLoadCounts.settings).not.toHaveBeenCalled()
    expect(moduleLoadCounts.operations).not.toHaveBeenCalled()
    expect(moduleLoadCounts.history).not.toHaveBeenCalled()
    expect(moduleLoadCounts.deletions).not.toHaveBeenCalled()
  })

  test("loads the global deletion history overlay", async () => {
    overlayState.value = "deletions"

    render(<OverlayHost />)

    expect(await screen.findByTestId("deletions-view")).toBeTruthy()
    expect(moduleLoadCounts.deletions).toHaveBeenCalledTimes(1)
    expect(moduleLoadCounts.registry).not.toHaveBeenCalled()
  })

  test("renders floating mode and custom size from the store", async () => {
    overlayState.value = "registry"
    overlayState.mode = "floating"
    overlayState.floatingMetrics = {
      widthRatio: 0.5,
      heightRatio: 0.5,
      xRatio: 0.25,
      yRatio: 0.25,
    }

    render(<OverlayHost />)

    const panel = await screen.findByTestId("workspace-push-panel")
    expect(panel.getAttribute("data-overlay-mode")).toBe("floating")
    expect(panel.style.width).toBe("584px")
    expect(panel.style.height).toBe("384px")
    expect(panel.style.transform).toContain("translate(")
    expect(screen.getByTestId("workspace-overlay-backdrop")).toBeTruthy()
  })

  test("uses one mode toggle button for docked and floating overlay modes", async () => {
    const user = userEvent.setup()
    overlayState.value = "registry"

    const { unmount } = render(<OverlayHost />)

    const dockedToggle = await screen.findByTestId("workspace-overlay-mode-toggle")
    expect(dockedToggle.getAttribute("aria-label")).toBe("overlay:floatingMode")
    await user.click(dockedToggle)
    expect(setOverlayModeMock).toHaveBeenLastCalledWith("floating")

    unmount()
    setOverlayModeMock.mockClear()
    overlayState.mode = "floating"

    render(<OverlayHost />)

    const floatingToggle = await screen.findByTestId("workspace-overlay-mode-toggle")
    expect(floatingToggle.getAttribute("aria-label")).toBe("overlay:dockMode")
    await user.click(floatingToggle)
    expect(setOverlayModeMock).toHaveBeenLastCalledWith("docked")
  })
})
