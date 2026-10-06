// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest"
import {
  XIRANITE_MODULE_MIME,
  acceptModuleDragOver,
  getModuleDragData,
  isModuleDrag,
  setModuleDragData,
} from "./moduleDragDrop"

describe("moduleDragDrop", () => {
  test("writes and reads xiranite module payloads", () => {
    const store = new Map<string, string>()
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: {
        effectAllowed: "all",
        dropEffect: "none",
        types: [XIRANITE_MODULE_MIME],
        setData: vi.fn((type: string, value: string) => store.set(type, value)),
        getData: vi.fn((type: string) => store.get(type) ?? ""),
      },
    }

    setModuleDragData(event as never, "repacku")
    event.dataTransfer.types = [XIRANITE_MODULE_MIME, "text/plain"]

    expect(event.dataTransfer.effectAllowed).toBe("copy")
    expect(isModuleDrag(event as never)).toBe(true)
    expect(getModuleDragData(event as never)).toEqual({ moduleId: "repacku" })
    expect(acceptModuleDragOver(event as never)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.dataTransfer.dropEffect).toBe("copy")
  })

  test("falls back to text/plain for externally composed drags", () => {
    const event = {
      dataTransfer: {
        types: ["text/plain"],
        getData: vi.fn((type: string) => type === "text/plain" ? "enginev" : ""),
      },
    }

    expect(getModuleDragData(event as never)).toEqual({ moduleId: "enginev" })
    expect(isModuleDrag(event as never)).toBe(false)
  })
})
