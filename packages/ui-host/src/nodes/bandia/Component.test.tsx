// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import type { BandiaAction, BandiaData, BandiaInput } from "@xiranite/node-bandia/core"
import { Component } from "./Component"
import type { BandiaCardState } from "./types"

const surfaceState = vi.hoisted(() => ({
  mode: "regular" as NodeSurfaceMode,
  height: undefined as number | undefined,
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  surfaceState.mode = "regular"
  surfaceState.height = undefined
})

describe("app-owned bandia Component", () => {
  test("uses shared module panels for full-view sections", () => {
    surfaceState.mode = "regular"
    render(<Component compId="comp-bandia" host={createHost({ pathText: "D:/archives/book.zip" })} />)

    expect(document.querySelectorAll('[data-slot="module-panel"]')).toHaveLength(3)
    expect(screen.getByText("Input silo")).toBeTruthy()
    expect(screen.getByText("Command chamber")).toBeTruthy()
    expect(screen.getByText("Mapping output")).toBeTruthy()
  })

  test.each(["collapsed", "compact", "portrait", "regular", "expanded", "workspace"] as NodeSurfaceMode[])(
    "renders the %s surface with Bandia-specific UI",
    (mode) => {
      surfaceState.mode = mode
      render(<Component compId="comp-bandia" host={createHost({ pathText: "D:/archives/book.zip" })} />)

      expect(screen.getByText("Bandia")).toBeTruthy()
      if (mode === "collapsed") {
        expect(screen.queryByRole("tab", { name: "Results" })).toBeNull()
        return
      }

      if (mode === "portrait") {
        expect(screen.getByRole("tab", { name: "Queue" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Results" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Logs" })).toBeTruthy()
        return
      }

      if (mode === "compact") {
        expect(screen.getByText("Archive queue")).toBeTruthy()
        return
      }

      expect(screen.getByTestId("bandia-header-toolbar")).toBeTruthy()
      expect(screen.getByRole("tab", { name: "Results" })).toBeTruthy()
    },
  )

  test("keeps result and log tabs visible in portrait cards", () => {
    surfaceState.mode = "portrait"
    render(<Component compId="comp-bandia" host={createHost({ pathText: "D:/archives/book.zip", logs: ["ready"] })} />)

    expect(screen.getByRole("tab", { name: "Queue" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Results" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Logs" })).toBeTruthy()
  })

  test("pastes clipboard input into component state", async () => {
    surfaceState.mode = "compact"
    const host = createHost({})
    render(<Component compId="comp-bandia" host={host} />)
    const user = userEvent.setup()

    const pasteButton = screen.getByRole("button", { name: "粘贴输入" })
    expect(pasteButton).toBeTruthy()
    await user.click(pasteButton)

    expect(host.state.pathText).toBe("D:/archives/book.zip")
  })

  test("uses the shared configuration-management workflow", async () => {
    surfaceState.mode = "regular"
    render(<Component compId="comp-bandia" host={createHost({ pathText: "D:/archives/book.zip" })} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "配置管理" }))
    expect(screen.getByRole("button", { name: "保存为默认" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "打开文件" })).toBeTruthy()
  })

  test("runs compress mode with real source paths and renders Dice data table results", async () => {
    surfaceState.mode = "regular"
    const host = createHost({
      mode: "compress",
      pathText: "D:/books/source folder",
      outputDir: "D:/archives",
      dryRun: true,
      logs: [],
    })
    render(<Component compId="comp-bandia" host={host} />)
    const user = userEvent.setup()

    const runButton = screen.getByRole("button", { name: "预演压缩" })
    expect(runButton).toBeTruthy()
    await user.click(runButton)

    await waitFor(() => expect(host.runCalls).toHaveLength(1))
    expect(host.runCalls[0]).toEqual({
      nodeId: "bandia",
      input: {
        action: "compress",
        paths: ["D:/books/source folder"],
        mappings: [],
        mappingText: undefined,
        deleteAfter: true,
        useTrash: true,
        parallel: false,
        workers: 2,
        extractMode: "auto",
        outputPrefix: "[extract] ",
        overwriteMode: "overwrite",
        outputDir: "D:/archives",
        compressFormat: "zip",
        deleteSource: true,
        dryRun: true,
        openInEverything: false,
      },
    })

    await waitFor(() => expect(host.state.phase).toBe("completed"))
    expect(host.state.result?.compressedCount).toBe(1)
    expect(host.state.logs).toEqual(["Compress complete: 1 succeeded, 0 failed."])
    expect(screen.getByTestId("bandia-result-data-table")).toBeTruthy()
    expect(screen.getByPlaceholderText("Filter sources...")).toBeTruthy()
    expect(screen.getByText("source folder.zip")).toBeTruthy()
    expect(screen.getByText("skipped")).toBeTruthy()

    const copyButton = screen.getAllByRole("button").find((button) => button.textContent?.includes("Copy"))
    expect(copyButton).toBeTruthy()
    await user.click(copyButton!)
    expect(host.copiedText).toBe("ok D:/books/source folder -> D:/archives/source folder.zip")
  })
})

type TestHost = NodeHostApi & {
  state: BandiaCardState
  runCalls: Array<{ nodeId: string; input: BandiaInput }>
  copiedText: string
}

function createHost(initial: BandiaCardState): TestHost {
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
        host.runCalls.push({ nodeId, input: input as BandiaInput })
        onEvent?.({ type: "progress", progress: 100, message: "compress complete." })
        return {
          success: true,
          message: "Compress complete: 1 succeeded, 0 failed.",
          data: bandiaData,
        } as NodeRunResult<TData>
      },
    },
    clipboard: {
      readText: async () => "D:/archives/book.zip",
      writeText: async (text) => {
        host.copiedText = text
      },
    },
    env: {
      theme: "light",
      platform: "web",
    },
    getNodeConfig: async () => ({ config: undefined, path: "D:/config/xiranite.config.toml" }),
    saveNodeConfig: async () => undefined,
  }
  return host
}

const bandiaData: BandiaData = {
  action: "compress" as BandiaAction,
  extractedCount: 0,
  compressedCount: 1,
  failedCount: 0,
  totalCount: 1,
  exportedCount: 0,
  pathMappings: [],
  results: [
    {
      kind: "compress",
      sourcePath: "D:/books/source folder",
      archivePath: "D:/archives/source folder.zip",
      success: true,
      durationMs: 0,
      command: 'bz a -y "D:/archives/source folder.zip" "source folder"',
      skipped: true,
    },
  ],
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
