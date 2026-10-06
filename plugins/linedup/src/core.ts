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
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

export function filterLines(input: LinedupFilterInput): LinedupFilterResult {
  const source = uniqueNonEmptyLines(input.sourceLines)
  const filters = uniqueNonEmptyLines(input.filterLines)
  const caseSensitive = input.caseSensitive ?? true
  const normalizeCompare = (value: string): string => (caseSensitive ? value : value.toLowerCase())
  const compareFilters = filters.map(normalizeCompare)

  const filteredLines: string[] = []
  const removedLines: string[] = []

  for (const line of source) {
    const comparableLine = normalizeCompare(line)
    const shouldRemove = compareFilters.some((filter) => filter.length > 0 && comparableLine.includes(filter))
    if (shouldRemove) removedLines.push(line)
    else filteredLines.push(line)
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

export interface LinedupRemovalDetail {
  line: string
  matchedFilter: string
}

/** 逐行说明"为什么被去掉"，配合 preview 用。 */
export function explainRemovals(sourceLines: string[], filterLines: string[], caseSensitive = true): LinedupRemovalDetail[] {
  const source = uniqueNonEmptyLines(sourceLines)
  const filters = uniqueNonEmptyLines(filterLines)
  const normalizeCompare = (value: string): string => (caseSensitive ? value : value.toLowerCase())
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
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
