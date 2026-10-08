import { describe, expect, test } from "vitest"
import type { KisakiEntry, KisakiGroup } from "@hibernalglow/xaihi-kisaki/core"
import { applyBoxSelection, applyResultSelection, calculateVirtualWindow, KISAKI_RESULT_COLUMNS, filterAndSortResultGroups, flattenResultRows, formatReversePath } from "./result-table"

const entries = [entry("a", 30), entry("b", 10), entry("c", 20)]
const group: KisakiGroup = { id: 0, entries, totalBytes: 60, reclaimableBytes: 30 }

describe("Kisaki result table model", () => {
  test("defines fork-specific columns for every tool", () => {
    expect(Object.keys(KISAKI_RESULT_COLUMNS)).toHaveLength(12)
    expect(KISAKI_RESULT_COLUMNS["similar-images"].map((item) => item.id)).toEqual(expect.arrayContaining(["similarity", "dimensions", "groupSize"]))
    expect(KISAKI_RESULT_COLUMNS["similar-videos"].map((item) => item.id)).toEqual(expect.arrayContaining(["fps", "codec", "bitrate", "length"]))
    expect(KISAKI_RESULT_COLUMNS["duplicate-music"].map((item) => item.id)).toEqual(expect.arrayContaining(["title", "artist", "year", "bitrate", "length"]))
    expect(KISAKI_RESULT_COLUMNS["invalid-symlinks"].map((item) => item.id)).toEqual(expect.arrayContaining(["target", "error"]))
    expect(KISAKI_RESULT_COLUMNS["bad-extensions"].map((item) => item.id)).toEqual(expect.arrayContaining(["currentExtension", "properExtension"]))
    expect(KISAKI_RESULT_COLUMNS["bad-names"].map((item) => item.id)).toEqual(expect.arrayContaining(["path", "target"]))
    expect(KISAKI_RESULT_COLUMNS["exif-remover"].map((item) => item.id)).toEqual(expect.arrayContaining(["path", "exifTags"]))
  })

  test("sorts through the active tool column definition", () => {
    const result = filterAndSortResultGroups([group], KISAKI_RESULT_COLUMNS["big-files"], "", { id: "size", descending: true })
    expect(result[0]?.entries.map((item) => item.path)).toEqual(["a", "c", "b"])
  })

  test("supports replace, ctrl toggle, and shift range selection", () => {
    expect(applyResultSelection(["a"], entries, "b", true, "replace")).toEqual(["b"])
    expect(applyResultSelection(["a"], entries, "b", true, "toggle")).toEqual(["a", "b"])
    expect(applyResultSelection(["a"], entries, "c", true, "range", "a")).toEqual(["a", "b", "c"])
  })

  test("applies replace, additive, and subtractive box selection without selecting references", () => {
    const rows = flattenResultRows([{ ...group, entries: [entries[0]!, { ...entries[1]!, isReference: true }, entries[2]!] }])
    expect(applyBoxSelection(["outside"], rows, 0, 104, 52, "replace")).toEqual(["a"])
    expect(applyBoxSelection(["outside"], rows, 52, 156, 52, "add")).toEqual(["outside", "c"])
    expect(applyBoxSelection(["outside", "a", "c"], rows, 52, 156, 52, "remove")).toEqual(["outside", "a"])
  })

  test("calculates a bounded overscanned window for ten thousand rows", () => {
    expect(calculateVirtualWindow(10_000, 0, 520, 52, 8)).toEqual({ start: 0, end: 18 })
    expect(calculateVirtualWindow(10_000, 4_236, 520, 52, 8)).toEqual({ start: 73, end: 100 })
  })

  test("reverses path segments for display without changing the source path", () => {
    expect(formatReversePath("C:\\photos\\2026\\cover.jpg")).toBe("cover.jpg ‹ 2026 ‹ photos ‹ C:")
    expect(formatReversePath("cover.jpg")).toBe("cover.jpg")
  })
})

function entry(path: string, size: number): KisakiEntry { return { id: path, groupId: 0, path, name: `${path}.jpg`, size, modifiedDate: size } }
