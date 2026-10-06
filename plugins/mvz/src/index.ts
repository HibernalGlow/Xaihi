/**
 * mvz 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts` / `contract.ts`）是从 `noxide` 基线逐字搬来的：
 * `core.ts` 剥掉注释后与上游各 238 条有效行、只有 4 行不同（那 4 行是类型层让步，写在它的文件头）。
 * 这一侧只做四件事：把表单值绑成 `MvzInput`、把内核的过程事件接到运行账本、把预览与结果
 * 发给 `result_view`、把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里 spawn。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/mvz.json`，落差写在那一块与下面的偏离清单）。
 *
 * **`dryRun` 的默认值分歧**（与 `plugins/rawfilter` 同一条，不许"统一"）：
 * - 内核 `core.ts:112`（上游同行）是 `input.dryRun ? "7z" : await runtime.find7z()` ⇒
 *   **省略即执行**（真起 7-Zip）；
 * - `node-definitions/mvz.json` 给 `dryRun` 字段声明的默认是 **true** ⇒ 界面默认**预演**。
 * 两边各钉一条测试（`tests/core.spec.ts` 的"省略 dryRun 就真跑命令"与
 *   `tests/definition.spec.ts` 的"清单默认是 true"）。模型**省略**参数时 `bindInputs` 交上来的是
 *   `false`（`packages/node-sdk/src/define-node.ts:144-145`），所以工具面少传一个布尔就等于
 *   说了"不预演"——这一格先由 `danger` 变成 DSH 的 `ask` 拦着（缺口 G8 说的就是这条落差）。
 *
 * DI 缝 → DSH 服务（`docs/service-mapping.md`）：
 * - `find7z` / `runCommand` → **`ctx.subprocess`**（`inject` 里声明；实现见 `src/platform.ts`）。
 *   本包不自建 spawn，也不读 `$PATH`。
 * - `exists` / `ensureDir` → 移植版 `platform.ts` 的 `node:fs`（ADR-0003 决定 1）。
 * - 危险动作（非预演）→ `ctx.approval`：不在这里手写确认框，`defineNode` 按 `danger` 产出 `ask`
 *   （`approval` 缝在隔离宿主的 loader 行里实测存在）。
 * - 运行账目 → `ctx.storage`（storage domain `xaihi_runs`）经 `OPERATIONS_SERVICE` 的账本，
 *   每次调用现取；没有 xaihi-core 时进度上报是无操作，本节点仍可单独装。
 *
 * @module xaihi-mvz
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runMvz, type MvzAction, type MvzData, type MvzInput, type MvzRuntime } from './core.ts'
import { createNodeMvzRuntime, type MvzSubprocessSeam } from './platform.ts'

export const name = '@hibernalglow/xaihi-mvz'

/**
 * `subprocess` 在默认装配里（`docs/service-mapping.md` 落 operation stream 那节的 loader 行：
 * `subprocess` → `@deepseek-ai/dsh-subprocess-local`）。列进 `inject` 的效果是"这条缝不在时
 * 本节点不装载"，而不是装载后静默降级——降级那条得看得见，见 AGENTS.md 的降级铁律。
 */
export const inject = ['tools', 'subprocess']

/** 预览与结果行数是上游 `cli.ts:38` 那个 `PREVIEW_LIMIT = 50`，不在这里另定一个数。 */
const RESULT_LINES = 50

export interface Config {
  /**
   * 下面这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.mvz]`
   * （`output` / `near` / `auto_dir` / `flatten` / `separator` / `dry_run`，见上游
   * `cli.ts:40-47` 那份 `MvzNodeConfig`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`
   * 那条通路整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，
   * 读写走 settings 面。默认值取的是**清单**声明的那一份（`node-definitions/mvz.json`）。
   *
   * 布尔这几格在工具面上今天**读不到**（`bindInputs` 把省略的布尔折成 `false`，见文件头那条
   * `dryRun` 分歧），留在这里是给表单与命令那条路兜底，也别忘了它兜的是哪一半。
   */
  output: Volatile<string>
  near: Volatile<boolean>
  autoDir: Volatile<boolean>
  flatten: Volatile<boolean>
  separator: Volatile<string>
  /** 预演模式，默认 true：**没被覆盖时只出计划，一个 7-Zip 都不起**。 */
  dryRun: Volatile<boolean>
}

export const Config = Schema.object({
  output: Schema.string().default('').volatile(),
  near: Schema.boolean().default(false).volatile(),
  autoDir: Schema.boolean().default(true).volatile(),
  flatten: Schema.boolean().default(false).volatile(),
  separator: Schema.string().default('//').volatile(),
  dryRun: Schema.boolean().default(true).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由处理器身份给（一个动作一个工具），不吃 `inputs.action`：定义里 `action` 是
 * `isActionSelector`，它的职责是决定哪个工具被调用，不是第二个开关。
 *
 * 内核自己会判空：条目一条都没有时回 `No archive entries found.`（`core.ts:110`），
 * `rename` 没给 pattern 时回 `Rename pattern is required.`（`core.ts:115`）。
 * 这两句台词归内核，接线层不提前拦。
 */
function inputFrom(action: MvzAction, inputs: Record<string, unknown>, config: Config): MvzInput {
  const text = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback
  return {
    action,
    // 清单里 fileText 的绑定是 `identity`（上游那份就是 identity）：多行原串交给内核自己切。
    fileText: typeof inputs.fileText === 'string' ? inputs.fileText : '',
    output: text(inputs.output, config.output.get()),
    near: typeof inputs.near === 'boolean' ? inputs.near : config.near.get(),
    autoDir: typeof inputs.autoDir === 'boolean' ? inputs.autoDir : config.autoDir.get(),
    flatten: typeof inputs.flatten === 'boolean' ? inputs.flatten : config.flatten.get(),
    pattern: typeof inputs.pattern === 'string' ? inputs.pattern : '',
    replacement: typeof inputs.replacement === 'string' ? inputs.replacement : '',
    separator: text(inputs.separator, config.separator.get()),
    dryRun: typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get(),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：mvz 内核的 `progress` 是百分数（`core.ts` 的 `progress()`），
 * 直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 * message 可能是 `"extract 3/7|book.zip"` 这种带 `|` 的复合串（`core.ts:266`），原样转。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/** 结果视图：上游 `MvzData` 的四条计数 + results + preview，一条不加一条不减（`core.ts:65-73`）。 */
function viewOf(data: MvzData | undefined) {
  return {
    action: data?.action ?? '',
    totalFiles: data?.totalFiles ?? 0,
    totalArchives: data?.totalArchives ?? 0,
    successCount: data?.successCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    results: data?.results ?? [],
    preview: (data?.preview ?? []).slice(0, RESULT_LINES),
  }
}

export function apply(ctx: Context, config: Config): void {
  // 宿主半边只在 `subprocess` 在的时候装载（见 `inject`）。本包没声明那个依赖（理由见
  // `src/platform.ts` 的文件头），所以类型面按可缺处理：缺了就响亮拒绝，不假装跑得动。
  const subprocess = ctx.get('subprocess') as MvzSubprocessSeam | undefined
  if (subprocess === undefined) {
    throw new Error(`${name}: ctx.subprocess is not provided; mvz cannot run 7-Zip without that seam.`)
  }
  const runtime = createNodeMvzRuntime(subprocess, process.cwd())

  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async extract({ inputs, run }) {
        return runOne('extract', inputs, config, runtime, run)
      },
      async move({ inputs, run }) {
        return runOne('move', inputs, config, runtime, run)
      },
      async delete({ inputs, run }) {
        return runOne('delete', inputs, config, runtime, run)
      },
      async rename({ inputs, run }) {
        return runOne('rename', inputs, config, runtime, run)
      },
    },
  })
}

/** 一次动作：跑内核、把结果视图发给账本、失败原样抛出（把失败咽成成功输出会让面板显示空结果）。 */
async function runOne(
  action: MvzAction,
  inputs: Record<string, unknown>,
  config: Config,
  runtime: MvzRuntime,
  run: OperationRun,
): Promise<string> {
  const result = await runMvz(inputFrom(action, inputs, config), runtime, (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  if (!result.success) throw new Error(`mvz: ${result.message}`)
  return summarize(action, result.message, result.data)
}

/**
 * 工具输出：一句结论 + 上游 `cli.ts:257-261` 那三行汇总（标签逐字：action / archives+files /
 * success+failed）+ 最多 50 条预览命令 + 最多 50 条结果行（后两段的行式取自
 * 上游 `cli.ts:269` 与 `:282`，截断上限同一个 50）。
 */
function summarize(action: MvzAction, message: string, data: MvzData | undefined): string {
  const counts = [
    `action: ${data?.action ?? action}`,
    `archives: ${String(data?.totalArchives ?? 0)}  files: ${String(data?.totalFiles ?? 0)}`,
    `success: ${String(data?.successCount ?? 0)}  failed: ${String(data?.failedCount ?? 0)}`,
  ]
  const previews = (data?.preview ?? []).slice(0, RESULT_LINES)
    .map((item) => `  ${item.action} ${item.archive} -> ${item.command ?? ''}${item.output ? ` (-> ${item.output})` : ''}`)
  const results = (data?.results ?? []).slice(0, RESULT_LINES)
    .map((item) => `  ${item.success ? 'ok' : 'fail'} ${item.action} ${item.archive}${item.message ? `  ${item.message}` : ''}`)
  const rest = (data?.preview.length ?? 0) > RESULT_LINES ? `… ${String((data?.preview.length ?? 0) - RESULT_LINES)} more previews` : ''
  return [`${action} · ${message}`, ...counts, ...previews, ...results, rest].filter(Boolean).join('\n')
}
