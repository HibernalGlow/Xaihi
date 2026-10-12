// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { KisakiDirectoryEditor } from "./source-inputs"

afterEach(cleanup)

describe("Kisaki directory editor", () => {
  test("accepts an Electron file path dropped on the whole directory area", () => {
    let value = ""
    render(<KisakiDirectoryEditor kind="included" label="包含目录" value={value} onChange={(next) => { value = next }} />)
    const file = new File(["image"], "cover.png")
    Object.defineProperty(file, "path", { value: "/tmp/kisaki/cover.png" })
    fireEvent.drop(screen.getByRole("region", { name: "包含目录" }), { dataTransfer: { files: [file] } })
    expect(value).toBe("/tmp/kisaki/cover.png")
  })
})
