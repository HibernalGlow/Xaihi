import { describe, expect, test } from "vitest"
import { MODULE_REGISTRY } from "@/components/modules/registry"
import { ALPHABET, getModulesForInitial, getNextAlphabetIndex, getVisibleInitials } from "./AlphabetNodeRail"

describe("getModulesForInitial", () => {
  test("returns registered nodes by display-name initial", () => {
    expect(getModulesForInitial("b").map((module) => module.id)).toContain("bitv")
    expect(getModulesForInitial("S").map((module) => module.id)).toContain("shellect")
  })

  test("does not treat an internal letter as an initial", () => {
    expect(getModulesForInitial("Z")).toEqual([])
  })

  test("视图模块不进节点栏：settings / module-registry / node-history / node-operations", () => {
    expect(getModulesForInitial("M").map((module) => module.id)).toContain("marku")
    expect(getModulesForInitial("M").map((module) => module.id)).not.toContain("module-registry")
    expect(getModulesForInitial("S").map((module) => module.id)).not.toContain("settings")
    expect(getModulesForInitial("R").map((module) => module.id)).not.toContain("node-history")
    expect(getModulesForInitial("N").map((module) => module.id)).not.toContain("node-operations")
  })

  test("cycles through one highlighted letter at a time", () => {
    expect(getNextAlphabetIndex(0, 1)).toBe(1)
    expect(getNextAlphabetIndex(0, -1)).toBe(25)
    expect(getNextAlphabetIndex(25, 1)).toBe(0)
  })
})

describe("getVisibleInitials", () => {
  test("lists the whole alphabet when empty letters are kept", () => {
    expect(getVisibleInitials(MODULE_REGISTRY, false)).toEqual(ALPHABET)
    expect(getVisibleInitials([], false)).toEqual(ALPHABET)
  })

  test("keeps exactly the initials that match at least one node", () => {
    // 期望值出自注册表本身（每个字母有多少节点是直接数出来的），不是把被测函数再叫一遍
    const expected = ALPHABET.filter(
      (letter) => MODULE_REGISTRY.filter((module) => module.name.toLocaleUpperCase().startsWith(letter)).length > 0,
    )
    expect(getVisibleInitials(MODULE_REGISTRY, true)).toEqual(expected)
    // 顺序必须与全集一致（滚动、`PopoverAnchor` 的对齐都按下标算，这里乱了那两处就错位）
    expect(getVisibleInitials(MODULE_REGISTRY, true)).toEqual(ALPHABET.filter((letter) => expected.includes(letter)))
  })

  test("drops an initial that has no node behind it", () => {
    const visible = getVisibleInitials(MODULE_REGISTRY, true)
    expect(visible).toContain("B")
    expect(visible).toContain("S")
    expect(visible).not.toContain("Z")
    expect(visible.length).toBeLessThan(ALPHABET.length)
  })

  test("returns an empty list when nothing is registered at all", () => {
    expect(getVisibleInitials([], true)).toEqual([])
  })
})

describe("getNextAlphabetIndex with a filtered stop set", () => {
  test("steps over the letters that were collapsed", () => {
    // C 与 E 都被收起来了：B(1) 的下一个是 D(3)，D 的上一个是 B
    expect(getNextAlphabetIndex(1, 1, [0, 1, 3])).toBe(3)
    expect(getNextAlphabetIndex(3, -1, [0, 1, 3])).toBe(1)
  })

  test("wraps around the filtered set, not around 26", () => {
    expect(getNextAlphabetIndex(3, 1, [0, 1, 3])).toBe(0)
    expect(getNextAlphabetIndex(0, -1, [0, 1, 3])).toBe(3)
  })

  test("lands on the first stop when the current letter was collapsed", () => {
    expect(getNextAlphabetIndex(2, 1, [0, 1, 3])).toBe(0)
    expect(getNextAlphabetIndex(2, -1, [0, 1, 3])).toBe(0)
  })

  test("keeps the index when nothing can be stopped at", () => {
    expect(getNextAlphabetIndex(7, 1, [])).toBe(7)
  })
})
