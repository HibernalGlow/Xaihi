import { describe, expect, test } from "vitest"
import {
  applyChromeActionPreferences,
  DEFAULT_CHROME_ACTION_ORDER,
  mergeChromeActionKanbanColumns,
  normalizeChromeActionOrder,
  normalizeChromeHiddenActions,
  splitChromeActionKanbanColumns,
} from "./chromeActionPreferences"

describe("chrome action preferences", () => {
  test("normalizes stale, duplicated, and incomplete persisted action orders", () => {
    expect(normalizeChromeActionOrder(["hide", "collapse", "hide", "removed-action"])).toEqual([
      "hide",
      "collapse",
      "node-help",
      "focus",
      "fullscreen",
      "float",
      "moveToView",
      "keepAliveOnViewSwitch",
    ])
    expect(normalizeChromeActionOrder(undefined)).toEqual(DEFAULT_CHROME_ACTION_ORDER)
  })

  test("filters hidden actions and preserves unknown actions after known preferences", () => {
    const actions = [
      { key: "collapse" },
      { key: "exitFocus", preferenceKey: "focus" as const },
      { key: "custom-node-action" },
      { key: "hide" },
    ]

    expect(applyChromeActionPreferences(actions, ["hide", "focus"], ["collapse"])).toEqual([
      { key: "hide" },
      { key: "exitFocus", preferenceKey: "focus" },
      { key: "custom-node-action" },
    ])
  })

  test("ignores invalid hidden action keys", () => {
    expect(normalizeChromeHiddenActions(["hide", "removed-action", "hide"])).toEqual(["hide"])
  })

  test("keeps visible and hidden Kanban lanes independently ordered", () => {
    const columns = splitChromeActionKanbanColumns(["hide", "collapse", "focus"], ["collapse"])
    expect(columns.visible).toEqual(["hide", "focus", "node-help", "fullscreen", "float", "moveToView", "keepAliveOnViewSwitch"])
    expect(columns.hidden).toEqual(["collapse"])

    expect(mergeChromeActionKanbanColumns({
      visible: ["focus", "hide"],
      hidden: ["collapse", "keepAliveOnViewSwitch"],
    })).toEqual({
      order: ["focus", "hide", "collapse", "keepAliveOnViewSwitch", "node-help", "fullscreen", "float", "moveToView"],
      hiddenActions: ["collapse", "keepAliveOnViewSwitch"],
    })
  })
})
