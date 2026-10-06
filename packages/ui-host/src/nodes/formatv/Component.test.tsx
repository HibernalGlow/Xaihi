// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { FormatvData, FormatvInput } from "@xiranite/node-formatv/core"
import { Component } from "./Component"
import type { FormatvCardState } from "./types"

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
  // Hazard 是用例级的全局开关：上一条点亮了它，下一条必须回到默认的「要确认」。
  useWorkspaceStore.setState({ hazardMode: false })
  setSurface("regular")
})

describe("app-owned formatv Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with FormatV-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-formatv" host={createHost({ pathText: "D:/videos" })} />)

      expect(screen.getByText("FormatV")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("formatv-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/1 条路径等待扫描/)).toBeTruthy()
        expect(screen.queryByLabelText("formatv paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("formatv paths")).toBeTruthy()
      expect(screen.getByRole("tab", { name: "结果" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()

      if (mode === "compact") {
        expect(screen.getByTestId("formatv-compact-view")).toBeTruthy()
        expect(screen.getByRole("button", { name: "formatv options" })).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("formatv-portrait-view")).toBeTruthy()
        expect(screen.getByTestId("formatv-key-switches")).toBeTruthy()
      } else {
        expect(screen.getByTestId("formatv-full-view")).toBeTruthy()
        expect(screen.getByText("关键开关")).toBeTruthy()
        expect(screen.getByTestId("formatv-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-formatv" host={createHost({ pathText: "D:/videos" })} />)

    expect(screen.getByTestId("formatv-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("formatv paths")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-formatv" host={createHost({ pathText: "D:/videos" })} />)

    expect(screen.getByTestId("formatv-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("formatv-compact-view")).toBeNull()
  })

  test("pastes paths from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-formatv" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴路径" }))

    expect(host.state.pathText).toBe("D:/videos")
  })

  test("runs scan through host.actions.run and stores result", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/videos", logs: [] })
    render(<Component compId="comp-formatv" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "扫描视频" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "formatv",
      input: {
        action: "scan",
        paths: ["D:/videos"],
        recursive: false,
        prefixName: "hb",
        dryRun: false,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.normalCount).toBe(2)
    expect(host.state.logs?.at(-1)).toBe("Scan completed: 2 normal, 1 .nov.")
  })

  test("holds the real .nov rename behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")
    const initial = { pathText: "D:/videos", dryRun: false, logs: [] }

    // Hazard 未上膛：点击只点亮引信，真正的提交要等引信烧完（本用例不去烧它）。
    const guardedHost = createHost(initial)
    render(<Component compId="comp-formatv" host={guardedHost} />)
    const user = userEvent.setup()

    const trigger = screen.getByRole("button", { name: "添加 .nov" })
    await user.click(trigger)
    // 正控：点击确实落在了引信闸门的那颗按钮上，不是按钮缺失或事件没接上。
    expect(trigger.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")
    expect(guardedHost.runCalls).toHaveLength(0)

    cleanup()

    // Hazard 上膛：同一个触发的同一次点击直接发起改名。
    useWorkspaceStore.setState({ hazardMode: true })
    const hazardHost = createHost(initial)
    render(<Component compId="comp-formatv" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: "添加 .nov" }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("add_nov")
    expect(hazardHost.runCalls[0]?.input.dryRun).toBe(false)
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: FormatvInput }>
  state: FormatvCardState
}

type HostOptions = {
  runError?: Error
  runResult?: NodeRunResult<FormatvData>
}

function createHost(initial: FormatvCardState, options: HostOptions = {}): TestHost {
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
        host.runCalls.push({ nodeId, input: input as FormatvInput })
        if (options.runError) throw options.runError
        onEvent?.({ type: "progress", progress: 50, message: "Collecting video files." })
        onEvent?.({ type: "log", message: "Classifying files." })
        onEvent?.({ type: "progress", progress: 100, message: "FormatV completed." })
        return (options.runResult ?? {
          success: true,
          message: "Scan completed: 2 normal, 1 .nov.",
          data: formatvData,
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/videos",
      writeText: async (text) => {
        host.copiedText = text
      },
    },
    env: {
      theme: "light",
      platform: "web",
    },
    getNodeConfig: async <T,>() => ({ config: options.runResult as T | undefined, path: "D:/config/xiranite.config.toml" }),
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

const formatvData: FormatvData = {
  normalCount: 2,
  novCount: 1,
  prefixedCounts: { hb: 1 },
  normalFiles: ["D:/videos/a.mp4", "D:/videos/b.mkv"],
  novFiles: ["D:/videos/c.mp4.nov"],
  prefixedFiles: { hb: ["D:/videos/[#hb]d.mp4"] },
  successCount: 0,
  errorCount: 0,
  skippedCount: 0,
  duplicateCount: 0,
  duplicates: [],
  prefixedLarger: [],
  operations: [],
  reportPath: "",
  errors: [],
}
