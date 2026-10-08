import { describe, expect, test } from "vitest"

import { addKisakiPaths, addKisakiPathsWithReferences, isValidKisakiExcludedItem, isValidKisakiExtensionToken, parseKisakiExtensionTokens, parseKisakiList, reconcileKisakiReferences, removeKisakiPaths, serializeKisakiExtensionTokens, serializeKisakiPaths, setAllKisakiReferences, toggleKisakiReference } from "./source-inputs.js"

describe("Kisaki source input model", () => {
  test("matches the fork list syntax and removes exact duplicates", () => {
    expect(parseKisakiList('\u2068"D:/Photos"\u2069, E:/Archive;D:/Photos\nF:/More')).toEqual(["D:/Photos", "E:/Archive", "F:/More"])
    expect(serializeKisakiPaths(["D:/Photos", "D:/Photos", "E:/Archive"])).toBe("D:/Photos\nE:/Archive")
  })

  test("adds, removes, and serializes persistent directory lists", () => {
    expect(addKisakiPaths("D:/old", '"E:/new";D:/old')).toEqual(["E:/new", "D:/old"])
    expect(removeKisakiPaths("D:/one\nD:/two\nD:/three", ["D:/two"])).toEqual(["D:/one", "D:/three"])
  })

  test("keeps references constrained to included directories", () => {
    const included = ["D:/one", "D:/two"]
    expect(reconcileKisakiReferences(included, ["D:/two", "D:/missing"])).toEqual(["D:/two"])
    expect(toggleKisakiReference(included, ["D:/two"], "D:/one")).toEqual(["D:/one", "D:/two"])
    expect(toggleKisakiReference(included, ["D:/two"], "D:/two")).toEqual([])
    expect(setAllKisakiReferences(included, true)).toEqual(included)
  })

  test("automatically marks only newly added paths matching reference keywords", () => {
    expect(addKisakiPathsWithReferences("D:/photos", [], ["E:/#compare/archive", "F:/normal"], "#compare; reference")).toEqual({
      paths: ["E:/#compare/archive", "F:/normal", "D:/photos"],
      references: ["E:/#compare/archive"],
    })
    expect(addKisakiPathsWithReferences("D:/#compare/existing", [], [], "#compare").references).toEqual([])
  })

  test("normalizes extension tokens without changing Kisaki macros", () => {
    expect(parseKisakiExtensionTokens(".jpg; png\nIMAGE,jpg")).toEqual(["jpg", "png", "IMAGE"])
    expect(serializeKisakiExtensionTokens([".jpg", "png", "IMAGE", "jpg"])).toBe("jpg,png,IMAGE")
    expect(isValidKisakiExtensionToken("tar.gz")).toBe(false)
    expect(isValidKisakiExtensionToken("jpg")).toBe(true)
    expect(isValidKisakiExcludedItem("cache")).toBe(false)
    expect(isValidKisakiExcludedItem("*/cache/*")).toBe(true)
    expect(isValidKisakiExcludedItem("DEFAULT")).toBe(true)
    expect(isValidKisakiExcludedItem("$TRASH")).toBe(true)
  })
})
