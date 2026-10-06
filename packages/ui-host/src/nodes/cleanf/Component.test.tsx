// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { CleanfData, CleanfInput } from "@xiranite/node-cleanf/core"
import { Component } from "./Component"
import type { CleanfCardState } from "./types"

const surfaceState = vi.hoisted(() => ({
  height: 420,
  width: 720,
}))

vi.mock("@/nodes/shared/useNodeSurface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nodes/shared/useNodeSurface")>()
  return {
    ...actual,
    useNodeSurface: () => {
      const mode = actual.resolveNodeSurfaceMode(surfaceState)
      return {
        ref: { current: null },
        width: surfaceState.width,
        height: surfaceState.height,
        mode,
        density: actual.resolveNodeSurfaceDensity(mode),
      }
    },
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useWorkspaceStore.setState({ hazardMode: false })
  setSurface("regular")
})

describe("app-owned cleanf Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Cleanf-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-cleanf" host={createHost({ pathText: "D:/workspace" })} />)

      expect(screen.getByText("Cleanf")).toBeTruthy()
      expect(screen.getByTestId("cleanf-surface").className).not.toContain("bg-card")
      if (mode === "collapsed") {
        expect(screen.getByTestId("cleanf-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/1 条路径/)).toBeTruthy()
        expect(screen.queryByLabelText("cleanf scan paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("cleanf scan paths")).toBeTruthy()

      if (mode === "compact") {
        expect(screen.getByTestId("cleanf-compact-view")).toBeTruthy()
        expect(screen.getByRole("button", { name: "cleanf advanced options" })).toBeTruthy()
        expect(screen.getByText("结果摘要")).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByRole("tab", { name: /结果/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /日志/ })).toBeTruthy()
        expect(screen.getByTestId("cleanf-portrait-view")).toBeTruthy()
        expect(screen.getByTestId("cleanf-primary-switches")).toBeTruthy()
      } else {
        expect(screen.getByRole("tab", { name: /结果/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /日志/ })).toBeTruthy()
        expect(screen.getByTestId("cleanf-full-view")).toBeTruthy()
        expect(screen.getByText("清理预设")).toBeTruthy()
        expect(screen.getByText("执行闸门")).toBeTruthy()
        expect(screen.getByTestId("cleanf-execution-gate")).toBeTruthy()
        expect(screen.getByRole("switch", { name: "预演模式" })).toBeTruthy()
        expect(screen.getByTestId("cleanf-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-cleanf" host={createHost({ pathText: "D:/workspace" })} />)

    expect(screen.getByTestId("cleanf-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("cleanf scan paths")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-cleanf" host={createHost({ pathText: "D:/workspace" })} />)

    expect(screen.getByTestId("cleanf-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("cleanf-compact-view")).toBeNull()
  })

  test("pastes scan paths from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-cleanf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴路径" }))

    expect(host.state.pathText).toBe("D:/workspace")
  })

  test("runs preview through host.actions.run and stores results", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/workspace", previewMode: true, logs: [] })
    render(<Component compId="comp-cleanf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演清理" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "cleanf",
      input: {
        paths: ["D:/workspace"],
        presets: ["empty_folders", "backup_files"],
        exclude: undefined,
        preview: true,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.totalRemoved).toBe(2)
    expect(host.state.logs).toEqual([
      "[100%] Preview found 2 item(s).",
      "Preview completed, found 2 item(s).",
    ])
    expect(screen.getAllByText(/old\.bak/).length).toBeGreaterThanOrEqual(1)
  })

  test("arms a fuse instead of executing the real cleanup on the first click", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/workspace", previewMode: false })
    render(<Component compId="comp-cleanf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实清理" }))

    expect(host.runCalls).toHaveLength(0)
  })

  // Hazard 上膛 = 真执行 + 不追问：真实清理一次点击直接发起。
  test("executes the real cleanup on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ pathText: "D:/workspace", previewMode: false })
    render(<Component compId="comp-cleanf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实清理" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.preview).toBe(false)
  })

  test("runs undo without requiring a scan path", async () => {
    setSurface("regular")
    const host = createHost({})
    render(<Component compId="comp-cleanf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "撤销上次清理" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({ nodeId: "cleanf", input: { action: "undo" } })
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: CleanfInput }>
  state: CleanfCardState
}

function createHost(initial: CleanfCardState): TestHost {
  const host: TestHost = {
    state: { ...initial },
    runCalls: [],
    copiedText: "",
    getData: <T,>() => host.state as T,
    patchData: (_compId, patch) => {
      host.state = { ...host.state, ...patch }
    },
    listComponents: () => [],
    updateComponent: () => undefined,
    actions: {
      run: async <TInput, TData>(
        nodeId: string,
        input: TInput,
        onEvent?: (event: NodeRunEvent) => void,
      ): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as CleanfInput })
        onEvent?.({ type: "progress", progress: 100, message: "Preview found 2 item(s)." })
        return {
          success: true,
          message: "Preview completed, found 2 item(s).",
          data: cleanfData,
        } as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/workspace",
      writeText: async (text) => {
        host.copiedText = text
      },
    },
    env: {
      theme: "light",
      platform: "web",
    },
    getNodeConfig: async <T,>() => ({ config: undefined as T | undefined, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async () => undefined,
  }
  return host
}

function setSurface(mode: NodeSurfaceMode) {
  setSurfaceSize(NODE_SURFACE_TEST_SPECS[mode])
}

function setSurfaceSize(size: { height: number; width: number }) {
  surfaceState.width = size.width
  surfaceState.height = size.height
}

const cleanfData: CleanfData = {
  totalRemoved: 2,
  removedDetails: { backup_files: 1, temp_folders: 1 },
  previewFiles: ["D:/workspace/old.bak", "D:/workspace/temp_cache"],
  skipped: 0,
}
