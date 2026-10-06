// Marku 工作流编辑器的面侧记账：草稿 id 的铸造与 step config 的快照。
//
// 这两件事原先值导入 `@xiranite/node-marku/core` 的 `createMarkuWorkflowId` / `clonePlainConfig`，
// 那等于在 WebView 里放了第二份节点执行宿主（ADR-0074 §5；尺：
// `bun scripts/audit-face-execution-path.ts` 的 `guiCoreValueImports`）。把它们留在面侧不算复制业务
// 逻辑，因为它们不携带任何 Markdown 判定：
// - id 只要求「本次编辑会话里唯一且非空」。宿主 `runWorkflowAction()` 里那份 `normalizeMarkuWorkflow()`
//   原样保留非空 id，只在缺 id 时才自己铸，所以面侧铸的 id 不会被宿主改写；前缀词表 "wf"/"step" 抄的
//   是宿主默认值，只为存进 config 的库读起来与宿主产出一致，不构成行为依赖。
// - config 快照解决的是 React 状态共享引用：库里的条目不许与卡上的草稿指向同一个对象
//   （`workflow-state.test.ts` 的「snapshots the value instead of sharing the reference」钉着这条）。
//   形状按 JSON 走，因为草稿要经 `/operations` 请求体与 config 服务序列化，非 JSON 值本来就出不去。
// 权威归一化只有 core 那一份：面侧不得再出现 `normalizeMarkuWorkflow*` 的复制品（缺口报告见
// `workflow-state.ts` 的 `upsertWorkflowInLibrary`）。

/** 与宿主 `createMarkuWorkflowId()` 的默认前缀一致，只影响可读性。 */
const WORKFLOW_ID_PREFIX = { step: "step", workflow: "wf" } as const

export type MarkuWorkflowIdKind = keyof typeof WORKFLOW_ID_PREFIX

/** Mints an id for a draft workflow or one of its steps. */
export function createWorkflowDraftId(kind: MarkuWorkflowIdKind = "workflow"): string {
  return `${WORKFLOW_ID_PREFIX[kind]}-${randomIdFragment()}`
}

/** Deep-copies a step configuration so the library entry never aliases the editor draft. */
export function snapshotWorkflowConfig(config: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(config)) as Record<string, unknown>
  } catch {
    // 不可序列化（循环引用等）时丢掉内容，也不共享引用。
    return {}
  }
}

function randomIdFragment(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid.slice(0, 13)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
