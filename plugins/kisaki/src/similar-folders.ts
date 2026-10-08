import type { KisakiGroup } from "./core.js"

export interface KisakiSimilarFolderStat {
  path: string
  count: number
  bytes: number
  groupCount: number
  previewPath?: string
}

export function buildKisakiSimilarFolders(groups: KisakiGroup[], threshold = 2): KisakiSimilarFolderStat[] {
  const minimum = Math.max(1, Math.floor(Number.isFinite(threshold) ? threshold : 2))
  const stats = new Map<string, { count: number; bytes: number; groups: Set<number>; previewPath?: string; previewIsReference: boolean }>()
  for (const group of groups) for (const entry of group.entries) {
    const folder = parentPath(entry.path)
    if (!folder) continue
    const current = stats.get(folder) ?? { count: 0, bytes: 0, groups: new Set<number>(), previewIsReference: true }
    current.count += 1
    current.bytes += entry.size
    current.groups.add(group.id)
    if (!current.previewPath || (!entry.isReference && current.previewIsReference)) {
      current.previewPath = entry.path
      current.previewIsReference = entry.isReference === true
    }
    stats.set(folder, current)
  }
  return [...stats].flatMap(([path, value]) => value.count < minimum ? [] : [{ path, count: value.count, bytes: value.bytes, groupCount: value.groups.size, previewPath: value.previewPath }]).sort((left, right) => right.count - left.count || right.bytes - left.bytes || left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" }))
}

function parentPath(path: string): string | undefined {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "")
  const index = normalized.lastIndexOf("/")
  if (index <= 0) return undefined
  const parent = normalized.slice(0, index)
  return path.includes("\\") ? parent.replaceAll("/", "\\") : parent
}
