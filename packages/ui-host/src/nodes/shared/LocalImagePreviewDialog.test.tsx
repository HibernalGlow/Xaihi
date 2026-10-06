// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { LocalImagePreviewDialog } from "./LocalImagePreviewDialog"

afterEach(cleanup)

describe("LocalImagePreviewDialog", () => {
  test("renders metadata and navigates by buttons and arrow keys", () => {
    const onActivePathChange = vi.fn()
    render(<LocalImagePreviewDialog activePath="a.jpg" items={[{ path: "a.jpg", name: "A", metadata: [{ label: "大小", value: "10 B" }] }, { path: "b.jpg", name: "B" }]} getFileUrl={(path) => `http://local/${path}`} onActivePathChange={onActivePathChange} />)
    expect(screen.getByText("10 B")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "下一张图片" }))
    expect(onActivePathChange).toHaveBeenCalledWith("b.jpg")
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" })
    expect(onActivePathChange).toHaveBeenCalledWith("b.jpg")
    fireEvent.click(screen.getByRole("button", { name: "关闭图片预览" }))
    expect(onActivePathChange).toHaveBeenCalledWith(undefined)
  })
})
