// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { RawfilterData, RawfilterInput } from "@xiranite/node-rawfilter/core"
import { Component } from "./Component"
import type { RawfilterCardState } from "./types"

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

describe("app-owned rawfilter Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Rawfilter-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-rawfilter" host={createHost({ path: "D:/archives" })} />)

      expect(screen.getByText("Rawfilter")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("rawfilter-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/D:\/archives 等待运行/)).toBeTruthy()
        expect(screen.queryByLabelText("rawfilter 目录路径")).toBeNull()
        return
      }

      expect(screen.getByLabelText("rawfilter 目录路径")).toBeTruthy()
      expect(screen.getByTestId("rawfilter-action-picker")).toBeTruthy()
      expect(screen.getByRole("tablist", { name: "过滤流程" })).toBeTruthy()
      const resultTabs = within(screen.getByRole("tablist", { name: "过滤结果" }))
      expect(resultTabs.getByRole("tab", { name: "计划" })).toBeTruthy()
      expect(resultTabs.getByRole("tab", { name: "分组" })).toBeTruthy()
      expect(resultTabs.getByRole("tab", { name: "日志" })).toBeTruthy()

      if (mode === "compact") {
        expect(screen.getByTestId("rawfilter-compact-view")).toBeTruthy()
        expect(screen.getByRole("button", { name: "rawfilter 高级选项" })).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("rawfilter-portrait-view")).toBeTruthy()
        expect(screen.getByTestId("rawfilter-primary-switches")).toBeTruthy()
      } else {
        expect(screen.getByTestId("rawfilter-full-view")).toBeTruthy()
        expect(screen.getByText("关键开关")).toBeTruthy()
        expect(screen.getByText("任务")).toBeTruthy()
        expect(screen.getByTestId("rawfilter-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-rawfilter" host={createHost({ path: "D:/archives" })} />)

    expect(screen.getByTestId("rawfilter-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("rawfilter 目录路径")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-rawfilter" host={createHost({ path: "D:/archives" })} />)

    expect(screen.getByTestId("rawfilter-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("rawfilter-compact-view")).toBeNull()
  })

  test("pastes a directory path from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-rawfilter" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴路径" }))

    expect(host.state.path).toBe("D:/archives")
  })

  test("runs scan action through host.actions.run and stores the plan in the plan tab", async () => {
    setSurface("regular")
    const host = createHost({ path: "D:/archives", action: "scan", logs: [] })
    render(<Component compId="comp-rawfilter" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "运行扫描" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "rawfilter",
      input: {
        action: "scan",
        path: "D:/archives",
        nameOnlyMode: false,
        createShortcuts: false,
        trashOnly: false,
        minSimilarity: 0.82,
        dryRun: false,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.archiveCount).toBe(2)
    expect(host.state.logs?.at(-1)).toBe("Plan generated: 1 operation(s).")
    expect(screen.getAllByText("book-raw.zip").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("trash").length).toBeGreaterThanOrEqual(1)
  })

  test("holds the destructive execute behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")
    const initial = { path: "D:/archives", action: "execute" as const, dryRun: false, logs: [] }

    // Hazard 未上膛：点击只点亮引信，真正的提交要等引信烧完（本用例不去烧它）。
    const guardedHost = createHost(initial)
    render(<Component compId="comp-rawfilter" host={guardedHost} />)
    const user = userEvent.setup()

    const trigger = screen.getByRole("button", { name: "运行过滤" })
    await user.click(trigger)
    // 正控：点击确实落在了引信闸门的那颗按钮上，不是按钮缺失或事件没接上。
    expect(trigger.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")
    expect(guardedHost.runCalls).toHaveLength(0)

    cleanup()

    // Hazard 上膛：同一个触发的同一次点击直接发起真实执行。
    useWorkspaceStore.setState({ hazardMode: true })
    const hazardHost = createHost(initial)
    render(<Component compId="comp-rawfilter" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: "运行过滤" }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("execute")
    await waitFor(() => expect(hazardHost.state.phase).toBe("completed"))
  })

  test("marks the card as error when the runner returns a failed response", async () => {
    setSurface("regular")
    const host = createHost(
      { path: "D:/archives", action: "plan", logs: [] },
      { runResult: { success: false, message: "Path does not exist.", data: { ...rawfilterData, errors: ["Path does not exist."] } } },
    )
    render(<Component compId="comp-rawfilter" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "运行计划" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("Path does not exist.")
    expect(host.state.logs?.at(-1)).toBe("Path does not exist.")
  })

  test("saves and restores shared configuration", async () => {
    setSurface("regular")
    const host = createHost(
      { path: "D:/current", action: "scan", trashOnly: true },
      { config: { path: "D:/default", action: "execute", trashOnly: false } },
    )
    render(<Component compId="comp-rawfilter" host={host} />)
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByRole("button", { name: "配置管理" }).className).toContain("bg-secondary"))
    await user.click(screen.getByRole("button", { name: "配置管理" }))
    await user.click(screen.getByRole("button", { name: "恢复默认" }))
    expect(host.state.path).toBe("D:/default")
    expect(host.state.action).toBe("execute")
    expect(host.state.trashOnly).toBe(false)

    await user.click(screen.getByRole("button", { name: "保存为默认" }))
    expect(host.savedConfig).toBeDefined()

    await user.click(screen.getByRole("button", { name: "打开文件" }))
    expect(host.openConfigFileCalls).toBe(1)
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  openConfigFileCalls: number
  runCalls: Array<{ nodeId: string; input: RawfilterInput }>
  savedConfig: Partial<RawfilterCardState> | undefined
  state: RawfilterCardState
}

type HostOptions = {
  config?: Partial<RawfilterCardState>
  runResult?: NodeRunResult<RawfilterData>
}

function createHost(initial: RawfilterCardState, options: HostOptions = {}): TestHost {
  const host: TestHost = {
    state: { ...initial },
    runCalls: [],
    copiedText: "",
    savedConfig: undefined,
    openConfigFileCalls: 0,
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
        host.runCalls.push({ nodeId, input: input as RawfilterInput })
        onEvent?.({ type: "progress", progress: 25, message: "Scanning archive files." })
        onEvent?.({ type: "log", message: "Grouped 2 archive file(s)." })
        onEvent?.({ type: "progress", progress: 100, message: "rawfilter complete." })
        return (options.runResult ?? {
          success: true,
          message: "Plan generated: 1 operation(s).",
          data: rawfilterData,
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/archives",
      writeText: async (text) => {
        host.copiedText = text
      },
    },
    env: {
      theme: "light",
      platform: "web",
    },
    getNodeConfig: async <T,>() => ({ config: options.config as T | undefined, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async (config) => {
      host.savedConfig = config as Partial<RawfilterCardState>
    },
    openConfigFile: () => {
      host.openConfigFileCalls += 1
    },
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

const rawfilterData: RawfilterData = {
  archiveCount: 2,
  totalGroups: 1,
  duplicateGroups: 1,
  skippedFiles: 0,
  movedToTrash: 1,
  movedToMulti: 0,
  createdShortcuts: 0,
  keptCount: 1,
  errorCount: 0,
  plan: [
    {
      groupKey: "book",
      groupLabel: "book",
      fileName: "book-raw.zip",
      sourcePath: "D:/archives/book-raw.zip",
      targetPath: "D:/archives/trash/book-raw.zip",
      destination: "trash",
      status: "pending",
      variant: "raw",
      reason: "raw_version_replaced",
    },
    {
      groupKey: "book",
      groupLabel: "book",
      fileName: "book-cn.zip",
      sourcePath: "D:/archives/book-cn.zip",
      targetPath: "",
      destination: "keep",
      status: "kept",
      variant: "translated",
      reason: "preferred_version",
    },
  ],
  groups: [
    {
      key: "book",
      label: "book",
      files: [
        {
          name: "book-cn.zip",
          path: "D:/archives/book-cn.zip",
          normalizedName: "book cn",
          groupKey: "book",
          variant: "translated",
          score: 100,
        },
        {
          name: "book-raw.zip",
          path: "D:/archives/book-raw.zip",
          normalizedName: "book raw",
          groupKey: "book",
          variant: "raw",
          score: 10,
        },
      ],
    },
  ],
  errors: [],
}
