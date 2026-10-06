import { describe, expect, test } from "vitest"
import {
  DEFAULT_SCROLLBAR_DISPLAY_STYLE,
  SCROLLBAR_DISPLAY_STYLES,
} from "./scrollbar-variants"

describe("scrollbar display styles", () => {
  test("exports a stable set of global scrollbar treatments", () => {
    expect(SCROLLBAR_DISPLAY_STYLES).toEqual(["thin", "soft", "solid", "rounded", "minimal", "none"])
    expect(DEFAULT_SCROLLBAR_DISPLAY_STYLE).toBe("soft")
  })
})
