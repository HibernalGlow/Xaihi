// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { EncodebData, EncodebInput } from "@xiranite/node-encodeb/core"
import { Component } from "./Component"
import type { EncodebCardState } from "./types"

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

describe("app-owned encodeb Component", () => {
  test("uses shared module panels for full-view sections", () => {
    setSurface("expanded")
    render(<Component compId="comp-encodeb" host={createHost({ pathText: "D:/gallery" })} />)

    expect(document.querySelectorAll('[data-slot="module-panel"]')).toHaveLength(3)
    expect(screen.getByText("输入路径")).toBeTruthy()
    expect(screen.getByText("编码设置")).toBeTruthy()
    expect(screen.getByText("结果与日志")).toBeTruthy()
  })

  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with Encodeb-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-encodeb" host={createHost({ pathText: "D:/gallery" })} />)

      expect(screen.getByText("Encodeb")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("encodeb-collapsed-view")).toBeTruthy()
        expect(screen.getByText(/1 条路径等待扫描/)).toBeTruthy()
        expect(screen.queryByLabelText("encodeb source paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("encodeb source paths")).toBeTruthy()
      expect(screen.getAllByText(/输入/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/auto/i).length).toBeGreaterThan(0)

      if (mode === "compact" || mode === "regular") {
        expect(screen.getByTestId("encodeb-compact-view")).toBeTruthy()
        expect(screen.getByText("等待扫描")).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("encodeb-portrait-view")).toBeTruthy()
        expect(screen.getByText("映射预览")).toBeTruthy()
      } else {
        expect(screen.getByTestId("encodeb-full-view")).toBeTruthy()
        expect(screen.getByText("输入路径")).toBeTruthy()
        expect(screen.getByText("编码设置")).toBeTruthy()
        expect(screen.getByText("结果与日志")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-encodeb" host={createHost({ pathText: "D:/gallery" })} />)

    expect(screen.getByTestId("encodeb-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("encodeb source paths")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-encodeb" host={createHost({ pathText: "D:/gallery" })} />)

    expect(screen.getByTestId("encodeb-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("encodeb-compact-view")).toBeNull()
  })

  test("pastes source paths from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-encodeb" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴路径" }))

    expect(host.state.pathText).toBe("D:/gallery")
  })

  test("shows preset examples and switches presets in compact layouts", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/gallery" })
    render(<Component compId="comp-encodeb" host={host} />)
    const user = userEvent.setup()

    expect(screen.getByText(/ã‚» → セ/)).toBeTruthy()
    await user.selectOptions(screen.getByRole("combobox", { name: "快速选择编码预设" }), "hash_u")

    expect(host.state.preset).toBe("hash_u")
    expect(host.state.transform).toBe("decode-hash-u")
  })

  test("runs find action through host.actions.run and stores matches", async () => {
    setSurface("regular")
    const host = createHost({ pathText: "D:/gallery", logs: [] })
    render(<Component compId="comp-encodeb" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "扫描乱码" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "encodeb",
      input: {
        action: "find",
        paths: ["D:/gallery"],
        srcEncoding: "auto",
        dstEncoding: "auto",
        transform: "auto",
        strategy: "replace",
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.matches).toEqual(["D:/gallery/╘╙═.txt"])
    expect(host.state.logs?.at(-1)).toBe("Find completed, 1 item(s).")
  })

  test("holds the recover run behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")

    // Hazard 未上膛：点击只点亮引信，真正的提交要等引信烧完（本用例不去烧它）。
    const guardedHost = createHost({ pathText: "D:/gallery", logs: [] })
    render(<Component compId="comp-encodeb" host={guardedHost} />)
    const user = userEvent.setup()

    const trigger = screen.getByRole("button", { name: "执行修复" })
    await user.click(trigger)
    // 正控：点击确实落在了引信闸门的那颗按钮上，不是按钮缺失或事件没接上。
    expect(trigger.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")
    expect(guardedHost.runCalls).toHaveLength(0)

    cleanup()

    // Hazard 上膛：同一个触发的同一次点击直接发起运行。
    useWorkspaceStore.setState({ hazardMode: true })
    const hazardHost = createHost({ pathText: "D:/gallery", logs: [] })
    render(<Component compId="comp-encodeb" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: "执行修复" }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("recover")
  })
})

type TestHost = NodeHostApi & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: EncodebInput }>
  state: EncodebCardState
}

type HostOptions = {
  runError?: Error
  runResult?: NodeRunResult<EncodebData>
}

function createHost(initial: EncodebCardState, options: HostOptions = {}): TestHost {
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
        onEvent?: (event: NodeRunEvent) => void,
      ): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as EncodebInput })
        if (options.runError) throw options.runError
        onEvent?.({ type: "progress", progress: 50, message: "Scanning D:/gallery" })
        onEvent?.({ type: "log", message: "Planning transcode." })
        onEvent?.({ type: "progress", progress: 100, message: "Scan completed." })
        return (options.runResult ?? {
          success: true,
          message: "Find completed, 1 item(s).",
          data: encodebData,
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
    getNodeConfig: async <T,>() => ({ config: options.runResult as T | undefined, path: "D:/config/xiranite.config.toml" }),
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

const encodebData: EncodebData = {
  mappings: [],
  matches: ["D:/gallery/╘╙═.txt"],
  processed: 0,
}
