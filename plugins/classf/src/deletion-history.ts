/**
 * classf 的删除历史分析纯逻辑叶子。
 * 从 CSV 解析删除记录并提取高频画师/社团标签作为黑名单候选词。
 *
 * @module xaihi-classf/deletion-history
 */

import { extractSameaArtistKeywords } from './blacklist.ts'

export interface ClassfDeletionCandidate {
  keyword: string
  occurrences: number
}

export interface ClassfDeletionAnalysis {
  candidates: ClassfDeletionCandidate[]
  totalRows: number
}

/** 简单的安全 CSV 行提取，支持常见引号与换行。 */
function parseCsvRows(csv: string): string[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const rows: string[] = []
  for (const line of lines) {
    // 优先匹配第一列（可能带引号）
    const match = line.match(/^"([^"]+)"/) || line.match(/^([^,]+)/)
    if (match && match[1]) {
      rows.push(match[1].trim())
    } else {
      rows.push(line)
    }
  }
  return rows
}

/**
 * 分析删除历史 CSV 内容，统计并提取达到出现频次阈值的画师/标签关键词。
 */
export function analyzeClassfDeletionHistory(
  csv: string,
  minimumOccurrences = 3,
): ClassfDeletionAnalysis {
  const rows = parseCsvRows(csv)
  const counts = new Map<string, number>()

  for (const row of rows) {
    const keywords = extractSameaArtistKeywords([row])
    for (const kw of keywords) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1)
    }
  }

  const candidates: ClassfDeletionCandidate[] = []
  for (const [keyword, occurrences] of counts.entries()) {
    if (occurrences >= minimumOccurrences) {
      candidates.push({ keyword, occurrences })
    }
  }

  candidates.sort((a, b) => b.occurrences - a.occurrences)
  return { candidates, totalRows: rows.length }
}

/**
 * 从候选分析结果中提取关键词列表。
 */
export function suggestClassfBlacklistKeywords(candidates: ClassfDeletionCandidate[]): string[] {
  return candidates.map((candidate) => candidate.keyword)
}
