// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeCapabilityId, NodeHostApi, NodeRunResult } from "@xiranite/contract"
import { NODE_HOST_CONTRACT_VERSION } from "@xiranite/contract"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import type { EngineVData, EngineVInput, EngineVWallpaper } from "@xiranite/node-enginev/core"
import { DEFAULT_WORKSHOP_PATH } from "@xiranite/node-enginev/defaults"
import { Component } from "./Component"
import type { EngineVCardState, EngineVNodeConfig, EngineVUiConfig } from "./types"

const surfaceState = vi.hoisted(() => ({
  mode: "regular" as NodeSurfaceMode,
  height: undefined as number | undefined,
}))

const configApi = vi.hoisted(() => ({
  exportConfig: vi.fn(),
  get: vi.fn(),
  getUi: vi.fn(),
}))

vi.mock("@/nodes/shared/useNodeSurface", () => ({
  useNodeSurface: () => ({
    ref: { current: null },
    width: widthForMode(surfaceState.mode),
    height: surfaceState.height ?? heightForMode(surfaceState.mode),
    mode: surfaceState.mode,
    density: surfaceState.mode === "collapsed" || surfaceState.mode === "compact" || surfaceState.mode === "portrait" ? "tight" : "roomy",
  }),
}))

vi.mock("@/nodes/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nodes/shared/api")>()
  return { ...actual, nodeConfigApi: { ...actual.nodeConfigApi, ...configApi } }
})

beforeEach(() => {
  configApi.get.mockResolvedValue({ config: undefined, path: "D:/config/xiranite.config.toml" })
  configApi.exportConfig.mockResolvedValue({ content: "", filename: "enginev.toml", mimeType: "application/toml" })
  configApi.getUi.mockResolvedValue({ config: undefined, path: "D:/config/xiranite.config.toml" })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  surfaceState.mode = "regular"
  surfaceState.height = undefined
})

describe("app-owned enginev Component", () => {
  test.each(["collapsed", "compact", "portrait", "regular", "expanded", "workspace"] as NodeSurfaceMode[])(
    "renders the %s surface with EngineV-specific UI",
    (mode) => {
      surfaceState.mode = mode
      render(<Component compId="comp-enginev" host={createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper] })} />)

      expect(screen.getByText("EngineV")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.queryByLabelText("Wallpaper Engine 工坊路径")).toBeNull()
        expect(screen.getByText(/1 可见/)).toBeTruthy()
        return
      }

      expect(screen.getByLabelText("Wallpaper Engine 工坊路径")).toBeTruthy()
      if (mode === "compact" || mode === "portrait") {
        if (mode === "portrait") {
          expect(screen.getByRole("tab", { name: "结果" })).toBeTruthy()
          expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()
        }
        expect(screen.getByText("预演")).toBeTruthy()
        expect(screen.getAllByText("复制").length).toBeGreaterThan(0)
        expect(screen.getByRole("button", { name: "筛选和选择" })).toBeTruthy()
        return
      }

      expect(screen.getAllByText("筛选").length).toBeGreaterThan(0)
      expect(screen.getByTestId("enginev-gallery-only")).toBeTruthy()
      expect(screen.getByRole("tab", { name: "结果" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()
      expect(screen.queryByRole("tab", { name: "画廊" })).toBeNull()
      expect(screen.getByText("已选中")).toBeTruthy()
      expect(screen.getByTestId("enginev-header-toolbar")).toBeTruthy()
    },
  )

  test("docks the action tray between execution switches and filter tabs", async () => {
    surfaceState.mode = "workspace"
    const host = createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper] })
    const view = render(<Component compId="comp-enginev" host={host} />)
    const user = userEvent.setup()

    expect(screen.getByTestId("enginev-workspace-view")).toBeTruthy()
    expect(screen.getByTestId("enginev-workspace-controls")).toBeTruthy()
    const controls = screen.getByTestId("enginev-workspace-controls")
    const gallery = screen.getByTestId("enginev-gallery-only")
    expect(controls.contains(screen.getByTestId("enginev-workspace-output"))).toBe(true)
    expect(controls.contains(screen.getByRole("button", { name: "enginev gallery display settings" }))).toBe(true)
    expect(gallery.querySelector('[role="tablist"]')).toBeNull()
    expect(gallery.querySelector("button[aria-label='enginev gallery display settings']")).toBeNull()
    expect(screen.getByTestId("enginev-floating-actions").className).toContain("absolute")
    expect(screen.getByTestId("enginev-floating-actions").className).toContain("pointer-events-auto")
    expect(screen.getByRole("button", { name: "Move action tray" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Dock action tray" }))
    expect(host.cardState.actionTrayPinned).toBe(true)
    await waitFor(() => expect(host.savedUiConfig).toEqual({ actionTrayPinned: true }))
    const dockedTray = screen.getByTestId("enginev-floating-actions")
    expect(dockedTray.getAttribute("data-pinned")).toBe("true")
    expect(dockedTray.className).toContain("relative")
    expect(dockedTray.className).toContain("w-full")
    expect(screen.getByTestId("enginev-workspace-controls").contains(dockedTray)).toBe(true)
    expect(dockedTray.previousElementSibling?.querySelectorAll('[role="switch"]').length).toBe(2)
    expect(dockedTray.nextElementSibling?.querySelector('[role="tablist"]')).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Move action tray" })).toBeNull()
    expect(screen.getByRole("button", { name: "Undock action tray" })).toBeTruthy()

    surfaceState.mode = "regular"
    view.rerender(<Component compId="comp-enginev" host={host} />)
    expect(screen.getByTestId("enginev-floating-actions").getAttribute("data-pinned")).toBe("true")

    view.unmount()
    surfaceState.mode = "workspace"
    render(<Component compId="comp-enginev" host={host} />)
    expect(screen.getByTestId("enginev-floating-actions").getAttribute("data-pinned")).toBe("true")
  })

  test("renders the regular floating tray as icon-only controls without reserved bottom padding", () => {
    surfaceState.mode = "regular"
    render(<Component compId="comp-enginev" host={createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper] })} />)

    const tray = screen.getByTestId("enginev-floating-actions")
    expect(tray.querySelectorAll(".sr-only").length).toBeGreaterThan(1)
    expect(screen.getByRole("tabpanel").className).not.toContain("pb-20")
  })

  // 默认工坊路径只有一个声明处（`@xiranite/node-enginev/defaults`），GUI 不再值导入 core 才拿得到它。
  // 这两条断言钉住「那份词表确实投到了界面上」：占位符是它、一键回落写回的也是它。
  test("shows the node default workshop path as the placeholder and patches the same value on reset", async () => {
    surfaceState.mode = "regular"
    const host = createHost({ wallpapers: [wallpaper] })
    render(<Component compId="comp-enginev" host={host} />)
    const user = userEvent.setup()

    expect(screen.getByLabelText<HTMLInputElement>("Wallpaper Engine 工坊路径").placeholder).toBe(DEFAULT_WORKSHOP_PATH)

    await user.click(screen.getByRole("button", { name: "enginev use default path" }))
    expect(host.cardState.workshopPath).toBe(DEFAULT_WORKSHOP_PATH)
  })

  test("falls back to a collapsed summary when compact height is extremely short", () => {
    surfaceState.mode = "compact"
    surfaceState.height = 140
    render(<Component compId="comp-enginev" host={createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper] })} />)

    expect(screen.getByText("EngineV")).toBeTruthy()
    expect(screen.getByText(/1 可见/)).toBeTruthy()
    expect(screen.queryByLabelText("Wallpaper Engine 工坊路径")).toBeNull()
    expect(screen.getByRole("button", { name: "快速扫描" })).toBeTruthy()
  })

  test("moves result and log tabs below the gallery in portrait cards", () => {
    surfaceState.mode = "portrait"
    render(<Component compId="comp-enginev" host={createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper], logs: ["ready"] })} />)

    expect(screen.getByLabelText("Wallpaper Engine 工坊路径")).toBeTruthy()
    expect(screen.getByText("预演")).toBeTruthy()
    expect(screen.getAllByText("复制").length).toBeGreaterThan(0)
    expect(screen.getByText("1 个可见项目")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "结果" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()
  })

  test.each(["compact", "portrait", "regular", "expanded"] as NodeSurfaceMode[])(
    "does not reserve content space for the separate window titlebar in %s mode",
    (mode) => {
      surfaceState.mode = mode
      render(<Component compId="comp-enginev" host={createHost({ workshopPath: "D:/workshop" })} />)

      expect(screen.getByTestId("enginev-window-caption-row").className).not.toContain("[.xiranite-floating-window_&]:pr-36")
      expect(screen.getByTestId("enginev-window-caption-row").dataset.floatingWindowDragRow).toBe("true")
    },
  )

  test("does not reserve caption width inside the workspace side column", () => {
    surfaceState.mode = "workspace"
    render(<Component compId="comp-enginev" host={createHost({ workshopPath: "D:/workshop" })} />)

    expect(screen.getByTestId("enginev-window-caption-row").className).not.toContain("[.xiranite-floating-window_&]:pr-36")
  })

  test("runs scan through host.runner.run and renders local preview images", async () => {
    surfaceState.mode = "regular"
    const host = createHost({
      workshopPath: "D:/workshop",
      titleFilter: "Ocean",
      ratingFilter: "Everyone",
      typeFilter: "Video",
      logs: [],
    })
    render(<Component compId="comp-enginev" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "运行 扫描" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "enginev",
      input: {
        action: "scan",
        path: "D:/workshop",
        filters: {
          title: "Ocean",
          contentRating: "Everyone",
          type: "Video",
        },
        ids: undefined,
        template: undefined,
        dryRun: true,
        permanent: false,
        copyMode: false,
        targetPath: undefined,
        exportPath: undefined,
        exportFormat: "json",
        wallpapers: undefined,
      },
    })

    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
    expect(host.cardState.logs).toEqual(["[100%] Scan complete.", "Scan complete: 1 wallpaper(s)."])
    expect(host.localFilePaths).toContain("D:/workshop/111/preview.png")

    const image = screen.getByAltText("Ocean Loop") as HTMLImageElement
    expect(image.dataset.enginevPreview).toBe("true")
    expect(image.getAttribute("src")).toBe("http://local.test/local-files?path=D%3A%2Fworkshop%2F111%2Fpreview.png")
  })

  test("applies gallery filters live without running a filter workflow", () => {
    surfaceState.mode = "workspace"
    const host = createHost({ action: "scan", workshopPath: "D:/workshop", titleFilter: "Ocean", wallpapers: [wallpaper] })
    const view = render(<Component compId="comp-enginev" host={host} />)

    expect(screen.getByAltText("Ocean Loop")).toBeTruthy()
    host.cardState.titleFilter = "not-a-match"
    view.rerender(<Component compId="comp-enginev" host={host} />)
    expect(screen.queryByAltText("Ocean Loop")).toBeNull()
    expect(host.runCalls).toHaveLength(0)
    expect(screen.queryByRole("tab", { name: "筛选结果" })).toBeNull()
  })

  test("switches the EngineV workflow tab before running the selected workflow", async () => {
    surfaceState.mode = "compact"
    const host = createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper] })
    const view = render(<Component compId="comp-enginev" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("tab", { name: "重命名计划" }))
    expect(host.cardState.action).toBe("rename")
    view.rerender(<Component compId="comp-enginev" host={host} />)
    expect(screen.getByRole("tab", { name: "重命名计划" }).getAttribute("aria-selected")).toBe("true")

    await user.click(screen.getByRole("button", { name: "运行 重命名" }))
    await waitFor(() => expect(host.runCalls[0]?.input.action).toBe("rename"))
  })

  test("selects gallery items and copies their paths without text-only rows", async () => {
    surfaceState.mode = "expanded"
    const host = createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper] })
    render(<Component compId="comp-enginev" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "选择 Ocean Loop" }))
    expect(host.cardState.idsText).toBe("111")

    await user.click(screen.getByRole("button", { name: "复制 Ocean Loop 路径" }))
    expect(host.copiedText).toBe("D:/workshop/111")
  })

  test("exposes contract metadata and reports supported capabilities", () => {
    const host = createHost({ workshopPath: "D:/workshop" })
    expect(host.contract.name).toBe("xiranite.node-host")
    expect(host.contract.version).toBe(NODE_HOST_CONTRACT_VERSION)
    expect(host.contract.hasCapability("runner")).toBe(true)
    expect(host.contract.hasCapability("localFiles")).toBe(true)
    expect(host.contract.hasCapability("downloads")).toBe(false)

    const noRunnerHost = createHost({ workshopPath: "D:/workshop" }, { noRunner: true })
    expect(noRunnerHost.contract.hasCapability("runner")).toBe(false)
    expect(noRunnerHost.contract.hasCapability("localFiles")).toBe(true)
  })

  test("migrates existing gallery display state into node ui config", async () => {
    surfaceState.mode = "regular"
    const host = createHost({
      workshopPath: "D:/workshop",
      galleryColumns: 4,
      galleryCompact: true,
      galleryShowMeta: false,
      galleryShowPath: true,
    })
    render(<Component compId="comp-enginev" host={host} />)

    await waitFor(() => expect(host.savedUiConfig).toEqual({
      galleryColumns: 4,
      galleryCompact: true,
      galleryShowMeta: false,
      galleryShowPath: true,
    }))
  })

  test("restores the action tray dock preference from node ui config", async () => {
    surfaceState.mode = "workspace"
    const host = createHost({ workshopPath: "D:/workshop", wallpapers: [wallpaper] }, {
      uiConfig: { actionTrayPinned: true },
    })
    render(<Component compId="comp-enginev" host={host} />)

    await waitFor(() => expect(screen.getByTestId("enginev-floating-actions").getAttribute("data-pinned")).toBe("true"))
    expect(host.cardState.actionTrayPinned).toBe(true)
  })

  test("saves gallery display preferences with default config", async () => {
    surfaceState.mode = "regular"
    const uiConfig: EngineVUiConfig = {
      actionTrayPinned: false,
      galleryColumns: 4,
      galleryCompact: true,
      galleryShowMeta: false,
      galleryShowPath: true,
    }
    const host = createHost({
      workshopPath: "D:/workshop",
      outputPath: "D:/exports/wallpapers.json",
      template: "{title} [{id}]",
      ...uiConfig,
    }, { uiConfig })
    render(<Component compId="comp-enginev" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "enginev 配置中心" }))
    await user.click(screen.getByRole("button", { name: "保存为默认配置" }))

    await waitFor(() => expect(host.savedConfig).toEqual({
      workshopPath: "D:/workshop",
      outputPath: "D:/exports/wallpapers.json",
      template: "{title} [{id}]",
    }))
    expect(host.savedUiConfig).toEqual(uiConfig)
    expect(host.saveUiCalls).toEqual([uiConfig])
  })

  test("marks the card as error when the runner is unavailable", async () => {
    surfaceState.mode = "regular"
    const host = createHost({ workshopPath: "D:/workshop" }, { noRunner: true })
    render(<Component compId="comp-enginev" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "运行 扫描" }))

    await waitFor(() => expect(host.cardState.phase).toBe("error"))
    expect(host.cardState.progressText).toContain("暂不可用")
    expect(host.cardState.logs?.at(-1)).toContain("暂不可用")
    expect(host.runCalls).toHaveLength(0)
  })
})

type TestHost = NodeHostApi<EngineVCardState, EngineVNodeConfig> & {
  cardState: EngineVCardState
  savedConfig: EngineVNodeConfig | undefined
  savedUiConfig: EngineVUiConfig | undefined
  saveUiCalls: EngineVUiConfig[]
  runCalls: Array<{ nodeId: string; input: EngineVInput }>
  copiedText: string
  localFilePaths: string[]
}

type HostOptions = {
  noRunner?: boolean
  config?: EngineVNodeConfig
  uiConfig?: EngineVUiConfig
}

function createHost(initial: EngineVCardState, options: HostOptions = {}): TestHost {
  const run = async <TInput, TData>(
    nodeId: string,
    input: TInput,
    onEvent?: (event: { type: "progress" | "log"; progress?: number; message: string }) => void,
  ): Promise<NodeRunResult<TData>> => {
    host.runCalls.push({ nodeId, input: input as EngineVInput })
    onEvent?.({ type: "progress", progress: 100, message: "Scan complete." })
    return {
      success: true,
      message: "Scan complete: 1 wallpaper(s).",
      data: enginevData,
    } as NodeRunResult<TData>
  }

  const supportedCapabilities: readonly NodeCapabilityId[] = options.noRunner
    ? ["contract", "state", "workspace", "clipboard", "localFiles", "config", "env"]
    : ["contract", "state", "workspace", "runner", "clipboard", "localFiles", "config", "env"]

  const stateCapability = {
    getData: () => host.cardState,
    patchData: (patch: Partial<EngineVCardState>) => {
      host.cardState = { ...host.cardState, ...patch }
    },
  }

  const host: TestHost = {
    contract: {
      name: "xiranite.node-host",
      version: NODE_HOST_CONTRACT_VERSION,
      supportedCapabilities,
      hasCapability: (capability) => supportedCapabilities.includes(capability),
    },
    state: stateCapability,
    runner: options.noRunner ? undefined : { run },
    clipboard: {
      readText: async () => "D:/workshop",
      writeText: async (text) => {
        host.copiedText = text
      },
    },
    localFiles: {
      getUrl: (path) => {
        host.localFilePaths.push(path)
        return `http://local.test/local-files?path=${encodeURIComponent(path)}`
      },
    },
    env: {
      theme: "light",
      platform: "web",
    },
    config: {
      get: async () => ({ config: options.config, path: "D:/config/xiranite.config.toml" }),
      save: async (config) => {
        host.savedConfig = config as EngineVNodeConfig
      },
      getUi: async () => ({ config: options.uiConfig, path: "D:/config/xiranite.config.toml" }),
      saveUi: async (config) => {
        host.savedUiConfig = config as EngineVUiConfig
        host.saveUiCalls.push(config as EngineVUiConfig)
      },
    },
    cardState: { ...initial },
    savedConfig: undefined,
    savedUiConfig: undefined,
    saveUiCalls: [],
    runCalls: [],
    copiedText: "",
    localFilePaths: [],

    // Deprecated compatibility aliases — mapped onto the capability domains so
    // unmigrated call sites keep working. Removed once every node uses host.state.
    getData: <T,>() => stateCapability.getData() as T | undefined,
    patchData: (_compId, patch) => stateCapability.patchData(patch),
    listComponents: () => [],
    updateComponent: () => undefined,
    actions: options.noRunner ? undefined : { run },
    getNodeConfig: async () => ({ config: options.config, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async (config) => {
      host.savedConfig = config as EngineVNodeConfig
    },
    getNodeUiConfig: async () => ({ config: options.uiConfig, path: "D:/config/xiranite.config.toml" }),
    saveNodeUiConfig: async (config) => {
      host.savedUiConfig = config as EngineVUiConfig
      host.saveUiCalls.push(config as EngineVUiConfig)
    },
  }
  return host
}

const wallpaper: EngineVWallpaper = {
  path: "D:/workshop/111",
  folderName: "111",
  workshopId: "111",
  title: "Ocean Loop",
  description: "calm motion",
  contentRating: "Everyone",
  ratingSex: "",
  ratingViolence: "",
  tags: ["test"],
  fileName: "scene.mp4",
  preview: "preview.png",
  wallpaperType: "Video",
  createdTime: "2026-01-01T00:00:00.000Z",
  modifiedTime: "2026-01-01T00:00:00.000Z",
  size: 1024,
  projectData: {},
}

const enginevData: EngineVData = {
  wallpapers: [wallpaper],
  filteredWallpapers: [wallpaper],
  totalCount: 1,
  filteredCount: 1,
  successCount: 0,
  failedCount: 0,
  typeStats: { Video: 1 },
  ratingStats: { Everyone: 1 },
  renameResults: [],
  deleteResults: [],
  exportPath: "",
  errors: [],
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
  if (mode === "collapsed") return 120
  if (mode === "compact") return 260
  if (mode === "portrait") return 640
  if (mode === "expanded") return 560
  if (mode === "workspace") return 720
  return 420
}
