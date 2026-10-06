// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { MODULE_REGISTRY } from "@/components/modules/registry"
import { frontendPluginForModule, resolveEntryLoader } from "./dynamicEntries"
import { contributedModules, resetModuleContributions } from "./contributions"
import { XIRANITE_FRONTEND_API_VERSION } from "./frontendApi"
import {
  previewFrontendPluginRecord,
  previewFrontendPluginManifest,
  checkFrontendPluginUpdate,
  frontendPluginRecordFromManifest,
  installFrontendPluginFromManifestText,
  installFrontendPluginFromManifestUrl,
} from "./pluginManifestInstall"
import { discoverInstalledFrontendPlugins, uninstallFrontendPlugin, type InstalledFrontendPlugin } from "./pluginRegistry"
import type { ParsedPluginManifest } from "@xiranite/contract"

const STORAGE_KEY = "xiranite.frontendPlugins"

const manifestFor = (overrides = "") => `
id = "com.example.frommanifest"
version = "2.1.0"

[frontend]
runtime = "module-federation"
manifest = "https://plugins.example.com/mf-manifest.json"
required_api = "^1.0"
${overrides}
[[frontend.exposes]]
id = "frommanifest.panel"
module = "./Panel"
`

const cleanup = () => {
  uninstallFrontendPlugin("com.example.frommanifest")
  uninstallFrontendPlugin("poc-frontend")
  globalThis.localStorage.removeItem(STORAGE_KEY)
}

beforeEach(cleanup)
afterEach(cleanup)

/**
 * Every field `[frontend]` can produce must either land in the install record or be listed here with
 * the reason it cannot. Without this list, "the parser accepts it" quietly becomes "the host uses it",
 * which is how `share_scope` sat unread for a round and how `allowed_paths` survived on the retired
 * backend as a documented-but-dead field.
 */
const DECLARED_BUT_NOT_CARRIED: Record<string, string> = {
  frontendApi: "the host's own published frontend API version governs; this is the plugin's self-description",
  permissions: "§6's grant layer is the host's ceiling (plus the future grant UI), not the manifest's",
}

/**
 * The leaf fields a manifest produced, minus the containers that have no single record counterpart.
 * `frontend` and `permissions` are structural (the first is spread into the record's own fields, the
 * second is allowlisted), and `contributions` is carried as a list.
 */
const MANIFEST_CONTAINERS = new Set(["frontend", "permissions", "contributions"])

function missingManifestFields(
  manifest: ParsedPluginManifest,
  record: InstalledFrontendPlugin,
): string[] {
  const carried = new Set(
    Object.keys(record).filter((key) => record[key as keyof InstalledFrontendPlugin] !== undefined),
  )
  const produced = new Set<string>([
    ...Object.keys(manifest.frontend).filter(
      (key) => (manifest.frontend as unknown as Record<string, unknown>)[key] !== undefined,
    ),
    ...Object.keys(manifest).filter(
      (key) =>
        !MANIFEST_CONTAINERS.has(key)
        && (manifest as unknown as Record<string, unknown>)[key] !== undefined,
    ),
  ])
  if (manifest.contributions?.some((entry: { kind: string }) => entry.kind === "component")) carried.add("contributions")
  return [...produced].filter((key) => !carried.has(key) && !(key in DECLARED_BUT_NOT_CARRIED))
}

/**
 * The per-row leaves, because a container reaching the record proves nothing about the fields inside it.
 *
 * This is the exact hole that let `module` be dropped for a round while the guard above stayed green:
 * the list arrived, so "contributions is carried" was satisfied even though every row's expose path
 * had been thrown away between the parser and the record (`contributions.ts` had no such field).
 */
function missingContributionFields(
  manifest: ParsedPluginManifest,
  record: InstalledFrontendPlugin,
): string[] {
  const rows = new Map((record.contributions ?? []).map((row) => [row.id, row as unknown as Record<string, unknown>]))
  const missing: string[] = []
  for (const entry of manifest.contributions ?? []) {
    // Only `component` rows are honoured today; the rest are refused or reported as notes, so their
    // leaves are not expected in the record.
    if (entry.kind !== "component") continue
    const source = entry as unknown as Record<string, unknown>
    const row = rows.get(entry.id)
    if (!row) {
      missing.push(`${entry.id}: (没有到达记录的贡献行)`)
      continue
    }
    for (const key of Object.keys(source).filter((k) => source[k] !== undefined)) {
      if (row[key] === undefined) missing.push(`${entry.id}.${key}`)
    }
  }
  return missing
}

describe("no manifest field disappears silently", () => {
  test("a maximal manifest reaches the record or appears in the allowlist", () => {
    const maximal = `
id = "com.example.maximal"
name = "Maximal"
description = "every field"
version = "3.4.5"
frontend_api = "1.0"

[frontend]
runtime = "module-federation"
manifest = "https://plugins.example.com/mf-manifest.json"
alias = "maximal_widget"
entry_type = "var"
share_scope = "xr-scope"
required_api = "^1.0"
source_allow_list = ["https://plugins.example.com"]

[frontend.integrity]
"https://plugins.example.com/remoteEntry.js" = "sha384-${"A".repeat(64)}"

[[frontend.exposes]]
id = "maximal.panel"
module = "./Panel"
`
    const result = installFrontendPluginFromManifestText(maximal, { baseUrl: "https://plugins.example.com/manifest.toml" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`expected install, got ${JSON.stringify(result.issues)}`)

    const record = discoverInstalledFrontendPlugins().plugins[0]!
    const missing = missingManifestFields(result.manifest, record)
    expect(missing).toEqual([])
    expect(missingContributionFields(result.manifest, record)).toEqual([])

    // And the ones the record does carry hold the manifest's values, not the parser's defaults.
    expect(record.name).toBe("Maximal")
    expect(record.description).toBe("every field")
    expect(record.shareScope).toBe("xr-scope")
    expect(record.alias).toBe("maximal_widget")
    expect(record.entryType).toBe("var")
    expect(record.allowedOrigins).toEqual(["https://plugins.example.com"])
    expect(Object.keys(record.integrity ?? {})).toEqual(["https://plugins.example.com/remoteEntry.js"])
  })

  test("the comparison fires when a field is dropped on the way in", () => {
    // Positive control: a record that lost shareScope must be reported by the very same function.
    const maximal = `
id = "com.example.control"

[frontend]
runtime = "module-federation"
manifest = "https://plugins.example.com/mf-manifest.json"
share_scope = "xr-scope"
`
    const result = installFrontendPluginFromManifestText(maximal, { baseUrl: "https://plugins.example.com/" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected install")
    const record = discoverInstalledFrontendPlugins().plugins[0]!
    const stripped = { ...record, shareScope: undefined } as unknown as InstalledFrontendPlugin
    expect(missingManifestFields(result.manifest, stripped)).toEqual(["shareScope"])
  })
})

describe("installFrontendPluginFromManifestText", () => {
  test("the repository's shipped example manifest installs through the real path", () => {
    const text = readFileSync(resolve(import.meta.dirname, "../../examples/plugins/frontend-only/manifest.toml"), "utf8")
    const result = installFrontendPluginFromManifestText(text, { baseUrl: "http://127.0.0.1:4173/" })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`expected install, got ${JSON.stringify(result.issues)}`)
    expect(result.install.ok).toBe(true)

    const stored = discoverInstalledFrontendPlugins().plugins
    expect(stored).toHaveLength(1)
    // `alias` keys the remote in the MF runtime (§2.1); moduleId stays the plugin id. Conflating them
    // is what made the live probe fail to load, so the two are asserted apart on purpose.
    expect(stored[0]!.id).toBe("poc-frontend")
    expect(stored[0]!.moduleId).toBe("poc-frontend")
    expect(stored[0]!.alias).toBe("poc_frontend")
    expect(stored[0]!.entry).toBe("http://127.0.0.1:4173/mf-manifest.json")
    expect(stored[0]!.version).toBe("0.1.0")
    expect(stored[0]!.requiredApi).toBe("^1.0")
    expect(stored[0]!.contributions?.map((entry) => entry.id)).toEqual(["poc-frontend.entry", "poc-frontend.panel"])
    // Each row keeps its own expose all the way into the record. The chain this pins is
    // TOML → record → contribution → loader, which is exactly the stretch where `module` used to be
    // parsed by the contract reader and then dropped (`docs/plugin-architecture.md` §2.1's 2026-10-05 note).
    expect(stored[0]!.contributions?.map((entry) => entry.module)).toEqual(["./entry", "./Panel"])
    // The second contributed id is served by this plugin: not merely listed, but loadable, and it
    // resolves to the plugin (so `ModuleRenderer` gives it the projection rather than the full host).
    expect(resolveEntryLoader("poc-frontend.panel")).toBeDefined()
    expect(frontendPluginForModule("poc-frontend.panel")?.alias).toBe("poc_frontend")
    expect(resolveEntryLoader("poc-frontend.nobody")).toBeUndefined()
    expect(frontendPluginForModule("poc-frontend")?.entry).toBe("http://127.0.0.1:4173/mf-manifest.json")
  })

  test("an alias is carried to the record so the runtime keys the remote by it", () => {
    const result = installFrontendPluginFromManifestText(
      manifestFor('alias = "frommanifest_widget"\n'),
      { baseUrl: "http://127.0.0.1:4173/" },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected install")
    const stored = discoverInstalledFrontendPlugins().plugins[0]!
    expect(stored.alias).toBe("frommanifest_widget")
    expect(stored.moduleId).toBe("com.example.frommanifest")
  })

  test("a manifest asking for more than the host's frontend API is refused before registering", () => {
    const result = installFrontendPluginFromManifestText(
      manifestFor().replace('required_api = "^1.0"', 'required_api = "^9.0"'),
      { baseUrl: "http://127.0.0.1:4173/" },
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.issues[0]!.field).toBe("frontend.required_api")
    expect(result.issues[0]!.message).toContain(XIRANITE_FRONTEND_API_VERSION)
    expect(discoverInstalledFrontendPlugins().plugins).toEqual([])
  })

  test("a manifest naming a runtime this host cannot load is refused", () => {
    const result = installFrontendPluginFromManifestText(
      manifestFor().replace('runtime = "module-federation"', 'runtime = "systemjs"'),
      { baseUrl: "http://127.0.0.1:4173/" },
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.issues[0]!.field).toBe("frontend.runtime")
  })

  test("grants and trust are never taken from the manifest", () => {
    const result = installFrontendPluginFromManifestText(manifestFor(), { baseUrl: "http://127.0.0.1:4173/" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected install")

    // The record carries no capabilities and no trust ⇒ default-deny projection still applies.
    const stored = discoverInstalledFrontendPlugins().plugins[0]!
    expect(stored.capabilities).toBeUndefined()
    expect(stored.trust).toBeUndefined()
    expect(frontendPluginForModule("com.example.frommanifest")?.entry).toBe("https://plugins.example.com/mf-manifest.json")
  })
})

describe("frontendPluginRecordFromManifest", () => {
  test("sections nothing reads come back as notes, and only the component row becomes a module", () => {
    const text = `${manifestFor()}
[[contributions]]
type = "tray"
id = "frommanifest.tray"

[permissions]
clipboard = false
`
    const result = installFrontendPluginFromManifestText(text, { baseUrl: "http://127.0.0.1:4173/" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected install")
    const stored = discoverInstalledFrontendPlugins().plugins[0]!
    expect(stored.contributions?.map((entry) => entry.kind)).toEqual(["component"])
    // Data, not a console line: the install surface is where a human has to see this.
    expect(result.notes).toHaveLength(2)
    expect(result.notes.join(" ")).toContain("tray contribution")
    expect(result.notes.join(" ")).toContain("[permissions]")
  })

  test("share_scope reaches the record instead of being dropped on the way in", () => {
    const result = installFrontendPluginFromManifestText(manifestFor('share_scope = "xr-plugin-scope"\n'), {
      baseUrl: "http://127.0.0.1:4173/",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected install")
    const stored = discoverInstalledFrontendPlugins().plugins[0]!
    expect(stored.shareScope).toBe("xr-plugin-scope")
  })
})

describe("installFrontendPluginFromManifestUrl", () => {
  test("an unreachable manifest answers with data, not a throw", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("offline") })
    try {
      const result = await installFrontendPluginFromManifestUrl("https://plugins.example.com/manifest.toml")
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected failure")
      expect(result.issues[0]!.field).toBe("manifestUrl")
      expect(result.issues[0]!.message).toContain("offline")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test("a non-2xx answer reports the status", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 404, statusText: "Not Found" }))
    try {
      const result = await installFrontendPluginFromManifestUrl("https://plugins.example.com/manifest.toml")
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected failure")
      expect(result.issues[0]!.message).toContain("404")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("the record mapping itself", () => {
  test("moduleId falls back to the plugin id when the manifest declares no alias", () => {
    const result = installFrontendPluginFromManifestText(manifestFor(), { baseUrl: "http://127.0.0.1:4173/" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected install")
    const mapped = frontendPluginRecordFromManifest(result.manifest)
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) throw new Error("expected mapping")
    expect(mapped.record.moduleId).toBe("com.example.frommanifest")
  })
})

const manifestWithVersion = (version: string) => `
id = "com.example.updatecheck"
version = "${version}"

[frontend]
runtime = "module-federation"
manifest = "https://plugins.example.com/mf-manifest.json"
`

describe("checkFrontendPluginUpdate", () => {
  const id = "com.example.updatecheck"

  const installFrom = (version: string) => installFrontendPluginFromManifestText(manifestWithVersion(version), {
    baseUrl: "https://plugins.example.com/manifest.toml",
    manifestUrl: "https://plugins.example.com/manifest.toml",
  })

  test("a differing declared version is reported as changed, without touching the record", async () => {
    expect(installFrom("1.0.0").ok).toBe(true)
    const before = globalThis.localStorage.getItem(STORAGE_KEY)
    vi.stubGlobal("fetch", async () => new Response(manifestWithVersion("1.1.0"), { status: 200 }))
    try {
      const result = await checkFrontendPluginUpdate(id)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error("expected a check")
      expect(result.check).toEqual({
        pluginId: id,
        current: "1.0.0",
        available: "1.1.0",
        changed: true,
        source: "https://plugins.example.com/manifest.toml",
        // The same declared entry, so applying this would keep the approval — pinned in the exact-shape
        // assertion so the field cannot silently disappear from the report.
        grantEffect: "kept",
      })
      // A check reads; it must not install. Ordering is the human's call until §5's range library lands.
      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe(before)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test("a release that moves the load source is reported as revoking the approval", async () => {
    // §2.4's lifetime rule made visible *before* someone installs: the approval is about this entry, so
    // an update pointing somewhere else starts back at `contract`. The check itself stays read-only.
    expect(installFrom("1.0.0").ok).toBe(true)
    const before = globalThis.localStorage.getItem(STORAGE_KEY)
    const moved = manifestWithVersion("2.0.0").replace(
      "https://plugins.example.com/mf-manifest.json",
      "https://cdn.example.org/poc/mf-manifest.json",
    )
    vi.stubGlobal("fetch", async () => new Response(moved, { status: 200 }))
    try {
      const result = await checkFrontendPluginUpdate(id)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error("expected a check")
      expect(result.check.grantEffect).toBe("revoked-source-moved")
      expect(result.check.entryMoved).toEqual({
        from: "https://plugins.example.com/mf-manifest.json",
        to: "https://cdn.example.org/poc/mf-manifest.json",
      })
      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe(before)

      // And it must not be the *version* difference doing that work: same source, new version stays kept.
      const sameSource = manifestWithVersion("2.0.0")
      vi.stubGlobal("fetch", async () => new Response(sameSource, { status: 200 }))
      const again = await checkFrontendPluginUpdate(id)
      expect(again.ok && again.check.grantEffect).toBe("kept")
      expect(again.ok && again.check.changed).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test("the same version is not reported as an update", async () => {
    installFrom("1.0.0")
    vi.stubGlobal("fetch", async () => new Response(manifestWithVersion("1.0.0"), { status: 200 }))
    try {
      const result = await checkFrontendPluginUpdate(id)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error("expected a check")
      expect(result.check.changed).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test("a record without a manifest source says so instead of guessing from the entry URL", async () => {
    expect(installFrontendPluginFromManifestText(manifestWithVersion("1.0.0"), {
      baseUrl: "https://plugins.example.com/manifest.toml",
    }).ok).toBe(true)
    const result = await checkFrontendPluginUpdate(id)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.issues[0]!.field).toBe("manifestUrl")
    expect(result.issues[0]!.message).toContain("without a manifest.toml")
  })

  test("an unreachable or unparseable source comes back as data", async () => {
    installFrom("1.0.0")
    vi.stubGlobal("fetch", async () => new Response("id = ", { status: 200 }))
    try {
      const result = await checkFrontendPluginUpdate(id)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected failure")
      expect(result.issues[0]!.field).toBe("manifestUrl.manifest")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("the contribution leaf guard can fire", () => {
  test("a declared expose path that never reaches the row is named", () => {
    // Control for the control: the container-only guard stayed green while this exact shape was live,
    // so the leaf check has to be able to say `x.panel.module` on its own.
    const manifest = {
      contributions: [{ kind: "component", id: "x.panel", module: "./X" }],
    } as unknown as ParsedPluginManifest
    const record = {
      contributions: [{ kind: "component", id: "x.panel" }],
    } as unknown as InstalledFrontendPlugin

    expect(missingContributionFields(manifest, record)).toEqual(["x.panel.module"])
  })

  test("a non-component row is not demanded of the record", () => {
    const manifest = {
      contributions: [{ kind: "tray", id: "x.tray", module: "./T" }],
    } as unknown as ParsedPluginManifest

    expect(missingContributionFields(manifest, { contributions: [] } as unknown as InstalledFrontendPlugin)).toEqual([])
  })
})

describe("previewFrontendPluginManifest: what installing would do, said before doing it", () => {
  const GRANTS_KEY = "xiranite.frontendPluginApprovals"
  const id = "com.example.frommanifest"
  // Read from the live registry instead of hard-coding an id: which demo modules exist is another
  // lane's business, and a pinned literal would go red for reasons unrelated to this rule.
  const MODULE_REGISTRY_SAMPLE_ID = MODULE_REGISTRY[0]!.id

  const previewOf = (text: string) =>
    previewFrontendPluginManifest(text, { baseUrl: "https://plugins.example.com/manifest.toml" })

  test("previewing writes nothing anywhere", () => {
    const records = globalThis.localStorage.getItem(STORAGE_KEY)
    const grants = globalThis.localStorage.getItem(GRANTS_KEY)

    const result = previewOf(manifestFor())

    expect(result.ok).toBe(true)
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe(records)
    expect(globalThis.localStorage.getItem(GRANTS_KEY)).toBe(grants)
    expect(frontendPluginForModule(id)).toBeUndefined()
  })

  test("it reports the rows the host would list, with each expose, and what the plugin can reach", () => {
    const result = previewOf(manifestFor())
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")

    expect(result.preview.listedModules).toEqual([{ id: "frommanifest.panel", name: "frommanifest.panel", version: "2.1.0", expose: "./Panel" }])
    // A fresh id with no approval: exactly `contract`. This is the default-deny made visible *before*
    // the install, which is the half of §10.1 第 3 条 a person otherwise only discovers afterwards.
    expect(result.preview.grantedOnInstall).toEqual(["contract"])
    expect(result.preview.requiredApi).toBe("^1.0")
    expect(result.preview.api.compatible).toBe(true)
  })

  test("a range this host refuses is a refusal before the record exists", () => {
    const result = previewOf(manifestFor().replace('required_api = "^1.0"', 'required_api = "^9.0"'))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.issues.some((issue) => issue.field.includes("requiredApi"))).toBe(true)
    expect(frontendPluginForModule(id)).toBeUndefined()
  })

  test("a contribution whose id is already built in is reported as not-a-row, not listed", () => {
    const builtin = MODULE_REGISTRY_SAMPLE_ID
    const text = `${manifestFor()}\n[[contributions]]\nkind = "component"\nid = "${builtin}"\n`

    const result = previewOf(text)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.listedModules.map((row) => row.id)).not.toContain(builtin)
    expect(result.preview.unhonouredContributions.join(" ").toLowerCase()).toContain("already a built-in module")
  })

  test("a kind with no consumer is a note, never a row", () => {
    const result = previewOf(`${manifestFor()}\n[[contributions]]\nkind = "tray"\nid = "frommanifest.tray"\n`)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.listedModules.map((row) => row.id)).toEqual(["frommanifest.panel"])
    // The note is the parser's, not the planner's: a `tray` row never reaches the record, so it is
    // reported once, in the same place the install surface reports it.
    expect(result.notes.join(" ")).toContain("tray contribution")
    expect(result.preview.unhonouredContributions).toEqual([])
  })

  test("installing the same text agrees with what the preview promised", () => {
    // The reason the preview calls `planContributions` instead of restating the rules: if the two ever
    // diverge, this is red rather than a panel that said one thing and a host that did another.
    const text = manifestFor()
    const preview = previewOf(text)
    expect(preview.ok).toBe(true)
    if (!preview.ok) throw new Error("expected a preview")

    resetModuleContributions()
    try {
      const installed = installFrontendPluginFromManifestText(text, {
        baseUrl: "https://plugins.example.com/manifest.toml",
      })
      expect(installed.ok).toBe(true)
      const listed = contributedModules().map((module) => [module.id, module.name, module.version])
      expect(listed).toEqual(
        preview.preview.listedModules.map((row) => [row.id, row.name, row.version]),
      )
    } finally {
      uninstallFrontendPlugin(id)
      resetModuleContributions()
    }
  })
})

describe("previewFrontendPluginRecord: the hand-assembled path gets the same report", () => {
  test("a refused record writes nothing and names the field", () => {
    const result = previewFrontendPluginRecord({ id: "com.example.query", entry: "not-an-url" })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.issues.map((issue) => issue.field)).toContain("entry")
    expect(frontendPluginForModule("com.example.query")).toBeUndefined()
  })

  test("the query path and the manifest path agree on the same content", () => {
    // The reason `previewFromPlugin` is one function: two reports that disagree about the same plugin
    // would be worse than none, and this is the shape that makes the sharing observable.
    const text = `${manifestFor()}\n[[contributions]]\nkind = "component"\nid = "frommanifest.extra"\nmodule = "./Extra"\n`
    const viaManifest = previewFrontendPluginManifest(text, { baseUrl: "https://plugins.example.com/manifest.toml" })
    expect(viaManifest.ok).toBe(true)
    if (!viaManifest.ok) throw new Error("expected a preview")

    const viaQuery = previewFrontendPluginRecord({
      id: viaManifest.preview.pluginId,
      entry: viaManifest.preview.entry,
      entryType: viaManifest.preview.entryType,
      alias: viaManifest.preview.alias,
      shareScope: viaManifest.preview.shareScope,
      requiredApi: viaManifest.preview.requiredApi,
      version: viaManifest.preview.version,
      contributions: [
        { kind: "component", id: "frommanifest.panel", module: "./Panel" },
        { kind: "component", id: "frommanifest.extra", module: "./Extra" },
      ],
    })
    expect(viaQuery.ok).toBe(true)
    if (!viaQuery.ok) throw new Error("expected a preview")

    expect(viaQuery.preview.listedModules).toEqual(viaManifest.preview.listedModules)
    expect(viaQuery.preview.grantedOnInstall).toEqual(viaManifest.preview.grantedOnInstall)
  })

  test("a capability declared in the record is still not granted without an approval", () => {
    const result = previewFrontendPluginRecord({
      id: "com.example.querycaps",
      entry: "http://127.0.0.1:4176/mf-manifest.json",
      entryType: "module",
      capabilities: ["state", "env"],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.grantedOnInstall).toEqual(["contract"])
  })
})

describe("pin coverage in the preview", () => {
  const entry = "https://plugins.example.com/mf-manifest.json"
  const pin = (letter: string) => `sha384-${letter.repeat(64)}`

  test("it says whether the entry itself is pinned and which pins can never fire", () => {
    const result = previewFrontendPluginRecord({
      id: "com.example.coverage",
      entry,
      entryType: "module",
      allowedOrigins: ["https://plugins.example.com"],
      integrity: {
        [entry]: pin("A"),
        "https://cdn.other.example/remoteEntry.js": pin("B"),
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.entryIsPinned).toBe(true)
    // The same-origin pin above is *not* reported: this names only the key the loader would refuse
    // before ever consulting it, so a distribution with healthy pins reads an empty list.
    expect(result.preview.unreachablePins).toEqual(["https://cdn.other.example/remoteEntry.js"])
  })

  test("a manifest that pins a later chunk but not its entry says so", () => {
    const result = previewFrontendPluginRecord({
      id: "com.example.coverage2",
      entry,
      entryType: "module",
      integrity: { "https://plugins.example.com/assets/entry-abc.js": pin("C") },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a preview")
    expect(result.preview.pinnedResourceCount).toBe(1)
    // No allowlist means no restriction, so nothing is unreachable here — the honest answer is that the
    // bytes the host fetches first are checked by URL shape only.
    expect(result.preview.entryIsPinned).toBe(false)
    expect(result.preview.unreachablePins).toEqual([])
  })
})
