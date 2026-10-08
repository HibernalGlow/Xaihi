import { describe, expect, test } from "vitest"
import { cardsForPanel, createDefaultKisakiCardLayout, moveKisakiCard, moveKisakiCardBy, normalizeKisakiCardLayout, updateKisakiCard } from "./card-layout.js"

describe("Kisaki card layout", () => {
  test("creates a complete versioned registry layout", () => {
    const layout = createDefaultKisakiCardLayout()
    expect(layout.version).toBe(1)
    expect(layout.cards.map((card) => card.id)).toEqual(["source-settings", "preview", "analysis", "logs", "selection", "operations"])
  })

  test("persists visibility, collapse, and clamped height immutably", () => {
    const initial = createDefaultKisakiCardLayout()
    const updated = updateKisakiCard(initial, "logs", { visible: false, collapsed: true, height: 10_000 })
    expect(initial.cards.find((card) => card.id === "logs")?.visible).toBe(true)
    expect(updated.cards.find((card) => card.id === "logs")).toMatchObject({ visible: false, collapsed: true, height: 720 })
    expect(cardsForPanel(updated, "analysis").some((card) => card.id === "logs")).toBe(false)
  })

  test("reorders by keyboard offset and moves across panels", () => {
    let layout = createDefaultKisakiCardLayout()
    layout = moveKisakiCardBy(layout, "logs", -1)
    expect(cardsForPanel(layout, "analysis").map((card) => card.id).slice(0, 3)).toEqual(["preview", "logs", "analysis"])
    layout = moveKisakiCard(layout, "logs", "source", 0)
    expect(cardsForPanel(layout, "source").map((card) => card.id)).toEqual(["logs", "source-settings"])
  })

  test("normalizes missing cards and invalid heights from persisted state", () => {
    const normalized = normalizeKisakiCardLayout({ version: 1, cards: [{ id: "analysis", panel: "analysis", visible: true, collapsed: false, height: -1, order: 4 }] })
    expect(normalized.cards).toHaveLength(6)
    expect(normalized.cards.find((card) => card.id === "analysis")?.height).toBe(220)
  })
})
