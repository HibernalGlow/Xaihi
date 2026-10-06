import { expect, test } from "vitest"
import { FINDZ_WORKSPACE_DEFAULTS, findzLanePatch, normalizeFindzWorkspaceLayout, updateFindzWorkspaceLayout } from "./workspace-layout"

test("keeps the existing lane state when applying a single lane dimension", () => {
  const initial = normalizeFindzWorkspaceLayout({
    ...FINDZ_WORKSPACE_DEFAULTS,
    sourceCollapsed: true,
    sourceWidth: 480,
    resultsWidth: 740,
  })

  const resized = updateFindzWorkspaceLayout(initial, findzLanePatch("results", { width: 820 }))
  const restored = updateFindzWorkspaceLayout(resized, findzLanePatch("source", { collapsed: false }))

  expect(resized.sourceCollapsed).toBe(true)
  expect(resized.resultsWidth).toBe(820)
  expect(restored.sourceWidth).toBe(480)
  expect(restored.resultsWidth).toBe(820)
})

test("normalizes stale workspace values without losing the supported lane order", () => {
  const layout = normalizeFindzWorkspaceLayout({
    version: 1,
    laneOrder: ["analysis", "unknown", "analysis"] as never,
    sourceWidth: 1,
    resultsWidth: 99_999,
    analysisWidth: 0,
    activeLane: "unknown" as never,
  })

  expect(layout.laneOrder).toEqual(["analysis", "source", "results"])
  expect(layout.sourceWidth).toBe(260)
  expect(layout.resultsWidth).toBe(1_200)
  expect(layout.analysisWidth).toBe(300)
  expect(layout.activeLane).toBe("results")
})
