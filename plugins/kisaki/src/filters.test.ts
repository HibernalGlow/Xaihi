import { describe, expect, test } from "vitest"
import type { KisakiEntry, KisakiGroup } from "./core.js"
import { applyKisakiBuiltinFilterPreset, applyKisakiFilters, createDefaultKisakiFilterState, parseKisakiFilterPresets, serializeKisakiFilterPresets } from "./filters.js"

const mb = 1024 * 1024
const now = Date.UTC(2026, 6, 14, 12)
const groups: KisakiGroup[] = [
  group(0, [entry("D:/keep/a.jpg", 120 * mb, { width: 1920, height: 1080, similarity: "98%", modifiedDate: now - 2 * 86_400_000 }), entry("D:/drop/b.png", 2 * mb, { width: 800, height: 600, similarity: "72%", modifiedDate: now - 40 * 86_400_000 }), entry("D:/ref/c.jpg", 1 * mb, { isReference: true })]),
  group(1, [entry("D:/keep/d.mp3", 4 * mb, { modifiedDate: now }), entry("D:/keep/e.mp3", 5 * mb, { modifiedDate: now })]),
]

describe("Kisaki shared filter engine", () => {
  test("combines group and entry filters with AND semantics and unit conversion", () => {
    const state = createDefaultKisakiFilterState()
    state.groupCount = { enabled: true, min: 3, max: 3 }
    state.fileSize = { enabled: true, min: 100, max: 200, unit: "MB" }
    state.extension = { enabled: true, mode: "include", extensions: [".JPG"], excludedCategories: [] }
    state.showAllInFilteredGroups = false
    const result = applyKisakiFilters(groups, [], state, now)
    expect(result.groups.map((item) => item.entries.map((entry) => entry.path))).toEqual([["D:/keep/a.jpg"]])
    expect(result.stats).toMatchObject({ totalItems: 5, filteredItems: 1, totalGroups: 2, filteredGroups: 1, activeFilterCount: 3 })
  })

  test("supports selection and group mark modes while protecting references", () => {
    const state = createDefaultKisakiFilterState()
    state.mark = "group-some-selected"
    expect(applyKisakiFilters(groups, ["D:/keep/a.jpg"], state, now).groups.map((item) => item.id)).toEqual([0])
    state.mark = "unselected"
    state.showAllInFilteredGroups = false
    expect(applyKisakiFilters(groups, ["D:/keep/a.jpg"], state, now).groups[0]?.entries.map((item) => item.path)).toEqual(["D:/drop/b.png"])
    state.mark = "reference"
    expect(applyKisakiFilters(groups, [], state, now).groups[0]?.entries.map((item) => item.path)).toEqual(["D:/ref/c.jpg"])
  })

  test("restores every entry in a group containing a filtered match", () => {
    const state = createDefaultKisakiFilterState()
    state.path = { enabled: true, mode: "contains", pattern: "/drop/", caseSensitive: false }
    state.showAllInFilteredGroups = true
    expect(applyKisakiFilters(groups, [], state, now).groups[0]?.entries).toHaveLength(3)
  })

  test("filters date, similarity, resolution and regex paths", () => {
    const state = createDefaultKisakiFilterState()
    state.modifiedDate = { enabled: true, preset: "last-7-days" }
    state.similarity = { enabled: true, min: 95, max: 100 }
    state.resolution = { enabled: true, minWidth: 1900, minHeight: 1000, aspectRatio: "16:9" }
    state.path = { enabled: true, mode: "regex", pattern: "keep[/\\\\].+\\.jpg$", caseSensitive: false }
    state.showAllInFilteredGroups = false
    expect(applyKisakiFilters(groups, [], state, now).groups[0]?.entries.map((item) => item.path)).toEqual(["D:/keep/a.jpg"])
  })

  test("reports invalid regex and live extension statistics", () => {
    const state = createDefaultKisakiFilterState()
    state.path = { enabled: true, mode: "regex", pattern: "[", caseSensitive: false }
    const invalid = applyKisakiFilters(groups, [], state, now)
    expect(invalid.groups).toEqual([])
    expect(invalid.pathPatternError).toBeTruthy()

    state.path.enabled = false
    const result = applyKisakiFilters(groups, [], state, now)
    expect(result.stats.extensions.find((item) => item.extension === "jpg")).toMatchObject({ totalCount: 2, filteredCount: 2, totalBytes: 121 * mb })
  })

  test.each([
    ["contains", "KEEP", false, ["D:/keep/a.jpg", "D:/keep/d.mp3", "D:/keep/e.mp3"]],
    ["not-contains", "/keep/", false, ["D:/drop/b.png", "D:/ref/c.jpg"]],
    ["starts-with", "D:/ref", true, ["D:/ref/c.jpg"]],
    ["ends-with", ".mp3", true, ["D:/keep/d.mp3", "D:/keep/e.mp3"]],
    ["regex", "[ad]\\.(jpg|mp3)$", false, ["D:/keep/a.jpg", "D:/keep/d.mp3"]],
  ] as const)("supports %s path matching", (mode, pattern, caseSensitive, expected) => {
    const state = createDefaultKisakiFilterState()
    state.path = { enabled: true, mode, pattern, caseSensitive }
    state.showAllInFilteredGroups = false
    expect(applyKisakiFilters(groups, [], state, now).groups.flatMap((group) => group.entries.map((item) => item.path))).toEqual(expected)
  })

  test("supports exclusion, text regex, case sensitivity, and no-extension tokens", () => {
    const extended = [...groups, group(2, [entry("D:/README", 1)])]
    const state = createDefaultKisakiFilterState()
    state.extension = { enabled: true, mode: "exclude", extensions: ["png", "mp3"], excludedCategories: [] }
    state.text = { enabled: true, pattern: "^(a|c|README)", regex: true, caseSensitive: true, fields: ["name"] }
    state.showAllInFilteredGroups = false
    expect(applyKisakiFilters(extended, [], state, now).groups.flatMap((group) => group.entries.map((item) => item.name))).toEqual(["a.jpg", "c.jpg", "README"])
    state.extension = { enabled: true, mode: "include", extensions: ["__no_extension__"], excludedCategories: [] }
    state.text.enabled = false
    expect(applyKisakiFilters(extended, [], state, now).groups.flatMap((group) => group.entries.map((item) => item.path))).toEqual(["D:/README"])
  })

  test.each([
    ["today", ["D:/keep/d.mp3", "D:/keep/e.mp3"]],
    ["last-7-days", ["D:/keep/a.jpg", "D:/keep/d.mp3", "D:/keep/e.mp3"]],
    ["last-30-days", ["D:/keep/a.jpg", "D:/keep/d.mp3", "D:/keep/e.mp3"]],
    ["last-year", ["D:/keep/a.jpg", "D:/drop/b.png", "D:/keep/d.mp3", "D:/keep/e.mp3"]],
  ] as const)("applies the %s date boundary", (preset, expected) => {
    const state = createDefaultKisakiFilterState()
    state.modifiedDate = { enabled: true, preset }
    state.showAllInFilteredGroups = false
    expect(applyKisakiFilters(groups, [], state, now).groups.flatMap((group) => group.entries.map((item) => item.path))).toEqual(expected)
  })

  test("counts active categories without counting display-only group expansion", () => {
    const state = createDefaultKisakiFilterState()
    state.mark = "selected"
    state.fileSize.enabled = true
    state.path = { enabled: true, mode: "contains", pattern: "keep", caseSensitive: false }
    state.showAllInFilteredGroups = false
    expect(applyKisakiFilters(groups, ["D:/keep/a.jpg"], state, now).stats.activeFilterCount).toBe(3)
  })

  test("filters format categories and recognizes folder tools", () => {
    const state = createDefaultKisakiFilterState()
    state.extension = { ...state.extension, enabled: true, excludedCategories: ["images"] }
    state.showAllInFilteredGroups = false
    const result = applyKisakiFilters(groups, [], state, now, "duplicate-files")
    expect(result.groups.flatMap((group) => group.entries.map((item) => item.path))).toEqual(["D:/keep/d.mp3", "D:/keep/e.mp3"])
    expect(result.stats.categories.find((item) => item.category === "images")).toMatchObject({ totalCount: 3, filteredCount: 0 })

    const folders = applyKisakiFilters([group(0, [entry("D:/empty", 0)])], [], createDefaultKisakiFilterState(), now, "empty-folders")
    expect(folders.stats.categories).toEqual([{ category: "folders", totalCount: 1, filteredCount: 1 }])
  })

  test("round-trips custom presets and applies every built-in preset", () => {
    const state = createDefaultKisakiFilterState()
    state.path = { enabled: true, mode: "contains", pattern: "archive", caseSensitive: false }
    const text = serializeKisakiFilterPresets([{ id: "archive", name: "Archive", state }])
    expect(parseKisakiFilterPresets(text)).toEqual([{ id: "archive", name: "Archive", state }])
    expect(applyKisakiBuiltinFilterPreset("large-files", now).fileSize).toMatchObject({ enabled: true, min: 100, unit: "MB" })
    expect(applyKisakiBuiltinFilterPreset("small-files", now).fileSize).toMatchObject({ enabled: true, max: 1024, unit: "KB" })
    expect(applyKisakiBuiltinFilterPreset("recently-modified", now).modifiedDate.preset).toBe("last-30-days")
    expect(applyKisakiBuiltinFilterPreset("old-files", now).modifiedDate.end).toBe(now - 365 * 86_400_000)
    expect(() => parseKisakiFilterPresets('{"version":2,"presets":[]}')).toThrow(/Unsupported/)
  })

  test("limits quick text matching to selected field families", () => {
    const searchable = [group(0, [entry("D:/folder/plain.bin", 1, { title: "Needle Title", detail: "Needle Detail" })])]
    const state = createDefaultKisakiFilterState()
    state.text = { enabled: true, pattern: "Needle", regex: false, caseSensitive: true, fields: ["name"] }
    state.showAllInFilteredGroups = false
    expect(applyKisakiFilters(searchable, [], state, now).groups).toEqual([])
    state.text.fields = ["metadata"]
    expect(applyKisakiFilters(searchable, [], state, now).groups).toHaveLength(1)
    state.text.fields = ["detail"]
    expect(applyKisakiFilters(searchable, [], state, now).groups).toHaveLength(1)
    state.text.pattern = "D:/folder"
    state.text.fields = ["path"]
    expect(applyKisakiFilters(searchable, [], state, now).groups).toHaveLength(1)
  })
})

function group(id: number, entries: KisakiEntry[]): KisakiGroup { return { id, entries, totalBytes: entries.reduce((sum, item) => sum + item.size, 0), reclaimableBytes: 0 } }
function entry(path: string, size: number, extra: Partial<KisakiEntry> = {}): KisakiEntry { return { id: path, groupId: 0, path, name: path.split("/").at(-1)!, size, modifiedDate: now - 400 * 86_400_000, ...extra } }
