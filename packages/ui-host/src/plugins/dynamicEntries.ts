/**
 * The one place that answers "where does this module's entry come from".
 *
 * Before this file the answer was hard-coded: `ModuleRenderer` indexed
 * `packageModules.generated.ts` directly, so every node's entry was baked into the host build. That
 * single lookup is the whole integration surface for frontend plugins — the shape of a
 * `NodeEntry`/`AppNodeEntry` (`packages/contract`) is untouched, only its provenance became
 * pluggable (`docs/plugin-architecture.md` §2.3).
 *
 * Two sources, one contract:
 *   - static: the generated table, which Vite can still split per node;
 *   - dynamic: a Module Federation remote built outside this repository, loaded on first use.
 */

import type { AppNodeEntry, HeadlessNodePackage } from "@xiranite/contract"

import { packageModuleLoaders } from "@/components/modules/packageModules.generated"
import { loadRemoteModule, registeredFrontendPlugins, type FrontendPluginSpec } from "./frontendRuntime"
import { contributedModuleSource } from "./contributions"

export type PackageModuleEntry = AppNodeEntry | HeadlessNodePackage
export type PackageModuleLoader = () => Promise<{ default: PackageModuleEntry }>

const staticLoaders = packageModuleLoaders as Readonly<Record<string, PackageModuleLoader>>

/** Which expose carries a plugin's `AppNodeEntry`; matches the example plugin's declaration. */
const ENTRY_EXPOSE = "entry"

const remoteEntries = new Map<string, FrontendPluginSpec>()

/**
 * Change notification for the entry-source table.
 *
 * §4 of `docs/plugin-architecture.md` defines `unload` as three things: unregister contributions,
 * unmount the React tree, refuse further loads. The first and third follow from the maps themselves;
 * this counter is what makes the second observable to a mounted renderer — without it a component
 * that is already on screen keeps showing the remote until something else re-renders it.
 */
let bindingsVersion = 0
const bindingListeners = new Set<() => void>()

export function getEntryBindingsVersion(): number {
  return bindingsVersion
}

export function subscribeEntryBindings(listener: () => void): () => void {
  bindingListeners.add(listener)
  return () => bindingListeners.delete(listener)
}

function notifyBindingsChanged(): void {
  bindingsVersion += 1
  for (const listener of [...bindingListeners]) listener()
}

/**
 * Declares that `moduleId`'s entry comes from a registered remote instead of the build.
 *
 * Kept separate from `registerFrontendPlugin` because one plugin can contribute several module ids,
 * and because the host must be able to answer "is this loaded?" without importing the MF runtime.
 */
export function bindModuleToFrontendPlugin(moduleId: string, spec: FrontendPluginSpec): void {
  remoteEntries.set(moduleId, spec)
  notifyBindingsChanged()
}

/**
 * Removes a module id's remote binding, so it resolves from the build table again (or not at all).
 *
 * Paired with `unregisterFrontendPlugin`: without this, disabling a plugin would leave
 * `resolveEntryLoader` pointing at a remote that `loadRemoteModule` now refuses, and the node would
 * render as a load failure instead of falling back.
 */
export function unbindModuleFromFrontendPlugin(moduleId: string): boolean {
  const removed = remoteEntries.delete(moduleId)
  if (removed) notifyBindingsChanged()
  return removed
}

/** Every module id whose entry a remote provides, for the workspace palette and for diagnostics. */
export function dynamicModuleIds(): string[] {
  return [...remoteEntries.keys()]
}

/**
 * Whether `moduleId` is provided by this build (a built-in node), as opposed to by a remote.
 *
 * The trust axis depends on this: §2.4 keeps *built-in trusted nodes* on the full `NodeHostApi`, and
 * that exception must be decided by the host's own table, never by a plugin's declaration.
 */
export function isBuiltInModuleId(moduleId: string): boolean {
  return Object.prototype.hasOwnProperty.call(staticLoaders, moduleId)
}

/**
 * The plugin a module id was bound to, or `undefined` when it comes from the build.
 *
 * This is how the renderer decides *who* a module is: an id served by a runtime-registered remote is
 * a plugin and must not be handed the full host API (`frontendHost.ts`).
 */
export function frontendPluginForModule(moduleId: string): FrontendPluginSpec | undefined {
  // Contributed rows are served by their plugin too, so this must not read only the bound table:
  // `ModuleRenderer` decides *trust vs projection* from exactly this function, and a contributed
  // component that answered "no plugin here" would be handed the full host API.
  return remoteEntries.get(moduleId) ?? specOfContributedModule(moduleId)
}

/** The registered remotes themselves, so a debug surface can show what is loaded from where. */
export function frontendPluginRegistry(): FrontendPluginSpec[] {
  return registeredFrontendPlugins()
}

/**
 * Resolves the loader for a module id: an explicitly bound remote first, then the static table.
 *
 * The order is the meaning of binding a plugin rather than an implementation detail: `moduleId` is
 * also the node id `ModuleRenderer` hands to `useNodeHostApi` (`ModuleRenderer.tsx:100`), so a plugin
 * that is installed for `dissolvef` has to *be* `dissolvef` — both for where its entry loads from and
 * for which backend plugin its operations address. The generated table stays the fallback for every id
 * nobody bound, which is why an unbound node keeps loading from the build.
 */
export function resolveEntryLoader(moduleId: string): PackageModuleLoader | undefined {
  const spec = remoteEntries.get(moduleId) ?? specOfContributedModule(moduleId)
  if (spec) {
    const expose = exposeOfModule(moduleId)
    return async () => {
      const loaded = await loadRemoteModule<PackageModuleEntry | { default?: PackageModuleEntry }>(
        spec.id,
        expose,
      )
      // A remote may expose the entry directly or as `default`; normalising here keeps the consumer's
      // `mod.default` contract identical for both sources.
      const entry = (loaded as { default?: PackageModuleEntry }).default ?? (loaded as PackageModuleEntry)
      return { default: entry }
    }
  }

  return staticLoaders[moduleId]
}

/**
 * Which remote serves a contributed module id that is *not* the one the record bound.
 *
 * A plugin installs under one `moduleId` but may declare several `[[contributions]]` rows. Before this
 * lookup only the bound id resolved to the remote, so every other contributed row was listed in the
 * module library and then failed to open — a listing the loader refused to serve.
 */
function specOfContributedModule(moduleId: string): FrontendPluginSpec | undefined {
  const source = contributedModuleSource(moduleId)
  if (!source) return undefined
  return (
    registeredFrontendPlugins().find((plugin) => plugin.id === source.pluginId)
    ?? remoteEntries.get(source.pluginId)
  )
}

/**
 * The expose to fetch for a module id: the contribution's declared `module`, else the one-expose
 * convention.
 *
 * `./FooPanel` is how §2.1 spells it in TOML; the runtime request name drops the `./`
 * (`loadRemote("<remote>/FooPanel")`), which is why `ENTRY_EXPOSE` never carried it.
 */
function exposeOfModule(moduleId: string): string {
  const declared = contributedModuleSource(moduleId)?.module
  if (!declared) return ENTRY_EXPOSE
  return declared.replace(/^\.\//, "") || ENTRY_EXPOSE
}
