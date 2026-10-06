/**
 * The host's record of which frontend plugins are installed — the first two verbs of the
 * PluginManager (`docs/plugin-architecture.md` §2.5): `discover` and `enable`/`disable`, with
 * `install`/`uninstall` as the record edits behind them.
 *
 * Why this exists rather than keeping the dev page's query string as the runtime source: an
 * installed plugin has to survive a reload without anyone re-typing its URL, and §9's acceptance
 * ("装插件不重编宿主") is only meaningful if the *next* startup reads the plugin from the record.
 *
 * Where the record lives, and the honest caveat: `localStorage`. The shipped WebView has no other
 * persistence today — `xiranite-api` implements 9 routes and none of them is `/config` (§1.4), so
 * the Rust config service has no HTTP surface to write through. This matches the precedent in
 * `src/store/workspaceStore.ts`, which keeps UI preferences local and sends business data to the
 * backend; a plugin *installation record* is host-local configuration, not business state. When the
 * config route lands, this module's storage is the thing that moves — which is why reading and
 * writing are both behind two functions.
 *
 * Validation errors are returned as data (ADR-0073's 错误是数据), never thrown from `install`: the
 * installer UI has to show all of them at once. A record already in storage that fails validation is
 * reported by `discoverInstalledFrontendPlugins` and **not activated** — silently dropping it would
 * make a corrupted install look like an uninstalled one.
 */

import type { NodeCapabilityId } from "@xiranite/contract"
import { createLogger } from "@/lib/logger"
import { registerModuleContributions, clearModuleContributions, type FrontendContribution } from "./contributions"
import { checkFrontendApiRequirement } from "./frontendApi"
import { isBuiltInModuleId, bindModuleToFrontendPlugin, unbindModuleFromFrontendPlugin } from "./dynamicEntries"
import { forgetPluginTrust, type IntegrityPins } from "./frontendIntegrity"
import { revokeFrontendPluginApproval } from "./frontendGrants"
import { registerFrontendPlugin, unregisterFrontendPlugin, type FrontendPluginSpec } from "./frontendRuntime"

const logger = createLogger("plugin.registry")

const STORAGE_KEY = "xiranite.frontendPlugins"

const CAPABILITY_VOCABULARY: readonly NodeCapabilityId[] = [
  "contract",
  "state",
  "workspace",
  "runner",
  "clipboard",
  "downloads",
  "localFiles",
  "config",
  "env",
]

const SRI_PATTERN = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+)={0,2}$/

/** Base64 payload length per algorithm, so a truncated pin is rejected at install, not at load. */
const SRI_LENGTHS: Record<string, number> = { sha256: 44, sha384: 64, sha512: 88 }

function isUsableSri(value: unknown): boolean {
  if (typeof value !== "string") return false
  const match = SRI_PATTERN.exec(value.trim())
  return match !== null && SRI_LENGTHS[match[1] ?? ""] === match[2]?.length
}

export interface InstalledFrontendPlugin extends FrontendPluginSpec {
  /** The module id whose entry this plugin provides; also the node id operations address. */
  moduleId: string
  enabled: boolean
  /**
   * §2.1's own `version` — the plugin's release number, distinct from `requiredApi` (the host API face
   * it needs). Carried on the record because `update` compares it and because an installed list has to
   * say what is installed without fetching the remote.
   */
  version?: string
  /**
   * §2.1's `name` / `description`: what an installed-plugins list has to show without fetching the
   * remote. Carrying them here is the prerequisite for that panel; the panel itself is blocked on the
   * `src/i18n/locales/*` files being free, so these fields currently have one reader — the dev page's
   * readback line — and the §2.1 no-silent-drop test refuses to let them become decoration again.
   */
  name?: string
  description?: string
  /** `[[contributions]]`: what the plugin adds to the host beyond replacing a module id. */
  contributions?: readonly FrontendContribution[]
}

export interface PluginValidationIssue {
  field: string
  message: string
}

export type InstallFrontendPluginResult =
  | { ok: true; plugin: InstalledFrontendPlugin }
  | { ok: false; issues: PluginValidationIssue[] }

export interface DiscoverResult {
  plugins: InstalledFrontendPlugin[]
  issues: PluginValidationIssue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function httpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Checks one candidate record and reports every problem found.
 *
 * `integrity` keys are compared as absolute URLs and values as SRI strings, because the pins are
 * matched by exact URL at load time (`frontendIntegrity.ts`) — accepting a relative or malformed pin
 * would create a rule that can never fire.
 */
export function validateFrontendPlugin(input: unknown): {
  plugin?: InstalledFrontendPlugin
  issues: PluginValidationIssue[]
} {
  const issues: PluginValidationIssue[] = []
  if (!isRecord(input)) {
    return { issues: [{ field: "plugin", message: "expected an object" }] }
  }

  const id = typeof input.id === "string" ? input.id.trim() : ""
  if (id.length === 0) issues.push({ field: "id", message: "must be a non-empty string" })

  if (!httpUrl(input.entry)) issues.push({ field: "entry", message: "must be an absolute http(s) URL" })

  if (input.manifestUrl !== undefined && !httpUrl(input.manifestUrl)) {
    issues.push({ field: "manifestUrl", message: "must be an absolute http(s) URL when present" })
  }

  if (input.alias !== undefined && (typeof input.alias !== "string" || input.alias.trim().length === 0)) {
    issues.push({ field: "alias", message: "must be a non-empty string: the name loadRemote keys this remote by" })
  }

  if (input.entryType !== "module" && input.entryType !== "var") {
    issues.push({ field: "entryType", message: 'must be "module" or "var"' })
  }

  // §2.5's `check API compatibility`, done at install rather than at render time. A range this host
  // cannot interpret is refused exactly like one it fails (`frontendApi.ts` is fail-closed), so a
  // remote is never registered against a host it was not written for.
  if (input.requiredApi !== undefined && typeof input.requiredApi !== "string") {
    issues.push({ field: "requiredApi", message: 'must be a string range like "^1.0"' })
  } else {
    const check = checkFrontendApiRequirement(
      typeof input.requiredApi === "string" ? input.requiredApi : undefined,
    )
    if (!check.compatible) issues.push({ field: "requiredApi", message: check.detail })
  }

  const moduleId = typeof input.moduleId === "string" && input.moduleId.trim().length > 0
    ? input.moduleId.trim()
    : id
  if (input.moduleId !== undefined && moduleId.length === 0) {
    issues.push({ field: "moduleId", message: "must be a non-empty string" })
  }

  if (input.capabilities !== undefined) {
    if (!Array.isArray(input.capabilities)) {
      issues.push({ field: "capabilities", message: "must be an array" })
    } else {
      for (const capability of input.capabilities) {
        if (!CAPABILITY_VOCABULARY.includes(capability as NodeCapabilityId)) {
          issues.push({ field: "capabilities", message: `unknown capability "${String(capability)}"` })
        }
      }
    }
  }

  if (input.shareScope !== undefined && (typeof input.shareScope !== "string" || input.shareScope.trim().length === 0)) {
    issues.push({ field: "shareScope", message: "must be a non-empty string: the share scope this remote loads from" })
  }

  if (input.trust !== undefined && input.trust !== "third-party" && input.trust !== "internal") {
    issues.push({ field: "trust", message: 'must be "third-party" or "internal"' })
  } else if (input.trust === "internal" && moduleId.length > 0 && !isBuiltInModuleId(moduleId)) {
    // §2.4's "internal trusted nodes keep the full host" is a statement about *this build's* nodes,
    // not a field a plugin may set about itself: `trust: "internal"` skips the projection, so
    // honouring a self-declaration would let any manifest hand itself `runner` (and through it the
    // backends that really move files). Only the host's own table can grant it.
    issues.push({
      field: "trust",
      message: `"internal" is only granted to built-in module ids; "${moduleId}" is not one`,
    })
  }

  if (input.integrity !== undefined) {
    if (!isRecord(input.integrity)) {
      issues.push({ field: "integrity", message: "must be a map of url → sri" })
    } else {
      for (const [url, sri] of Object.entries(input.integrity)) {
        if (!httpUrl(url)) issues.push({ field: `integrity.${url}`, message: "key must be an absolute http(s) URL" })
        if (!isUsableSri(sri)) {
          issues.push({ field: `integrity.${url}`, message: "value must be a full SRI like sha384-… (64 base64 chars)" })
        }
      }
    }
  }

  if (input.allowedOrigins !== undefined) {
    if (!Array.isArray(input.allowedOrigins) || !input.allowedOrigins.every(httpUrl)) {
      issues.push({ field: "allowedOrigins", message: "must be an array of absolute http(s) URLs" })
    }
  }

  if (input.contributions !== undefined) {
    if (!Array.isArray(input.contributions)) {
      issues.push({ field: "contributions", message: "must be an array" })
    } else {
      for (const [index, raw] of input.contributions.entries()) {
        if (!isRecord(raw)) {
          issues.push({ field: `contributions[${index}]`, message: "must be an object" })
          continue
        }
        // The vocabulary is closed on purpose (§10.1 第 1 条): accepting a kind nothing consumes is
        // how `allowed_paths` ended up parsed-but-dead on the old backend.
        if (raw.kind !== "component" && raw.kind !== "tray" && raw.kind !== "window") {
          issues.push({ field: `contributions[${index}].kind`, message: 'must be "component", "tray" or "window"' })
        }
        if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
          issues.push({ field: `contributions[${index}].id`, message: "must be a non-empty string" })
        }
      }
    }
  }

  for (const field of ["name", "description"] as const) {
    if (input[field] !== undefined && typeof input[field] !== "string") {
      issues.push({ field, message: "must be a string" })
    }
  }

  if (input.version !== undefined && (typeof input.version !== "string" || input.version.trim().length === 0)) {
    issues.push({ field: "version", message: "must be a non-empty string, the plugin's own release version" })
  }

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    issues.push({ field: "enabled", message: "must be a boolean" })
  }

  if (issues.length > 0) return { issues }

  return {
    issues: [],
    plugin: {
      id,
      entry: String(input.entry),
      entryType: input.entryType as "module" | "var",
      moduleId,
      enabled: input.enabled !== false,
      alias: typeof input.alias === "string" && input.alias.trim().length > 0 ? input.alias.trim() : undefined,
      manifestUrl: typeof input.manifestUrl === "string" && httpUrl(input.manifestUrl)
        ? String(input.manifestUrl)
        : undefined,
      shareScope: typeof input.shareScope === "string" && input.shareScope.trim().length > 0
        ? input.shareScope.trim()
        : undefined,
      version: typeof input.version === "string" && input.version.trim().length > 0
        ? input.version.trim()
        : undefined,
      name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : undefined,
      description: typeof input.description === "string" && input.description.trim().length > 0
        ? input.description.trim()
        : undefined,
      requiredApi: typeof input.requiredApi === "string" && input.requiredApi.trim().length > 0
        ? input.requiredApi.trim()
        : undefined,
      capabilities: input.capabilities as readonly NodeCapabilityId[] | undefined,
      trust: input.trust as InstalledFrontendPlugin["trust"],
      integrity: input.integrity as IntegrityPins | undefined,
      allowedOrigins: input.allowedOrigins as readonly string[] | undefined,
      contributions: input.contributions as readonly FrontendContribution[] | undefined,
    },
  }
}

/**
 * Whether a plugin may be installed from a URL the caller supplied.
 *
 * `src/entrypoints/plugin-host.html` is a **production build input** (`vite.config.ts`'s
 * `build.rolldownOptions.input`), so without this rule a query string in the shipped app turns into
 * "register this remote and load its code in the host's realm". The trust model has no user-confirmation
 * step yet (§10.1 第 3 条: 声明 → 授权 → 投影, and 授权 today has no UI), so the honest gate is:
 * install only in a dev build. Already-installed plugins still load in production — that is what
 * §9's acceptance needs, and it is a different question from who may add one.
 *
 * Takes the env object as a parameter so both branches are testable rather than only the live one.
 */
export function urlInstallAllowed(env: { DEV?: boolean } = import.meta.env): boolean {
  return env.DEV === true
}

export function canInstallFrontendPluginFromUrl(): boolean {
  return urlInstallAllowed()
}

/**
 * Writes the record, then activates it in the same step so install does not need a rebuild.
 *
 * Same `id` is an update (replace). A *different* id claiming the same `moduleId` is refused rather
 * than silently stacked: one module id can only resolve to one source, and letting two records fight
 * over it would make "which build of this node am I running?" depend on activation order.
 */
export function installFrontendPlugin(input: unknown): InstallFrontendPluginResult {
  const { plugin, issues } = validateFrontendPlugin(input)
  if (!plugin) return { ok: false, issues }

  const records = readRecords()
  const conflict = records.find((record) => record.moduleId === plugin.moduleId && record.id !== plugin.id)
  if (conflict) {
    return {
      ok: false,
      issues: [{ field: "moduleId", message: `already provided by installed plugin "${conflict.id}"` }],
    }
  }

  // Re-installing over an existing id goes through the unload step first. Without it a record that
  // narrowed its origins, dropped a pin or stopped declaring a contribution would keep the old
  // registration alive alongside the new one.
  const previous = records.find((record) => record.id === plugin.id)
  if (previous) deactivate(previous)

  writeRecords([...records.filter((record) => record.id !== plugin.id), plugin])
  if (plugin.enabled) activate(plugin)
  return { ok: true, plugin }
}

export type UpdateFrontendPluginResult =
  | { ok: true; plugin: InstalledFrontendPlugin; replaced: { version?: string; enabled: boolean } }
  | { ok: false; issues: PluginValidationIssue[] }

/**
 * Replaces an installed record by id, through §4's unload step.
 *
 * Three rules make this different from `installFrontendPlugin` on the same id, and each one exists
 * because the alternative is a silent change of ownership:
 * - the id must already be installed (otherwise it is an install, and callers should say so),
 * - `moduleId` may not move: re-pointing a module id to a different source is exactly the question
 *   §2.5's update verb must not answer by accident,
 * - an omitted `enabled` keeps the user's current choice instead of defaulting to enabled — disabling
 *   is a user decision, and a plugin release that forgot to restate it would otherwise switch itself
 *   back on.
 */
export function updateFrontendPlugin(input: unknown): UpdateFrontendPluginResult {
  const candidate = validateFrontendPlugin(input)
  if (!candidate.plugin) return { ok: false, issues: candidate.issues }

  const records = readRecords()
  const previous = records.find((record) => record.id === candidate.plugin!.id)
  if (!previous) {
    return {
      ok: false,
      issues: [{ field: "id", message: `no installed plugin with id "${candidate.plugin.id}"; install it instead` }],
    }
  }
  if (previous.moduleId !== candidate.plugin.moduleId) {
    return {
      ok: false,
      issues: [{
        field: "moduleId",
        message: `an update may not re-point "${candidate.plugin.id}" from module "${previous.moduleId}" to "${candidate.plugin.moduleId}"`,
      }],
    }
  }

  const declaresEnabled = isRecord(input) && typeof input.enabled === "boolean"
  const plugin = declaresEnabled ? candidate.plugin : { ...candidate.plugin, enabled: previous.enabled }

  // An approval is about *this load source*. Keeping a grant across an entry change would let a
  // release that moves to a different URL inherit namespaces the host approved for the old bytes,
  // without anyone being asked again.
  if (previous.entry !== plugin.entry) revokeFrontendPluginApproval(plugin.id)

  deactivate(previous)
  writeRecords([...records.filter((record) => record.id !== plugin.id), plugin])
  if (plugin.enabled) activate(plugin)
  return { ok: true, plugin, replaced: { version: previous.version, enabled: previous.enabled } }
}

export function uninstallFrontendPlugin(id: string): boolean {
  const records = readRecords()
  const removed = records.filter((record) => record.id === id)
  if (removed.length === 0) return false
  writeRecords(records.filter((record) => record.id !== id))
  for (const record of removed) {
    const validated = validateFrontendPlugin(record)
    if (validated.plugin) deactivate(validated.plugin)
    // Uninstall is where the approval has to die: a decision about a plugin the host no longer has
    // must not be sitting in storage ready to revive by id when someone installs a different build
    // under the same name. Disabling deliberately keeps it (`setFrontendPluginEnabled`), because
    // there the same record is still installed and the user only switched it off.
    revokeFrontendPluginApproval(id)
  }
  return true
}

/**
 * Enables or disables without removing the record.
 *
 * Disabling is §4's honest `unload`: the contribution is unbound and later `loadRemote` calls are
 * refused. Already-evaluated modules are not revoked — MF 2.9.2 gives no way to do that, so nothing
 * here claims memory was released.
 */
export function setFrontendPluginEnabled(id: string, enabled: boolean): boolean {
  const records = readRecords()
  const target = records.find((record) => record.id === id)
  if (!target) return false
  target.enabled = enabled
  writeRecords(records)
  const validated = validateFrontendPlugin(target)
  if (!validated.plugin) return false
  if (enabled) activate(validated.plugin)
  else deactivate(validated.plugin)
  return true
}

/** Reads storage, validates every record, and reports what could not be honoured. */
export function discoverInstalledFrontendPlugins(): DiscoverResult {
  const plugins: InstalledFrontendPlugin[] = []
  const issues: PluginValidationIssue[] = []
  const { list, unreadable } = readRawRecords()
  if (unreadable) {
    // A torn write is reported rather than read as "nothing installed" — otherwise a corrupted
    // record looks exactly like an uninstalled plugin.
    return { plugins, issues: [{ field: STORAGE_KEY, message: "stored record is not readable JSON" }] }
  }
  for (const [index, record] of list.entries()) {
    const validated = validateFrontendPlugin(record)
    if (validated.plugin) plugins.push(validated.plugin)
    else for (const issue of validated.issues) issues.push({ ...issue, field: `[${index}].${issue.field}` })
  }
  return { plugins, issues }
}

/**
 * What the startup pass actually did — three lists, because "not running" has three different causes.
 *
 * A single `string[]` of activated ids made the refusal information unreachable from outside this
 * module: the comment already promised it, and `logger.warn` was the only consumer, so a record the
 * host refused (bad bytes, or a frontend API the upgraded host no longer offers) was visible in the
 * console but nowhere a caller could act on it. The installed-plugins surface needs exactly that
 * third state — 「装了、合法、但当前宿主不满足」 — and it must not guess it from absence.
 */
export interface FrontendPluginStartup {
  /** Records registered by this pass, in record order. */
  readonly activated: string[]
  /**
   * Records that exist but could not be honoured, each carrying its reason.
   *
   * Validation happens before the enabled switch is read, so a disabled *and* malformed record is
   * reported here rather than in `disabled`: an unreadable record is a refusal whatever its switch says.
   */
  readonly refused: PluginValidationIssue[]
  /** Valid records that are installed and switched off — not failures. */
  readonly disabled: string[]
}

/**
 * Startup hook: registers every enabled record and reports what it did not run.
 *
 * Called from `src/main.tsx` before React mounts, which is what makes "install once, load on every
 * later start without rebuilding the host" true rather than aspirational.
 */
export function activateInstalledFrontendPlugins(): FrontendPluginStartup {
  const { plugins, issues } = discoverInstalledFrontendPlugins()
  if (issues.length > 0) {
    logger.warn("frontend plugin records refused at startup", { issues })
  }
  const activated: string[] = []
  const disabled: string[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) {
      disabled.push(plugin.id)
      continue
    }
    activate(plugin)
    activated.push(plugin.id)
  }
  return { activated, refused: issues, disabled }
}

function activate(plugin: InstalledFrontendPlugin): void {
  registerFrontendPlugin(plugin)
  bindModuleToFrontendPlugin(plugin.moduleId, plugin)
  registerModuleContributions(plugin.id, plugin.contributions, plugin.version)
}

function deactivate(plugin: InstalledFrontendPlugin): void {
  unregisterFrontendPlugin(plugin.id)
  // The binding key is the module id, which is only equal to the plugin id by default.
  unbindModuleFromFrontendPlugin(plugin.moduleId)
  clearModuleContributions(plugin.id)
  forgetPluginTrust(plugin.id)
}

function readRawRecords(): { list: unknown[]; unreadable: boolean } {
  const raw = globalThis.localStorage.getItem(STORAGE_KEY)
  if (!raw) return { list: [], unreadable: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    return { list: Array.isArray(parsed) ? parsed : [], unreadable: !Array.isArray(parsed) }
  } catch {
    return { list: [], unreadable: true }
  }
}

function readRecords(): InstalledFrontendPlugin[] {
  return discoverInstalledFrontendPlugins().plugins
}

function writeRecords(records: readonly InstalledFrontendPlugin[]): void {
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}
