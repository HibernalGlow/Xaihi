/**
 * The Xiranite frontend plugin runtime: a single Module Federation 2.0 instance owned by the host.
 *
 * Scope of this file (POC): prove that a plugin built **outside this repository** can be registered
 * at runtime and mounted inside the host's own JS realm with the host's React. It deliberately does
 * not implement PluginManager duties (install/update/registry/`.xplugin`) — `docs/plugin-architecture.md`
 * §10.1 defers those on purpose.
 *
 * Two decisions here are load-bearing and come from measured facts, not habit:
 *
 * 1. `createInstance` rather than `init`: the runtime's `init` is documented as reusing and merging
 *    an instance of the same name/version, which is exactly what a host that outlives plugin reloads
 *    must not do accidentally. `createInstance` is the no-build-plugin entry point.
 * 2. Shared dependencies are enumerated per subpath (`react`, `react/jsx-runtime`, `react-dom`,
 *    `react-dom/client`) instead of relying on the trailing-slash prefix form: the prefix form is what
 *    bundler plugins emit for you, and the runtime-only behaviour of prefix keys is on our
 *    not-yet-verified list (`docs/plugin-architecture.md` §14). React 19 splits its internals across
 *    those subpaths, and a plugin that bundles its own `react-dom/client` is the classic
 *    two-React-instances failure, so we name every key the host actually has.
 */

import { createInstance } from "@module-federation/runtime"
import * as reactDomClient from "react-dom/client"
import * as reactJsxRuntime from "react/jsx-runtime"
import * as react from "react"
import * as reactDom from "react-dom"

import { version as reactVersion } from "react"

import type { NodeCapabilityId } from "@xiranite/contract"
import { declarePluginTrust, integrityRuntimePlugin, type IntegrityPins } from "./frontendIntegrity"

/**
 * The options shape `createInstance` takes.
 *
 * Derived from the function rather than imported by name: 2.9.2 exports `UserOptions` only as the
 * parameter type (the package's own `index.d.ts` re-exports `createInstance` but not that name), so
 * naming it in an import is a type error against the version actually installed.
 */
type HostRuntimeOptions = NonNullable<Parameters<typeof createInstance>[0]>

/** The plugin id a frontend contribution is registered under. */
export interface FrontendPluginSpec {
  id: string
  /** `mf-manifest.json` URL or a direct `remoteEntry.js` URL. */
  entry: string
  /**
   * `module` matches what `@module-federation/vite` emits (native `import()`); `var` is the classic
   * script-tag container and needs no CORS on the serving side.
   */
  entryType: "module" | "var"
  /**
   * §2.1's `alias`, and the word `loadRemote("<alias>/<expose>")` is actually keyed by. Measured the
   * hard way: an `mf-manifest.json` names its own container (`poc_frontend` in the example), so a host
   * that registers the remote under the plugin id (`poc-frontend`) gets
   * `Module "poc_frontend" failed to load` — the built artifact wins that argument, which is why the
   * manifest carries the field at all. Absent means the plugin id, the case where they agree.
   */
  alias?: string
  /**
   * §2.1's `required_api`: a range over the host's plugin-facing frontend API version
   * (`src/plugins/frontendApi.ts`). Checked at install, not at render — the MF runtime itself ignores
   * it; it is carried on the spec so an already-installed plugin's requirement travels with its
   * record.
   */
  requiredApi?: string
  /**
   * Where this plugin's `manifest.toml` came from, kept so §2.5's `update` has something to re-read.
   * It is a *source of record*, not a re-install path: nothing here writes the record from it without
   * going back through `validateFrontendPlugin` and the dev-only install gate.
   */
  manifestUrl?: string
  /**
   * The host namespaces this plugin is **granted** — the install-time record of layer 2
   * (`docs/plugin-architecture.md` §10.1: 声明 → 授权 → 运行期投影). Absent means nothing was granted,
   * which is default-deny rather than default-everything; the manifest's `[permissions]` block is
   * what will feed this once the PluginManager reads it.
   */
  capabilities?: readonly NodeCapabilityId[]
  /**
   * `"internal"` keeps the un-projected `NodeHostApi`, which is what §2.4 says about trusted
   * built-in nodes — 阶段二 loads a built-in node's own `entry.ts` as a remote, and that node is
   * trusted by construction. Anything else (the default) is treated as third-party.
   */
  /**
   * §2.1's `share_scope`. `RemoteInfo` really carries it (`RemoteInfoCommon.shareScope` in
   * runtime-core's config types), so a manifest that names a non-default scope must reach the runtime
   * or the field is decoration — which is how `allowed_paths` ended up on the retired backend.
   */
  shareScope?: string
  trust?: "third-party" | "internal"
  /**
   * Pinned bytes, keyed by absolute resource URL (`sha384-<base64>`). MF has no SRI of its own, so
   * this is the only integrity story the host has — see `frontendIntegrity.ts`.
   */
  integrity?: IntegrityPins
  /** Origins this plugin may load resources from. Empty/absent means the installer set no boundary. */
  allowedOrigins?: readonly string[]
}

const frontendPlugins = new Map<string, FrontendPluginSpec>()

/**
 * The host's shared scope. `lib` is a synchronous provider of the module namespace the host already
 * loaded, so a remote that asks for `react` gets this exact instance — that is the whole point of
 * running plugins in the host realm rather than in an iframe.
 */
function hostShared(): HostRuntimeOptions["shared"] {
  const shareConfig = { singleton: true, requiredVersion: `^${reactVersion}`} as const
  const entries: Array<[string, unknown]> = [
    ["react", react],
    ["react-dom", reactDom],
    ["react-dom/client", reactDomClient],
    ["react/jsx-runtime", reactJsxRuntime],
  ]
  return Object.fromEntries(entries.map(([key, value]) => [
    key,
    { name: key, version: reactVersion, shareConfig, lib: () => value },
  ]))
}

let instance: ReturnType<typeof createInstance> | undefined

function runtime() {
  if (!instance) {
    instance = createInstance({
      name: "xiranite-host",
      remotes: [],
      shared: hostShared(),
      // The loader consults this before fetching anything, which is what makes a verified byte
      // stream and an evaluated byte stream the same object.
      plugins: [integrityRuntimePlugin()],
    })
  }
  return instance
}

/**
 * Registers a plugin built elsewhere. Lazy by contract: `registerRemotes` only writes the entry into
 * the instance options, so no bytes are fetched until the first `loadRemoteEntry` for that id.
 *
 * The trust record is written in the same step, so a remote can never be loadable before whatever
 * pins/origins the installer declared are known.
 */
export function registerFrontendPlugin(spec: FrontendPluginSpec): void {
  frontendPlugins.set(spec.id, spec)
  declarePluginTrust(spec.id, { integrity: spec.integrity, allowedOrigins: spec.allowedOrigins })
  const remoteName = spec.alias ?? spec.id
  runtime().registerRemotes(
    [{ name: remoteName, alias: remoteName, entry: spec.entry, type: spec.entryType, shareScope: spec.shareScope }],
    { force: true },
  )
}

/** The registered plugins, for the debug surface and for the dynamic entry lookup. */
export function registeredFrontendPlugins(): FrontendPluginSpec[] {
  return [...frontendPlugins.values()]
}

/**
 * Drops a registration so later `loadRemote` calls for that id are refused.
 *
 * This is the whole of what "unload" can honestly mean here (§4): MF 2.9.2 has no `unloadRemote`, the
 * `<script>`/`<link>` it inserted stays in the document, and an evaluated ESM module record cannot be
 * revoked. The gate that does exist is ours — `loadRemoteModule` refuses an id that is not registered
 * here — so this deletes our record and deliberately does *not* call `registerRemotes` again (a
 * `force` re-register would put the remote back into the runtime's own list and make the refusal
 * cosmetic). Returns the spec so the caller can finish unbinding its own bookkeeping.
 */
export function unregisterFrontendPlugin(id: string): FrontendPluginSpec | undefined {
  const spec = frontendPlugins.get(id)
  if (!spec) return undefined
  frontendPlugins.delete(id)
  return spec
}

/**
 * Loads one exposed module id (`"<pluginId>/<expose>"`, e.g. `poc-frontend/entry`) from a remote that
 * was built outside this repository.
 */
export async function loadRemoteModule<TModule>(remoteId: string, expose: string): Promise<TModule> {
  const spec = frontendPlugins.get(remoteId)
  if (!spec) {
    throw new Error(`frontend plugin "${remoteId}" is not registered in this host`)
  }
  // The map is keyed by plugin id (that is what install/uninstall address); the runtime is keyed by
  // the remote's own name, so the prefix here has to come from the spec, not the argument.
  return (await runtime().loadRemote<TModule>(`${spec.alias ?? spec.id}/${expose}`)) as TModule
}
