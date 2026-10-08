import { describe, expect, test } from "vitest"

import { createExifCleanupPlan } from "./exif.js"

describe("Kisaki EXIF cleanup plans", () => {
  test("uses only selected scanned metadata and clones the tag contract", () => {
    const tags = [{ name: "ImageDescription", code: 270, group: "GENERIC" }]
    const plan = createExifCleanupPlan([
      entry("D:/photos/selected.jpg", tags),
      entry("D:/photos/unselected.jpg", tags),
      entry("D:/photos/no-tags.jpg", []),
    ], ["D:/photos/selected.jpg", "D:/photos/no-tags.jpg"])

    expect(plan).toEqual([{ path: "D:/photos/selected.jpg", tags }])
    expect(plan[0]?.tags).not.toBe(tags)
  })
})

function entry(path: string, exifTags: Array<{ name: string; code: number; group: string }>) {
  return { id: path, groupId: 0, path, name: path.slice(path.lastIndexOf("/") + 1), size: 1, modifiedDate: 1, exifTags }
}
