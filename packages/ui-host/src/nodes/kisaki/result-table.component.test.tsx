// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { KisakiEntry, KisakiGroup } from "@hibernalglow/xaihi-kisaki/core"
import i18n from "@/i18n"
import { KisakiResultTable } from "./result-table"

afterEach(async () => { cleanup(); await i18n.changeLanguage("zh") })

describe("Kisaki Niko result table", () => {
  test("uses NikoTable and embeds direct local media in the name cell", () => {
    const getFileUrl = vi.fn((path: string) => `http://local/${path}`)
    const imageGroup = { ...group, entries: [entry("a.jpg", "Alpha"), entry("b.avif", "Beta")] }
    render(<KisakiResultTable tool="similar-images" groups={[imageGroup]} running={false} selectedPaths={[]} getFileUrl={getFileUrl} onSelectionChange={vi.fn()} />)
    expect(screen.getByTestId("czkawka-result-table").getAttribute("data-table-engine")).toBe("niko")
    expect(screen.getByTestId("czkawka-result-viewport").getAttribute("data-virtualized")).toBe("false")
    expect(screen.getByRole("button", { name: "预览 a.jpg" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "预览 b.avif" })).toBeTruthy()
    expect(getFileUrl).toHaveBeenCalledWith("a.jpg")
  })

  test("switches scanner-specific columns and language", async () => {
    await i18n.changeLanguage("en")
    const view = render(<KisakiResultTable tool="duplicate-music" groups={[group]} running={false} selectedPaths={[]} onSelectionChange={vi.fn()} />)
    expect(screen.getByText("Title")).toBeTruthy()
    expect(screen.getAllByText("Artist").length).toBeGreaterThan(0)
    expect(screen.getByRole("textbox", { name: "Filter results" })).toBeTruthy()
    view.rerender(<KisakiResultTable tool="similar-images" groups={[group]} running={false} selectedPaths={[]} onSelectionChange={vi.fn()} />)
    expect(screen.getByText("Similarity")).toBeTruthy()
    expect(screen.getByText("Dimensions")).toBeTruthy()
    view.rerender(<KisakiResultTable tool="similar-videos" groups={[group]} running={false} selectedPaths={[]} onSelectionChange={vi.fn()} />)
    expect(screen.getAllByText("23.98 fps").length).toBeGreaterThan(0)
    expect(screen.getAllByText("H.264").length).toBeGreaterThan(0)
  })

  test("keeps row and group selection while protecting references", () => {
    const onSelectionChange = vi.fn()
    const referenceGroup = { ...group, entries: [{ ...entry("ref.mp3", "Reference"), isReference: true }, entry("b.mp3", "Beta")] }
    render(<KisakiResultTable tool="empty-files" groups={[referenceGroup]} running={false} selectedPaths={[]} onSelectionChange={onSelectionChange} />)
    expect(screen.getByRole("checkbox", { name: "选择 ref.mp3" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 b.mp3" }))
    expect(onSelectionChange).toHaveBeenLastCalledWith(["b.mp3"])
    fireEvent.click(screen.getAllByRole("button", { name: /01/ })[0]!)
    expect(onSelectionChange).toHaveBeenLastCalledWith(["b.mp3"])
  })

  test("uses Niko virtualization for large result sets", () => {
    const many = { ...group, entries: Array.from({ length: 10_000 }, (_, index) => entry(`file-${index}.mp3`, `Track ${index}`)) }
    const { container } = render(<KisakiResultTable tool="empty-files" groups={[many]} running={false} selectedPaths={[]} onSelectionChange={vi.fn()} />)
    expect(screen.getByTestId("czkawka-result-viewport").getAttribute("data-virtualized")).toBe("true")
    expect(container.querySelectorAll('[data-slot="table-body"] tr').length).toBeLessThan(80)
  })

  test("removes direct thumbnails without removing result rows", () => {
    const imageGroup = { ...group, entries: [entry("a.jpg", "Alpha")] }
    const { container } = render(<KisakiResultTable tool="similar-images" groups={[imageGroup]} running={false} thumbnailEnabled={false} selectedPaths={[]} onSelectionChange={vi.fn()} />)
    expect(container.querySelectorAll("img")).toHaveLength(0)
    expect(screen.getAllByText("a.jpg").length).toBeGreaterThan(0)
  })

  test("opens direct image preview and fixed media preview", () => {
    const imageGroup = { ...group, entries: [entry("a.jpg", "Alpha"), entry("b.avif", "Beta")] }
    const props = { tool: "similar-images" as const, groups: [imageGroup], running: false, selectedPaths: [], getFileUrl: (path: string) => `http://local/${path}`, onSelectionChange: vi.fn() }
    const view = render(<KisakiResultTable {...props} />)
    fireEvent.click(screen.getByRole("button", { name: "预览 a.jpg" }))
    expect(within(screen.getByRole("dialog")).getByText("1920×1080")).toBeTruthy()
    view.rerender(<KisakiResultTable {...props} previewPanelEnabled onPreviewPanelEnabledChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "预览 b.avif" }))
    expect(screen.getByTestId("local-media-preview-panel")).toBeTruthy()
  })

  test("preserves duplicate-audio fingerprint metadata", () => {
    render(<KisakiResultTable tool="duplicate-music" groups={[group]} running={false} selectedPaths={[]} musicCheckType="fingerprint" musicMaximumDifference="7.5" musicMinimumFragmentDuration="20" musicCompareFingerprintsOnlyWithSimilarTitles getFileUrl={(path) => `http://local/${path}`} onSelectionChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "播放 a.mp3" }))
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByText("音频指纹")).toBeTruthy()
    expect(dialog.getByText("7.5")).toBeTruthy()
    expect(dialog.getByText("20 s")).toBeTruthy()
    expect(dialog.getByText("仅相似标题")).toBeTruthy()
    expect(dialog.getByText("320 kbps")).toBeTruthy()
  })

  test("offers host context actions from Niko rows", async () => {
    const onCopyText = vi.fn(async () => undefined), onOpenPath = vi.fn(async () => undefined)
    const { container } = render(<KisakiResultTable tool="empty-files" groups={[group]} running={false} selectedPaths={[]} onCopyText={onCopyText} onOpenPath={onOpenPath} onSelectionChange={vi.fn()} />)
    const row = container.querySelector('[data-row-id="a.mp3"]') as HTMLElement
    fireEvent.contextMenu(row)
    fireEvent.click(await screen.findByText("复制路径"))
    expect(onCopyText).toHaveBeenCalledWith("a.mp3")
    fireEvent.contextMenu(row)
    fireEvent.click(await screen.findByText("打开"))
    expect(onOpenPath).toHaveBeenCalledWith("a.mp3")
  })

  test("keeps the controlled filter synchronized and renders localized empty states", () => {
    const onFilterTextChange = vi.fn()
    const view = render(<KisakiResultTable tool="empty-files" groups={[group]} running={false} filterText="b.mp3" selectedPaths={[]} onFilterTextChange={onFilterTextChange} onSelectionChange={vi.fn()} />)
    expect(screen.getAllByText("b.mp3").length).toBeGreaterThan(0)
    expect(screen.queryByText("a.mp3")).toBeNull()
    fireEvent.change(screen.getByRole("textbox", { name: "筛选结果" }), { target: { value: "missing" } })
    expect(onFilterTextChange).toHaveBeenCalledWith("missing")
    view.rerender(<KisakiResultTable tool="empty-files" groups={[group]} running={false} filterText="missing" selectedPaths={[]} onFilterTextChange={onFilterTextChange} onSelectionChange={vi.fn()} />)
    expect(screen.getByText("没有匹配当前筛选的结果。")).toBeTruthy()
  })

  test("renders recoverable error and stopped states", () => {
    const retry = vi.fn(async () => undefined)
    const view = render(<KisakiResultTable tool="empty-files" groups={[]} running={false} phase="error" statusMessage="Scanner failed" selectedPaths={[]} onRetry={retry} onSelectionChange={vi.fn()} />)
    expect(screen.getByRole("alert").textContent).toContain("Scanner failed")
    fireEvent.click(screen.getByRole("button", { name: "重新扫描" }))
    expect(retry).toHaveBeenCalledOnce()
    view.rerender(<KisakiResultTable tool="empty-files" groups={[]} running={false} phase="stopped" statusMessage="Stopped by user" selectedPaths={[]} onRetry={retry} onSelectionChange={vi.fn()} />)
    expect(screen.getByRole("status").textContent).toContain("Stopped by user")
    expect(screen.getByText("扫描已停止，没有返回结果。")).toBeTruthy()
  })
})

const entries: KisakiEntry[] = [entry("a.mp3", "Alpha"), entry("b.mp3", "Beta")]
const group: KisakiGroup = { id: 0, entries, totalBytes: 30, reclaimableBytes: 10 }
function entry(path: string, title: string): KisakiEntry { return { id: path, groupId: 0, path, name: path, size: path.startsWith("a") ? 10 : 20, modifiedDate: 1, title, artist: "Artist", genre: "Rock", year: "2025", bitrate: 320, length: "03:00", width: 1920, height: 1080, fps: 23.98, codec: "H.264", similarity: "98%" } }
