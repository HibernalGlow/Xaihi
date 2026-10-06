// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { useState } from "react"
import type { NodeLocalFilesCapability } from "@xiranite/contract"
import { useLocalFileDrop } from "./useLocalFileDrop"

afterEach(cleanup)

describe("useLocalFileDrop", () => {
  test("routes native paths only to the matching target", async () => {
    const handlers = new Map<string, (paths: string[]) => void>()
    const subscribeDrops: NonNullable<NodeLocalFilesCapability["subscribeDrops"]> = async (targetId, handler) => {
      handlers.set(targetId, handler)
      return () => handlers.delete(targetId)
    }
    render(<><Probe name="first" subscribeDrops={subscribeDrops} /><Probe name="second" subscribeDrops={subscribeDrops} /></>)
    await waitFor(() => expect(handlers.size).toBe(2))

    const second = screen.getByTestId("second")
    handlers.get(second.getAttribute("data-local-file-drop-target")!)?.(["D:/images/second.png"])

    expect(screen.getByTestId("first-value").textContent).toBe("")
    await waitFor(() => expect(screen.getByTestId("second-value").textContent).toBe("D:/images/second.png"))
  })

  test("uses host-provided File.path without a native subscription", () => {
    render(<Probe name="direct" />)
    const file = new File(["image"], "direct.png")
    Object.defineProperty(file, "path", { value: "D:/images/direct.png" })
    fireEvent.drop(screen.getByTestId("direct"), { dataTransfer: { files: [file] } })
    expect(screen.getByTestId("direct-value").textContent).toBe("D:/images/direct.png")
  })

  test("routes ordinary browser files when File.path is unavailable", () => {
    render(<Probe name="browser" acceptBrowserFiles />)
    const file = new File(["audio"], "track.flac", { type: "audio/flac" })
    fireEvent.drop(screen.getByTestId("browser"), { dataTransfer: { files: [file] } })
    expect(screen.getByTestId("browser-value").textContent).toBe("track.flac")
  })

  test("prefers a delayed native path over the earlier pathless DOM file", async () => {
    let nativeDrop: ((paths: string[]) => void) | undefined
    const subscribeDrops: NonNullable<NodeLocalFilesCapability["subscribeDrops"]> = async (_targetId, handler) => { nativeDrop = handler; return () => undefined }
    render(<Probe name="native-first" acceptBrowserFiles subscribeDrops={subscribeDrops} />)
    await waitFor(() => expect(nativeDrop).toBeTypeOf("function"))
    fireEvent.drop(screen.getByTestId("native-first"), { dataTransfer: { files: [new File(["audio"], "track.flac")] } })
    nativeDrop?.(["D:/audio/track.flac"])
    await waitFor(() => expect(screen.getByTestId("native-first-value").textContent).toBe("D:/audio/track.flac"))
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(screen.getByTestId("native-first-value").textContent).toBe("D:/audio/track.flac")
  })

  test("never routes a desktop pathless DOM file into the Wasm queue", async () => {
    const subscribeDrops: NonNullable<NodeLocalFilesCapability["subscribeDrops"]> = async () => () => undefined
    render(<Probe name="desktop-path" acceptBrowserFiles subscribeDrops={subscribeDrops} />)
    fireEvent.drop(screen.getByTestId("desktop-path"), { dataTransfer: { files: [new File(["book"], "book.epub")] } })
    await Promise.resolve()
    expect(screen.getByTestId("desktop-path-value").textContent).toBe("")
  })
})

function Probe(props: { name: string; acceptBrowserFiles?: boolean; subscribeDrops?: NodeLocalFilesCapability["subscribeDrops"] }) {
  const [value, setValue] = useState("")
  const drop = useLocalFileDrop({ subscribeDrops: props.subscribeDrops, onDropPaths: (paths) => setValue(paths.join("\n")), onDropFiles: props.acceptBrowserFiles ? (files) => setValue(files.map((file) => file.name).join("\n")) : undefined })
  return <div><div {...drop.targetProps} data-testid={props.name} /><output data-testid={`${props.name}-value`}>{value}</output></div>
}
