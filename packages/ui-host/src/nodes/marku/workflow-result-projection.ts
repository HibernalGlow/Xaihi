import type { MarkuWorkflow, MarkuWorkflowRunData, MarkuWorkflowSourceResult, MarkuWorkflowStepResult } from "@xiranite/node-marku/core"
import { parseDiff } from "react-diff-view"
import type { ChangeData } from "react-diff-view"

/**
 * 宿主每步结果**应当**带、但 `MarkuWorkflowStepResult` 还没有的字段：这一步的 unified patch 文本。
 *
 * 原来这里值导入 core 的 `createUnifiedDiff(result.inputText, result.outputText, "step.md")`，
 * 那是把第二份 diff 引擎放进 WebView（ADR-0074 §5；尺：`audit-face-execution-path` 的
 * `guiCoreValueImports`）。面侧不许自己算，也不许把 core 的算法搬过来，所以改成读宿主文档。
 * 补法只有一句：`packages/nodes/marku/src/workflow.ts:25-32` 给 `MarkuWorkflowStepResult` 加
 * `diff: string`，在 `evaluateMarkuWorkflowSource()`（同文件 `:137`）里用现成的
 * `createUnifiedDiff(inputText, outputText, "step.md")` 填它 —— 与 normal 模式已经返回的
 * `MarkuData.diffText`、`MarkuFileDiff.diff` 同一个形状（从 `--- ` 起头）。那两处是宿主 bundle
 * 的输入清单成员，不属于本次改动范围，留作缺口。
 * 字段落地前这里读到 `undefined`，变更节点的 diff 预览框是空的（其余徽标、错误、
 * 「无文本变化」不受影响）。
 */
export type MarkuWorkflowStepResultWithPatch = MarkuWorkflowStepResult & { diff?: string }

/** 与 `MarkuWorkflowRunData` 同形，只把每步换成可携带 patch 的版本；`MarkuWorkflowRunData` 可直接传入。 */
export type MarkuWorkflowRunDataWithPatches = Omit<MarkuWorkflowRunData, "sources"> & {
  sources: Array<Omit<MarkuWorkflowSourceResult, "steps"> & { steps: MarkuWorkflowStepResultWithPatch[] }>
}

export interface WorkflowNodeDiffLine {
  content: string
  newLineNumber?: number
  oldLineNumber?: number
  type: "delete" | "insert" | "normal"
}

export interface WorkflowNodeResultProjection {
  changedSourceCount: number
  diffLines: WorkflowNodeDiffLine[]
  errorSourceCount: number
  result?: MarkuWorkflowStepResult
  sourceCount: number
  sourceId: string
  sourceLabel: string
  stepId: string
}

/** Maps one completed run back onto the current ordered graph definition. */
export function projectWorkflowRunToNodes(
  workflow: MarkuWorkflow,
  run: MarkuWorkflowRunDataWithPatches | null | undefined,
  selectedSourceId: string,
): Map<string, WorkflowNodeResultProjection> {
  const projections = new Map<string, WorkflowNodeResultProjection>()
  if (!run || run.workflowId !== workflow.id || !run.sources.length) return projections

  const selectedSource = run.sources.find((source) => source.sourceId === selectedSourceId) ?? run.sources[0]!
  const resultsBySource = run.sources.map((source) => new Map(source.steps.map((step) => [step.stepId, step])))
  const selectedResults = new Map(selectedSource.steps.map((step) => [step.stepId, step]))

  for (const step of workflow.steps) {
    const result = selectedResults.get(step.id)
    projections.set(step.id, {
      changedSourceCount: resultsBySource.filter((results) => results.get(step.id)?.changed).length,
      diffLines: result?.changed && !result.error && result.diff ? parseStepPatch(result.diff) : [],
      errorSourceCount: resultsBySource.filter((results) => Boolean(results.get(step.id)?.error)).length,
      result,
      sourceCount: run.sources.length,
      sourceId: selectedSource.sourceId,
      sourceLabel: selectedSource.sourceLabel,
      stepId: step.id,
    })
  }
  return projections
}

/**
 * Pure rendering projection of the patch text the host returned: unified-diff lines to the
 * row shape `CompactDiff` paints. No diffing happens here — line alignment and the
 * context window are decided by the host's single `createUnifiedDiff`.
 */
function parseStepPatch(patch: string): WorkflowNodeDiffLine[] {
  return parseDiff(patch, { nearbySequences: "zip" }).flatMap((file) => file.hunks.flatMap((hunk) => hunk.changes)).map(toDiffLine)
}

function toDiffLine(change: ChangeData): WorkflowNodeDiffLine {
  if (change.type === "delete") {
    return { content: change.content, oldLineNumber: change.lineNumber, type: change.type }
  }
  if (change.type === "insert") {
    return { content: change.content, newLineNumber: change.lineNumber, type: change.type }
  }
  return {
    content: change.content,
    newLineNumber: change.newLineNumber,
    oldLineNumber: change.oldLineNumber,
    type: change.type,
  }
}
