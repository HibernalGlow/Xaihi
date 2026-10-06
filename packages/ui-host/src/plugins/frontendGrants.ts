/**
 * The 授权 layer of `docs/plugin-architecture.md` §10.1 第 3 条, as an artifact that can be pointed at.
 *
 * Before this module the three layers were really two: `FrontendPluginSpec.capabilities` was the
 * plugin's declaration *and* the thing the projection honoured, so anything inside
 * {@link GRANTABLE_FRONTEND_CAPABILITIES} was granted by the act of being declared. §795 names the
 * missing piece as 「谁批准」 — there was no decision to attribute, revoke, or show.
 *
 * What this is not: it is not the consent UI. There is still no dialog, so today the only caller is the
 * dev install page, at the same moment it declares pins and origins — the place a human is already
 * saying yes. The UI is a later button writing into this store, not a new mechanism. Per that,
 * nothing here pretends to know *who* approved; a field claiming an approver that no dialog produced
 * would be a fake audit trail.
 *
 * Revocation is the reason this is worth a store at all: `revokeFrontendPluginApproval` takes
 * namespaces away from an installed plugin without uninstalling it, which the spec field could never
 * express (rewriting the declaration looked like the plugin had never asked).
 *
 * Storage sits beside the install records (same `localStorage` rationale as §2.5: the host-side write
 * route is still missing). Approval is **not** re-derivable from a record — records carry what was
 * declared, and a declaration must not silently re-grant itself on the next start.
 */

import type { NodeCapabilityId } from "@xiranite/contract"

import {
  ALL_FRONTEND_CAPABILITY_IDS,
  GRANTABLE_FRONTEND_CAPABILITIES,
  orderFrontendCapabilities,
} from "./frontendHost"

const GRANTS_KEY = "xiranite.frontendPluginApprovals"

/** One recorded decision: what was asked, what the ceiling allowed, what it refused. */
export interface FrontendPluginApproval {
  readonly pluginId: string
  /** The declaration this decision was made against, in vocabulary order. */
  readonly declared: readonly NodeCapabilityId[]
  /** `declared` ∩ the ceiling, in vocabulary order. `contract` is always provided and so is not listed. */
  readonly granted: readonly NodeCapabilityId[]
  /**
   * Everything declared that is not granted — over the ceiling *or not a capability at all*.
   *
   * Kept verbatim rather than vocabulary-ordered on purpose: "`frobnicate` is not a thing this host
   * knows" is the answer the plugin author needs, and folding it into a refusal list that only holds
   * known ids would lose it.
   */
  readonly refused: readonly NodeCapabilityId[]
  readonly decidedAt: string
}

const approvals = new Map<string, FrontendPluginApproval>()
const listeners = new Set<() => void>()
let loaded = false

/**
 * Records the host's decision for one plugin: the intersection, not the request.
 *
 * Re-approving replaces the decision wholesale, which is what makes "the plugin updated and quietly
 * asked for `config`" land in `unapproved` (see `resolveFrontendHostAccess`) until the host decides
 * again.
 */
export function approveFrontendPluginCapabilities(
  pluginId: string,
  declared: readonly NodeCapabilityId[],
  decidedAt = new Date().toISOString(),
): FrontendPluginApproval {
  // Read before writing. Without this, an approval on a page that has not consulted the store yet
  // persists a map holding only its own entry and erases every earlier decision — measured live: two
  // installs in a row left `xiranite.frontendPluginApprovals` with one record instead of two.
  loadIfNeeded()
  const ordered = orderFrontendCapabilities(declared)
  const granted = ordered.filter((capability) => GRANTABLE_FRONTEND_CAPABILITIES.includes(capability))
  const grantedSet = new Set<NodeCapabilityId>(granted)
  // Refusal is reported in vocabulary order too, with spellings the host has no name for appended in
  // sorted order: `resolveFrontendHostAccess`'s memo key and the diagnostics must not disagree about
  // what one refused set is just because the plugin wrote `clipboard, runner` instead of the reverse.
  const notGranted = [...new Set(declared.filter((capability) => !grantedSet.has(capability)))]
  const known = orderFrontendCapabilities(notGranted.filter((capability) => ALL_FRONTEND_CAPABILITY_IDS.includes(capability)))
  const knownSet = new Set<NodeCapabilityId>(known)
  const refused = [...known, ...notGranted.filter((capability) => !knownSet.has(capability)).sort()]
  const approval: FrontendPluginApproval = { pluginId, declared: ordered, granted, refused, decidedAt }

  approvals.set(pluginId, approval)
  persist()
  notify()
  return approval
}

export function frontendPluginApproval(pluginId: string): FrontendPluginApproval | undefined {
  loadIfNeeded()
  return approvals.get(pluginId)
}

/** Drops the decision; the plugin keeps its record and contributions but falls back to `contract` only. */
export function revokeFrontendPluginApproval(pluginId: string): boolean {
  loadIfNeeded()
  if (!approvals.delete(pluginId)) return false
  persist()
  notify()
  return true
}

export function subscribeFrontendPluginApprovals(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Test seam: re-reads the persisted decisions.
 *
 * The real host only ever loads once per process, so this exists to make the storage path
 * (including the ceiling re-validation in {@link isApproval}) testable rather than assumed.
 */
export function reloadFrontendPluginApprovals(): void {
  loaded = false
  approvals.clear()
  loadIfNeeded()
}

/** Test seam: the store is module-level, so a suite needs to be able to empty it. */
export function resetFrontendPluginApprovals(): void {
  approvals.clear()
  // Left unloaded on purpose: a test that seeds storage by hand afterwards then goes through the same
  // read path a fresh page load does, which is what makes the lost-update case above testable at all.
  loaded = false
  persist()
  notify()
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function persist(): void {
  globalThis.localStorage.setItem(GRANTS_KEY, JSON.stringify([...approvals.values()]))
}

function loadIfNeeded(): void {
  if (loaded) return
  loaded = true
  const raw = globalThis.localStorage.getItem(GRANTS_KEY)
  if (!raw) return
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // A torn blob is reported as "no approvals" — which is the safe reading, unlike an install record
    // that would then look uninstalled. Nothing here trusts a stored grant it could not parse.
    return
  }
  if (!Array.isArray(parsed)) return
  for (const entry of parsed) {
    if (!isApproval(entry)) continue
    approvals.set(entry.pluginId, entry)
  }
}

/**
 * A stored approval is only honoured if every granted id is still inside the ceiling.
 *
 * Widening then narrowing the ceiling would otherwise revive a decision the current host would not
 * make, and the projection trusts this list to decide which namespaces exist at all.
 */
function isApproval(value: unknown): value is FrontendPluginApproval {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<FrontendPluginApproval>
  if (typeof candidate.pluginId !== "string" || typeof candidate.decidedAt !== "string") return false
  if (!Array.isArray(candidate.declared) || !Array.isArray(candidate.granted) || !Array.isArray(candidate.refused)) return false
  return candidate.granted.every((capability) => GRANTABLE_FRONTEND_CAPABILITIES.includes(capability))
}
