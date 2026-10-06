// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { TimeuData, TimeuInput } from "@xiranite/node-timeu/core"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { Component } from "./Component"
import { ACTIONS } from "./constants"
import type { TimeuCardState } from "./types"

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

describe("app-owned timeu Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with native TimeU UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-timeu" host={createHost({ pathsText: "D:/files/a.txt" })} />)

      expect(screen.getByText("TimeU")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("timeu-collapsed-view")).toBeTruthy()
        expect(screen.queryByLabelText("timeu paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("timeu paths")).toBeTruthy()
      expect(screen.getAllByRole("tab")).toHaveLength(3)
      expect(screen.queryByText(/python/i)).toBeNull()
      expect(screen.queryByText(/sourceRoot|moduleName/)).toBeNull()

      if (mode === "compact") {
        expect(screen.getByTestId("timeu-compact-view")).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("timeu-portrait-view")).toBeTruthy()
      } else {
        expect(screen.getByTestId("timeu-full-view")).toBeTruthy()
        expect(screen.getByTestId("timeu-header-toolbar")).toBeTruthy()
        expect(screen.getByRole("button", { name: ACTIONS[0]!.label })).toBeTruthy()
      }
    },
  )

  test("runs scan through host.runner.run and stores timestamp rows", async () => {
    setSurface("regular")
    const host = createHost({
      action: "scan",
      pathsText: "D:/files/a.txt",
      recordPath: "D:/files/timeu.json",
      dryRun: true,
      logs: [],
    })
    render(<Component compId="comp-timeu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[0]!.label }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "timeu",
      input: {
        action: "scan",
        paths: ["D:/files/a.txt"],
        recordPath: "D:/files/timeu.json",
        recursive: true,
        includeDirectories: false,
        dryRun: true,
      },
    })
    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
    expect(host.cardState.result?.records[0]?.path).toBe("D:/files/a.txt")
  })

  test("arms a fuse instead of executing the live backup on the first click", async () => {
    setSurface("regular")
    const host = createHost({ action: "backup", pathsText: "D:/files/a.txt", dryRun: false, logs: [] })
    render(<Component compId="comp-timeu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[1]!.label }))

    expect(host.runCalls).toHaveLength(0)
  })

  // Hazard 上膛 = 真执行 + 不追问：备份/恢复这类写盘动作一次点击直接发起。
  test("executes the live backup on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ action: "backup", pathsText: "D:/files/a.txt", dryRun: false, logs: [] })
    render(<Component compId="comp-timeu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[1]!.label }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("backup")
    expect(host.runCalls[0]?.input.dryRun).toBe(false)
  })

  test("marks the card as error when run has no paths", async () => {
    setSurface("regular")
    const host = createHost({ action: "scan", logs: [] })
    render(<Component compId="comp-timeu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: ACTIONS[0]!.label }))

    expect(host.runCalls).toHaveLength(0)
    await waitFor(() => expect(host.cardState.phase).toBe("error"))
    expect(host.cardState.progressText).toBeTruthy()
  })
})

type TestHost = NodeHostApi<TimeuCardState, Partial<TimeuCardState>> & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: TimeuInput }>
  savedConfig: Partial<TimeuCardState> | undefined
  cardState: TimeuCardState
}

function createHost(initial: TimeuCardState): TestHost {
  const stateCapability = {
    getData: () => host.cardState,
    patchData: (patch: Partial<TimeuCardState>) => {
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
        host.runCalls.push({ nodeId, input: input as TimeuInput })
        onEvent?.({ type: "progress", progress: 50, message: "Planning timestamp rows." })
        return {
          success: true,
          message: "TimeU planned 1 item.",
          data: timeuData as TData,
        }
      },
    },
    clipboard: {
      readText: async () => "D:/files/a.txt",
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
    saveNodeConfig: async (config) => { host.savedConfig = config as Partial<TimeuCardState> },
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

const timeuData: TimeuData = {
  plan: [
    {
      path: "D:/files/a.txt",
      operation: "backup",
      status: "pending",
      current: {
        path: "D:/files/a.txt",
        atimeMs: 1000,
        mtimeMs: 2000,
        ctimeMs: 3000,
        birthtimeMs: 4000,
        backedUpAt: "2026-01-01T00:00:00.000Z",
      },
    },
  ],
  records: [
    {
      path: "D:/files/a.txt",
      atimeMs: 1000,
      mtimeMs: 2000,
      ctimeMs: 3000,
      birthtimeMs: 4000,
      backedUpAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  recordPath: "D:/files/timeu.json",
  scannedCount: 1,
  backupCount: 0,
  restoredCount: 0,
  skippedCount: 0,
  errorCount: 0,
  errors: [],
}
