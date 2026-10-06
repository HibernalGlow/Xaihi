// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { MigratefData, MigratefInput } from "@xiranite/node-migratef/core"
import { Component } from "./Component"
import type { MigratefCardState } from "./types"

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

describe("app-owned migratef Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with MigrateF-specific UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-migratef" host={createHost({ sourceText: "D:/gallery", targetPath: "D:/target" })} />)

      expect(screen.getByText("MigrateF")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("migratef-collapsed-view")).toBeTruthy()
        expect(screen.queryByLabelText("migratef source paths")).toBeNull()
        return
      }

      if (mode === "compact" || mode === "portrait") {
        expect(screen.getByTestId("migratef-mode-picker")).toBeTruthy()
        expect(screen.getByTestId("migratef-action-picker")).toBeTruthy()
        if (mode === "portrait") {
          expect(screen.getByTestId("migratef-portrait-view")).toBeTruthy()
        } else {
          expect(screen.getByTestId("migratef-compact-view")).toBeTruthy()
        }
      } else {
        expect(screen.getByTestId("migratef-full-view")).toBeTruthy()
        expect(screen.getByText("配置")).toBeTruthy()
        expect(screen.getByText("迁移清单")).toBeTruthy()
        expect(screen.getByText("操作")).toBeTruthy()
        expect(screen.getByTestId("migratef-header-toolbar")).toBeTruthy()
      }
    },
  )

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-migratef" host={createHost({ sourceText: "D:/gallery", targetPath: "D:/target" })} />)

    expect(screen.getByTestId("migratef-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("migratef source paths")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-migratef" host={createHost({ sourceText: "D:/gallery", targetPath: "D:/target" })} />)

    expect(screen.getByTestId("migratef-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("migratef-compact-view")).toBeNull()
  })

  test("pastes source paths from the clipboard", async () => {
    setSurface("compact")
    const host = createHost({})
    render(<Component compId="comp-migratef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴源" }))

    expect(host.state.sourceText).toBe("D:/gallery")
  })

  test("uses shared configuration management in full view", async () => {
    setSurface("regular")
    render(<Component compId="comp-migratef" host={createHost({ sourceText: "D:/source/a", targetPath: "D:/target" })} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "配置管理" }))
    expect(screen.getByRole("button", { name: "保存为默认" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy()
  })

  test("runs move action in dry-run mode and stores the result", async () => {
    setSurface("regular")
    const host = createHost({ sourceText: "D:/gallery", targetPath: "D:/target", dryRun: true, logs: [] })
    render(<Component compId="comp-migratef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演移动" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "migratef",
      input: {
        action: "move",
        mode: "preserve",
        sourcePaths: ["D:/gallery"],
        targetPath: "D:/target",
        historyPath: undefined,
        dryRun: true,
        batchId: undefined,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.migratedCount).toBe(1)
    expect(host.state.result?.operationId).toBe("batch-001")
    expect(host.state.logs).toEqual([
      "[100%] Migration completed.",
      "Move completed: 1 success, 0 skipped, 0 failed.",
    ])
  })

  test("marks the card as error when the runner returns a failed response", async () => {
    setSurface("regular")
    const host = createHost(
      { sourceText: "D:/gallery", targetPath: "D:/target", logs: [] },
      { runResult: { success: false, message: "Target path is read-only.", data: { ...migratefData, errors: ["read-only"] } } },
    )
    render(<Component compId="comp-migratef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演移动" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("Target path is read-only.")
    expect(host.state.logs?.at(-1)).toBe("Target path is read-only.")
  })

  test("catches thrown runner errors and appends the message to logs", async () => {
    setSurface("regular")
    const host = createHost({ sourceText: "D:/gallery", targetPath: "D:/target", logs: [] }, { runError: new Error("backend offline") })
    render(<Component compId="comp-migratef" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "预演移动" }))

    await waitFor(() => expect(host.state.phase).toBe("error"))
    expect(host.state.progressText).toBe("backend offline")
    expect(host.state.logs?.at(-1)).toBe("backend offline")
  })

  test("holds the real move behind the fuse, and runs it straight away under Hazard", async () => {
    setSurface("regular")
    const initial = { sourceText: "D:/gallery", targetPath: "D:/target", dryRun: false }

    // Hazard 未上膛：点击只点亮引信，真正的提交要等引信烧完（本用例不去烧它）。
    const guardedHost = createHost(initial)
    render(<Component compId="comp-migratef" host={guardedHost} />)
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
    render(<Component compId="comp-migratef" host={hazardHost} />)

    await user.click(screen.getByRole("button", { name: "真实移动" }))

    await waitFor(() => expect(hazardHost.runCalls).toHaveLength(1))
    expect(hazardHost.runCalls[0]?.input.action).toBe("move")
    expect(hazardHost.runCalls[0]?.input.dryRun).toBe(false)
  })
})

type TestHost = NodeHostApi & {
  runCalls: Array<{ nodeId: string; input: MigratefInput }>
  state: MigratefCardState
}

type HostOptions = {
  runError?: Error
  runResult?: NodeRunResult<MigratefData>
}

function createHost(initial: MigratefCardState, options: HostOptions = {}): TestHost {
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
      run: async <TInput, TData>(
        nodeId: string,
        input: TInput,
        onEvent?: (event: NodeRunEvent) => void,
      ): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as MigratefInput })
        if (options.runError) throw options.runError
        onEvent?.({ type: "progress", progress: 100, message: "Migration completed." })
        return (options.runResult ?? {
          success: true,
          message: "Move completed: 1 success, 0 skipped, 0 failed.",
          data: migratefData,
        }) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/gallery",
      writeText: async () => undefined,
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

const migratefData: MigratefData = {
  plan: [
    {
      sourcePath: "D:/gallery",
      targetPath: "D:/target/gallery",
      action: "move",
      kind: "directory",
      status: "success",
    },
  ],
  history: [],
  migratedCount: 1,
  skippedCount: 0,
  errorCount: 0,
  totalCount: 1,
  operationId: "batch-001",
  successCount: 1,
  failedCount: 0,
  errors: [],
}
