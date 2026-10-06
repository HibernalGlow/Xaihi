/**
 * Repacku 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `contract.ts` / `platform.ts`）是从 `noxide` 基线搬来的：`core.ts` 的
 * 893 条正文行与上游逐字节相同（实测 `diff` 只报第 1 行那条 import），差异全部写在它自己的
 * 文件头。这一侧只做四件事：把表单值绑成 `RepackuInput`、把内核的过程事件接到运行账本、
 * 把结局发给 `result_view`、把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里
 * 偷偷开第二条外部程序通路。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/repacku.json`）。
 *
 * 上游有一份 `dryRun` 的**默认值分歧**，这里不许"统一"它：
 * - `core.ts:193`（上游同一条）是 `input.dryRun ?? input.dry_run ?? false` ⇒ 内核默认**真写归档**；
 * - `node-definitions/repacku.json` 给 `dryRun` 字段声明的默认是 **true** ⇒ 界面默认**预演**。
 * 台账 **G8**（`docs/service-mapping.md`）说清了为什么两边都会生效：`bindInputs` 对声明了
 * `asBoolean` 的字段总产出布尔值，模型省略参数时给的是 `false`
 * （`packages/node-sdk/src/define-node.ts:144-145`），清单里的声明式 default 只有表单那一侧会填。
 * 所以上游那句 `isDangerous = dryRun === false || deleteAfter === true`
 * （`interaction.ts:88`）在这一侧必须**放宽成 `dryRun !== true`**，见下面 `dangerCheck`。
 * 两条默认各由 `tests/core.spec.ts` 钉一条，谁被"顺手对齐"都会红。
 *
 * DI 缝 → DSH 服务的对应（`docs/service-mapping.md`）：
 * - `pathInfo` / `listDir` / `readText` / `writeText` / `ensureDir` / `join` / `dirname` /
 *   `basename` / `extname` / `resolve` / `now`（`core.ts:53-67` 那 11 个）→ **不接 `ctx.fs`**，
 *   走移植版 `platform.ts` 的 `node:fs`（ADR-0003 决定 1）。
 * - `compressWholeFolder` / `compressFiles`（同一个接口里的另外 2 个）→ **`ctx.subprocess`**
 *   （Service Definition `dsh-subprocess`，Provider `dsh-subprocess-local`，
 *   `docs/subsystems/subprocess.md`）。7-Zip 与 PowerShell 都从这条缝出去，本包不 import
 *   `node:child_process`；可执行文件探测用 `resolveExecutable()`，批量执行用 `spawn()`。
 * - 危险动作（非预演，或成功后删源文件）→ `ctx.approval`：定义里是上游那份
 *   `danger.type: "pluginExport"`（`exportName: "is_dangerous"`），经 `defineNode` 的
 *   `dangerCheck` 变成 `ask`。**不发明 `--force` 一类的绕行**（台账 G6）。
 * - 运行账目与进度 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的账本），每次调用现取；
 *   定义里 `reportsProgress: true`，账本缺席时 `defineNode` 会 `console.warn` 并把进度降级成
 *   无操作，节点仍能脱离工作台单独装。
 * - 上游 `platform.ts:39-55` 的 `readClipboardText()`（`pbpaste` / `Get-Clipboard`）→
 *   **不搬**：它唯一的调用者是引导流与 `--clipboard` 那一格（上游 `cli.ts:465-467`），
 *   沿用台账 **G5**；真要接，走的还是 `ctx.subprocess`，不在这里自己 spawn。
 * - 取消：`SubprocessSpawnSpec` 是有 `signal` 的，但 `NodeCall` 不往下传 `exec.signal`
 *   （台账 **G3**），所以一次真压缩在这一侧没有中止入口，不伪造一个。
 *
 * @module xaihi-repacku
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runRepacku, type RepackuAction, type RepackuData, type RepackuInput, type RepackuOperation } from './core.ts'
import { createSubprocessRepackuRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-repacku'

export const inject = ['tools', 'subprocess']

/**
 * 下面这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.repacku]`
 * （`default_root` / `default_output_dir` / `types` / `delete_after` / `min_count` /
 * `gallery_marker`，见上游 `cli.ts:61-68` 那份 `RepackuDefaults`），再加上
 * `platform.ts:165,278` 那两条环境变量（`REPACKU_7Z_PATH` 一族与
 * `REPACKU_COMPRESSION_LEVEL`）。按
 * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路整块不搬：
 * 同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
 *
 * **上游有、这里没有的一格：`delete_after`**。定义里 `deleteAfter` 是布尔字段，
 * `bindInputs` 的 `asBoolean` 对它的产出恒为布尔（省略 ⇒ `false`），配置值永远读不回来；
 * 一个点不动的开关比没有开关更糟，所以这一格不声明成 `Config`，删源文件只有模型/表单
 * 显式给 `deleteAfter: true` 这一条路（并且必然走 `ask`）。
 *
 * `minCount` 的 2 与内核 `normalizeRepackuInput` 的兜底值同源（上游 `core.ts:194`），
 * `types` 的 `image` 与上游引导流 `interaction.ts:25` 的 initialValue 同源，
 * 名单只有一份，不在这里抄第二份。
 */
export interface Config {
  /** 上游 `[nodes.repacku] default_root`：没给任何路径时的兜底根目录。空串按"没配"处理。 */
  defaultRoot: Volatile<string>
  /** 上游 `[nodes.repacku] default_output_dir`：config JSON 的输出位置。空串时内核自己算。 */
  defaultOutputDir: Volatile<string>
  /** 上游 `[nodes.repacku] types`：`types` 字段留空时用的目标类型。 */
  types: Volatile<string>
  /** 上游 `[nodes.repacku] min_count`：`minCount` 字段没给时用的最少文件数。 */
  minCount: Volatile<number>
  /** 上游 `[nodes.repacku] gallery_marker`：与内核的 `DEFAULT_GALLERY_MARKER` 同值。 */
  galleryMarker: Volatile<string>
  /** 上游 `REPACKU_7Z_PATH`：7-Zip 可执行文件或装着它的目录。空串按"没配"处理。 */
  sevenZipPath: Volatile<string>
  /** 上游 `REPACKU_COMPRESSION_LEVEL`：`-mx=` 的取值，内核侧夹 0..9。 */
  compressionLevel: Volatile<number>
}

export const Config = Schema.object({
  defaultRoot: Schema.string().default('').volatile(),
  defaultOutputDir: Schema.string().default('').volatile(),
  types: Schema.string().default('image').volatile(),
  minCount: Schema.number().default(2).volatile(),
  galleryMarker: Schema.string().default('. 画集').volatile(),
  sevenZipPath: Schema.string().default('').volatile(),
  compressionLevel: Schema.number().default(7).volatile(),
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
 * **`paths` 与 `pathText` 两个槽一起给**，这不是冗余：定义里 `pathsText → paths` 绑的是
 * `delimited`，而 `transformValue` 的 `delimited` **只按逗号切**
 * （`packages/node-sdk/src/define-node.ts:138-139`），字段自己写的提示却是"每行一个路径"。
 * 上游那两条腿（`interaction.ts:65` 与 `cli.ts:549-553`）都是按 `[\r\n;,]+` 切的，内核
 * `normalizePaths`（`core.ts:768-774`）也自己会切 `pathText`。把原始整块文本一并递进去，
 * 逐行粘贴与逗号粘贴两种写法才都成立，而定义的词表一个字都不用改。
 *
 * `Config` 那一层只在**字符串/数字**这几格兜底（`trimOrOmit` 与 `asInteger` 省略时给
 * `undefined`）；布尔那格按文件头说的 G8，恒由 `bindInputs` 填成 `false`。
 *
 * @param args - 本次调用的原始参数（`inputs` 里没有整块路径文本，所以要它）。
 */
function inputFrom(action: RepackuAction, inputs: Record<string, unknown>, args: Record<string, unknown>, config: Config): RepackuInput {
  const boundPaths = Array.isArray(inputs.paths) ? inputs.paths.map((item) => String(item)) : []
  const defaultRoot = config.defaultRoot.get().trim()
  const minCount = typeof inputs.minCount === 'number' && Number.isFinite(inputs.minCount) ? inputs.minCount : config.minCount.get()
  return {
    action,
    paths: boundPaths.length > 0 || defaultRoot === '' ? boundPaths : [defaultRoot],
    pathText: typeof args.pathsText === 'string' ? args.pathsText : '',
    configPath: typeof inputs.configPath === 'string' ? inputs.configPath : '',
    outputPath: typeof inputs.outputPath === 'string' ? inputs.outputPath : config.defaultOutputDir.get(),
    types: typeof inputs.types === 'string' ? inputs.types : config.types.get(),
    deleteAfter: inputs.deleteAfter === true,
    dryRun: inputs.dryRun === true,
    minCount,
    galleryMarker: typeof inputs.galleryMarker === 'string' ? inputs.galleryMarker : config.galleryMarker.get(),
  }
}

/**
 * 上游 `is_dangerous`（`interaction.ts:88` 的 `dryRun === false || deleteAfter === true`）
 * 在这一侧的**放宽版**：只要不是显式预演，就要批准。
 *
 * 放宽的那一格是 `dryRun` 被省略：内核默认是真写归档（`core.ts:193`），而 `bindInputs`
 * 把省略的布尔折成 `false`（G8），按上游字面的 `=== false` 判会得到"没批准却写了盘"。
 * 与 `plugins/migratef/src/index.ts` 同一取舍：**多问可以解释，少问不行**。
 *
 * 这里不需要动作身份：上游这条判据本来就只看那两个布尔（它不像 migratef 那样按
 * `action ∈ {move,copy}` 收窄），所以台账 G-pluginexport-action-blind 在本包不咬人——
 * 代价是五条动作（含只读的 `analyze`）在没显式 `dryRun: true` 时都会被问一次。
 * 导出是为了让 `tests/definition.spec.ts` 量的是这一份真闸门，而不是测试里另抄一遍判据。
 */
export function dangerCheck (args: Record<string, unknown>): boolean {
  return args.dryRun !== true || args.deleteAfter === true
}

/**
 * 内核事件 → 运行账本。**单位**：repacku 内核的 `progress` 是百分数
 * （10 / 20 / 75 / 100 与 `operationProgress` 的 20..99 夹取，上游 `core.ts:846-848`），
 * 直接当 `done / total = 100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 计划行数是上游终端面 `cli.ts:526` 那个 `data.operations.slice(0, 80)`，不在这里另定一个数。
 */
const OPERATION_LINES = 80

/**
 * 结果视图：上游 `RepackuData`（`core.ts:116-131`）的 11 条计数逐条给，一条不加、一条不减；
 * `operations` 截到 80 条；`errors` 全量（内核自己已经按操作数收过）。
 * **不带 `folderTree`**：那是一棵递归树，进 `result_view` 等于把整棵树塞进一次工具输出，
 * 而它的可读形状是内核写到磁盘的那份 config JSON（`configPath` 给的就是它）。
 */
function viewOf(data: RepackuData | undefined) {
  return {
    configPath: data?.configPath ?? '',
    totalFolders: data?.totalFolders ?? 0,
    entireCount: data?.entireCount ?? 0,
    selectiveCount: data?.selectiveCount ?? 0,
    skipCount: data?.skipCount ?? 0,
    plannedCount: data?.plannedCount ?? 0,
    compressedCount: data?.compressedCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    totalOperations: data?.totalOperations ?? 0,
    galleryCount: data?.galleryCount ?? 0,
    operations: (data?.operations ?? []).slice(0, OPERATION_LINES),
    errors: data?.errors ?? [],
  }
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    dangerCheck,
    handlers: {
      async analyze({ inputs, args, run }) {
        return await runAction('analyze', inputs, args, config, run, ctx.subprocess)
      },
      async compress({ inputs, args, run }) {
        return await runAction('compress', inputs, args, config, run, ctx.subprocess)
      },
      async full({ inputs, args, run }) {
        return await runAction('full', inputs, args, config, run, ctx.subprocess)
      },
      // 动作 id 带连字符（上游清单里就是 `single-pack` / `gallery-pack`），所以处理器名也不能
      // 改成驼峰：`defineNode` 按 `handlers[action.id]` 取，取不到就在装载期抛。
      async 'single-pack'({ inputs, args, run }) {
        return await runAction('single-pack', inputs, args, config, run, ctx.subprocess)
      },
      async 'gallery-pack'({ inputs, args, run }) {
        return await runAction('gallery-pack', inputs, args, config, run, ctx.subprocess)
      },
    },
  })
}

/**
 * 一次动作：绑输入 → 建 runtime（两条 `compress*` 接 `ctx.subprocess`）→ 跑内核 →
 * 上报结果视图 → 拼工具输出。
 *
 * `result.success` 为假时**抛**，不把失败咽成一句成功输出（与 `rawfilter` / `migratef`
 * 同一处理由：面板显示了空结果比报错更难查）。
 */
async function runAction(
  action: RepackuAction,
  inputs: Record<string, unknown>,
  args: Record<string, unknown>,
  config: Config,
  run: OperationRun,
  subprocess: SubprocessRuntime,
): Promise<string> {
  const input = inputFrom(action, inputs, args, config)
  const runtime = createSubprocessRepackuRuntime(subprocess, process.cwd(), {
    sevenZipPath: config.sevenZipPath.get(),
    compressionLevel: config.compressionLevel.get(),
  })
  const result = await runRepacku(input, runtime, (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  if (!result.success) throw new Error(`repacku: ${result.message}`)
  return summarize(action, result.message, result.data)
}

/**
 * 工具输出：一句结论 + 上游终端面那块 Summary 的三行（`cli.ts:521-525`，标签逐字：
 * `config` / `folders` + `entire` + `selective` + `skip` / `operations` + `planned` +
 * `compressed` + `failed` + `skipped`）+ 最多 80 条操作行。
 */
function summarize(action: RepackuAction, message: string, data: RepackuData | undefined): string {
  const summary = [
    ...(data?.configPath ? [`config: ${data.configPath}`] : []),
    `folders: ${data?.totalFolders ?? 0}  entire: ${data?.entireCount ?? 0}  selective: ${data?.selectiveCount ?? 0}  skip: ${data?.skipCount ?? 0}`,
    `operations: ${data?.totalOperations ?? 0}  planned: ${data?.plannedCount ?? 0}  compressed: ${data?.compressedCount ?? 0}  failed: ${data?.failedCount ?? 0}  skipped: ${data?.skippedCount ?? 0}`,
  ]
  const gallery = (data?.galleryCount ?? 0) > 0 ? `gallery: ${data?.galleryCount}` : ''
  const lines = (data?.operations ?? []).slice(0, OPERATION_LINES).map(operationLine)
  const rest = (data?.operations.length ?? 0) > OPERATION_LINES ? `… ${String((data?.operations.length ?? 0) - OPERATION_LINES)} more operation(s)` : ''
  return [`${action} · ${message}`, ...summary, gallery, ...lines, rest].filter(Boolean).join('\n')
}

/**
 * 一行操作：上游非 TTY 那支 `cli.ts:586` 的拼法逐字
 * （`状态 模式[扩展名] 来源 -> 归档`），颜色与截断只在终端面做。
 */
function operationLine(operation: RepackuOperation): string {
  const extensions = operation.extensions.length ? ` [${operation.extensions.join(',')}]` : ''
  return `${operation.status} ${operation.mode}${extensions} ${operation.sourcePath} -> ${operation.targetPath}`
}
