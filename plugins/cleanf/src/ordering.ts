/**
 * Cleanf's removal order: one implementation, two consumers.
 *
 * `sortTargetsForRemoval` used to live only in `core.ts`, which left `platform.ts` — the machine half that hands
 * batches to `@xaihi/file-operations` — no way to order a deletion without value-importing `./core.js`. `cli.ts`
 * loads `platform.ts`, so that edge evaluated the node's whole business module inside the face process, which is a
 * second execution host for the same core (ADR-0074 §5). The implementation therefore sits here and `core.ts`
 * forwards the same name: the host's QuickJS bundle, `planCleanf` and every existing `./core.js` consumer still
 * resolve exactly one definition. Same shape as enginev's `filter.ts`.
 *
 * Deepest item first, then the longest path: a parent must never be trashed before its children, whether the plan
 * is being built on the host or the batches are being sent from the machine half.
 */
import type { CleanfTarget } from "./core.ts"

export function sortTargetsForRemoval(targets: CleanfTarget[]): CleanfTarget[] {
  return [...targets].sort((a, b) => b.depth - a.depth || b.path.length - a.path.length)
}
