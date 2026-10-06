import { describe, expect, test } from "vitest"

import { checkContractVersion, isContractVersionCompatible } from "./versionRange.js"

/**
 * The cases that were wrong before this moved out of `ModuleRenderer`:
 *   - `^1.0` (the spelling `docs/plugin-architecture.md` §2.1 itself uses) was rejected outright;
 *   - `^1.5.0` accepted host `1.0.0`, because the old caret branch compared majors only and never
 *     looked at the bound — an under-reject, which is the dangerous direction.
 */
describe("caret ranges", () => {
  test("accepts the two-segment spelling §2.1 uses", () => {
    expect(isContractVersionCompatible("^1.0", "1.0.0")).toBe(true)
    expect(isContractVersionCompatible("^1.0", "1.9.9")).toBe(true)
    expect(isContractVersionCompatible("^1", "1.0.0")).toBe(true)
  })

  test("respects the lower bound, not just the major", () => {
    expect(isContractVersionCompatible("^1.5.0", "1.0.0")).toBe(false)
    expect(isContractVersionCompatible("^1.5.0", "1.4.9")).toBe(false)
    expect(isContractVersionCompatible("^1.5.0", "1.5.0")).toBe(true)
    expect(isContractVersionCompatible("^1.5.0", "1.5.1")).toBe(true)
  })

  test("stays inside the major line", () => {
    expect(isContractVersionCompatible("^1.0.0", "2.0.0")).toBe(false)
    expect(isContractVersionCompatible("^2.0.0", "1.9.9")).toBe(false)
  })

  test("pins the minor for a 0 major, the way npm's caret does", () => {
    expect(isContractVersionCompatible("^0.2.3", "0.2.9")).toBe(true)
    expect(isContractVersionCompatible("^0.2.3", "0.3.0")).toBe(false)
    expect(isContractVersionCompatible("^0.2.3", "0.2.2")).toBe(false)
  })
})

describe("tilde and exact", () => {
  test("tilde pins the prefix and honours the bound", () => {
    expect(isContractVersionCompatible("~1.2", "1.2.0")).toBe(true)
    expect(isContractVersionCompatible("~1.2", "1.3.0")).toBe(false)
    expect(isContractVersionCompatible("~1.2.3", "1.2.9")).toBe(true)
    expect(isContractVersionCompatible("~1.2.3", "1.2.2")).toBe(false)
    expect(isContractVersionCompatible("~1", "1.9.9")).toBe(true)
  })

  test("exact still means exact", () => {
    expect(isContractVersionCompatible("1.0.0", "1.0.0")).toBe(true)
    expect(isContractVersionCompatible("1.0.0", "1.0.1")).toBe(false)
  })
})

describe("unsupported syntax is named, not conflated", () => {
  test("an unimplemented range says so instead of claiming an incompatibility", () => {
    for (const range of [">=1.0.0", "1.x", "^1 || ^2", "latest", ""]) {
      const verdict = checkContractVersion(range, "1.0.0")
      expect(verdict.compatible, range).toBe(false)
      if (!verdict.compatible) expect(verdict.reason, range).toBe("unsupported-range")
    }
  })

  test("a host version we cannot parse is reported as invalid-version", () => {
    const verdict = checkContractVersion("^1.0", "1.0.0-beta.2")
    expect(verdict.compatible).toBe(false)
    if (!verdict.compatible) expect(verdict.reason).toBe("invalid-version")
  })

  test("a real mismatch is reported as incompatible", () => {
    const verdict = checkContractVersion("^2.0.0", "1.0.0")
    expect(verdict.compatible).toBe(false)
    if (!verdict.compatible) expect(verdict.reason).toBe("incompatible")
  })
})
