/**
 * The host's plugin-facing frontend API version — the number a plugin's `required_api` (§2.1) is
 * checked against, which is **not** the same face as `NODE_HOST_CONTRACT_VERSION`.
 *
 * Two faces, deliberately separate numbers (§2.1 的两个 API 面独立协商):
 * - `NODE_HOST_CONTRACT_VERSION` versions `host.contract` (the node contract read through
 *   `NodeHostCapabilities`), and a *module* declares a range for it in its host requirements.
 * - This one versions everything a **frontend plugin** touches from outside the module: the shape of
 *   `InstalledFrontendPlugin`, the `XiraniteFrontendHost` projection vocabulary (§2.4), the
 *   contribution kinds (§10.1), and the `registerRemotes`/`loadRemote` semantics the runtime gives a
 *   remote (§14's measured `get("./entry")` contract). A plugin written against one of those can be
 *   broken by changing any of them, even when `host.contract` itself never moved.
 *
 * `1.0.0` is the first published number, dated by the surfaces that exist today: projection
 * (`frontendHost.ts`), record + activation (`pluginRegistry.ts`), contributions
 * (`contributions.ts`), integrity pins (`frontendIntegrity.ts`). Bump it when a member is added to or
 * removed from the projected host, when a contribution kind enters or leaves the vocabulary, or when
 * the record shape changes in a way an older remote would notice — do not bump it for a bug fix that
 * keeps every field and behavior.
 *
 * Range comparison is reused from `@xiranite/contract` (`checkContractVersion`) rather than written
 * again here: only exact `X.Y.Z`, `^` and `~` are implemented, and anything else comes back as
 * `unsupported-range`, i.e. **fail-closed**. That fail-closed property is the reason this check
 * belongs in `validateFrontendPlugin` and not at render time: an install whose requirement the host
 * cannot interpret must be refused before the remote is ever registered.
 */

import { checkContractVersion, type VersionRangeVerdict } from "@xiranite/contract"

export const XIRANITE_FRONTEND_API_VERSION = "1.0.0"

export interface FrontendApiCheck {
  /** The range the plugin declared, trimmed; absent when it declared none. */
  required?: string
  compatible: boolean
  /** What was decided, in one line, for the readback surface and the refusal notice. */
  detail: string
}

/**
 * Decides whether this host satisfies a plugin's declared `requiredApi`.
 *
 * Only an **absent** requirement is compatible by default: `required_api` is optional in the manifest
 * (§2.1), and a plugin that never declared one must not be refused by a rule it could not have known.
 * A requirement that is present but blank is refused — `checkContractVersion("")` answers
 * `unsupported-range`, and reading `required_api = ""` as "the plugin asked for nothing" would turn a
 * manifest typo into the one case that skips the check.
 */
export function checkFrontendApiRequirement(requiredApi: string | undefined): FrontendApiCheck {
  if (requiredApi === undefined) {
    return {
      compatible: true,
      detail: `no requiredApi declared; accepts frontend API ${XIRANITE_FRONTEND_API_VERSION}`,
    }
  }
  const range = requiredApi.trim()
  const verdict: VersionRangeVerdict = checkContractVersion(range, XIRANITE_FRONTEND_API_VERSION)
  return {
    required: range,
    compatible: verdict.compatible,
    detail: verdict.compatible
      ? `frontend API ${XIRANITE_FRONTEND_API_VERSION} satisfies "${range}"`
      : `frontend API ${XIRANITE_FRONTEND_API_VERSION} does not satisfy "${range}" (${verdict.reason}: ${verdict.detail})`,
  }
}
