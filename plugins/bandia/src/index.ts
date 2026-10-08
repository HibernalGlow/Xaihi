/**
 * bandia 的宿主半边：把逐字搬来的内核（`core.ts`，552 行）接成一个 Xaihi 节点。
 *
 * 这一侧只做四件事：把表单值绑成 `BandiaInput`、把内核的过程事件接到运行账本、
 * 把结局发给 `result_view`、把危险动作交给 DSH 的批准缝。内核逻辑不在这里重写，
 * 这里也不开第二套文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/bandia.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 *
 * | `BandiaRuntime` 的 13 个方法 | 落点 | 服务 |
 * |---|---|---|
 * | `runCommand`、`findBandizip`、`openEverything` | `src/exec.ts` | `ctx.subprocess`（`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬基础件」）|
 * | `exists`、`stat`、`ensureDir`、`removePath`、`writeText`、`tempDir`、`dirname`、`basename`、`extname`、`join`、`resolve` | `src/platform.ts` | `node:fs`（ADR-0003 决定 1；`ctx.fs` 没有 `mkdir`/`rm`/`rename`，也没有 mtime/ctime ⇒ 缺口 G-fs-no-mutation-verbs，逐条证据在 `src/platform.ts`）|
 * | 危险动作 → `ask` | 定义里 `danger.type: "pluginExport"` + 这里的 `dangerCheck` | `ctx.approval`（经 `tools/pre-execute`；不自己实现确认框）|
 * | 进度 / 预览 / 结果视图 | `run.progress` / `run.preview` / `run.resultView` | `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；DSH 的 `tools` 只有单次输出缝）|
 * | Bandizip 位置的用户覆盖 | `Config.bandizipPath` | `ctx.settings` 面（ADR-0013；上游那条 `BANDIZIP_PATH` 环境变量不读）|
 *
 * 两条"独立 bin 够不到"的拒绝在 `src/cli.ts`，点名 `ctx.subprocess` 与批准缝（G1/G6 那一族）。
 *
 * `dangerCheck` 与上游 `is_dangerous` 之间有一格**判定面**落差，写在下面那条函数上；
 * 那条落差已由同批的 `plugins/migratef/src/index.ts` 记为 **G-pluginexport-action-blind**，
 * 这里沿用同一个名字，不另立台账条目。
 *
 * @module xaihi-bandia
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import type { BandiaAction, BandiaArchiveFormat, BandiaData, BandiaExtractMode, BandiaInput, BandiaOverwriteMode, BandiaRuntime } from './core.ts'
import { runBandia } from './core.ts'
import { createBandiaExecRuntime, type SubprocessSeam } from './exec.ts'
import { createBandiaFsRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-bandia'

/**
 * `subprocess` 是**硬依赖**：本节点的核心动作就是调 Bandizip，没有那条缝一个归档都动不了。
 * cordis 的 `inject` 让插件只在服务齐时装载，缺这条的症状在装载期就读得回来，不是运行期炸。
 */
export const inject = ['tools', 'subprocess']

/** 上游终端面打印结果时的行数上限（`<noxide>/packages/nodes/bandia/src/cli.ts:41`）。 */
const PREVIEW_LIMIT = 20

export interface Config {
  /**
   * Bandizip 可执行文件或它所在目录。上游读 `process.env.BANDIZIP_PATH`
   * （`platform.ts:65`）；按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
   * 同一些值在 Xaihi 只有一个出口 ⇒ 这里声明成 `Config`，值由 DSH 的 patch 层给。
   * 空串 = **不覆盖**，与上游"没设那个环境变量"同形：接着按 PATH 与安装根去找。
   */
  bandizipPath: Volatile<string>
}

export const Config = Schema.object({
  bandizipPath: Schema.string().default('').volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * 上游 `interaction.ts` 的 `isDangerous`：
 * `dryRun === false && (deleteAfter || deleteSource || action ∈ {extract, compress, repack})`。
 *
 * 这里只能兑现它的前半：动作身份进不到 `dangerCheck`——`dangerFor` 的 `pluginExport`
 * 分支只调 `dangerCheck(args)`（`define-node.ts:195-199`），而参数表**不含**动作选择器
 * （`define-node.ts:116-121` 把它 `continue` 掉了）。于是"三条 mutating 动作危险、
 * `export_efu` 不算"这一区分在这一格里做不出来（G-pluginexport-action-blind）。
 * 取保守的那一侧：**没被声明成预演就得批准**（`dryRun !== true` ⇒ 危险）。
 * 这个方向只会多问一次、不会少问 ⇒ 与"`export_efu` 也真的写文件"（`core.ts:392`）相容。
 * 等 `dangerCheck` 拿到动作身份，这条应当收窄回上游那份谓词。
 *
 * `dryRun` 缺席与 `dryRun: false` 在这里同判：清单默认是 `true`，而缺口 G8 记着
 * "模型省略布尔时声明式默认不生效"，所以省略**不能**当成"使用者选了预演"。
 */
function dangerCheck(args: Record<string, unknown>): boolean {
  return args.dryRun !== true
}

/**
 * 表单值 → 内核入参。
 *
 * `action` 由**处理器身份**给（一个动作一个工具），不吃 `inputs.action`：定义里 `action`
 * 是 `isActionSelector`，它的职责是决定哪个工具被调用。
 *
 * 可选属性一律"没给就没有这个键"（`exactOptionalPropertyTypes` 也要求这么写），
 * 并且**以原始 `args` 有没有这个键为准**：`bindInputs` 会把省略的布尔折成 `false`（G8），
 * 照它下发就等于替内核抹掉它自己的 `?? true` 默认（`deleteAfter`、`deleteSource`
 * 两条都是 `?? true`，`core.ts:251`、`:351`）。省略 ⇒ 不下发 ⇒ 落回内核默认。
 */
function inputFrom(action: BandiaAction, args: Record<string, unknown>, inputs: Record<string, unknown>): BandiaInput {
  const input: BandiaInput = { action }
  const paths = pathsOf(args, inputs)
  if (paths.length > 0) input.paths = paths
  if (has('mappingText', args)) input.mappingText = String(inputs.mappingText ?? '')
  if (has('outputDir', args)) input.outputDir = text(inputs.outputDir)
  if (has('outputPrefix', args)) input.outputPrefix = text(inputs.outputPrefix)
  // 三条 select 只在下发值得到清单里那几个值时才带上那个键：`exactOptionalPropertyTypes`
  // 不吃"键在、值为 undefined"，而"值不认识"与"没给"在内核里走的确实是同一条 `??` 分支。
  const extractMode = has('extractMode', args) ? asEnum<BandiaExtractMode>(inputs.extractMode, ['auto', 'normal']) : undefined
  if (extractMode !== undefined) input.extractMode = extractMode
  const overwriteMode = has('overwriteMode', args) ? asEnum<BandiaOverwriteMode>(inputs.overwriteMode, ['overwrite', 'skip', 'rename']) : undefined
  if (overwriteMode !== undefined) input.overwriteMode = overwriteMode
  const compressFormat = has('compressFormat', args) ? asEnum<BandiaArchiveFormat>(inputs.compressFormat, ['zip', '7z']) : undefined
  if (compressFormat !== undefined) input.compressFormat = compressFormat
  if (has('parallel', args)) input.parallel = inputs.parallel === true
  if (has('workers', args)) {
    const workers = Number(inputs.workers)
    if (Number.isFinite(workers)) input.workers = workers
  }
  if (has('deleteAfter', args)) input.deleteAfter = inputs.deleteAfter === true
  if (has('deleteSource', args)) input.deleteSource = inputs.deleteSource === true
  if (has('efuOutputPath', args)) input.efuOutputPath = text(inputs.efuOutputPath)
  if (has('openInEverything', args)) input.openInEverything = inputs.openInEverything === true
  if (has('dryRun', args)) input.dryRun = inputs.dryRun === true
  return input
}

/** 原始参数里有没有这个键：面板或命令真填过，才算"使用者说过"。 */
function has(field: string, args: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(args, field)
}

/**
 * `paths` 在两个面上形状不同：工具面把 `path-list` 映射成 `array<string>`
 * （`define-node.ts:92-94`），面板那一边给的是换行分隔的文本。清单里上游声明的绑定是
 * `paths → delimited`，而 `transformValue(..., 'delimited')` **只切逗号**（`define-node.ts:136-139`）：
 * 多行粘贴会被粘成一项，一条合法的多根输入就变成一条不存在的路径。
 * 与 `plugins/crashu/src/index.ts:90-107` 同一处理由，落在这里而不改清单。
 *
 * 兜底的分隔符取内核自己那份（`core.ts:101` 的 `\r?\n|[;]`）；之后内核还会按归档扩展名
 * 过滤（`core.ts:410-416`），所以这里不做任何"像不像归档"的判断。
 */
function pathsOf(args: Record<string, unknown>, inputs: Record<string, unknown>): string[] {
  const raw = args.paths
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  const bound = inputs.paths
  if (Array.isArray(bound)) return bound.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  return String(bound ?? '').split(/\r?\n|[;]/).map((item) => item.trim()).filter((item) => item !== '')
}

/** `trimOrOmit` 之后可能是 `undefined`；内核把"空串"与"没有这个键"读成两件事，所以空串就留空串。 */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** select 字段读回来的字符串只认清单里声明过的那几个值；别的一律当"没给"，落回内核分支。 */
function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(String(value ?? '')) ? (value as T) : undefined
}

/**
 * 内核事件 → 运行账本。**单位**：bandia 内核的 `progress` 是百分数
 * （`progress()` 折 0..100，`core.ts:454-456`），直接当 `done / total=100` 用，
 * 不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 *
 * `emit()` 把当前文件名拼在消息尾部（`core.ts:451` 的 `${message}|${currentFile}`），
 * 这里原样进 `preview`，不拆——拆了就得再决定一次哪个是消息、哪个是文件。
 */
function forward(event: { type: string; progress?: number | undefined; message: string }, run: OperationRun): void {
  if (event.type === 'progress') {
    run.progress({ done: Math.round(event.progress ?? 0), total: 100 })
  }
  if (event.message !== '') run.preview({ message: event.message })
}

/**
 * 完整的 `BandiaRuntime`：文件那一半（`src/platform.ts`）+ 外部程序那一半（`src/exec.ts`）。
 *
 * `removePath` 在这里包了一层，只为把拒绝送进账本：内核在解压那条路上**咽掉**删除失败
 * （`core.ts:252-257`，注释原话 "deletion is a follow-up cleanup failure in the original tool
 * too"），所以回收站那条拒绝（G-no-os-trash）若只走异常就会静默消失。同一句原文补进
 * `preview`，退化状态在界面上读得回来——ADR-0011 决定 4 那条降级铁律要的就是这个。
 */
function createRuntime(subprocess: SubprocessSeam, cwd: string, bandizipPath: () => string, run: OperationRun): BandiaRuntime {
  const fs = createBandiaFsRuntime()
  const exec = createBandiaExecRuntime(subprocess, {
    cwd,
    bandizipPath,
    isFile: async (path) => {
      const info = await fs.stat(path)
      return info?.exists === true && info.isDirectory === false
    },
    join: fs.join,
    resolve: fs.resolve,
  })
  return {
    findBandizip: exec.findBandizip,
    runCommand: exec.runCommand,
    openEverything: exec.openEverything,
    exists: fs.exists,
    stat: fs.stat,
    ensureDir: fs.ensureDir,
    writeText: fs.writeText,
    tempDir: fs.tempDir,
    dirname: fs.dirname,
    basename: fs.basename,
    extname: fs.extname,
    join: fs.join,
    resolve: fs.resolve,
    async removePath (path, options) {
      try {
        await fs.removePath(path, options)
      } catch (error) {
        run.preview({ message: `removePath ${path}: ${error instanceof Error ? error.message : String(error)}` })
        throw error
      }
    },
  }
}

/** 结果视图：计数 + 每条命令与失败原因 + EFU 落点，全是内核算好的字段，这里不重算。 */
function viewOf(data: BandiaData | undefined) {
  return {
    action: data?.action ?? '',
    extractedCount: data?.extractedCount ?? 0,
    compressedCount: data?.compressedCount ?? 0,
    exportedCount: data?.exportedCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    totalCount: data?.totalCount ?? 0,
    efuPath: data?.efuPath ?? '',
    pathMappingCount: data?.pathMappings.length ?? 0,
    results: (data?.results ?? []).slice(0, PREVIEW_LIMIT).map((item) => ({
      kind: item.kind,
      sourcePath: item.sourcePath,
      outputPath: item.outputPath ?? '',
      archivePath: item.archivePath ?? '',
      success: item.success,
      skipped: item.skipped === true,
      durationMs: item.durationMs,
      command: item.command ?? '',
      error: item.error ?? '',
    })),
    truncated: (data?.results.length ?? 0) > PREVIEW_LIMIT,
  }
}

/** 工具输出：一句结论 + 计数行 + 最多 20 条 `状态 源 -> 目的地`（上游终端面打印的就是这几列）。 */
function summarize(message: string, data: BandiaData | undefined): string {
  const counts = `extracted ${String(data?.extractedCount ?? 0)} · compressed ${String(data?.compressedCount ?? 0)} · exported ${String(data?.exportedCount ?? 0)} · failed ${String(data?.failedCount ?? 0)} / ${String(data?.totalCount ?? 0)}`
  const lines = (data?.results ?? []).slice(0, PREVIEW_LIMIT).map((item) => {
    const status = item.success ? (item.skipped === true ? 'planned' : 'ok') : 'fail'
    const target = item.outputPath ?? item.archivePath ?? ''
    const tail = item.error === undefined ? '' : `: ${item.error}`
    return `${status}\t${item.sourcePath}${target !== '' ? ` -> ${target}` : ''}${tail}`
  })
  const rest = (data?.results.length ?? 0) > PREVIEW_LIMIT ? `… ${String((data?.results.length ?? 0) - PREVIEW_LIMIT)} more` : ''
  return [message, counts, ...lines, rest].filter((line) => line !== '').join('\n')
}

/** 四条动作共用的一条腿：合成缝、跑内核、接账本、发结果视图、失败就抛。 */
async function call(action: BandiaAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, subprocess: SubprocessSeam, config: Config): Promise<string> {
  const result = await runBandia(inputFrom(action, args, inputs), createRuntime(subprocess, process.cwd(), () => config.bandizipPath.get(), run), (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核用 `failedCount === 0` 表达"部分条目失败了"，这时文件已经动过了：
  // 视图先发出去（那是读回现场的唯一入口），再把失败原样抛出去，不咽成一次成功输出。
  if (!result.success) throw new Error(`bandia ${action}: ${result.message}`)
  return summarize(result.message, result.data)
}

export function apply(ctx: Context, config: Config): void {
  // `ctx.subprocess` 的类型由 `@deepseek-ai/dsh-subprocess` 的声明合并提供，那个包不在本包
  // 依赖里（加它要跑 `pnpm install`，本次任务不许碰锁文件），所以按 `crashu` 对
  // `OPERATIONS_SERVICE` 的同一写法现取；结构类型对应的真源见 `src/exec.ts` 文件头。
  const subprocess = ctx.get('subprocess') as SubprocessSeam
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    // 上游那份 `danger.type: "pluginExport"` 要求判定函数，缺了 defineNode 在装载期就抛。
    dangerCheck,
    handlers: {
      async extract({ args, inputs, run }) {
        return call('extract', args, inputs, run, subprocess, config)
      },
      async compress({ args, inputs, run }) {
        return call('compress', args, inputs, run, subprocess, config)
      },
      async repack({ args, inputs, run }) {
        return call('repack', args, inputs, run, subprocess, config)
      },
      async export_efu({ args, inputs, run }) {
        return call('export_efu', args, inputs, run, subprocess, config)
      },
    },
  })
  // `stop` 那条只活在 `BandiaAction` 类型里、上游清单没给它 `actions[]` 项，
  // 所以这里**不写** `stop` 处理器：`defineNode` 只按 `definition.actions` 生成工具
  // （`define-node.ts:265-277`），终端与面板都不会看到它。这条分歧钉在
  // `tests/definition.spec.ts` 与 `tests/core.spec.ts` 各一处。
}
