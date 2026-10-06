/**
 * enginev 的宿主半边：把逐字搬来的内核（`core.ts`，596 行）接成一个 Xaihi 节点。
 *
 * 这一侧只做三件事：把表单值绑成 `EngineVInput`、把内核的过程事件接到运行账本、
 * 把结局发给 `result_view`。危险动作交给定义里那份 `danger.all`（经 `defineNode` 变成
 * DSH 的 `ask`），这里不实现确认框；内核逻辑不在这里重写，也不在这里开第二套文件系统。
 *
 * 节点定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/enginev.json`）。清单、装载期校验与工具注册都读它。
 *
 * DI 缝 → DSH 服务的对应（判据见 `docs/service-mapping.md` 与 ADR-0003）：
 *
 * | 这件事 | 落点 | 服务 |
 * |---|---|---|
 * | `EngineVRuntime` 的 12 个方法（含 `os-native` 的路径与 `recursive-enumeration` 的 `folderSize`）| `src/platform.ts` | `node:fs` —— **不是** `ctx.fs`：那条缝没有 `mkdir`/`rename`/`rm`/`cp`，`FsInfo` 也没有 mtime/ctime，逐条证据与缺口名（G-fs-no-mutation-verbs、G-no-os-trash）写在 `src/platform.ts` 头部；ADR-0003 决定 1 判的就是同一件事 |
 * | 外部程序 | **一个都不调** | 因此 `inject` 里**没有** `subprocess`（上游 `platform.ts:32-57` 的剪贴板那条腿不搬，缺口 G5 同源）|
 * | `rename` / `delete` 在非预演时要批准 | 定义里 `danger.all` 两条谓词 | `ctx.approval`（经 `tools/pre-execute` 的 `ask`）|
 * | 进度 / 预览 / 结果视图 | `run.progress` / `run.preview` / `run.resultView` | `ctx.get(OPERATIONS_SERVICE)`（xaihi-core 的 operation stream；DSH 的 `tools` 只有单次输出缝）|
 * | 工坊目录、模板、导出目的地等"配置默认值" | 下面的 `Config` | `ctx.settings` 面（ADR-0013：上游那份 `xiranite.config.toml` 的 `[nodes.enginev]` 整块不搬）|
 *
 * "独立 bin 够不到这些缝"的可见拒绝在 `src/cli.ts`（G1/G6 那一族）。
 *
 * `Config` 里**没有** `imageBackend` / `galleryColumns` 两条：上游那两个键在
 * `xiranite.config.toml` 与 TUI 里（`cli.ts` 的 `createEngineVDefinition` 用它们喂
 * `interaction.ts` 的初始值），`core.ts` 的 `EngineVInput` 没有任何对应字段，清单里那两条
 * 字段也没有 `inputBindings` 项。在这里声明它们就等于装一个没有任何回读路径的旋钮，
 * 所以不声明；界面那侧要用的时候由 UI 自己的偏好面出，不是节点配置。
 *
 * @module xaihi-enginev
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import type { EngineVAction, EngineVData, EngineVExportFormat, EngineVInput, EngineVSortField, EngineVSortOrder } from './core.ts'
import { runEngineV } from './core.ts'
import { createNodeEngineVRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-enginev'

export const inject = ['tools']

/** 上游终端面那三个行数上限（`<noxide>/packages/nodes/enginev/src/cli.ts:43-45`），这里照抄不另定。 */
const WALLPAPER_PREVIEW_LIMIT = 30
const RENAME_PREVIEW_LIMIT = 50
const DELETE_PREVIEW_LIMIT = 50

export interface Config {
  /**
   * 上游 `[nodes.enginev] workshop_root`。空串 = **不覆盖**，落回清单里那条字段的默认
   * （`E:\SteamLibrary\steamapps\workshop\content\431960`，上游 `core.ts:144` 同值）。
   */
  workshopPath: Volatile<string>
  /** 上游 `template`。空串 = 不覆盖，落回内核的 `DEFAULT_TEMPLATE`。 */
  template: Volatile<string>
  /** 上游 `export_path`。空串 = 不覆盖，此时 `export` 由内核报 `Export path is required.`。 */
  exportPath: Volatile<string>
  /** 上游 `export_format`。空串 = 不覆盖。 */
  exportFormat: Volatile<string>
  /** 上游 `max_workers`。0 = 不覆盖（内核自己 clamp 到 4，`core.ts:170`）。 */
  maxWorkers: Volatile<number>
}

export const Config = Schema.object({
  workshopPath: Schema.string().default('').volatile(),
  template: Schema.string().default('').volatile(),
  exportPath: Schema.string().default('').volatile(),
  exportFormat: Schema.string().default('').volatile(),
  maxWorkers: Schema.number().default(0).volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * 表单值 → 内核入参。
 *
 * `action` 由**处理器身份**给（一个动作一个工具），不吃 `inputs.action`：定义里 `action`
 * 是 `isActionSelector`，它的职责是决定哪个工具被调用。
 *
 * 上游清单的 `inputBindings` 用的是**点号槽位**（`filters.title`、`filters.tags`…），
 * `bindInputs` 就按字面把键存成 `'filters.title'`（`define-node.ts:155-161`）——那是上游
 * 声明的形状，这里按它读，不改清单。
 *
 * 可选属性一律"没给就没有这个键"：`exactOptionalPropertyTypes` 要求这么写，而
 * `bindInputs` 会把省略的布尔折成 `false`（缺口 G8）；照它下发就抹掉了内核自己的默认
 * （`dryRun` 是 `?? true`，`core.ts:177`）。**以原始 `args` 有没有这个键为准。**
 */
function inputFrom(action: EngineVAction, args: Record<string, unknown>, inputs: Record<string, unknown>, config: Config): EngineVInput {
  const input: EngineVInput = { action }
  const workshopPath = text(inputs.workshopPath) || config.workshopPath.get()
  if (workshopPath !== '') input.workshopPath = workshopPath
  const filters = filtersOf(args, inputs)
  if (Object.keys(filters).length > 0) input.filters = filters
  if (has('idsText', args)) input.ids = listFrom(inputs.ids)
  const template = text(inputs.template) || config.template.get()
  if (template !== '') input.template = template
  const maxWorkers = typeof inputs.maxWorkers === 'number' ? inputs.maxWorkers : config.maxWorkers.get()
  if (maxWorkers > 0) input.maxWorkers = maxWorkers
  if (has('dryRun', args)) input.dryRun = inputs.dryRun === true
  if (has('permanent', args)) input.permanent = inputs.permanent === true
  if (has('copyMode', args)) input.copyMode = inputs.copyMode === true
  if (has('targetPath', args)) input.targetPath = text(inputs.targetPath)
  const exportFormat = text(inputs.exportFormat) || config.exportFormat.get()
  if (isExportFormat(exportFormat)) input.exportFormat = exportFormat
  const exportPath = text(inputs.exportPath) || config.exportPath.get()
  if (exportPath !== '') input.exportPath = exportPath
  if (isSortField(text(inputs.sortField))) input.sortField = text(inputs.sortField) as EngineVSortField
  if (isSortOrder(text(inputs.sortOrder))) input.sortOrder = text(inputs.sortOrder) as EngineVSortOrder
  return input
}

/** 原始参数里有没有这个键：面板或命令真填过，才算"使用者说过"。 */
function has(field: string, args: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(args, field)
}

/** 清单里那四条点号绑定读回成内核的 `filters` 对象；空值不留键（`clean()` 本来就把空白当没给）。 */
function filtersOf(args: Record<string, unknown>, inputs: Record<string, unknown>): EngineVInput['filters'] {
  const filters: Record<string, unknown> = {}
  const title = text(inputs['filters.title'])
  const contentRating = text(inputs['filters.contentRating'])
  const type = text(inputs['filters.type'])
  if (title !== '') filters.title = title
  if (contentRating !== '') filters.contentRating = contentRating
  if (type !== '') filters.type = type
  if (has('tagsText', args)) {
    const tags = listFrom(inputs['filters.tags'])
    if (tags.length > 0) filters.tags = tags
  }
  return filters as EngineVInput['filters']
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** `delimited` 只切逗号；数组进来的原样收下，字符串再按内核自己那份分隔符补切一次。 */
function listFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter((item) => item !== '')
  return String(value ?? '').split(/[,;\s]+/).map((item) => item.trim()).filter((item) => item !== '')
}

function isExportFormat(value: string): value is EngineVExportFormat {
  return value === 'json' || value === 'paths'
}

function isSortField(value: string): value is EngineVSortField {
  return value === 'none' || value === 'size' || value === 'title' || value === 'createdTime' || value === 'modifiedTime'
}

function isSortOrder(value: string): value is EngineVSortOrder {
  return value === 'asc' || value === 'desc'
}

/**
 * 内核事件 → 运行账本。**单位**：enginev 内核的 `progress` 是百分数
 * （`10 + round(i/n*70)`、`15 + round(i/n*80)`、收尾 100，`core.ts:222`、`:375`、`:395`、`:430`），
 * 直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 * `log` 事件（单个目录读失败时那条，`core.ts:227`）原样进预览，不折成失败。
 */
function forward(event: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (event.type === 'progress') {
    run.progress({ done: Math.round(event.progress ?? 0), total: 100 })
  }
  if (event.message !== '') run.preview({ message: event.message })
}

/** 结果视图：计数、统计、改名与删除清单、错误，全是内核算好的字段，这里不重算。 */
function viewOf(data: EngineVData | undefined) {
  return {
    totalCount: data?.totalCount ?? 0,
    filteredCount: data?.filteredCount ?? 0,
    successCount: data?.successCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    typeStats: data?.typeStats ?? {},
    ratingStats: data?.ratingStats ?? {},
    exportPath: data?.exportPath ?? '',
    errors: data?.errors ?? [],
    wallpapers: (data?.filteredWallpapers ?? []).slice(0, WALLPAPER_PREVIEW_LIMIT).map((item) => ({
      workshopId: item.workshopId,
      title: item.title,
      wallpaperType: item.wallpaperType,
      contentRating: item.contentRating,
      size: item.size,
      path: item.path,
    })),
    wallpapersTruncated: (data?.filteredWallpapers.length ?? 0) > WALLPAPER_PREVIEW_LIMIT,
    renameResults: (data?.renameResults ?? []).slice(0, RENAME_PREVIEW_LIMIT),
    renameTruncated: (data?.renameResults.length ?? 0) > RENAME_PREVIEW_LIMIT,
    deleteResults: (data?.deleteResults ?? []).slice(0, DELETE_PREVIEW_LIMIT),
    deleteTruncated: (data?.deleteResults.length ?? 0) > DELETE_PREVIEW_LIMIT,
  }
}

/** 工具输出：一句结论 + 计数行 + 改名/删除清单（各按上游那两份行限），最后一行是错误条数。 */
function summarize(message: string, data: EngineVData | undefined): string {
  const counts = `total ${String(data?.totalCount ?? 0)} · filtered ${String(data?.filteredCount ?? 0)} · ok ${String(data?.successCount ?? 0)} · failed ${String(data?.failedCount ?? 0)}`
  const renames = (data?.renameResults ?? []).slice(0, RENAME_PREVIEW_LIMIT)
    .map((item) => `${item.status}\t${item.oldName}${item.newName !== '' ? ` -> ${item.newName}` : ''}${item.error !== undefined ? `: ${item.error}` : ''}`)
  const deletes = (data?.deleteResults ?? []).slice(0, DELETE_PREVIEW_LIMIT)
    .map((item) => `${item.status}\t${item.path}: ${item.message}`)
  const rest = [
    (data?.renameResults.length ?? 0) > RENAME_PREVIEW_LIMIT ? `… ${String((data?.renameResults.length ?? 0) - RENAME_PREVIEW_LIMIT)} more rename(s)` : '',
    (data?.deleteResults.length ?? 0) > DELETE_PREVIEW_LIMIT ? `… ${String((data?.deleteResults.length ?? 0) - DELETE_PREVIEW_LIMIT)} more delete(s)` : '',
  ].filter((line) => line !== '')
  return [message, counts, ...renames, ...deletes, ...rest].filter((line) => line !== '').join('\n')
}

/** 五条动作共用的一条腿：跑内核、接账本、发结果视图、失败就抛。 */
async function call(action: EngineVAction, args: Record<string, unknown>, inputs: Record<string, unknown>, run: OperationRun, config: Config): Promise<string> {
  const result = await runEngineV(inputFrom(action, args, inputs, config), createNodeEngineVRuntime(), (event) => forward(event, run))
  run.resultView(viewOf(result.data))
  // 内核的 `success` 判据是"没有 error 条目"（`core.ts:416`、`:445`），这时前面的条目
  // 已经动过盘了：视图先发出去（那是读回现场的唯一入口），再把失败原样抛出去，不咽成成功。
  if (!result.success) throw new Error(`enginev ${action}: ${result.message}`)
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
      async filter({ args, inputs, run }) {
        return call('filter', args, inputs, run, config)
      },
      async rename({ args, inputs, run }) {
        return call('rename', args, inputs, run, config)
      },
      async delete({ args, inputs, run }) {
        return call('delete', args, inputs, run, config)
      },
      async export({ args, inputs, run }) {
        return call('export', args, inputs, run, config)
      },
    },
  })
}
