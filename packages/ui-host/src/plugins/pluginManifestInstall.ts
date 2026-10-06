/**
 * Turns a `manifest.toml` into a host install record — the step §2.1 promised and §9 kept listing as
 * missing ("记录今天来自 query 而不是清单文件").
 *
 * Two boundaries to keep straight:
 * - the **vocabulary** belongs to `@xiranite/contract` (`parseFrontendPluginManifest`), because the
 *   manifest is Xiranite's contract file and the CLI must read the same spelling the app does;
 * - the **policy** stays here: which capabilities a plugin is granted is not in the manifest at all
 *   (§2.1's `[permissions]` is backend-facing, and the frontend ceiling is the host's), and the host's
 *   own frontend API version is what `required_api` is checked against. A reader that let a manifest
 *   hand itself grants or trust would recreate the privilege hole closed in §6.
 *
 * `[frontend] alias` goes to the record's `alias` and therefore to `RemoteInfo.name` — the word
 * `loadRemote` is keyed by — and **not** to `moduleId`, which stays the plugin id. That split is what
 * the live probe forced: the example builds its container as `poc_frontend` (alias) while its plugin id
 * is `poc-frontend`, and conflating the two produced `Module "poc_frontend" failed to load`. A plugin
 * that *replaces* a built-in module still says so, just through the record's `moduleId` (the dev page's
 * `&module=`), not through the manifest's alias.
 */

import {
  parseFrontendPluginManifest,
  type ManifestIssue,
  type ParsedPluginManifest,
  type PluginManifestParseResult,
} from "@xiranite/contract"

import { XIRANITE_FRONTEND_API_VERSION, checkFrontendApiRequirement, type FrontendApiCheck } from "./frontendApi"
import { planContributions } from "./contributions"
import { describePinCoverage, type PinIneffectiveness, type PluginArtifact } from "@xiranite/contract"
import { resolveFrontendHostAccess } from "./frontendHost"
import {
  discoverInstalledFrontendPlugins,
  installFrontendPlugin,
  validateFrontendPlugin,
  type InstalledFrontendPlugin,
  type InstallFrontendPluginResult,
  type PluginValidationIssue,
} from "./pluginRegistry"

export type ManifestInstallResult =
  | { ok: true; manifest: ParsedPluginManifest; notes: string[]; install: InstallFrontendPluginResult }
  | { ok: false; issues: ManifestIssue[] }

export function frontendPluginRecordFromManifest(
  manifest: ParsedPluginManifest,
): { ok: true; record: Record<string, unknown> } | { ok: false; issues: ManifestIssue[] } {

  const issues: ManifestIssue[] = []

  const contributions = (manifest.contributions ?? []).flatMap((contribution) =>
    contribution.kind === "component"
      ? [
          {
            kind: "component",
            id: contribution.id,
            ...(contribution.name ? { name: contribution.name } : {}),
            // The declared expose travels with the row: without it a two-component plugin loads the
            // first one and strands the rest (`dynamicEntries.exposeOfModule`).
            ...(contribution.module ? { module: contribution.module } : {}),
          },
        ]
      : [],
  )

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    record: {
      id: manifest.id,
      moduleId: manifest.id,
      alias: manifest.frontend.alias,
      shareScope: manifest.frontend.shareScope,
      entry: manifest.frontend.entry,
      entryType: manifest.frontend.entryType,
      requiredApi: manifest.frontend.requiredApi,
      version: manifest.version,
      name: manifest.name,
      description: manifest.description,
      integrity: manifest.frontend.integrity,
      allowedOrigins: manifest.frontend.allowedOrigins,
      contributions: contributions.length > 0 ? contributions : undefined,
    },
  }
}

/**
 * Parses manifest text and installs it in one step, so a caller cannot skip the host's own version
 * check by reading the file with a hand-picked base URL.
 */
export function installFrontendPluginFromManifestText(
  tomlText: string,
  options: { baseUrl: string; manifestUrl?: string },
): ManifestInstallResult {
  const parsed: PluginManifestParseResult = parseFrontendPluginManifest(tomlText, {
    baseUrl: options.baseUrl,
    hostFrontendApiVersion: XIRANITE_FRONTEND_API_VERSION,
  })
  if (!parsed.ok) return { ok: false, issues: parsed.issues }

  const mapped = frontendPluginRecordFromManifest(parsed.manifest)
  if (!mapped.ok) return { ok: false, issues: mapped.issues }
  if (options.manifestUrl !== undefined) {
    // The source of record, so §2.5's update check has something to re-read later.
    mapped.record.manifestUrl = options.manifestUrl
  }

  // Notes are returned, not logged: a manifest can declare things nothing reads, and the only honest
  // place for that is the install surface the human is looking at — not a console line nobody opens.
  return {
    ok: true,
    manifest: parsed.manifest,
    notes: parsed.notes,
    install: installFrontendPlugin(mapped.record),
  }
}

/**
 * Fetches and installs a manifest over HTTP(S).
 *
 * `credentials: "omit"` because a plugin manifest is a public artifact and this origin carries the
 * host's bearer token in storage, not in cookies — nothing about fetching a third party's file should
 * send anything with it.
 */
export async function installFrontendPluginFromManifestUrl(url: string): Promise<ManifestInstallResult> {
  let response: Response
  try {
    response = await fetch(url, { credentials: "omit" })
  } catch (error) {
    return {
      ok: false,
      issues: [{ field: "manifestUrl", message: `could not be fetched: ${error instanceof Error ? error.message : String(error)}` }],
    }
  }
  if (!response.ok) {
    return { ok: false, issues: [{ field: "manifestUrl", message: `answered ${response.status} ${response.statusText}` }] }
  }
  return installFrontendPluginFromManifestText(await response.text(), {
      baseUrl: response.url || url,
      manifestUrl: url,
    })
}

export interface PluginUpdateCheck {
  pluginId: string
  /** The version in the install record; `undefined` when the record declared none. */
  current?: string
  /** The version the re-read manifest declares. */
  available?: string
  /**
   * `true` means the two strings differ — **not** that the other one is newer. Ordering needs the semver
   * comparison §5 still lists as outstanding, and guessing it (`1.10.0` vs `1.9.0`) would be worse than
   * reporting the difference and letting the human decide.
   */
  changed: boolean
  source: string
  /**
   * What applying this update would do to the recorded approval (`pluginRegistry.updateFrontendPlugin`).
   *
   * `revoked-source-moved` is not a warning about the plugin being untrustworthy; it is the mechanical
   * consequence of the approval being about *this load source*: a release that moves to a different URL
   * starts back at `contract` until the host decides again. Reporting it here is what lets someone see
   * that before installing, instead of discovering it when a working panel goes blank.
   */
  grantEffect: "kept" | "revoked-source-moved"
  /** Present exactly when `grantEffect === "revoked-source-moved"`, as data rather than prose. */
  entryMoved?: { from: string; to: string }
}

export type PluginUpdateCheckResult =
  | { ok: true; check: PluginUpdateCheck }
  | { ok: false; issues: ManifestIssue[] }

/**
 * What installing this manifest would do, computed *without* installing it.
 *
 * §2.5's pipeline puts `validate (manifest + api compat + capabilities)` before `resolve`/`load`, and
 * until now the host only ever reported those results after the record was written — so the two things
 * a person can only regret afterwards (the frontend API range this host refuses, and the contributions
 * that will not become rows because an id is already built in) appeared post-hoc in the install's notes.
 *
 * The numbers come from the same code the install uses: `planContributions` for what gets listed, and
 * `resolveFrontendHostAccess` for what the plugin can actually reach. There is deliberately no second
 * copy of either rule, and nothing here guesses at an approval — it reports the real store.
 */
export interface PluginInstallPreview {
  pluginId: string
  name?: string
  version?: string
  entry: string
  entryType: string
  alias?: string
  shareScope?: string
  requiredApi?: string
  /** §2.5's "check API compatibility" answer for this host, before anything is written. */
  api: FrontendApiCheck
  pinnedResourceCount: number
  /**
   * Whether the first resource this plugin loads is among the pinned URLs.
   *
   * §6's enforcement is keyed by absolute URL, so a distribution can pin every byte it ships — but a
   * manifest that pins only a later chunk leaves its own entry file unchecked, and until now nothing said
   * that out loud before installing. `false` is not a refusal; it is the honest shape of "bytes trusted
   * by URL alone".
   */
  entryIsPinned: boolean
  /**
   * Pin keys the origin allowlist would refuse before the pin is ever consulted.
   *
   * These are dead declarations: the loader throws on them rather than falling through, so a distribution
   * that pins a URL outside its own allowlist has both a useless pin and a fetch that cannot succeed.
   */
  unreachablePins: string[]
  allowedOriginCount: number
  /**
   * Whether the report has a denominator at all: `false` means nobody enumerated what the remote will
   * fetch, so the two lists below are silent rather than clean.
   */
  artifactsEnumerated: boolean
  /** How many URLs this load will fetch. `0` when nothing was enumerated. */
  enumeratedArtifactCount: number
  /** How many of those a pin can actually reach (see `PluginArtifact.enforceable`). */
  enforceableArtifactCount: number
  /**
   * Artifacts the remote fetches by itself, where a pin cannot reach them at all.
   *
   * Counting these inside `unpinnedArtifacts` would be the exact lie this field exists to prevent: the
   * distributor would read "pin the rest" as solvable by adding pins, when the missing piece is the
   * container's chunk-loading path (§14's measured negative result).
   */
  unenforceableArtifacts: string[]
  /** Enforceable artifacts that carry no pin — the bytes that go in unchecked *and could have been*. */
  unpinnedArtifacts: string[]
  /**
   * Pin keys that match nothing in the enumerated set: dead declarations. A distribution that pins a
   * path its own build no longer emits looks protected and is not.
   */
  pinsMatchingNothing: string[]
  /**
   * The single rollup: every declared pin that produces **no protection at all**, each with its cause.
   *
   * `unreachablePins`, `pinsMatchingNothing` and a pin on an unenforceable artifact are three faces of
   * one question — "did pinning this help?" — and reporting them apart made the reader do the join.
   * Ordered the way the loader would notice them: the origin check runs before the pin lookup, so an
   * allowlisted refusal outranks everything; only then "the runtime never fetches this"; only then
   * "this URL is not in what the build emits at all".
   */
  ineffectivePins: PinIneffectiveness[]
  /** Rows the host would add to the module library, in declaration order. */
  listedModules: Array<{ id: string; name: string; version: string; expose?: string }>
  /**
   * Component rows the host would refuse to list, with the reason (id already built in).
   *
   * Non-`component` kinds are not here on purpose: the parser drops them before the record exists and
   * reports them in the result's own `notes`, so listing them twice would imply two rules.
   */
  unhonouredContributions: string[]
  /**
   * The namespaces the plugin reaches the moment it is installed — before anyone approves anything.
   *
   * This is `["contract"]` for a fresh id, and that is the point of showing it: "declared no
   * capabilities / nothing approved" and "got the whole host" look identical from the outside unless
   * the projection is reported as data.
   */
  grantedOnInstall: string[]
}

export type PluginInstallPreviewResult =
  | { ok: true; preview: PluginInstallPreview; notes: string[] }
  | { ok: false; issues: ManifestIssue[] }

/**
 * The preview for a record the host has already accepted as valid — one implementation, two entry points.
 *
 * Both §2.5's install paths (a distributed `manifest.toml`, and an installer assembling a record by
 * hand) have to answer the same question with the same numbers, so they call this and not each other's
 * copy. `planContributions` and `resolveFrontendHostAccess` are the host's real rules; nothing here
 * restates them.
 */
function previewFromPlugin(plugin: InstalledFrontendPlugin, artifacts?: readonly PluginArtifact[]): PluginInstallPreview {
  // The contribution plan lives here; the pin arithmetic does not (it is `@xiranite/contract`).
  const plan = planContributions(plugin.id, plugin.contributions, plugin.version)
  const coverage = describePinCoverage({
    integrity: plugin.integrity,
    allowedOrigins: plugin.allowedOrigins,
    artifacts,
  })

  return {
    pluginId: plugin.id,
    name: plugin.name,
    version: plugin.version,
    entry: plugin.entry,
    entryType: plugin.entryType,
    alias: plugin.alias,
    shareScope: plugin.shareScope,
    requiredApi: plugin.requiredApi,
    api: checkFrontendApiRequirement(plugin.requiredApi),
    pinnedResourceCount: Object.keys(plugin.integrity ?? {}).length,
    entryIsPinned: Object.keys(plugin.integrity ?? {}).includes(plugin.entry),
    unreachablePins: coverage.unreachablePins,
    artifactsEnumerated: coverage.enumerated,
    enumeratedArtifactCount: coverage.enumeratedArtifactCount,
    enforceableArtifactCount: coverage.enforceableArtifactCount,
    unenforceableArtifacts: coverage.unenforceableArtifacts,
    unpinnedArtifacts: coverage.unpinnedArtifacts,
    pinsMatchingNothing: coverage.pinsMatchingNothing,
    ineffectivePins: coverage.ineffectivePins,
    allowedOriginCount: plugin.allowedOrigins?.length ?? 0,
    listedModules: plan.adds.map((row) => ({
      id: row.def.id,
      name: row.def.name,
      version: row.def.version,
      ...(row.module ? { expose: row.module } : {}),
    })),
    unhonouredContributions: plan.notes,
    grantedOnInstall: [...resolveFrontendHostAccess(plugin).granted],
  }
}

/** The hand-assembled path: validate exactly as the install would, then report without writing. */
export function previewFrontendPluginRecord(
  input: unknown,
  options: { artifacts?: readonly PluginArtifact[] } = {},
): { ok: true; preview: PluginInstallPreview } | { ok: false; issues: PluginValidationIssue[] } {
  const validated = validateFrontendPlugin(input)
  if (!validated.plugin) return { ok: false, issues: validated.issues }
  return { ok: true, preview: previewFromPlugin(validated.plugin, options.artifacts) }
}

export function previewFrontendPluginManifest(
  tomlText: string,
  options: { baseUrl: string; artifacts?: readonly PluginArtifact[] },
): PluginInstallPreviewResult {
  const parsed = parseFrontendPluginManifest(tomlText, { baseUrl: options.baseUrl })
  if (!parsed.ok) return { ok: false, issues: parsed.issues }

  const mapped = frontendPluginRecordFromManifest(parsed.manifest)
  if (!mapped.ok) return { ok: false, issues: mapped.issues }

  const validated = validateFrontendPlugin(mapped.record)
  if (!validated.plugin) return { ok: false, issues: validated.issues }

  return { ok: true, preview: previewFromPlugin(validated.plugin, options.artifacts), notes: parsed.notes }
}

/**
 * §2.5's remaining `update` half, for the one distribution source that exists today: re-read the
 * `manifest.toml` the record came from and compare the declared version.
 *
 * A record installed without a manifest (the dev page's query-string path) has nothing to re-read, and
 * that is reported rather than guessed from the entry URL — `mf-manifest.json` is the federation
 * runtime's metadata and §2.1 forbids reading it as Xiranite's manifest.
 */
export async function checkFrontendPluginUpdate(
  pluginId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PluginUpdateCheckResult> {
  const stored = discoverInstalledFrontendPlugins().plugins.find((record) => record.id === pluginId)
  if (!stored) {
    return { ok: false, issues: [{ field: "pluginId", message: `"${pluginId}" is not installed` }] }
  }
  const source = stored.manifestUrl
  if (source === undefined) {
    return {
      ok: false,
      issues: [{
        field: "manifestUrl",
        message: `record for "${pluginId}" has no manifest source to re-read; it was installed without a manifest.toml`,
      }],
    }
  }

  let response: Response
  try {
    response = await fetchImpl(source, { credentials: "omit" })
  } catch (error) {
    return {
      ok: false,
      issues: [{ field: "manifestUrl", message: `could not be fetched: ${error instanceof Error ? error.message : String(error)}` }],
    }
  }
  if (!response.ok) {
    return { ok: false, issues: [{ field: "manifestUrl", message: `answered ${response.status} ${response.statusText}` }] }
  }

  const parsed = parseFrontendPluginManifest(await response.text(), { baseUrl: source })
  if (!parsed.ok) {
    return {
      ok: false,
      issues: parsed.issues.map((issue) => ({ ...issue, field: `manifestUrl.${issue.field}` })),
    }
  }

  const available = parsed.manifest.version
  // Both sides are absolute here: the parser resolves a manifest's relative entry against the manifest's
  // own location, and the record stores the same resolved value, so this compares like-for-like.
  const nextEntry = parsed.manifest.frontend.entry
  const entryMoved = nextEntry !== stored.entry
  return {
    ok: true,
    check: {
      pluginId,
      current: stored.version,
      available,
      changed: available !== undefined && available !== stored.version,
      source,
      grantEffect: entryMoved ? "revoked-source-moved" : "kept",
      ...(entryMoved ? { entryMoved: { from: stored.entry, to: nextEntry } } : {}),
    },
  }
}
