import { describe, expect, test } from "vitest"

import { formatBytes } from "./format"

describe("formatBytes", () => {
  test("switches units at 1024 and keeps one decimal above 100", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1023)).toBe("1023 B")
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB")
    expect(formatBytes(1500 * 1024)).toBe("1.5 MB")
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB")
  })

  test("does not produce NaN or negative sizes", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B")
    expect(formatBytes(-500)).toBe("0 B")
  })
})
