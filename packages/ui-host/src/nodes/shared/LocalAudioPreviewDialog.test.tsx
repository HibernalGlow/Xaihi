// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { LocalAudioPreviewDialog } from "./LocalAudioPreviewDialog"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("LocalAudioPreviewDialog", () => {
  test("plays, seeks, changes volume, renders scan metadata, and navigates", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
    const onActivePathChange = vi.fn()
    render(<LocalAudioPreviewDialog activePath="a.flac" items={[{ path: "a.flac", name: "A", metadata: [{ label: "判断方式", value: "音频指纹" }, { label: "艺术家", value: "Artist" }] }, { path: "b.mp3", name: "B" }]} getFileUrl={(path) => `http://local/${path}`} onActivePathChange={onActivePathChange} />)

    const dialog = within(screen.getByRole("dialog"))
    const audio = document.querySelector("audio")!
    Object.defineProperty(audio, "duration", { configurable: true, value: 180 })
    fireEvent.loadedMetadata(audio)
    expect(dialog.getByText("0:00 / 3:00")).toBeTruthy()
    expect(dialog.getByText("音频指纹")).toBeTruthy()
    expect(dialog.getByText("Artist")).toBeTruthy()

    fireEvent.click(dialog.getByRole("button", { name: "播放音频" }))
    expect(play).toHaveBeenCalledTimes(1)
    fireEvent.play(audio)
    fireEvent.click(dialog.getByRole("button", { name: "暂停音频" }))
    expect(pause).toHaveBeenCalledTimes(1)
    fireEvent.change(dialog.getByRole("slider", { name: "播放进度" }), { target: { value: "75" } })
    expect(audio.currentTime).toBe(75)
    fireEvent.change(dialog.getByRole("slider", { name: "音量" }), { target: { value: "0.4" } })
    expect(audio.volume).toBe(0.4)
    fireEvent.click(dialog.getByRole("button", { name: "下一个音频" }))
    expect(onActivePathChange).toHaveBeenCalledWith("b.mp3")
  })
})
