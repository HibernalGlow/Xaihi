// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { getLocalMediaKind, LocalMediaPreview } from "./LocalMediaPreview"
import { isLocalVideoPath, LocalVideoPreview } from "./LocalVideoPreview"

afterEach(cleanup)

describe("LocalVideoPreview", () => {
  test("recognizes video formats and shared media kinds", () => {
    expect(isLocalVideoPath("D:/clip.M2TS?token=1")).toBe(true)
    expect(isLocalVideoPath("D:/image.jpg")).toBe(false)
    expect(getLocalMediaKind("D:/image.avif")).toBe("image")
    expect(getLocalMediaKind("D:/clip.webm")).toBe("video")
    expect(getLocalMediaKind("D:/track.flac")).toBe("audio")
    expect(getLocalMediaKind("D:/document.pdf")).toBeUndefined()
  })

  test("uses the host URL, metadata preload, and a bounded thumbnail seek", () => {
    const getFileUrl = vi.fn((path: string) => `http://local/${path}`)
    render(<LocalVideoPreview path="D:/clip.mp4" getFileUrl={getFileUrl} />)
    const video = screen.getByLabelText("视频缩略图") as HTMLVideoElement
    expect(video.src).toContain("http://local/")
    expect(video.preload).toBe("metadata")
    Object.defineProperty(video, "duration", { configurable: true, value: 20 })
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(1)
  })

  test("falls back after errors and for unsupported paths", () => {
    const view = render(<LocalVideoPreview path="D:/broken.mp4" getFileUrl={(path) => path} fallback={<span>fallback</span>} />)
    fireEvent.error(screen.getByLabelText("视频缩略图"))
    expect(screen.getByText("fallback")).toBeTruthy()
    view.rerender(<LocalMediaPreview path="D:/document.pdf" fallback={<span>unsupported</span>} />)
    expect(screen.getByText("unsupported")).toBeTruthy()
  })
})
