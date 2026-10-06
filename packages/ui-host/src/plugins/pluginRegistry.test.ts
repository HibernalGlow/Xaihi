// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest"

import { frontendPluginForModule, resolveEntryLoader } from "./dynamicEntries"
import { contributedModules, resetModuleContributions } from "./contributions"
import { pluginTrust } from "./frontendIntegrity"
import { approveFrontendPluginCapabilities, frontendPluginApproval, resetFrontendPluginApprovals } from "./frontendGrants"
import { resolveFrontendHostAccess } from "./frontendHost"
import {
  activateInstalledFrontendPlugins,
  discoverInstalledFrontendPlugins,
  installFrontendPlugin,
  setFrontendPluginEnabled,
  updateFrontendPlugin,
  uninstallFrontendPlugin,
  validateFrontendPlugin,
} from "./pluginRegistry"

const STORAGE_KEY = "xiranite.frontendPlugins"

const validRecord = {
  id: "com.example.registry",
  entry: "http://127.0.0.1:4176/mf-manifest.json",
  entryType: "module" as const,
  // Literal-typed on purpose: the approval store takes the capability vocabulary, and a widening to
  // string[] here would push casts into every test that reads this fixture.
  capabilities: ["state", "env"] as const,
  integrity: { "http://127.0.0.1:4176/remoteEntry.js": `sha384-${"A".repeat(64)}` },
  allowedOrigins: ["http://127.0.0.1:4176"],
}

beforeEach(() => {
  // The runtime maps are module-level, so a previous test's binding would otherwise leak into this
  // one. Uninstalling first drops both the record and the binding it created.
  uninstallFrontendPlugin(validRecord.id)
  uninstallFrontendPlugin("com.example.replacement")
  resetModuleContributions()
  globalThis.localStorage.clear()
})

describe("validateFrontendPlugin", () => {
  test("accepts a well-formed record and defaults moduleId/enabled", () => {
    const { plugin, issues } = validateFrontendPlugin(validRecord)
    expect(issues).toEqual([])
    expect(plugin?.moduleId).toBe(validRecord.id)
    expect(plugin?.enabled).toBe(true)
  })

  test("reports every problem at once instead of the first one", () => {
    const { plugin, issues } = validateFrontendPlugin({
      id: "  ",
      entry: "relative/path.js",
      entryType: "script",
      capabilities: ["state", "teleport"],
      integrity: { "not-a-url": "sha384-nope" },
    })
    expect(plugin).toBeUndefined()
    expect(issues.map((issue) => issue.field).sort()).toEqual(
      ["capabilities", "entry", "entryType", "id", "integrity.not-a-url", "integrity.not-a-url"].sort(),
    )
  })

  test("rejects a non-object without throwing", () => {
    expect(validateFrontendPlugin("nope").issues[0]?.field).toBe("plugin")
    expect(validateFrontendPlugin(null).issues.length).toBe(1)
  })
})

describe("install / discover / activate", () => {
  test("installing persists the record and binds the module id in the same step", () => {
    const result = installFrontendPlugin(validRecord)
    expect(result.ok).toBe(true)
    expect(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(1)
    expect(frontendPluginForModule(validRecord.id)).toBeDefined()
    expect(resolveEntryLoader(validRecord.id)).toBeTypeOf("function")
  })

  test("an install that fails validation writes nothing and binds nothing", () => {
    const result = installFrontendPlugin({ ...validRecord, entry: "ftp://nope" })
    expect(result.ok).toBe(false)
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(frontendPluginForModule(validRecord.id)).toBeUndefined()
  })

  test("reinstalling the same id updates the record instead of stacking duplicates", () => {
    installFrontendPlugin(validRecord)
    installFrontendPlugin({ ...validRecord, entryType: "var" })
    const { plugins } = discoverInstalledFrontendPlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0]?.entryType).toBe("var")
  })

  test("a second plugin claiming the same moduleId is refused, not silently stacked", () => {
    installFrontendPlugin(validRecord)
    const result = installFrontendPlugin({
      id: "com.example.other",
      moduleId: validRecord.id,
      entry: "http://127.0.0.1:4177/mf-manifest.json",
      entryType: "module",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]?.message).toContain("com.example.registry")
    }
    expect(discoverInstalledFrontendPlugins().plugins).toHaveLength(1)
  })

  test("enabled:false is honoured: persisted, but nothing is bound", () => {
    const result = installFrontendPlugin({ ...validRecord, enabled: false })
    expect(result.ok).toBe(true)
    expect(frontendPluginForModule(validRecord.id)).toBeUndefined()
    expect(resolveEntryLoader(validRecord.id)).toBeUndefined()
    expect(discoverInstalledFrontendPlugins().plugins[0]?.enabled).toBe(false)
  })

  test("startup activates a record written by an earlier session (the no-rebuild claim)", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([validRecord]))
    expect(frontendPluginForModule(validRecord.id)).toBeUndefined()

    const { activated, refused, disabled } = activateInstalledFrontendPlugins()

    expect(activated).toEqual([validRecord.id])
    // The other two lists are empty in the happy case, so a non-empty `disabled` further down is
    // evidence about the switch rather than the pass dumping everything into every bucket.
    expect(refused).toEqual([])
    expect(disabled).toEqual([])
    expect(frontendPluginForModule(validRecord.id)?.entry).toBe(validRecord.entry)
    // The trust record travels with it, so the pins are in force without the installer re-declaring.
    expect(pluginTrust(validRecord.id)?.integrity[validRecord.entry.replace("mf-manifest.json", "remoteEntry.js")]).toBe(
      `sha384-${"A".repeat(64)}`,
    )
  })

  test("a disabled record is not activated at startup either", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...validRecord, enabled: false }]))
    const startup = activateInstalledFrontendPlugins()
    expect(startup.activated).toEqual([])
    // 停用不是失败也不是拒绝：它必须是第三条列表，否则未来的面板只能从「没在跑」猜原因。
    expect(startup.disabled).toEqual([validRecord.id])
    expect(startup.refused).toEqual([])
  })

  test("a torn storage blob is reported, not read as 'nothing installed'", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, "{ this is not json")
    const { plugins, issues } = discoverInstalledFrontendPlugins()
    expect(plugins).toEqual([])
    expect(issues.map((issue) => issue.field)).toEqual([STORAGE_KEY])
  })

  test("a malformed record in the list is reported and skipped, leaving the good ones usable", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "broken" }, validRecord]))
    const { plugins, issues } = discoverInstalledFrontendPlugins()
    expect(plugins).toHaveLength(1)
    expect(issues.some((issue) => issue.field.startsWith("[0]."))).toBe(true)
    const mixed = activateInstalledFrontendPlugins()
    expect(mixed.activated).toEqual([validRecord.id])
    expect(mixed.disabled).toEqual([])
    expect(mixed.refused.map((issue) => issue.field).some((field) => field.startsWith("[0]."))).toBe(true)
  })
})

describe("contributions", () => {
  test("installing a plugin publishes its component and uninstalling takes it back", () => {
    installFrontendPlugin({
      ...validRecord,
      contributions: [{ kind: "component", id: "com.example.registry.panel", name: "REGISTRY PANEL" }],
    })
    expect(contributedModules().map((module) => module.id)).toContain("com.example.registry.panel")

    uninstallFrontendPlugin(validRecord.id)
    expect(contributedModules().map((module) => module.id)).not.toContain("com.example.registry.panel")
  })

  test("a contribution kind outside the consumed vocabulary is refused at install", () => {
    const result = installFrontendPlugin({
      ...validRecord,
      contributions: [{ kind: "widget", id: "com.example.registry.widget" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.field).toContain("kind")
  })
})

describe("trust is granted by the host, not claimed by the plugin", () => {
  test("a record cannot declare itself internal", () => {
    const result = installFrontendPlugin({ ...validRecord, trust: "internal" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.field === "trust" && issue.message.includes("built-in"))).toBe(true)
    }
    // Nothing was persisted, so the refused trust level cannot come back on the next start.
    expect(discoverInstalledFrontendPlugins().plugins).toEqual([])
  })

  test("the same record without the claim installs", () => {
    // Positive control for the test above: the refusal is about `trust`, not about this fixture.
    expect(installFrontendPlugin({ ...validRecord, trust: "third-party" }).ok).toBe(true)
  })

  test("a built-in module id may be marked internal", () => {
    const result = installFrontendPlugin({
      id: "com.example.replace-dissolvef",
      moduleId: "dissolvef",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
      trust: "internal",
    })
    expect(result.ok).toBe(true)
    uninstallFrontendPlugin("com.example.replace-dissolvef")
  })
})

describe("enable / uninstall", () => {
  test("disabling unbinds the module and forgets the pins", () => {
    installFrontendPlugin(validRecord)
    expect(setFrontendPluginEnabled(validRecord.id, false)).toBe(true)
    expect(frontendPluginForModule(validRecord.id)).toBeUndefined()
    expect(pluginTrust(validRecord.id)).toBeUndefined()
    expect(discoverInstalledFrontendPlugins().plugins[0]?.enabled).toBe(false)
  })

  test("re-enabling binds it again without touching storage by hand", () => {
    installFrontendPlugin({ ...validRecord, enabled: false })
    expect(setFrontendPluginEnabled(validRecord.id, true)).toBe(true)
    expect(frontendPluginForModule(validRecord.id)).toBeDefined()
  })

  test("uninstall removes the record and reports when the id was never installed", () => {
    installFrontendPlugin(validRecord)
    expect(uninstallFrontendPlugin(validRecord.id)).toBe(true)
    expect(discoverInstalledFrontendPlugins().plugins).toEqual([])
    expect(frontendPluginForModule(validRecord.id)).toBeUndefined()
    expect(uninstallFrontendPlugin("com.example.never")).toBe(false)
  })

  test("operating on an unknown id is false, not a throw", () => {
    expect(setFrontendPluginEnabled("nope", true)).toBe(false)
  })
})

describe("the approval outlives the right things and not the wrong ones", () => {
  beforeEach(() => {
    resetFrontendPluginApprovals()
  })

  test("uninstall drops the approval, so a reinstall cannot revive namespaces by id", () => {
    installFrontendPlugin(validRecord)
    approveFrontendPluginCapabilities(validRecord.id, validRecord.capabilities)
    expect(resolveFrontendHostAccess(frontendPluginForModule(validRecord.id)!).granted).toContain("state")

    expect(uninstallFrontendPlugin(validRecord.id)).toBe(true)
    expect(frontendPluginApproval(validRecord.id)).toBeUndefined()

    // The point of dropping it: the same id installed again with the same declaration must start back
    // at contract-only instead of inheriting a decision made for bytes that are no longer here.
    installFrontendPlugin(validRecord)
    const after = resolveFrontendHostAccess(frontendPluginForModule(validRecord.id)!)
    expect(after.granted).toEqual(["contract"])
    expect(after.unapproved).toEqual(["state", "env"])
  })

  test("disabling keeps the approval — the switch is the user's, the decision still stands", () => {
    installFrontendPlugin(validRecord)
    approveFrontendPluginCapabilities(validRecord.id, validRecord.capabilities)

    expect(setFrontendPluginEnabled(validRecord.id, false)).toBe(true)
    expect(frontendPluginApproval(validRecord.id)?.granted).toEqual(["state", "env"])

    setFrontendPluginEnabled(validRecord.id, true)
    expect(resolveFrontendHostAccess(frontendPluginForModule(validRecord.id)!).granted).toContain("env")
  })

  test("an update that moves the entry drops the approval; one that does not, keeps it", () => {
    installFrontendPlugin(validRecord)
    approveFrontendPluginCapabilities(validRecord.id, validRecord.capabilities)

    // Same load source, new version: the decision was about this entry, so it survives.
    updateFrontendPlugin({ ...validRecord, version: "1.1.0" })
    expect(frontendPluginApproval(validRecord.id)?.granted).toEqual(["state", "env"])

    // Different load source: a grant inherited across a URL move would be the host approving code it
    // never looked at.
    const moved = updateFrontendPlugin({
      ...validRecord,
      version: "2.0.0",
      entry: "http://127.0.0.1:4177/mf-manifest.json",
    })
    expect(moved.ok).toBe(true)
    expect(frontendPluginApproval(validRecord.id)).toBeUndefined()
    expect(resolveFrontendHostAccess(frontendPluginForModule(validRecord.id)!).granted).toEqual(["contract"])
  })
})
