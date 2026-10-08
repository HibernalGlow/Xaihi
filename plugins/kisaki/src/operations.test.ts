import { describe, expect, test } from "vitest"
import { buildKisakiGroupOrganizePlan, resolveSubfolderName } from "./operations.js"

describe("Kisaki grouped destination planning", () => {
  const groups = [
    { id: 7, totalBytes: 3, reclaimableBytes: 2, entries: [{ id: "a", groupId: 7, path: "D:/photos/a.jpg", name: "a.jpg", size: 1, modifiedDate: 1 }, { id: "b", groupId: 7, path: "D:/photos/b.jpg", name: "b.jpg", size: 1, modifiedDate: 1 }, { id: "c", groupId: 7, path: "E:\\other\\c.jpg", name: "c.jpg", size: 1, modifiedDate: 1 }] },
    { id: 8, totalBytes: 2, reclaimableBytes: 1, entries: [{ id: "ref", groupId: 8, path: "D:/reference/ref.jpg", name: "ref.jpg", size: 1, modifiedDate: 1, isReference: true }, { id: "candidate", groupId: 8, path: "D:/single/candidate.jpg", name: "candidate.jpg", size: 1, modifiedDate: 1 }] },
  ]

  test("expands one selected row to every non-reference row in its group", () => {
    expect(buildKisakiGroupOrganizePlan(groups, ["D:/photos/a.jpg"])).toEqual({ items: [{ path: "D:/photos/a.jpg", destination: "D:/photos/variants_0007" }, { path: "D:/photos/b.jpg", destination: "D:/photos/variants_0007" }], selectedGroupCount: 1, targetFolderCount: 1 })
  })

  test("can keep single-file source folders and portable separators", () => {
    const plan = buildKisakiGroupOrganizePlan(groups, ["E:\\other\\c.jpg"], { skipSingleFileFolders: false, subfolderTemplate: "set_{groupId}" })
    expect(plan.items).toEqual([{ path: "D:/photos/a.jpg", destination: "D:/photos/set_0007" }, { path: "D:/photos/b.jpg", destination: "D:/photos/set_0007" }, { path: "E:\\other\\c.jpg", destination: "E:\\other\\set_0007" }])
    expect(plan.targetFolderCount).toBe(2)
  })

  test("sanitizes invalid folder characters", () => { expect(resolveSubfolderName("variants:<{groupId}>", 2)).toBe("variants__0002_") })
})
