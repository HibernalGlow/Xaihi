import { describe, expect, test } from "vitest"

import { createBadNameRenamePlan } from "./bad-names.js"

describe("Kisaki bad-name rename plans", () => {
  test("uses selected same-directory scan targets without exposing a move operation", () => {
    const plan = createBadNameRenamePlan([
      entry("D:/media/report-🙂.TXT", "D:/media/report-.txt"),
      entry("D:/media/other.TXT", "D:/media/other.txt"),
      entry("D:/media/moved.TXT", "E:/other/moved.txt"),
    ], ["D:/media/report-🙂.TXT", "D:/media/moved.TXT"])

    expect(plan).toEqual([{ path: "D:/media/report-🙂.TXT", targetName: "report-.txt" }])
  })
})

function entry(path: string, secondaryPath: string) {
  return { id: path, groupId: 0, path, name: path.slice(path.lastIndexOf("/") + 1), size: 1, modifiedDate: 1, secondaryPath }
}
