// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { GifuData, GifuInput } from "@xiranite/node-gifu/core"
import { Component } from "./Component"
import type { GifuCardState } from "./types"

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

describe("app-owned gifu Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Gifu-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-gifu" host={createHost({ pathsText: "D:/archives/a.zip" })} />)

      expect(screen.getByText("Gifu")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("gifu-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/1 条路径等待/)).toBeTruthy()
        expect(screen.queryByLabelText("gifu 归档或目录")).toBeNull()
        return
      }

      expect(screen.getByLabelText("gifu 归档或目录")).toBeTruthy()
      expect(screen.getByRole("tab", { name: "归档" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "命令" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()

      if (mode === "compact") {
        expect(screen.getByTestId("gifu-compact-view")).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("gifu-portrait-view")).toBeTruthy()
      } else {
        expect(screen.getByTestId("gifu-full-view")).toBeTruthy()
        expect(screen.getByTestId("gifu-header-toolbar")).toBeTruthy()
        expect(screen.getByTestId("gifu-wide-layout").firstElementChild).toBe(screen.getByTestId("gifu-control-panel"))
        expect(screen.getByText("动画编译台")).toBeTruthy()
        expect(screen.getByTestId("gifu-action-deck")).toBeTruthy()
        expect(screen.getByRole("button", { name: "检查归档" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "生成动画" })).toBeTruthy()
      }
    },
  )

  test("runs a plan through host.runner.run and stores archive results", async () => {
    setSurface("regular")
    const host = createHost({
      pathsText: "D:/archives/a.zip\nD:/archives/b.cbz",
      configPath: "D:/gifu.toml",
      format: "gif",
      outMode: "separate",
      durationMs: "90",
      dryRun: true,
      logs: [],
    })
    render(<Component compId="comp-gifu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "生成计划" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "gifu",
      input: {
        action: "plan",
        paths: ["D:/archives/a.zip", "D:/archives/b.cbz"],
        configPath: "D:/gifu.toml",
        databasePath: undefined,
        format: "gif",
        outDir: undefined,
        outMode: "separate",
        durationMs: 90,
        maxWorkers: undefined,
        namePrefix: undefined,
        dryRun: true,
        recordRun: false,
      },
    })
    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
    expect(host.cardState.result?.archives).toHaveLength(1)
    expect(screen.getAllByText(/D:\/archives\/a\.zip/).length).toBeGreaterThanOrEqual(1)
  })

  test("holds real make behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")

    // Hazard 未上膛：点击只点亮引信，真正的提交要等引信烧完（本用例不去烧它）。
    const guardedHost = createHost({ action: "make", pathsText: "D:/archives/a.zip", dryRun: false, logs: [] })
    render(<Component compId="comp-gifu" host={guardedHost} />)
    const user = userEvent.setup()

    const trigger = screen.getByRole("button", { name: "生成动画" })
    await user.click(trigger)
    // 正控：点击确实落在了引信闸门的那颗按钮上，不是按钮缺失或事件没接上。
    expect(trigger.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")
    expect(guardedHost.runCalls).toHaveLength(0)

    cleanup()

    // Hazard 上膛：同一个触发的同一次点击直接发起运行。
    useWorkspaceStore.setState({ hazardMode: true })
    const hazardHost = createHost({ action: "make", pathsText: "D:/archives/a.zip", dryRun: false, logs: [] })
    render(<Component compId="comp-gifu" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: "生成动画" }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("make")
    expect(hazardHost.runCalls[0]?.input.dryRun).toBe(false)
  })

  test("marks the card as error when no path is provided", async () => {
    setSurface("regular")
    const host = createHost({ logs: [] })
    render(<Component compId="comp-gifu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "生成计划" }))

    expect(host.runCalls).toHaveLength(0)
    await waitFor(() => expect(host.cardState.phase).toBe("error"))
    expect(host.cardState.progressText).toContain("至少一个归档或目录")
  })

  test("runs a direct action without selecting it first", async () => {
    setSurface("regular")
    const host = createHost({ action: "plan", pathsText: "D:/archives/a.zip", dryRun: true, logs: [] })
    render(<Component compId="comp-gifu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "检查归档" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("inspect")
    expect(host.cardState.action).toBe("inspect")
  })
})

type TestHost = NodeHostApi<GifuCardState, Partial<GifuCardState>> & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: GifuInput }>
  savedConfig: Partial<GifuCardState> | undefined
  cardState: GifuCardState
}

function createHost(initial: GifuCardState): TestHost {
  const stateCapability = {
    getData: () => host.cardState,
    patchData: (patch: Partial<GifuCardState>) => {
      host.cardState = { ...host.cardState, ...patch }
    },
  }

  const host: TestHost = {
    cardState: { ...initial },
    runCalls: [],
    copiedText: "",
    savedConfig: undefined,
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "runner", "clipboard", "config", "env"],
      hasCapability: (capability) => ["contract", "state", "runner", "clipboard", "config", "env"].includes(capability),
    },
    env: {
      theme: "light",
      platform: "web",
    },
    state: stateCapability,
    runner: {
      run: async <TInput, TData>(
        nodeId: string,
        input: TInput,
        onEvent?: (event: NodeRunEvent) => void,
      ): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as GifuInput })
        onEvent?.({ type: "progress", progress: 35, message: "Inspecting archives." })
        return {
          success: true,
          message: "Gifu planned 1 archive(s).",
          data: gifuData as TData,
        }
      },
    },
    clipboard: {
      readText: async () => "D:/archives/a.zip",
      writeText: async (text) => {
        host.copiedText = text
      },
    },
    config: {
      get: async () => ({ config: undefined, path: "D:/config/xiranite.config.toml" }),
      save: async (config) => {
        host.savedConfig = config
      },
      openFile: () => undefined,
    },
    getData: <T,>() => stateCapability.getData() as T | undefined,
    patchData: (_compId, patch) => stateCapability.patchData(patch),
    listComponents: () => [],
    updateComponent: () => undefined,
    actions: undefined,
    getNodeConfig: async <T,>() => ({ config: undefined as T | undefined, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async (config) => {
      host.savedConfig = config as Partial<GifuCardState>
    },
    openConfigFile: () => undefined,
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

const gifuData: GifuData = {
  archives: [
    {
      archivePath: "D:/archives/a.zip",
      outputPath: "D:/archives/a.gif",
      imageCount: 12,
      status: "ready",
    },
  ],
  command: {
    command: "gifu-native",
    args: ["make", "D:/archives/a.zip"],
  },
  database: {
    path: "D:/archives/.xiranite/gifu-runs.jsonl",
    enabled: false,
    mode: "jsonl",
    defaultPath: true,
  },
  readyCount: 1,
  singleCount: 0,
  emptyCount: 0,
  errors: [],
}
