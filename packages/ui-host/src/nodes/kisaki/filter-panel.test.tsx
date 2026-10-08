// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createDefaultKisakiFilterState, type KisakiFilterStats } from "@hibernalglow/xaihi-kisaki/filters"
import { KisakiFilterPanel } from "./filter-panel"
import i18n from "@/i18n"

afterEach(async () => { cleanup(); await i18n.changeLanguage("zh") })

const stats: KisakiFilterStats = {
  totalItems: 8,
  filteredItems: 3,
  totalGroups: 3,
  filteredGroups: 2,
  totalBytes: 1_000,
  filteredBytes: 500,
  selectedItems: 1,
  activeFilterCount: 0,
  extensions: [{ extension: "jpg", totalCount: 5, filteredCount: 2, totalBytes: 700, filteredBytes: 400 }],
  categories: [{ category: "images", totalCount: 5, filteredCount: 2 }],
}

describe("KisakiFilterPanel", () => {
  test("renders the complete filter surface in English", async () => {
    await i18n.changeLanguage("en")
    render(<KisakiFilterPanel tool="similar-images" state={createDefaultKisakiFilterState()} stats={{ ...stats, extensions: [...stats.extensions, { extension: "__no_extension__", totalCount: 1, filteredCount: 1, totalBytes: 0, filteredBytes: 0 }] }} presets={[]} onChange={vi.fn()} onPresetsChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Open multidimensional filters" }))
    expect(screen.getByText("Filter presets")).toBeTruthy()
    expect(screen.getByText("Quick text")).toBeTruthy()
    expect(screen.getByText("Resolution / aspect ratio")).toBeTruthy()
    expect(screen.getByRole("button", { name: /No extension 1\/1/ })).toBeTruthy()
    expect(screen.getByText("3/8 files · 2/3 groups · 500 B")).toBeTruthy()
  })

  test("edits shared text and extension state and exposes live statistics", () => {
    const onChange = vi.fn()
    const state = createDefaultKisakiFilterState()
    render(<KisakiFilterPanel tool="duplicate-files" state={state} stats={stats} presets={[]} onChange={onChange} onPresetsChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "打开多维筛选" }))
    expect(screen.getByText("3/8 文件 · 2/3 组 · 500 B")).toBeTruthy()

    fireEvent.change(screen.getByRole("textbox", { name: "快速文本模式" }), { target: { value: "archive" } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ text: expect.objectContaining({ enabled: true, pattern: "archive" }) }))

    fireEvent.click(screen.getByRole("button", { name: "路径字段" }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ text: expect.objectContaining({ fields: ["name", "metadata", "detail"] }) }))

    fireEvent.click(screen.getByRole("button", { name: /jpg 2\/5/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ extension: expect.objectContaining({ enabled: true, extensions: ["jpg"] }) }))

    fireEvent.click(screen.getByRole("button", { name: /图片 2\/5/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ extension: expect.objectContaining({ enabled: true, excludedCategories: ["images"] }) }))
  })

  test("shows media-only filters and resets all categories", () => {
    const onChange = vi.fn()
    const state = createDefaultKisakiFilterState()
    state.fileSize.enabled = true
    render(<KisakiFilterPanel tool="similar-images" state={state} stats={{ ...stats, activeFilterCount: 1 }} pathPatternError="bad expression" presets={[]} onChange={onChange} onPresetsChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "打开多维筛选" }))
    expect(screen.getByText("相似度（%）")).toBeTruthy()
    expect(screen.getByText("分辨率 / 宽高比")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("bad expression")
    fireEvent.click(screen.getByRole("button", { name: /重置/ }))
    expect(onChange).toHaveBeenLastCalledWith(createDefaultKisakiFilterState())
  })

  test("saves, exports, imports, and keyboard-resets presets", () => {
    const onChange = vi.fn()
    const onPresetsChange = vi.fn()
    const state = createDefaultKisakiFilterState()
    state.path = { enabled: true, mode: "contains", pattern: "archive", caseSensitive: false }
    render(<KisakiFilterPanel tool="duplicate-files" state={state} stats={stats} presets={[]} onChange={onChange} onPresetsChange={onPresetsChange} />)
    fireEvent.keyDown(window, { key: "f", ctrlKey: true })
    expect(screen.getByText("筛选预设")).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox", { name: "新预设名称" }), { target: { value: "归档" } })
    fireEvent.click(screen.getByRole("button", { name: /保存/ }))
    expect(onPresetsChange).toHaveBeenCalledWith([expect.objectContaining({ name: "归档", state })])

    fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }))
    const transfer = screen.getByRole("textbox", { name: "预设 JSON" }) as HTMLTextAreaElement
    expect(JSON.parse(transfer.value)).toEqual({ version: 1, presets: [] })
    fireEvent.change(transfer, { target: { value: '{"version":1,"presets":[{"id":"p","name":"P","state":{}}]}' } })
    fireEvent.click(screen.getByRole("button", { name: /导入 JSON/ }))
    expect(onPresetsChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: "p", name: "P" })])

    fireEvent.keyDown(window, { key: "r", ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith(state)
    fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true })
    expect(screen.queryByText("筛选预设")).toBeNull()
    fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true })
    expect(screen.getByText("筛选预设")).toBeTruthy()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onChange).toHaveBeenLastCalledWith(createDefaultKisakiFilterState())
    expect(screen.queryByText("筛选预设")).toBeNull()
  })

  test("overwrites a same-name custom preset and deletes the selected preset", () => {
    const onPresetsChange = vi.fn()
    const state = createDefaultKisakiFilterState()
    state.fileSize.enabled = true
    const existing = { id: "existing", name: "大文件", state: createDefaultKisakiFilterState() }
    render(<KisakiFilterPanel tool="big-files" state={state} stats={stats} presets={[existing]} onChange={vi.fn()} onPresetsChange={onPresetsChange} />)
    fireEvent.click(screen.getByRole("button", { name: "打开多维筛选" }))
    fireEvent.change(screen.getByRole("textbox", { name: "新预设名称" }), { target: { value: "大文件" } })
    fireEvent.click(screen.getByRole("button", { name: /保存/ }))
    expect(onPresetsChange).toHaveBeenLastCalledWith([{ id: "existing", name: "大文件", state }])
    fireEvent.click(screen.getByRole("button", { name: "删除当前预设" }))
    expect(onPresetsChange).toHaveBeenLastCalledWith([])
  })
})
