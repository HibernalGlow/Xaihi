// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { MvzData, MvzInput } from "@xiranite/node-mvz/core"
import { Component } from "./Component"
import type { MvzCardState } from "./types"

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

describe("app-owned mvz Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with MVZ-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-mvz" host={createHost({ entryText: "D:/books.zip//chapter1.md" })} />)

      expect(screen.getByText("MVZ")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("mvz-collapsed-view")).toBeTruthy()
        expect(screen.queryByLabelText("mvz archive entries")).toBeNull()
        return
      }

      if (mode === "compact" || mode === "portrait") {
        expect(screen.getByTestId("mvz-action-picker")).toBeTruthy()
        if (mode === "portrait") {
          expect(screen.getByTestId("mvz-portrait-view")).toBeTruthy()
        } else {
          expect(screen.getByTestId("mvz-compact-view")).toBeTruthy()
        }
      } else {
        expect(screen.getByTestId("mvz-full-view")).toBeTruthy()
        expect(screen.getByText("动作")).toBeTruthy()
        expect(screen.getByText("条目")).toBeTruthy()
        expect(screen.getByText("关键开关")).toBeTruthy()
        expect(screen.getByTestId("mvz-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-mvz" host={createHost({ entryText: "D:/books.zip//chapter1.md" })} />)

    expect(screen.getByTestId("mvz-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("mvz archive entries")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-mvz" host={createHost({ entryText: "D:/books.zip//chapter1.md" })} />)

    expect(screen.getByTestId("mvz-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("mvz-compact-view")).toBeNull()
  })

  test("pastes archive entries from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-mvz" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴条目" }))

    expect(host.state.entryText).toBe("D:/books.zip//chapter1.md")
  })

  test("runs extract action in dry-run mode and stores the result", async () => {
    setSurface("regular")
    const host = createHost({ entryText: "D:/books.zip//chapter1.md", dryRun: true, logs: [] })
    render(<Component compId="comp-mvz" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演提取" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "mvz",
      input: {
        action: "extract",
        fileText: "D:/books.zip//chapter1.md",
        output: undefined,
        near: true,
        autoDir: true,
        flatten: false,
        pattern: undefined,
        replacement: "",
        separator: "//",
        dryRun: true,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.successCount).toBe(1)
    expect(host.state.result?.totalArchives).toBe(1)
    expect(host.state.logs).toEqual([
      "[100%] mvz complete.",
      "extract complete: 1 succeeded, 0 failed.",
    ])
  })

  test("marks the card as error when the runner returns a failed response", async () => {
    setSurface("regular")
    const host = createHost(
      { entryText: "D:/books.zip//chapter1.md", logs: [] },
      { runResult: { success: false, message: "7-Zip executable was not found.", data: { ...mvzData, failedCount: 1 } } },
    )
    render(<Component compId="comp-mvz" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演提取" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("7-Zip executable was not found.")
    expect(host.state.logs?.at(-1)).toBe("7-Zip executable was not found.")
  })

  test("catches thrown runner errors and appends the message to logs", async () => {
    setSurface("regular")
    const host = createHost({ entryText: "D:/books.zip//chapter1.md", logs: [] }, { runError: new Error("backend offline") })
    render(<Component compId="comp-mvz" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演提取" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("backend offline")
    expect(host.state.logs?.at(-1)).toBe("backend offline")
  })

  test("arms a fuse instead of executing the real extract on the first click", async () => {
    setSurface("regular")
    const host = createHost({ entryText: "D:/books.zip//chapter1.md", dryRun: false })
    render(<Component compId="comp-mvz" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实提取" }))

    expect(host.runCalls).toHaveLength(0)
  })

  // Hazard 上膛 = 真执行 + 不追问：真实提取一次点击直接发起。
  test("executes the real extract on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ entryText: "D:/books.zip//chapter1.md", dryRun: false })
    render(<Component compId="comp-mvz" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实提取" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("extract")
    expect(host.runCalls[0]?.input.dryRun).toBe(false)
  })
})

type TestHost = NodeHostApi & {
  runCalls: Array<{ nodeId: string; input: MvzInput }>
  state: MvzCardState
}

type HostOptions = {
  runError?: Error
  runResult?: NodeRunResult<MvzData>
}

function createHost(initial: MvzCardState, options: HostOptions = {}): TestHost {
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
        host.runCalls.push({ nodeId, input: input as MvzInput })
        if (options.runError) throw options.runError
        onEvent?.({ type: "progress", progress: 100, message: "mvz complete." })
        return (options.runResult ?? {
          success: true,
          message: "extract complete: 1 succeeded, 0 failed.",
          data: mvzData,
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/books.zip//chapter1.md",
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

const mvzData: MvzData = {
  action: "extract",
  totalFiles: 1,
  totalArchives: 1,
  successCount: 1,
  failedCount: 0,
  results: [
    {
      archive: "D:/books.zip",
      action: "extract",
      success: true,
      message: "extract 1 file(s).",
      files: ["chapter1.md"],
      count: 1,
      output: "D:/books",
      command: '7z x "D:/books.zip" -o"D:/books" -y "chapter1.md"',
    },
  ],
  preview: [],
}
