/**
 * The contract-version negotiation shared by every face of Xiranite.
 *
 * It used to live inside `src/components/modules/ModuleRenderer.tsx`, which broke the rule
 * `docs/plugin-architecture.md` §10.3 第 3 条 states: one rule, one implementation, with a gate
 * proving the sides agree. A terminal face that negotiates the same contract had to copy the
 * function, and two copies of a version comparator is how `["a","ä","b"]` becomes
 * `["a","b","ä"]` in ADR-0074's words.
 *
 * The supported syntax is deliberately a **named subset**, and anything outside it is reported as
 * unsupported rather than guessed at:
 *
 *   - exact        `1.2.3`
 *   - caret        `^1`, `^1.2`, `^1.2.3`   (same major, at or above the bound; for major `0` the
 *                                            minor is pinned too, which is npm's rule and the one
 *                                            that keeps `^0.2.3` from accepting `0.3.0`)
 *   - tilde        `~1`, `~1.2`, `~1.2.3`   (the pinned prefix must match, then at or above)
 *
 * Not supported: `>=`/`<`/`||`, `1.x`, prerelease or build metadata. Those return
 * `reason: "unsupported-range"` so the UI can say "this range syntax is not implemented" instead of
 * claiming the host version is wrong — the old behaviour, which lumped both into a plain `false`,
 * made a typo look like an incompatibility.
 */

export type VersionRangeIssue = "incompatible" | "invalid-version" | "unsupported-range"

export type VersionRangeVerdict =
  | { compatible: true }
  | { compatible: false; reason: VersionRangeIssue; detail: string }

interface Triple {
  major: number
  minor: number
  patch: number
}

const STRICT_VERSION = /^(\d+)\.(\d+)\.(\d+)$/

function parseTriple(text: string): Triple | null {
  const match = STRICT_VERSION.exec(text.trim())
  if (!match) return null
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
  }
}

function compare(a: Triple, b: Triple): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

/**
 * Parses a caret/tilde prefix into (bound, pinned-prefix length).
 *
 * A missing component is `0` for the bound (`^1.2` means "at least 1.2.0") and unpinned for the
 * prefix check (`^1.2` does not pin the patch).
 */
function parsePartial(text: string): { parts: number[] } | null {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(text.trim())
  if (!match) return null
  const parts = [Number.parseInt(match[1]!, 10)]
  parts.push(match[2] === undefined ? -1 : Number.parseInt(match[2], 10))
  parts.push(match[3] === undefined ? -1 : Number.parseInt(match[3], 10))
  return { parts }
}

function toTriple(parts: readonly number[]): Triple {
  return {
    major: parts[0] < 0 ? 0 : parts[0],
    minor: parts[1] < 0 ? 0 : parts[1],
    patch: parts[2] < 0 ? 0 : parts[2],
  }
}

/**
 * Evaluates a contract range against a concrete host version.
 *
 * `version` is what the host publishes (`NODE_HOST_CONTRACT_VERSION`); `range` is what a node or
 * plugin declared. Fail-closed: an unparseable host version is `invalid-version`, and an
 * unrecognised range is `unsupported-range` — both incompatible.
 */
export function checkContractVersion(range: string, version: string): VersionRangeVerdict {
  const host = parseTriple(version)
  if (!host) {
    return {
      compatible: false,
      reason: "invalid-version",
      detail: `host version "${version}" is not X.Y.Z`,
    }
  }

  const trimmed = range.trim()
  if (trimmed.length === 0) {
    return { compatible: false, reason: "unsupported-range", detail: "empty range" }
  }

  if (!trimmed.startsWith("^") && !trimmed.startsWith("~")) {
    const exact = parseTriple(trimmed)
    if (!exact) {
      return {
        compatible: false,
        reason: "unsupported-range",
        detail: `range "${range}": only exact X.Y.Z, ^ and ~ are implemented`,
      }
    }
    return compare(host, exact) === 0
      ? { compatible: true }
      : { compatible: false, reason: "incompatible", detail: `host ${version} != required ${trimmed}` }
  }

  const partial = parsePartial(trimmed.slice(1))
  if (!partial) {
    return {
      compatible: false,
      reason: "unsupported-range",
      detail: `range "${range}": only exact X.Y.Z, ^ and ~ are implemented`,
    }
  }

  const [a = 0, b = -1, c = -1] = partial.parts
  const bound = toTriple([a, b < 0 ? 0 : b, c < 0 ? 0 : c])

  if (trimmed.startsWith("^")) {
    // npm's caret rule, including the 0.x special case: `^0.2.3` is >=0.2.3 <0.3.0.
    const prefixOk = host.major === a && (a !== 0 || b < 0 || host.minor === b)
    return prefixOk && compare(host, bound) >= 0
      ? { compatible: true }
      : { compatible: false, reason: "incompatible", detail: `host ${version} does not satisfy ${range}` }
  }

  // `~1.2.3` is >=1.2.3 <1.3.0; `~1` is >=1.0.0 <2.0.0.
  const prefixOk = host.major === a && (b < 0 || host.minor === b)
  return prefixOk && compare(host, bound) >= 0
    ? { compatible: true }
    : { compatible: false, reason: "incompatible", detail: `host ${version} does not satisfy ${range}` }
}

/**
 * Boolean form, for call sites that only gate rendering.
 *
 * Kept under the name the UI already used so the move out of `ModuleRenderer` is a one-line import
 * change there.
 */
export function isContractVersionCompatible(range: string, version: string): boolean {
  return checkContractVersion(range, version).compatible
}
