/**
 * linedup 的纯逻辑，从 Xiranite tag `noxide` 的 `packages/nodes/linedup/src/core.ts`
 * 原样搬来（那份就是 pure-logic，台账里 hostRequirements 只有 pure-logic 一档）。
 *
 * 保持零宿主依赖：文件读写、进程、权限都不在这里，接线方 src/index.ts 也只吃字符串。
 */

export interface LinedupFilterInput {
  sourceLines: string[]
  filterLines: string[]
  caseSensitive?: boolean
  sort?: boolean
}

export interface LinedupFilterResult {
  filteredLines: string[]
  removedLines: string[]
  removedCount: number
  keptCount: number
}

export function normalizeLine(line: string): string {
  return line.trim()
}

export function uniqueNonEmptyLines(lines: string[]): string[] {
  return [...new Set(lines.map(normalizeLine).filter(Boolean))]
}

export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
}

export function filterLines(input: LinedupFilterInput): LinedupFilterResult {
  const source = uniqueNonEmptyLines(input.sourceLines)
  const filters = uniqueNonEmptyLines(input.filterLines)
  const caseSensitive = input.caseSensitive ?? true
  const normalizeCompare = (value: string) => (caseSensitive ? value : value.toLowerCase())
  const compareFilters = filters.map(normalizeCompare)

  const filteredLines: string[] = []
  const removedLines: string[] = []

  for (const line of source) {
    const comparableLine = normalizeCompare(line)
    const shouldRemove = compareFilters.some((filter) => filter.length > 0 && comparableLine.includes(filter))
    if (shouldRemove) {
      removedLines.push(line)
    } else {
      filteredLines.push(line)
    }
  }

  const sortedFiltered = input.sort === false ? filteredLines : [...filteredLines].sort(localeSort)
  const sortedRemoved = input.sort === false ? removedLines : [...removedLines].sort(localeSort)

  return {
    filteredLines: sortedFiltered,
    removedLines: sortedRemoved,
    removedCount: sortedRemoved.length,
    keptCount: sortedFiltered.length,
  }
}

export function createDiffRows(sourceLines: string[], filteredLines: string[]): Array<{ line: string; status: "kept" | "removed" }> {
  const kept = new Set(filteredLines.map(normalizeLine))
  return uniqueNonEmptyLines(sourceLines).map((line) => ({
    line,
    status: kept.has(line) ? "kept" : "removed",
  }))
}

export interface LinedupReadStats {
  totalLines: number
  uniqueLines: number
  duplicates: Map<string, number>
}

export function findDuplicateLines(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const raw of lines) {
    const line = normalizeLine(raw)
    if (!line) continue
    counts.set(line, (counts.get(line) ?? 0) + 1)
  }
  const duplicates = new Map<string, number>()
  for (const [line, count] of counts) {
    if (count > 1) duplicates.set(line, count)
  }
  return duplicates
}

export function analyzeReadLines(lines: string[]): LinedupReadStats {
  const normalized = lines.map(normalizeLine).filter(Boolean)
  return {
    totalLines: normalized.length,
    uniqueLines: new Set(normalized).size,
    duplicates: findDuplicateLines(normalized),
  }
}

export interface LinedupRemovalDetail {
  line: string
  matchedFilter: string
}

export function explainRemovals(sourceLines: string[], filterLines: string[], caseSensitive = true): LinedupRemovalDetail[] {
  const source = uniqueNonEmptyLines(sourceLines)
  const filters = uniqueNonEmptyLines(filterLines)
  const normalizeCompare = (value: string) => (caseSensitive ? value : value.toLowerCase())
  const compareFilters = filters.map(normalizeCompare)
  const details: LinedupRemovalDetail[] = []
  for (const line of source) {
    const comparableLine = normalizeCompare(line)
    const matched = compareFilters.find((filter) => filter.length > 0 && comparableLine.includes(filter))
    if (matched) details.push({ line, matchedFilter: matched })
  }
  return details
}

function localeSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}
