import { describe, expect, test } from "vitest"

import { DEFAULT_TEMPORARY_FILE_EXTENSIONS, isDefaultTemporaryFileExtensions, normalizeTemporaryFileExtensions, parseTemporaryFileExtensions } from "./temporary-file-extensions.js"

describe("temporary-file extension contract", () => {
  test("preserves the upstream suffix semantics and normalizes custom values", () => {
    expect(parseTemporaryFileExtensions("#; thumbs.db\n.bak,~")).toEqual(["#", "thumbs.db", ".bak", "~"])
    expect(normalizeTemporaryFileExtensions(" .CUSTOM-TMP ; # ; .custom-tmp ")).toBe(".custom-tmp,#")
    expect(parseTemporaryFileExtensions(".ÄTMP")).toEqual([".Ätmp"])
  })

  test("falls back to the stable default set and compares it independent of order", () => {
    expect(normalizeTemporaryFileExtensions("")).toBe(DEFAULT_TEMPORARY_FILE_EXTENSIONS)
    expect(isDefaultTemporaryFileExtensions(".partial,#,thumbs.db,.bak,~,.tmp,.temp,.ds_store,.crdownload,.part,.cache,.dmp,.download")).toBe(true)
  })
})
