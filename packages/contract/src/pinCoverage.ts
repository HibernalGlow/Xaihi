/**
 * The one implementation of "will this pin actually protect anything".
 *
 * It lives here rather than in `src/plugins` because the same judgement is needed by three callers that
 * must not disagree: the host's pre-install report (`previewFrontendPluginManifest`), the integrity hook
 * itself (`resolveTrustedResource` consults the origin rule before it ever looks at a pin), and any
 * build-time tooling that wants to tell a distributor their pin list is dead weight before publishing.
 * A second copy of a security rule is how those three drift apart while each still looks correct in its
 * own tests — which is the failure mode this whole layer keeps running into.
 *
 * Nothing in this file touches a browser or Node API beyond `URL`, so it stays usable from a script.
 *
 * The enforceable/not-enforceable split is measured, not inferred (§6 of
 * `docs/plugin-architecture.md`): tampering with a pinned-but-`js.async` chunk and with a pinned
 * stylesheet both ran unimpeded, while a wrong pin on a `js.sync` chunk blocked the load.
 */

/**
 * Why "not enforceable" is not solved by pinning more, spelled once.
 *
 * Both the host's pre-install report and the distributor's `--coverage` tool print this text, so the two
 * can never disagree about what the finding means — which is the same class of bug this module exists to
 * stop (a report that tells someone to do the thing that cannot fix it).
 */
export const UNENFORCEABLE_GUIDANCE = "多钉 pin 不解决：这些字节由容器自己抓取，不经过宿主的完整性钩子"

/** One resource the remote will fetch, and whether a pin on it can ever be consulted. */
export interface PluginArtifact {
  url: string
  enforceable: boolean
}

/** Why a declared pin buys nothing. Ordered by when the loader would notice. */
export type PinIneffectiveness =
  | { url: string; reason: "origin-not-allowed" }
  | { url: string; reason: "not-fetched-by-runtime" }
  | { url: string; reason: "no-such-artifact" }

export interface PinCoverage {
  /** Whether an artifact enumeration was supplied at all. */
  enumerated: boolean
  enumeratedArtifactCount: number
  enforceableArtifactCount: number
  /** Artifacts the hook never sees, pinned or not. */
  unenforceableArtifacts: string[]
  /** Enforceable artifacts carrying no pin. */
  unpinnedArtifacts: string[]
  /** Pin keys that match no enumerated artifact. */
  pinsMatchingNothing: string[]
  /** Pin keys the origin allowlist rejects before the pin table is consulted. */
  unreachablePins: string[]
  /** The rollup of all three causes, grouped in the order the loader notices them. */
  ineffectivePins: PinIneffectiveness[]
}

/**
 * Classifies one entry URL against Module Federation's own metadata.
 *
 * §2.1 forbids reading `mf-manifest.json` as Xiranite's plugin manifest; this takes no identity,
 * version or lifecycle fact from it, only "which URLs will be pulled", which is that file's legitimate
 * job. Paths resolve against the entry's directory (a build emits siblings there), and the entry itself
 * is always in the set because it is fetched first. An unparseable entry yields the entry alone —
 * inventing a denominator is worse than having none.
 */
export function classifyPluginArtifacts(entryUrl: string, metadata: unknown): PluginArtifact[] {
  const found = new Map<string, boolean>()
  let directory: URL
  try {
    directory = new URL(".", entryUrl)
  } catch {
    return [{ url: entryUrl, enforceable: true }]
  }
  try {
    found.set(new URL(entryUrl).href, true)
  } catch {
    found.set(entryUrl, true)
  }

  const push = (value: unknown, enforceable: boolean): void => {
    if (typeof value !== "string" || value.length === 0) return
    try {
      const href = new URL(value, directory).href
      // Once enforceable, always: a path can appear in a sync and an async bucket, and the sync path
      // really does go through the runtime.
      found.set(href, found.get(href) === true || enforceable)
    } catch {
      // An unresolvable spelling in someone else's metadata is not a reason to lose the whole list.
    }
  }

  if (typeof metadata !== "object" || metadata === null) return toArtifacts(found)

  const record = metadata as Record<string, unknown>
  const metaData = record.metaData
  if (typeof metaData === "object" && metaData !== null) {
    const remoteEntry = (metaData as Record<string, unknown>).remoteEntry
    if (typeof remoteEntry === "object" && remoteEntry !== null) {
      const entry = remoteEntry as Record<string, unknown>
      if (typeof entry.name === "string") {
        const path = typeof entry.path === "string" && entry.path.length > 0 ? `${entry.path.replace(/\/$/, "")}/` : ""
        push(`${path}${entry.name}`, true)
      }
    }
  }

  for (const list of [record.exposes, record.shared]) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (typeof item !== "object" || item === null) continue
      const assets = (item as Record<string, unknown>).assets
      if (typeof assets !== "object" || assets === null) continue
      for (const kind of ["js", "css"]) {
        const byKind = (assets as Record<string, unknown>)[kind]
        if (typeof byKind !== "object" || byKind === null) continue
        for (const mode of ["sync", "async"]) {
          const bucket = (byKind as Record<string, unknown>)[mode]
          // Only `js.sync` was measured reaching the hook. Async JS is the container's own native
          // import(), and CSS never reaches it at all — also measured.
          const enforceable = kind === "js" && mode === "sync"
          if (Array.isArray(bucket)) for (const path of bucket) push(path, enforceable)
        }
      }
    }
  }
  return toArtifacts(found)
}

/** The URL list only — see {@link classifyPluginArtifacts} for the version that says whether a pin reaches each. */
export function enumeratePluginArtifacts(entryUrl: string, metadata: unknown): string[] {
  return classifyPluginArtifacts(entryUrl, metadata).map((artifact) => artifact.url)
}

/**
 * The origin rule the integrity hook applies, exposed so a report cannot disagree with the enforcer.
 *
 * An empty allowlist means no restriction. A key that does not parse as an absolute URL answers
 * `false`, because the loader would refuse it too.
 */
export function isResourceOriginAllowed(allowedOrigins: readonly string[], url: string): boolean {
  if (allowedOrigins.length === 0) return true
  try {
    const target = new URL(url)
    return allowedOrigins.some((entry) => {
      try {
        return new URL(entry).origin === target.origin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/**
 * Coverage of one plugin's pins against one enumeration. Pure: it writes nothing and fetches nothing,
 * so a host report, a build script, and a test can all run it and get the same answer.
 */
export function describePinCoverage(input: {
  integrity: Record<string, string> | undefined
  allowedOrigins: readonly string[] | undefined
  artifacts: readonly PluginArtifact[] | undefined
}): PinCoverage {
  const pins = input.integrity ?? {}
  const allowlist = input.allowedOrigins ?? []
  const listed = input.artifacts ?? []
  const enumerated = input.artifacts !== undefined
  const enforceable = listed.filter((artifact) => artifact.enforceable)
  const unenforceable = listed.filter((artifact) => !artifact.enforceable)
  const unenforceableUrls = new Set(unenforceable.map((artifact) => artifact.url))
  const knownUrls = new Set(listed.map((artifact) => artifact.url))
  const pinKeys = Object.keys(pins)

  const ineffectivePins: PinIneffectiveness[] = []
  for (const cause of ["origin-not-allowed", "not-fetched-by-runtime", "no-such-artifact"] as const) {
    // Three passes so the list is grouped by cause in the order the loader notices them (the origin
    // check runs before the pin table is consulted). One pin can satisfy several causes and is then
    // reported once, under the first: a reader scanning this should meet the most actionable cause
    // first, not the order someone happened to write their TOML in.
    for (const url of pinKeys) {
      if (causeOf(url) === cause) ineffectivePins.push({ url, reason: cause })
    }
  }

  function causeOf(url: string): PinIneffectiveness["reason"] | undefined {
    if (allowlist.length > 0 && !isResourceOriginAllowed(allowlist, url)) return "origin-not-allowed"
    if (unenforceableUrls.has(url)) return "not-fetched-by-runtime"
    // Without an enumeration there is no basis to call a key unknown, so that cause stays silent rather
    // than inventing a denominator the caller never supplied.
    if (enumerated && !knownUrls.has(url)) return "no-such-artifact"
    return undefined
  }

  return {
    enumerated,
    enumeratedArtifactCount: listed.length,
    enforceableArtifactCount: enforceable.length,
    unenforceableArtifacts: unenforceable.map((artifact) => artifact.url),
    unpinnedArtifacts: enforceable.filter((artifact) => !(artifact.url in pins)).map((artifact) => artifact.url),
    pinsMatchingNothing: enumerated ? pinKeys.filter((key) => !knownUrls.has(key)) : [],
    unreachablePins: pinKeys.filter((key) => !isResourceOriginAllowed(allowlist, key)),
    ineffectivePins,
  }
}

function toArtifacts(found: Map<string, boolean>): PluginArtifact[] {
  return [...found].map(([url, enforceable]) => ({ url, enforceable }))
}
