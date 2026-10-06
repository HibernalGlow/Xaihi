/**
 * SmartZip 的宿主半边：把逐字搬来的内核（`core.ts` 455 行 + `platform.ts` 的字节层与文件系统层
 * + `exec.ts` 的 `ctx.subprocess`）接成一个 Xaihi 节点。
 *
 * 这一侧只做四件事：把表单值绑成 `SmartZipInput`、把内核的过程事件接到运行账本、
 * 把结局发给 `result_view`、把危险动作交给 DSH 的批准缝。内核逻辑不在这里重写，
 * 这里也不开第二套文件系统，更不 `spawn`。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/smartzip.json`，只有两处本仓形状差，见下面"清单的两处偏离"）。
 *
 * ## DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）
 *
 * | `SmartZipRuntime` 的 6 个方法（`core.ts:192-199`） | 落点 | 服务 |
 * |---|---|---|
 * | `readText` / `appendRecord` | `src/platform.ts` | `node:fs/promises`（ADR-0003 决定 1）|
 * | `resolveInputPaths`（= 上游 `expandExtractSources`，递归枚举）| `src/platform.ts` | `node:fs/promises`（同上）|
 * | `find7z` / `execute` 里起 7-Zip 与 7zFM 的每一处 | `src/exec.ts` | **`ctx.subprocess`**（「子进程 / 命令执行 ⇒ 不搬基础件」）|
 * | `inspectCodePages` | `src/platform.ts` | 字节层走 `node:fs` 的 `open`，文件树清单走 `ctx.subprocess` |
 * | 危险动作（`extract` / `extract_codepage` / `open` / `archive` 且 `dryRun` 不为真）→ `ask` | 清单里 `danger.type: "all"` 三条谓词 | `ctx.approval`（经 `tools/pre-execute`；不自己实现确认框，G6）|
 * | 进度 / 预览 / 结果视图 | `run.progress` / `run.preview` / `run.resultView` | `ctx.get(OPERATIONS_SERVICE)`（DSH 的 `tools` 只有单次输出缝）|
 * | 上游 `[nodes.smartzip]` 那六个默认值 | 下面的 `Config` | `ctx.settings` 面（ADR-0013；不搬 TOML）|
 *
 * ## 今天兑现不了的那两格，都写成拒绝而不是写成成功
 *
 * - **回收站**：上游 `recyclePath()` 把源文件交给 `@xiranite/file-operations` 的 trash 提供方，
 *   那条缝本仓没有（缺口 **G-no-os-trash**，与 `plugins/bandia`、`plugins/enginev` 同一条）。
 *   于是 `deleteSource` / `deleteSourceWhenPassword` / 嵌套解完后的那一次清理一律抛
 *   `NO_TRASH_MESSAGE`（`src/platform.ts`），内核的 `catch` 把它折成 `success:false` +
 *   `data.errors`，`defineNode` 再折成账本里那条 `fail` 的原因 —— **不退化成 `rm` 永久删**。
 *   注意这一抛的时机：文件已经解出来了，整次运行才失败，这与上游"提供方抛"的形状一致，
 *   不是本仓新增的分支。
 * - **`Config` 与清单默认之间那一格（缺口 G8）**：`bindInputs` 对 `asBoolean` 字段
 *   总产出布尔值（省略 ⇒ `false`），所以这里**以原始 `args` 有没有这个键为准**：
 *   填过 ⇒ 用填的值；没填 ⇒ 只在 `Config` 说是 `true` 时显式下发 `true`
 *   （那是上游 `cli.ts:105-114` 那句 `dry_run ?? true`），否则**不下发**、让内核自己的默认成立
 *   （`dryRun ?? false`、`recordRun ?? Boolean(databasePath)`）。照 `inputs` 无脑下发就等于
 *   把内核那两条默认在宿主面抹掉，并把"没被批准就不动文件"这一格让出去。
 * - **`trim` 把省略折成空串（缺口 G10）**：清单里 `action` 的绑定是 `trim`，模型省略时
 *   `inputs.action` 是 `''` 而不是"没有"。所以**动作身份只认处理器自己那一个**
 *   （`inputFrom(action, …)`），`inputs.action` 一律不读，也不当"第二个开关"用。
 * - **`path-list` 的两份形状**：工具面给的是 `array<string>`（`define-node.ts` 的
 *   `fieldProperty`），而清单绑定是 `lines`（按 `\n` 切），数组喂进去会被 `String()` 成
 *   逗号串再切出一整行。所以路径以**原始 `args.pathsText`** 为准，与
 *   `plugins/bandia/src/index.ts` 的 `pathsOf()` 同一处理由（那里因为上游绑定是
 *   `delimited`，症状一样）。
 *
 * ## 清单的两处偏离（都写在数据里，不改尺）
 *
 * 1. `fields[action].isActionSelector = true`：上游那份 smartzip.json **没有**这个标记
 *   （27 份里只有 linedup / sleept / timeu / smartzip 没有，前两份只有一个动作、
 *   timeu 的移植件补了）。不补的代价不是风格问题：`parametersFor` 只按它排除选择器，
 *   于是 `codePage` 那条 `visible: actionIs ["extract_codepage"]` 在任何工具参数表里
 *   都求值为"当前动作 = 未给" ⇒ 永不显示，`smartzip_extract_codepage` 会变成一个
 *   **选不了码页**的工具，而它的名字就是码页提取。
 * 2. `help` 只留 `whenToUse` + `safety`：上游那两条 `workflows` / `commands` 的值是
 *   `{zh,en}` 两份，而 `xaihi.node/v1` 的 `NodeHelp.workflows` 声明的是 `string[]`
 *   （缺口 **G11**）。同批 26 份都是这一格，本份不例外。
 *
 * 宿主侧**没有** `/smartzip` 那条斜杠命令：本包 `inject` 里只有 `tools` 与 `subprocess`，
 * 没有 `commands` ⇒ `src/help.ts` 不许传 `command`（缺口 **G7** 的两头都对不上那一格）。
 *
 * @module xaihi-smartzip
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import type { SmartZipAction, SmartZipData, SmartZipInput, SmartZipOperationResult } from './core.ts'
import { runSmartZip } from './core.ts'
import { createSmartZipRunCommand, type SubprocessSeam } from './exec.ts'
import { createNodeSmartZipRuntime, type SmartZipRunCommand } from './platform.ts'

export const name = '@hibernalglow/xaihi-smartzip'

/**
 * `subprocess` 是**硬依赖**：六条动作里四条要起 7-Zip，`inspect_codepage` 的文件树也要。
 * cordis 的 `inject` 让插件只在服务齐时装载，缺这条的症状在装载期就读得回来，不是运行期炸。
 */
export const inject = ['tools', 'subprocess']

/**
 * 下面这些默认值上游住在 `xiranite.config.toml` 的 `[nodes.smartzip]`
 * （`ini_path` / `passwords` / `code_page` / `database_path` / `record_run` / `dry_run`，
 * 见上游 `cli.ts:45-52` 那份 `Config` 与 `:105-114` 那组兜底值）。按
 * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路整块不搬：
 * 同一些值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面，使用点 `.get()`。
 *
 * `dryRun` 的默认是 **true**（上游 `dry_run ?? true` 与清单里那条 `default: {boolean:true}`
 * 同一格），而内核 `core.ts:224` 的 `input.dryRun ?? false` 是**另一格**——两份都是真源，
 * 都不许"统一"（缺口 **G8** 的原因；`rawfilter` 是同一格先例）。两侧各钉一条测试：
 * `tests/core.spec.ts` 钉内核，`tests/definition.spec.ts` 钉清单。
 *
 * `passwords` 用**换行分隔的字符串**而不是数组：与 `plugins/cleanf` 的 `exclude` 同一取舍，
 * 拆法沿用上游 `cli.ts:213` 那句 `split(/\r?\n/)`。
 */
export interface Config {
  /** 旧 SmartZip 的 INI 位置；空串 = 不读文件，只看 `iniText` 与内核默认表。 */
  iniPath: Volatile<string>
  /** INI 之外的密码兜底（换行分隔）。运行记录与结果视图里永远只有 `••••`。 */
  passwords: Volatile<string>
  /** `extract_codepage` 没给码页时的默认（0 = 让内核按 ZIP 字节自动推荐）。 */
  codePage: Volatile<number>
  /** 运行记录 JSONL 的位置；空串 = 由内核按路径推 `.xiranite/smartzip-runs.jsonl`。 */
  databasePath: Volatile<string>
  /** 是否记这次运行（上游 `record_run ?? false`）。 */
  recordRun: Volatile<boolean>
  /** 预演模式，默认 true：**没被显式关掉就只出计划，一个文件都不动**。 */
  dryRun: Volatile<boolean>
}

export const Config = Schema.object({
  iniPath: Schema.string().default('').volatile(),
  passwords: Schema.string().default('').volatile(),
  codePage: Schema.number().default(0).volatile(),
  databasePath: Schema.string().default('').volatile(),
  recordRun: Schema.boolean().default(false).volatile(),
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
 * 原始参数里有没有这个键：面板、`/smartzip` 那类命令或模型真填过，才算"使用者说过"。
 * 省略的键**不下发**，让它落回 `Config`（上面 G8 那一格）。
 */
function has(field: string, args: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(args, field)
}

/** 上游 `cli.ts:213` 那句：换行分隔、去空白、丢空行。 */
function linesOf(value: unknown): string[] {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
}

/**
 * `paths` 的两份形状（文件头 G10 那一格）：工具面是 `array<string>`，面板那一边是
 * 换行分隔文本。清单绑定是 `lines`，数组喂进去会被 `String()` 成逗号串，所以先看原始参数。
 * 分隔符取上游 `cli.ts:203-207` 那份"位置参数 + `-` 走 stdin"里没有的东西：**这里不猜**，
 * 只按换行切，与内核 `uniqueClean` 的口径一致。
 */
function pathsOf(args: Record<string, unknown>, inputs: Record<string, unknown>): string[] {
  const raw = args.pathsText
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  const bound = inputs.paths
  if (Array.isArray(bound)) return bound.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  return linesOf(bound)
}

/**
 * 表单值 → 内核入参。
 *
 * `action` 由**处理器身份**给（一个动作一个工具），不吃 `inputs.action`：那条 `trim`
 * 绑定在模型省略时给的是 `''`（G10），而 `''` 在内核里会被 `??` 兜成 `"status"`，
 * 于是"调的是 extract、跑的是 status"。
 *
 * `iniPath` / `databasePath` 走清单声明的 `trimOrOmit`，省略与空串都是 `undefined` ⇒
 * 不下发，让内核用 `""`（它的 `clean()` 本来就折空串）。
 */
function inputFrom(action: SmartZipAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): SmartZipInput {
  const input: SmartZipInput = { action }
  const paths = pathsOf(args, inputs)
  if (paths.length > 0) input.paths = paths
  const iniPath = typeof inputs.iniPath === 'string' ? inputs.iniPath.trim() : ''
  if (iniPath !== '') input.iniPath = iniPath
  const databasePath = typeof inputs.databasePath === 'string' ? inputs.databasePath.trim() : config.databasePath.get()
  if (databasePath !== '') input.databasePath = databasePath
  const codePage = Number(inputs.codePage)
  if (Number.isInteger(codePage) && codePage > 0) input.codePage = codePage
  else if (!has('codePage', args) && config.codePage.get() > 0) input.codePage = config.codePage.get()
  const passwords = linesOf(config.passwords.get())
  if (passwords.length > 0) input.passwords = passwords
  // 两条布尔都只在"有人真表过态"时才下发：
  // - 原始参数里有这个键 ⇒ 用面板/命令给的值；
  // - 否则 `Config` 说是 true ⇒ 显式下发 true（上游 `dry_run ?? true` 那一格）；
  // - 否则**不下发**，让内核自己的默认成立（`recordRun: Boolean(databasePath)` `core.ts:223`、
  //   `dryRun: false` `core.ts:224`）。把 `Config` 的 false 也显式下发，就等于把
  //   "给了库路径就默认记账"这条内核语义在宿主面抹掉（bandia 同一取舍）。
  if (has('recordRun', args)) input.recordRun = inputs.recordRun === true
  else if (config.recordRun.get()) input.recordRun = true
  if (has('dryRun', args)) input.dryRun = inputs.dryRun === true
  else if (config.dryRun.get()) input.dryRun = true
  return input
}

/**
 * 内核事件 → 运行账本。**单位**：smartzip 内核与 `src/platform.ts` 的 `progress` 都是百分数
 * （`core.ts:235,251,253` 与上游 `platform.ts:76,154`），直接当 `done / total = 100` 用，
 * 不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。见 `src/contract.ts` 文件头。
 */
function forward(event: { type: string; progress?: number | undefined; message: string }, run: OperationRun): void {
  if (event.type === 'progress') {
    run.progress({ done: Math.round(event.progress ?? 0), total: 100 })
  }
  if (event.message !== '') run.preview({ message: event.message })
}

/**
 * 结果视图：内核算好的字段一条不加、一条不减（`core.ts:180-190` 那份 `SmartZipData`）。
 * `config` 直接给——内核的 `data()` 已经把 `passwords` 整体折成 `••••`（`core.ts:508`）。
 * `commandResult` 只带长度不带正文：那两个长度就是内核自己那份运行记录的字段
 * （`stdoutLength` / `stderrLength`，`core.ts:411-412`），而 7-Zip 的输出上限是 32 MiB
 * （`src/exec.ts` 的 `OUTPUT_BYTES`），整段塞进账本会把一次运行变成一份日志转储。
 */
function viewOf(data: SmartZipData | undefined) {
  return {
    selectedPaths: data?.selectedPaths ?? [],
    archiveCount: data?.archiveCount ?? 0,
    errors: data?.errors ?? [],
    config: data?.config,
    database: data?.database,
    command: data?.command,
    commandResult: data?.commandResult === undefined ? undefined : {
      code: data.commandResult.code,
      stdoutLength: data.commandResult.stdout.length,
      stderrLength: data.commandResult.stderr.length,
    },
    operations: (data?.operations ?? []).map(operationView),
    encodingInspections: data?.encodingInspections ?? [],
  }
}

/** 一条操作：状态 + 源 + 产物 + 那句消息 + 计划（计划里的 `-p*` 已被内核折成 `-p••••`）。 */
function operationView(operation: SmartZipOperationResult) {
  return {
    action: operation.action,
    status: operation.status,
    sourcePath: operation.sourcePath,
    outputPath: operation.outputPath ?? '',
    message: operation.message,
    passwordUsed: operation.passwordUsed === true,
    command: operation.command === undefined ? undefined : {
      label: operation.command.label,
      command: operation.command.command,
      args: operation.command.displayArgs ?? operation.command.args,
    },
  }
}

/**
 * 工具输出：一句结论 + 内核那句汇总要的计数 + 每条操作一行 + 错误行。
 * 上游终端面（`cli.ts:222-224`）非 JSON 模式只打 `result.message` 一行，
 * 计划与逐条结果都在 `--json` 里；这里把两者合成可读的一屏，**不新加任何计数口径**
 * （计数全部来自 `SmartZipData`）。
 */
function summarize(action: SmartZipAction, message: string, data: SmartZipData | undefined): string {
  const head = `${action} · ${message}`
  const lines = (data?.operations ?? []).map((operation) => {
    const plan = operation.command
    const tail = plan === undefined ? '' : ` :: ${plan.displayArgs ?? plan.args}`
    return `${operation.status}\t${operation.sourcePath}${operation.outputPath === undefined ? '' : ` -> ${operation.outputPath}`}${operation.message === '' ? '' : ` / ${operation.message}`}${tail}`
  })
  const errors = (data?.errors ?? []).map((error) => `error\t${error}`)
  return [head, ...lines, ...errors].join('\n')
}

/** 六条动作共用的一条腿：合成缝、跑内核、接账本、发结果视图、失败就抛。 */
async function call(
  action: SmartZipAction,
  args: Record<string, unknown>,
  inputs: Record<string, unknown>,
  run: OperationRun,
  runCommand: SmartZipRunCommand,
  config: Config,
): Promise<string> {
  const result = await runSmartZip(inputFrom(action, args, inputs, config), createNodeSmartZipRuntime({ runCommand }), (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核用 `success:false` 表达"这一步没成"（含 `NO_TRASH_MESSAGE` 那一格）：
  // 视图先发出去（那是读回现场的唯一入口），再把失败原样抛出去，不咽成一次成功输出。
  if (!result.success) throw new Error(`smartzip ${action}: ${result.message}`)
  return summarize(action, result.message, result.data)
}

export function apply(ctx: Context, config: Config): void {
  // `ctx.subprocess` 的类型由 `@deepseek-ai/dsh-subprocess` 的声明合并提供，那个包不在本包
  // 依赖里（加它要跑 `pnpm install`，本次任务不许碰锁文件），所以按 `crashu` 对
  // `OPERATIONS_SERVICE` 的同一写法现取；结构类型对应的真源见 `src/exec.ts` 文件头。
  const subprocess = ctx.get('subprocess') as SubprocessSeam
  const runCommand = createSmartZipRunCommand(subprocess, { cwd: process.cwd() })
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async status({ args, inputs, run }) {
        return call('status', args, inputs, run, runCommand, config)
      },
      async inspect_codepage({ args, inputs, run }) {
        return call('inspect_codepage', args, inputs, run, runCommand, config)
      },
      async extract({ args, inputs, run }) {
        return call('extract', args, inputs, run, runCommand, config)
      },
      async extract_codepage({ args, inputs, run }) {
        return call('extract_codepage', args, inputs, run, runCommand, config)
      },
      async open({ args, inputs, run }) {
        return call('open', args, inputs, run, runCommand, config)
      },
      async archive({ args, inputs, run }) {
        return call('archive', args, inputs, run, runCommand, config)
      },
    },
  })
}
