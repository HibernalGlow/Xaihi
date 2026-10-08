import { describe, expect, test } from "vitest"
import { kisakiScanPresetFromValues, kisakiScanPresetToValues, deleteKisakiScanPreset, exportKisakiScanPresets, importKisakiScanPresets, saveKisakiScanPreset } from "./scan-presets.js"

describe("shared Kisaki scan presets", () => {
  test("creates and overwrites a canonical preset without operation fields", () => {
    const created = saveKisakiScanPreset([], { name: "Photos", input: { tool: "similar-images", includedDirectories: ["D:/Photos"], similarity: 8, selectedPaths: ["no"], dryRun: false }, now: 10, createId: () => "photo" })
    expect(created.preset).toMatchObject({ id: "photo", name: "Photos", tool: "similar-images", createdAt: 10, updatedAt: 10, input: { action: "scan", includedDirectories: ["D:/Photos"], similarity: 8 } })
    expect(created.preset.input).not.toHaveProperty("selectedPaths")
    const updated = saveKisakiScanPreset(created.presets, { id: "photo", name: "Photos HQ", input: { tool: "similar-images", similarity: 3 }, now: 20 })
    expect(updated.presets).toHaveLength(1)
    expect(updated.preset).toMatchObject({ id: "photo", name: "Photos HQ", createdAt: 10, updatedAt: 20, input: { similarity: 3 } })
  })

  test("round trips every surface through canonical input", () => {
    const { preset } = kisakiScanPresetFromValues("Videos", { tool: "similar-videos", includedDirectoriesText: "D:/Videos\nE:/Archive", excludedItemsText: "*.part; */cache/*", similarity: "6", similarVideosHashDuration: "24", similarVideosCropDetect: "motion", recursive: false }, { now: 1, createId: () => "videos" })
    expect(preset.input).toMatchObject({ tool: "similar-videos", includedDirectories: ["D:/Videos", "E:/Archive"], excludedItems: ["*.part", "*/cache/*"], similarity: 6, similarVideosHashDuration: 24, similarVideosLetterboxCrop: true, recursive: false })
    expect(preset.input).not.toHaveProperty("similarVideosCropDetect")
    expect(kisakiScanPresetToValues(preset)).toMatchObject({ tool: "similar-videos", includedDirectoriesText: "D:/Videos\nE:/Archive", excludedItemsText: "*.part; */cache/*", similarity: "6", similarVideosHashDuration: "24", similarVideosLetterboxCrop: true, recursive: false })
  })

  test("exports, merges, replaces, and deletes versioned documents", () => {
    const first = kisakiScanPresetFromValues("One", { tool: "empty-files" }, { now: 1, createId: () => "one" }).preset
    const second = kisakiScanPresetFromValues("Two", { tool: "big-files" }, { now: 2, createId: () => "two" }).preset
    const text = exportKisakiScanPresets([second])
    expect(importKisakiScanPresets(text, [first], "merge").map((preset) => preset.id)).toEqual(["one", "two"])
    expect(importKisakiScanPresets(text, [first], "replace").map((preset) => preset.id)).toEqual(["two"])
    expect(deleteKisakiScanPreset([first, second], "one")).toEqual([second])
  })

  test("rejects unknown or malformed documents", () => {
    expect(() => importKisakiScanPresets('{"version":2,"presets":[]}')).toThrow("Unsupported")
    expect(() => importKisakiScanPresets(JSON.stringify({ schema: "xiranite.czkawka.scan-presets", version: 1, presets: [{}] }))).toThrow("Invalid")
  })
})
