import type { KisakiGroup, KisakiSelectionStrategy } from "./core.js"

/**
 * Kisaki's group selection strategies, adapted from czkawka-tauri's group selection assistant.
 *
 * This is the one place the strategy table lives, and it stays reachable through `core.ts` (which re-exports
 * it) so the published contract does not change. It sits outside the engine on purpose: it is a pure function
 * over a scan result document — no `node:*`, no host capability, no run — which is what lets a terminal face
 * call it directly while `runKisaki` itself may only run inside the host (ADR-0074 §5).
 */
export function smartSelect(groups: KisakiGroup[], strategy: KisakiSelectionStrategy, current: Iterable<string> = [], keepExisting = false): string[] {
  const selection = new Set(keepExisting ? current : [])
  for (const group of groups) {
    if (group.entries.length < 2) continue
    const references = group.entries.filter((entry) => entry.isReference)
    if (references.length) {
      for (const entry of group.entries) if (!entry.isReference) selection.add(entry.path)
      continue
    }
    const sorted = [...group.entries].sort((left, right) => {
      if (strategy === "all-except-newest") return right.modifiedDate - left.modifiedDate
      if (strategy === "all-except-oldest") return left.modifiedDate - right.modifiedDate
      if (strategy === "all-except-biggest") return right.size - left.size
      if (strategy === "all-except-smallest") return left.size - right.size
      return left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" })
    })
    for (const entry of sorted.slice(1)) selection.add(entry.path)
  }
  return [...selection]
}
