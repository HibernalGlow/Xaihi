// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest"

import {
  contributedModules,
  getContributedModule,
  resetModuleContributions,
} from "./contributions"
import { frontendPluginForModule } from "./dynamicEntries"
import {
  discoverInstalledFrontendPlugins,
  installFrontendPlugin,
  setFrontendPluginEnabled,
  uninstallFrontendPlugin,
  updateFrontendPlugin,
} from "./pluginRegistry"

const STORAGE_KEY = "xiranite.frontendPlugins"

const id = "com.example.update"
const entry = "http://127.0.0.1:4176/mf-manifest.json"

function record(extra: Record<string, unknown> = {}) {
  return { id, entry, entryType: "module" as const, ...extra }
}

beforeEach(() => {
  uninstallFrontendPlugin(id)
  resetModuleContributions()
  globalThis.localStorage.removeItem(STORAGE_KEY)
})

describe("updateFrontendPlugin", () => {
  test("refuses to update something that is not installed, and installs nothing instead", () => {
    const result = updateFrontendPlugin(record({ version: "1.1.0" }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected the update to be refused")
    expect(result.issues.map((issue) => issue.field)).toEqual(["id"])
    expect(discoverInstalledFrontendPlugins().plugins).toEqual([])
    expect(frontendPluginForModule(id)).toBeUndefined()
  })

  test("refuses to re-point a module id and leaves the installed plugin working", () => {
    expect(installFrontendPlugin(record({ version: "1.0.0" })).ok).toBe(true)

    const result = updateFrontendPlugin(record({ version: "1.1.0", moduleId: "someone.else" }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected the re-point to be refused")
    expect(result.issues[0]!.message).toContain("may not re-point")

    // A refused update must not have unloaded anything on the way to saying no.
    const stored = discoverInstalledFrontendPlugins().plugins
    expect(stored).toHaveLength(1)
    expect(stored[0]!.moduleId).toBe(id)
    expect(stored[0]!.version).toBe("1.0.0")
    expect(frontendPluginForModule(id)?.entry).toBe(entry)
  })

  test("replaces the record and reports the version it displaced", () => {
    installFrontendPlugin(record({ version: "1.0.0" }))

    const result = updateFrontendPlugin(record({ version: "1.1.0", capabilities: ["state"] }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected the update to apply")
    expect(result.replaced).toEqual({ version: "1.0.0", enabled: true })

    const stored = discoverInstalledFrontendPlugins().plugins
    expect(stored).toHaveLength(1)
    expect(stored[0]!.version).toBe("1.1.0")
    expect(stored[0]!.capabilities).toEqual(["state"])
    expect(frontendPluginForModule(id)?.entry).toBe(entry)
  })

  test("an update that does not restate enabled keeps the user's disable", () => {
    installFrontendPlugin(record({ version: "1.0.0" }))
    setFrontendPluginEnabled(id, false)
    expect(frontendPluginForModule(id)).toBeUndefined()

    const result = updateFrontendPlugin(record({ version: "1.1.0" }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected the update to apply")
    expect(result.plugin.enabled).toBe(false)
    expect(frontendPluginForModule(id)).toBeUndefined()

    // Saying it out loud is the only way to re-enable through an update.
    const enabled = updateFrontendPlugin(record({ version: "1.2.0", enabled: true }))
    expect(enabled.ok).toBe(true)
    expect(frontendPluginForModule(id)?.entry).toBe(entry)
  })

  test("contribution rows the new record stops declaring come out of the listing", () => {
    installFrontendPlugin(record({
      version: "1.0.0",
      contributions: [
        { kind: "component", id: "example.a", name: "A" },
        { kind: "component", id: "example.b", name: "B" },
      ],
    }))
    expect(contributedModules().map((module) => module.id).sort()).toEqual(["example.a", "example.b"])

    const narrowed = updateFrontendPlugin(record({
      version: "1.1.0",
      contributions: [{ kind: "component", id: "example.a", name: "A" }],
    }))
    expect(narrowed.ok).toBe(true)
    expect(contributedModules().map((module) => module.id)).toEqual(["example.a"])
    expect(getContributedModule("example.b")).toBeUndefined()

    // And a release that drops every row leaves no row behind.
    updateFrontendPlugin(record({ version: "1.2.0" }))
    expect(contributedModules()).toEqual([])
  })

  test("install over an existing id unloads the old registration first", () => {
    installFrontendPlugin(record({
      version: "1.0.0",
      contributions: [{ kind: "component", id: "example.a", name: "A" }],
    }))
    installFrontendPlugin(record({ version: "1.1.0" }))

    expect(contributedModules()).toEqual([])
    const stored = discoverInstalledFrontendPlugins().plugins
    expect(stored).toHaveLength(1)
    expect(stored[0]!.version).toBe("1.1.0")
  })

  test("an invalid candidate is refused as data, with the old record intact", () => {
    installFrontendPlugin(record({ version: "1.0.0" }))

    const result = updateFrontendPlugin(record({ version: "1.1.0", requiredApi: "^9.0" }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected the requirement to be refused")
    expect(result.issues.map((issue) => issue.field)).toEqual(["requiredApi"])

    const stored = discoverInstalledFrontendPlugins().plugins
    expect(stored[0]!.version).toBe("1.0.0")
    expect(frontendPluginForModule(id)?.entry).toBe(entry)
  })

  test("version must be a non-empty string when declared", () => {
    const result = installFrontendPlugin(record({ version: "   " }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected a blank version to be refused")
    expect(result.issues.map((issue) => issue.field)).toEqual(["version"])
  })
})
