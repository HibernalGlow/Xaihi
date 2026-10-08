import { describe, expect, test } from "vitest"
import type { KisakiEntry, KisakiGroup } from "./core.js"
import { applyKisakiDirectorySelection, applyKisakiGroupSelection, applyKisakiSelectionMode, applyKisakiTextSelection, calculateKisakiSelectionStats, createKisakiSelectionHistory, createDefaultKisakiSelectionAssistantConfig, invertKisakiSelection, parseKisakiSelectionAssistantConfig, pushKisakiSelectionHistory, redoKisakiSelectionHistory, serializeKisakiSelectionAssistantConfig, undoKisakiSelectionHistory } from "./selection-assistant.js"

const groups: KisakiGroup[] = [group(0, [entry("D:/a/small.jpg", 10, 1), entry("D:/a/large.jpg", 30, 3), entry("D:/b/mid.png", 20, 2), entry("D:/ref/original.jpg", 40, 4, true)]), group(1, [entry("E:/c/old.mp3", 5, 1), entry("E:/c/new.mp3", 15, 5)])]

describe("Kisaki shared selection assistant", () => {
  test("implements replace, add, remove, and intersection modes", () => {
    expect(applyKisakiSelectionMode(["a", "b"], ["b", "c"], "replace")).toEqual(["b", "c"])
    expect(applyKisakiSelectionMode(["a", "b"], ["b", "c"], "add")).toEqual(["a", "b", "c"])
    expect(applyKisakiSelectionMode(["a", "b"], ["b", "c"], "remove")).toEqual(["a"])
    expect(applyKisakiSelectionMode(["a", "b"], ["b", "c"], "intersect")).toEqual(["b"])
  })

  test("supports all four group modes and multi-level sorting", () => {
    const config = createDefaultKisakiSelectionAssistantConfig().group
    config.sortCriteria = [{ id: "folder", field: "folderPath", direction: "asc", preferEmpty: false, enabled: true, filterCondition: "none", filterValue: "" }, { id: "size", field: "fileSize", direction: "desc", preferEmpty: false, enabled: true, filterCondition: "none", filterValue: "" }]
    config.mode = "all-except-one"
    expect(applyKisakiGroupSelection(groups, [], config, "replace").paths).toEqual(["D:/a/small.jpg", "D:/b/mid.png", "E:/c/old.mp3"])
    config.mode = "select-one"
    expect(applyKisakiGroupSelection(groups, [], config, "replace").paths).toEqual(["D:/a/large.jpg", "E:/c/new.mp3"])
    config.mode = "all-except-one-per-folder"
    expect(applyKisakiGroupSelection(groups, [], config, "replace").paths).toEqual(["D:/a/small.jpg", "E:/c/old.mp3"])
    config.mode = "all-except-one-matching-set"
    expect(applyKisakiGroupSelection(groups, [], config, "replace").paths).toEqual(["D:/b/mid.png"])
  })

  test("applies criterion filters and never selects references", () => {
    const config = createDefaultKisakiSelectionAssistantConfig().group
    config.mode = "select-one"
    config.sortCriteria = [{ id: "jpg", field: "fileType", direction: "asc", preferEmpty: false, enabled: true, filterCondition: "equals", filterValue: "jpg" }]
    const result = applyKisakiGroupSelection(groups, [], config, "replace")
    expect(result.paths).toEqual(["D:/a/large.jpg"])
    expect(result.paths).not.toContain("D:/ref/original.jpg")
  })

  test("matches text columns, conditions, regex, and reports invalid expressions", () => {
    const config = createDefaultKisakiSelectionAssistantConfig().text
    config.column = "fileName"; config.pattern = "new"; config.condition = "starts-with"
    expect(applyKisakiTextSelection(groups, [], config, "replace").paths).toEqual(["E:/c/new.mp3"])
    config.useRegex = true; config.pattern = "^(large|mid)\\."
    expect(applyKisakiTextSelection(groups, [], config, "replace").paths).toEqual(["D:/a/large.jpg", "D:/b/mid.png"])
    config.pattern = "["
    expect(applyKisakiTextSelection(groups, [], config, "replace").error).toBeTruthy()
  })

  test("supports directory include, exclude, and keep-one rules", () => {
    const config = createDefaultKisakiSelectionAssistantConfig().directory
    config.mode = "select-all-in-directory"; config.directories = []
    expect(applyKisakiDirectorySelection(groups, [], config, "replace")).toMatchObject({ error: "At least one directory is required.", errorCode: "directory-required" })
    config.mode = "select-all-in-directory"; config.directories = ["D:/a"]
    expect(applyKisakiDirectorySelection(groups, [], config, "replace").paths).toEqual(["D:/a/small.jpg", "D:/a/large.jpg"])
    config.mode = "exclude-directory"
    expect(applyKisakiDirectorySelection(groups, ["D:/a/small.jpg", "D:/b/mid.png"], config, "remove").paths).toEqual(["D:/b/mid.png"])
    config.mode = "keep-one-per-directory"; config.directories = []
    expect(applyKisakiDirectorySelection(groups, [], config, "replace").paths).toEqual(["D:/a/large.jpg", "E:/c/new.mp3"])
  })

  test("tracks undo/redo, invert, statistics, and config round trips", () => {
    let history = createKisakiSelectionHistory(["a"])
    history = pushKisakiSelectionHistory(history, ["a", "b"])
    expect(undoKisakiSelectionHistory(history).present).toEqual(["a"])
    expect(redoKisakiSelectionHistory(undoKisakiSelectionHistory(history)).present).toEqual(["a", "b"])
    expect(invertKisakiSelection(groups, ["D:/a/small.jpg"]).length).toBe(4)
    expect(calculateKisakiSelectionStats(groups, ["D:/a/large.jpg", "D:/b/mid.png"])).toEqual({ selectedCount: 2, selectedBytes: 50, reclaimableBytes: 50 })
    const config = createDefaultKisakiSelectionAssistantConfig()
    expect(parseKisakiSelectionAssistantConfig(serializeKisakiSelectionAssistantConfig(config))).toEqual(config)
  })
})

function group(id: number, entries: KisakiEntry[]): KisakiGroup { return { id, entries: entries.map((entry) => ({ ...entry, groupId: id })), totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0), reclaimableBytes: entries.filter((entry) => !entry.isReference).reduce((sum, entry) => sum + entry.size, 0) } }
function entry(path: string, size: number, modifiedDate: number, isReference = false): KisakiEntry { return { id: path, groupId: 0, path, name: path.split("/").at(-1)!, size, modifiedDate, isReference } }
