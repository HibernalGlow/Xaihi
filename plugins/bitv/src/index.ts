/**
 * BitV 的宿主半边：把逐字搬来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts` / `contract.ts`）出自 `noxide` 基线
 * `packages/nodes/bitv/src/`（`core.ts` 683 行，diff 对上游复核过：只有 2 行不同，
 * 理由写在 `src/core.ts` 的文件头）。这一侧只做四件事：把表单值绑成 `BitvInput`、
 * 把内核的过程事件接到运行账本、把内核的 `data` 发给 `result_view`、把危险动作交给
 * DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统或第二次 spawn。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表逐字抄自
 * `<Xiranite>/node-definitions/bitv.json`，三处已定的落差写在
 * `tests/definition.spec.ts` 的头部）。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 * - `BitvRuntime` 的 `findFfprobe` / `runFfprobeJson` → **`ctx.subprocess`**
 *   （Service Definition `@deepseek-ai/dsh-subprocess`、Provider `dsh-subprocess-local`，
 *   `docs/subsystems/subprocess.md`）。「子进程 / 命令执行 ⇒ 不搬基础件」那一行定的就是这条；
 *   先例 `plugins/{sleept,recycleu,mvz}/src/{exec,platform}.ts`。本包现在没声明那个依赖
 *   （补它需要一次 `pnpm install`，本批不许跑），所以类型走 `src/platform.ts` 里的子集镜像、
 *   取用走 `ctx.get('subprocess')`。缝不在 ⇒ **装载期响亮拒绝**（下面那句 throw），
 *   不假装跑得动。
 * - `discoverVideos` / `statFile` / `readJson` / `writeJson` / `resolveAvailablePath` /
 *   `transferFile` → `src/platform.ts` 的 `node:fs`（ADR-0003 决定 1：`ctx.fs` 面向模型发起的
 *   工具调用、要求不透明 `FsTarget` 且禁止解析路径，而本内核要 `resolve` / `relative` /
 *   `readdir(withFileTypes)` / `link`+`unlink` / `wx` 独占写）。
 * - 危险动作（`classify` / `report` 的非预演那一次）→ `ctx.approval`：定义里是 `danger.all`，
 *   `defineNode` 把它变成 `tools/pre-execute` 的 `ask`。这里不自己实现确认框。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream）；账本缺席时
 *   `defineNode` 会 `console.warn` 并把进度降级成无操作，节点仍能脱离工作台单独装。
 *
 * 上游那份 `xiranite.config.toml` 的 `[nodes.bitv]` 通路整块不搬
 * （`docs/adr/0013-config-goes-through-dsh-settings.md`）：同一批默认值在这里声明成 `Config`，
 * 值由 DSH 的 patch 层给，读写走 settings 面；默认值一律取自内核的 `BITV_DEFAULTS`
 * （`core.ts:109-115`），不在这里抄第二份数字。
 *
 * **`Config` 这一层什么时候才会被读到**（与 `rawfilter` / `samea` / `timeu` / `nameu` 同一条口径）：
 * `bindInputs` 对声明了 `asBoolean` 的字段**总**产出布尔——模型省略参数时给的是 `false`
 * （`packages/node-sdk/src/define-node.ts:144-145`，缺口 G8），清单里的声明式 default 只有表单
 * 那一侧会填。所以 `bitv_classify` / `bitv_report` 少传 `dryRun` ⇒ 内核收到 `dryRun: false`
 * ⇒ 真的复制/移动（这一步先被 `danger.all` 变成 DSH 的 `ask`）。两种形状下"没被批准就不动文件"
 * 都由那条闸门兜住。`tests/definition.spec.ts` 把这个分叉两头都钉住，不在这里统一它。
 *
 * @module xaihi-bitv
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import {
  BITV_DEFAULTS,
  runBitv,
  type BitvAction,
  type BitvData,
  type BitvInput,
  type BitvTransferMode,
} from './core.ts'
import { createNodeBitvRuntime, type BitvSubprocessSeam } from './platform.ts'

export const name = '@hibernalglow/xaihi-bitv'

/** `subprocess` 是外部程序那一格的唯一出处（缺了它本节点装载期就拒绝，见 `apply`）。 */
export const inject = ['tools', 'subprocess']

/** 内核认得的转移模式；别的值一律当"没给"，理由见 `inputFrom` 里那条 `transferMode`。 */
const TRANSFER_MODES: readonly BitvTransferMode[] = [BITV_DEFAULTS.transferMode, 'move']

export interface Config {
  /**
   * 这五个默认值上游住在 `xiranite.config.toml` 的 `[nodes.bitv]`
   * （`recursive` / `bitrate_step_mbps` / `max_levels` / `transfer_mode` / `dry_run`，
   * 见上游 `cli.ts:39-49` 那份 `BitvNodeConfig`）。按 ADR-0013 换成 `Config` 声明；
   * 键名用 camelCase（上游那批 snake_case 键属于不搬的那份文件通路）。
   *
   * 上游喂这些值的两个消费者（`ui` / `gd` 那两条交互腿）在本包是响亮拒绝的未接面，
   * 所以这里读它们的唯一地方是 `inputFrom` 的"表单没给"那一侧。
   */
  recursive: Volatile<boolean>
  bitrateStepMbps: Volatile<number>
  maxLevels: Volatile<number>
  /** `"copy"` 或 `"move"`；空白或别的值 = 不覆盖，落回内核的 `BITV_DEFAULTS.transferMode`。 */
  transferMode: Volatile<string>
  /** 预演模式，默认 true：**没给就只出计划，一个文件都不动**。 */
  dryRun: Volatile<boolean>
}

export const Config = Schema.object({
  recursive: Schema.boolean().default(BITV_DEFAULTS.recursive).volatile(),
  bitrateStepMbps: Schema.number().default(BITV_DEFAULTS.bitrateStepMbps).volatile(),
  maxLevels: Schema.number().default(BITV_DEFAULTS.maxLevels).volatile(),
  transferMode: Schema.string().default(BITV_DEFAULTS.transferMode).volatile(),
  dryRun: Schema.boolean().default(BITV_DEFAULTS.dryRun).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * `path-list` 字段在两个面上拿到的形状不一样：工具面（`fieldProperty` 把 path-list 映射成
 * `array<string>`）给的是**数组**，文本域那一边给的是换行分隔的字符串。清单里上游声明的绑定是
 * `paths → lines`，而 `transformValue(…, 'lines')` 只会 `String(value).split('\n')`：数组进来
 * 会被粘成一项（`['a','b']` → `['a,b']`），一个合法的多根输入就变成一条不存在的路径。
 * 所以接线层按**原始形状**分两条路交给内核（与 `crashu` / `samea` / `timeu` 同一处理，
 * 落差写在 `docs/service-mapping.md` 的缺口名单里），清单仍是上游那份声明。
 */
function pathsOf(args: Record<string, unknown>, inputs: Record<string, unknown>): string[] {
  const raw = args.paths
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  }
  const bound = inputs.paths
  return Array.isArray(bound) ? bound.map((item) => String(item).trim()).filter((item) => item !== '') : []
}

/** 可选文本：空白与缺省都当"没给"（内核那侧 `?.trim()` 之后走各自的分支）。 */
function textOrOmit(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? undefined : text
}

/** 布尔：`bindInputs` 已经把缺省折成 `false`（G8），所以这里只在**不是布尔**时才落回 Config。 */
function booleanOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** 数字：内核自己校验 `> 0` 与 `1..1000`（`core.ts:579-586`），这里不替它改值。 */
function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 转移模式：清单里声明的绑定是 `trim`，于是"模型没给"会变成空串，而内核的判据是
 * `input.transferMode ?? BITV_DEFAULTS.transferMode`（`core.ts:317`、`:441`）——空串不是
 * nullish，会被当成一个模式值，接着 `platform.ts` 的 `mode === "copy"` 判假
 * ⇒ **走 `move` 那条硬链接 + unlink 的路**（`core.ts` 交给 `transferFile` 的原话）。
 * 这里不把空串喂进去：只认 `copy` / `move` 两个字面值，别的都当"没给"，落回内核的默认
 * （`copy`）。与 `crashu/src/index.ts:145` 那份 `CONFLICT_POLICIES` 白名单是同一条纪律。
 */
function transferModeOf(value: unknown, configured: string): BitvTransferMode | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  if ((TRANSFER_MODES as readonly string[]).includes(text)) return text as BitvTransferMode
  if ((TRANSFER_MODES as readonly string[]).includes(configured.trim())) return configured.trim() as BitvTransferMode
  return undefined
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由**处理器身份**给（一个动作一个工具），不吃 `inputs.action`：定义里 `action` 是
 * `isActionSelector`，它的职责是决定哪个工具被调用。上游 `cli.ts:204-214` 那份
 * "flag 优先、其次配置默认、最后内核默认"的三段 `??` 在这里落成同一条链：
 * 表单给的 > `Config` 给的 > 内核的 `BITV_DEFAULTS`（最后一跳由 `core.ts` 自己做，
 * 这里不替它预先填死）。
 */
function inputFrom(action: BitvAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): BitvInput {
  const reportPath = textOrOmit(inputs.reportPath)
  const targetPath = textOrOmit(inputs.targetPath)
  const outputPath = textOrOmit(inputs.outputPath)
  const transferMode = transferModeOf(inputs.transferMode, config.transferMode.get())
  return {
    action,
    // `status` 不读 paths（`core.ts:228-237` 直接返回），`report` 只用 `reportPath`
    // （`core.ts:246` 在"至少要有一条路径"那道检查**之前**就拐进 report 分支）。
    ...(action === 'status' ? {} : { paths: pathsOf(args, inputs) }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(targetPath === undefined ? {} : { targetPath }),
    ...(outputPath === undefined ? {} : { outputPath }),
    recursive: booleanOf(inputs.recursive, config.recursive.get()),
    bitrateStepMbps: numberOf(inputs.bitrateStepMbps, config.bitrateStepMbps.get()),
    maxLevels: numberOf(inputs.maxLevels, config.maxLevels.get()),
    ...(transferMode === undefined ? {} : { transferMode }),
    dryRun: booleanOf(inputs.dryRun, config.dryRun.get()),
  }
}

/**
 * 内核事件 → 运行账本。**单位**：bitv 内核的 `progress` 是百分数
 * （0 → `5 + 65·占比` → `72 + 26·占比` → 100，上游 `core.ts:260,478,505,294,330,447`），
 * 直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图 = 内核的 `data` 原样。上游没有行数闸门（终端面的 plain 输出只印四条计数，
 * 基线 `cli.ts:370-380`），所以这里不编一个上限、也不重算任何一格：
 * `videos` / `operations` / `stats` / `errors` 都是内核已经算好的字段。
 */
function viewOf(data: BitvData | undefined): unknown {
  return data ?? null
}

/**
 * 工具输出：内核那句 `message` + 上游终端面那四条计数
 * （`Videos:` / `Operations:`（带 ` (preview)`）/ `Report:` / `Errors:`，基线 `cli.ts:371-379`
 * 的 `writePlainResult`），逐字照它印的那几列，不在这里加第二种说法。
 */
function summarize(data: BitvData | undefined): string {
  if (data === undefined) return 'no data'
  const lines = [] as string[]
  if (data.videos.length) lines.push(`Videos: ${String(data.videos.length)}`)
  if (data.operations.length) lines.push(`Operations: ${String(data.operations.length)}${data.dryRun ? ' (preview)' : ''}`)
  if (data.reportPath) lines.push(`Report: ${data.reportPath}`)
  if (data.errors.length) lines.push(`Errors: ${String(data.errors.length)}`)
  return lines.join('\n')
}

/** 一条动作腿：跑内核、接账本、发结果视图、失败原样抛出（咽成成功输出会让面板显示空结果）。 */
async function call(
  action: BitvAction,
  args: Record<string, unknown>,
  inputs: Record<string, unknown>,
  run: OperationRun,
  config: Config,
  runtime: ReturnType<typeof createNodeBitvRuntime>,
): Promise<string> {
  const result = await runBitv(inputFrom(action, args, inputs, config), runtime, (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  if (!result.success) throw new Error(`bitv ${action}: ${result.message}`)
  const summary = summarize(result.data)
  return summary === '' ? result.message : `${result.message}\n${summary}`
}

export function apply(ctx: Context, config: Config): void {
  // 本包没声明 `@deepseek-ai/dsh-subprocess` 那个依赖（理由见 `src/platform.ts` 的文件头），
  // 所以类型面按可缺处理。`inject` 已经保证缝不在就装载不起来，这一句是给"装配漂了"
  // 那种情况兜底的**可见**拒绝，而不是第一次调用时才炸出 undefined。
  const subprocess = ctx.get('subprocess') as BitvSubprocessSeam | undefined
  if (subprocess === undefined) {
    throw new Error(`${name}: ctx.subprocess is not provided; bitv cannot look up or run ffprobe without that seam.`)
  }
  const runtime = createNodeBitvRuntime(subprocess, { cwd: process.cwd(), env: process.env })

  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async status({ args, inputs, run }) {
        return call('status', args, inputs, run, config, runtime)
      },
      async analyze({ args, inputs, run }) {
        return call('analyze', args, inputs, run, config, runtime)
      },
      async classify({ args, inputs, run }) {
        return call('classify', args, inputs, run, config, runtime)
      },
      async report({ args, inputs, run }) {
        return call('report', args, inputs, run, config, runtime)
      },
    },
  })
}
