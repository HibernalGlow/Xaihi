// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { TrenameData, TrenameInput } from "@xiranite/node-trename/core"
import { Component } from "./Component"
import { FileTreePanel } from "./FileTreePanel"
import type { TrenameCardState } from "./types"

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

describe("app-owned trename Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Trename-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-trename" host={createHost({ pathText: "D:/gallery" })} />)

      expect(screen.getByText("Trename")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("trename-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/1 条路径等待扫描/)).toBeTruthy()
        expect(screen.queryByLabelText("trename scan paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("trename scan paths")).toBeTruthy()

      if (mode === "compact") {
        expect(screen.getByTestId("trename-compact-view")).toBeTruthy()
        expect(screen.getByRole("button", { name: "trename advanced options" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /文件/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /计划/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /冲突/ })).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("trename-portrait-view")).toBeTruthy()
        expect(screen.getByTestId("trename-key-switches")).toBeTruthy()
        expect(screen.getByRole("tab", { name: /文件/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /计划/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /冲突/ })).toBeTruthy()
      } else {
        expect(screen.getByTestId("trename-full-view")).toBeTruthy()
        expect(screen.getByText("关键开关")).toBeTruthy()
        expect(screen.getByText("总计")).toBeTruthy()
        expect(screen.getByTestId("trename-header-toolbar")).toBeTruthy()
        expect(screen.getByText("执行闸门")).toBeTruthy()
        expect(screen.getByText("差异队列")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-trename" host={createHost({ pathText: "D:/gallery" })} />)

    expect(screen.getByTestId("trename-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("trename scan paths")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-trename" host={createHost({ pathText: "D:/gallery" })} />)

    expect(screen.getByTestId("trename-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("trename-compact-view")).toBeNull()
  })

  test("pastes scan paths from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-trename" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴路径" }))

    expect(host.state.pathText).toBe("D:/gallery")
  })

  test("runs scan through host.actions.run and stores JSON in the file tab", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/gallery", includeRoot: true, compact: true, dryRun: true, logs: [] })
    render(<Component compId="comp-trename" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "扫描路径" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "trename",
      input: {
        action: "scan",
        paths: "D:/gallery",
        includeHidden: false,
        includeRoot: true,
        excludeExts: undefined,
        excludePatterns: undefined,
        maxLines: 1000,
        compact: true,
        mode: "normal",
        jsonContent: "",
        basePath: undefined,
        dryRun: true,
        batchId: undefined,
        undoPath: undefined,
        keepRecent: 10,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.jsonText).toContain("image-a.jpg")
    expect(host.state.logs).toEqual([
      "[25%] Reading paths.",
      "Planning rename JSON.",
      "[100%] Scan complete.",
      "Scan complete: 2 item(s), 1 segment(s).",
    ])
    expect(screen.getAllByText(/image-a\.jpg/).length).toBeGreaterThanOrEqual(1)
  })

  test("marks the card as error when the runner returns a failed response", async () => {
    setSurface("regular")
    const host = createHost(
      { jsonText: jsonContent, logs: [] },
      {
        runResult: { success: false, message: "Validation failed.", data: { ...trenameData, errors: ["bad target"] } },
      },
    )
    render(<Component compId="comp-trename" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "校验冲突" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("Validation failed.")
    expect(host.state.logs?.at(-1)).toBe("Validation failed.")
  })

  test("catches thrown runner errors and appends the message to logs", async () => {
    setSurface("regular")
    const host = createHost({ jsonText: jsonContent, logs: [] }, { runError: new Error("backend offline") })
    render(<Component compId="comp-trename" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "校验冲突" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("backend offline")
    expect(host.state.logs?.at(-1)).toBe("backend offline")
  })

  test("uses shared configuration management controls", async () => {
    setSurface("regular")
    const host = createHost(
      { pathText: "D:/current", dryRun: true },
      { config: { pathText: "D:/default", dryRun: false } },
    )
    render(<Component compId="comp-trename" host={host} />)
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByRole("button", { name: "配置管理" }).className).toContain("bg-secondary"))
    await user.click(screen.getByRole("button", { name: "配置管理" }))
    await user.click(screen.getByRole("button", { name: "恢复默认" }))
    expect(host.state.pathText).toBe("D:/default")
    expect(host.state.dryRun).toBe(false)

    await user.click(screen.getByRole("button", { name: "保存为默认" }))
    expect(host.savedConfig).toEqual({ pathText: "D:/default", dryRun: false })

    await user.click(screen.getByRole("button", { name: "打开文件" }))
    expect(host.openConfigFileCalls).toBe(1)
  })

  test("keeps file tree rows clickable for selection and folder toggles", async () => {
    render(
      <div style={{ height: "360px" }}>
        <FileTreePanel jsonText={jsonContent} />
      </div>,
    )
    const user = userEvent.setup()

    const folder = screen.getByRole("button", { name: /gallery/ }) as HTMLButtonElement
    expect(folder.disabled).toBe(false)
    expect(folder.getAttribute("aria-expanded")).toBe("true")

    await user.click(folder)
    expect(folder.getAttribute("aria-expanded")).toBe("false")

    await user.click(folder)
    expect(folder.getAttribute("aria-expanded")).toBe("true")

    const file = screen.getByRole("button", { name: /image-a\.jpg/ }) as HTMLButtonElement
    expect(file.disabled).toBe(false)

    await user.click(file)
    expect(file.className).toContain("bg-muted")
  })

  test("arms a fuse instead of executing the real rename on the first click", async () => {
    setSurface("regular")
    const host = createHost({ jsonText: jsonContent, dryRun: false })
    render(<Component compId="comp-trename" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实重命名" }))

    expect(host.runCalls).toHaveLength(0)
  })

  // Hazard 上膛 = 真执行 + 不追问：真实重命名一次点击直接发起。
  test("executes the real rename on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ jsonText: jsonContent, dryRun: false })
    render(<Component compId="comp-trename" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "真实重命名" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("rename")
    expect(host.runCalls[0]?.input.dryRun).toBe(false)
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  openConfigFileCalls: number
  runCalls: Array<{ nodeId: string; input: TrenameInput }>
  savedConfig: Partial<TrenameCardState> | undefined
  state: TrenameCardState
}

type HostOptions = {
  config?: Partial<TrenameCardState>
  runError?: Error
  runResult?: NodeRunResult<TrenameData>
}

function createHost(initial: TrenameCardState, options: HostOptions = {}): TestHost {
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
        host.runCalls.push({ nodeId, input: input as TrenameInput })
        if (options.runError) throw options.runError
        onEvent?.({ type: "progress", progress: 25, message: "Reading paths." })
        onEvent?.({ type: "log", message: "Planning rename JSON." })
        onEvent?.({ type: "progress", progress: 100, message: "Scan complete." })
        return (options.runResult ?? {
          success: true,
          message: "Scan complete: 2 item(s), 1 segment(s).",
          data: trenameData,
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/gallery",
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
      host.savedConfig = config as Partial<TrenameCardState>
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

const jsonContent = `{
  "root": [
    {"src_dir": "gallery", "tgt_dir": "画廊", "children": [
      {"src": "image-a.jpg", "tgt": "图-a.jpg"}
    ]}
  ]
}`

const trenameData: TrenameData = {
  jsonContent,
  segments: [jsonContent],
  totalItems: 2,
  pendingCount: 0,
  readyCount: 2,
  successCount: 0,
  failedCount: 0,
  skippedCount: 0,
  operationId: "",
  conflicts: [],
  operations: [
    {
      originalPath: "D:/gallery/image-a.jpg",
      newPath: "D:/gallery/图-a.jpg",
    },
  ],
  history: [],
  basePath: "D:/",
  errors: [],
}
