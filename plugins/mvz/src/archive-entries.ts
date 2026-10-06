/**
 * mvz's archive-entry line parsing: `archive//internal` text in, `ArchiveEntry[]` out. One implementation, two
 * consumers.
 *
 * This used to live in `core.ts`, so `src/nodes/mvz/Component.tsx` could only show the「N 个压缩包」grouping by
 * value-importing `@xiranite/node-mvz/core`. A core value import puts a second execution host in the face process,
 * which ADR-0074 §5 rejects, so the parsing now lives here and `core.ts` only re-exports it: the QuickJS bundle still
 * gets exactly one copy (through this relative edge), and the GUI reaches it through the package's
 * `./archive-entries` subpath. Same shape as classf's `blacklist.ts` — the implementation sits next to the core, the
 * core forwards.
 *
 * Pure text work only: no `MvzRuntime`, no filesystem, no 7-Zip invocation.
 */

/** findz and `7z l` print rows as `<date> <time> <size> <path>`; only the path half carries the entry. */
const LONG_FORMAT_RE = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[\d.]+[BKMGT]?\s+(.+)$/i

/** An entry inside an archive, plus the line it was parsed from so the UI can key off it. */
export interface ArchiveEntry {
  archivePath: string
  internalPath: string
  rawLine: string
}

export function parseMvzLine(line: string, separator = "//"): ArchiveEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const pathPart = LONG_FORMAT_RE.exec(trimmed)?.[1] ?? trimmed
  const index = pathPart.indexOf(separator)
  if (index < 0) return null
  const archivePath = pathPart.slice(0, index).trim()
  const internalPath = pathPart.slice(index + separator.length).trim()
  if (!archivePath || !internalPath) return null
  return { archivePath, internalPath, rawLine: line }
}

export function parseMvzEntries(textOrLines: string | string[] = "", separator = "//"): ArchiveEntry[] {
  const lines = Array.isArray(textOrLines) ? textOrLines : textOrLines.split(/\r?\n/)
  return lines.map((line) => parseMvzLine(line, separator)).filter((entry): entry is ArchiveEntry => Boolean(entry))
}

export function groupByArchive(entries: ArchiveEntry[]): Map<string, ArchiveEntry[]> {
  const groups = new Map<string, ArchiveEntry[]>()
  for (const entry of entries) {
    const current = groups.get(entry.archivePath) ?? []
    current.push(entry)
    groups.set(entry.archivePath, current)
  }
  return groups
}
