// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { LinkuData, LinkuInput } from "@xiranite/node-linku/core"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { ACTIONS } from "./constants"
import { Component } from "./Component"
import type { LinkuCardState } from "./types"

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

describe("app-owned linku Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)("renders the %s surface with Linku-specific UI", (mode) => {
    setSurface(mode)
    render(<Component compId="comp-linku" host={createHost({ path: "D:/actual", target: "D:/link" })} />)

    expect(screen.getByText("Linku")).toBeTruthy()
    if (mode === "collapsed") {
      expect(screen.getByTestId("linku-collapsed-view")).toBeTruthy()
      expect(screen.queryByLabelText("源路径")).toBeNull()
      return
    }

    expect(screen.getByLabelText("源路径")).toBeTruthy()
    expect(screen.getByLabelText("目标/链接")).toBeTruthy()
    expect(screen.getByRole("tab", { name: /链接/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /路径/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /日志/ })).toBeTruthy()

    if (mode === "compact") {
      expect(screen.getByTestId("linku-compact-view")).toBeTruthy()
      expect(screen.getByRole("button", { name: "linku advanced options" })).toBeTruthy()
    } else if (mode === "portrait") {
      expect(screen.getByTestId("linku-portrait-view")).toBeTruthy()
      expect(screen.getByTestId("linku-action-bar")).toBeTruthy()
    } else {
      expect(screen.getByTestId("linku-full-view")).toBeTruthy()
      expect(screen.getByTestId("linku-header-toolbar")).toBeTruthy()
      expect(screen.getAllByText("进度").length).toBeGreaterThan(0)
    }
  })

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-linku" host={createHost({ path: "D:/actual", target: "D:/link" })} />)

    expect(screen.getByTestId("linku-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("源路径")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-linku" host={createHost({ path: "D:/actual", target: "D:/link" })} />)

    expect(screen.getByTestId("linku-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("linku-compact-view")).toBeNull()
  })

  test("pastes paths and runs the info action through the host backend", async () => {
    setSurface("compact")
    const host = createHost({})
    const view = render(<Component compId="comp-linku" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getAllByRole("button", { name: "粘贴" })[0])
    expect(host.state.path).toBe("D:/actual")
    view.rerender(<Component compId="comp-linku" host={host} />)

    await user.click(screen.getByRole("button", { name: actionLabel("info") }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "linku",
      input: {
        action: "info",
        path: "D:/actual",
        target: undefined,
        configPath: undefined,
      },
    })
    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.pathInfo?.path).toBe("D:/actual")
    expect(host.state.logs).toEqual([
      "[20%] Inspecting path.",
      "Path metadata ready.",
      "[100%] Linku action complete.",
      "Path info loaded.",
    ])
  })

  test("holds the destructive create behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")
    const guardedHost = createHost({ path: "D:/actual", target: "D:/link" })
    render(<Component compId="comp-linku" host={guardedHost} />)
    const user = userEvent.setup()

    // Hazard 未上膛：这一次点击只点亮引信，执行要等引信烧完（本用例不去烧它）。
    const trigger = screen.getByRole("button", { name: actionLabel("create") })
    await user.click(trigger)
    // 正控：点击确实落在了引信闸门的那颗按钮上，不是按钮缺失或事件没接上。
    expect(trigger.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")
    expect(guardedHost.runCalls).toHaveLength(0)

    cleanup()

    // Hazard 上膛：同一个触发的同一次点击直接发起运行。
    useWorkspaceStore.setState({ hazardMode: true })
    const hazardHost = createHost({ path: "D:/actual", target: "D:/link" })
    render(<Component compId="comp-linku" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: actionLabel("create") }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("create")
    expect(hazardHost.runCalls[0]?.input.path).toBe("D:/actual")
    expect(hazardHost.runCalls[0]?.input.target).toBe("D:/link")
  })

  test("persists failed and thrown backend results as visible node state", async () => {
    setSurface("regular")
    const failedHost = createHost({ path: "D:/actual" }, { runResult: { success: false, message: "Path missing.", data: linkuData } })
    render(<Component compId="failed-linku" host={failedHost} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: actionLabel("info") }))

    await waitFor(() => expect(failedHost.state.phase).toBe("error"))
    expect(failedHost.state.progressText).toBe("Path missing.")
    expect(failedHost.state.logs?.at(-1)).toBe("Path missing.")

    cleanup()

    const thrownHost = createHost({ path: "D:/actual" }, { runError: new Error("backend offline") })
    render(<Component compId="thrown-linku" host={thrownHost} />)

    await user.click(screen.getByRole("button", { name: actionLabel("info") }))

    await waitFor(() => expect(thrownHost.state.phase).toBe("error"))
    expect(thrownHost.state.progressText).toBe("backend offline")
    expect(thrownHost.state.logs?.at(-1)).toBe("backend offline")
  })

  test("uses shared configuration management controls", async () => {
    setSurface("regular")
    const host = createHost(
      { path: "D:/current", target: "D:/link" },
      { config: { path: "D:/default", target: "D:/default-link", configPath: "D:/linku.toml" } },
    )
    render(<Component compId="comp-linku" host={host} />)
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByRole("button", { name: "配置管理" }).className).toContain("bg-secondary"))
    await user.click(screen.getByRole("button", { name: "配置管理" }))
    await user.click(screen.getByRole("button", { name: "恢复默认" }))
    expect(host.state.path).toBe("D:/default")
    expect(host.state.target).toBe("D:/default-link")
    expect(host.state.configPath).toBe("D:/linku.toml")

    await user.click(screen.getByRole("button", { name: "保存为默认" }))
    expect(host.savedConfig).toEqual({ path: "D:/default", target: "D:/default-link", configPath: "D:/linku.toml" })

    await user.click(screen.getByRole("button", { name: "打开文件" }))
    expect(host.openConfigFileCalls).toBe(1)
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  openConfigFileCalls: number
  runCalls: Array<{ nodeId: string; input: LinkuInput }>
  savedConfig: Partial<LinkuCardState> | undefined
  state: LinkuCardState
}

type HostOptions = {
  config?: Partial<LinkuCardState>
  runError?: Error
  runResult?: NodeRunResult<LinkuData>
}

function createHost(initial: LinkuCardState, options: HostOptions = {}): TestHost {
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
        host.runCalls.push({ nodeId, input: input as LinkuInput })
        if (options.runError) throw options.runError
        onEvent?.({ type: "progress", progress: 20, message: "Inspecting path." })
        onEvent?.({ type: "log", message: "Path metadata ready." })
        onEvent?.({ type: "progress", progress: 100, message: "Linku action complete." })
        return (options.runResult ?? {
          success: true,
          message: "Path info loaded.",
          data: linkuData,
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/actual",
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
      host.savedConfig = config as Partial<LinkuCardState>
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

function actionLabel(action: LinkuInput["action"]): string {
  return ACTIONS.find((item) => item.value === action)?.label ?? String(action)
}

const linkuData: LinkuData = {
  pathInfo: {
    path: "D:/actual",
    exists: true,
    kind: "dir",
    isSymlink: false,
    targetExists: undefined,
    sizeMb: 12.5,
    fileCount: 8,
  },
  links: [
    {
      link: "D:/link",
      target: "D:/actual",
      type: "directory",
      createdAt: "2026-07-08T00:00:00.000Z",
    },
  ],
  created: true,
  recoveredCount: 0,
  restoredCount: 0,
  failedCount: 0,
  importedCount: 0,
  skippedCount: 0,
}
