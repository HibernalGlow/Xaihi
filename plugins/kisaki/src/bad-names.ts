import type { KisakiEntry, KisakiRenameItem } from "./core.js"

export function createBadNameRenamePlan(entries: readonly KisakiEntry[], selectedPaths: Iterable<string>): KisakiRenameItem[] {
  const selected = new Set(selectedPaths)
  const plan = new Map<string, KisakiRenameItem>()
  for (const entry of entries) {
    const target = entry.secondaryPath?.trim()
    if (!selected.has(entry.path) || !target || !sameDirectory(entry.path, target)) continue
    const targetName = basename(target)
    if (!targetName || targetName === "." || targetName === ".." || targetName === basename(entry.path)) continue
    plan.set(entry.path, { path: entry.path, targetName })
  }
  return [...plan.values()]
}

function sameDirectory(source: string, target: string): boolean {
  return dirname(source).toLocaleLowerCase() === dirname(target).toLocaleLowerCase()
}

function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return index < 0 ? "" : path.slice(0, index)
}

function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return path.slice(index + 1)
}
