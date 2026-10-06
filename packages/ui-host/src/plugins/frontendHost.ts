/**
 * The capability projection a third-party frontend plugin is handed instead of the full host API.
 *
 * This is the layer `docs/plugin-architecture.md` §2.4 and §10.1 call 运行期投影, and it exists
 * because the statement it replaces was false: `contract.supportedCapabilities` claimed the host
 * injects only what a node needs while `useNodeHostApi` always injected all nine namespaces. A
 * Module Federation remote runs in the **host's own realm** (MF 2.9.2 ships no sandbox — §6.4), so
 * the only thing standing between a plugin and the whole host is this projection.
 *
 * Three layers, in order, and the projection reports only the last one:
 *   1. declared — what the plugin's manifest says it uses (`FrontendPluginSpec.capabilities`,
 *      today recorded by whoever installs the plugin);
 *   2. granted — that list ∩ `GRANTABLE_FRONTEND_CAPABILITIES`, the host's own ceiling;
 *   3. projected — the frozen object returned here; ungranted namespaces are **absent**, not stubs,
 *      so a plugin cannot probe its way past the ceiling by calling something that lies.
 *
 * Two facts to keep in mind before widening the ceiling:
 *   - `runner` addresses *any* backend node by id, and the host has one bearer token for the whole
 *     process (§10.3.1). It stays out until plugin-scoped credentials exist. `dissolve` moves files.
 *   - `clipboard`/`localFiles` reach OS surfaces and their shape already drifts by platform (§6.6),
 *     which is the "运行时形状漂移" the doc forbids for third parties.
 *
 * `trust: "internal"` is not a bypass invented here: §2.4 keeps built-in trusted nodes on the full
 * `NodeHostApi`, and an internal node loaded as a remote (阶段二) is that case. It is opt-in per
 * registration, never the default.
 */

import type {
  NodeCapabilityId,
  NodeContractCapability,
  NodeHostApi,
  NodeHostCapabilities,
} from "@xiranite/contract"

import type { FrontendPluginSpec } from "./frontendRuntime"
import { frontendPluginApproval } from "./frontendGrants"

/** The namespaces a third-party frontend plugin may be granted at all. */
export const GRANTABLE_FRONTEND_CAPABILITIES: readonly NodeCapabilityId[] = [
  "contract",
  "state",
  "workspace",
  "config",
  "env",
]

/** Always provided: it is how a plugin learns what it did *not* get. */
const ALWAYS_GRANTED: readonly NodeCapabilityId[] = ["contract"]

/**
 * The host API as a plugin sees it: `contract` plus whichever namespaces survived the grant.
 *
 * Not `NodeHostApi` on purpose — the deprecated top-level aliases (`getData`, `actions`, …) are
 * internal-only (§10.2 第 2 条), and an object that can answer `undefined` for a whole namespace is
 * a different contract from one that always has nine.
 */
export type XiraniteFrontendHost = Pick<NodeHostCapabilities, "contract"> & Partial<NodeHostCapabilities>

/**
 * What a third-party plugin's component is actually handed.
 *
 * `NodeComponentProps` (contract) declares `host: NodeHostApi` because that is the built-in nodes'
 * contract; a remote cannot be typed with it without lying, since the projection omits ungranted
 * namespaces. `localFiles` is the proof the lie had consequences: `ModuleRenderer` passes
 * `nodeHost.localFiles` to a provider, and on a host typed as the full API that dereference looks
 * legitimate while the value is `undefined` for every plugin.
 *
 * Field names mirror `NodeComponentProps` on purpose — the remote's own `default export` is
 * indistinguishable from a built-in entry at this call site otherwise.
 */
export interface FrontendPluginComponentProps {
  compId: string
  host: XiraniteFrontendHost
}

export interface FrontendHostAccess {
  readonly pluginId: string
  readonly trusted: boolean
  readonly granted: readonly NodeCapabilityId[]
  /** Declared but refused because they are outside the ceiling — distinct from "never asked for". */
  readonly refused: readonly NodeCapabilityId[]
  /**
   * Asked for since the last approval, so nothing decided covers them — §10.1 第 3 条's 授权 step is a
   * separate artifact, and an updated plugin that quietly adds `config` to its declaration must land
   * here rather than in `granted`.
   */
  readonly unapproved: readonly NodeCapabilityId[]
}

/** The whole capability vocabulary, in the order every list below is reported in. */
export const ALL_FRONTEND_CAPABILITY_IDS: readonly NodeCapabilityId[] = [
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

/**
 * Reports a capability set in vocabulary order rather than insertion order.
 *
 * The same set must produce the same string whatever order the plugin wrote it in, or the projection
 * memo key, the stored approval and the diagnostics disagree with each other about what one grant is.
 */
export function orderFrontendCapabilities(capabilities: Iterable<NodeCapabilityId>): NodeCapabilityId[] {
  const set = new Set(capabilities)
  return ALL_FRONTEND_CAPABILITY_IDS.filter((capability) => set.has(capability))
}

/**
 * Resolves what a registration actually gets from the **approval record** (`frontendGrants.ts`),
 * not from the plugin's own declaration.
 *
 * Default-deny holds in both directions: no approval record means `contract` and nothing else, and a
 * declaration that grew after the approval lands in `unapproved` rather than being honoured. That
 * distinction is the point of §10.1 第 3 条 — before this artifact existed, any in-ceiling
 * `capabilities` entry *was* its own grant, so 「声明 → 授权 → 投影」 was really two layers wearing
 * three names.
 */
export function resolveFrontendHostAccess(spec: FrontendPluginSpec): FrontendHostAccess {
  if (spec.trust === "internal") {
    return { pluginId: spec.id, trusted: true, granted: ALL_FRONTEND_CAPABILITY_IDS, refused: [], unapproved: [] }
  }

  const declared = orderFrontendCapabilities(spec.capabilities ?? [])
  const approval = frontendPluginApproval(spec.id)
  if (!approval) {
    return { pluginId: spec.id, trusted: false, granted: [...ALWAYS_GRANTED], refused: [], unapproved: declared }
  }

  // `refused` keeps whatever the approval refused (including spellings that are not in the vocabulary
  // at all — "you asked for `frobnicate`, no such capability" is worth reporting verbatim), and
  // anything asked for since then is neither granted nor refused: it is unapproved.
  const covered = new Set<NodeCapabilityId>([...approval.granted, ...approval.refused])
  return {
    pluginId: spec.id,
    trusted: false,
    granted: orderFrontendCapabilities([...ALWAYS_GRANTED, ...approval.granted]),
    refused: approval.refused,
    unapproved: declared.filter((capability) => !covered.has(capability)),
  }
}

/**
 * Builds layer 3. Trusted registrations return the host object itself — same identity, so a plugin
 * built like a built-in node keeps the memoisation behaviour §10.2 第 3 条 demands.
 *
 * Memoised on (host, spec): the projection is created inside render, and a plugin that stores `host`
 * in a `useEffect` dependency would re-subscribe every keystroke if we returned a fresh object.
 */
export function projectHostForFrontendPlugin(
  host: NodeHostApi,
  spec: FrontendPluginSpec | undefined,
): XiraniteFrontendHost {
  if (!spec) return host
  const access = resolveFrontendHostAccess(spec)
  if (access.trusted) return host

  const cached = projectionCache.get(host)
  const cacheKey = `${spec.id}:${access.granted.join(",")}`
  if (cached?.key === cacheKey) return cached.projection

  const contract: NodeContractCapability = {
    name: host.contract.name,
    version: host.contract.version,
    supportedCapabilities: access.granted,
    hasCapability: (capability: NodeCapabilityId) => access.granted.includes(capability),
  }

  const projection: XiraniteFrontendHost = { contract }
  const granted = access.granted
  // One line per namespace, no loop-and-cast: a typo has to fail the type check, not silently
  // hand a plugin a namespace nobody granted it.
  if (granted.includes("state")) projection.state = host.state
  if (granted.includes("workspace")) projection.workspace = host.workspace
  if (granted.includes("config")) projection.config = host.config
  if (granted.includes("env")) projection.env = host.env
  Object.freeze(projection)

  projectionCache.set(host, { key: cacheKey, projection })
  return projection
}

const projectionCache = new WeakMap<NodeHostApi, { key: string; projection: XiraniteFrontendHost }>()
