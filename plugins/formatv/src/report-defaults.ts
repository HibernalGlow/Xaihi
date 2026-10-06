/**
 * formatv 的"报告路径 + 覆盖闸门"推导：从上游 `cli.ts:103-128`
 * （`resolveReportPath` + `applyFormatvDefaults`）逐字搬来的那一小段配置语义。
 *
 * 为什么单开一个文件而不是留在 `src/index.ts` 或 `src/cli.ts` 里：
 * 这段判据**两个面都要用**（宿主面从 `Config` 拿默认值，独立 bin 从上游那份
 * `DEFAULT_FORMATV_DEFAULTS` 拿），而 bin 不许 import `src/index.ts` —— 那会把
 * `@deepseek-ai/cordis` 与 SDK 拉进一个只跑 Node 的可执行文件里（ADR-0002）。
 * 抄两份就会漂，所以这里放唯一的一份，两个面各引它。
 *
 * `core.ts` 里那条 `input.reportPath || join(paths[0], "formatv-<name>-duplicates.json")`
 * （`core.ts:317`）是**内核自己的缺省**，不是这一层：这一层负责的是"配置给了模板就按模板、
 * 且不许覆盖时转预演"。两层各留各的，谁也不冒充谁。
 *
 * @module xaihi-formatv/report-defaults
 */

import { join } from 'node:path'
import { normalizeFormatvInput, type FormatvInput, type FormatvRuntime } from './core.ts'

/** 上游 `cli.ts:65-75` 的 `FormatvDefaults`。 */
export interface ReportDefaults {
  reportNameTemplate: string
  /** `undefined` 表示"没配目录"，此时落第一个输入路径（上游 `defaults.directory ?? paths[0]`）。 */
  directory?: string
  overwrite: boolean
}

/** 上游 `cli.ts:79-82`：`{prefix}` 是模板里的占位，默认模板与内核缺省同名。 */
export const DEFAULT_REPORT_DEFAULTS: ReportDefaults = {
  reportNameTemplate: 'formatv-{prefix}-duplicates.json',
  overwrite: true,
}

/** 上游 `cli.ts:103-108` 的 `resolveReportPath`，逐字。 */
export function resolveReportPath(defaults: ReportDefaults, prefixName: string, paths: string[]): string {
  const name = defaults.reportNameTemplate.replace('{prefix}', prefixName)
  const dir = defaults.directory ?? paths[0]
  if (!dir) return ''
  return join(dir, name)
}

/**
 * 上游 `cli.ts:110-128` 的 `applyFormatvDefaults`，三条判据逐字：只对 `check_duplicates`
 * 生效、已有 `reportPath` 就不接管、`overwrite` 为假且报告已存在时**把 dryRun 顶成 true
 * 并且不下发 reportPath**。
 *
 * 与上游的一处形状差异：上游是原地改 `input`（`input.dryRun = true`），这里返回新对象——
 * 宿主面的 `input` 是从表单值现搭的，改它没有副作用，但返回新对象让测试能直接比对。
 * `runtime` 只取 `pathInfo` 一颗，所以内存缝就能测这条闸门。
 */
export async function applyReportDefaults(
  input: FormatvInput,
  defaults: ReportDefaults,
  runtime: Pick<FormatvRuntime, 'pathInfo'>,
): Promise<FormatvInput> {
  if (input.action !== 'check_duplicates') return input
  const normalized = normalizeFormatvInput(input)
  if (normalized.reportPath) return input

  const resolved = resolveReportPath(defaults, normalized.prefixName, normalized.paths)
  if (!resolved) return input

  if (!defaults.overwrite) {
    const info = await runtime.pathInfo(resolved)
    if (info.exists) return { ...input, dryRun: true }
  }
  return { ...input, reportPath: resolved }
}
