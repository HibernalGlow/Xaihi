// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { KisakiActivityLogEntry } from "@hibernalglow/xaihi-kisaki/activity-log"
import { KisakiActivityLogView } from "./activity-log"

afterEach(cleanup)

describe("KisakiActivityLogView", () => {
  test("filters, copies, and clears persisted activity entries", () => {
    const onCopyText = vi.fn()
    const onClear = vi.fn()
    render(<KisakiActivityLogView entries={entries} onCopyText={onCopyText} onClear={onClear} />)
    expect(screen.getByText("scan complete")).toBeTruthy()
    expect(screen.getByText("delete failed")).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox", { name: "过滤活动日志" }), { target: { value: "delete" } })
    expect(screen.queryByText("scan complete")).toBeNull()
    expect(screen.getByText("delete failed")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "复制活动日志" }))
    expect(onCopyText).toHaveBeenCalledWith(expect.stringContaining("empty-files · operation"))
    fireEvent.click(screen.getByRole("button", { name: "清空活动日志" }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

const entries: KisakiActivityLogEntry[] = [
  { id: "1", timestamp: 1, tool: "duplicate-files", kind: "scan", level: "success", message: "scan complete" },
  { id: "2", timestamp: 2, tool: "empty-files", kind: "operation", level: "error", action: "delete", message: "delete failed", affectedCount: 1, errorCount: 1 },
]
