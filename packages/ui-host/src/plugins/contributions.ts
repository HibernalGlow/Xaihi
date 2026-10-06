/**
 * Runtime contributions a frontend plugin adds to the host — the `[[contributions]]` half of
 * `docs/plugin-architecture.md` §2.1, restricted to the kinds that actually have a consumer.
 *
 * §10.1 第 1 条 is the rule this obeys: only `component`, `tray` and `window` may be opened, and a
 * new kind must not be accepted before something reads it (that is how `allowed_paths` became a
 * documented-but-dead field on the old backend). Today only `component` is implemented here; tray and
 * window contributions exist for built-in nodes (`trayCoordinator`, `nodeWindowPreferences`) and will
 * join this map when a plugin path for them is wired.
 *
 * Why the metadata has to come from the install record rather than the remote: the module library
 * lists modules *before* loading them (§2.2's 「不 load 组件也能拿到 NodeDef」). A plugin's `def` lives
 * inside its bundle, so listing it would mean fetching and evaluating every installed plugin at
 * startup — which is exactly the eager behaviour this document refuses to copy from Backstage.
 */

import type { ModuleDef } from "@/types/workspace"
import { MODULE_REGISTRY } from "@/components/modules/registry"

/** What a plugin declares it contributes. Only `component` is honoured today. */
export interface FrontendContribution {
  kind: string
  id: string
  /**
   * Which of the remote's exposes carries this component (`./FooPanel` as declared in §2.1).
   *
   * Without it a plugin that contributes more than one component has no way to say which module backs
   * the second row, and the loader can only ever fetch its one fixed `entry` expose — so every extra
   * contribution was listed in the module library but failed to open.
   */
  module?: string
  name?: string
  version?: string
  category?: string
  description?: string
  icon?: string
}

export interface ContributionOutcome {
  /** Modules now listed in the host, in declaration order. */
  modules: ModuleDef[]
  /** Contributions that were not honoured, each with the reason. */
  notes: string[]
}

/** A honoured contribution as the host records it: the row, its owner, and the expose it came from. */
export interface ContributionEntry {
  pluginId: string
  def: ModuleDef
  /** The declared expose, kept verbatim (`./FooPanel`); the loader normalises it when it asks. */
  module?: string
}

const entries = new Map<string, ContributionEntry>()
const listeners = new Set<() => void>()

/**
 * Cached snapshot of the contributed list.
 *
 * Rebuilt only when the map changes, because `useSyncExternalStore` requires `getSnapshot` to return
 * the same reference until something actually changes — a fresh array per call would loop renders.
 */
let snapshot: ModuleDef[] = []

/**
 * Registers one plugin's contributions.
 *
 * An id that already exists in the built-in registry is **not** added as a second row: 阶段二 binds a
 * remote onto an existing node id on purpose (`dissolvef` replaced by a plugin build), and that module
 * is already listed. Overriding the *entry source* is the loader's job (`dynamicEntries`), not the
 * listing's.
 */
export function registerModuleContributions(
  pluginId: string,
  contributions: readonly FrontendContribution[] | undefined,
  pluginVersion?: string,
): ContributionOutcome {
  const modules: ModuleDef[] = []
  const notes: string[] = []

  // Replace, not merge. An update or re-activation that declares fewer rows has to take the missing
  // ones out of the module library: the loop below only ever adds, so a merged semantics leaves a row
  // whose entry source the new build no longer declares.
  for (const [id, entry] of [...entries]) {
    if (entry.pluginId === pluginId) entries.delete(id)
  }

  const plan = planContributions(pluginId, contributions, pluginVersion)
  for (const row of plan.adds) {
    entries.set(row.def.id, row)
    modules.push(row.def)
  }
  notes.push(...plan.notes)

  notify()
  return { modules, notes }
}

/**
 * The one place that decides what a contribution does — pure, so a preview and the real install cannot
 * disagree about it (`pluginManifestInstall.previewFrontendPluginManifest`).
 *
 * Duplicating these two rules outside this function is how "the panel said one row, the host added
 * another" would get written; there is deliberately no second copy.
 *
 * `pluginVersion` is the fallback for a row that does not state its own version. The bundle that
 * serves the row is the plugin's bundle, so a row with no per-row version is at the plugin's version —
 * without it the module library printed `0.0.0` next to a record the host itself listed as `0.1.0`,
 * which is a statement about a byte stream that no longer matches the truth. Both install paths pass
 * the same value, so the preview cannot drift from what activation then does.
 */
export function planContributions(
  pluginId: string,
  contributions: readonly FrontendContribution[] | undefined,
  pluginVersion?: string,
): { adds: ContributionEntry[]; notes: string[] } {
  const adds: ContributionEntry[] = []
  const notes: string[] = []

  for (const contribution of contributions ?? []) {
    if (contribution.kind !== "component") {
      notes.push(`${contribution.kind} contribution "${contribution.id}" ignored: no consumer yet`)
      continue
    }
    if (MODULE_REGISTRY.some((module) => module.id === contribution.id)) {
      notes.push(`component "${contribution.id}" is already a built-in module; entry source still replaced`)
      continue
    }
    const def: ModuleDef = {
      id: contribution.id,
      name: contribution.name ?? contribution.id,
      version: contribution.version ?? pluginVersion ?? "0.0.0",
      category: contribution.category ?? "PLUGIN",
      description: contribution.description ?? "",
      icon: contribution.icon ?? "Puzzle",
    }
    adds.push({ pluginId, def, module: contribution.module })
  }
  return { adds, notes }
}

/** Drops everything one plugin contributed (disable / uninstall). */
export function clearModuleContributions(pluginId: string): number {
  let cleared = 0
  for (const [id, entry] of [...entries]) {
    if (entry.pluginId !== pluginId) continue
    entries.delete(id)
    cleared += 1
  }
  if (cleared > 0) notify()
  return cleared
}

export function contributedModules(): ModuleDef[] {
  return snapshot
}

export function getContributedModule(id: string): ModuleDef | undefined {
  return entries.get(id)?.def
}

export function owningPluginOfModule(id: string): string | undefined {
  return entries.get(id)?.pluginId
}

/**
 * Which plugin serves a contributed module id, and under which expose key.
 *
 * This is the pair the loader needs: a plugin bound onto one module id can contribute several, and
 * only the contribution knows which of the remote's exposes backs each one.
 */
export function contributedModuleSource(id: string): { pluginId: string; module?: string } | undefined {
  const entry = entries.get(id)
  if (!entry) return undefined
  return { pluginId: entry.pluginId, module: entry.module }
}

/** Built-ins plus whatever is currently contributed — what every listing should be reading. */
export function allModules(): ModuleDef[] {
  const contributed = contributedModules()
  return contributed.length === 0 ? MODULE_REGISTRY : [...MODULE_REGISTRY, ...contributed]
}

export function subscribeModuleContributions(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  snapshot = [...entries.values()].map((entry) => entry.def)
  for (const listener of [...listeners]) listener()
}

/** Test seam: the map is module-level, so a suite needs to be able to empty it. */
export function resetModuleContributions(): void {
  entries.clear()
  notify()
}
