// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { SleeptData, SleeptInput } from "@xiranite/node-sleept/core"
import { Component } from "./Component"
import type { SleeptCardState } from "./types"

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

describe("app-owned sleept Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Sleept-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-sleept" host={createHost({ timerMode: "countdown", seconds: 5 })} />)

      expect(screen.getByText("Sleept")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("sleept-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/倒计时 \/ 休眠 \/ 演练/)).toBeTruthy()
        expect(screen.queryByTestId("sleept-timer-modes")).toBeNull()
        return
      }

      expect(screen.getByTestId("sleept-timer-modes")).toBeTruthy()
      expect(screen.getByTestId("sleept-power-modes")).toBeTruthy()
      expect(screen.getByRole("group", { name: "触发模式" })).toBeTruthy()
      expect(screen.getByRole("tablist", { name: "电源动作" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "状态" })).toBeTruthy()
      expect(screen.getByRole("tab", { name: "日志" })).toBeTruthy()

      if (mode === "compact") {
        expect(screen.getByTestId("sleept-compact-view")).toBeTruthy()
        expect(screen.getByRole("button", { name: "sleept advanced options" })).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("sleept-portrait-view")).toBeTruthy()
        expect(screen.getByTestId("sleept-key-switches")).toBeTruthy()
      } else {
        expect(screen.getByTestId("sleept-full-view")).toBeTruthy()
        expect(screen.getByText("触发序列")).toBeTruthy()
        expect(screen.getByText("执行动作")).toBeTruthy()
        expect(screen.getByTestId("sleept-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-sleept" host={createHost({ timerMode: "countdown", seconds: 5 })} />)

    expect(screen.getByTestId("sleept-collapsed-view")).toBeTruthy()
    expect(screen.queryByTestId("sleept-timer-modes")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-sleept" host={createHost({ timerMode: "countdown", seconds: 5 })} />)

    expect(screen.getByTestId("sleept-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("sleept-compact-view")).toBeNull()
  })

  test("runs countdown through host.actions.run and stores progress and logs", async () => {
    setSurface("regular")
    const host = createHost({ timerMode: "countdown", seconds: 5, dryrun: true, logs: [] })
    render(<Component compId="comp-sleept" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "开始演练" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "sleept",
      input: {
        action: "countdown",
        powerMode: "sleep",
        hours: 0,
        minutes: 0,
        seconds: 5,
        targetDatetime: undefined,
        uploadThreshold: 242,
        downloadThreshold: 242,
        netDuration: 2,
        netTriggerMode: "both",
        cpuThreshold: 10,
        cpuDuration: 2,
        dryrun: true,
        maxWaitSeconds: 3600,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.progress).toBe(100)
    expect(host.state.stats).toEqual({ cpu: 12.3, upload: 4.5, download: 6.7 })
    expect(host.state.logs?.at(-1)).toBe("Countdown completed; simulated sleep.")
  })

  test("refreshes stats via get_stats action and updates the stats panel", async () => {
    setSurface("regular")
    const host = createHost({ timerMode: "cpu", logs: [] })
    render(<Component compId="comp-sleept" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "刷新状态" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("get_stats")
    await waitFor(() => expect(host.state.stats?.cpu).toBe(88.8))
  })

  test("marks the card as error when the runner returns a failed response", async () => {
    setSurface("regular")
    const host = createHost(
      { timerMode: "countdown", seconds: 5, logs: [] },
      { runResult: { success: false, message: "Countdown duration must be greater than zero.", data: { ...sleeptData, timerStatus: "idle" } } },
    )
    render(<Component compId="comp-sleept" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "开始演练" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("Countdown duration must be greater than zero.")
  })

  test("catches thrown runner errors and appends the message to logs", async () => {
    setSurface("regular")
    const host = createHost({ timerMode: "countdown", seconds: 5, logs: [] }, { runError: new Error("backend offline") })
    render(<Component compId="comp-sleept" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "开始演练" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("backend offline")
    expect(host.state.logs?.at(-1)).toBe("backend offline")
  })

  test("holds real execution behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")
    const initial = { timerMode: "countdown" as const, seconds: 5, dryrun: false, logs: [] }

    // Hazard 未上膛：点击只点亮引信，真正的提交要等引信烧完（本用例不去烧它）。
    const guardedHost = createHost(initial)
    render(<Component compId="comp-sleept" host={guardedHost} />)
    const user = userEvent.setup()

    const trigger = screen.getByRole("button", { name: "开始执行" })
    await user.click(trigger)
    // 正控：点击确实落在了引信闸门的那颗按钮上，不是按钮缺失或事件没接上。
    expect(trigger.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")
    expect(guardedHost.runCalls).toHaveLength(0)

    cleanup()

    // Hazard 上膛：同一个触发的同一次点击直接发起真实执行。
    useWorkspaceStore.setState({ hazardMode: true })
    const hazardHost = createHost(initial)
    render(<Component compId="comp-sleept" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: "开始执行" }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("countdown")
    expect(hazardHost.runCalls[0]?.input.dryrun).toBe(false)
  })

  test("saves, restores, clears, and opens default config controls", async () => {
    setSurface("regular")
    const host = createHost(
      { timerMode: "countdown", seconds: 5, dryrun: true },
      { config: { timerMode: "cpu", seconds: 30, dryrun: false } },
    )
    render(<Component compId="comp-sleept" host={host} />)
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByRole("button", { name: "sleept defaults" }).className).toContain("bg-secondary"))
    await user.click(screen.getByRole("button", { name: "sleept defaults" }))
    await user.click(screen.getByRole("button", { name: "恢复默认" }))
    expect(host.state.timerMode).toBe("cpu")
    expect(host.state.dryrun).toBe(false)

    await user.click(screen.getByRole("button", { name: "清除覆盖" }))
    expect(host.state.timerMode).toBeUndefined()
    expect(host.state.dryrun).toBeUndefined()

    await user.click(screen.getByRole("button", { name: "保存为默认" }))
    expect(host.savedConfig).toEqual({})

    await user.click(screen.getByRole("button", { name: "打开文件" }))
    expect(host.openConfigFileCalls).toBe(1)
  })
})

type TestHost = NodeHostApi & {
  openConfigFileCalls: number
  runCalls: Array<{ nodeId: string; input: SleeptInput }>
  savedConfig: Partial<SleeptCardState> | undefined
  state: SleeptCardState
}

type HostOptions = {
  config?: Partial<SleeptCardState>
  runError?: Error
  runResult?: NodeRunResult<SleeptData>
}

function createHost(initial: SleeptCardState, options: HostOptions = {}): TestHost {
  const host: TestHost = {
    state: { ...initial },
    runCalls: [],
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
        host.runCalls.push({ nodeId, input: input as SleeptInput })
        if (options.runError) throw options.runError
        const action = (input as SleeptInput).action
        if (action === "get_stats") {
          onEvent?.({ type: "progress", progress: 100, message: "Stats ready." })
          return (options.runResult ?? {
            success: true,
            message: "CPU: 88.8%, upload: 1.2KB/s, download: 3.4KB/s",
            data: { ...sleeptData, currentCpu: 88.8, currentUpload: 1.2, currentDownload: 3.4 },
          }) as NodeRunResult<TData>
        }
        onEvent?.({ type: "progress", progress: 25, message: "remaining 00:00:05" })
        onEvent?.({ type: "log", message: "waiting" })
        onEvent?.({ type: "progress", progress: 100, message: "time reached" })
        return (options.runResult ?? {
          success: true,
          message: "Countdown completed; simulated sleep.",
          data: { ...sleeptData, timerStatus: "completed", currentCpu: 12.3, currentUpload: 4.5, currentDownload: 6.7 },
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "",
      writeText: async () => undefined,
    },
    env: {
      theme: "light",
      platform: "web",
    },
    getNodeConfig: async <T,>() => ({ config: options.config as T | undefined, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async (config) => {
      host.savedConfig = config as Partial<SleeptCardState>
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

const sleeptData: SleeptData = {
  timerStatus: "idle",
  remainingSeconds: 0,
  currentUpload: 0,
  currentDownload: 0,
  currentCpu: 0,
}
