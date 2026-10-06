#!/usr/bin/env node
/**
 * logx 的终端面，对照 `<Xiranite>` tag `noxide` 的 `packages/nodes/logx/src/cli.ts`。
 *
 * 保留的东西：五个子命令名（`query / sessions / stats / errors / doctor`，缺省 `query`
 * 也照上游 `runDirect` 的第 32 行）、每个 flag 的名字（`--dir --level --scope --event
 * --session --search --since --until --limit --order --json`）、`--json` 的输出形状、
 * 哪几条不带 `--json` 也直接出 JSON（上游 `cli.ts:47`：`stats` 与 `doctor`；
 * `query` / `sessions` / `errors` 是 `formatRow` 的逐行文，那一半要等内核接上才谈）。
 * 非 TTY 无参时那句 `No interactive terminal detected.`（退出码 2）也照原样。
 *
 * **执行这一半未接**：本包读文件一律经 DSH 的 `ctx.fs`（`src/fs.ts` 顶部写了为什么
 * 不自己 `node:fs`），而独立 bin 不在宿主进程里，拿不到那条缝。所以终端面只做到
 * "把要跑的查询算出来给你看"（`normalizeLogxInput` / `createLogxQuery` 都是 `core.ts`
 * 里的纯函数，不在这里另写一份查询拼装），随后拒绝执行。
 * 拒绝一律是退出码 2 + 点名缺的那条缝，**不在拒绝之前做参数校验**：未接的功能先报
 * `Invalid --level` 会让使用者读到的症状变成"我参数没给对"（同一类误导在
 * `plugins/sleept/src/cli.ts` 的 `at` 上刚被改掉，判据见其 174-178 行）。
 *
 * 未接的第二条腿：上游的 `ui`（OpenTUI 全屏，`Tui.tsx`）与 `gd`/`guided`（@clack 引导流，
 * `interaction.ts`）都不随本包发布，理由与出处见 `src/cli-support.ts` 顶部。
 *
 * @module xaihi-logx/cli
 */

import { createLogxQuery, normalizeLogxInput, type LogxAction } from './core.ts'
import { LOG_SEVERITY_NUMBERS } from './logging.ts'
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
  writeRichPanel,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'

const CLI_NAME = nodeCliName('logx')

/** 本节点定义里的动作（真源 `package.json#xaihi.node.actions`），顺序照上游 `cli.ts:36`。 */
const NODE_ACTIONS: readonly LogxAction[] = ['query', 'sessions', 'stats', 'errors', 'doctor']

/** 上游 `cli.ts:32` 的缺省子命令。 */
const DEFAULT_ACTION: LogxAction = 'query'

/** 每个动作"为什么不能在这里执行"的一句话，界面与 stderr 用同一份。 */
const REFUSAL_REASON = '本包读日志目录一律走 DSH 的 `ctx.fs`（`src/fs.ts`），独立 bin 不在宿主'
  + '进程里，拿不到那条缝；目录本身还要从 `Config.logDir` 读（`docs/adr/0013-config-goes-through-dsh-settings.md`'
  + '：Xaihi 没有"配置文件在 cwd 旁边"这一层）。无模型的入口请用宿主侧的工具 `logx_query` 那组。'

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Analyze structured logs: query events, sessions, statistics, error groups, integrity.',
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
      + '都不随本包发布，而本节点的执行本来就只活在宿主进程里（`ctx.fs`）。',
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  const actionSpec = (action: LogxAction, description: string): CliCommandSpec => defineCommand({
    meta: { name: action, description },
    args: queryArgs(),
    async run ({ args }) {
      await runLogxAction(action, args, host)
    },
  })

  return defineCommand({
    meta: { name: CLI_NAME, description: 'Log analysis CLI: planned queries on the terminal face, reading on the host face.' },
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
      // 上游把缺省子命令写成 `runDirect` 里的 `const [command = "query", …]`（cli.ts:32）；
      // 本面用同一个缺省，因此根命令也接 `query`。
      [DEFAULT_ACTION]: actionSpec('query', 'Query log events and print matching envelopes.'),
      sessions: actionSpec('sessions', 'Summarize sessions by event count, error count, process types and scopes.'),
      stats: actionSpec('stats', 'Aggregate severities and report the event-rate / anomaly heatmap.'),
      errors: actionSpec('errors', 'Group error events by fingerprint.'),
      doctor: actionSpec('doctor', 'List discovered files and every line that failed to parse.'),
    },
  })
}

/** flag 名与说明逐条对照上游 `cli.ts:34`。 */
function queryArgs () {
  return {
    dir: { type: 'string', description: 'Log directory (defaults to the configured one).' },
    level: { type: 'string', description: `Minimum severity: ${Object.keys(LOG_SEVERITY_NUMBERS).join(', ')}.` },
    scope: { type: 'string', description: 'Scope name prefix filter.' },
    event: { type: 'string', description: 'Exact event name.' },
    session: { type: 'string', description: 'Session id.' },
    search: { type: 'string', description: 'Full-text search over event name, body, scope and error.' },
    since: { type: 'string', description: 'ISO lower bound.' },
    until: { type: 'string', description: 'ISO upper bound.' },
    limit: { type: 'string', description: 'Maximum events (1..5000).' },
    order: { type: 'string', description: 'asc or desc.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

interface Plan {
  action: LogxAction
  directory: string
  /** 内核这次会怎么拼查询；`undefined` 表示参数还不值得拿去问内核。 */
  query?: Record<string, unknown>
  /** 为什么没给出查询：只作为"计划不完整"说出来，不参与退出码。 */
  note?: string
}

/**
 * 把 flag 变成"将要执行的查询"。**这里不许抛**：动作本身未接，退出码必须由未接分支
 * 决定（2），不能让一次参数校验把症状改成"你少给了一个值"。
 * 归一化用的是内核自己的 `normalizeLogxInput`，所以这里看到的 clamp 与缺省就是宿主侧的。
 */
function buildPlan (action: LogxAction, args: CliArgs): Plan {
  const text = (key: string): string | undefined => {
    const value = args[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }
  const severity = text('level')
  const order = text('order')
  const notes: string[] = []
  if (severity !== undefined && !(severity in LOG_SEVERITY_NUMBERS)) {
    notes.push(`--level "${severity}" 不是可识别的级别，计划里的 minimumSeverity 用了内核缺省 trace`)
  }
  if (order !== undefined && order !== 'asc' && order !== 'desc') {
    notes.push(`--order "${order}" 不是 asc/desc，计划里的 order 用了内核缺省 desc`)
  }
  const input = {
    action,
    directory: text('dir'),
    minimumSeverity: severity !== undefined && severity in LOG_SEVERITY_NUMBERS
      ? severity as keyof typeof LOG_SEVERITY_NUMBERS
      : undefined,
    scope: text('scope'),
    eventName: text('event'),
    sessionId: text('session'),
    search: text('search'),
    since: text('since'),
    until: text('until'),
    limit: text('limit') === undefined ? undefined : Number(text('limit')),
    // 只认这两个拼法（上游 `cli.ts:39` 的 `Invalid --order` 那条校验，在这里降级成"记一句 +
    // 交给内核缺省 desc"，因为拒绝在先）；`string` 不会被 `===` 收窄成字面量类型，所以逐条给出。
    order: order === 'asc' ? 'asc' as const : order === 'desc' ? 'desc' as const : undefined,
  }
  const normalized = normalizeLogxInput(input)
  return {
    action,
    directory: normalized.directory ?? '（未给 --dir，宿主侧回落到 Config.logDir）',
    query: createLogxQuery(normalized) as unknown as Record<string, unknown>,
    ...(notes.length === 0 ? {} : { note: notes.join('；') }),
  }
}

async function runLogxAction (action: LogxAction, args: CliArgs, host: CliHost): Promise<void> {
  if (!NODE_ACTIONS.includes(action)) {
    throw new Error(`logx: action "${action}" is not in package.json#xaihi.node.actions.`)
  }
  const json = args.json === true || action === 'stats' || action === 'doctor'
  const plan = buildPlan(action, args)

  if (json) {
    writeJson(host, { ...plan, executed: false, refused: REFUSAL_REASON })
    // 拒绝那句**同时**上 stderr：上游失败的那条路也是这么把原因送到 stderr 的，与 `--json`
    // 无关（`<noxide>/packages/nodes/logx/src/cli.ts:44` 的 `if (!result.data) throw new Error(result.message)`
    // 一路冒到最后一行的 `writeError(createCliHost(), …)`）。stdout 仍是干净 JSON，
    // 因为 `writeJson` 只写 stdout——不混流。同批的 `plugins/recycleu/src/cli.ts` 的 json 分支同一形状。
    writeError(host, `${CLI_NAME} ${action} 未接：${REFUSAL_REASON}`)
    process.exitCode = 2
    return
  }

  const columns = terminalColumns(host)
  const lines = [
    `${rich(host, '动作', 'cyan')}  ${plan.action}`,
    `${rich(host, '目录', 'cyan')}  ${plan.directory}`,
    `${rich(host, '查询', 'cyan')}  ${JSON.stringify(plan.query)}`,
  ]
  if (plan.note !== undefined) lines.push(`${rich(host, '注意', 'yellow')}  ${plan.note}`)
  writeRichPanel(host, `${CLI_NAME} · 只规划，未执行`, lines, {
    color: 'blue',
    maxWidth: columns - 2,
    minWidth: Math.min(76, columns - 6),
  })
  writeError(host, `${CLI_NAME} ${action} 未接：${REFUSAL_REASON}`)
  process.exitCode = 2
}

/**
 * 自执行闸门：与 linedup / sleept / dissolvef 同一写法（`cli.[cm]?[jt]s$` 正则那条）。
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
