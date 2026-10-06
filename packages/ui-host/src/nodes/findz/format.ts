export function formatBytes(value: number | undefined): string {
  if (!value) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  const index = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(value)) / Math.log(1024)))
  const rounded = value / 1024 ** index
  return `${rounded >= 100 || index === 0 ? Math.round(rounded) : rounded.toFixed(1)} ${units[index]}`
}

export function formatDensity(value: number | undefined, pendingLabel = "Pending"): string {
  if (!value) return pendingLabel
  return `${Math.round(value).toLocaleString()} B / MP`
}

export function taskProgressPercent(task: { doneArchives: number; totalArchives: number; doneMembers: number; totalMembers: number }): number {
  const total = task.totalMembers || task.totalArchives
  const done = task.totalMembers ? task.doneMembers : task.doneArchives
  return total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0
}
