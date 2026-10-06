// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { FlowView } from "./FlowView"
import { XIRANITE_MODULE_MIME } from "@/lib/moduleDragDrop"

const setOverlayMock = vi.hoisted(() => vi.fn())
const deployComponentMock = vi.hoisted(() => vi.fn())

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceActions: () => ({ setOverlay: setOverlayMock, deployComponent: deployComponentMock }),
}))

vi.mock("./FlowCanvasView", () => ({
  FlowCanvasView: () => <div data-testid="mock-flow-canvas">Mock flow canvas</div>,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "view:flow.empty") return "// flow canvas is empty"
      if (key === "view:flow.openRegistry") return "OPEN MODULE REGISTRY"
      if (key === "view:flow.loadCanvas") return "Open flow canvas"
      if (key === "view:flow.loadingCanvas") return "Loading flow canvas"
      if (key === "registry:dropHint") return "Drop to deploy here"
      return key
    },
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("FlowView", () => {
  test("loads the tldraw canvas even when there are no flow components", async () => {
    render(<FlowView />)

    expect(await screen.findByTestId("mock-flow-canvas")).toBeTruthy()
    expect(screen.queryByText("// flow canvas is empty")).toBeNull()
    expect(screen.queryByRole("button", { name: "OPEN MODULE REGISTRY" })).toBeNull()
  })

  test("does not require the click-to-load shell before rendering the canvas", async () => {
    render(<FlowView />)

    expect(await screen.findByTestId("mock-flow-canvas")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Open flow canvas" })).toBeNull()
  })

  test("deploys a dropped module into the flow view near the pointer", () => {
    render(<FlowView />)

    const target = screen.getByTestId("flow-drop-target")
    target.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 810,
      bottom: 620,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect))

    const dataTransfer = createDataTransfer("scratch")

    fireEvent.dragEnter(target, { dataTransfer })
    expect(screen.getByText("Drop to deploy here")).toBeTruthy()
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer })
    Object.defineProperty(dropEvent, "clientX", { value: 402 })
    Object.defineProperty(dropEvent, "clientY", { value: 260 })
    fireEvent(target, dropEvent)

    expect(deployComponentMock).toHaveBeenCalledWith("scratch", {
      viewMode: "flow",
      flowPosition: { x: 200, y: 80 },
    })
  })

  test("deploys through the temporary drop shield over the canvas", () => {
    render(<FlowView />)

    const target = screen.getByTestId("flow-drop-target")
    const rect = {
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 810,
      bottom: 620,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect
    target.getBoundingClientRect = vi.fn(() => rect)

    const dataTransfer = createDataTransfer("enginev")
    fireEvent.dragEnter(target, { dataTransfer })

    const shield = screen.getByTestId("flow-drop-shield")
    shield.getBoundingClientRect = vi.fn(() => rect)

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer })
    Object.defineProperty(dropEvent, "clientX", { value: 600 })
    Object.defineProperty(dropEvent, "clientY", { value: 420 })
    fireEvent(shield, dropEvent)

    expect(deployComponentMock).toHaveBeenCalledTimes(1)
    expect(deployComponentMock).toHaveBeenCalledWith("enginev", {
      viewMode: "flow",
      flowPosition: { x: 398, y: 240 },
    })
  })
})

function createDataTransfer(moduleId: string) {
  return {
    types: [XIRANITE_MODULE_MIME],
    dropEffect: "copy",
    effectAllowed: "copy",
    getData: vi.fn((type: string) => {
      if (type === XIRANITE_MODULE_MIME) return JSON.stringify({ moduleId })
      if (type === "text/plain") return moduleId
      return ""
    }),
    setData: vi.fn(),
  }
}
