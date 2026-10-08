// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { NodeHostApi, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { KisakiData, KisakiInput } from "@hibernalglow/xaihi-kisaki/core"
import { KISAKI_WORKSPACE_DEFAULTS } from "@hibernalglow/xaihi-kisaki/workspace-layout"
import { Component, scanInput } from "./Component"
import type { KisakiCardState } from "./types"
import i18n from "@/i18n"

const surface = vi.hoisted(() => ({ width: 1200, height: 760, mode: "regular" }))
const NODE_SURFACE_TEST_MODES = [
  ["collapsed", 280, 64, "czkawka-collapsed-view"],
  ["compact", 640, 480, "czkawka-compact-view"],
  ["portrait", 420, 720, "czkawka-compact-view"],
  ["regular", 1200, 760, "czkawka-full-view"],
  ["expanded", 1600, 900, "czkawka-full-view"],
  ["workspace", 1440, 860, "czkawka-full-view"],
] as const
vi.mock("@/nodes/shared/useNodeSurface", () => ({ useNodeSurface: () => ({ ref: { current: null }, ...surface }) }))
afterEach(async () => { cleanup(); Object.assign(surface, { width: 1200, height: 760, mode: "regular" }); await i18n.changeLanguage("zh") })

describe("Kisaki node", () => {
  test.each([
    ["regular", 1200, 760, "czkawka-full-view"],
    ["compact", 640, 480, "czkawka-compact-view"],
  ] as const)("keeps all eleven scanners reachable from the %s title selector", (mode, width, height, testId) => {
    Object.assign(surface, { mode, width, height })
    render(<Component compId="czkawka-tools" host={createHost({ tool: "duplicate-files" })} />)
    expect(screen.getByTestId(testId)).toBeTruthy()
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "选择扫描工具" }), { button: 0, ctrlKey: false, pointerType: "mouse" })
    for (const label of ["重复文件", "空文件夹", "大文件", "空文件", "临时文件", "相似图片", "相似视频", "重复音频", "无效符号链接", "损坏文件", "不正确扩展名"]) expect(screen.getByRole("option", { name: label })).toBeTruthy()
  })

  test("inherits host theme and background while leaving window controls to the desktop shell", () => {
    const host = createHost({ tool: "duplicate-files" })
    host.env.theme = "dark"
    render(<Component compId="czkawka-host-mapping" host={host} />)
    const root = screen.getByTestId("czkawka-surface")
    expect(root.dataset.hostTheme).toBe("dark")
    expect(root.classList.contains("bg-transparent")).toBe(true)
    expect(root.classList.contains("bg-background")).toBe(false)
    expect(root.classList.contains("text-foreground")).toBe(true)
    expect(screen.queryByRole("button", { name: /(?:minimize|maximize|close|最小化窗口|最大化窗口|关闭窗口)/i })).toBeNull()
  })

  test("reacts to the Xiranite language and renders the shared English scanner copy", async () => {
    await i18n.changeLanguage("en")
    render(<Component compId="czkawka-en" host={createHost({ tool: "duplicate-files", analysisPanelTab: "analysis" })} />)
    expect(screen.getByRole("combobox", { name: "Select scanner" }).textContent).toContain("Duplicate Files")
    expect(screen.getByRole("button", { name: "Start scan" })).toBeTruthy()
    expect(screen.getByText("Scan conditions")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Paths" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Algorithm" })).toBeTruthy()
    expect(screen.getAllByText("No directories added").length).toBe(1)
    expect(screen.getByText("Format share")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Activity log" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "开始扫描" })).toBeNull()
  })

  test.each(NODE_SURFACE_TEST_MODES)("renders the %s surface without losing the primary action", (mode, width, height, testId) => {
    Object.assign(surface, { mode, width, height })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" })
    render(<Component compId="kisaki" host={host} />)
    expect(screen.getByTestId(testId)).toBeTruthy()
    expect(screen.getByRole("button", { name: "开始扫描" })).toBeTruthy()
  })

  test("renders all scanners and sends scan input", async () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", hashType: "blake3", threadCount: "6" })
    render(<Component compId="kisaki" host={host} />)
    expect(screen.getByRole("combobox", { name: "选择扫描工具" }).textContent).toContain("重复文件")
    await screen.getByRole("button", { name: "开始扫描" }).click()
    await waitFor(() => expect(host.calls[0]).toEqual(expect.objectContaining({ nodeId: "kisaki", input: expect.objectContaining({ action: "scan", tool: "duplicate-files", includedDirectories: ["D:/media"], hashType: "blake3", threadCount: 6 }) })))
  })

  test("switches the running action to native cancellation", async () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" })
    let finish!: (result: NodeRunResult<KisakiData>) => void
    host.runner!.run = async <TInput, TData>(nodeId: string, input: TInput) => {
      host.calls.push({ nodeId, input: input as KisakiInput })
      return await new Promise<NodeRunResult<KisakiData>>((resolve) => { finish = resolve }) as NodeRunResult<TData>
    }
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "开始扫描" }))
    const stop = await screen.findByRole("button", { name: "停止扫描" })
    fireEvent.click(stop)
    await waitFor(() => expect(host.cancelCalls).toBe(1))
    expect(host.stateValue.progressText).toContain("正在请求停止")
    finish({ success: false, message: "Stopped duplicate-files.", data: { ...sample, stopped: true } })
    await waitFor(() => expect(host.stateValue.phase).toBe("stopped"))
  })

  test("manages fork-compatible source lists, references, rules, and extension tokens", async () => {
    const host = createHost({
      tool: "duplicate-files",
      includedDirectoriesText: "D:/one\nD:/two",
      includedDirectoriesReferencedText: "D:/two",
      excludedItemsText: "*/cache/*",
      allowedExtensions: ".jpg;png",
      excludedExtensions: "tmp,bak",
    })
    host.pickedDirectory = "F:/picked"
    const view = render(<Component compId="kisaki" host={host} />)

    expect(screen.queryByRole("textbox", { name: "批量粘贴包含目录" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "手动添加包含目录" }))
    const manualInput = screen.getByRole("textbox", { name: "批量粘贴包含目录" })
    expect(document.activeElement).toBe(manualInput)
    fireEvent.change(manualInput, { target: { value: '\u2068"G:/quoted"\u2069;D:/one,H:/comma' } })
    fireEvent.click(screen.getByRole("button", { name: "添加粘贴的包含目录" }))
    expect(host.stateValue.includedDirectoriesText).toBe("G:/quoted\nD:/one\nH:/comma\nD:/two")

    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "浏览添加包含目录" }))
    await waitFor(() => expect(host.stateValue.includedDirectoriesText?.startsWith("F:/picked\n")).toBe(true))

    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "全部设为参考目录" }))
    expect(host.stateValue.includedDirectoriesReferencedText).toBe(host.stateValue.includedDirectoriesText)
    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "移除目录 D:/two" }))
    expect(host.stateValue.includedDirectoriesReferencedText).not.toContain("D:/two")

    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: /节点设置|Node settings/ }))
    const settingsDialog = screen.getByRole("dialog")
    const minimumSize = within(settingsDialog).getByRole("spinbutton", { name: /最小文件大小（KB）|Minimum file size \(KB\)/ })
    expect((minimumSize as HTMLInputElement).value).toBe("0")
    expect((within(settingsDialog).getByRole("spinbutton", { name: /最大文件大小（KB）|Maximum file size \(KB\)/ }) as HTMLInputElement).value).toBe("2147483")
    fireEvent.change(minimumSize, { target: { value: "12" } })
    expect(host.stateValue.minimumFileSize).toBe("12000")
    fireEvent.click(within(settingsDialog).getByRole("button", { name: "移除 jpg" }))
    expect(host.stateValue.allowedExtensions).toBe("png")
    fireEvent.change(screen.getByRole("textbox", { name: "排除项目输入" }), { target: { value: "*/cache/*,*.part;DEFAULT" } })
    expect(host.stateValue.excludedItemsText).toBe("*/cache/*,*.part;DEFAULT")
    fireEvent.click(screen.getByRole("button", { name: "重置排除扩展名" }))
    expect(host.stateValue.excludedExtensions).toBe("")

    expect(scanInput("duplicate-files", host.stateValue)).toMatchObject({
      includedDirectories: ["F:/picked", "G:/quoted", "D:/one", "H:/comma"],
      includedDirectoriesReferenced: ["F:/picked", "G:/quoted", "D:/one", "H:/comma"],
      excludedDirectories: [],
      excludedItems: ["*/cache/*", "*.part", "DEFAULT"],
      allowedExtensions: "png",
      excludedExtensions: undefined,
    })
  })

  test("maps fork-specific media settings into the shared scan contract", () => {
    expect(scanInput("similar-videos", {
      similarity: "7",
      similarVideosIgnoreSameSize: true,
      similarVideosSkipForward: "42",
      similarVideosHashDuration: "18",
      similarVideosCropDetect: "motion",
    })).toMatchObject({
      tool: "similar-videos",
      similarity: 7,
      similarVideosIgnoreSameSize: true,
      similarVideosSkipForward: 42,
      similarVideosHashDuration: 18,
      similarVideosLetterboxCrop: true,
    })
    expect(scanInput("similar-images", {
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip-rotate-90",
    })).toMatchObject({
      similarImagesIgnoreSameResolution: true,
      similarImagesGeometricInvariance: "mirror-flip-rotate-90",
    })
  })

  test("keeps results and selections isolated when switching tools", async () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" }, resultFor)
    const view = render(<Component compId="kisaki" host={host} />)
    await screen.getByRole("button", { name: "开始扫描" }).click()
    await waitFor(() => expect(screen.getAllByText("duplicate-files-result.dat").length).toBeGreaterThan(0))
    await screen.getByRole("checkbox", { name: "选择 duplicate-files-result.dat" }).click()
    expect(screen.getByRole("checkbox", { name: "选择 duplicate-files-result.dat" }).getAttribute("data-state")).toBe("checked")

    chooseTool("空文件")
    view.rerender(<Component compId="kisaki" host={host} />)
    await screen.getByRole("button", { name: "开始扫描" }).click()
    await waitFor(() => expect(screen.getAllByText("empty-files-result.dat").length).toBeGreaterThan(0))

    chooseTool("重复文件")
    view.rerender(<Component compId="kisaki" host={host} />)
    expect(screen.getAllByText("duplicate-files-result.dat").length).toBeGreaterThan(0)
    expect(screen.getByRole("checkbox", { name: "选择 duplicate-files-result.dat" }).getAttribute("data-state")).toBe("checked")
  })

  test("links the header search to the result table and isolates it by tool", () => {
    const duplicate = resultFor({ tool: "duplicate-files" })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", result: duplicate })
    const view = render(<Component compId="kisaki" host={host} />)
    const headerSearch = screen.getByRole("textbox", { name: "Kisaki 全局筛选" })
    fireEvent.change(headerSearch, { target: { value: "not-present" } })
    expect((screen.getByRole("textbox", { name: "筛选结果" }) as HTMLInputElement).value).toBe("not-present")
    expect(host.stateValue.filterStatesByTool?.["duplicate-files"]?.text.pattern).toBe("not-present")
    expect(screen.getByText("没有匹配当前筛选的结果。")).toBeTruthy()

    chooseTool("空文件")
    view.rerender(<Component compId="kisaki" host={host} />)
    expect((screen.getByRole("textbox", { name: "Kisaki 全局筛选" }) as HTMLInputElement).value).toBe("")

    chooseTool("重复文件")
    view.rerender(<Component compId="kisaki" host={host} />)
    expect((screen.getByRole("textbox", { name: "Kisaki 全局筛选" }) as HTMLInputElement).value).toBe("not-present")
  })

  test("maps a stopped core result to a recoverable stopped GUI state", async () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" }, () => ({ ...sample, stopped: true }))
    const view = render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "开始扫描" }))
    await waitFor(() => expect(host.stateValue.phase).toBe("stopped"))
    view.rerender(<Component compId="kisaki" host={host} />)
    expect(screen.getByRole("status").textContent).toContain("Found 1 item(s).")
    expect(screen.getByText("扫描已停止，没有返回结果。")).toBeTruthy()
  })

  test("persists bounded scan and operation activity logs and clears them from the viewer", async () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", result: resultFor({ tool: "duplicate-files" }), analysisPanelTab: "operations" }, resultFor)
    const view = render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "开始扫描" }))
    await waitFor(() => expect(host.stateValue.activityLog?.map((entry) => entry.kind)).toEqual(["system", "scan", "progress", "scan"]))
    expect(host.stateValue.activityLog?.[0]).toMatchObject({ level: "warning" })
    expect(host.stateValue.activityLog?.at(-1)?.level).toBe("success")

    fireEvent.click(screen.getByRole("checkbox", { name: "选择 duplicate-files-result.dat" }))
    fireEvent.click(screen.getByRole("button", { name: /删除已选/ }))
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }))
    await waitFor(() => expect(host.stateValue.activityLog?.some((entry) => entry.action === "delete" && entry.level === "success")).toBe(true))
    const logsTab = within(screen.getByTestId("czkawka-card-tabs-analysis")).getByRole("tab", { name: "活动日志" })
    fireEvent.pointerDown(logsTab, { button: 0, ctrlKey: false }); fireEvent.mouseDown(logsTab, { button: 0 }); fireEvent.click(logsTab)
    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "清空活动日志" }))
    expect(host.stateValue.activityLog).toEqual([])
    expect(screen.getByText("没有匹配的日志")).toBeTruthy()
  })

  test("persists the Czkawka 12 cache notice once from the GUI scan action", async () => {
    await i18n.changeLanguage("en")
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" }, resultFor)
    render(<Component compId="czkawka-cache-notice" host={host} />)

    await screen.getByRole("button", { name: "Start scan" }).click()
    await waitFor(() => expect(host.stateValue.czkawkaCacheSourceVersion).toBe("12.0.0"))
    expect(host.stateValue.czkawkaCacheRegenerationNoticeSourceVersion).toBe("12.0.0")
    expect(host.stateValue.activityLog?.filter((entry) => entry.kind === "system" && entry.level === "warning")).toHaveLength(1)

    await screen.getByRole("button", { name: "Start scan" }).click()
    await waitFor(() => expect(host.calls).toHaveLength(2))
    expect(host.stateValue.activityLog?.filter((entry) => entry.kind === "system" && entry.level === "warning")).toHaveLength(1)
  })

  test("does not repeat the Czkawka 12 cache notice when the persisted sentinel is current", async () => {
    await i18n.changeLanguage("en")
    const host = createHost({
      tool: "duplicate-files",
      includedDirectoriesText: "D:/media",
      czkawkaCacheSourceVersion: "12.0.0",
      czkawkaCacheRegenerationNoticeSourceVersion: "12.0.0",
    }, resultFor)
    render(<Component compId="czkawka-cache-notice-current" host={host} />)

    await screen.getByRole("button", { name: "Start scan" }).click()
    await waitFor(() => expect(host.calls).toHaveLength(1))
    expect(host.stateValue.activityLog?.some((entry) => entry.kind === "system" && entry.level === "warning")).toBe(false)
  })

  test("sends shared safe move options and renders detailed per-item results", async () => {
    const operationData: KisakiData = { action: "move", tool: "similar-images", groups: [{ id: 0, totalBytes: 0, reclaimableBytes: 0, entries: [{ id: "op:0", groupId: 0, path: "D:/album/a.jpg", name: "a.jpg", size: 0, modifiedDate: 0, secondaryPath: "E:/Review/album/a (1).jpg", operation: "copy", conflictPolicy: "rename", status: "planned" }] }], entries: [{ id: "op:0", groupId: 0, path: "D:/album/a.jpg", name: "a.jpg", size: 0, modifiedDate: 0, secondaryPath: "E:/Review/album/a (1).jpg", operation: "copy", conflictPolicy: "rename", status: "planned" }], messages: "", stopped: false, groupCount: 1, fileCount: 1, totalBytes: 0, reclaimableBytes: 0, affectedCount: 1, errorCount: 0 }
    const initialResult = resultFor({ tool: "similar-images" })
    const host = createHost({ tool: "similar-images", includedDirectoriesText: "D:/album", result: initialResult, destinationDirectory: "E:/Review", copyMode: true, preserveStructure: true, conflictPolicy: "rename", dryRun: true, analysisPanelTab: "operations" }, (input) => input.action === "move" ? operationData : initialResult)
    const view = render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 similar-images-result.dat" }))
    fireEvent.click(screen.getByRole("button", { name: "move selected" }))
    fireEvent.click(screen.getByRole("button", { name: "确认移动" }))
    await waitFor(() => expect(host.calls.at(-1)?.input).toMatchObject({ action: "move", tool: "similar-images", selectedPaths: ["similar-images-result.dat"], destinationDirectory: "E:/Review", copyMode: true, preserveStructure: true, conflictPolicy: "rename", dryRun: true }))
    view.rerender(<Component compId="kisaki" host={host} />)
    expect(screen.getByText("上次操作详情")).toBeTruthy()
    expect(screen.getByText(/E:\/Review\/album\/a \(1\)\.jpg/)).toBeTruthy()
  })

  test("expands a selected similar-image row into a shared multi-destination group plan", async () => {
    const entries = [{ id: "a", groupId: 7, path: "D:/photos/a.jpg", name: "a.jpg", size: 1, modifiedDate: 1 }, { id: "b", groupId: 7, path: "D:/photos/b.jpg", name: "b.jpg", size: 1, modifiedDate: 1 }]
    const result: KisakiData = { ...sample, tool: "similar-images", groups: [{ id: 7, entries, totalBytes: 2, reclaimableBytes: 1 }], entries, groupCount: 1, fileCount: 2, totalBytes: 2, reclaimableBytes: 1 }
    const host = createHost({ tool: "similar-images", result, dryRun: true, analysisPanelTab: "operations" }, () => ({ ...sample, action: "move", tool: "similar-images" }))
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 a.jpg" }))
    fireEvent.click(screen.getByRole("button", { name: "整理相似组（2）" }))
    fireEvent.click(screen.getByRole("button", { name: "确认整理" }))
    await waitFor(() => expect(host.calls.at(-1)?.input).toMatchObject({ action: "move", selectedPaths: ["D:/photos/a.jpg", "D:/photos/b.jpg"], destinationItems: [{ path: "D:/photos/a.jpg", destination: "D:/photos/variants_0007" }, { path: "D:/photos/b.jpg", destination: "D:/photos/variants_0007" }], dryRun: true }))
  })

  test("exports all full result rows independently from the current selection", async () => {
    const entries = [{ id: "a", groupId: 0, path: "D:/a.jpg", name: "a.jpg", size: 10, modifiedDate: 1, width: 100, height: 80 }, { id: "b", groupId: 0, path: "D:/b.jpg", name: "b.jpg", size: 11, modifiedDate: 2, similarity: "3" }]
    const result: KisakiData = { ...sample, tool: "similar-images", groups: [{ id: 0, entries, totalBytes: 21, reclaimableBytes: 10 }], entries, groupCount: 1, fileCount: 2, totalBytes: 21, reclaimableBytes: 10 }
    const host = createHost({ tool: "similar-images", result, exportScope: "all", outputPath: "D:/result.json", analysisPanelTab: "operations" })
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "save selected" }))
    await waitFor(() => expect(host.calls.at(-1)?.input).toMatchObject({ action: "save", exportScope: "all", selectedPaths: ["D:/a.jpg", "D:/b.jpg"], exportEntries: entries, outputPath: "D:/result.json", dryRun: false }))
  })

  test("builds a selected bad-extension rename plan with an undo hint", async () => {
    const entry = { id: "bad", groupId: 0, path: "D:/photo.bin", name: "photo.bin", size: 10, modifiedDate: 1, properExtension: "jpg" }
    const result: KisakiData = { ...sample, tool: "bad-extensions", groups: [{ id: 0, entries: [entry], totalBytes: 10, reclaimableBytes: 0 }], entries: [entry], groupCount: 1, fileCount: 1, totalBytes: 10 }
    const host = createHost({ tool: "bad-extensions", result, dryRun: true, analysisPanelTab: "operations" })
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 photo.bin" }))
    fireEvent.click(screen.getByRole("button", { name: "修正扩展名（1）" }))
    expect(screen.getByText(/反向改名/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "确认改名" }))
    await waitFor(() => expect(host.calls.at(-1)?.input).toMatchObject({ action: "rename", selectedPaths: ["D:/photo.bin"], renameItems: [{ path: "D:/photo.bin", properExtension: "jpg" }], dryRun: true }))
  })

  test("builds a selected bad-name rename plan without invoking the upstream mutator", async () => {
    await i18n.changeLanguage("zh")
    const entry = { id: "bad-name", groupId: 0, path: "D:/report-🙂.TXT", name: "report-🙂.TXT", size: 10, modifiedDate: 1, secondaryPath: "D:/report-.txt" }
    const result: KisakiData = { ...sample, tool: "bad-names", groups: [{ id: 0, entries: [entry], totalBytes: 10, reclaimableBytes: 0 }], entries: [entry], groupCount: 1, fileCount: 1, totalBytes: 10 }
    const host = createHost({ tool: "bad-names", result, dryRun: true, analysisPanelTab: "operations" })
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 report-🙂.TXT" }))
    fireEvent.click(screen.getByRole("button", { name: "修正文件名（1）" }))
    expect(screen.getByText(/扫描建议/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "确认改名" }))
    await waitFor(() => expect(host.calls.at(-1)?.input).toMatchObject({ action: "rename", tool: "bad-names", selectedPaths: ["D:/report-🙂.TXT"], renameItems: [{ path: "D:/report-🙂.TXT", targetName: "report-.txt" }], dryRun: true }))
  })

  test("builds a selected EXIF cleanup plan through the safe candidate contract", async () => {
    await i18n.changeLanguage("zh")
    const entry = { id: "exif", groupId: 0, path: "D:/photo.jpg", name: "photo.jpg", size: 10, modifiedDate: 1, exifTags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] }
    const result: KisakiData = { ...sample, tool: "exif-remover", groups: [{ id: 0, entries: [entry], totalBytes: 10, reclaimableBytes: 0 }], entries: [entry], groupCount: 1, fileCount: 1, totalBytes: 10 }
    const host = createHost({ tool: "exif-remover", result, dryRun: true, analysisPanelTab: "operations" }, () => ({ ...sample, action: "clean-exif", tool: "exif-remover" }), ["scan.exif-remover", "operation.exif.candidate"])
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 photo.jpg" }))
    const cleanExif = screen.getByRole("button", { name: "清理 EXIF（1）" }) as HTMLButtonElement
    await waitFor(() => expect(cleanExif.disabled).toBe(false))
    fireEvent.click(cleanExif)
    expect(await screen.findByText(/移除 1 个 EXIF 标签/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "确认清理 EXIF" }))
    await waitFor(() => expect(host.calls.at(-1)?.input).toMatchObject({ action: "clean-exif", tool: "exif-remover", selectedPaths: ["D:/photo.jpg"], exifItems: [{ path: "D:/photo.jpg", tags: [{ name: "ImageDescription", code: 270, group: "GENERIC" }] }], dryRun: true }))
  })

  test("creates, overwrites, exports, deletes, and reimports persistent scan presets", () => {
    const host = createHost({ tool: "similar-images", includedDirectoriesText: "D:/photos", similarity: "7" })
    const view = render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByText(/扫描配置预设/))
    fireEvent.change(screen.getByRole("textbox", { name: "scan preset name" }), { target: { value: "照片库" } })
    fireEvent.click(screen.getByRole("button", { name: "新建" }))
    expect(host.stateValue.scanPresets).toEqual([expect.objectContaining({ name: "照片库", tool: "similar-images", input: expect.objectContaining({ includedDirectories: ["D:/photos"], similarity: 7 }) })])
    expect(host.stateValue.activeScanPresetId).toBe(host.stateValue.scanPresets?.[0]?.id)

    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.change(screen.getByRole("textbox", { name: "scan preset name" }), { target: { value: "照片库 HQ" } })
    fireEvent.click(screen.getByRole("button", { name: "覆盖" }))
    expect(host.stateValue.scanPresets).toHaveLength(1)
    expect(host.stateValue.scanPresets?.[0]?.name).toBe("照片库 HQ")

    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "导出" }))
    const transfer = screen.getByRole("textbox", { name: "scan preset transfer" }) as HTMLTextAreaElement
    expect(transfer.value).toContain("xiranite.czkawka.scan-presets")
    fireEvent.click(screen.getByRole("button", { name: "删除" }))
    expect(host.stateValue.scanPresets).toEqual([])

    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "导入合并" }))
    expect(host.stateValue.scanPresets?.[0]?.name).toBe("照片库 HQ")
  })

  test("persists custom filter presets in node state", () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", result: resultFor({ tool: "duplicate-files" }) })
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "打开多维筛选" }))
    fireEvent.change(screen.getByRole("textbox", { name: "新预设名称" }), { target: { value: "我的筛选" } })
    fireEvent.click(screen.getByRole("button", { name: /保存/ }))
    expect(host.stateValue.filterPresets).toEqual([expect.objectContaining({ name: "我的筛选" })])
  })

  test("persists the fixed preview switch independently for every tool", () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", result: resultFor({ tool: "duplicate-files" }) })
    const view = render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "启用固定预览" }))
    expect(host.stateValue.previewPanelEnabledByTool).toEqual({ "duplicate-files": true })

    chooseTool("空文件")
    view.rerender(<Component compId="kisaki" host={host} />)
    expect(screen.getByRole("button", { name: "启用固定预览" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "启用固定预览" }))
    expect(host.stateValue.previewPanelEnabledByTool).toEqual({ "duplicate-files": true, "empty-files": true })

    chooseTool("重复文件")
    view.rerender(<Component compId="kisaki" host={host} />)
    expect(screen.getByRole("button", { name: "禁用固定预览" })).toBeTruthy()
  })

  test("switches and persists the similar-image folder result view", () => {
    const entry = { id: "image", groupId: 0, path: "D:/photos/a.jpg", name: "a.jpg", size: 12, modifiedDate: 1, width: 100, height: 80, similarity: "2" }
    const result: KisakiData = { ...sample, tool: "similar-images", groups: [{ id: 0, entries: [entry], totalBytes: 12, reclaimableBytes: 0 }], entries: [entry], groupCount: 1, fileCount: 1, totalBytes: 12, similarFolders: [{ path: "D:/photos", count: 3, bytes: 42, groupCount: 2, previewPath: entry.path }] }
    const host = createHost({ tool: "similar-images", result })
    render(<Component compId="kisaki" host={host} />)
    const foldersTab = screen.getByRole("tab", { name: /文件夹/ })
    fireEvent.pointerDown(foldersTab, { button: 0 })
    fireEvent.mouseDown(foldersTab, { button: 0 })
    fireEvent.click(foldersTab)
    expect(host.stateValue.similarImagesViewMode).toBe("folders")
    expect(screen.getByTestId("czkawka-similar-folders")).toBeTruthy()
    expect(screen.getByText("D:/photos")).toBeTruthy()
    const imagesTab = screen.getByRole("tab", { name: "图片" })
    fireEvent.pointerDown(imagesTab, { button: 0 })
    fireEvent.mouseDown(imagesTab, { button: 0 })
    fireEvent.click(imagesTab)
    expect(host.stateValue.similarImagesViewMode).toBe("images")
    expect(screen.getByTestId("czkawka-result-table")).toBeTruthy()
  })

  test("maps advanced cache settings and isolates outdated cleanup by scanner", () => {
    const state = {
      saveAlsoAsJson: true,
      cacheFolderPath: "D:/cache",
      configFolderPath: "D:/config",
      duplicateMinimalHashCacheSizeKiB: "12",
      duplicateMinimalPrehashCacheSizeKiB: "3",
      deleteOutdatedCacheByTool: { "duplicate-files": false, "similar-images": true },
    }
    expect(scanInput("duplicate-files", state)).toMatchObject({ saveAlsoAsJson: true, deleteOutdatedCache: false, cacheFolderPath: "D:/cache", configFolderPath: "D:/config", duplicateMinimalHashCacheSizeKiB: 12, duplicateMinimalPrehashCacheSizeKiB: 3 })
    expect(scanInput("similar-images", state)).toMatchObject({ saveAlsoAsJson: true, deleteOutdatedCache: true, cacheFolderPath: "D:/cache", configFolderPath: "D:/config" })
  })

  test("adds multiple directories and automatically marks keyword matches as references", async () => {
    const host = createHost({ tool: "duplicate-files", referencePathKeywords: "#compare;reference" })
    host.pickedDirectories = ["D:/photos", "E:/#compare/archive", "F:/reference/library"]
    render(<Component compId="czkawka-multi-directory" host={host} />)
    const included = screen.getByRole("region", { name: "包含目录" })
    fireEvent.click(within(included).getByRole("button", { name: "浏览添加包含目录" }))
    await waitFor(() => expect(host.stateValue.includedDirectoriesText).toBe("D:/photos\nE:/#compare/archive\nF:/reference/library"))
    expect(host.stateValue.includedDirectoriesReferencedText).toBe("E:/#compare/archive\nF:/reference/library")
  })

  test("persists thumbnail visibility independently for supported tools", () => {
    const host = createHost({ tool: "duplicate-files" })
    const view = render(<Component compId="czkawka-thumbnails" host={host} />)
    fireEvent.click(screen.getByRole("switch", { name: "显示结果缩略图" }))
    expect(host.stateValue.thumbnailEnabledByTool).toEqual({ "duplicate-files": false })
    chooseTool("相似图片")
    view.rerender(<Component compId="czkawka-thumbnails" host={host} />)
    expect(screen.getByRole("switch", { name: "显示结果缩略图" }).getAttribute("data-state")).toBe("checked")
  })

  test("renders left and right card collections as persistent tabs", () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", result: resultFor({ tool: "duplicate-files" }), analysisPanelTab: "selection" })
    render(<Component compId="kisaki" host={host} />)
    const sourcePanel = screen.getByTestId("czkawka-card-tabs-source")
    expect(within(sourcePanel).getAllByRole("tab")).toHaveLength(2)
    const algorithmTab = within(sourcePanel).getByRole("tab", { name: /算法|Algorithm/ })
    fireEvent.pointerDown(algorithmTab, { button: 0, ctrlKey: false }); fireEvent.mouseDown(algorithmTab, { button: 0 }); fireEvent.click(algorithmTab)
    expect(host.stateValue.sourceSettingsTab).toBe("algorithm")
    const analysisTabs = screen.getByTestId("czkawka-card-tabs-analysis")
    expect(within(analysisTabs).getByRole("tablist").className).toContain("overflow-hidden")
    expect(within(analysisTabs).getAllByRole("tab").every((tab) => tab.querySelector("svg"))).toBe(true)
    const logsTab = within(analysisTabs).getByRole("tab", { name: "活动日志" })
    fireEvent.pointerDown(logsTab, { button: 0, ctrlKey: false }); fireEvent.mouseDown(logsTab, { button: 0 }); fireEvent.click(logsTab)
    expect(host.stateValue.analysisPanelTab).toBe("logs")
    const operationsTab = within(analysisTabs).getByRole("tab", { name: "文件操作" })
    fireEvent.pointerDown(operationsTab, { button: 0, ctrlKey: false }); fireEvent.mouseDown(operationsTab, { button: 0 }); fireEvent.click(operationsTab)
    expect(host.stateValue.analysisPanelTab).toBe("operations")
  })

  test("persists, minimizes, and resets the desktop workspace layout", () => {
    Object.assign(surface, { mode: "workspace", width: 1440, height: 860 })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" })
    const view = render(<Component compId="kisaki" host={host} />)

    const sourceResize = screen.getByRole("separator", { name: "调整扫描条件宽度" })
    fireEvent.keyDown(sourceResize, { key: "ArrowRight", shiftKey: true })
    expect(host.stateValue.workspaceLayout?.sourcePanelWidth).toBe(332)
    fireEvent.doubleClick(sourceResize)
    expect(host.stateValue.workspaceLayout?.sourcePanelWidth).toBe(300)

    fireEvent.click(screen.getByRole("button", { name: "最小化扫描条件" }))
    expect(host.stateValue.workspaceLayout?.sourcePanelMinimized).toBe(true)
    view.rerender(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "恢复扫描条件" }))
    expect(host.stateValue.workspaceLayout?.sourcePanelMinimized).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "最小化分析与操作" }))
    expect(host.stateValue.workspaceLayout?.analysisPanelMinimized).toBe(true)
  })

  test("reorders the desktop swimlanes from the visible drag handles", () => {
    Object.assign(surface, { mode: "workspace", width: 1440, height: 860 })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" })
    render(<Component compId="kisaki" host={host} />)

    const sourceLane = screen.getByTestId("czkawka-lane-source")
    const analysisLane = screen.getByTestId("czkawka-lane-analysis")
    fireEvent.dragStart(within(sourceLane).getByRole("button", { name: "折叠扫描条件" }))
    fireEvent.dragOver(analysisLane)
    fireEvent.drop(analysisLane)

    expect(host.stateValue.workspaceLayout?.laneOrder).toEqual(["results", "source", "analysis"])
    expect([...screen.getByTestId("czkawka-lane-board").children].map((element) => element.getAttribute("data-testid"))).toEqual(["czkawka-lane-results", "czkawka-lane-source", "czkawka-lane-analysis"])
  })

  test("uses the shared movable bar for lane focus, solo, and fixed-host state", async () => {
    Object.assign(surface, { mode: "workspace", width: 1440, height: 860 })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", workspaceLayout: { ...KISAKI_WORKSPACE_DEFAULTS, navigatorDock: "top", navigatorLane: "analysis", navigatorFollowsFocus: false } })
    render(<Component compId="kisaki" host={host} />)

    fireEvent.click(screen.getByRole("button", { name: /切换到.*分析与操作/ }))
    expect(host.stateValue.workspaceLayout?.activeLane).toBe("analysis")

    const handle = screen.getByRole("button", { name: "拖动或设置泳道切换栏" })
    fireEvent.contextMenu(handle)
    fireEvent.click(screen.getByRole("menuitem", { name: "当前泳道独占视口" }))
    expect(host.stateValue.workspaceLayout?.soloLane).toBe("analysis")
    expect(screen.getByTestId("czkawka-lane-analysis").getAttribute("data-swimlane-solo")).toBe("true")

    expect(host.stateValue.workspaceLayout).toMatchObject({ navigatorDock: "top", navigatorLane: "analysis", navigatorFollowsFocus: false })
    expect(within(screen.getByTestId("czkawka-lane-analysis")).getByRole("navigation", { name: "泳道快速切换" })).toBeTruthy()
    expect(within(screen.getByTestId("czkawka-lane-analysis")).queryByText("分析与操作 / LANE")).toBeNull()
    expect(within(screen.getByRole("navigation", { name: "泳道快速切换" })).queryByText(/切换到/)).toBeNull()

  })

  test("drags a fixed navigator across Kisaki lanes and back to floating", async () => {
    Object.assign(surface, { mode: "workspace", width: 1440, height: 860 })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", workspaceLayout: { ...KISAKI_WORKSPACE_DEFAULTS, navigatorDock: "top", navigatorLane: "results" } })
    render(<Component compId="kisaki" host={host} />)
    const board = screen.getByTestId("czkawka-lane-board")
    const workspace = board.parentElement as HTMLElement
    const source = screen.getByTestId("czkawka-lane-source")
    const results = screen.getByTestId("czkawka-lane-results")
    const analysis = screen.getByTestId("czkawka-lane-analysis")
    workspace.getBoundingClientRect = () => testRect(0, 0, 1_320, 700)
    source.getBoundingClientRect = () => testRect(0, 0, 300, 700)
    results.getBoundingClientRect = () => testRect(300, 0, 720, 700)
    analysis.getBoundingClientRect = () => testRect(1_020, 0, 300, 700)
    const navigator = screen.getByRole("navigation", { name: "泳道快速切换" })
    navigator.getBoundingClientRect = () => testRect(600, 4, 140, 32)

    let handle = screen.getByRole("button", { name: "拖动或设置泳道切换栏" })
    fireEvent.pointerDown(handle, { pointerId: 21, button: 0, clientX: 610, clientY: 16 })
    fireEvent.pointerMove(window, { pointerId: 21, clientX: 292, clientY: 350 })
    await waitFor(() => expect(document.querySelectorAll("[data-swimlane-navigator-dropzone]")).toHaveLength(12))
    fireEvent.pointerUp(window, { pointerId: 21, clientX: 292, clientY: 350 })
    await waitFor(() => expect(host.stateValue.workspaceLayout).toMatchObject({ navigatorDock: "right", navigatorLane: "source" }))
    await waitFor(() => expect(within(source).getByRole("navigation", { name: "泳道快速切换" }).getAttribute("data-swimlane-navigator-dock")).toBe("right"))

    const movedNavigator = within(source).getByRole("navigation", { name: "泳道快速切换" })
    movedNavigator.getBoundingClientRect = () => testRect(252, 260, 40, 140)
    handle = screen.getByRole("button", { name: "拖动或设置泳道切换栏" })
    fireEvent.pointerDown(handle, { pointerId: 22, button: 0, clientX: 270, clientY: 280 })
    fireEvent.pointerMove(window, { pointerId: 22, clientX: 150, clientY: 350 })
    await waitFor(() => expect(source.querySelector('[data-swimlane-navigator-float-zone="true"]')?.getAttribute("data-active")).toBe("true"))
    fireEvent.pointerUp(window, { pointerId: 22, clientX: 150, clientY: 350 })
    await waitFor(() => expect(host.stateValue.workspaceLayout?.navigatorDock).toBe("floating"))
  })

  test("persists proportional viewport fitting from the shared bar", () => {
    Object.assign(surface, { mode: "workspace", width: 1440, height: 860 })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" })
    render(<Component compId="kisaki" host={host} />)

    fireEvent.contextMenu(screen.getByRole("button", { name: "拖动或设置泳道切换栏" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "按当前比例填满视口" }))
    expect(host.stateValue.workspaceLayout?.autoFitToViewport).not.toBe(true)
    fireEvent.contextMenu(screen.getByRole("button", { name: "拖动或设置泳道切换栏" }))
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "常驻按比例适应视口" }))
    expect(host.stateValue.workspaceLayout?.autoFitToViewport).toBe(true)
  })

  test("maps shared swimlane interaction settings into Kisaki state", () => {
    Object.assign(surface, { mode: "workspace", width: 1440, height: 860 })
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media" })
    render(<Component compId="kisaki" host={host} />)

    fireEvent.click(screen.getByRole("button", { name: /节点设置|Node settings/ }))
    const settings = screen.getByRole("dialog")
    expect(within(settings).getByText("泳道焦点与独占")).toBeTruthy()
    fireEvent.click(within(settings).getByRole("switch", { name: "主泳道聚焦时自动独占" }))
    fireEvent.click(within(settings).getByRole("switch", { name: "独占时显示泳道切换栏" }))
    const revealDelay = within(settings).getByRole("spinbutton", { name: "左右泳道展开延迟" })
    fireEvent.change(revealDelay, { target: { value: "420" } })
    fireEvent.blur(revealDelay)
    const focusDelay = within(settings).getByRole("spinbutton", { name: "主泳道悬停重新聚焦延迟" })
    fireEvent.click(within(settings).getByRole("switch", { name: "启用主泳道悬停重新聚焦" }))
    fireEvent.change(focusDelay, { target: { value: "780" } })
    fireEvent.blur(focusDelay)
    fireEvent.click(within(settings).getByRole("switch", { name: "固定栏跟随聚焦泳道" }))

    expect(host.stateValue.workspaceLayout).toMatchObject({
      soloOnFocus: true,
      showNavigatorInSolo: false,
      edgeRevealDelayMs: 420,
      focusOnHover: true,
      focusDelayMs: 780,
      navigatorFollowsFocus: true,
    })
  })

  test("uses shared focus-to-solo and solo navigator behavior", () => {
    Object.assign(surface, { mode: "workspace", width: 1440, height: 860 })
    const host = createHost({
      tool: "duplicate-files",
      includedDirectoriesText: "D:/media",
      workspaceLayout: { ...KISAKI_WORKSPACE_DEFAULTS, soloOnFocus: true, showNavigatorInSolo: false },
    })
    render(<Component compId="kisaki" host={host} />)

    fireEvent.click(screen.getByRole("button", { name: /切换到.*分析与操作/ }))
    expect(host.stateValue.workspaceLayout).toMatchObject({ activeLane: "analysis", soloLane: "analysis" })
    expect(screen.queryByRole("navigation", { name: "泳道快速切换" })).toBeNull()
  })

  test("persists a movable and resizable analysis panel inside the node surface", () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", result: resultFor({ tool: "duplicate-files" }) })
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: "打开浮动分析面板" }))
    expect(host.stateValue.floatingAnalysisPanel?.open).toBe(true)
    const panel = screen.getByTestId("czkawka-floating-analysis")
    const controls = within(panel)
    const moveHandle = controls.getByLabelText("移动浮动分析面板")
    const initialX = host.stateValue.floatingAnalysisPanel!.rect.x
    fireEvent.keyDown(moveHandle, { key: "ArrowLeft" })
    expect(host.stateValue.floatingAnalysisPanel!.rect.x).toBe(initialX - 12)

    const resize = controls.getByRole("separator", { name: "从se方向调整浮动分析面板" })
    fireEvent.pointerDown(resize, { pointerId: 9, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(resize, { pointerId: 9, clientX: 5000, clientY: 5000 })
    fireEvent.pointerUp(resize, { pointerId: 9 })
    const rect = host.stateValue.floatingAnalysisPanel!.rect
    expect(rect.x + rect.width).toBeLessThanOrEqual(1192)
    expect(rect.y + rect.height).toBeLessThanOrEqual(752)

    fireEvent.click(controls.getByRole("button", { name: "关闭浮动分析面板" }))
    expect(host.stateValue.floatingAnalysisPanel?.open).toBe(false)
    expect(screen.queryByTestId("czkawka-floating-analysis")).toBeNull()
  })

  test("persists selection assistant visibility and rule configuration", () => {
    const host = createHost({ tool: "duplicate-files", includedDirectoriesText: "D:/media", result: resultFor({ tool: "duplicate-files" }), analysisPanelTab: "selection" })
    render(<Component compId="kisaki" host={host} />)
    fireEvent.click(screen.getByRole("button", { name: /选择助手/ }))
    expect(host.stateValue.selectionAssistantOpen).toBe(true)
    const textTab = screen.getByRole("tab", { name: "文本规则" })
    fireEvent.pointerDown(textTab, { button: 0 })
    fireEvent.mouseDown(textTab, { button: 0 })
    fireEvent.click(textTab)
    fireEvent.change(screen.getByRole("textbox", { name: "文本规则模式" }), { target: { value: "archive" } })
    expect(host.stateValue.selectionAssistantConfig?.text.pattern).toBe("archive")
  })
})

type TestHost = NodeHostApi<KisakiCardState, Partial<KisakiCardState>> & { stateValue: KisakiCardState; calls: Array<{ nodeId: string; input: KisakiInput }>; cancelCalls: number; pickedDirectory?: string; pickedDirectories?: string[] }
function createHost(initial: KisakiCardState, resultFactory: (input: KisakiInput) => KisakiData = () => sample, nativeCapabilities = ["similar-images.geometric-invariance", "similar-images.same-resolution-exclusion"]): TestHost {
  const host: TestHost = {
    stateValue: initial,
    calls: [],
    cancelCalls: 0,
    contract: { name: "xiranite.node-host", version: "1.0.0", supportedCapabilities: ["contract", "state", "runner"], hasCapability: () => true },
    env: { theme: "light", platform: "web" },
    localFiles: { getUrl: (path) => `local://${path}`, pickDirectory: async () => host.pickedDirectory, pickDirectories: async () => host.pickedDirectories ?? (host.pickedDirectory ? [host.pickedDirectory] : []) },
    state: { getData: () => host.stateValue, patchData: (patch) => { host.stateValue = { ...host.stateValue, ...patch } } },
    runner: { getInfo: async <TInfo,>() => ({ apiVersion: 5, sourceVersion: "12.0.0", capabilities: nativeCapabilities }) as TInfo, run: async <TInput, TData>(nodeId: string, input: TInput, onEvent?: (event: NodeRunEvent) => void): Promise<NodeRunResult<TData>> => { host.calls.push({ nodeId, input: input as KisakiInput }); onEvent?.({ type: "progress", progress: 50, message: "Scanning" }); return { success: true, message: "Found 1 item(s).", data: resultFactory(input as KisakiInput) as TData } }, cancelCurrent: async () => { host.cancelCalls += 1; return true } },
    getData: <T,>() => host.stateValue as T,
    patchData: (_id, patch) => { host.stateValue = { ...host.stateValue, ...patch } },
    listComponents: () => [],
    updateComponent: () => undefined,
  }
  return host
}

function chooseTool(label: string) {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: /选择扫描工具|Select scanner/ }), { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.click(screen.getByRole("option", { name: label }))
}

function testRect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }
}

const sample: KisakiData = { action: "scan", tool: "duplicate-files", groups: [], entries: [], messages: "", stopped: false, groupCount: 0, fileCount: 0, totalBytes: 0, reclaimableBytes: 0, affectedCount: 0, errorCount: 0 }

function resultFor(input: KisakiInput): KisakiData {
  const tool = input.tool ?? "duplicate-files"
  const path = `${tool}-result.dat`
  const entry = { id: path, groupId: 0, path, name: path, size: 10, modifiedDate: 1 }
  const group = { id: 0, entries: [entry], totalBytes: 10, reclaimableBytes: 0 }
  return { action: "scan", tool, groups: [group], entries: [entry], messages: "", stopped: false, groupCount: 1, fileCount: 1, totalBytes: 10, reclaimableBytes: 0, affectedCount: 0, errorCount: 0 }
}
