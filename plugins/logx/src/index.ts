/**
 * logx 的宿主半边：读一批结构化日志，然后按五种分析模式回答。
 *
 * 三件事各自归位：
 * - **查询、聚合、会话摘要、16 格异常热力**在 `core.ts`（逐字移植的纯内核）；
 * - **读文件**在 `fs.ts`：一律经 DSH 的 `ctx.fs`，本包不自己 `node:fs`；
 * - **目录从哪来**在 `Config.logDir`（ADR-0013：配置只有 DSH 标准面这一个出口）。
 *
 * 五个动作都是只读（清单里 `danger.type` 就是 `none`），所以没有批准缝：
 * `docs/service-mapping.md` 的 `approval` 那一行只在有副作用的动作上才需要。
 *
 * 定义只有一份真源：`package.json#xaihi.node`（词表照 `node-definitions/logx.json`）。
 *
 * @module xaihi-logx
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import type { LogxAction, LogxData, LogxInput } from './core.ts'
import { runLogx } from './core.ts'
import { createFsLogxRuntime } from './fs.ts'

export const name = '@hibernalglow/xaihi-logx'

export const inject = ['tools', 'fs']

export interface Config {
  /** 日志目录。没配就拒绝动手——上游那套"环境变量 + 平台默认路径"在 Xaihi 没有出口。 */
  logDir: Volatile<string>
  /** 结果前缀标签，用于验证配置真的在使用点被读到。 */
  label: Volatile<string>
}

export const Config = Schema.object({
  logDir: Schema.string().default('').volatile(),
  label: Schema.string().default('logx').volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition (): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/** 字段值 → 内核入参（`inputBindings` 已经按 slot 绑好并做过 transform）。
 *  内核那份 `LogxInput`（`core.ts:6-18`，逐字从上游搬来）的可选属性在
 *  `exactOptionalPropertyTypes` 下只认"没有这个键"，不认"键在、值为 undefined"，
 *  所以空字段一律收成没有那个键。语义与上游一致：`normalizeLogxInput` 的 `clean()`
 *  （`core.ts:173-176`）本来就把空白读成 `undefined`。
 *  `directory` 可以由接线方覆盖（宿主侧的 `Config.logDir` 就是从这里进来的）。 */
function inputFrom (action: LogxAction, inputs: Record<string, unknown>, directoryOverride?: string): LogxInput {
  const directory = directoryOverride ?? optionalText(inputs.directory)
  const minimumSeverity = optionalText(inputs.minimumSeverity) as LogxInput['minimumSeverity']
  const scope = optionalText(inputs.scope)
  const eventName = optionalText(inputs.eventName)
  const sessionId = optionalText(inputs.sessionId)
  const search = optionalText(inputs.search)
  const since = optionalText(inputs.since)
  const until = optionalText(inputs.until)
  const limit = typeof inputs.limit === 'number' ? inputs.limit : undefined
  const order = optionalText(inputs.order) as LogxInput['order']
  return {
    action,
    ...(directory === undefined ? {} : { directory }),
    ...(minimumSeverity === undefined ? {} : { minimumSeverity }),
    ...(scope === undefined ? {} : { scope }),
    ...(eventName === undefined ? {} : { eventName }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(search === undefined ? {} : { search }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    ...(limit === undefined ? {} : { limit }),
    ...(order === undefined ? {} : { order }),
  }
}

function optionalText (value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? undefined : text
}

/** 每个动作回给模型的那一屏文本，逐条对照上游 `cli.ts:46` 的输出选择。 */
function render (action: LogxAction, data: LogxData): string[] {
  if (action === 'sessions') {
    return data.sessions.map((row) => `${row.startedAt}  ${String(row.eventCount).padStart(6)}  ${String(row.errorCount).padStart(4)} errors  ${row.id}`)
  }
  if (action === 'stats') {
    return [
      `total=${String(data.aggregate.total)}`,
      ...Object.entries(data.aggregate.bySeverity).map(([severity, count]) => `${severity}=${String(count)}`),
      `eventsPerSecond=${data.telemetry.eventsPerSecond.toFixed(3)} stormIntensity=${data.telemetry.stormIntensity.toFixed(3)} durationMs=${String(data.telemetry.durationMs)}`,
    ]
  }
  if (action === 'errors') {
    return data.aggregate.errors.map((row) => `${String(row.count).padStart(6)}  ${row.fingerprint}`)
  }
  if (action === 'doctor') {
    return [
      `directory: ${data.directory}`,
      `files: ${String(data.files.length)}`,
      `events: ${String(data.matchedCount)}`,
      ...data.issues.map((issue) => `ISSUE ${issue.file}:${String(issue.lineNumber)} ${issue.code} ${issue.message}`),
    ]
  }
  return data.events.map((event) =>
    `${event.timestamp}  ${event.severityText.toUpperCase().padEnd(5)}  ${event.scope.name}  ${event.eventName}${event.body === undefined ? '' : `  ${event.body}`}`)
}

export function apply (ctx: Context, config: Config): void {
  // 每次调用现取：`ctx.fs` 的后端由宿主装配，插件侧只在真要读的时候才用它。
  const runtime = () => createFsLogxRuntime(ctx.fs, process.cwd())

  const run = async (action: LogxAction, inputs: Record<string, unknown>, op: OperationRun): Promise<string> => {
    const directory = optionalText(inputs.directory) ?? optionalText(config.logDir.get())
    // 目录的来路只有两条：字段 `directory`，或宿主侧 `Config.logDir`（ADR-0013）。
    // 两边都没给时**不带这个键**，`src/fs.ts:45-46` 会拒绝猜一个位置。
    const result = await runLogx(inputFrom(action, inputs, directory), runtime(), (event) => {
      // 内核的三档进度（15% 读盘 / 60% 查询 / 100% 完成）进账本的 `progress`，
      // 那句话同时进 `preview`，面板才说得出"卡在哪一步"。
      if (event.type === 'progress') op.progress({ done: event.progress ?? 0 })
      if (event.message.trim() !== '') op.preview({ message: event.message })
    })
    if (result.data === undefined) throw new Error(`logx: ${result.message}`)
    // `result.data.action` 就是内核归一化后的那个动作（`core.ts:71` 的 `input.action ?? "query"`，
    // 而这里传进 `inputFrom` 的 `action` 本来就是同一个值），所以载荷里不必也没有第二个 `action`：
    // 先前那句 `{ action, ...result.data }` 里前者总被后者盖掉（TS2783），写出来只是误导。
    op.resultView({ ...result.data })
    // `success:false` 在这里的含义是"源日志里有解析不了的行"（`core.ts:154`），
    // 不是"这次没跑成"：`doctor` 这个动作就是专门去报这些行的，把它炸掉等于
    // 让唯一的完整性检查在唯一需要它的场景里失败。所以如实标出来，但照常返回结果。
    const lines = [`${config.label.get()} · ${result.message}`, ...render(action, result.data)]
    if (!result.success) lines.push('PROBLEM: some source lines were unreadable; the ISSUE lines above say which')
    return lines.join('\n')
  }

  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空，所以每次调用现取。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async query ({ inputs, run: op }) {
        return run('query', inputs, op)
      },
      async sessions ({ inputs, run: op }) {
        return run('sessions', inputs, op)
      },
      async stats ({ inputs, run: op }) {
        return run('stats', inputs, op)
      },
      async errors ({ inputs, run: op }) {
        return run('errors', inputs, op)
      },
      async doctor ({ inputs, run: op }) {
        return run('doctor', inputs, op)
      },
    },
  })
}
