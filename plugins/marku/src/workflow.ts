/**
 * Marku 的工作流域，从 `<Xiranite>` tag `noxide` 基线
 * `.scratch/xiranite-noxide/packages/nodes/marku/src/workflow.ts`（**180 行**）逐字搬来，
 * 连文件头那两句英文注释（"must stay free of React … (ADR 0056)"）一起留着——
 * `core.ts` 第 4/5 行与第 556 行（`export * from "./workflow.js"`）都按原样指它。
 *
 * 这一层第三方包一个都不要：纯类型 + 纯函数，所以它是本包里**唯一**现在就能跑通的
 * 内核邻居模块。
 *
 * 语义钉子：
 * - `normalizeMarkuWorkflow` 只认"对象 + steps 是数组"，其余一律 `null`；坏条目**丢弃**，
 *   未知 module id **保留**（留到运行时判失败，绝不静默跳过——注释原话）。
 * - step id 缺失时用 `uniqueId(…, "step")` 补，补出来的 id 保证在本次运行里不撞。
 * - `validateMarkuWorkflowForRun` 的两句话是读回点：空 steps 报
 *   `Workflow has no steps; add at least one module step before running.`，
 *   未知模块报 `Workflow step <n> references unknown module: <id>`（`core.test.ts` 钉过）。
 * - `evaluateMarkuWorkflowSource` **逐步喂下一步的输出**，撞到抛出的错就停下并把
 *   `Step <n> (<module>) failed: <msg>` 记在 source 上，前面的步骤结果全部保留。
 * - `clonePlainConfig` 用 JSON 往返做深拷贝：函数与 `undefined` 因此被丢掉（快照语义）。
 * - workflow 动作在宿主面上**不出货**：`node-definitions/marku.json` 的 `actions` 只有 4 条，
 *   `package.json#xaihi.node` 照抄，所以 `marku_workflow` 这个工具不存在，只有 `marku workflow`
 *   走得到（`src/cli.ts` 的拒绝与理由在那里）。
 *
 * @module xaihi-marku/workflow
 */
// Pure Marku workflow domain: types, normalization, validation, and linear
// evaluation. This module must stay free of React, React Flow, host, and
// filesystem imports so GUI and CLI share the exact same contract (ADR 0056).
import type { MarkuModuleId } from "./core.js"

export interface MarkuWorkflowStep {
  id: string
  /** A Marku module id. Stale saved data may carry an unknown string; it is a validation failure at run time, never a silent skip. */
  module: MarkuModuleId | string
  /** Deep configuration snapshot so saved workflows stay reproducible after module defaults change. */
  config: Record<string, unknown>
}

export interface MarkuWorkflow {
  id: string
  name: string
  steps: MarkuWorkflowStep[]
}

export interface MarkuWorkflowLibrary {
  schemaVersion: 1
  workflows: MarkuWorkflow[]
}

export interface MarkuWorkflowStepResult {
  stepId: string
  module: MarkuModuleId | string
  inputText: string
  outputText: string
  changed: boolean
  error?: string
}

export interface MarkuWorkflowSourceResult {
  sourceId: string
  sourceLabel: string
  originalText: string
  outputText: string
  steps: MarkuWorkflowStepResult[]
  error?: string
}

/** One editor input or one file fed into a workflow run. Sources never feed one another. */
export interface MarkuWorkflowSourceInput {
  sourceId: string
  sourceLabel: string
  text: string
}

export type MarkuWorkflowTransform = (module: MarkuModuleId | string, text: string, config: Record<string, unknown>) => string

export const MARKU_WORKFLOW_SCHEMA_VERSION = 1

export function createMarkuWorkflowId(prefix = "wf"): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}-${uuid.slice(0, 13)}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Normalizes one saved workflow. Deep-clones plain JSON-compatible step
 * configuration, trims the name, and guarantees unique stable ids. Malformed
 * steps are discarded; unknown module ids are kept for run-time validation.
 * Returns null when the value is not a workflow-shaped object at all.
 */
export function normalizeMarkuWorkflow(value: unknown): MarkuWorkflow | null {
  if (!isRecord(value)) return null
  const rawSteps = Array.isArray(value.steps) ? value.steps : null
  if (!rawSteps) return null

  const usedStepIds = new Set<string>()
  const steps: MarkuWorkflowStep[] = []
  for (const raw of rawSteps) {
    if (!isRecord(raw) || typeof raw.module !== "string" || !raw.module.trim()) continue
    const id = uniqueId(typeof raw.id === "string" ? raw.id.trim() : "", usedStepIds, "step")
    usedStepIds.add(id)
    steps.push({ id, module: raw.module.trim(), config: clonePlainConfig(raw.config) })
  }

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : createMarkuWorkflowId(),
    name: typeof value.name === "string" ? value.name.trim() : "",
    steps,
  }
}

/** Normalizes a saved library, discarding malformed workflows and ignoring unknown future fields. */
export function normalizeMarkuWorkflowLibrary(value: unknown): MarkuWorkflowLibrary {
  const empty: MarkuWorkflowLibrary = { schemaVersion: MARKU_WORKFLOW_SCHEMA_VERSION, workflows: [] }
  if (!isRecord(value) || !Array.isArray(value.workflows)) return empty

  const usedIds = new Set<string>()
  const workflows: MarkuWorkflow[] = []
  for (const raw of value.workflows) {
    const workflow = normalizeMarkuWorkflow(raw)
    if (!workflow) continue
    const id = uniqueId(workflow.id, usedIds, "wf")
    usedIds.add(id)
    workflows.push({ ...workflow, id })
  }
  return { schemaVersion: MARKU_WORKFLOW_SCHEMA_VERSION, workflows }
}

/**
 * Run-time validation: an empty workflow or an unknown module id rejects the
 * whole run with an explicit message. Returns null when the workflow can run.
 */
export function validateMarkuWorkflowForRun(
  workflow: MarkuWorkflow,
  isKnownModule: (module: string) => boolean,
): string | null {
  if (!workflow.steps.length) return "Workflow has no steps; add at least one module step before running."
  for (let index = 0; index < workflow.steps.length; index += 1) {
    const step = workflow.steps[index]
    if (!isKnownModule(step.module)) return `Workflow step ${index + 1} references unknown module: ${step.module}`
  }
  return null
}

/**
 * Applies every step in declaration order to one source, feeding each step the
 * preceding step's output. Stops at the first thrown error and retains prior
 * step results so the failure point and preceding output stay inspectable.
 * Never touches the filesystem; write-back is a separate phase in the core.
 */
export function evaluateMarkuWorkflowSource(
  workflow: MarkuWorkflow,
  source: MarkuWorkflowSourceInput,
  transform: MarkuWorkflowTransform,
): MarkuWorkflowSourceResult {
  const steps: MarkuWorkflowStepResult[] = []
  let current = source.text
  for (let index = 0; index < workflow.steps.length; index += 1) {
    const step = workflow.steps[index]
    try {
      const output = transform(step.module, current, step.config)
      steps.push({ stepId: step.id, module: step.module, inputText: current, outputText: output, changed: output !== current })
      current = output
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      steps.push({ stepId: step.id, module: step.module, inputText: current, outputText: current, changed: false, error: message })
      return {
        sourceId: source.sourceId,
        sourceLabel: source.sourceLabel,
        originalText: source.text,
        outputText: current,
        steps,
        error: `Step ${index + 1} (${step.module}) failed: ${message}`,
      }
    }
  }
  return {
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    originalText: source.text,
    outputText: current,
    steps,
  }
}

/** Deep-clones plain JSON-compatible configuration; functions and undefined values are dropped. */
export function clonePlainConfig(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function uniqueId(candidate: string, used: Set<string>, prefix: string): string {
  if (candidate && !used.has(candidate)) return candidate
  let next = createMarkuWorkflowId(prefix)
  while (used.has(next)) next = createMarkuWorkflowId(prefix)
  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
