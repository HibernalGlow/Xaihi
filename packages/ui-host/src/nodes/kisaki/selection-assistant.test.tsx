// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createDefaultKisakiSelectionAssistantConfig } from "@hibernalglow/xaihi-kisaki/selection-assistant"
import { KisakiSelectionAssistant } from "./selection-assistant"
import i18n from "@/i18n"

afterEach(async () => { cleanup(); await i18n.changeLanguage("zh") })

function props() {
  return {
    open: true,
    config: createDefaultKisakiSelectionAssistantConfig(),
    stats: { selectedCount: 2, selectedBytes: 30, reclaimableBytes: 20 },
    canUndo: true,
    canRedo: true,
    onOpenChange: vi.fn(),
    onConfigChange: vi.fn(),
    onApply: vi.fn(() => ({ paths: ["a"], matchedPaths: ["a", "b"], affectedCount: 1 })),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClear: vi.fn(),
    onInvert: vi.fn(),
    onSelectAll: vi.fn(),
  }
}

describe("KisakiSelectionAssistant", () => {
  test("edits group criteria and exposes draggable priority controls", () => {
    const value = props()
    render(<KisakiSelectionAssistant {...value} />)
    expect(screen.getByText("2 项 · 30 B · 可回收 20 B")).toBeTruthy()
    const row = document.querySelector("[draggable]")
    expect(row).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /添加排序条件/ }))
    expect(value.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ group: expect.objectContaining({ sortCriteria: expect.arrayContaining([expect.objectContaining({ field: "fileSize" })]) }) }))
    fireEvent.click(screen.getByRole("button", { name: /应用组规则/ }))
    expect(value.onApply).toHaveBeenCalledWith("group")
    expect(screen.getByRole("status").textContent).toContain("已匹配 2 项")
  })

  test("edits text and directory rules and imports exported config", () => {
    const value = props()
    render(<KisakiSelectionAssistant {...value} />)
    fireEvent.pointerDown(screen.getByRole("tab", { name: "文本规则" }), { button: 0 })
    fireEvent.mouseDown(screen.getByRole("tab", { name: "文本规则" }), { button: 0 })
    fireEvent.click(screen.getByRole("tab", { name: "文本规则" }))
    fireEvent.change(screen.getByRole("textbox", { name: "文本规则模式" }), { target: { value: "archive" } })
    expect(value.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ text: expect.objectContaining({ pattern: "archive" }) }))
    fireEvent.pointerDown(screen.getByRole("tab", { name: "目录规则" }), { button: 0 })
    fireEvent.mouseDown(screen.getByRole("tab", { name: "目录规则" }), { button: 0 })
    fireEvent.click(screen.getByRole("tab", { name: "目录规则" }))
    fireEvent.change(screen.getByRole("textbox", { name: "选择规则目录" }), { target: { value: "D:/A\nD:/B" } })
    expect(value.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ directory: expect.objectContaining({ directories: ["D:/A", "D:/B"] }) }))
    fireEvent.click(screen.getByRole("button", { name: /导出配置/ }))
    const transfer = screen.getByRole("textbox", { name: "选择助手配置 JSON" }) as HTMLTextAreaElement
    expect(JSON.parse(transfer.value).version).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: /导入配置/ }))
    expect(value.onConfigChange).toHaveBeenLastCalledWith(value.config)
  })

  test("provides all/invert/clear, history, and application shortcuts", () => {
    const value = props()
    render(<KisakiSelectionAssistant {...value} />)
    fireEvent.click(screen.getByRole("button", { name: /全选可见项/ }))
    fireEvent.click(screen.getByRole("button", { name: /反选可见项/ }))
    fireEvent.click(screen.getByRole("button", { name: /清空选择/ }))
    expect(value.onSelectAll).toHaveBeenCalledOnce()
    expect(value.onInvert).toHaveBeenCalledOnce()
    expect(value.onClear).toHaveBeenCalledOnce()
    fireEvent.keyDown(window, { key: "z", ctrlKey: true })
    fireEvent.keyDown(window, { key: "y", ctrlKey: true })
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true })
    fireEvent.keyDown(window, { key: "Backspace", ctrlKey: true })
    expect(value.onUndo).toHaveBeenCalledOnce()
    expect(value.onRedo).toHaveBeenCalledOnce()
    expect(value.onApply).toHaveBeenCalledWith("group")
    expect(value.onClear).toHaveBeenCalledTimes(2)
  })

  test("reacts to the shared language and renders the complete English assistant", async () => {
    await i18n.changeLanguage("en")
    const value = props()
    value.onApply = vi.fn(() => ({ paths: [], matchedPaths: [], affectedCount: 0, error: "At least one directory is required.", errorCode: "directory-required" as const }))
    render(<KisakiSelectionAssistant {...value} />)
    expect(screen.getByText("Smart selection assistant")).toBeTruthy()
    expect(screen.getByText("2 items · 30 B · 20 B reclaimable")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Group rules" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Apply group rules" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add sort criterion" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Select all visible" })).toBeTruthy()
    expect(screen.queryByText("智能选择助手")).toBeNull()
    fireEvent.pointerDown(screen.getByRole("tab", { name: "Directory rules" }), { button: 0 })
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Directory rules" }), { button: 0 })
    fireEvent.click(screen.getByRole("tab", { name: "Directory rules" }))
    fireEvent.click(screen.getByRole("button", { name: "Apply directory rules" }))
    expect(screen.getByRole("alert").textContent).toBe("At least one directory is required.")
  })
})
