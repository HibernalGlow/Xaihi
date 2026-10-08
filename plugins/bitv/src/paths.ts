/**
 * BitV's path-list normalisation, kept out of `core.ts` because every face needs it and only the host may
 * load `core.ts`: the terminal interaction schema counts the pasted sources for its dashboard, preview and
 * validation before any request leaves the shell, and a face that value-imported the node's core would put a
 * second execution host in its own process (ADR-0074 §5, counted by `scripts/audit-face-execution-path.ts`).
 * Pure text work with no helper dependencies, so `core.ts` imports it from here, forwards the same export
 * name, and normalises the same field again on the host — one implementation, three readers.
 */
export function parseBitvPaths(paths: string[] | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of paths ?? []) {
    for (const line of item.split(/\r?\n/)) {
      const path = line.trim().replace(/^['"]|['"]$/g, "")
      if (!path || seen.has(path)) continue
      seen.add(path)
      result.push(path)
    }
  }
  return result
}
