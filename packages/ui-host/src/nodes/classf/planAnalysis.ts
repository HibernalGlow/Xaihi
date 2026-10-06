import type { ClassfData } from "@xiranite/node-classf/core"

export function analyzeClassfPlan(result: ClassfData | null) {
  const items = result?.items ?? []
  const alreadyCount = items.filter((item) => item.stage === "already").length
  const delCount = items.filter((item) => item.stage === "del").length
  const waitCount = items.filter((item) => item.stage === "wait").length
  const classifiedCount = alreadyCount + delCount + waitCount
  const directoryCount = new Set(items.map((item) => item.sourcePath.replace(/[\\/][^\\/]+$/, ""))).size
  const maxDepth = items.reduce((maximum, item) => Math.max(maximum, Math.max(0, (item.targetRelative || item.targetPath).split(/[\\/]+/).filter(Boolean).length - 1)), 0)
  const extensions = new Map<string, number>()
  for (const item of items) {
    const match = /(?:^|[\\/])[^\\/]+(\.[^.\\/]+)$/.exec(item.sourcePath)
    const extension = match?.[1]?.toLocaleLowerCase() ?? "(无扩展名)"
    extensions.set(extension, (extensions.get(extension) ?? 0) + 1)
  }
  return {
    alreadyCount,
    delCount,
    waitCount,
    alreadyRatio: classifiedCount ? Math.round((alreadyCount / classifiedCount) * 100) : 0,
    delRatio: classifiedCount ? Math.round((delCount / classifiedCount) * 100) : 0,
    waitRatio: classifiedCount ? Math.round((waitCount / classifiedCount) * 100) : 0,
    fileCount: items.filter((item) => item.kind === "file").length,
    directoryCount: items.length ? directoryCount : 0,
    maxDepth,
    extensions: [...extensions.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 6).map(([extension, count]) => ({ extension, count })),
  }
}
