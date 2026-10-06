// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { MarkuData, MarkuInput } from "@xiranite/node-marku/core"
import { Component } from "./Component"
import type { MarkuCardState } from "./types"

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

describe("app-owned marku Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Marku-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-marku" host={createHost({ pathText: "D:/docs" })} />)

      expect(screen.getByText("Marku")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("marku-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/1 条路径/)).toBeTruthy()
        expect(screen.queryByLabelText("marku scan paths")).toBeNull()
        return
      }

      if (mode === "compact" || mode === "portrait") {
        expect(screen.getByLabelText("marku module")).toBeTruthy()
      } else {
        expect(screen.getByTestId("marku-module-grid")).toBeTruthy()
        expect(screen.getByText("模块")).toBeTruthy()
        expect(screen.getByText("关键开关")).toBeTruthy()
        expect(screen.getByTestId("marku-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-marku" host={createHost({ pathText: "D:/docs" })} />)

    expect(screen.getByTestId("marku-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("marku scan paths")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-marku" host={createHost({ pathText: "D:/docs" })} />)

    expect(screen.getByTestId("marku-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("marku-compact-view")).toBeNull()
  })

  test("pastes scan paths from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-marku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴路径" }))

    expect(host.state.pathText).toBe("D:/docs")
  })

  test("runs text mode when inputText is present and stores output", async () => {
    setSurface("regular")
    const host = createHost({ inputText: "# Title", dryRun: true, logs: [] })
    render(<Component compId="comp-marku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演处理" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "marku",
      input: {
        action: "text",
        module: "markt",
        paths: [],
        inputText: "# Title",
        stepConfig: {},
        recursive: false,
        dryRun: true,
        enableUndo: true,
        historyPath: undefined,
        undoId: undefined,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.outputText).toBe("- Title")
    expect(host.state.logs).toEqual([
      "Text processing started.",
      "[100%] Text processed.",
      "Text processed: changed.",
    ])
  })

  test("marks the card as error when the runner returns a failed response", async () => {
    setSurface("regular")
    const host = createHost(
      { pathText: "D:/docs", logs: [] },
      { runResult: { success: false, message: "No Markdown files found.", data: { ...markuData, errors: ["no files"] } } },
    )
    render(<Component compId="comp-marku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演处理" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("No Markdown files found.")
    expect(host.state.logs?.at(-1)).toBe("No Markdown files found.")
  })

  test("catches thrown runner errors and appends the message to logs", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/docs", logs: [] }, { runError: new Error("backend offline") })
    render(<Component compId="comp-marku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演处理" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("backend offline")
    expect(host.state.logs?.at(-1)).toBe("backend offline")
  })

  test("arms a fuse instead of executing the real write-back on the first click", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/docs/readme.md", dryRun: false })
    render(<Component compId="comp-marku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实写回" }))

    expect(host.runCalls).toHaveLength(0)
  })

  // Hazard 上膛 = 真执行 + 不追问：真实写回一次点击直接发起。
  test("executes the real write-back on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ pathText: "D:/docs/readme.md", dryRun: false })
    render(<Component compId="comp-marku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实写回" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("run")
    expect(host.runCalls[0]?.input.dryRun).toBe(false)
  })
})

type TestHost = NodeHostApi & {
  runCalls: Array<{ nodeId: string; input: MarkuInput }>
  state: MarkuCardState
}

type HostOptions = {
  runError?: Error
  runResult?: NodeRunResult<MarkuData>
}

function createHost(initial: MarkuCardState, options: HostOptions = {}): TestHost {
  const host: TestHost = {
    state: { ...initial },
    runCalls: [],
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
        host.runCalls.push({ nodeId, input: input as MarkuInput })
        if (options.runError) throw options.runError
        onEvent?.({ type: "log", message: "Text processing started." })
        onEvent?.({ type: "progress", progress: 100, message: "Text processed." })
        return (options.runResult ?? {
          success: true,
          message: "Text processed: changed.",
          data: markuData,
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/docs",
      writeText: async () => undefined,
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

const markuData: MarkuData = {
  filesProcessed: 1,
  filesChanged: 1,
  inputText: "# Title",
  outputText: "- Title",
  diffText: "--- a/input.md\n+++ b/input.md\n@@ -1,1 +1,1 @@\n-# Title\n+- Title\n",
  diffs: [{ file: "input.md", diff: "- # Title\n+ - Title\n", changed: true }],
  history: [],
  undoId: "",
  errors: [],
}
