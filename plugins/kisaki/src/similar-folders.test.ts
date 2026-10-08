import { describe, expect, test } from "vitest"
import { buildKisakiSimilarFolders } from "./similar-folders.js"
import type { KisakiGroup } from "./core.js"

describe("similar image folder statistics", () => {
  test("aggregates counts, bytes, groups, previews, and threshold in TypeScript", () => {
    const groups = [group(0, [entry("D:\\photos\\a.jpg", 10, true), entry("D:\\photos\\b.jpg", 20), entry("D:\\other\\c.jpg", 5)]), group(1, [entry("D:\\photos\\d.jpg", 30), entry("D:\\other\\e.jpg", 7)])]
    expect(buildKisakiSimilarFolders(groups, 3)).toEqual([{ path: "D:\\photos", count: 3, bytes: 60, groupCount: 2, previewPath: "D:\\photos\\b.jpg" }])
  })

  test("sorts deterministically and handles POSIX paths", () => {
    const groups = [group(0, [entry("/a/one.png", 1), entry("/b/two.png", 8), entry("/a/three.png", 2), entry("/b/four.png", 4)])]
    expect(buildKisakiSimilarFolders(groups).map((item) => item.path)).toEqual(["/b", "/a"])
    expect(buildKisakiSimilarFolders(groups, Number.NaN)).toHaveLength(2)
  })
})

function entry(path: string, size: number, isReference = false) { return { id: path, groupId: 0, path, name: path, size, modifiedDate: 0, isReference } }
function group(id: number, entries: ReturnType<typeof entry>[]): KisakiGroup { return { id, entries: entries.map((item) => ({ ...item, groupId: id })), totalBytes: entries.reduce((sum, item) => sum + item.size, 0), reclaimableBytes: 0 } }
