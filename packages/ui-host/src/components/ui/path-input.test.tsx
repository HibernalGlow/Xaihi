// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { useState } from "react"
import type { NodeLocalFilesCapability } from "@xiranite/contract"
import { LocalFilesProvider } from "@/nodes/shared/useLocalFileDrop"
import { PathInput, PathTextarea } from "./path-input"

afterEach(cleanup)

describe("path controls", () => {
  test("append, deduplicate and edit path lines", async () => {
    const handlers = new Map<string, (paths: string[]) => void>()
    const localFiles: NodeLocalFilesCapability = {
      getUrl: (path) => path,
      subscribeDrops: async (targetId, handler) => { handlers.set(targetId, handler); return () => handlers.delete(targetId) },
    }
    render(<LocalFilesProvider value={localFiles}><TextareaProbe /></LocalFilesProvider>)
    const control = screen.getByLabelText("paths")
    const targetId = control.getAttribute("data-local-file-drop-target")!
    await waitFor(() => expect(handlers.has(targetId)).toBe(true))
    handlers.get(targetId)?.(["D:/a.png", "D:/b.png"])
    await waitFor(() => expect((control as HTMLTextAreaElement).value).toBe("D:/a.png\nD:/b.png"))

    const duplicate = new File(["x"], "a.png")
    Object.defineProperty(duplicate, "path", { value: "D:/a.png" })
    fireEvent.drop(control, { dataTransfer: { files: [duplicate] } })
    expect((control as HTMLTextAreaElement).value).toBe("D:/a.png\nD:/b.png")
    fireEvent.change(control, { target: { value: "D:/manual" } })
    expect((control as HTMLTextAreaElement).value).toBe("D:/manual")
  })

  test("single path inputs replace their value and honor extensions", () => {
    render(<InputProbe />)
    const control = screen.getByLabelText("image path")
    const image = new File(["x"], "cover.png")
    Object.defineProperty(image, "path", { value: "D:/cover.png" })
    fireEvent.drop(control, { dataTransfer: { files: [image] } })
    expect((control as HTMLInputElement).value).toBe("D:/cover.png")
  })

  test("auto-resizing path textareas keep a bounded height", () => {
    render(<PathTextarea aria-label="bounded paths" autoResize={{ minHeight: 40, maxHeight: 112 }} value="D:/single" onValueChange={() => undefined} />)
    const control = screen.getByLabelText("bounded paths") as HTMLTextAreaElement
    expect(Number(control.rows)).toBe(1)
    expect(control.style.minHeight).toBe("40px")
    expect(control.style.maxHeight).toBe("112px")
  })
})

function TextareaProbe() {
  const [value, setValue] = useState("D:/a.png")
  return <PathTextarea aria-label="paths" value={value} onValueChange={setValue} />
}

function InputProbe() {
  const [value, setValue] = useState("D:/old.png")
  return <PathInput aria-label="image path" extensions={[".png"]} value={value} onValueChange={setValue} />
}
