import { describe, expect, test } from "vitest"
import { supportsNativeFileClipboard } from "./hostApi"
import { parentLocalPath } from "@/backend/localFilesClient"

describe("node host local path helpers", () => {
  test("finds the parent for slash variants", () => {
    expect(parentLocalPath("D:\\Media\\image.jpg")).toBe("D:/Media")
    expect(parentLocalPath("/home/user/image.jpg")).toBe("/home/user")
  })

  test("only advertises native file clipboard support on Windows", () => {
    expect(supportsNativeFileClipboard("Win32", "Mozilla/5.0")).toBe(true)
    expect(supportsNativeFileClipboard("", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(true)
    expect(supportsNativeFileClipboard("Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)")).toBe(false)
  })
})
