// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { NameuData, NameuInput } from "@xiranite/node-nameu/core"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { Component } from "./Component"
import { ACTIONS } from "./constants"
import type { NameuCardState } from "./types"

const surfaceState = vi.hoisted(() => ({ height: 420, width: 720 }))

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

describe("app-owned nameu Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with native NameU UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-nameu" host={createHost({ pathsText: "D:/archives" })} />)

      expect(screen.getByText("NameU")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("nameu-collapsed-view")).toBeTruthy()
        expect(screen.queryByLabelText("nameu paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("nameu paths")).toBeTruthy()
      expect(screen.getAllByRole("tab")).toHaveLength(8)
      expect(within(screen.getByRole("tablist", { name: "路径模式" })).getAllByRole("tab")).toHaveLength(2)
      expect(within(screen.getByRole("tablist", { name: "改名动作" })).getAllByRole("tab")).toHaveLength(3)
      expect(screen.queryByText(/python/i)).toBeNull()
      expect(screen.queryByText(/sourceRoot|moduleName/)).toBeNull()

      if (mode === "compact") {
        expect(screen.getByTestId("nameu-compact-view")).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("nameu-portrait-view")).toBeTruthy()
      } else {
        expect(screen.getByTestId("nameu-full-view")).toBeTruthy()
        expect(screen.getByTestId("nameu-header-toolbar")).toBeTruthy()
        expect(screen.getByRole("button", { name: ACTIONS[1]!.label })).toBeTruthy()
      }
    },
  )

  test("runs plan through host.runner.run and stores rename items", async () => {
    setSurface("regular")
    const host = createHost({ action: "plan", pathsText: "D:/archives", mode: "multi", dryRun: true, logs: [] })
    render(<Component compId="comp-nameu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[1]!.label }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "nameu",
      input: {
        action: "plan",
        paths: ["D:/archives"],
        mode: "multi",
        recursive: true,
        addArtistName: true,
        normalizeFolders: true,
        keepTimestamp: true,
        dryRun: true,
      },
    })
    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
    expect(host.cardState.result?.items[0]?.targetName).toBe("BookArtist.zip")
  })

  test("renders a filename diff instead of repeating unchanged names as a before/after pair", () => {
    setSurface("regular")
    render(<Component compId="comp-nameu" host={createHost({ pathsText: "D:/archives", result: {
      ...nameuData,
      items: [
        ...nameuData.items,
        { ...nameuData.items[0]!, sourceName: "Already named.zip", targetName: "Already named.zip", status: "unchanged" },
      ],
    } })} />)

    expect(screen.getAllByText("原").length).toBeGreaterThan(0)
    expect(screen.getAllByText("新").length).toBeGreaterThan(0)
    expect(screen.getAllByText("无需改名").length).toBeGreaterThan(0)
  })

  test("uses shared configuration management and official tabs for its two choice sets", async () => {
    setSurface("regular")
    const host = createHost({ pathsText: "D:/archives", logs: [] })
    render(<Component compId="comp-nameu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("tab", { name: ACTIONS[0]!.shortLabel }))
    expect(host.cardState.action).toBe("scan")

    await user.click(screen.getByRole("tab", { name: "单个作者" }))
    expect(host.cardState.mode).toBe("single")

    await user.click(screen.getByLabelText("配置管理"))
    expect(screen.getByRole("button", { name: "保存为默认" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy()
  })

  test("arms the fuse without executing the live rename on the first click", async () => {
    setSurface("regular")
    const host = createHost({ action: "rename", pathsText: "D:/archives", dryRun: false, logs: [] })
    render(<Component compId="comp-nameu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[2]!.label }))

    expect(host.runCalls).toHaveLength(0)
  })

  // Hazard 上膛 = 真执行 + 不追问：同一次点击直接发起运行，不再有第二次动作。
  test("executes the live rename on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ action: "rename", pathsText: "D:/archives", dryRun: false, logs: [] })
    render(<Component compId="comp-nameu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[2]!.label }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("rename")
    expect(host.runCalls[0]?.input.dryRun).toBe(false)
  })

  test("marks the card as error when run has no paths", async () => {
    setSurface("regular")
    const host = createHost({ action: "plan", logs: [] })
    render(<Component compId="comp-nameu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[1]!.label }))

    expect(host.runCalls).toHaveLength(0)
    await waitFor(() => expect(host.cardState.phase).toBe("error"))
    expect(host.cardState.progressText).toBeTruthy()
  })
})

type TestHost = NodeHostApi<NameuCardState, Partial<NameuCardState>> & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: NameuInput }>
  savedConfig: Partial<NameuCardState> | undefined
  cardState: NameuCardState
}

function createHost(initial: NameuCardState): TestHost {
  const stateCapability = {
    getData: () => host.cardState,
    patchData: (patch: Partial<NameuCardState>) => {
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
    env: { theme: "light", platform: "web" },
    state: stateCapability,
    runner: {
      run: async <TInput, TData>(
        nodeId: string,
        input: TInput,
        onEvent?: (event: NodeRunEvent) => void,
      ): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as NameuInput })
        onEvent?.({ type: "progress", progress: 50, message: "Planning rename items." })
        return {
          success: true,
          message: "NameU planned 1 item.",
          data: nameuData as TData,
        }
      },
    },
    clipboard: {
      readText: async () => "D:/archives",
      writeText: async (text) => { host.copiedText = text },
    },
    config: {
      get: async () => ({ config: undefined, path: "D:/config/xiranite.config.toml" }),
      save: async (config) => { host.savedConfig = config },
      openFile: () => undefined,
    },
    getData: <T,>() => stateCapability.getData() as T | undefined,
    patchData: (_compId, patch) => stateCapability.patchData(patch),
    listComponents: () => [],
    updateComponent: () => undefined,
    actions: undefined,
    getNodeConfig: async <T,>() => ({ config: undefined as T | undefined, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async (config) => { host.savedConfig = config as Partial<NameuCardState> },
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

const nameuData: NameuData = {
  action: "plan",
  mode: "multi",
  items: [
    {
      sourcePath: "D:/archives/Artist/Book [cbr].zip",
      targetPath: "D:/archives/Artist/BookArtist.zip",
      sourceName: "Book [cbr].zip",
      targetName: "BookArtist.zip",
      artistName: "Artist",
      kind: "archive",
      status: "ready",
    },
  ],
  scannedCount: 1,
  readyCount: 1,
  renamedCount: 0,
  unchangedCount: 0,
  skippedCount: 0,
  conflictCount: 0,
  errorCount: 0,
  errors: [],
}
