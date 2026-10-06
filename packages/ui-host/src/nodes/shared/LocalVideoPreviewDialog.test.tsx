// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { formatMediaTime } from "./LocalMediaPreview"
import { LocalVideoPreviewDialog } from "./LocalVideoPreviewDialog"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("LocalVideoPreviewDialog", () => {
  test("provides playback, seeking, volume, fullscreen, metadata, and navigation", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
    const onActivePathChange = vi.fn()
    render(<LocalVideoPreviewDialog activePath="a.mp4" items={[{ path: "a.mp4", name: "A", metadata: [{ label: "分辨率", value: "1920×1080" }] }, { path: "b.webm", name: "B" }]} getFileUrl={(path) => `http://local/${path}`} onActivePathChange={onActivePathChange} />)

    const dialog = within(screen.getByRole("dialog"))
    const video = dialog.getByText("A").closest("div")?.parentElement?.querySelector("video") ?? document.querySelector("video")!
    Object.defineProperty(video, "duration", { configurable: true, value: 125 })
    fireEvent.loadedMetadata(video)
    expect(dialog.getByText("0:00 / 2:05")).toBeTruthy()
    expect(dialog.getByText("1920×1080")).toBeTruthy()

    fireEvent.click(dialog.getByRole("button", { name: "播放视频" }))
    expect(play).toHaveBeenCalledTimes(1)
    fireEvent.play(video)
    fireEvent.click(dialog.getByRole("button", { name: "暂停视频" }))
    expect(pause).toHaveBeenCalledTimes(1)

    fireEvent.change(dialog.getByRole("slider", { name: "播放进度" }), { target: { value: "65" } })
    expect(video.currentTime).toBe(65)
    expect(dialog.getByText("1:05 / 2:05")).toBeTruthy()
    fireEvent.change(dialog.getByRole("slider", { name: "音量" }), { target: { value: "0.25" } })
    expect(video.volume).toBe(0.25)

    const player = screen.getByTestId("local-video-player")
    const requestFullscreen = vi.fn(async () => undefined)
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen })
    fireEvent.click(dialog.getByRole("button", { name: "进入全屏" }))
    expect(requestFullscreen).toHaveBeenCalledTimes(1)

    fireEvent.click(dialog.getByRole("button", { name: "下一个视频" }))
    expect(onActivePathChange).toHaveBeenCalledWith("b.webm")
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" })
    expect(onActivePathChange).toHaveBeenCalledWith("b.webm")
  })

  test("formats invalid media time safely", () => {
    expect(formatMediaTime(Number.NaN)).toBe("0:00")
    expect(formatMediaTime(-1)).toBe("0:00")
  })
})
