// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { ComponentInstance } from "@/types/workspace"
import { FlowCanvasView } from "./FlowCanvasView"

type ModuleShapeStub = { type: string; props: { compId?: string } }
type DeleteShapeHandler = (shape: ModuleShapeStub, source: string) => void

const setComponentVisibilityMock = vi.hoisted(() => vi.fn())
const setWorkspaceFlowCanvasMock = vi.hoisted(() => vi.fn())
const setWorkspaceFlowCameraMock = vi.hoisted(() => vi.fn())
const visibleComponentsMock = vi.hoisted(() => vi.fn<() => ComponentInstance[]>(() => []))
const tldrawPropsMock = vi.hoisted(() => vi.fn())
const createTLStoreMock = vi.hoisted(() => vi.fn((options: Record<string, unknown>) => ({
  options,
  id: `mock-store-${createTLStoreMock.mock.calls.length}`,
})))
const loadSnapshotMock = vi.hoisted(() => vi.fn())
const documentStoreListenerRef = vi.hoisted(() => ({
  current: undefined as ((entry: unknown) => void) | undefined,
}))
const sessionStoreListenerRef = vi.hoisted(() => ({
  current: undefined as ((entry: unknown) => void) | undefined,
}))
const workspaceStateMock = vi.hoisted(() => vi.fn(() => ({
  activeWorkspaceId: "ws-test",
  workspaces: [{ id: "ws-test", label: "Test" }],
  selectedComponentIds: [],
})))
const editorMock = vi.hoisted(() => ({
  getCurrentPageShapes: vi.fn<() => ModuleShapeStub[]>(() => []),
  getSelectedShapeIds: vi.fn<() => string[]>(() => []),
  getSelectedShapes: vi.fn<() => ModuleShapeStub[]>(() => []),
  getCamera: vi.fn<() => { x: number; y: number; z: number }>(() => ({ x: 0, y: 0, z: 1 })),
  setCamera: vi.fn<(camera: { x: number; y: number; z: number }, options?: unknown) => void>(),
  setSelectedShapes: vi.fn<(shapeIds: string[]) => void>(),
  deleteShapes: vi.fn<(shapeIds: unknown[]) => void>(),
  createShapes: vi.fn<(shapes: unknown[]) => void>(),
  updateShapes: vi.fn<(shapes: unknown[]) => void>(),
  store: {
    getStoreSnapshot: vi.fn<() => Record<string, unknown>>(() => ({ store: {}, schema: {} })),
    listen: vi.fn((listener: (entry: unknown) => void, filters?: { scope?: string }) => {
      if (filters?.scope === "session") sessionStoreListenerRef.current = listener
      else documentStoreListenerRef.current = listener
      return vi.fn()
    }),
  },
  sideEffects: {
    registerAfterCreateHandler: vi.fn<(typeName: string, handler: unknown) => () => void>(() => vi.fn()),
    registerAfterChangeHandler: vi.fn<(typeName: string, handler: unknown) => () => void>(() => vi.fn()),
    registerAfterDeleteHandler: vi.fn<(typeName: string, handler: DeleteShapeHandler) => () => void>(() => vi.fn()),
  },
}))

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceActions: () => ({
    setComponentFlowPos: vi.fn(),
    setComponentFlowSize: vi.fn(),
    setComponentVisibility: setComponentVisibilityMock,
    setWorkspaceFlowCanvas: setWorkspaceFlowCanvasMock,
    setWorkspaceFlowCamera: setWorkspaceFlowCameraMock,
    setSelection: vi.fn(),
  }),
  useWorkspaceShallowSelector: (selector: (state: ReturnType<typeof workspaceStateMock>) => unknown) => selector(workspaceStateMock()),
  useWorkspaceVisibleComponents: visibleComponentsMock,
}))

vi.mock("@/components/use-theme", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("tldraw", () => ({
  HTMLContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Rectangle2d: class Rectangle2d {},
  ShapeUtil: class ShapeUtil {},
  Tldraw: (props: { children: ReactNode; snapshot?: unknown }) => {
    tldrawPropsMock(props)
    return <div data-testid="mock-tldraw">{props.children}</div>
  },
  createShapeId: (id: string) => `shape:${id}`,
  createTLStore: createTLStoreMock,
  defaultShapeUtils: [],
  loadSnapshot: loadSnapshotMock,
  useEditor: () => editorMock,
}))

vi.mock("tldraw/tldraw.css", () => ({}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  documentStoreListenerRef.current = undefined
  sessionStoreListenerRef.current = undefined
  workspaceStateMock.mockReturnValue({
    activeWorkspaceId: "ws-test",
    workspaces: [{ id: "ws-test", label: "Test" }],
    selectedComponentIds: [],
  })
  visibleComponentsMock.mockReturnValue([])
  editorMock.getCurrentPageShapes.mockReturnValue([])
  editorMock.getSelectedShapeIds.mockReturnValue([])
  editorMock.getSelectedShapes.mockReturnValue([])
  editorMock.getCamera.mockReturnValue({ x: 0, y: 0, z: 1 })
  editorMock.store.getStoreSnapshot.mockReturnValue({ store: {}, schema: {} })
})

describe("FlowCanvasView", () => {
  test("hides a component from flow when its tldraw module shape is deleted", () => {
    render(<FlowCanvasView />)

    const deleteHandler = editorMock.sideEffects.registerAfterDeleteHandler.mock.calls.find(
      ([typeName]) => typeName === "shape",
    )?.[1]

    expect(deleteHandler).toBeTypeOf("function")

    act(() => {
      deleteHandler?.(
        {
          type: "module",
          props: { compId: "comp-flow-ghost" },
        },
        "user",
      )
    })

    expect(setComponentVisibilityMock).toHaveBeenCalledWith("comp-flow-ghost", "flow", false)
  })

  test("recreates visible module shapes that are missing after a canvas snapshot reload", () => {
    const oldComponent = createFlowComponent("comp-old", "bandia")
    const newComponent = createFlowComponent("comp-new", "cleanf")

    visibleComponentsMock.mockReturnValue([oldComponent])
    const { rerender } = render(<FlowCanvasView />)

    expect(editorMock.createShapes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "shape:comp-old",
        props: expect.objectContaining({ compId: "comp-old" }),
      }),
    ])

    editorMock.createShapes.mockClear()
    setComponentVisibilityMock.mockClear()
    visibleComponentsMock.mockReturnValue([oldComponent, newComponent])

    rerender(<FlowCanvasView />)

    expect(editorMock.createShapes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "shape:comp-old",
        props: expect.objectContaining({ compId: "comp-old" }),
      }),
      expect.objectContaining({
        id: "shape:comp-new",
        props: expect.objectContaining({ compId: "comp-new" }),
      }),
    ])
    expect(setComponentVisibilityMock).not.toHaveBeenCalled()
  })

  test("does not delete ordinary tldraw shapes while syncing module shapes", () => {
    editorMock.getCurrentPageShapes.mockReturnValue([
      { id: "shape:stale-module", type: "module", props: { compId: "comp-stale" } },
      { id: "shape:free-note", type: "note", props: {} },
    ] as unknown as ModuleShapeStub[])

    render(<FlowCanvasView />)

    expect(editorMock.deleteShapes).toHaveBeenCalledWith(["shape:stale-module"])
  })

  test("creates a stable tldraw store from the active workspace canvas snapshot", () => {
    const flowCanvas = { store: { "shape:box": { typeName: "shape", type: "geo" } }, schema: { schemaVersion: 2 } }
    workspaceStateMock.mockReturnValue({
      activeWorkspaceId: "ws-test",
      workspaces: [{ id: "ws-test", label: "Test", flowCanvas }],
      selectedComponentIds: [],
    })

    render(<FlowCanvasView />)

    expect(createTLStoreMock).toHaveBeenCalledWith(expect.objectContaining({ snapshot: flowCanvas }))
    expect(tldrawPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      store: expect.objectContaining({ options: expect.objectContaining({ snapshot: flowCanvas }) }),
    }))
  })

  test("persists ordinary tldraw document changes to the active workspace", () => {
    vi.useFakeTimers()
    const flowCanvas = { store: { "shape:box": { typeName: "shape", type: "geo" } }, schema: { schemaVersion: 2 } }
    editorMock.store.getStoreSnapshot
      .mockReturnValueOnce({ store: {}, schema: {} })
      .mockReturnValue(flowCanvas)

    render(<FlowCanvasView />)

    act(() => {
      documentStoreListenerRef.current?.({
        changes: {
          added: { "shape:box": { typeName: "shape", type: "geo" } },
          updated: {},
          removed: {},
        },
      })
      vi.advanceTimersByTime(900)
    })

    expect(setWorkspaceFlowCanvasMock).toHaveBeenCalledWith("ws-test", flowCanvas)
  })

  test("ignores module-only tldraw document changes because component layout owns them", () => {
    vi.useFakeTimers()
    editorMock.store.getStoreSnapshot
      .mockReturnValueOnce({ store: {}, schema: {} })
      .mockReturnValue({
        store: { "shape:comp-alpha": { typeName: "shape", type: "module" } },
        schema: {},
      })

    render(<FlowCanvasView />)

    act(() => {
      documentStoreListenerRef.current?.({
        changes: {
          added: { "shape:comp-alpha": { typeName: "shape", type: "module" } },
          updated: {},
          removed: {},
        },
      })
      vi.advanceTimersByTime(900)
    })

    expect(setWorkspaceFlowCanvasMock).not.toHaveBeenCalled()
  })

  test("restores the active workspace camera when the flow canvas mounts", () => {
    const flowCamera = { x: -120.5, y: 48, z: 0.82 }
    workspaceStateMock.mockReturnValue({
      activeWorkspaceId: "ws-test",
      workspaces: [{ id: "ws-test", label: "Test", flowCamera }],
      selectedComponentIds: [],
    })

    render(<FlowCanvasView />)

    expect(editorMock.setCamera).toHaveBeenCalledWith(flowCamera, { immediate: true, force: true })
  })

  test("persists camera changes to the active workspace", () => {
    vi.useFakeTimers()
    editorMock.getCamera.mockReturnValue({ x: -88.1234, y: 42.5678, z: 0.81234 })

    render(<FlowCanvasView />)

    act(() => {
      sessionStoreListenerRef.current?.({
        changes: {
          added: {},
          updated: {
            "camera:page": [
              { typeName: "camera", x: 0, y: 0, z: 1 },
              { typeName: "camera", x: -88.1234, y: 42.5678, z: 0.81234 },
            ],
          },
          removed: {},
        },
      })
      vi.advanceTimersByTime(300)
    })

    expect(setWorkspaceFlowCameraMock).toHaveBeenCalledWith("ws-test", { x: -88.123, y: 42.568, z: 0.8123 })
  })
})

function createFlowComponent(id: string, moduleId: string): ComponentInstance {
  return {
    id,
    moduleId,
    workspaceId: "ws-test",
    data: {},
    state: "docked",
    hiddenIn: { flow: false },
    createdAt: 1,
    updatedAt: 1,
  }
}
