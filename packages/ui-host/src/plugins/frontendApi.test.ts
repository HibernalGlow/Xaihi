// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest"

import { XIRANITE_FRONTEND_API_VERSION, checkFrontendApiRequirement } from "./frontendApi"
import { frontendPluginForModule } from "./dynamicEntries"
import {
  activateInstalledFrontendPlugins,
  discoverInstalledFrontendPlugins,
  installFrontendPlugin,
  uninstallFrontendPlugin,
  validateFrontendPlugin,
} from "./pluginRegistry"

const STORAGE_KEY = "xiranite.frontendPlugins"

const record = {
  id: "com.example.apicheck",
  entry: "http://127.0.0.1:4176/mf-manifest.json",
  entryType: "module" as const,
}

beforeEach(() => {
  uninstallFrontendPlugin(record.id)
  globalThis.localStorage.removeItem(STORAGE_KEY)
})

describe("checkFrontendApiRequirement", () => {
  test("accepts the range forms the manifest vocabulary allows", () => {
    for (const range of [`^${XIRANITE_FRONTEND_API_VERSION}`, "^1.0", "~1.0", "~1.0.0", "1.0.0"]) {
      const check = checkFrontendApiRequirement(range)
      expect(check.compatible, range).toBe(true)
      expect(check.required, range).toBe(range)
    }
  })

  test("a bare major.minor is refused as a range even though it is a legal published version", () => {
    // §2.1's sample publishes `frontend_api = "1.0"`, but `versionRange.ts` requires an exact range to
    // be full X.Y.Z. Asserting the gap here keeps it a documented rule instead of a manifest author
    // discovering it as a silent refusal.
    const check = checkFrontendApiRequirement("1.0")
    expect(check.compatible).toBe(false)
    expect(check.detail).toContain("unsupported-range")
  })

  test("an absent requirement is accepted but a declared-blank one is refused", () => {
    expect(checkFrontendApiRequirement(undefined).compatible).toBe(true)
    // `required_api = ""` is a manifest typo; reading it as "asked for nothing" would be the one
    // spelling that skips the check.
    const blank = checkFrontendApiRequirement("")
    expect(blank.compatible).toBe(false)
    expect(blank.detail).toContain("unsupported-range")
  })

  test("a range this host cannot interpret is refused rather than passed", () => {
    for (const range of [">=1.0 <2.0", "*", "1.x", "latest"]) {
      const check = checkFrontendApiRequirement(range)
      expect(check.compatible, range).toBe(false)
      expect(check.detail, range).toContain("unsupported-range")
    }
  })

  test("a requirement above the host's own version is refused as incompatible", () => {
    const check = checkFrontendApiRequirement("^9.0")
    expect(check.compatible).toBe(false)
    expect(check.detail).toContain("incompatible")
    expect(check.detail).toContain(XIRANITE_FRONTEND_API_VERSION)
  })
})

describe("requiredApi in the install record", () => {
  test("install refuses an unsatisfied requirement and registers nothing", () => {
    const result = installFrontendPlugin({ ...record, requiredApi: "^9.0" })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected the install to be refused")
    expect(result.issues.map((issue) => issue.field)).toEqual(["requiredApi"])
    expect(result.issues[0]!.message).toContain("does not satisfy")

    // Refused means nothing happened: no record, no remote, no module binding.
    expect(discoverInstalledFrontendPlugins().plugins).toEqual([])
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(frontendPluginForModule(record.id)).toBeUndefined()
  })

  test("an uninterpretable requirement is refused at install, not deferred to render", () => {
    const { issues } = validateFrontendPlugin({ ...record, requiredApi: ">=1.0 <2.0" })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain("unsupported-range")
  })

  test("a satisfied requirement is stored trimmed", () => {
    const result = installFrontendPlugin({ ...record, requiredApi: "  ^1.0  " })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected the install to be accepted")
    expect(result.plugin.requiredApi).toBe("^1.0")
    expect(discoverInstalledFrontendPlugins().plugins[0]?.requiredApi).toBe("^1.0")
    expect(frontendPluginForModule(record.id)?.entry).toBe(record.entry)
  })

  test("a stored record the host no longer satisfies is reported and not activated", () => {
    // The host-upgrade case: the record was written when the host claimed a higher frontend API.
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ ...record, enabled: true, requiredApi: "^9.0" }]),
    )

    const discovered = discoverInstalledFrontendPlugins()
    expect(discovered.plugins).toEqual([])
    expect(discovered.issues.map((issue) => issue.field)).toEqual(["[0].requiredApi"])
    // The startup pass must hand the refusal back to its caller, not just log it: this record is
    // 「装了、合法写法、但当前宿主不满足」, a third state the panel cannot infer from absence.
    const startup = activateInstalledFrontendPlugins()
    expect(startup.activated).toEqual([])
    expect(startup.disabled).toEqual([])
    expect(startup.refused.map((issue) => issue.field)).toEqual(["[0].requiredApi"])
    expect(frontendPluginForModule(record.id)).toBeUndefined()
  })
})
