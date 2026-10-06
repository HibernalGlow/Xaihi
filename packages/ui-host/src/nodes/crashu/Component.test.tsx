// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { CrashuData, CrashuInput } from "@xiranite/node-crashu/core"
import { Component } from "./Component"
import type { CrashuCardState } from "./types"

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

describe("app-owned crashu Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Crashu-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-crashu" host={createHost({ sourcePathsText: "D:/source" })} />)

      expect(screen.getByText("Crashu")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("crashu-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/1 源/)).toBeTruthy()
        expect(screen.queryByLabelText("crashu source paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("crashu source paths")).toBeTruthy()
      if (mode === "compact" || mode === "portrait") {
      expect(screen.getByRole("tab", { name: /结果/ })).toBeTruthy()
      expect(screen.getByRole("tab", { name: /日志/ })).toBeTruthy()

      }

      if (mode === "compact") {
        expect(screen.getByTestId("crashu-compact-view")).toBeTruthy()
        expect(screen.getByRole("button", { name: "crashu advanced options" })).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("crashu-portrait-view")).toBeTruthy()
        expect(screen.getByTestId("crashu-primary-switches")).toBeTruthy()
      } else {
        expect(screen.getByTestId("crashu-full-view")).toBeTruthy()
        expect(screen.getByLabelText("crashu 预演切换")).toBeTruthy()
        expect(screen.getByTestId("crashu-header-toolbar")).toBeTruthy()
        expect(screen.getByTestId("crashu-source-panel")).toBeTruthy()
        expect(screen.getByTestId("crashu-match-matrix")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-crashu" host={createHost({ sourcePathsText: "D:/source" })} />)

    expect(screen.getByTestId("crashu-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("crashu source paths")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-crashu" host={createHost({ sourcePathsText: "D:/source" })} />)

    expect(screen.getByTestId("crashu-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("crashu-compact-view")).toBeNull()
  })

  test("opens advanced options from the compact surface", async () => {
    setSurface("compact")
    render(<Component compId="comp-crashu" host={createHost({ sourcePathsText: "D:/source" })} />)
    const user = userEvent.setup()

    expect(screen.queryByRole("spinbutton")).toBeNull()
    await user.click(screen.getByRole("button", { name: "crashu advanced options" }))

    expect(screen.getByRole("spinbutton")).toBeTruthy()
  })

  test("pastes source paths from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-crashu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴源目录" }))

    expect(host.state.sourcePathsText).toBe("D:/source")
  })

  test("runs plan through host.actions.run and stores matches", async () => {
    setSurface("regular")
    const host = createHost({ sourcePathsText: "D:/source", targetNamesText: "Alt Name", destinationPath: "D:/destination", dryRun: true, logs: [] })
    render(<Component compId="comp-crashu" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "生成计划" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "crashu",
      input: {
        action: "plan",
        sourcePaths: ["D:/source"],
        targetPath: undefined,
        targetNames: ["Alt Name"],
        destinationPath: "D:/destination",
        similarityThreshold: 0.6,
        autoMove: false,
        moveDirection: "to_target",
        conflictPolicy: "skip",
        dryRun: true,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.similarFound).toBe(1)
    expect(host.state.logs).toEqual([
      "[40%] Scanning source folders.",
      "Plan generated: 1 move(s).",
    ])
    expect(screen.getAllByText(/蜂蜜作品/).length).toBeGreaterThanOrEqual(1)
  })

  test("holds the real move behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")
    const initial = { sourcePathsText: "D:/source", targetNamesText: "Alt Name", destinationPath: "D:/destination", dryRun: false }

    // Hazard 未上膛：点击只点亮引信，真正的提交要等引信烧完（本用例不去烧它）。
    const guardedHost = createHost(initial)
    render(<Component compId="comp-crashu" host={guardedHost} />)
    const user = userEvent.setup()

    const trigger = screen.getByRole("button", { name: "真实移动" })
    await user.click(trigger)
    // 正控：点击确实落在了引信闸门的那颗按钮上，不是按钮缺失或事件没接上。
    expect(trigger.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")
    expect(guardedHost.runCalls).toHaveLength(0)

    cleanup()

    // Hazard 上膛：同一个触发的同一次点击直接发起移动。
    useWorkspaceStore.setState({ hazardMode: true })
    const hazardHost = createHost(initial)
    render(<Component compId="comp-crashu" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: "真实移动" }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("move")
    expect(hazardHost.runCalls[0]?.input.autoMove).toBe(true)
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: CrashuInput }>
  state: CrashuCardState
}

function createHost(initial: CrashuCardState): TestHost {
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
        onEvent?: (event: { type: "progress" | "log"; progress?: number; message: string }) => void,
      ): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as CrashuInput })
        onEvent?.({ type: "progress", progress: 40, message: "Scanning source folders." })
        return {
          success: true,
          message: "Plan generated: 1 move(s).",
          data: crashuData,
        } as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/source",
      writeText: async (text) => {
        host.copiedText = text
      },
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

const crashuData: CrashuData = {
  sourceCount: 1,
  targetCount: 1,
  totalScanned: 1,
  similarFound: 1,
  movedCount: 0,
  skippedCount: 0,
  errorCount: 0,
  pairsFile: "",
  similarFolders: [{
    name: "蜂蜜作品 [Alt Name]",
    path: "D:/source/蜂蜜作品 [Alt Name]",
    target: "Alt Name",
    similarity: 1,
    matchDim: "exact",
    matchSrc: "alt name",
    matchTgt: "alt name",
  }],
  plan: [{
    sourcePath: "D:/source/蜂蜜作品 [Alt Name]",
    targetName: "Alt Name",
    destinationPath: "D:/destination/Alt Name/蜂蜜作品 [Alt Name]",
    direction: "to_target",
    similarity: 1,
    status: "pending",
    reason: "matched",
  }],
  errors: [],
}
