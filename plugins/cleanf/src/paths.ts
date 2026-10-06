/**
 * Cleanf's path-list normalisation, kept out of `core.ts` because every face needs it and only the host may
 * load `core.ts`: the workspace UI counts the pasted folders before it sends a request, and a face that
 * value-imported the node's core would put a second execution host in its own process (ADR-0074 §5, counted by
 * `scripts/audit-face-execution-path.ts`). Pure text work, so `core.ts` forwards it and normalises the same
 * field again on the host — one implementation, three readers.
 */
export function parseCleanfPaths(textOrPaths: string | string[] | undefined): string[] {
  const values = Array.isArray(textOrPaths) ? textOrPaths : (textOrPaths ?? "").split(/\r?\n|;/)
  return values.map((path) => path.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
}
