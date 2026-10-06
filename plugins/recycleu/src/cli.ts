#!/usr/bin/env node
/**
 * recycleu 的终端面，对照 `<Xiranite>` tag `noxide` 的 `packages/nodes/recycleu/src/cli.ts`。
 *
 * 保留的东西：子命令名 `status / clean / start`（上游 `parseAction` 那三个入口，
 * `clean` 是 `clean_now` 的别名，`cli.ts:186-191`）、flag 名 `--drive --interval --cycles
 * --json`（`cli.ts:166`）、`RECYCLEU_CYCLES_HELP` 那句原话、`status` 的输出形状
 * （`writeJson(host, result)` 就是 `{success,message,data}`，`cli.ts:151`），以及
 * "status 不碰回收站"这条判据（上游 `cli.test.ts:80-88` 钉的是 `emptyRecycleBin` 没被调用）。
 *
 * 两处偏离，都写在能看见的地方：
 * 1. **配置那一半没了**：上游从 `xiranite.config.toml` 的 `[nodes.recycleu]` 读默认值
 *    （`loadNodeConfigWithHints`，`cli.ts:176-184`）。按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，Xaihi 没有"配置文件在 cwd 旁边"
 *    这一层，那些默认值只在宿主进程的 `Config` / 清单字段缺省里读得到，独立 bin 读不到，
 *    所以这里只回落到 `core.ts` 自己的缺省（10 与 360，就是上游 `cli.ts:145-146` 写的那两个数）。
 * 2. **参数校验挪到拒绝之后**：上游 `parseInteger` 会先炸
 *    `--interval must be an integer of at least 5.`。但 `clean` / `start` 这两条在本包
 *    现在是**未接**的（执行要 `ctx.subprocess`），先报参数错会把"这块内核没接上"这个事实
 *    盖掉——同一类误导在 `plugins/sleept/src/cli.ts` 的 `at` 上刚被改掉（判据见其 174-178 行）。
 *    所以现在：拒绝（退出码 2，点名缺的缝）在前，参数问题只作为"计划不完整"附一句。
 *
 * 未接的第二条腿：上游的 `ui`（OpenTUI 的 `Tui.tsx`）与 `gd`/`guided`（@clack 的
 * `interaction.ts`）都不随本包发布，理由与出处见 `src/cli-support.ts` 顶部。
 *
 * @module xaihi-recycleu/cli
 */

import { DEFAULT_RECYCLEU_STATE, runRecycleu, type RecycleuRuntime } from './core.ts'
import { CANCELLATION_GAP, planRecycleuEmpty } from './exec.ts'
import {
  createCliHost,
  defineCommand,
  nodeCliName,
  rich,
  runNodeCliFace,
  runPipeProgram,
  terminalColumns,
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
} from './cli-support.ts'
import type { CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'

const CLI_NAME = nodeCliName('recycleu')

/** 上游导出的同一句话（`cli.ts:18`），`cli.test.ts:98-100` 就是拿它做判据的。 */
export const RECYCLEU_CYCLES_HELP = 'Maximum clean cycles; use 0 for unlimited.'

/**
 * 只有 `status` 这条腿在这里真的能跑：内核的 `status` 分支在碰到回收站之前就返回
 * （`core.ts:74-80`）。执行用的 runtime 因此故意把 `emptyRecycleBin` 装成"一碰就抛"——
 * 终端面要是哪天悄悄清了回收站，先炸的是这里，不是使用者的盘。
 */
function readOnlyRuntime (): RecycleuRuntime {
  return {
    now: () => new Date(),
    sleep: async () => undefined,
    emptyRecycleBin: async () => {
      throw new Error('recycleu: the terminal face must never reach the recycle bin')
    },
  }
}

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Recycle bin cleaner: read status on the terminal face, empty it on the host face.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

/** 派发形状对齐上游的 `runInteractionCli`（见 cli-support 末尾）。 */
export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI 的 `Tui.tsx`）与引导流（@clack 的 `interaction.ts`）'
      + '都不随本包发布，而清空回收站这一半本来就只活在宿主进程里（`ctx.subprocess` + DSH 的批准缝）。',
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Recycle bin cleanup CLI: status here, execution on the host face.' },
    subCommands: {
      'ui': defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.（未接）' },
        args: {
          renderer: { type: 'string', description: 'opentui.' },
          lang: { type: 'string', description: 'en or zh.' },
          theme: { type: 'string', description: 'default, dracula, or high-contrast.' },
        },
        async run () {
          await runProgram(['ui'], host)
        },
      }),
      'gd': defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.（未接）' },
        async run () {
          await runProgram(['gd'], host)
        },
      }),
      'guided': defineCommand({
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runProgram(['guided'], host)
        },
      }),
      status: defineCommand({
        meta: { name: 'status', description: 'Report the cleaner state without touching the bin.' },
        args: { json: { type: 'boolean', description: 'Print JSON result.' } },
        async run ({ args }) {
          await runStatus(Boolean(args.json), host)
        },
      }),
      clean: defineCommand({
        meta: { name: 'clean', description: 'Empty the recycle bin once.（未接：要 ctx.subprocess + 批准）' },
        args: {
          drive: { type: 'string', description: 'Drive letter, e.g. C. Blank means every bin.' },
          json: { type: 'boolean', description: 'Print JSON result.' },
        },
        async run ({ args }) {
          await runUnwired('clean_now', 'clean', text(args.drive), undefined, undefined, Boolean(args.json), host)
        },
      }),
      start: defineCommand({
        meta: { name: 'start', description: 'Auto-clean on a bounded schedule.（未接：要 ctx.subprocess + 取消缝）' },
        args: {
          drive: { type: 'string', description: 'Drive letter, e.g. C. Blank means every bin.' },
          interval: { type: 'string', description: 'Interval in seconds (integer >= 5).' },
          cycles: { type: 'string', description: RECYCLEU_CYCLES_HELP },
          json: { type: 'boolean', description: 'Print JSON result.' },
        },
        async run ({ args }) {
          await runUnwired('start', 'start', text(args.drive), args.interval, args.cycles, Boolean(args.json), host)
        },
      }),
    },
  })
}

function text (value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** `status` 是真跑的：内核那条分支不发任何外部命令，所以这里能给出真答案。 */
async function runStatus (json: boolean, host: CliHost): Promise<void> {
  const result = await runRecycleu({ action: 'status' }, readOnlyRuntime(), undefined, DEFAULT_RECYCLEU_STATE)
  if (json) {
    writeJson(host, result)
    if (!result.success) process.exitCode = 1
    return
  }
  writeLine(host, result.message)
  if (!result.success) process.exitCode = 1
}

/**
 * `clean` / `start`：算出要发的命令给你看，然后拒绝执行（退出码 2）。
 *
 * 拒绝理由点名两件事：执行缝（`ctx.subprocess`，`src/exec.ts`）与批准缝
 * （清单里 `danger.actionIn` 把 `clean_now` / `start` 标成危险，
 * `node-definitions/recycleu.json` 的 `dangerPrompt.body` 说的是"之后无法再从 Windows
 * 恢复其中的文件"——bin 直接执行等于绕过批准）。
 */
async function runUnwired (
  action: 'clean_now' | 'start',
  commandName: string,
  drive: string | undefined,
  rawInterval: string | boolean | undefined,
  rawCycles: string | boolean | undefined,
  json: boolean,
  host: CliHost,
): Promise<void> {
  const plannedCommand = drive === undefined ? planRecycleuEmpty(undefined) : planRecycleuEmpty(drive)
  const argv = plannedCommand?.argv
  const notes: string[] = []
  if (drive !== undefined && argv === undefined) {
    notes.push(`--drive "${drive}" 不是单个盘符，内核会回 status: failed（这里只记账，不改退出码）`)
  }
  const interval = numberOr(rawInterval, notes, '--interval')
  const cycles = numberOr(rawCycles, notes, '--cycles')
  if (action === 'start' && cycles === 0) {
    notes.push(`--cycles 0（跑到手动取消）额外缺一条缝：${CANCELLATION_GAP}`)
  }
  // 非 Windows 不是"这台机器失败了"，是"这件事在这里不存在"：上游回的是
  // `status:"unsupported"`（`src/exec.ts` 里那句原文），所以这里只附一句、不改退出码。
  if (process.platform !== 'win32') {
    notes.push(`本机是 ${process.platform}：内核会直接回 status "unsupported"，连命令都不发`)
  }
  const reason = '本包的执行一律走 DSH 的 `ctx.subprocess`（`src/exec.ts`），而清空回收站被清单标成危险动作'
    + '（`danger.actionIn`），批准缝在 DSH 的 approval 里：独立 bin 既拿不到那条缝，直接执行等于绕过批准。'
    + '无模型的入口请用宿主侧的工具 `recycleu_clean_now` / `recycleu_start`。'

  if (json) {
    writeJson(host, {
      action,
      platform: process.platform,
      planned: argv === undefined ? [] : [[...argv]],
      interval,
      cycles,
      executed: false,
      refused: reason,
      ...(notes.length === 0 ? {} : { notes }),
    })
    writeError(host, `${CLI_NAME} ${commandName} 未接：${reason}`)
    process.exitCode = 2
    return
  }

  const columns = terminalColumns(host)
  const lines = argv === undefined
    ? [`${rich(host, '命令', 'cyan')}  （盘符不合法，内核这次不会发命令）`]
    : [`${rich(host, '命令', 'cyan')}  ${argv.join(' ')}`]
  if (action === 'start') {
    lines.push(`${rich(host, '周期', 'cyan')}  interval=${String(interval ?? '（缺省 10）')} cycles=${String(cycles ?? '（缺省 360）')}`)
    lines.push(`${rich(host, '生命周期', 'cyan')}  长驻，靠宿主的 terminate / 取消收尾`)
  }
  for (const note of notes) lines.push(`${rich(host, '注意', 'yellow')}  ${note}`)
  writeRichPanel(host, `${CLI_NAME} · 只规划，未执行`, lines, {
    color: 'blue',
    maxWidth: columns - 2,
    minWidth: Math.min(76, columns - 6),
  })
  writeError(host, `${CLI_NAME} ${commandName} 未接：${reason}`)
  process.exitCode = 2
}

function numberOr (value: string | boolean | undefined, notes: string[], flag: string): number | undefined {
  if (value === undefined || value === false) return undefined
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    notes.push(`${flag} "${value}" 不是整数，计划里按内核缺省给出`)
    return undefined
  }
  return parsed
}

/**
 * 自执行闸门：与 linedup / sleept / logx 同一写法（`cli.[cm]?[jt]s$` 正则那条）。
 */
const entry = process.argv[1] ?? ''
if (/\bcli\.[cm]?[jt]s$/.test(entry.replace(/\\/g, '/'))) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
