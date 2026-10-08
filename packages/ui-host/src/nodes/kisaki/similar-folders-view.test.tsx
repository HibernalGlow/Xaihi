// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { KisakiSimilarFoldersView } from "./similar-folders-view"

afterEach(cleanup)

describe("Kisaki similar folders view", () => {
  test("filters folders and exposes shared host operations", () => {
    const copy = vi.fn(async () => undefined), open = vi.fn(async () => undefined), reveal = vi.fn(async () => undefined)
    const folders = [{ path: "D:/photos", count: 4, bytes: 4096, groupCount: 2, previewPath: "D:/photos/a.jpg" }, { path: "E:/archive", count: 2, bytes: 10, groupCount: 1 }]
    const view = render(<KisakiSimilarFoldersView folders={folders} filterText="photos" getFileUrl={(path) => `local://${path}`} onCopyText={copy} onOpenPath={open} onRevealPath={reveal} />)
    expect(screen.getByText("D:/photos")).toBeTruthy()
    expect(screen.queryByText("E:/archive")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "复制文件夹路径 D:/photos" }))
    fireEvent.click(screen.getByRole("button", { name: "打开文件夹 D:/photos" }))
    fireEvent.click(screen.getByRole("button", { name: "定位文件夹 D:/photos" }))
    expect(copy).toHaveBeenCalledWith("D:/photos")
    expect(open).toHaveBeenCalledWith("D:/photos")
    expect(reveal).toHaveBeenCalledWith("D:/photos")
    view.rerender(<KisakiSimilarFoldersView folders={folders} filterText="missing" />)
    expect(screen.getByText("当前阈值和筛选条件下没有相似文件夹。")).toBeTruthy()
  })
})
