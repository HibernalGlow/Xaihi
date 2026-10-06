/**
 * Gifu 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts` / `contract.ts`）是从 `noxide` 基线逐字搬来的：
 * `core.ts` 的 781 行只有三类差异（import 说明符、文件头、四条类型层让步，逐条点名在
 * 它自己的文件头里），`platform.ts` 换掉的是"怎么起外部程序"那一格。这一侧只做四件事：
 * 把表单/工具参数绑成 `GifuInput`、把内核的过程事件接到运行账本、把结果发给
 * `result_view`、把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/gifu.json`，三处被点名的词表落差写在
 * `tests/definition.spec.ts` 的文件头）。
 *
 * DI 缝 → DSH 服务的对应（`docs/service-mapping.md`）：
 * - `listArchiveImages` / `convertArchive` 里的每一次 7-Zip / ffmpeg / ffprobe 调用
 *   → **`ctx.subprocess`**（Service Definition `dsh-subprocess`，provider
 *   `dsh-subprocess-local`；`desktop/dsh/docs/subsystems/subprocess.md`）。本包
 *   `inject = ['tools', 'subprocess']`，取用走 `ctx.get('subprocess')`，先例是
 *   `plugins/mvz/src/index.ts:145`、`plugins/sleept/src/exec.ts`。**内核里一个 spawn 都没有**：
 *   `core.ts` 只认 `GifuRuntime` 那 11 个方法，外部程序那一格在 `platform.ts` 才落地。
 *   缝缺席时不是崩、也不是假成功：装载被 cordis 挡住（inject），而独立 bin 那条腿
 *   （`src/cli.ts`）拿不到缝 ⇒ 三条动作一律退出码 2 并点名这条缝（缺口 G1/G6 那一类）。
 * - `readText` / `appendRecord` / `pathInfo` / `listDir` + 解包用的临时目录树 →
 *   **不接 `ctx.fs`**，走移植版 `platform.ts` 的 `node:fs`（ADR-0003 决定 1）。
 * - 危险动作（`make` 且非预演）→ `ctx.approval`：`defineNode` 按清单的
 *   `danger.type: "all"`（`actionIs make` ∧ `¬fieldTrue dryRun`）产出 `ask`。
 * - 运行账目 → `ctx.storage`（storage domain `xaihi_runs`）经 `OPERATIONS_SERVICE` 的账本，
 *   每次调用现取。内核自己那份 `gifu-runs.jsonl` 是**另一件事**：它是旧工具继续读写的文件
 *   （ADR-0003 决定 3 分的正是这一格），默认关（`recordRun=false`），路径优先取
 *   `Config.databasePath` / 调用给的 `databasePath`，两者都没给时沿用基线那份
 *   "落在输出目录旁边的 `.xiranite/`"——那个目录名逐字保留（改它等于数据迁移，
 *   要动得先在 ADR-0010 里被逐地点名）。
 *
 * `dryRun` 那一格的三份默认值，不许在这里"统一"（与 rawfilter 那对分叉形状不同）：
 * - 内核 `core.ts:215` 的 `defaultGifuInput.dryRun` 是 **true**；
 * - 清单里 `dryRun` 字段的声明式默认也是 **true** ⇒ 表单/界面默认预演，这两份**一致**
 *   （rawfilter 那对才是 46/47 分叉的）；
 * - 第三份是 **SDK 那一格**：`bindInputs` 对 `asBoolean` 字段总产出布尔值，模型省略参数时
 *   给的是 **false**（缺口 G8，`packages/node-sdk/src/define-node.ts:144-145`）。于是
 *   `gifu_make` 少传 `dryRun` ⇒ 内核真写文件。兜住这一格的是清单的 `danger`
 *   （`actionIs make` ∧ `¬fieldTrue dryRun`：省略时 `fieldTrue` 不成立 ⇒ 判危险 ⇒ DSH 的 `ask`
 *   先亮出来），不是这里的一层地板。`Config.dryRun` 于是只服务"没走 `bindInputs` 的那类入口"，
 *   它的值与内核/清单那两份同一个 true，不构成第四份真源。
 * `recursive` / `extractSingle` 两个上游默认为 true 的布尔同一条折法，`overwrite` /
 * `recordRun` 上游默认 false，一并镜像成 `Config`（`docs/adr/0013-config-goes-through-dsh-settings.md`：
 * 上游那些值住在 `xiranite.config.toml` 的 `[nodes.gifu]`，那条通路整块不搬）。
 *
 * @module xaihi-gifu
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runGifu, type GifuAction, type GifuData, type GifuInput, type GifuRuntime } from './core.ts'
import { createNodeGifuRuntime, type GifuSubprocessSeam } from './platform.ts'

export const name = '@hibernalglow/xaihi-gifu'

export const inject = ['tools', 'subprocess']

/** 结果视图里最多列几条归档（内核一条不筛，这是呈现侧的上界）。 */
const RESULT_ROWS = 40

export interface Config {
  /**
   * 上游这五个布尔住在 `xiranite.config.toml` 的 `[nodes.gifu]`
   * （`recursive` / `extract_single` / `overwrite` / `dry_run` / `record_run`，
   * 见上游 `cli.ts:44-68` 那份 `GifuNodeConfig`）。按 ADR-0013，那条"配置住在后端一个
   * toml 里"的通路整块不搬：同一批默认值在这里声明成 `Config`，值由 DSH 的 patch 层给。
   *
   * 前三个的默认值不是随手写的：**它们正是缺口 G8 会被 `asBoolean` 折成 false 的那三个**
   * （上游默认是 true），所以宿主面必须由 Config 补这一格，见文件头那条三段式。
   */
  recursive: Volatile<boolean>
  extractSingle: Volatile<boolean>
  overwrite: Volatile<boolean>
  /** 预演模式，默认 true：**没配就一个文件都不写**。 */
  dryRun: Volatile<boolean>
  /** 内核那份 JSONL 运行记录，默认关。 */
  recordRun: Volatile<boolean>
  /**
   * JSONL 运行记录路径，默认空串 = 交回内核自己那个"输出目录旁边的 `.xiranite/`"。
   * 与 `dissolvef` 的 `historyPath` 不同：那份账本是撤销的唯一真源，写错位置等于丢数据；
   * 这份是可选审计记录，且默认关，所以空串不拒绝动作，只沿用它自己那个位置。
   */
  databasePath: Volatile<string>
}

export const Config = Schema.object({
  recursive: Schema.boolean().default(true).volatile(),
  extractSingle: Schema.boolean().default(true).volatile(),
  overwrite: Schema.boolean().default(false).volatile(),
  dryRun: Schema.boolean().default(true).volatile(),
  recordRun: Schema.boolean().default(false).volatile(),
  databasePath: Schema.string().default('').volatile(),
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
 * 字符串与数字那一族**不给默认值**：清单里每个数值字段都带声明式 `default`（表单侧会填），
 * 而内核自己那套 `defaultGifuInput` 与那份 default **逐字同源**（`core.ts:187-216`），
 * 在这里再兜一层就是第三份真源。布尔那一族照 rawfilter 的写法兜一份 `Config`（兜出来的值是
 * 配置给的，不是这里现编的），但别把它读成"模型省略时被这里补回 true"——`asBoolean` 已经先把它
 * 折成 `false` 了，那一格真正的地板是清单的 `danger`（文件头那条三段式）。
 */
function inputFrom(action: GifuAction, inputs: Record<string, unknown>, config: Config): GifuInput {
  const text = (value: unknown): string => typeof value === 'string' ? value : ''
  return {
    action,
    // 清单里 pathsText 的绑定是 `delimited`（上游那份就是 delimited）：逗号分隔的字符串数组
    // 交给内核自己 `uniqueClean`，这里不重切一遍。
    paths: Array.isArray(inputs.paths) ? (inputs.paths as string[]) : [],
    recursive: typeof inputs.recursive === 'boolean' ? inputs.recursive : config.recursive.get(),
    format: text(inputs.format) === '' ? undefined : (inputs.format as GifuInput['format']),
    outDir: text(inputs.outDir),
    outMode: text(inputs.outMode) === '' ? undefined : (inputs.outMode as GifuInput['outMode']),
    namePrefix: typeof inputs.namePrefix === 'string' ? inputs.namePrefix : undefined,
    nameTemplate: typeof inputs.nameTemplate === 'string' ? inputs.nameTemplate : undefined,
    durationMs: typeof inputs.durationMs === 'number' ? inputs.durationMs : undefined,
    loop: typeof inputs.loop === 'number' ? inputs.loop : undefined,
    quality: typeof inputs.quality === 'number' ? inputs.quality : undefined,
    webpMethod: typeof inputs.webpMethod === 'number' ? inputs.webpMethod : undefined,
    ffmpegThreads: typeof inputs.ffmpegThreads === 'number' ? inputs.ffmpegThreads : undefined,
    webmCrf: typeof inputs.webmCrf === 'number' ? inputs.webmCrf : undefined,
    webmCpuUsed: typeof inputs.webmCpuUsed === 'number' ? inputs.webmCpuUsed : undefined,
    mp4Preset: text(inputs.mp4Preset),
    mp4Cq: typeof inputs.mp4Cq === 'number' ? inputs.mp4Cq : undefined,
    maxWorkers: typeof inputs.maxWorkers === 'number' ? inputs.maxWorkers : undefined,
    extractSingle: typeof inputs.extractSingle === 'boolean' ? inputs.extractSingle : config.extractSingle.get(),
    overwrite: typeof inputs.overwrite === 'boolean' ? inputs.overwrite : config.overwrite.get(),
    dryRun: typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get(),
    recordRun: typeof inputs.recordRun === 'boolean' ? inputs.recordRun : config.recordRun.get(),
    databasePath: text(inputs.databasePath) === '' ? config.databasePath.get() : text(inputs.databasePath),
    // 上游那份"旧版 gifu TOML"的入口保留：清单里有 configPath 字段，内核自己读它
    // （`core.ts:388-392`），这里不替它判空——空串在 `loadGifuConfigInput` 那里就是"没有配置"。
    configPath: text(inputs.configPath),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：gifu 内核的 `progress` 是百分数
 * （10 / 15..55 / 60 / 60..95 / 100，`core.ts:269,277,321,363,375`），直接当 `done / total=100` 用，
 * 不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：上游 `GifuData` 的七条计数 + errors + 前 40 条归档行 + `command` 那份计划预览。
 * 计数一条不加、一条不减（`core.ts:719-734` 的 `data()` 就是这七个键 + archives/errors）。
 */
function viewOf(data: GifuData | undefined) {
  return {
    readyCount: data?.readyCount ?? 0,
    singleCount: data?.singleCount ?? 0,
    emptyCount: data?.emptyCount ?? 0,
    convertedCount: data?.convertedCount ?? 0,
    extractedCount: data?.extractedCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    errors: data?.errors ?? [],
    archives: (data?.archives ?? []).slice(0, RESULT_ROWS),
    command: data?.command,
    commandResult: data?.commandResult,
    database: data?.database,
  }
}

export function apply(ctx: Context, config: Config): void {
  // 本包没声明 `@deepseek-ai/dsh-subprocess` 那个依赖（理由见 `src/platform.ts` 文件头），
  // 所以类型面按可缺处理：`inject` 已经保证 cordis 不会在没有这条缝的装配里装载本包，
  // 这一格只是把"真的缺了"写成一句能读的话，而不是把一个 undefined 传进 runtime 工厂。
  const subprocess = ctx.get('subprocess') as GifuSubprocessSeam | undefined
  if (subprocess === undefined) {
    throw new Error(`${name}: ctx.subprocess is not provided; gifu cannot run 7-Zip or ffmpeg without that seam.`)
  }

  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async inspect({ inputs, run }) {
        return runOne('inspect', inputs, config, subprocess, run)
      },
      async plan({ inputs, run }) {
        return runOne('plan', inputs, config, subprocess, run)
      },
      async make({ inputs, run }) {
        return runOne('make', inputs, config, subprocess, run)
      },
    },
  })
}

/**
 * 一次动作：起一条**本次调用自己的** runtime（基线也是每次 `createRuntime()`，
 * 那份 runtime 带着 `cancelled` 与被托管的子进程集合，共享就会让一次取消波及别的运行），
 * 跑内核、把结果视图发给账本。`make` 的失败原样抛出（把失败咽成一次成功输出，
 * 症状会是"面板显示了空结果"）；`inspect` / `plan` 把内核那句话原样交回去，
 * 因为"读不到某个归档"在那两个动作里是结果的一部分，不是这次运行失败。
 */
async function runOne(
  action: GifuAction,
  inputs: Record<string, unknown>,
  config: Config,
  subprocess: GifuSubprocessSeam,
  run: OperationRun,
): Promise<string> {
  const runtime: GifuRuntime = createNodeGifuRuntime(subprocess, process.cwd())
  const result = await runGifu(inputFrom(action, inputs, config), runtime, (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  if (action === 'make' && !result.success) throw new Error(`gifu: ${result.message}`)
  return summarize(action, result.message, result.data)
}

/**
 * 工具输出：内核那句话 + 上游 `data()` 那七条计数（`core.ts:719-734`，一条不加一条不减）
 * + 最多 40 条归档行。清单里 `resultTable` 那四列（路径 / 状态 / 张图片 / 输出）就是这里的行拼法，
 * 不在这里另起一套列名。
 */
function summarize(action: GifuAction, message: string, data: GifuData | undefined): string {
  const counts = [
    `ready: ${String(data?.readyCount ?? 0)}  single: ${String(data?.singleCount ?? 0)}  empty: ${String(data?.emptyCount ?? 0)}`,
    `converted: ${String(data?.convertedCount ?? 0)}  extracted: ${String(data?.extractedCount ?? 0)}`,
    `skipped: ${String(data?.skippedCount ?? 0)}  failed: ${String(data?.failedCount ?? 0)}`,
  ]
  const rows = (data?.archives ?? []).slice(0, RESULT_ROWS).map(archiveLine)
  const rest = (data?.archives.length ?? 0) > RESULT_ROWS ? `… ${String((data?.archives.length ?? 0) - RESULT_ROWS)} more` : ''
  return [`${action} · ${message}`, ...counts, ...rows, rest].filter(Boolean).join('\n')
}

/** 一行归档：`状态 路径 图片数 -> 输出`，与清单 `resultTable` 的四列同一顺序。 */
function archiveLine(item: GifuData['archives'][number]): string {
  const frames = item.decodedFrames === undefined ? '' : ` (${String(item.decodedFrames)} decoded)`
  return `${item.status}\t${item.archivePath}\t${String(item.imageCount)}${frames} -> ${item.outputPath}`
}
