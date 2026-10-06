import { describe, expect, it } from "vitest"
import type { AppNodeEntry, HeadlessNodePackage } from "@xiranite/contract"
import { resolveNodeMaximizeAction } from "./nodeWindowPreferences"

const headless = { def: {} as HeadlessNodePackage["def"], core: {} } satisfies HeadlessNodePackage

describe("node window preferences", () => {
  it("keeps ordinary nodes on native maximise", () => {
    expect(resolveNodeMaximizeAction(headless)).toBe("maximize")
    expect(resolveNodeMaximizeAction({ ...headless, Component: () => null } satisfies AppNodeEntry)).toBe("maximize")
  })

  it("maps an explicit fullscreen preference to the independent-window action", () => {
    const entry = {
      ...headless,
      Component: () => null,
      window: { maximizeBehavior: "fullscreen" },
    } satisfies AppNodeEntry

    expect(resolveNodeMaximizeAction(entry)).toBe("toggle-fullscreen")
  })
})
