import type { LinedupFilterResult } from "@xiranite/node-linedup/core"

/**
 * GUI 面的输入/展示投影（纯 TS，不依赖 React），不含任何过滤判定。
 *
 * 为什么这三个函数可以住在面侧、`filterLines` 不行：ADR-0074 §5 禁止 GUI 值导入节点 core，否则浏览器里
 * 就多了第二个执行宿主。本文件只做编码 ——「文本框 ↔ 行数组」的换行归一，以及把宿主
 * `POST /nodes/linedup/operations` 已经答出来的结果文档（`{ success, message, data }`，`data` 就是
 * `LinedupFilterResult`）拼回成 +/- 预览行。哪一行被移除、大小写怎么匹配、结果怎么排序，全部只由宿主
 * 那份 core（`packages/nodes/linedup/src/core.ts` 的 `filterLines`，经 QuickJS 求值）决定；这里一个判定
 * 都不参与，改错了也只改显示，改不了宿主的结论。同写法的前例：`src/nodes/encodeb/model.ts`。
 *
 * 真缺口（记录在案，不许在这里补第二份实现）：宿主给 linedup 只注册了一个入口
 * —— `crates/xiranite-scripted-nodes/src/registration.rs` 的 `JsNodeSpec::pure(..., "filterLines", ...)`，
 * `functions` 为空，而 `/operations` 族里唯一的执行路是 `crates/xiranite-api/src/lib.rs:152` 的
 * `POST /nodes/{id}/operations`。所以 core 里那两个导出在协议上根本答不出来：
 * `createDiffRows` 的「权威有序 diff 行」（本文件用宿主已给的 `filteredLines` 做了行序 join，只是替身）与
 * `explainRemovals` 的「这一行命中了哪个过滤词」（GUI 完全没有对应展示，故不做）。
 * 要拿到权威那份，得由宿主那条 lane 给 linedup 注册第二个入口、或把行序写进 `filterLines` 的返回文档。
 */

/**
 * 换行归一后的原始行，保留空行与重复行 —— 这是发给宿主的那份输入文档，
 * 与终端面 `packages/nodes/linedup/src/interaction.ts` 的 `splitWireLines()` 同一口径：
 * 面不许预先 trim/去重，那是把 `uniqueNonEmptyLines` 复刻成第二份。
 */
export function linedupWireLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
}

/**
 * 「源 / 过滤词」条数徽标与运行按钮禁用用的非空行数（展示用，不发给宿主）。
 * 宿主自己会 trim、去重、丢弃空行，所以这里只按「非空」计数，与迁移前的卡片读数一致。
 */
export function linedupCountedLines(text: string): string[] {
  return linedupWireLines(text).filter((line) => line.trim() !== "")
}

export type LinedupPreviewRow = { line: string; status: "kept" | "removed" }

/**
 * 「差异预览」的行表：按源文本的行序，把宿主返回的 `filteredLines` 落成 kept/removed 两态。
 *
 * kept/removed 是宿主说过的话，不是这里算出来的判定 —— 归属只看一个集合成员关系：行在宿主的
 * `filteredLines` 里就是保留，否则就是移除。
 *
 * 这里的 trim + 去重是为了与宿主入口自己的输入归一化（`uniqueNonEmptyLines`）对齐：宿主处理的是
 * 去重后的行集合，面若不去重就会显示宿主从未考虑过的重复行。漂移的代价只有预览的行数。
 */
export function linedupPreviewRows(sourceText: string, result: LinedupFilterResult | null): LinedupPreviewRow[] {
  if (!result) return []
  const kept = new Set(result.filteredLines.map((line) => line.trim()))
  const seen = new Set<string>()
  const rows: LinedupPreviewRow[] = []
  for (const rawLine of linedupWireLines(sourceText)) {
    const line = rawLine.trim()
    if (!line || seen.has(line)) continue
    seen.add(line)
    rows.push({ line, status: kept.has(line) ? "kept" : "removed" })
  }
  return rows
}
