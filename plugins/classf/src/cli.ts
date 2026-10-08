#!/usr/bin/env node
/**
 * ClassF 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/classf/src/cli.ts`
 * （184 行）搬来。保留的东西：两条动作子命令 `plan` / `classify`（上游 `runPipe` 里
 * `args.includes("classify") || args.includes("run")` 那一条判据，`:82`，`run` 只是别名）、
 * flag 名单（`--target` / `--transfer` / `--classify` / `--placement` / `--existing` /
 * `--items` / `--crashu-source` / `--similarity` / `--samea-min` / `--samea-group-min` /
 * `--blacklist-keyword` / `--samea-centralize` / `--samea-ignore-path-blacklist` /
 * `--samea-group` / `--samea-group-already|-wait|-del` / `--samea-group-centralize` /
 * `--already` / `--wait` / `--del` / `--dry-run` / `--json`，`:95-116`），
 * 三个开关的 `--no-<name>` 拼法（`booleanFlag`，`:175-179`），非 `--json` 时
 * "一行结论 + 最多 80 行 `status stage sourceName -> targetRelative`"
 * （`:121-122`），以及 `result.success` 为假时退出码 1（`:124`）。
 *
 * 四处偏离，都写在能看见的地方：
 * 1. **路径走 flag 不走位置参**：本包的终端支撑是 vendored 的 citty 子集
 *    （`src/cli-support.ts`），子命令之后不接受裸位置参（`Unknown argument: <token>.`，
 *    退出码 2）。上游那份 `pathArgs()` 靠"滤掉所有认识的 token"来捡位置参，
 *    与同批 `formatv` / `timeu` 是同一处理由。
 * 2. **`ui` / `gd` / `guided` 三条腿未接**：上游分别是 OpenTUI（`runTerminalUi` +
 *    `./Tui.tsx`）与 `@clack/prompts` 的 `runGuidedInteraction` + `./interaction.ts`。
 *    三条腿**都不带任何参数校验**——未接的功能先报 "Missing required argument" 会把
 *    "这块没搬"说成"你参数没给对"。
 * 3. **`@xiranite/config` 那一层不读**：上游从这里取 `[nodes.classf]` 的十几格默认
 *    （`ClassfNodeConfig`，`:14-46`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
 *    同一些值在 Xaihi 是 `src/index.ts` 的 `Config`，独立 bin 读不到 ⇒ bin 只按命令行给的走，
 *    内核默认（`core.ts:69-81`）因此就是 bin 的默认：`dryRun` 默认 **true**（预演）、
 *    三条队列全开、画师分组默认关。
 * 4. **动作在 bin 里跑不出结果，而且理由点名**：classf 是 SameA / CrashU / MigrateF 三个
 *    sibling 内核的编排器，`ClassfRuntime` 的那三个方法在本包**没有缝**（缺口 **G10**，
 *    文案与判据见 `src/platform.ts`），剪贴板那条腿同样没有缝（台账 **G5**）。
 *    所以 `plan` 与 `classify` 都必然拿到一声拒绝：内核把缝缺失折成
 *    `success:false` + 那句话（`core.ts:129`），bin 认出它是"缺缝"就报**退出码 2**
 *    并给 `executed:false`（G1 那条口径：bin = 计划器 + 只读查询，而 classf 连计划都要
 *    先过兄弟内核），其余失败仍按上游的退出码 1。批准面在 bin 里也没有（台账 **G6**），
 *    所以这里**不做** `--force` 之类的形状。
 *
 * @module xaihi-classf/cli
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  runInteractionCli,
} from '@hibernalglow/xaihi-cli-runtime/terminal'
import type { TerminalInteractionDefinition } from '@hibernalglow/xaihi-cli-runtime/interaction'
import type { TerminalLanguage } from '@hibernalglow/xaihi-cli-runtime/i18n'
import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  nodeCliName,
  runPipeProgram,
  writeError,
  writeJson,
  writeLine,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { ClassfAction, ClassfClassifyMode, ClassfExistingPolicy, ClassfInput, ClassfPlacementMode, ClassfResult, ClassfTransferMode, ClassfWorkItemMode } from './core.ts'
import { runClassf } from './core.ts'
import { CLIPBOARD_UNWIRED, SIBLING_KERNEL_UNWIRED, createNodeClassfRuntime } from './platform.ts'
import { createClassfInteractionSchema, type ClassfInteractionValues } from './interaction.ts'

const CLI_NAME = nodeCliName('classf')

/** 动作名单的唯一真源是 `package.json#xaihi.node`；这里只抄它的 id，别处不许再列一份。 */
const NODE_ACTIONS = ['plan', 'classify'] as const

/** 上游 `cli.ts:122` 的那个 `slice(0, 80)`：计划行数不在这里另定一个数。 */
const PLAN_LINES = 80

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Plan and apply classified file transfers.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

/** 派发形状对齐 vendored 支撑里的 `runNodeCliFace`（`--help` 短路与无参拒绝都在那儿）。 */
/**
 * 上游拼法的别名表：键是**规范形**（剥掉 `no-`、去掉连字符、小写），值是本包的字段名。
 *
 * 为什么必须留这一层：搬运把参数改名成了清单字段名（`--target` → `--targetDir`、
 * `--items` → `--workItemMode`、`--samea-group-min` → `--sameaGroupMinOccurrences` 等 9 条，
 * 逐条对得上基线 `packages/nodes/classf/src/cli.ts` 里出现过的长开关）。
 * 面板读的是字段名，所以字段名是正主；但**上游认过的写法不能变成不认识**——
 * 搬运是并集，不是子集（写过的脚本、文档里的示例、以及那条尺都会指着这里）。
 * `--no-<上游名>` 的否定写法保留否定，只换名字（`--no-classify` → `--no-classifyMode`），
 * 因为三条队列开关的否定形状由 `cli-support.ts` 的 `booleanFlag` 自己给。
 */
export const UPSTREAM_CLASSF_FLAGS: Record<string, string> = {
  crashusource: 'crashuSourcesText',
  placement: 'placementMode',
  target: 'targetDir',
  transfer: 'transferMode',
  classify: 'classifyMode',
  existing: 'existingPolicy',
  items: 'workItemMode',
  blacklistkeyword: 'blacklistKeywordsText',
  sameagroupmin: 'sameaGroupMinOccurrences',
}

/** 把 `--target` / `--target=/x` / `--no-classify` 这类上游写法换成本包字段名的同形写法。 */
export function applyUpstreamFlagAliases (args: readonly string[]): string[] {
  return args.map((token) => {
    const match = /^--([^=\s]+)([\s\S]*)$/.exec(token)
    if (match === null) return token
    const body = match[1] ?? ''
    const suffix = match[2] ?? ''
    const negated = /^no-/i.test(body)
    const key = body.replace(/^no-/i, '').replace(/-/g, '').toLowerCase()
    const mapped = UPSTREAM_CLASSF_FLAGS[key]
    if (mapped === undefined) return token
    return `--${negated ? 'no-' : ''}${mapped}${suffix}`
  })
}

function createClassfUiDefinition (
  defaults: Partial<ClassfInteractionValues>,
  language: TerminalLanguage,
): TerminalInteractionDefinition<ClassfInput, ClassfResult> {
  let cancelled = false
  let paused = false
  let resumePaused: (() => void) | undefined
  const schema = createClassfInteractionSchema({ ...defaults }, language)
  return {
    schema,
    async run (input, onEvent) {
      cancelled = false
      paused = false
      const runtime = createNodeClassfRuntime()
      return runClassf(input, {
        ...runtime,
        isCancelled: () => cancelled,
        waitWhilePaused: async () => {
          while (paused && !cancelled) await new Promise<void>((resolve) => { resumePaused = resolve })
          resumePaused = undefined
        },
      }, onEvent)
    },
    pause () { paused = true },
    resume () { paused = false; resumePaused?.() },
    cancel () {
      cancelled = true
      paused = false
      resumePaused?.()
    },
  }
}

export async function runProgram (rawArgs = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  const args = applyUpstreamFlagAliases(rawArgs)
  const isInteractiveLeg = args.length > 0 && ['ui', 'gd', 'guided'].includes(args[0] ?? '')
  if (isInteractiveLeg && (!host.stdin.isTTY || !host.stdout.isTTY || typeof (host.stdin as any).on !== 'function')) {
    writeLine(host, `${CLI_NAME} ${args[0]} 交互模式已就绪（非交互环境退出）`)
    process.exitCode = 0
    return
  }

  await runInteractionCli({
    args,
    host,
    cliName: CLI_NAME,
    loadContext: () => ({ preferences: { mode: 'ui', renderer: 'opentui', theme: 'inherit' }, value: {} }),
    createDefinition: (defaults, language) => createClassfUiDefinition(defaults, language),
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    loadScreen: async () => (await import('./Tui.tsx')).ClassfTui,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Plan and apply classified file transfers (SameA → CrashU → MigrateF).' },
    subCommands: {
      plan: defineCommand({
        meta: { name: 'plan', description: '预演 · Plan' },
        args: actionArgs(),
        async run ({ args }) {
          await runAction('plan', args, host)
        },
      }),
      classify: defineCommand({
        meta: { name: 'classify', description: '执行 · Classify' },
        args: actionArgs(),
        async run ({ args }) {
          await runAction('classify', args, host)
        },
      }),
      // ↓ 上游面上有、本包没带的那三条腿：面在这儿，实现不在这儿。
      ui: defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.（未接）' },
        async run () {
          await runProgram(['ui'], host)
        },
      }),
      gd: defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.（未接）' },
        async run () {
          await runProgram(['gd'], host)
        },
      }),
      guided: defineCommand({
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runProgram(['guided'], host)
        },
      }),
    },
  })
}

/**
 * flag 名单就是 `package.json#xaihi.node.fields` 那些 id（kebab 与 camel 两种拼法都认，
 * 见 `src/cli-support.ts` 的解析器），外加 `--json`。
 *
 * `--no-<name>` 由支撑自己给（`booleanFlag` 的上游写法，`:175-179`），
 * 所以三条队列与三条画师分组开关都能关；这里**不做** `--force`（G6：bin 里没有批准缝）。
 */
function actionArgs () {
  return {
    pathsText: { type: 'string', description: 'SameA archive roots, one per line (also --paths-text).' },
    crashuSourcesText: { type: 'string', description: 'CrashU matching source directories, one per line (also --crashu-source).' },
    placementMode: { type: 'string', description: 'local | root (placement) (also --placement).' },
    targetDir: { type: 'string', description: 'Classification target root (required with placement=root) (also --target).' },
    transferMode: { type: 'string', description: 'move | copy (also --transfer).' },
    alreadyEnabled: { type: 'boolean', description: 'Enable the already queue.' },
    waitEnabled: { type: 'boolean', description: 'Enable the wait queue.' },
    delEnabled: { type: 'boolean', description: 'Enable the del queue.' },
    existingPolicy: { type: 'string', description: 'merge | skip (also --existing).' },
    workItemMode: { type: 'string', description: 'files | folders | mixed (also --items).' },
    blacklistKeywordsText: { type: 'string', description: 'Blacklisted authors, one per line (also --blacklist-keyword).' },
    classifyMode: { type: 'string', description: 'Legacy queue switch: off | auto | only | del (per-stage flags win) (also --classify).' },
    dryRun: { type: 'boolean', description: 'Plan only (kernel default true).' },
    sameaGroupAlreadyEnabled: { type: 'boolean', description: 'Run SameA grouping in the already stage.' },
    sameaGroupWaitEnabled: { type: 'boolean', description: 'Run SameA grouping in the wait stage.' },
    sameaGroupDelEnabled: { type: 'boolean', description: 'Run SameA grouping in the del stage.' },
    sameaGroupMinOccurrences: { type: 'string', description: 'Minimum files per artist group (1-100) (also --samea-group-min).' },
    // ↓ 上游那几条 legacy / SameA 细调 flag（`:96-105`）：定义里没有对应字段
    //   （宿主那侧它们是 `Config`），所以只有 bin 面上能这样给；给了就传进内核。
    similarity: { type: 'string', description: 'CrashU similarity threshold, 0-1 (kernel default 0.8).' },
    sameaMin: { type: 'string', description: 'SameA minimum occurrences per artist (1-100).' },
    sameaCentralize: { type: 'boolean', description: 'SameA: centralize artist groups to one root.' },
    sameaIgnorePathBlacklist: { type: 'boolean', description: 'SameA: ignore the path blacklist.' },
    sameaGroup: { type: 'boolean', description: 'Legacy shared SameA grouping switch (per-stage flags win).' },
    sameaGroupCentralize: { type: 'boolean', description: 'Post-transfer SameA grouping: centralize.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * flag → 内核输入。这里**只**搬上游那条优先级：命令行给了就用命令行的，没给就整个键不传，
 * 让内核自己的默认与 legacy 折算接手（`core.ts:69-81`）。
 * 上游那条"没给就读 `[nodes.classf]` 配置"的分支在 bin 里没有对应物（文件头第 3 条）。
 */
function inputFromArgs (action: ClassfAction, args: CliArgs): ClassfInput {
  const queue = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)
  const num = (value: unknown): number | undefined => (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined)
  const groupMin = num(args.sameaGroupMinOccurrences)
  const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)
  // 队列切分的分隔符就是内核自己的那两个（`core.ts:370` 的 `/\r?\n|,/`）：
  // 上游 `--crashu-source` 用 `[,\r\n]+`、`--blacklist-keyword` 用 `[\r\n,]+`，同一件事。
  const list = (value: unknown): string[] | undefined => {
    const raw = text(value)
    if (raw === undefined) return undefined
    const items = raw.split(/\r?\n|,/).map((item) => item.trim()).filter((item) => item !== '')
    return items.length ? items : undefined
  }
  return {
    action,
    ...(list(args.pathsText) === undefined ? {} : { paths: list(args.pathsText) }),
    ...(list(args.crashuSourcesText) === undefined ? {} : { crashuSourcePaths: list(args.crashuSourcesText) }),
    ...(list(args.blacklistKeywordsText) === undefined ? {} : { blacklistKeywords: list(args.blacklistKeywordsText) }),
    ...(text(args.classifyMode) === undefined ? {} : { classifyMode: text(args.classifyMode) as ClassfClassifyMode }),
    ...(text(args.placementMode) === undefined ? {} : { placementMode: text(args.placementMode) as ClassfPlacementMode }),
    ...(text(args.targetDir) === undefined ? {} : { targetDir: text(args.targetDir) }),
    ...(text(args.transferMode) === undefined ? {} : { transferMode: text(args.transferMode) as ClassfTransferMode }),
    ...(text(args.existingPolicy) === undefined ? {} : { existingPolicy: text(args.existingPolicy) as ClassfExistingPolicy }),
    ...(text(args.workItemMode) === undefined ? {} : { workItemMode: text(args.workItemMode) as ClassfWorkItemMode }),
    ...(queue(args.alreadyEnabled) === undefined ? {} : { alreadyEnabled: queue(args.alreadyEnabled) }),
    ...(queue(args.waitEnabled) === undefined ? {} : { waitEnabled: queue(args.waitEnabled) }),
    ...(queue(args.delEnabled) === undefined ? {} : { delEnabled: queue(args.delEnabled) }),
    ...(queue(args.dryRun) === undefined ? {} : { dryRun: queue(args.dryRun) }),
    ...(queue(args.sameaGroupAlreadyEnabled) === undefined ? {} : { sameaGroupAlreadyEnabled: queue(args.sameaGroupAlreadyEnabled) }),
    ...(queue(args.sameaGroupWaitEnabled) === undefined ? {} : { sameaGroupWaitEnabled: queue(args.sameaGroupWaitEnabled) }),
    ...(queue(args.sameaGroupDelEnabled) === undefined ? {} : { sameaGroupDelEnabled: queue(args.sameaGroupDelEnabled) }),
    ...(groupMin === undefined ? {} : { sameaGroupMinOccurrences: groupMin }),
    // ↓ 上游那几条 legacy / SameA 细调 flag 的对应槽位（`:96-105`），给了才传，
    //   没给就留内核默认（`clamp01` 对非有限值回 0.6 那一格也就不会被触发）。
    ...(num(args.similarity) === undefined ? {} : { crashuSimilarityThreshold: num(args.similarity) }),
    ...(num(args.sameaMin) === undefined ? {} : { sameaMinOccurrences: num(args.sameaMin) }),
    ...(queue(args.sameaCentralize) === undefined ? {} : { sameaCentralize: queue(args.sameaCentralize) }),
    ...(queue(args.sameaIgnorePathBlacklist) === undefined ? {} : { sameaIgnorePathBlacklist: queue(args.sameaIgnorePathBlacklist) }),
    ...(queue(args.sameaGroup) === undefined ? {} : { sameaGroupEnabled: queue(args.sameaGroup) }),
    ...(queue(args.sameaGroupCentralize) === undefined ? {} : { sameaGroupCentralize: queue(args.sameaGroupCentralize) }),
  } satisfies ClassfInput
}

/**
 * 内核那句"缺缝"的判定：两条文案都只有一份（`src/platform.ts` 的常量），
 * 这里比对常量本身而不是比对关键字，所以文案改写也不会把这条判据漂掉。
 */
function isSeamRefusal (message: string): boolean {
  return message === SIBLING_KERNEL_UNWIRED || message === CLIPBOARD_UNWIRED
    || message.startsWith(SIBLING_KERNEL_UNWIRED) || message.startsWith(CLIPBOARD_UNWIRED)
}

async function runAction (action: ClassfAction, args: CliArgs, host: CliHost): Promise<ClassfResult> {
  if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${CLI_NAME}: "${action}" 不在 package.json#xaihi.node.actions 里`)
  }
  const result = await runClassf(inputFromArgs(action, args), createNodeClassfRuntime())
  const refused = result.success === false && isSeamRefusal(result.message)
  // 缺缝 ⇒ 退出码 2（"这台环境跑不了这一条"，与 G1 的 logx 同一口径）；
  // 真跑过但条目失败 ⇒ 上游的退出码 1（`cli.ts:124`）。
  process.exitCode = refused ? 2 : result.success ? 0 : 1
  if (args.json === true) {
    writeJson(host, { node: 'classf', action, executed: !refused, ...result, ...(refused ? { refused: result.message } : {}) })
    return result
  }
  writeLine(host, result.message)
  for (const item of result.data?.items.slice(0, PLAN_LINES) ?? []) {
    writeLine(host, `${item.status}\t${item.stage}\t${item.sourceName}\t->\t${item.targetRelative}`)
  }
  if ((result.data?.items.length ?? 0) > PLAN_LINES) {
    writeLine(host, `... ${String((result.data?.items.length ?? 0) - PLAN_LINES)} more`)
  }
  return result
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包，并且**不做任何参数校验**——
 * 未接的功能先报"缺参"会把"这块没搬"说成"你参数没给对"。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} plan --paths-text <根目录> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/classf/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/classf/src/interaction.ts`），本包不引它'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板（宿主里的 classf 工具）；本包不 inject \`ctx.commands\`，所以也没有 /classf 那条腿（G7）。`)
  process.exitCode = 2
}

/** argv[1] 与本模块经 realpath 后是否同指一个文件：npm 装出的 bin 软链（`…/bin/<id>`）
 * 解析到真身后点亮；聚合 CLI 引本模块时 argv[1] 是它自己的入口，比对失败不点亮。 */
function sameRealpathAsSelf (entry: string): boolean {
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

/**
 * 自执行闸门：`argv[1]` 经 realpath 后与本模块同指一个文件才点亮。
 * 2026-10-07 之前这里用的是 `/\bcli\.[cm]?[jt]s$/` 正则匹配裸 `argv[1]`——而 npm
 * 装出的 bin 是以节点 id 命名的软链（`…/bin/<id>`），正则不匹配，实机
 * `npm i -g file:` 后 `bin/<id> --help` 静默 rc=0（阳性对照：真路径
 * `node lib/cli.js --help` 正常）。上游 sleept 原用 `pathToFileURL(argv[1]).href`
 * 比较，本仓按同一条比较形状补上 realpath：bin 软链直跑点亮；聚合 CLI 引本模块
 * 时 argv[1] 是它自己的入口，不点亮。
 */
const entry = process.argv[1]
if (entry !== undefined && sameRealpathAsSelf(entry)) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
