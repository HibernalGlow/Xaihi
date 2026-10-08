/**
 * encodeb 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts`）是从 `noxide` 基线逐字搬来的 185 行，差异只有第 1 行那条 import；
 * `platform.ts` 除了转码那一段也逐字搬（那一段为什么不能搬，写在它自己的文件头）。
 * 所以这一侧只做四件事：把表单值绑成 `EncodebInput`、把内核的过程事件接到运行账本、
 * 把结果发给 `result_view`、把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里
 * 偷偷加第二次文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/encodeb.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 * - `EncodebRuntime` 的 3 个方法（`scanPath` / `recoverPath` / `transcodeName`）→
 *   `src/platform.ts`（`node:fs/promises` + `node:path`）。**不走 `ctx.fs`**：那条缝面向
 *   模型发起的工具调用，要求不透明 `FsTarget` 且禁止解析路径，而本内核要 `resolve`、
 *   `dirname`、`rename`、要递归 `readdir`（ADR-0003 决定 1，`crashu` / `formatv` 先例）。
 *   权限边界因此靠**动作分级**：`recover` 在定义里是 `danger.actionIn`（上游那份，
 *   `actionField` 留着也没关系：`dangerFor` 的 `actionIn` 分支在参数表里没有动作选择器时
 *   会落回 `actionId`，`define-node.ts:186`），经 `defineNode` 变成 `tools/pre-execute`
 *   的 `ask`，审批与审计走 DSH 的 `approval` 缝。
 * - 外部程序 → 本节点**一个都不调**，所以不 `inject` `subprocess`。上游 `platform.ts:32-71`
 *   那个 `readClipboardText()` 只服务 `guided` 腿，那条腿在本包是响亮拒绝的未接面
 *   （见 `src/cli.ts`），缺口沿用台账 **G5**。
 * - 进度与结果 → `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；DSH 的
 *   `tools` 只有单次输出缝，没有"同一运行的中间态流"）。账本缺席时 `defineNode` 会
 *   `console.warn` 并把进度降级成无操作，节点仍能脱离工作台单独装。
 * - `ctx.storage` → **不用**。这个节点没有耐久账本：`recover` 是就地改名，上游也没写
 *   undo journal（复制腿靠 `uniquePath` 保证不覆盖，不是靠账本）。
 *
 * 兑现不了的那一格（**依赖申请，不是待办**）：`recode` / `auto` 两个 transform 需要
 * `iconv-lite`（把名字编成 cp437 / cp936 / cp932 / cp949 / windows-1252 的字节）与
 * `chardet`（猜目标编码）。两颗都不在本仓依赖闭包里，而新增依赖不在本任务授权范围内，
 * Node 自带的 `TextDecoder` 也补不了（没有 cp437/cp936/cp932/cp949 标签，`TextEncoder`
 * 只出 UTF-8）。于是 `src/platform.ts` 的 `nodeTranscodeName` 在这两个分支上**抛
 * `CODEC_UNAVAILABLE`**，并且抛在动第一条文件之前（`recoverPath` 先算 mappings 才 apply）。
 * 本包现在真能跑的转码面是 `decode-hash-u` 与 `normalize-middle-dot` 两条，加上完全不
 * 依赖转码的 `find`。不写成"预览到 0 条映射"，因为那会把"做不了"报成"这里没有乱码"。
 *
 * 这里**没有**"必须显式给目的地才准动手"那道闸门（对照 `migratef` 的 `historyPath`）：
 * 上游 encodeb 没这种闸门，它的保护是 `preview` 与 `recover` 是两个动作 + 定义里那条
 * `danger.actionIn`。这里不替它造第二条拒绝——路径没给时内核自己已经回
 * `No valid paths provided.`（`core.ts` 的 `runEncodeb` 开头）。
 *
 * @module xaihi-encodeb
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import {
  ENCODEB_PRESETS,
  parseEncodebPaths,
  runEncodeb,
  type EncodebAction,
  type EncodebData,
  type EncodebInput,
  type EncodebStrategy,
  type EncodebTransform,
} from './core.ts'
import { createNodeEncodebRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-encodeb'

export const inject = ['tools']

/**
 * 清单里 `preset` 与 `limit` 的推导上限来自上游终端面 `cli.ts:40` 的
 * `PREVIEW_LIMIT = 40`，不在这里另定一个数。
 */
const RESULT_LINES = 40

/** 内核认得的 transform；别的值一律当"没给"，照上游 `cli.ts:224` 那串逐条判据。 */
const TRANSFORMS: readonly EncodebTransform[] = ['auto', 'recode', 'decode-hash-u', 'normalize-middle-dot']

export interface Config {
  /**
   * 这六个默认值上游住在 `xiranite.config.toml` 的 `[nodes.encodeb]`
   * （`preset` / `src_encoding` / `dst_encoding` / `transform` / `strategy` / `limit`，
   * 见上游 `cli.ts:53-93` 的 `EncodebNodeConfig` 与 `resolveEncodebDefaults`）。按
   * `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置住在后端一个 toml 里"的
   * 通路整块不搬：同一份默认值在这里声明成 `Config`，值由 DSH 的 patch 层给，读写走 settings 面。
   *
   * 空串 / 0 = **不覆盖**，落回上游那条优先级链（表单值 → 本配置 → 预设表 → 内核默认）。
   */
  preset: Volatile<string>
  srcEncoding: Volatile<string>
  dstEncoding: Volatile<string>
  transform: Volatile<string>
  strategy: Volatile<string>
  /** 0 = 不覆盖（内核的 200 与定义里界面默认 200 同源，不在这里抄第三份）。 */
  limit: Volatile<number>
}

export const Config = Schema.object({
  // 默认对齐迁移配置 [nodes.encodeb]（2026-10-05 Xiranite 使用者配置）。
  preset: Schema.string().default('cn').volatile(),
  srcEncoding: Schema.string().default('cp437').volatile(),
  dstEncoding: Schema.string().default('cp936').volatile(),
  transform: Schema.string().default('recode').volatile(),
  strategy: Schema.string().default('replace').volatile(),
  limit: Schema.number().default(0).volatile(),
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
 * 清单里上游声明的绑定是 `paths → lines`，而 `transformValue(…, 'lines')` 只会
 * `String(value).split('\n')`：数组进来会被粘成一项（`['a','b']` → `['a,b']`），
 * 一个合法的多路径输入就变成一条不存在的路径。所以接线层按**原始形状**交给内核自己那份
 * `parseEncodebPaths`（它只按换行切、剥首尾引号，`core.ts:76-79`），清单仍是上游那份声明
 * （落差与 `crashu` / `samea` / `timeu` 同一条处理由）。
 */
function pathsOf(args: Record<string, unknown>, inputs: Record<string, unknown>): string[] {
  const raw = args.paths ?? inputs.paths
  return parseEncodebPaths(Array.isArray(raw) ? raw.map((item) => String(item ?? '')) : String(raw ?? ''))
}

/** 生效值：给结果视图读回用（内核输入里没有"预设"这个槽，它是界面层的概念）。 */
interface EffectiveEncoding {
  presetId: string
  srcEncoding: string
  dstEncoding: string
  transform: string
  strategy: string
  limit: number
}

/** 表单值 → 内核输入 + 本次生效的编码对；缺席的槽**不下发**，默认值只许住在内核里。 */
function inputFrom(action: EncodebAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): { input: EncodebInput; effective: EffectiveEncoding } {
  // 三条腿的默认值同字：表单没填 → 配置 → `auto`（上游 UI 腿 `interaction.ts:89` 的
  // `values.preset ?? "auto"` 与 CLI 腿 `cli.ts:217` 的 `?? "auto"` 是同一个默认）。
  // 认不出的**非空**预设才落回 `cn`（上游 `interaction.ts:90`），那是另一条判据。
  const presetId = String(inputs.preset ?? '').trim() || config.preset.get() || 'auto'
  const strategy = String(inputs.strategy ?? '').trim() || config.strategy.get()
  const declaredTransform = String(args.transform ?? '').trim() || String(inputs.transform ?? '').trim() || config.transform.get()
  const srcEncoding = String(inputs.srcEncoding ?? '').trim() || config.srcEncoding.get()
  const dstEncoding = String(inputs.dstEncoding ?? '').trim() || config.dstEncoding.get()
  const limit = typeof inputs.limit === 'number' && Number.isFinite(inputs.limit) ? inputs.limit : config.limit.get()
  // 上游 `cli.ts:216-228` 那条优先级链，每个槽都是"显式值 → 配置 → 预设表 → 内核默认"：
  // `args.srcEncoding ?? defaults.srcEncoding ?? preset?.srcEncoding ?? "cp437"`。
  // `custom` 在预设表里没有这一条（`core.ts:52-62`），所以它在链上什么都不贡献，只留下
  // 显式编码与内核默认的 `recode` —— 与上游 UI 腿的 custom 分支（`interaction.ts:91-97`）
  // 得到同一份结果。链尾那个 `?? 内核默认` 干脆不写：默认值只许住在一处。
  const preset = presetId === 'custom' ? undefined : presetOf(presetId)
  const effectiveSrc = srcEncoding || preset?.srcEncoding || ''
  const effectiveDst = dstEncoding || preset?.dstEncoding || ''
  const transform = transformOverride(declaredTransform) ? declaredTransform : preset?.transform || ''
  return {
    input: {
      action,
      paths: pathsOf(args, inputs),
      ...(effectiveSrc === '' ? {} : { srcEncoding: effectiveSrc }),
      ...(effectiveDst === '' ? {} : { dstEncoding: effectiveDst }),
      ...(transform === '' ? {} : { transform: transform as EncodebTransform }),
      ...(strategy === '' ? {} : { strategy: strategy as EncodebStrategy }),
      ...(limit > 0 ? { limit } : {}),
    },
    // 没下发的那几格这里写的是**本次实际生效的出处值**（空串 = 落回内核默认，
    // 由 `core.ts:64-74` 决定）；视图里读得到的是"链上谁胜出"，不是内核里的字面值。
    effective: { presetId, srcEncoding: effectiveSrc, dstEncoding: effectiveDst, transform, strategy, limit },
  }
}

/** 预设表只有一份真源：内核导出的 `ENCODEB_PRESETS`（`core.ts:52-62`，没有 `custom` 这一条）。 */
function presetOf(presetId: string): { srcEncoding: string; dstEncoding: string; transform: EncodebTransform } {
  const known = ENCODEB_PRESETS[presetId as keyof typeof ENCODEB_PRESETS]
  if (known !== undefined) return known
  // 上游 `interaction.ts:90` 的判据：认不出的预设落回 `cn`，不是落回 `auto`。
  return ENCODEB_PRESETS.cn
}

/** 上游 `cli.ts:224` 那串判据：只有内核词表里的四个值才算声明了 transform。 */
function transformOverride(value: string): boolean {
  return (TRANSFORMS as readonly string[]).includes(value)
}

/**
 * 内核事件 → 运行账本。**单位**：encodeb 内核的 `progress` 是百分数
 * （每条路径 `Math.round((index / paths.length) * 80)`，收尾 `100`），直接当
 * `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 结果视图：计数 + 映射清单 + 匹配清单 + **本次真正生效的编码对**。
 *
 * 最后那三项是上游清单里 `defaultExport` 想表达的东西
 * （`effective_src_encoding` / `effective_dst_encoding` / `preset_transform`）：
 * `xaihi.node/v1` 的绑定项没有那条出口通道，所以清单里不带它（偏差记在
 * `tests/definition.spec.ts`），而** substance 在这里读得回来** ——不留一个"界面上永远
 * 看不到用的是哪对编码"的洞。都是内核已经算好的字段，这里不重算。
 */
function viewOf(data: EncodebData | undefined, effective: EffectiveEncoding) {
  return {
    processed: data?.processed ?? 0,
    mappingCount: data?.mappings.length ?? 0,
    matchCount: data?.matches.length ?? 0,
    preset: effective.presetId,
    effectiveSrcEncoding: effective.srcEncoding,
    effectiveDstEncoding: effective.dstEncoding,
    effectiveTransform: effective.transform,
    strategy: effective.strategy,
    limit: effective.limit,
    mappings: (data?.mappings ?? []).slice(0, RESULT_LINES),
    matches: (data?.matches ?? []).slice(0, RESULT_LINES),
  }
}

/** 工具输出：一句结论 + 计数行 + 最多 40 条（上游终端面打印的就是这几列，`cli.ts:251-257`）。 */
function summarize(message: string, data: EncodebData | undefined): string {
  const counts = `mappings ${String(data?.mappings.length ?? 0)} · matches ${String(data?.matches.length ?? 0)} · processed ${String(data?.processed ?? 0)}`
  const lines = (data?.mappings ?? []).slice(0, RESULT_LINES).map((item) => `${item.type}\t${item.src}\t->\t${item.dst}`)
  const matched = (data?.matches ?? []).slice(0, RESULT_LINES).map((item) => `match\t${item}`)
  const rest = (data?.mappings.length ?? 0) > RESULT_LINES ? `… ${String((data?.mappings.length ?? 0) - RESULT_LINES)} more` : ''
  return [message, counts, ...lines, ...matched, rest].filter(Boolean).join('\n')
}

/** 三个动作共用的一条腿：跑内核、接账本、发结果视图、失败就抛。 */
async function call(action: EncodebAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  const { input, effective } = inputFrom(action, args, inputs, config)
  // 内核的 `runEncodeb` **不 catch**（与 migratef 那份不同），所以 `platform.ts` 那句
  // codec 拒绝会原样从这里出去：先视图后抛的顺序在这里用不上，因为什么都没跑成。
  const result = await runEncodeb(input, createNodeEncodebRuntime(), (event) => forward(event, run))
  run.resultView(viewOf(result.data, effective))
  // 内核用 `success:false` 表达"没给路径"这类结论；不咽成一次成功输出。
  if (!result.success) throw new Error(`encodeb ${action}: ${result.message}`)
  return summarize(result.message, result.data)
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async find({ args, inputs, run }) {
        return call('find', args, inputs, run, config)
      },
      async preview({ args, inputs, run }) {
        return call('preview', args, inputs, run, config)
      },
      async recover({ args, inputs, run }) {
        return call('recover', args, inputs, run, config)
      },
    },
  })
}
