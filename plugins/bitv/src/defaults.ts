import type { BitvTransferMode } from "./core.ts"

/**
 * BitV's input defaults, kept out of `core.ts` because every face reads them and only the host may load
 * `core.ts`: the GUI seeds its form fields and fills unset numbers before it sends a request, a terminal face
 * that value-imported the node's core would put a second execution host in its own process (ADR-0074 §5,
 * counted by `scripts/audit-face-execution-path.ts`). This is the one definition — `core.ts` forwards it and
 * applies it in `runBitv`, so the GUI's placeholders and the host's own fallback can never drift apart.
 * `BitvTransferMode` is imported as a type only, which compiles to zero bytes and keeps this module a leaf.
 */
export const BITV_DEFAULTS = {
  recursive: true,
  bitrateStepMbps: 5,
  maxLevels: 10,
  transferMode: "copy" as BitvTransferMode,
  dryRun: true,
} as const
