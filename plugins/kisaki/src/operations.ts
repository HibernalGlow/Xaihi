import type { KisakiDestinationItem, KisakiGroup } from "./core.js"

export interface KisakiGroupOrganizeOptions {
  subfolderTemplate?: string
  skipSingleFileFolders?: boolean
}

export interface KisakiGroupOrganizePlan {
  items: KisakiDestinationItem[]
  selectedGroupCount: number
  targetFolderCount: number
}

/** Pure TypeScript port of the fork's organize-similar-groups plan builder. */
export function buildKisakiGroupOrganizePlan(groups: KisakiGroup[], selectedPaths: Iterable<string>, options: KisakiGroupOrganizeOptions = {}): KisakiGroupOrganizePlan {
  const selected = new Set(selectedPaths)
  const selectedGroupIds = new Set(groups.filter((group) => group.entries.some((entry) => !entry.isReference && selected.has(entry.path))).map((group) => group.id))
  const groupedByFolder = new Map<string, { groupId: number; parent: string; paths: string[] }>()
  for (const group of groups) {
    if (!selectedGroupIds.has(group.id)) continue
    for (const entry of group.entries) {
      if (entry.isReference) continue
      const parent = parentDirectory(entry.path)
      if (!parent) continue
      const key = `${group.id}\0${parent}`
      const item = groupedByFolder.get(key) ?? { groupId: group.id, parent, paths: [] }
      if (!item.paths.includes(entry.path)) item.paths.push(entry.path)
      groupedByFolder.set(key, item)
    }
  }
  const items: KisakiDestinationItem[] = []
  for (const group of groupedByFolder.values()) {
    if ((options.skipSingleFileFolders ?? true) && group.paths.length < 2) continue
    const destination = joinPortable(group.parent, resolveSubfolderName(options.subfolderTemplate ?? "variants_{groupId}", group.groupId))
    for (const path of group.paths) items.push({ path, destination })
  }
  return { items, selectedGroupCount: selectedGroupIds.size, targetFolderCount: new Set(items.map((item) => item.destination)).size }
}

export function resolveSubfolderName(template: string, groupId: number): string {
  const sanitized = template.replace(/[<>:"/\\|?*]/g, "_").trim() || "variants_{groupId}"
  return sanitized.replaceAll("{groupId}", String(groupId).padStart(4, "0"))
}

function parentDirectory(path: string): string {
  const normalized = path.replaceAll("\\", "/")
  const index = normalized.lastIndexOf("/")
  if (index <= 0) return ""
  const parent = normalized.slice(0, index)
  return path.includes("\\") ? parent.replaceAll("/", "\\") : parent
}

function joinPortable(parent: string, child: string): string {
  const separator = parent.includes("\\") ? "\\" : "/"
  return `${parent}${parent.endsWith("/") || parent.endsWith("\\") ? "" : separator}${child}`
}
