import { describe, expect, test } from "vitest"
import { getModulesForInitial, getNextAlphabetIndex } from "./AlphabetNodeRail"

describe("getModulesForInitial", () => {
  test("returns registered nodes by display-name initial", () => {
    expect(getModulesForInitial("b").map((module) => module.id)).toContain("bandia")
    expect(getModulesForInitial("S").map((module) => module.id)).toContain("smartzip")
  })

  test("does not treat an internal letter as an initial", () => {
    expect(getModulesForInitial("Z")).toEqual([])
  })

  test("cycles through one highlighted letter at a time", () => {
    expect(getNextAlphabetIndex(0, 1)).toBe(1)
    expect(getNextAlphabetIndex(0, -1)).toBe(25)
    expect(getNextAlphabetIndex(25, 1)).toBe(0)
  })
})
