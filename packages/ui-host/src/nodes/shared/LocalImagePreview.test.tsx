// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { isLocalImagePath, LocalImagePreview } from "./LocalImagePreview"

afterEach(cleanup)

describe("LocalImagePreview", () => {
  test("recognizes direct image formats including AVIF and JXL", () => {
    expect(isLocalImagePath("D:/image.AVIF?token=1")).toBe(true)
    expect(isLocalImagePath("D:/image.jxl#page")).toBe(true)
    expect(isLocalImagePath("D:/video.mp4")).toBe(false)
  })

  test("uses a host URL and supports eager decoding", () => {
    const getFileUrl = vi.fn((path: string) => `http://local/${encodeURIComponent(path)}`)
    render(<LocalImagePreview path="D:/image.avif" getFileUrl={getFileUrl} eager alt="preview" />)
    const image = screen.getByRole("img", { name: "preview" }) as HTMLImageElement
    expect(image.src).toContain("http://local/")
    expect(image.loading).toBe("eager")
    expect(image.decoding).toBe("async")
  })

  test("falls back after load errors and when disabled or unsupported", () => {
    const getFileUrl = vi.fn((path: string) => path)
    const view = render(<LocalImagePreview path="D:/broken.jpg" getFileUrl={getFileUrl} alt="broken" fallback={<span>fallback</span>} />)
    fireEvent.error(screen.getByRole("img", { name: "broken" }))
    expect(screen.getByText("fallback")).toBeTruthy()
    view.rerender(<LocalImagePreview path="D:/image.jpg" getFileUrl={getFileUrl} enabled={false} fallback={<span>disabled</span>} />)
    expect(screen.getByText("disabled")).toBeTruthy()
    view.rerender(<LocalImagePreview path="D:/video.mp4" getFileUrl={getFileUrl} fallback={<span>unsupported</span>} />)
    expect(screen.getByText("unsupported")).toBeTruthy()
  })
})
