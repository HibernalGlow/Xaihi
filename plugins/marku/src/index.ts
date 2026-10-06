/**
 * marku 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `markdown-transforms.ts` / `markdown-ast.ts` / `workflow.ts`）是从
 * `noxide` 基线逐字搬来的（556 / 101 / 93 / 180 行），`core.ts` 的差异恰好只有第 1 行那条
 * import（台账写在它自己的文件头）。所以这一侧只做四件事：把表单值绑成 `MarkuInput`、
 * 把内核的过程事件接到运行账本、把结果发给 `result_view`、把危险动作交给 DSH 的审批缝。
 * 不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/marku.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝（内核只认 `MarkuRuntime` 那 10 个方法，`core.ts:96-107`）→ 落点对照，判据见
 * `docs/service-mapping.md` 与 ADR-0003 / ADR-0013：
 * - `pathInfo` / `listDir` / `readText` / `writeText` → `src/platform.ts` 的 `node:fs/promises`。
 *   不走 `ctx.fs`：那条缝面向模型发起的工具调用，要求不透明 `FsTarget` 且禁止解析路径，
 *   而本内核要 `resolve`、`join`、`dirname`、要下降目录（ADR-0003 决定 1，dissolvef/crashu 先例）。
 *   权限边界因此靠**动作分级**：`run` + `dryRun=false`、`undo` 在定义里是 `danger.all`，
 *   `defineNode` 把它变成 `tools/pre-execute` 的 `ask`，审批与审计走 DSH 的 `approval` 缝。
 * - `join` / `dirname` / `basename` → `node:path`（同一份 `src/platform.ts`）。
 * - `now` / `randomId` → `new Date()` 与全局 `crypto`（Node 22+ 自带，不引 `node:crypto`）。
 * - `defaultHistoryPath` → **响亮拒绝**：基线把它算在 `xiranite.config.toml` 旁边，那条通路
 *   整块不接（ADR-0013），DSH 也没有"每插件数据目录"这个 API（ADR-0003）⇒ 路径只从
 *   `Config.historyPath` 来，没配就在**动手之前**拒绝（下面 `journalGate()`）。
 * - 外部程序 → 本节点**一个都不调**，所以不 `inject` `subprocess`。上游 `platform.ts` 里唯一
 *   碰 `node:child_process` 的 `readClipboardText()` 只服务 `guided` 腿，那条腿在本包是未接面
 *   （缺口就是台账里已经记着的 **G5**，与 `crashu` 报的同一条）。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；DSH 的 `tools`
 *   只有单次输出缝，没有"同一运行的中间态流"）。账本缺席时 `defineNode` 会 `console.warn`
 *   并把进度降级成无操作，节点仍能脱离工作台单独装。
 * - 宿主侧无模型入口 `/marku` → **不注册**：`inject` 里只有 `tools`，没有 `commands`。
 *   按台账 **G7** 的口径，`src/help.ts` 因此**不传** `command`，只传 `bin: 'xmarku'`。
 *
 * 未出货的动作也要说清楚：`core.ts` 支持 5 个动作（`MarkuAction` 里有 `workflow`），
 * 而 `node-definitions/marku.json` 的 `actions` 只声明 4 条（`text` / `run` / `history` / `undo`）
 * ⇒ 宿主面上没有 `marku_workflow` 这个工具，这里也**不替它造第 5 条动作**（那是发明词表）。
 * `workflow` 那条腿只有终端面 `xmarku workflow` 走得到，而它的 `--name`（从配置里的
 * `workflowLibrary` 找命名工作流）按台账 **G2** 拒绝：bin 够不到 settings 缝。
 *
 * @module xaihi-marku
 */

import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { isMarkuModuleId, runMarku, MARKU_MODULES, type MarkuAction, type MarkuData, type MarkuInput, type MarkuModuleId, type MarkuResult } from './core.ts'
import { createNodeMarkuRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-marku'

/** 只有 `tools`：本节点不调外部程序（`subprocess`）、不注册斜杠命令（`commands`，见 G7）。 */
export const inject = ['tools']

/**
 * 结果列表的行数上限来自上游终端面 `cli.ts:437`（diffs）与 `cli.ts:452`（history）的
 * `slice(0, 20)`，不在这里另定一个数；`history` 动作那 **20 条**是内核自己算的
 * （`core.ts:420`），这里不重复裁。
 */
const RESULT_LINES = 20

/** 内核认得的模块 id；别的值一律当"没给"，落回内核默认（上游 `cli.ts:473-475` 的 `isMarkuModule`）。 */
const MODULE_IDS = MARKU_MODULES.map((module) => module.id) as readonly MarkuModuleId[]

export interface Config {
  /**
   * 撤销账本 JSON 的路径。这三个默认值上游住在 `xiranite.config.toml` 的 `[nodes.marku]`
   * （`history_path` / `enable_undo` / `default_module`，见上游 `cli.ts:62-69` 的
   * `MarkuNodeConfig` 与 `:87-105` 的 `resolveMarkuDefaults`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置住在后端一个 toml 里"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * 空串 = **没配** ⇒ 会写盘的动作在动手之前拒绝（ADR-0003 决定 2），不是"写到没人知道的地方"。
   */
  historyPath: Volatile<string>
  /** 上游 `enable_undo`（默认 true）：写盘时是否记撤销账本。 */
  enableUndo: Volatile<boolean>
  /** 上游 `default_module`：表单没选模块时用它；非法 id 当"没给"，落回内核的 `markt`。 */
  defaultModule: Volatile<string>
}

export const Config = Schema.object({
  historyPath: Schema.string().default('').volatile(),
  enableUndo: Schema.boolean().default(true).volatile(),
  defaultModule: Schema.string().default('').volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * `paths` 字段在两个面上拿到的形状不一样：工具面（`defineNode` 的 `fieldProperty` 对 `text`
 * 给的是字符串）给字符串，宿主里的多选控件给数组。清单里上游声明的绑定是
 * `paths → delimited`（只切逗号），而上游 `interaction.ts` 的 `split()` 切 `[;\r\n]+`、
 * 上游 `cli.ts:459-461` 的 `splitArg` 切 `[,;\r\n]`。接线层按**上游的三种分隔符**收，
 * 清单仍是上游那份声明（落差与 `crashu` / `samea` / `timeu` 记的是同一条：SDK 的
 * `delimited` 只认逗号）。
 */
function pathsOf(args: Record<string, unknown>, inputs: Record<string, unknown>): string[] {
  const raw = args.paths
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  const bound = inputs.paths
  if (Array.isArray(bound)) return bound.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  return String(bound ?? '').split(/[,;\r\n]/).map((item) => item.trim()).filter((item) => item !== '')
}

/**
 * 上游 `cli.ts:463-471` 的 `parseConfig` 逐字：只接受 JSON 对象，数组与解析失败都当 `{}`。
 * `stepConfig` 在清单里是文本字段（默认 `"{}"`），绑定 `identity` 原样递给内核，
 * 所以 JSON 字符串必须在这里解；面板若已经给了对象就照对象走。
 */
function parseConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (!String(value ?? '').trim()) return {}
  try {
    const parsed = JSON.parse(String(value)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * 布尔槽位：**没给就不要给**。
 *
 * SDK 的 `asBoolean` 对缺失值给 `false`，而 marku 内核的两个默认值是 `dryRun: true`
 * （`core.ts:132`）与 `enableUndo: true`（`:133`）——照抄 `crashu` 那句
 * `inputs.dryRun === true` 会把"模型没填预演"读成"真写盘"，方向正好相反。
 */
function booleanSlot(args: Record<string, unknown>, inputs: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return args[key] === undefined ? fallback : inputs[key] === true
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由**处理器身份**给（一个动作一个工具），不吃 `inputs.action`：定义里 `action`
 * 是 `isActionSelector`，它的职责是决定哪个工具被调用。
 */
function inputFrom(action: MarkuAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): MarkuInput {
  const declaredModule = String(inputs.module ?? '').trim()
  const configuredModule = config.defaultModule.get().trim()
  const historyPath = String(inputs.historyPath ?? '').trim() || config.historyPath.get()
  return {
    action,
    // 内核自己会对非法 id 报 `Unknown module: <id>`（`core.ts:149`）；这里只在**两个来源都非法**
    // 时不填，让内核那句 `?? "markt"` 落地，不复制上游 bin 那句"非法就当 markt"的静默改写。
    ...(MODULE_IDS.includes(declaredModule as MarkuModuleId)
      ? { module: declaredModule as MarkuModuleId }
      : MODULE_IDS.includes(configuredModule as MarkuModuleId)
        ? { module: configuredModule as MarkuModuleId }
        : {}),
    paths: pathsOf(args, inputs),
    inputText: String(inputs.inputText ?? ''),
    stepConfig: parseConfig(inputs.stepConfig),
    recursive: booleanSlot(args, inputs, 'recursive', false),
    dryRun: booleanSlot(args, inputs, 'dryRun', true),
    enableUndo: booleanSlot(args, inputs, 'enableUndo', config.enableUndo.get()),
    ...(historyPath === '' ? {} : { historyPath }),
    undoId: String(inputs.undoId ?? ''),
  }
}

/**
 * "这一腿会不会碰账本"的闸门（ADR-0003 决定 2）：动手之前就拒绝，而不是等
 * `runtime.defaultHistoryPath()` 在写完盘之后才抛。三种情形各给一条**点名到配置**的话：
 * - `history` / `undo`：没路径就无从读、无从撤销 ⇒ 一律拒。
 * - `run` 且要真写（`dryRun` 为假）**且** `enableUndo` 为真：账本是唯一的回退手段 ⇒ 拒。
 *   `enableUndo` 被显式关掉时不拦——那是上游自己允许的形状（`core.ts:186` 的三元条件），
 *   拦了就是替使用者发明一条新拒绝。
 */
function journalGate(input: MarkuInput, historyPath: string): string | null {
  if (historyPath !== '') return null
  if (input.action === 'history') return 'marku: config.historyPath is unset, so there is no undo journal to read'
  if (input.action === 'undo') return 'marku: config.historyPath is unset, nothing to undo against'
  if (input.action === 'run' && input.dryRun === false && input.enableUndo !== false) {
    return 'marku: config.historyPath is unset, refusing to write Markdown without an undo journal'
  }
  return null
}

/** runtime 的构造：把配置里那条路径的**目录**交给 `platform.ts`（它只负责拼文件名）。 */
function runtimeFor(historyPath: string) {
  return createNodeMarkuRuntime(historyPath === '' ? {} : { historyDir: dirname(historyPath) })
}

/**
 * 内核事件 → 运行账本。**单位**：marku 内核的 `progress` 是百分数（`run` 腿 10 → 10+80·占比 → 100，
 * `workflow` 腿 5 → 5+75·占比 → 80+20·占比 → 100，`undo` 腿 `index / max · 100`），
 * 直接当 `done / total = 100` 用，不许照抄 `dissolvef` 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：计数 + 每文件 diff + 撤销历史 + 错误，全是内核已经算好的字段，这里不重算。
 * 两个 `slice(0, 20)` 抄的是上游终端面的读数上限（`cli.ts:437` / `:452`）。
 */
function viewOf(data: MarkuData | undefined) {
  return {
    filesProcessed: data?.filesProcessed ?? 0,
    filesChanged: data?.filesChanged ?? 0,
    outputText: data?.outputText ?? '',
    diffText: data?.diffText ?? '',
    undoId: data?.undoId ?? '',
    errors: data?.errors ?? [],
    diffs: (data?.diffs ?? []).slice(0, RESULT_LINES),
    history: (data?.history ?? []).slice(0, RESULT_LINES),
    workflow: data?.workflow === undefined
      ? undefined
      : {
          workflowId: data.workflow.workflowId,
          workflowName: data.workflow.workflowName,
          stepCount: data.workflow.stepCount,
          sources: data.workflow.sources.map((source) => ({
            sourceLabel: source.sourceLabel,
            changed: source.outputText !== source.originalText,
            error: source.error ?? '',
          })),
        },
  }
}

/**
 * 工具输出：一句结论 + 计数行 + 最多 20 条（列名照上游 `cli.ts:434` / `:439` / `:454` 打印的
 * `files:` / `changed:` / `changed|same <file>` / `<active|undone> <id> <module> <n> file(s)`）。
 */
function summarize(result: MarkuResult): string {
  const data = result.data
  const lines: string[] = [result.message]
  if (data === undefined) return lines.join('\n')

  if (data.filesProcessed > 0 || data.diffs.length > 0) {
    lines.push(`files: ${String(data.filesProcessed)}  changed: ${String(data.filesChanged)}`)
    for (const diff of data.diffs.slice(0, RESULT_LINES)) {
      lines.push(`${diff.changed ? 'changed' : 'same'} ${diff.file}`)
    }
    const rest = data.diffs.length - RESULT_LINES
    if (rest > 0) lines.push(`... ${String(rest)} more file(s)`)
  }
  if (data.outputText !== '' && data.outputText !== data.inputText) {
    lines.push(`output:\n${data.outputText}`)
  }
  if (data.history.length > 0) {
    lines.push('Undo history:')
    for (const record of data.history.slice(0, RESULT_LINES)) {
      lines.push(`${record.undone ? 'undone' : 'active'} ${record.id} ${record.module} ${String(record.files.length)} file(s)`)
    }
  }
  if (data.errors.length > 0) lines.push(`errors: ${data.errors.join(' | ')}`)
  return lines.filter((line) => line !== '').join('\n')
}

/** 动作共用的一条腿：查闸门、跑内核、接账本、发结果视图、失败就抛。 */
async function call(action: MarkuAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  const input = inputFrom(action, args, inputs, config)
  const refusal = journalGate(input, String(input.historyPath ?? ''))
  if (refusal !== null) throw new Error(refusal)
  const result = await runMarku(input, runtimeFor(String(input.historyPath ?? '')), (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核用 `success` 表达"这一腿失败了"（`No Markdown files found.`、`Write failed at …` 等等），
  // 视图先发出去（那是读回现场的唯一入口），再把失败原样抛出去，不咽成一次成功输出。
  if (!result.success) throw new Error(`marku ${action}: ${result.message}`)
  return summarize(result)
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async text({ args, inputs, run }) {
        return call('text', args, inputs, run, config)
      },
      async run({ args, inputs, run }) {
        return call('run', args, inputs, run, config)
      },
      async history({ args, inputs, run }) {
        return call('history', args, inputs, run, config)
      },
      async undo({ args, inputs, run }) {
        return call('undo', args, inputs, run, config)
      },
    },
  })
}
