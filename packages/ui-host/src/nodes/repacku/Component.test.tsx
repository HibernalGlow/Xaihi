// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunResult } from "@xiranite/contract"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import type { RepackuData, RepackuFolderNode, RepackuInput } from "@xiranite/node-repacku/core"
import { Component } from "./Component"

const surfaceState = vi.hoisted(() => ({
  mode: "regular" as NodeSurfaceMode,
}))

vi.mock("@/nodes/shared/useNodeSurface", () => ({
  useNodeSurface: () => ({
    ref: { current: null },
    width: widthForMode(surfaceState.mode),
    height: heightForMode(surfaceState.mode),
    mode: surfaceState.mode,
    density: surfaceState.mode === "collapsed" || surfaceState.mode === "compact" || surfaceState.mode === "portrait" ? "tight" : "roomy",
  }),
}))

vi.mock("@/nodes/shared/NodeRunHistoryPopover", () => ({
  NodeRunHistoryPopover: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  surfaceState.mode = "regular"
})

describe("app-owned repacku Component", () => {
  test.each(["collapsed", "compact", "portrait", "regular", "expanded", "workspace"] as NodeSurfaceMode[])(
    "renders the %s surface without falling back to the old package UI",
    (mode) => {
      surfaceState.mode = mode
      render(<Component compId="comp-repacku" host={createHost({ path: "D:/library", dryRun: true })} />)

      expect(screen.getByText("Repacku")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.queryByLabelText("文件夹路径")).toBeNull()
        expect(screen.getByText("完整流程")).toBeTruthy()
        return
      }

      expect(screen.getByLabelText("文件夹路径")).toBeTruthy()
      if (mode === "compact" || mode === "portrait") {
        if (mode === "portrait") {
          expect(screen.getByTestId("repacku-portrait-surface")).toBeTruthy()
          expect(screen.getByTestId("repacku-portrait-results")).toBeTruthy()
          expect(screen.getByRole("tab", { name: "操作" })).toBeTruthy()
          expect(screen.getByRole("tab", { name: "目录树" })).toBeTruthy()
          expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()
          return
        }
        expect(screen.getByRole("button", { name: "启动 完整流程" })).toBeTruthy()
        expect(screen.queryByText("操作")).toBeNull()
        return
      }

      expect(screen.getByText("目录矩阵分析")).toBeTruthy()
      expect(screen.getByText("打包配置")).toBeTruthy()
      expect(screen.getByRole("tab", { name: "计划" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "目录树" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()
    },
  )

  test("uses clipboard input and runs the host backend action", async () => {
    surfaceState.mode = "compact"
    const host = createHost({ dryRun: true })
    const view = render(<Component compId="comp-repacku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴" }))
    expect(host.state.path).toBe("D:/library/book")
    view.rerender(<Component compId="comp-repacku" host={host} />)

    await user.click(screen.getByRole("button", { name: "启动 完整流程" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toMatchObject({
      nodeId: "repacku",
      input: {
        action: "full",
        path: "D:/library/book",
        dryRun: true,
      },
    })
    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.progress).toBe(100)
    expect(host.state.result?.plannedCount).toBe(1)
    expect(host.state.logs).toContain("Compression plan complete: 1 operation(s).")
  })

  test("switches the visible workflow tab before executing that workflow", async () => {
    surfaceState.mode = "compact"
    const host = createHost({ path: "D:/library", dryRun: true })
    const view = render(<Component compId="comp-repacku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("tab", { name: "分析" }))
    expect(host.state.action).toBe("analyze")
    view.rerender(<Component compId="comp-repacku" host={host} />)
    expect(screen.getByRole("tab", { name: "分析" }).getAttribute("aria-selected")).toBe("true")

    await user.click(screen.getByRole("button", { name: "启动 分析" }))
    await waitFor(() => expect(host.runCalls[0]?.input.action).toBe("analyze"))
  })

  test("persists backend failures as visible node state", async () => {
    surfaceState.mode = "regular"
    const host = createHost({ path: "D:/library", dryRun: true }, { fail: true })
    render(<Component compId="comp-repacku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "启动 完整流程", exact: true }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("Archive command failed.")
    expect(host.state.logs).toContain("Archive command failed.")
    expect(screen.getAllByText("失败").length).toBeGreaterThan(0)
  })

  test("renders analyzed folder tree with the visual file tree component", async () => {
    surfaceState.mode = "regular"
    const host = createHost({
      path: "D:/library",
      result: createRepackuData({ folderTree: createFolderTree() }),
    })
    render(<Component compId="comp-repacku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("tab", { name: "目录树" }))

    expect(screen.getByText(/library · 筛选 · 3 files/)).toBeTruthy()
    expect(screen.getByText(/book · 整包 · 2 files/)).toBeTruthy()
    expect(screen.getByText(".jpg x 2")).toBeTruthy()
  })

  test("moves operation, tree, and log panels below controls in portrait cards", () => {
    surfaceState.mode = "portrait"
    render(<Component compId="comp-repacku" host={createHost({
      path: "D:/library",
      logs: ["ready"],
      result: createRepackuData({ folderTree: createFolderTree() }),
    })} />)

    expect(screen.getByTestId("repacku-portrait-surface")).toBeTruthy()
    expect(screen.getByTestId("repacku-portrait-results")).toBeTruthy()
    expect(screen.getByRole("button", { name: "启动 完整流程" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "操作" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "目录树" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()
  })

  test("keeps the workflow tabs and execution button in the left work area", () => {
    surfaceState.mode = "expanded"
    render(<Component compId="comp-repacku" host={createHost({ path: "D:/library", action: "analyze" })} />)

    const toolbar = screen.getByTestId("repacku-header-toolbar")

    expect(toolbar.textContent).not.toContain("启动")
    expect(screen.getByRole("tablist", { name: "打包流程" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "分析" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("button", { name: "启动 分析" })).toBeTruthy()
    expect(screen.getByText("打包配置")).toBeTruthy()
  })
})

interface RepackuCardState {
  path?: string
  configPath?: string
  typesText?: string
  minCount?: number
  deleteAfter?: boolean
  dryRun?: boolean
  action?: RepackuInput["action"]
  phase?: string
  progress?: number
  progressText?: string
  result?: RepackuData | null
  logs?: string[]
}

type TestHost = NodeHostApi & {
  state: RepackuCardState
  runCalls: Array<{ nodeId: string; input: RepackuInput }>
}

function createHost(initial: RepackuCardState, options: { fail?: boolean } = {}): TestHost {
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
      run: async <TInput, TData>(nodeId: string, input: TInput, onEvent?: (event: { type: "progress" | "log"; progress?: number; message: string }) => void): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as RepackuInput })
        onEvent?.({ type: "progress", progress: 42, message: "Planning compression." })
        if (options.fail) {
          return {
            success: false,
            message: "Archive command failed.",
            data: createRepackuData({ failedCount: 1, errors: ["Archive command failed."] }),
          } as NodeRunResult<TData>
        }
        return {
          success: true,
          message: "Compression plan complete: 1 operation(s).",
          data: createRepackuData({ plannedCount: 1, totalOperations: 1 }),
        } as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/library/book",
      writeText: async () => undefined,
    },
    env: {
      theme: "light",
      platform: "web",
    },
    getNodeConfig: async () => ({ config: undefined, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async () => undefined,
  }
  return host
}

function createRepackuData(patch: Partial<RepackuData>): RepackuData {
  return {
    configPath: "D:/library/library_config.json",
    totalFolders: 2,
    entireCount: 1,
    selectiveCount: 0,
    skipCount: 1,
    plannedCount: 0,
    compressedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalOperations: 0,
    galleryCount: 0,
    folderTree: null,
    operations: [{
      mode: "entire",
      sourcePath: "D:/library/book",
      targetPath: "D:/library/book.zip",
      extensions: [],
      fileCount: 2,
      status: "planned",
      originalSize: 0,
      compressedSize: 0,
    }],
    errors: [],
    ...patch,
  }
}

function createFolderTree(): RepackuFolderNode {
  return {
    path: "D:/library",
    name: "library",
    parentPath: "D:",
    depth: 0,
    weight: 0,
    totalFiles: 3,
    totalSize: 2048,
    recursiveSize: 4096,
    sizeMb: 0.004,
    compressMode: "selective",
    recommendation: "Use selective compression.",
    fileTypes: { image: 2, text: 1 },
    fileExtensions: { ".txt": 1 },
    dominantTypes: ["image"],
    children: [{
      path: "D:/library/book",
      name: "book",
      parentPath: "D:/library",
      depth: 1,
      weight: 0,
      totalFiles: 2,
      totalSize: 2048,
      recursiveSize: 2048,
      sizeMb: 0.002,
      compressMode: "entire",
      recommendation: "Compress whole folder.",
      fileTypes: { image: 2 },
      fileExtensions: { ".jpg": 2 },
      dominantTypes: ["image"],
      children: [],
    }],
  }
}

function widthForMode(mode: NodeSurfaceMode): number {
  if (mode === "collapsed") return 240
  if (mode === "compact") return 420
  if (mode === "portrait") return 390
  if (mode === "regular") return 720
  if (mode === "expanded") return 920
  return 1120
}

function heightForMode(mode: NodeSurfaceMode): number {
  if (mode === "portrait") return 640
  return mode === "workspace" ? 720 : 360
}
