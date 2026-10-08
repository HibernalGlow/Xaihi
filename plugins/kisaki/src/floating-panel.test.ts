import { describe, expect, test } from "vitest"
import { clampKisakiFloatingRect, createDefaultKisakiFloatingPanel, moveKisakiFloatingRect, normalizeKisakiFloatingPanel, resizeKisakiFloatingRect } from "./floating-panel.js"

const viewport = { width: 1000, height: 700 }

describe("Kisaki floating panel geometry", () => {
  test("creates and normalizes a bounded default rectangle", () => {
    const value = createDefaultKisakiFloatingPanel(viewport)
    expect(value.rect.x + value.rect.width).toBeLessThanOrEqual(992)
    expect(normalizeKisakiFloatingPanel({ open: true, rect: { x: -100, y: 900, width: 5000, height: 2 } }, viewport)).toEqual({ open: true, rect: { x: 8, y: 472, width: 900, height: 220 } })
  })

  test("clamps movement to every viewport edge", () => {
    const rect = { x: 100, y: 100, width: 300, height: 300 }
    expect(moveKisakiFloatingRect(rect, -1000, -1000, viewport)).toMatchObject({ x: 8, y: 8 })
    expect(moveKisakiFloatingRect(rect, 1000, 1000, viewport)).toMatchObject({ x: 692, y: 392 })
  })

  test("resizes from southeast and northwest while retaining the opposite edge", () => {
    const rect = { x: 200, y: 150, width: 400, height: 300 }
    expect(resizeKisakiFloatingRect(rect, "se", 1000, 1000, viewport)).toEqual({ x: 92, y: 8, width: 900, height: 684 })
    const northwest = resizeKisakiFloatingRect(rect, "nw", 100, 50, viewport)
    expect(northwest).toEqual({ x: 300, y: 200, width: 300, height: 250 })
    expect(northwest.x + northwest.width).toBe(rect.x + rect.width)
    expect(northwest.y + northwest.height).toBe(rect.y + rect.height)
  })

  test("fits inside very small node surfaces even below normal minimums", () => {
    expect(clampKisakiFloatingRect({ x: 20, y: 20, width: 400, height: 400 }, { width: 220, height: 160 })).toEqual({ x: 8, y: 8, width: 204, height: 144 })
  })
})
