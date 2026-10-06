import { describe, expect, test } from "vitest"
import {
  DEFAULT_SLIDER_DISPLAY_STYLE,
  SLIDER_DISPLAY_STYLES,
} from "./slider-variants"

describe("slider display styles", () => {
  test("exports a stable set of global slider treatments", () => {
    expect(SLIDER_DISPLAY_STYLES).toEqual(["solid", "soft", "pill", "line", "minimal", "none"])
    expect(DEFAULT_SLIDER_DISPLAY_STYLE).toBe("solid")
  })
})
