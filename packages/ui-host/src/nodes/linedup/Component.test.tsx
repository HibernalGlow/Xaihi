// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunResult } from "@xiranite/contract"
import type { LinedupFilterInput, LinedupFilterResult } from "@xiranite/node-linedup/core"
import { NODE_SURFACE_TEST_MODES, NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { Component } from "./Component"
import type { LinedupCardState } from "./types"

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
  setSurface("regular")
})

describe("app-owned linedup Component", () => {
  test.each(NODE_SURFACE_TEST_MODES)("renders the %s surface with Linedup-specific UI", (mode) => {
    setSurface(mode)
    render(<Component compId="comp-linedup" host={createHost({ sourceText: sourceText(), filterText: "beta" })} />)

    expect(screen.getByText("Linedup")).toBeTruthy()
    if (mode === "collapsed") {
      expect(screen.getByTestId("linedup-collapsed-view")).toBeTruthy()
      expect(screen.queryByLabelText("源文本")).toBeNull()
      return
    }

    expect(screen.getByLabelText("源文本")).toBeTruthy()
    expect(screen.getByLabelText("过滤词")).toBeTruthy()
    expect(screen.getByRole("tab", { name: /预览/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /保留/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /移除/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /日志/ })).toBeTruthy()

    if (mode === "compact") {
      expect(screen.getByTestId("linedup-compact-view")).toBeTruthy()
      expect(screen.getByRole("button", { name: "linedup options" })).toBeTruthy()
    } else if (mode === "portrait") {
      expect(screen.getByTestId("linedup-portrait-view")).toBeTruthy()
    } else {
      expect(screen.getByTestId("linedup-full-view")).toBeTruthy()
      expect(screen.getByTestId("linedup-header-toolbar")).toBeTruthy()
      expect(screen.getAllByText("进度").length).toBeGreaterThan(0)
    }
  })

  test("forces collapsed content when compact surface height is too short", () => {
    setSurfaceSize({ width: 420, height: 159 })

    render(<Component compId="comp-linedup" host={createHost({ sourceText: sourceText(), filterText: "beta" })} />)

    expect(screen.getByTestId("linedup-collapsed-view")).toBeTruthy()
    expect(screen.queryByLabelText("源文本")).toBeNull()
  })

  test("uses portrait compact layout for tall compact surfaces", () => {
    setSurfaceSize({ width: 559, height: 300 })

    render(<Component compId="comp-linedup" host={createHost({ sourceText: sourceText(), filterText: "beta" })} />)

    expect(screen.getByTestId("linedup-portrait-view")).toBeTruthy()
    expect(screen.queryByTestId("linedup-compact-view")).toBeNull()
  })

  test("runs the filter on the host, then copies and downloads the kept lines it returned", async () => {
    setSurface("regular")
    const host = createHost({}, { clipboard: [sourceText(), "beta"] })
    const view = render(<Component compId="comp-linedup" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "粘贴源文本" }))
    view.rerender(<Component compId="comp-linedup" host={host} />)
    await user.click(screen.getByRole("button", { name: "粘贴过滤词" }))
    view.rerender(<Component compId="comp-linedup" host={host} />)
    expect(host.cardState.sourceText).toBe(sourceText())
    expect(host.cardState.filterText).toBe("beta")

    await user.click(screen.getByRole("button", { name: "运行过滤" }))
    view.rerender(<Component compId="comp-linedup" host={host} />)

    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
    // 一次宿主运行，发的就是那份未裁剪的行文档：判定在宿主，卡片只负责把返回的文档画出来。
    expect(host.runCalls).toHaveLength(1)
    expect(host.runCalls[0]?.nodeId).toBe("linedup")
    expect(host.runCalls[0]?.input).toEqual({
      sourceLines: ["gamma", "beta-one", "alpha", "beta-two"],
      filterLines: ["beta"],
      caseSensitive: true,
      sort: true,
    })
    expect(host.cardState.result?.keptCount).toBe(2)
    expect(host.cardState.result?.removedCount).toBe(2)
    expect(host.cardState.logs).toEqual(["保留 2 行，移除 2 行。"])
    expect(screen.getByText("beta-one")).toBeTruthy()

    // 预览页的每一行都是宿主文档的投影：beta-one / beta-two 不在 filteredLines 里，所以是移除行。
    await user.click(screen.getByRole("tab", { name: /预览/ }))
    expect(screen.getByText("gamma")).toBeTruthy()
    expect(screen.getByText("beta-two")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "复制保留结果" }))
    expect(host.copiedText).toBe("alpha\ngamma")

    await user.click(screen.getByRole("tab", { name: /保留/ }))
    await user.click(screen.getByRole("button", { name: "下载" }))
    expect(host.downloadedFiles).toEqual([{ filename: "linedup-output.txt", content: "alpha\ngamma" }])
  })

  test("renders the case-insensitive document the host answered with", async () => {
    setSurface("regular")
    const host = createHost({ sourceText: "Alpha\nBeta\ngamma", filterText: "beta", caseSensitive: false }, {
      hostResult: {
        success: true,
        message: "Filtered lines.",
        data: { filteredLines: ["Alpha", "gamma"], removedLines: ["Beta"], keptCount: 2, removedCount: 1 },
      },
    })
    render(<Component compId="comp-linedup" host={host} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "运行过滤" }))

    await waitFor(() => expect(host.cardState.phase).toBe("completed"))
    expect(host.runCalls[0]?.input.caseSensitive).toBe(false)
    expect(host.cardState.result?.filteredLines).toEqual(["Alpha", "gamma"])
    expect(host.cardState.result?.removedLines).toEqual(["Beta"])
  })

  test("keeps the run action disabled until source text is available", () => {
    setSurface("regular")
    const host = createHost({ filterText: "beta" })
    render(<Component compId="comp-linedup" host={host} />)

    expect((screen.getByRole("button", { name: "运行过滤" }) as HTMLButtonElement).disabled).toBe(true)
    expect(host.cardState.phase).toBeUndefined()
    expect(host.runCalls).toHaveLength(0)
  })

  // 配方 §4 的硬约束：附不上宿主就明确拒绝。本地算一次就等于把 ADR-0074 §5 删掉的那台执行器放回浏览器。
  test("a host-less environment fails visibly instead of filtering in the browser", async () => {
    setSurface("regular")
    const host = createHost({ sourceText: sourceText(), filterText: "beta" })
    delete host.runner
    delete host.actions
    const view = render(<Component compId="comp-linedup" host={host} />)

    await userEvent.setup().click(screen.getByRole("button", { name: "运行过滤" }))
    view.rerender(<Component compId="comp-linedup" host={host} />)

    await waitFor(() => expect(host.cardState.phase).toBe("error"))
    expect(host.cardState.result).toBeNull()
    expect(host.cardState.logs?.join("\n")).toContain("当前环境没有本地运行能力")
    // 失败原因要看得见：phase 不是 completed 且日志非空时卡片自动切到「日志」页。
    expect(screen.getAllByText((content) => content.includes("当前环境没有本地运行能力")).length).toBeGreaterThan(0)
  })

  test("a host that refuses leaves the card in error with its message", async () => {
    setSurface("regular")
    const host = createHost({ sourceText: sourceText(), filterText: "beta" }, {
      hostResult: { success: false, message: "host refused: bundle budget exceeded" },
    })
    render(<Component compId="comp-linedup" host={host} />)

    await userEvent.setup().click(screen.getByRole("button", { name: "运行过滤" }))

    await waitFor(() => expect(host.cardState.phase).toBe("error"))
    expect(host.cardState.result).toBeNull()
    expect(host.cardState.logs?.join("\n")).toContain("host refused: bundle budget exceeded")
    expect(screen.getAllByText((content) => content.includes("host refused: bundle budget exceeded")).length).toBeGreaterThan(0)
    // 被拒之后不许留下任何「本地算出来」的文档。
    expect(screen.queryByText("beta-one")).toBeNull()
  })
})

type TestHost = NodeHostApi & {
  clipboardQueue: string[]
  copiedText: string
  downloadedFiles: Array<{ filename: string; content: string }>
  runCalls: Array<{ nodeId: string; input: LinedupFilterInput }>
  cardState: LinedupCardState
}

/**
 * 假宿主：只按脚本答一份结果文档（`{ success, message, data }`，即 `filterLines` 在
 * `POST /nodes/linedup/operations` 上的信封），不重算任何过滤判定 —— 卡片渲染的必须是被返回的那份。
 *
 * 数据袋叫 `cardState`：`NodeHostApi.state` 是宿主的 `NodeStateCapability` 能力位，拿它当数据袋的节点夹具
 * （`migratef`/`sleept`/`trename` 那批）在类型台账里各挂一条 TS2322，这份不再挂。
 */
function createHost(
  initial: LinedupCardState,
  options: { clipboard?: string[]; hostResult?: NodeRunResult<LinedupFilterResult> } = {},
): TestHost {
  function applyPatch(patch: Partial<LinedupCardState>) {
    host.cardState = { ...host.cardState, ...patch }
  }
  const stateCapability = {
    getData: () => host.cardState as Record<string, unknown> | undefined,
    patchData: (patch: Record<string, unknown>) => applyPatch(patch as Partial<LinedupCardState>),
  }
  const host: TestHost = {
    cardState: { ...initial },
    clipboardQueue: [...(options.clipboard ?? [])],
    copiedText: "",
    downloadedFiles: [],
    runCalls: [],
    contract: {
      name: "xiranite.node-host",
      version: "1.0.0",
      supportedCapabilities: ["contract", "state", "runner", "clipboard", "downloads", "config", "env"],
      hasCapability: () => true,
    },
    env: { theme: "light", platform: "web" },
    state: stateCapability,
    getData: <T,>() => host.cardState as T,
    patchData: (_compId, patch) => applyPatch(patch),
    listComponents: () => [],
    updateComponent: () => undefined,
    runner: {
      run: async <TInput, TData>(nodeId: string, input: TInput): Promise<NodeRunResult<TData>> => {
        host.runCalls.push({ nodeId, input: input as LinedupFilterInput })
        return (options.hostResult ?? keptHostResult) as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => host.clipboardQueue.shift() ?? "",
      writeText: async (text) => {
        host.copiedText = text
      },
    },
    downloadText: (filename, content) => {
      host.downloadedFiles.push({ filename, content })
    },
  }
  return host
}

const keptHostResult: NodeRunResult<LinedupFilterResult> = {
  success: true,
  message: "Filtered lines.",
  data: {
    filteredLines: ["alpha", "gamma"],
    removedLines: ["beta-one", "beta-two"],
    keptCount: 2,
    removedCount: 2,
  },
}

function setSurface(mode: NodeSurfaceMode) {
  setSurfaceSize(NODE_SURFACE_TEST_SPECS[mode])
}

function setSurfaceSize(size: { height: number; width: number }) {
  surfaceState.width = size.width
  surfaceState.height = size.height
}

function sourceText(): string {
  return "gamma\nbeta-one\nalpha\nbeta-two"
}
