// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { DissolvefData, DissolvefInput } from "@xiranite/node-dissolvef/core"
import { Component } from "./Component"
import type { DissolvefCardState } from "./types"

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

describe("app-owned dissolvef Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Dissolvef-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-dissolvef" host={createHost({ pathText: "D:/library/outer" })} />)

      expect(screen.getByText("DissolveF")).toBeTruthy()
      expect(screen.getByTestId("dissolvef-surface").className).not.toContain("bg-card")
      if (mode === "collapsed") {
        expect(screen.getByTestId("dissolvef-collapsed-view")).toBeTruthy()
        expect(screen.getByText("捆绑 / 预演")).toBeTruthy()
        expect(screen.queryByLabelText("dissolvef target folder")).toBeNull()
        return
      }

      expect(screen.getByLabelText("dissolvef target folder")).toBeTruthy()
      expect(screen.getByTestId("dissolvef-execution-gate")).toBeTruthy()
      expect(screen.getByLabelText("dissolvef 预演切换")).toBeTruthy()
      expect(screen.getByRole("tab", { name: /计划/ })).toBeTruthy()
      expect(screen.getByRole("tab", { name: /历史/ })).toBeTruthy()
      expect(screen.getByRole("tab", { name: /日志/ })).toBeTruthy()

      if (mode === "compact") {
        expect(screen.getByTestId("dissolvef-compact-view")).toBeTruthy()
        expect(screen.getByRole("button", { name: "dissolvef advanced options" })).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("dissolvef-portrait-view")).toBeTruthy()
        expect(screen.getByTestId("dissolvef-primary-switches")).toBeTruthy()
      } else {
        expect(screen.getByTestId("dissolvef-full-view")).toBeTruthy()
        expect(screen.getByText("执行闸门")).toBeTruthy()
        expect(screen.getByTestId("dissolvef-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-dissolvef" host={createHost({ pathText: "D:/library/outer" })} />)

    expect(screen.getByTestId("dissolvef-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("dissolvef target folder")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-dissolvef" host={createHost({ pathText: "D:/library/outer" })} />)

    expect(screen.getByTestId("dissolvef-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("dissolvef-compact-view")).toBeNull()
  })

  test("pastes folder path from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-dissolvef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴文件夹" }))

    expect(host.state.pathText).toBe("D:/library/outer")
  })

  test("runs dissolve through host.actions.run and stores plan", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/library/outer", logs: [] })
    render(<Component compId="comp-dissolvef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演溶解" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "dissolvef",
      input: {
        action: "dissolve",
        path: "D:/library/outer",
        historyPath: undefined,
        undoId: undefined,
        exclude: undefined,
        nested: true,
        media: true,
        archive: true,
        direct: false,
        preview: true,
        protectFirstLevel: true,
        enableSimilarity: true,
        similarityThreshold: 0.6,
        fileConflict: undefined,
        dirConflict: undefined,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.totalCount).toBe(1)
    expect(host.state.logs).toEqual([
      "[50%] planning D:/library/outer",
      "Plan generated: 1 operation(s).",
    ])
    expect(screen.getAllByText(/pending nested move/).length).toBeGreaterThanOrEqual(1)
  })

  test("arms a fuse instead of executing the real dissolve on the first click", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/library/outer", preview: false })
    render(<Component compId="comp-dissolvef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实溶解" }))

    expect(host.runCalls).toHaveLength(0)
  })

  // Hazard 上膛 = 真执行 + 不追问：真实溶解一次点击直接发起。
  test("executes the real dissolve on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ pathText: "D:/library/outer", preview: false })
    render(<Component compId="comp-dissolvef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实溶解" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("dissolve")
    expect(host.runCalls[0]?.input.preview).toBe(false)
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: DissolvefInput }>
  state: DissolvefCardState
}

function createHost(initial: DissolvefCardState): TestHost {
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
        onEvent?: (event: { type: "progress" | "log"; progress?: number; message: string }) => void,
      ): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as DissolvefInput })
        onEvent?.({ type: "progress", progress: 50, message: "planning D:/library/outer" })
        return {
          success: true,
          message: "Plan generated: 1 operation(s).",
          data: dissolvefData,
        } as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/library/outer",
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

const dissolvefData: DissolvefData = {
  plan: [
    {
      mode: "nested",
      operation: "move",
      sourcePath: "D:/library/outer/inner/leaf/page.txt",
      targetPath: "D:/library/outer/page.txt",
      itemKind: "file",
      status: "pending",
      similarity: 1,
    },
  ],
  history: [],
  archivePaths: [],
  nestedCount: 1,
  mediaCount: 0,
  archiveCount: 0,
  directFiles: 0,
  directDirs: 0,
  skippedCount: 0,
  totalCount: 1,
  successCount: 0,
  failedCount: 0,
  errorCount: 0,
  operationId: "",
  errors: [],
}
