import { describe, expect, it } from "vitest"

import { activateSwimlane, adjacentSwimlane, effectiveSwimlaneWidth, fitSwimlaneWidthsToViewport, legacySwimlaneSessionState, normalizeSwimlaneOrder, normalizeSwimlanePreferences, reorderSwimlanes } from "./model"

describe("swimlane model", () => {
  it("normalizes persisted order without losing known lanes", () => {
    expect(normalizeSwimlaneOrder(["right", "future", "right"], ["left", "reader", "right"])).toEqual(["right", "left", "reader"])
  })

  it("reorders lanes before the drop target", () => {
    expect(reorderSwimlanes(["left", "reader", "right"], "right", "left")).toEqual(["right", "left", "reader"])
  })

  it("resolves adjacent lanes", () => {
    expect(adjacentSwimlane(["left", "reader", "right"], "reader", "left")).toBe("left")
    expect(adjacentSwimlane(["left", "reader", "right"], "reader", "right")).toBe("right")
  })

  it("keeps solo preference while another lane is active", () => {
    const state = activateSwimlane({ laneOrder: ["reader", "right"], activeLaneId: "reader", soloLaneId: "reader" }, "right")
    expect(state).toEqual({ laneOrder: ["reader", "right"], activeLaneId: "right", soloLaneId: "reader" })
    expect(effectiveSwimlaneWidth(800, false, "reader", state, 1200)).toBe(1200)
    expect(effectiveSwimlaneWidth(800, false, "reader", { ...state, activeLaneId: "reader" }, 1200)).toBe(1200)
  })

  it("normalizes workspace interaction preferences", () => {
    const normalized = normalizeSwimlanePreferences({ activeLaneId: "right", soloLaneId: null, focusOnHover: true, soloOnFocus: true, showNavigatorInSolo: false, focusDelayMs: 10, edgeRevealDelayMs: 9000, barHandleStyle: "groove", barHandlePosition: "right", navigatorDock: "title" as never, navigatorLaneId: "right", navigatorFollowsFocus: true, autoFitToViewport: true })
    expect(normalized).toMatchObject({
      focusOnHover: true,
      soloOnFocus: true,
      showNavigatorInSolo: false,
      focusDelayMs: 200,
      edgeRevealDelayMs: 5000,
      barHandleStyle: "groove",
      barHandlePosition: "right",
      navigatorDock: "top",
      navigatorLaneId: "right",
      navigatorFollowsFocus: true,
      autoFitToViewport: true,
    })
    expect(normalized).not.toHaveProperty("activeLaneId")
    expect(normalized).not.toHaveProperty("soloLaneId")
    expect(legacySwimlaneSessionState({ activeLaneId: "right", soloLaneId: null })).toEqual({ activeLaneId: "right", soloLaneId: null })
  })

  it("fits expanded lanes proportionally while reserving collapsed and minimum widths", () => {
    expect(fitSwimlaneWidthsToViewport(1_000, [
      { id: "left", width: 300, minimumWidth: 200 },
      { id: "reader", width: 600, minimumWidth: 300 },
      { id: "right", width: 300, collapsed: true, collapsedWidth: 44 },
    ])).toEqual({ left: 319, reader: 637 })
    expect(fitSwimlaneWidthsToViewport(500, [
      { id: "left", width: 200, minimumWidth: 240 },
      { id: "right", width: 800, minimumWidth: 240 },
    ])).toEqual({ left: 240, right: 260 })
  })
})
