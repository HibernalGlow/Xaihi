/**
 * cleanf 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts` / `contract.ts`）是从 `noxide` 基线逐字搬来的：
 * `core.ts` 剥掉注释与空行后与上游各 314 条有效行、只有 4 行不同（那 4 行是类型层让步，
 * 逐条写在它的文件头）。这一侧只做三件事：把表单值绑成 `CleanfInput`、把内核的过程事件
 * 接到运行账本、把计划发给 `result_view`。**不移除文件、不发明撤销账本**：
 * `os-native` 那一格的处置全在 `src/platform.ts` 的文件头（新缺口 G10）。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/cleanf.json`，落差写在那一块与下面的偏离清单）。
 *
 * 今天这一面对外读回来的形状是：
 * - `cleanf_clean` 且 `preview` 为真 ⇒ **真跑**：递归枚举 + 计划 + `previewFiles`，一个文件都不碰；
 * - `cleanf_clean` 且 `preview` 为假 ⇒ 在碰任何一个文件之前抛
 *   `Recycle-bin restore is unavailable; Cleanf refused to run without undo support.`
 *   （`ENOTSUP`，基线 `platform.ts:133` 的原话）；
 * - `cleanf_undo` ⇒ 内核自己那句 `Cleanf undo is unavailable in this runtime.`（`core.ts:322`）。
 * 三句都是上游写好的话，不是接线层编的拒绝文案。
 *
 * **`preview` 的默认值分歧**（与 `plugins/rawfilter` / `plugins/mvz` 同一条，不许"统一"）：
 * - 内核 `core.ts:289` 是 `if (input.preview)` ⇒ **省略即执行**（然后被上面那一刀拒掉）；
 * - `node-definitions/cleanf.json` 给 `preview` 字段声明的默认是 **true** ⇒ 界面默认预览。
 * 两份各钉一条测试（`tests/core.spec.ts` 与 `tests/definition.spec.ts`）。模型省略布尔时
 * `bindInputs` 交上来的是 `false`（`packages/node-sdk/src/define-node.ts:144-145`，缺口 G8），
 * 所以今天 `cleanf_clean` 少传 `preview` 就是走"被拒"那条路，不是走预览。
 *
 * DI 缝 → DSH 服务（`docs/service-mapping.md`）：
 * - `scanPath`（递归枚举）→ 移植版 `platform.ts` 的 `node:fs`，**不接 `ctx.fs`**：
 *   那条缝没有删除动词、且要求路径收成不透明 `FsTarget`（判据与逐调用表都在 `src/platform.ts`）。
 * - `removeTargets` / 撤销 → **今天没有缝**（G10）：`ctx.fs` 无删除动词，`ctx.shell` 是模型面的
 *   bash/PowerShell 执行缝，用它拼"移到回收站"等于自己发明一份跨平台 trash 实现。
 * - 危险动作（非预览的 `clean`）→ `ctx.approval`：`defineNode` 按 `danger` 产出 `ask`；
 *   批准之后仍然会被上面那一刀拒掉——**批准不等于能做**，这里不拿 ask 当能力。
 * - 运行账目 → `ctx.storage`（storage domain `xaihi_runs`）经 `OPERATIONS_SERVICE` 的账本，
 *   每次调用现取；没有 xaihi-core 时进度上报是无操作，本节点仍可单独装。
 *
 * @module xaihi-cleanf
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import {
  CLEANING_PRESETS,
  parseCleanfPaths,
  runCleanf,
  type CleanfAction,
  type CleanfData,
  type CleanfInput,
  type CleanfPresetId,
  type CleanfRuntime,
} from './core.ts'
import { createNodeCleanfRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-cleanf'

export const inject = ['tools']

/** 预览清单的行数是上游 `cli.ts:40` 那个 `PREVIEW_TARGET_LIMIT = 40`，不在这里另定一个数。 */
const PREVIEW_LINES = 40

export interface Config {
  /**
   * 下面这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.cleanf]`
   * （`presets` / `exclude` / `preview`，见上游 `cli.ts:50-60` 那份 `CleanfNodeConfig`）。
   * 按 `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路整块不搬：
   * 同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * `presets` 留空 = **不覆盖**，落回内核那五条 `enabled: true` 的默认预设
   * （`core.ts` 的 `getDefaultPresets()`）；名单只有一份，不在这里抄第二份。
   */
  presets: Volatile<string>
  exclude: Volatile<string>
  /** 预览模式，默认 true：**没被覆盖时只出计划，一个文件都不碰**。 */
  preview: Volatile<boolean>
}

export const Config = Schema.object({
  presets: Schema.string().default('').volatile(),
  exclude: Schema.string().default('').volatile(),
  preview: Schema.boolean().default(true).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * `paths` / `presets` 这两格在两个面上拿到的形状不一样：工具面（`defineNode` 把 path-list
 * 映射成 `array<string>`）给数组，文本域那一侧给换行分隔的字符串。
 * 清单声明的绑定是上游原样的 `delimited`（只切逗号），而字段自己的占位文案写的是
 * "每行一个"（`node-definitions/cleanf.json` 的 `placeholder`），默认值更是直接写成
 * `empty_folders\nbackup_files\n…`——逗号切法对那份串只会得出一条垃圾 id。
 * 所以这里用**内核自己的解析器**再过一遍：`parseCleanfPaths` 认换行与分号（`core.ts:188-191`），
 * 预设那格按同一判据拆。不在这里另写第二份拆法，也不改清单的绑定形状。
 */
function listValue (value: unknown): string[] {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return items.flatMap((item) => parseCleanfPaths(String(item ?? '')))
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由处理器身份给（一个动作一个工具），不吃 `inputs.action`：定义里 `action` 是
 * `isActionSelector`（而且上游那份把它标成"永不可见"，照抄不改），它的职责是决定哪个工具
 * 被调用，不是第二个开关。
 *
 * 路径一条都没给时是内核那句 `No valid paths provided.`（`core.ts:272`），
 * 接线层不提前拦——抢了内核的台词，界面上就看不到内核的真实判据。
 */
function inputFrom (action: CleanfAction, inputs: Record<string, unknown>, config: Config): CleanfInput {
  const presets = listValue(inputs.presets)
  const configuredPresets = config.presets.get().split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
  const chosen = presets.length ? presets : configuredPresets
  const exclude = typeof inputs.exclude === 'string' && inputs.exclude !== '' ? inputs.exclude : config.exclude.get()
  return {
    action,
    paths: listValue(inputs.paths),
    // 一条都没给时留空数组：内核因此落回 `getDefaultPresets()`（`core.ts:211`），
    // 名单仍然只有一份。
    ...(chosen.length ? { presets: chosen as CleanfPresetId[] } : {}),
    ...(exclude === '' ? {} : { exclude }),
    preview: typeof inputs.preview === 'boolean' ? inputs.preview : config.preview.get(),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：cleanf 内核的 `progress` 是百分数
 * （扫描阶段封顶 40、移除前 70、收尾 100，上游 `core.ts:280,290,298,300`），
 * 直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward (runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：上游 `CleanfData` 的七格一条不加一条不减（`core.ts:60-69`），
 * 预览清单截到上游那个 40（`cli.ts:40`）。
 */
function viewOf (data: CleanfData | undefined) {
  return {
    totalRemoved: data?.totalRemoved ?? 0,
    removedDetails: data?.removedDetails ?? {},
    previewFiles: (data?.previewFiles ?? []).slice(0, PREVIEW_LINES),
    skipped: data?.skipped ?? 0,
    restored: data?.restored,
    undoAvailable: data?.undoAvailable,
    undoBatchCount: data?.undoBatchCount,
    undoPersistent: data?.undoPersistent,
  }
}

export function apply (ctx: Context, config: Config): void {
  const runtime = createNodeCleanfRuntime()

  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async clean ({ inputs, run }) {
        return runOne('clean', inputs, config, runtime, run)
      },
      async undo ({ inputs, run }) {
        return runOne('undo', inputs, config, runtime, run)
      },
    },
  })
}

/**
 * 一次动作：跑内核、把结果视图发给账本、失败原样抛出。
 * 抛出去的那条路是有意为之：`clean` 的非预览调用会被 `ENOTSUP` 拒（G10），
 * 咽成一行成功文本就是伪造能力。
 */
async function runOne (
  action: CleanfAction,
  inputs: Record<string, unknown>,
  config: Config,
  runtime: CleanfRuntime,
  run: OperationRun,
): Promise<string> {
  const result = await runCleanf(inputFrom(action, inputs, config), runtime, (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  if (!result.success) throw new Error(`cleanf: ${result.message}`)
  return summarize(action, result.message, result.data)
}

/**
 * 工具输出：一句结论 + 上游 `writeCleanfSummary`（`cli.ts:433-469`）那几行——
 * 每个预设一条 `• <name>: N 个`、预览清单最多 40 行。
 *
 * **一处偏离要写明**：上游那一段还印 `📁/📄` 图标与 `统计: X 个文件, Y 个文件夹`，
 * 但它自己的 `parsePreviewTargets`（`cli.ts:477-479`）把**每一条**都标成 `"file"`，
 * 也就是"文件夹统计恒为 0"。`previewFiles` 只有路径、没有类型（内核 `core.ts:294`
 * 把 target 压成了 path），缝里拿不到真类型 ⇒ 这里不印那两行，也不照抄一个假统计。
 * 判据同 AGENTS.md 的"不许伪造它没给的数据"。
 */
function summarize (action: CleanfAction, message: string, data: CleanfData | undefined): string {
  const details = Object.entries(data?.removedDetails ?? {}).map(([key, count]) => {
    const name = PRESET_NAMES[key] ?? key
    return `• ${name}: ${String(count)} 个`
  })
  const files = (data?.previewFiles ?? []).slice(0, PREVIEW_LINES).map((path) => `  ${path}`)
  const rest = (data?.previewFiles.length ?? 0) > PREVIEW_LINES
    ? `… 还有 ${String((data?.previewFiles.length ?? 0) - PREVIEW_LINES)} 个项目`
    : ''
  const undoLine = action === 'undo' && data?.undoAvailable
    ? `还有 ${String(data.undoBatchCount ?? 0)} 个更早的批次可撤销${data.undoPersistent === true ? '（已持久化）' : ''}`
    : ''
  return [`${action} · ${message}`, ...details, ...files, rest, undoLine].filter(Boolean).join('\n')
}

/**
 * `removedDetails` 的键是预设 id，展示名取自内核的预设表（`core.ts` 的 `CLEANING_PRESETS`，
 * 那份 `name` 字段就是上游面板用的名字）。这里不抄第二份名单：直接从内核取。
 */
const PRESET_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(CLEANING_PRESETS).map(([id, preset]) => [id, preset.name]),
)
