// @vitest-environment node
import { describe, expect, test } from "vitest"

import { MODULE_REGISTRY, RETIRED_MODULE_DEFS, getModule } from "./registry"

const RETIRED_IDS = ["calculator", "clock", "counter", "scratch", "tasks"]

describe("retired toy modules", () => {
  test("are absent from the catalogue but still resolve through getModule", () => {
    const catalogIds = new Set(MODULE_REGISTRY.map((module) => module.id))
    for (const id of RETIRED_IDS) {
      expect(catalogIds.has(id)).toBe(false)
      expect(getModule(id)?.name).toBeTruthy()
    }
  })

  test("the catalogue itself is not empty, so absence means something", () => {
    expect(MODULE_REGISTRY.length).toBeGreaterThan(10)
    expect(MODULE_REGISTRY.some((module) => module.id === "settings")).toBe(true)
    expect(getModule("does.not.exist")).toBeUndefined()
  })

  test("the retired list holds exactly the five toy ids", () => {
    expect(RETIRED_MODULE_DEFS.map((module) => module.id).sort()).toEqual(RETIRED_IDS)
  })
})
