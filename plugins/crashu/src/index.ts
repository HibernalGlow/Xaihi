/**
 * crashu 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的（478 行 / 除剪贴板那
 * 40 行之外的全部），差异只有 import 说明符。所以这一侧只做四件事：把表单值绑成
 * `CrashuInput`、把内核的过程事件接到运行账本、把计划发给 `result_view`、把危险动作
 * 交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/crashu.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 * - `CrashuRuntime` 的 9 个方法 → `src/platform.ts`（`node:fs/promises` + `node:path`）。
 *   不走 `ctx.fs`：那条缝面向模型发起的工具调用，要求不透明 `FsTarget` 且禁止解析路径，
 *   而本内核要 `resolve`、`join`、`rename`、`rm -r`（ADR-0003 决定 1，dissolvef 先例）。
 *   权限边界因此靠**动作分级**：`move` + `dryRun=false` 在定义里是 `danger.all`，
 *   `defineNode` 把它变成 `tools/pre-execute` 的 `ask`，审批与审计走 DSH 的
 *   `approval` 缝（`docs/service-mapping.md:42-44` 实测 `dsh-user-approval` 在默认组合里）。
 * - 外部程序 → 本节点**一个都不调**，所以不 `inject` `subprocess`。上游 platform.ts 里
 *   唯一碰 `node:child_process` 的 `readClipboardText()` 只服务 `guided` 腿，那条腿在
 *   本包是响亮拒绝的未接面（见 `src/cli.ts`），缺口记为 `G-clipboard-guided`。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；
 *   DSH 的 `tools` 只有单次输出缝，没有"同一运行的中间态流"，所以这条是搬过来的，
 *   见 `docs/service-mapping.md` 的 operation stream 那一行）。账本缺席时
 *   `defineNode` 会 `console.warn` 并把进度降级成无操作，节点仍能脱离工作台单独装。
 *
 * 这里**没有**"必须显式给目的地才准动手"那道闸门（对照 `dissolvef` 的 `historyPath`）：
 * 上游 crashu 没这种闸门，它的保护是内核的 `dryRun` / `autoMove` 判据（`core.ts:148`）加
 * 定义里的 `danger.all`。这里不替它造一条新拒绝——那会让终端面与宿主面都多一条上游没有的
 * 失败，而目的地没给时内核自己已经把每条计划都判成 `skipped` + `missing_destination`。
 *
 * @module xaihi-crashu
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runCrashu, type CrashuAction, type CrashuConflictPolicy, type CrashuData, type CrashuInput } from './core.ts'
import { createNodeCrashuRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-crashu'

export const inject = ['tools']

/**
 * 结果行数与相似清单的行数上限来自上游终端面 `cli.ts:300` 与 `:311` 的
 * `slice(0, 40)`，不在这里另定一个数。
 */
const RESULT_LINES = 40

/** 内核认得的冲突策略；别的值一律当"没给"，照上游 `cli.ts:524-532` 的 `isConflict`。 */
const CONFLICT_POLICIES: readonly CrashuConflictPolicy[] = ['skip', 'overwrite', 'rename']

export interface Config {
  /**
   * 这三个默认值上游住在 `xiranite.config.toml` 的 `[nodes.crashu.output]`
   * （`pairs_file_name` / `directory` / `overwrite`，见上游 `cli.ts:61-77` 的
   * `CrashuNodeConfig` 与 `resolveCrashuDefaults`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置文件在磁盘上"的通路
   * 整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * 空串 = **不覆盖**，落回内核自己的行为（`destinationPath` 空 ⇒ 每条计划都
   * `skipped` + `missing_destination`；`pairsFileName` 空 ⇒ 内核的 `folder_pairs.json`）。
   */
  destinationPath: Volatile<string>
  /** 配对文件名；留空用内核默认。 */
  pairsFileName: Volatile<string>
  /**
   * 上游那条 `output.overwrite`：表单没选冲突策略时，它为真才把策略顶成 `overwrite`
   * （上游 `resolveConflictPolicy` 的第三条分支）。默认 false ⇒ 默认 `skip`。
   */
  overwrite: Volatile<boolean>
}

export const Config = Schema.object({
  destinationPath: Schema.string().default('').volatile(),
  pairsFileName: Schema.string().default('').volatile(),
  overwrite: Schema.boolean().default(false).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * `path-list` 字段在两个面上拿到的形状不一样：工具面（`defineNode` 的 `fieldProperty`
 * 把 path-list 映射成 `array<string>`）给的是**数组**，文本域那一边给的是换行分隔的字符串。
 *
 * 清单里上游声明的绑定是 `sourcePaths → lines`，而 `transformValue(…, 'lines')` 只会
 * `String(value).split('\n')`：数组进来会被粘成一项（`['a','b']` → `['a,b']`），
 * 一个合法的多根输入就变成一条不存在的路径。所以接线层按**原始形状**分两条路交给内核，
 * 清单仍是上游那份声明（与 `samea` / `timeu` 同一处理由，落差写进
 * `docs/service-mapping.md` 的缺口名单）。
 */
function sourcePathsOf(args: Record<string, unknown>, inputs: Record<string, unknown>): string[] {
  const raw = args.sourcePaths
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  }
  const bound = inputs.sourcePaths
  return Array.isArray(bound) ? bound.map((item) => String(item).trim()).filter((item) => item !== '') : []
}

/** 换行或逗号都算分隔符：`delimited` 只切逗号，而上游 `interaction.ts` 的 `splitNames` 两种都切。 */
function listFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  return String(value ?? '').split(/\r?\n|,/).map((item) => item.trim()).filter((item) => item !== '')
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由**处理器身份**给（一个动作一个工具），不吃 `inputs.action`：定义里 `action`
 * 是 `isActionSelector`，它的职责是决定哪个工具被调用。`autoMove` 同理照上游
 * （`interaction.ts` 的 `autoMove: values.action === "move"`、`cli.ts:205` 的
 * `autoMove: true`）：只有 `move` 才打开执行那条腿。
 */
function inputFrom(action: CrashuAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): CrashuInput {
  const destinationPath = String(inputs.destinationPath ?? '').trim() || config.destinationPath.get()
  const pairsFileName = String(inputs.pairsFileName ?? '').trim() || config.pairsFileName.get()
  const declaredPolicy = String(inputs.conflictPolicy ?? '').trim()
  const direction = String(inputs.moveDirection ?? '').trim()
  return {
    action,
    sourcePaths: sourcePathsOf(args, inputs),
    targetPath: String(inputs.targetPath ?? ''),
    targetNames: listFrom(args.targetNames),
    ...(destinationPath === '' ? {} : { destinationPath }),
    // 阈值只在表单真的给了数字时下发，否则落回内核的 0.6（定义里那个 0.65 是界面默认）。
    ...(typeof inputs.similarityThreshold === 'number' ? { similarityThreshold: inputs.similarityThreshold } : {}),
    ...(direction === '' ? {} : { moveDirection: direction as CrashuInput['moveDirection'] }),
    ...conflictPolicyOf(declaredPolicy, config.overwrite.get()),
    ...(pairsFileName === '' ? {} : { pairsFileName }),
    dryRun: inputs.dryRun === true,
    autoMove: action === 'move',
  }
}

/** 上游 `resolveConflictPolicy`：显式且合法才用，其次才是配置的 overwrite，否则不覆盖。 */
function conflictPolicyOf(declared: string, overwriteDefault: boolean): Pick<CrashuInput, 'conflictPolicy'> {
  if ((CONFLICT_POLICIES as readonly string[]).includes(declared)) return { conflictPolicy: declared as CrashuConflictPolicy }
  if (declared === '' && overwriteDefault) return { conflictPolicy: 'overwrite' }
  return {}
}

/**
 * 内核事件 → 运行账本。**单位**：crashu 内核的 `progress` 是百分数（10 / 25 / 40 / 70 /
 * 70+25·占比 / 100），直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`
 * （那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/** 结果视图：计数 + 相似清单 + 计划 + 错误，都是内核已经算好的字段，这里不重算。 */
function viewOf(data: CrashuData | undefined) {
  return {
    sourceCount: data?.sourceCount ?? 0,
    targetCount: data?.targetCount ?? 0,
    totalScanned: data?.totalScanned ?? 0,
    similarFound: data?.similarFound ?? 0,
    movedCount: data?.movedCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    errorCount: data?.errorCount ?? 0,
    pairsFile: data?.pairsFile ?? '',
    errors: data?.errors ?? [],
    similarFolders: (data?.similarFolders ?? []).slice(0, RESULT_LINES),
    plan: (data?.plan ?? []).slice(0, RESULT_LINES),
  }
}

/** 工具输出：一句结论 + 计数行 + 最多 40 条 `状态 源 -> 目的地`（上游终端面打印的就是这几列）。 */
function summarize(message: string, data: CrashuData | undefined): string {
  const counts = `matched ${String(data?.similarFound ?? 0)} · moved ${String(data?.movedCount ?? 0)} · skipped ${String(data?.skippedCount ?? 0)} · errors ${String(data?.errorCount ?? 0)}`
  const lines = (data?.plan ?? []).slice(0, RESULT_LINES).map((item) => `${item.status}\t${item.sourcePath}\t${item.destinationPath !== '' ? `-> ${item.destinationPath}` : `/ ${item.reason}`}`)
  const rest = (data?.plan.length ?? 0) > RESULT_LINES ? `… ${String((data?.plan.length ?? 0) - RESULT_LINES)} more` : ''
  return [message, counts, ...lines, rest].filter(Boolean).join('\n')
}

/** 三个动作共用的一条腿：跑内核、接账本、发结果视图、失败就抛。 */
async function call(action: CrashuAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  const result = await runCrashu(inputFrom(action, args, inputs, config), createNodeCrashuRuntime(), (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核用 `success: errorCount === 0` 表达"部分条目失败了"，这时文件已经动过了：
  // 视图先发出去（那是读回现场的唯一入口），再把失败原样抛出去，不咽成一次成功输出。
  if (!result.success) throw new Error(`crashu ${action}: ${result.message}`)
  return summarize(result.message, result.data)
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async scan({ args, inputs, run }) {
        return call('scan', args, inputs, run, config)
      },
      async plan({ args, inputs, run }) {
        return call('plan', args, inputs, run, config)
      },
      async move({ args, inputs, run }) {
        return call('move', args, inputs, run, config)
      },
    },
  })
}
