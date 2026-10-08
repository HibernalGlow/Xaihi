// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { ClassfData, ClassfInput } from "@xiranite/node-classf/core"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { Component } from "./Component"
import { DEFAULT_BLACKLIST_KEYWORDS } from "./constants"
import type { ClassfCardState } from "./types"

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

describe("app-owned classf Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)(
    "renders the %s surface with native ClassF UI",
    (mode) => {
      setSurface(mode)
      render(<Component compId="comp-classf" host={createHost({ pathsText: "D:/set/a.zip" })} />)

      expect(screen.getByText("ClassF")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.getByTestId("classf-collapsed-view")).toBeTruthy()
        expect(screen.queryByLabelText("classf paths")).toBeNull()
        return
      }

      expect(screen.getByLabelText("classf paths")).toBeTruthy()
      if (mode === "compact" || mode === "portrait") {
        expect(screen.getAllByRole("tab")).toHaveLength(4)
      }

      if (mode === "compact") {
        expect(screen.getByTestId("classf-compact-view")).toBeTruthy()
      } else if (mode === "portrait") {
        expect(screen.getByTestId("classf-portrait-view").className).toContain("w-full")
      } else {
        expect(screen.getByTestId("classf-full-view")).toBeTruthy()
        expect(screen.getByTestId("classf-header-toolbar")).toBeTruthy()
        const scanSources = screen.getByTestId("classf-scan-sources")
        expect(scanSources).toBeTruthy()
        expect(within(scanSources.parentElement!).getByTestId("classf-execution-gate")).toBeTruthy()
        expect(screen.getByTestId("classf-classification-matrix")).toBeTruthy()
        expect(screen.getByTestId("classf-analysis")).toBeTruthy()
        expect(document.querySelectorAll('[data-slot="resizable-handle"]')).toHaveLength(0)
        expect(screen.getByRole("tab", { name: "文件树" }).getAttribute("aria-selected")).toBe("true")
        expect(screen.getByRole("button", { name: "生成计划" })).toBeTruthy()
      }
    },
  )

  test("runs plan through host.runner.run and stores classification rows", async () => {
    setSurface("regular")
    const host = createHost({
      action: "plan",
      pathsText: "D:/set/a.zip",
      crashuSourcesText: "D:/library",
      classifyMode: "auto",
      transferMode: "move",
      dryRun: true,
      logs: [],
    })
    render(<Component compId="comp-classf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "生成计划" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "classf",
      input: {
        action: "plan",
        paths: ["D:/set/a.zip"],
        crashuSourcePaths: ["D:/library"],
        targetDir: undefined,
        transferMode: "move",
        classifyMode: "auto",
        placementMode: "local",
        existingPolicy: "merge",
        dryRun: true,
        workItemMode: "files",
        blacklistKeywords: DEFAULT_BLACKLIST_KEYWORDS,
        sameaGroupEnabled: true,
        sameaGroupMinOccurrences: 2,
        sameaGroupCentralize: false,
      },
    })
    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
    expect(host.cardState.result?.items[0]?.targetRelative).toBe("already/a.zip")
    expect(host.patches.some((patch) => patch.result === null)).toBe(false)
  })

  test("recovers a persisted phantom running state after remount", async () => {
    setSurface("regular")
    const host = createHost({ phase: "running", progress: 45, progressText: "stale run", result: null })
    render(<Component compId="comp-classf" host={host} />)

    await waitFor(() => expect(host.cardState.phase).toBe("idle"))
    expect(host.cardState.progress).toBe(0)
    expect(host.cardState.progressText).toBe("")
  })

  test("previews the planned target hierarchy in the file tree tab", async () => {
    setSurface("regular")
    const host = createHost({
      action: "classify",
      pathsText: "D:/set/a.zip",
      crashuSourcesText: "D:/library",
      transferMode: "move",
      classifyMode: "auto",
      existingPolicy: "merge",
      // 本用例测的是文件树预览本身；画师分组（现在是默认开）会改变树形渲染，显式关掉。
      sameaGroupEnabled: false,
      result: classfData,
      // 与 Component 的 planFingerprint 同形（undefined 字段会被 JSON.stringify 丢掉）。
      planFingerprint: JSON.stringify({
        paths: ["D:/set/a.zip"],
        crashuSources: ["D:/library"],
        transferMode: "move",
        classifyMode: "auto",
        placementMode: "local",
        existingPolicy: "merge",
        workItemMode: "files",
        blacklistKeywords: DEFAULT_BLACKLIST_KEYWORDS,
        sameaGroupEnabled: false,
        sameaGroupMinOccurrences: 2,
        sameaGroupCentralize: false,
      }),
    })
    render(<Component compId="comp-classf" host={host} />)

    expect(screen.getByRole("tab", { name: "文件树" }).getAttribute("aria-selected")).toBe("true")
    expect(within(screen.getByTestId("classf-classification-matrix")).getByText("already")).toBeTruthy()
    expect(screen.getByText("a.zip · 待执行")).toBeTruthy()
  })

  test("builds a reviewable plan, then arms a fuse before live execution", async () => {
    setSurface("regular")
    const host = createHost({ action: "classify", pathsText: "D:/set/a.zip", crashuSourcesText: "D:/library", dryRun: false, logs: [] })
    render(<Component compId="comp-classf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "先生成执行计划" }))
    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("plan")
    expect(host.cardState.result?.items[0]?.targetPath).toBe("D:/set/already/a.zip")

    cleanup()
    render(<Component compId="comp-classf" host={host} />)
    await user.click(screen.getByRole("button", { name: "执行分类" }))
    expect(host.runCalls).toHaveLength(1)
  })

  // Hazard 上膛 = 真执行 + 不追问：已确认的计划上点一次就直接提交。
  test("executes the confirmed live plan on the first click while hazard mode is armed", async () => {
    setSurface("regular")
    useWorkspaceStore.setState({ hazardMode: true })
    const host = createHost({ action: "classify", pathsText: "D:/set/a.zip", crashuSourcesText: "D:/library", dryRun: false, logs: [] })
    render(<Component compId="comp-classf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "先生成执行计划" }))
    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input.action).toBe("plan")

    cleanup()
    render(<Component compId="comp-classf" host={host} />)
    await user.click(screen.getByRole("button", { name: "执行分类" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(2))
    expect(host.runCalls[1]?.input.action).toBe("classify")
    expect(host.runCalls[1]?.input.dryRun).toBe(false)
    expect(host.patches).toContainEqual(expect.objectContaining({ runningItem: { sourcePath: "D:/set/a.zip", stage: "already" } }))
    expect(host.cardState.result?.items[0]?.status).toBe("moved")
  })

  test("allows an empty form so ClassF can use clipboard defaults", async () => {
    setSurface("regular")
    const host = createHost({ action: "plan", logs: [] })
    render(<Component compId="comp-classf" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "生成计划" }))

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]?.input).toEqual(expect.objectContaining({ paths: [], crashuSourcePaths: [] }))
    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
  })

  test("switches between local and root placement without a hand-written selector", async () => {
    const host = createHost({ pathsText: "D:/set", placementMode: "root" })
    render(<Component compId="comp-classf" host={host} />)
    expect(screen.getByLabelText("classf target")).toBeTruthy()
    await userEvent.setup().click(screen.getByRole("radio", { name: "就地分流" }))
    expect(host.patches).toContainEqual(expect.objectContaining({ placementMode: "local" }))
  })
})

type TestHost = NodeHostApi<ClassfCardState, Partial<ClassfCardState>> & {
  copiedText: string
  runCalls: Array<{ nodeId: string; input: ClassfInput }>
  patches: Array<Partial<ClassfCardState>>
  savedConfig: Partial<ClassfCardState> | undefined
  cardState: ClassfCardState
}

function createHost(initial: ClassfCardState): TestHost {
  const stateCapability = {
    getData: () => host.cardState,
    patchData: (patch: Partial<ClassfCardState>) => {
      host.patches.push(patch)
      host.cardState = { ...host.cardState, ...patch }
    },
  }

  const host: TestHost = {
    cardState: { ...initial },
    runCalls: [],
    patches: [],
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
        host.runCalls.push({ nodeId, input: input as ClassfInput })
        const classfInput = input as ClassfInput
        onEvent?.({ type: "progress", progress: 45, message: "Plan ready.", data: { kind: "classf-plan", result: classfData } })
        if (classfInput.action === "classify") {
          onEvent?.({ type: "progress", progress: 70, message: "a.zip", data: { kind: "classf-item", sourcePath: "D:/set/a.zip", stage: "already", status: "running" } })
          onEvent?.({ type: "log", message: "a.zip: moved", data: { kind: "classf-item", sourcePath: "D:/set/a.zip", stage: "already", status: "moved" } })
        }
        return {
          success: true,
          message: classfInput.action === "classify" ? "ClassF applied 1 item." : "ClassF planned 1 item.",
          data: (classfInput.action === "classify" ? completedClassfData : classfData) as TData,
        }
      },
    },
    clipboard: {
      readText: async () => "D:/set/a.zip",
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
    saveNodeConfig: async (config) => { host.savedConfig = config as Partial<ClassfCardState> },
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

const classfData: ClassfData = {
  action: "plan",
  transferMode: "move",
  classifyMode: "auto",
  baseDir: "D:/set",
  items: [
    {
      sourcePath: "D:/set/a.zip",
      targetPath: "D:/set/already/a.zip",
      sourceName: "a.zip",
      targetRelative: "already/a.zip",
      kind: "file",
      stage: "already",
      status: "ready",
    },
  ],
  selectedCount: 1,
  readyCount: 1,
  movedCount: 0,
  copiedCount: 0,
  delCount: 0,
  waitCount: 0,
  conflictCount: 0,
  errorCount: 0,
  errors: [],
}

const completedClassfData: ClassfData = {
  ...classfData,
  action: "classify",
  items: classfData.items.map((item) => ({ ...item, status: "moved" as const })),
  readyCount: 0,
  movedCount: 1,
}
