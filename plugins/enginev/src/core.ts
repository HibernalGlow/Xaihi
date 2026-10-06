/**
 * enginev 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/enginev/src/core.ts`
 * （596 行）逐字搬来：类型、默认值、排序比较器、模板展开与截断算式、EFU 之外的导出格式
 * 全部原样，**一处逻辑都没改**。唯一改动是第 1 行那条 import —— `@xiranite/contract`
 * 的两个类型换成本包的 `./contract.ts` 垫片（理由见那个文件的头注释与 ADR-0002）。
 * 无类型级让步：上游这份本来就写满了 `!`（`:221`、`:394`、`:418`、`:429`），
 * `noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes` 下零新增（实测 `tsc --noEmit`）。
 * 唯一需要放宽的是垫片那侧：`NodeRunEvent.progress` 声明成 `?: number | undefined`
 * （本文件的 `onEvent(...)` 调用点在 EOPT 下是干净的，垫片的形状要对齐上游 zod 可选字段
 * "可以缺席也可以是 undefined"的实际语义，见 `src/contract.ts`）。
 *
 * 台账里这个节点的 hostRequirements 是 `os-native` + `recursive-enumeration` + `file-io`。
 * 本文件仍然**零 I/O**：触达机器的动作全从 `EngineVRuntime` 那 12 个方法注入（`:73-86`，
 * 上游原本就这么设计），落地实现在 `src/platform.ts`（`node:fs`，判据与 ADR-0003 决定 1 同源；
 * 为什么不能整份改写成 DSH 的 `ctx.fs`，那份文件逐条写着）。**外部程序一个都不调**：
 * 上游 `platform.ts:32-57` 的 `readClipboardText()` 只服务引导流那条腿，缺口 G5 同源，
 * 本包照 `plugins/crashu/src/platform.ts` 的处理不搬。
 *
 * 会被"顺手优化"改掉的语义，逐条钉在这里：
 * - 输入同时吃 camelCase 与 snake_case（`:166-186`），`workshopPath` 还可以由 `path` 顶
 *   （`:169` 那条 `??` 链的顺序：`workshopPath` → `workshop_path` → `path`）。
 * - `dryRun` 内核默认 **true**（`:177`），与清单里那条字段的默认一致；上游终端面
 *   `cli.ts:234` 也是 `args.execute ? false : args.dryRun ?? true`。三处都预演，
 *   这一点与 rawfilter / crashu 的分叉相反，不许在这里"统一"成默认执行。
 * - `maxWorkers` 下限 1、`descMaxLength` 默认 18、`nameMaxLength` 默认 120（`:170`、`:175-176`），
 *   而 `maxWorkers` 在内核里**没有任何消费者**（扫目录是 `for` 串行，`:220-229`）——
 *   上游事实，别替它接上。
 * - `DEFAULT_WORKSHOP_PATH` 是一条写死的 Windows 路径（`:144`），清单里同值；
 *   Xaihi 侧的出口是 `Config.workshopPath`（ADR-0013），空串表示"不覆盖"，
 *   不覆盖时落回的就是清单/内核那份默认，**不在这里改写成"没配就拒"**（那是发明新拒绝）。
 * - `scanWorkshop` 排两次：先按目录名 `localeCompare(..., {numeric:true, sensitivity:"base"})`
 *   决定**扫描顺序**（`:217`），返回前再按 `sortWallpapers(results, "title", "asc")`
 *   按标题重排（`:231`）。上游测试钉的 `["222","111"]` 就是第二次排的结果。
 *   进度是百分数：`10 + round(index/len*70)`（`:222`），收尾由调用方补 100。
 * - 单个目录读失败是 `log` 事件 + 跳过（`:226-228`），不是整次失败——空 `catch` 的语义在这里。
 * - `readWallpaperFolder` 只认 `project.json`（`:235-237`：不存在或不是文件就返回 `null`），
 *   字段读的是 `contentrating`/`ratingsex`/`ratingviolence` **优先**、camelCase 兜后
 *   （`:249-251`，Wallpaper Engine 的 project.json 就是小写键）。
 * - `createdTime` / `modifiedTime` 写的是 `new Date(info.createdMs || Date.now()).toISOString()`
 *   （`:256-257`）：时间戳缺失时内核**自己**会拿现在的时间顶上。缝那边不许把这个洞喂给
 *   `Date.now()`——`src/platform.ts` 因此必须给真实 `ctimeMs`/`mtimeMs`，见那里的 G 说明。
 * - `folderSize` 是递归求和，目录项不计自身、只加里面的文件（`:469-476`）⇒ 这就是台账里
 *   那条 `recursive-enumeration`；深层目录没有软链防护，上游也没有，别在这里加。
 * - `filterWallpapers`：`title` 是**小写子串**，`contentRating`/`type`/`ratingSex`/
 *   `ratingViolence` 是**全等**，`tags` 是**任一命中**（`:263-279`）。
 * - `sortWallpapers` 在 `field === "none"` 时**不排**（只拷贝一份，`:282`）；
 *   `size` 用数值差，其余（含默认的 `title` 分支）用 `localeCompare(..., {numeric:true})`，
 *   `order` 默认 `desc` ⇒ 方向因子是 `-1`（`:283-289`）。
 * - `generateNewName` 的截断算式（`:315-321`）：超长时先找 `#<id>` 尾巴，
 *   `available = nameMaxLength - suffix.length - 1`，`available > 4` 才写 `...` 加尾巴，
 *   否则硬切到 `nameMaxLength`；全被清光时落回 `wallpaper.folderName`（`:322`）。
 * - `validateTemplate` 认 6 个占位符（`:327`），`[#{id}]{original_name}+{title}` 那份默认
 *   之所以合法，是因为 `{id}` 与 `{original_name}`、`{title}` 都在表里；
 *   模板里的非法字符检查是**先把占位符挖掉**再做的（`:329`），所以 `{title}` 里的 `:` 不算违规。
 * - `buildRenamePlan` 的去重是"撞了就 `_1`、`_2` …"，同时看**已规划集合**与**盘上是否已存在**
 *   （`uniqueFolderPath`，`:484-492`）；`copyMode && targetPath` 才换基目录（`:346`）。
 * - `rename` 动作先 `validateTemplate`，不合法就整次失败、**一个都不动**（`:386-387`）；
 *   执行时每条先 `ensureDir(dirname(newPath))` 再 `copyDir`/`movePath`，单条失败记 `status:"error"`
 *   继续下一条（`:400-411`）。
 * - `delete` 动作要求 `workshopIds` **非空**（`:423`），空列表是失败而不是"全删"；
 *   目的地由 `selectWallpapers(..., requireIds: true)` 精确匹配 id。
 *   trash 与否 = `!permanent`（`:436`），结局文案是 `trashed` / `deleted`（`:437`）。
 * - `export` 必须给 `exportPath`（`:452`）；内容是 `paths` 逐行 **或** `JSON.stringify(..., 2)`，
 *   **两种都以一个 `\n` 结尾**（`:455-457`），先 `ensureDir(dirname)` 再 `writeText`。
 * - `loadWallpapers`：给了 `wallpapers` 就用给的（`:464`，上游 TUI 靠它缓存），
 *   否则必须给 `workshopPath`，缺了是**抛异常**（`:465`）被 `runEngineV` 的 try 折成 `failure`。
 * - `failure()` 造的 `data` 是 `emptyData({errors:[message], failedCount:1})`（`:508-510`）：
 *   计数为 0、数组全空，界面上读回的是"1 条失败 + 那一句原因"。
 *
 * @module xaihi-enginev/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type EngineVAction = "scan" | "filter" | "rename" | "delete" | "export"
export type EngineVExportFormat = "json" | "paths"
export type EngineVRenameStatus = "planned" | "renamed" | "copied" | "deleted" | "error"
export type EngineVSortField = "none" | "size" | "title" | "createdTime" | "modifiedTime"
export type EngineVSortOrder = "asc" | "desc"

export interface EngineVFilterOptions {
  title?: string
  contentRating?: string
  contentrating?: string
  type?: string
  ratingSex?: string
  ratingsex?: string
  ratingViolence?: string
  ratingviolence?: string
  tags?: string[] | string
}

export interface EngineVInput {
  action?: EngineVAction
  path?: string
  workshopPath?: string
  workshop_path?: string
  maxWorkers?: number
  max_workers?: number
  filters?: EngineVFilterOptions
  wallpapers?: Array<EngineVWallpaper | Record<string, unknown>>
  workshopIds?: string[]
  workshop_ids?: string[]
  ids?: string[] | string
  template?: string
  descMaxLength?: number
  desc_max_length?: number
  nameMaxLength?: number
  name_max_length?: number
  dryRun?: boolean
  dry_run?: boolean
  permanent?: boolean
  copyMode?: boolean
  copy_mode?: boolean
  targetPath?: string
  target_path?: string
  exportFormat?: EngineVExportFormat
  export_format?: EngineVExportFormat
  exportPath?: string
  export_path?: string
  sortField?: EngineVSortField
  sort_field?: EngineVSortField
  sortOrder?: EngineVSortOrder
  sort_order?: EngineVSortOrder
}

export interface EngineVPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  size: number
  createdMs: number
  modifiedMs: number
}

export interface EngineVDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
  size: number
}

export interface EngineVRuntime {
  pathInfo: (path: string) => Promise<EngineVPathInfo>
  listDir: (path: string) => Promise<EngineVDirEntry[]>
  readJson: (path: string) => Promise<unknown>
  writeText: (path: string, content: string) => Promise<void>
  ensureDir: (path: string) => Promise<void>
  movePath: (source: string, target: string) => Promise<void>
  copyDir: (source: string, target: string) => Promise<void>
  removePath: (path: string, options?: { trash?: boolean }) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
  resolve: (path: string) => string
}

export interface EngineVWallpaper {
  path: string
  folderName: string
  workshopId: string
  title: string
  description: string
  contentRating: string
  ratingSex: string
  ratingViolence: string
  tags: string[]
  fileName: string
  preview: string
  wallpaperType: string
  createdTime: string
  modifiedTime: string
  size: number
  projectData: Record<string, unknown>
}

export interface EngineVRenameResult {
  workshopId: string
  title: string
  oldPath: string
  newPath: string
  oldName: string
  newName: string
  status: EngineVRenameStatus
  error?: string
}

export interface EngineVDeleteResult {
  workshopId: string
  title: string
  path: string
  status: EngineVRenameStatus
  message: string
}

export interface EngineVData {
  wallpapers: EngineVWallpaper[]
  filteredWallpapers: EngineVWallpaper[]
  totalCount: number
  filteredCount: number
  successCount: number
  failedCount: number
  typeStats: Record<string, number>
  ratingStats: Record<string, number>
  renameResults: EngineVRenameResult[]
  deleteResults: EngineVDeleteResult[]
  exportPath: string
  errors: string[]
}

export type EngineVResult = NodeRunResult<EngineVData>

export const DEFAULT_TEMPLATE = "[#{id}]{original_name}+{title}"
export const DEFAULT_WORKSHOP_PATH = "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960"

interface NormalizedEngineVInput {
  action: EngineVAction
  workshopPath: string
  maxWorkers: number
  filters: EngineVFilterOptions
  wallpapers: EngineVWallpaper[]
  workshopIds: string[]
  template: string
  descMaxLength: number
  nameMaxLength: number
  dryRun: boolean
  permanent: boolean
  copyMode: boolean
  targetPath: string
  exportFormat: EngineVExportFormat
  exportPath: string
  sortField: EngineVSortField
  sortOrder: EngineVSortOrder
}

export function normalizeEngineVInput(input: EngineVInput): NormalizedEngineVInput {
  return {
    action: input.action ?? "scan",
    workshopPath: clean(input.workshopPath ?? input.workshop_path ?? input.path),
    maxWorkers: Math.max(1, Math.floor(input.maxWorkers ?? input.max_workers ?? 4)),
    filters: input.filters ?? {},
    wallpapers: normalizeWallpapers(input.wallpapers ?? []),
    workshopIds: normalizeIds(input.workshopIds ?? input.workshop_ids ?? input.ids),
    template: clean(input.template) || DEFAULT_TEMPLATE,
    descMaxLength: Math.max(0, Math.floor(input.descMaxLength ?? input.desc_max_length ?? 18)),
    nameMaxLength: Math.max(0, Math.floor(input.nameMaxLength ?? input.name_max_length ?? 120)),
    dryRun: input.dryRun ?? input.dry_run ?? true,
    permanent: input.permanent ?? false,
    copyMode: input.copyMode ?? input.copy_mode ?? false,
    targetPath: clean(input.targetPath ?? input.target_path),
    exportFormat: input.exportFormat ?? input.export_format ?? "json",
    exportPath: clean(input.exportPath ?? input.export_path),
    sortField: input.sortField ?? input.sort_field ?? "none",
    sortOrder: input.sortOrder ?? input.sort_order ?? "desc",
  }
}

export async function runEngineV(
  input: EngineVInput,
  runtime: EngineVRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<EngineVResult> {
  const normalized = normalizeEngineVInput(input)
  try {
    if (normalized.action === "scan") return await runScan(normalized, runtime, onEvent)
    if (normalized.action === "filter") return await runFilter(normalized, runtime, onEvent)
    if (normalized.action === "rename") return await runRename(normalized, runtime, onEvent)
    if (normalized.action === "delete") return await runDelete(normalized, runtime, onEvent)
    return await runExport(normalized, runtime, onEvent)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export async function scanWorkshop(
  workshopPath: string,
  runtime: EngineVRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<EngineVWallpaper[]> {
  const root = runtime.resolve(workshopPath)
  const info = await runtime.pathInfo(root)
  if (!info.exists) throw new Error(`Workshop path does not exist: ${workshopPath}`)
  if (!info.isDirectory) throw new Error(`Workshop path is not a directory: ${workshopPath}`)

  const entries = (await runtime.listDir(root))
    .filter((entry) => entry.isDirectory)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
  const results: EngineVWallpaper[] = []

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!
    onEvent({ type: "progress", progress: 10 + Math.round((index / Math.max(entries.length, 1)) * 70), message: `Scanning ${entry.name}` })
    try {
      const wallpaper = await readWallpaperFolder(entry.path, runtime)
      if (wallpaper) results.push(wallpaper)
    } catch (error) {
      onEvent({ type: "log", message: `Skipped ${entry.name}: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  return sortWallpapers(results, "title", "asc")
}

export async function readWallpaperFolder(folderPath: string, runtime: EngineVRuntime): Promise<EngineVWallpaper | null> {
  const projectPath = runtime.join(folderPath, "project.json")
  const projectInfo = await runtime.pathInfo(projectPath)
  if (!projectInfo.exists || !projectInfo.isFile) return null

  const projectData = asRecord(await runtime.readJson(projectPath))
  const info = await runtime.pathInfo(folderPath)
  const size = await folderSize(folderPath, runtime)
  const folderName = runtime.basename(folderPath)
  return {
    path: runtime.resolve(folderPath),
    folderName,
    workshopId: folderName,
    title: stringValue(projectData.title),
    description: stringValue(projectData.description),
    contentRating: stringValue(projectData.contentrating ?? projectData.contentRating),
    ratingSex: stringValue(projectData.ratingsex ?? projectData.ratingSex),
    ratingViolence: stringValue(projectData.ratingviolence ?? projectData.ratingViolence),
    tags: Array.isArray(projectData.tags) ? projectData.tags.map(String) : [],
    fileName: stringValue(projectData.file),
    preview: stringValue(projectData.preview),
    wallpaperType: stringValue(projectData.type),
    createdTime: new Date(info.createdMs || Date.now()).toISOString(),
    modifiedTime: new Date(info.modifiedMs || Date.now()).toISOString(),
    size,
    projectData,
  }
}

export function filterWallpapers(wallpapers: EngineVWallpaper[], filters: EngineVFilterOptions): EngineVWallpaper[] {
  const title = clean(filters.title).toLowerCase()
  const contentRating = clean(filters.contentRating ?? filters.contentrating)
  const type = clean(filters.type)
  const ratingSex = clean(filters.ratingSex ?? filters.ratingsex)
  const ratingViolence = clean(filters.ratingViolence ?? filters.ratingviolence)
  const tags = normalizeTags(filters.tags)
  return wallpapers.filter((wallpaper) => {
    if (title && !wallpaper.title.toLowerCase().includes(title)) return false
    if (contentRating && wallpaper.contentRating !== contentRating) return false
    if (type && wallpaper.wallpaperType !== type) return false
    if (ratingSex && wallpaper.ratingSex !== ratingSex) return false
    if (ratingViolence && wallpaper.ratingViolence !== ratingViolence) return false
    if (tags.length && !tags.some((tag) => wallpaper.tags.includes(tag))) return false
    return true
  })
}

export function sortWallpapers(wallpapers: EngineVWallpaper[], field: EngineVSortField = "none", order: EngineVSortOrder = "desc"): EngineVWallpaper[] {
  if (field === "none") return [...wallpapers]
  const direction = order === "asc" ? 1 : -1
  return [...wallpapers].sort((a, b) => {
    if (field === "size") return (a.size - b.size) * direction
    if (field === "createdTime") return a.createdTime.localeCompare(b.createdTime) * direction
    if (field === "modifiedTime") return a.modifiedTime.localeCompare(b.modifiedTime) * direction
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) * direction
  })
}

export function generateNewName(
  wallpaper: EngineVWallpaper,
  template: string,
  options: { descMaxLength?: number; nameMaxLength?: number } = {},
): string {
  const descMaxLength = options.descMaxLength ?? 18
  const nameMaxLength = options.nameMaxLength ?? 120
  let description = wallpaper.description.trim().replace(/[\r\n]+/g, " ")
  if (descMaxLength > 0 && description.length > descMaxLength) description = `${description.slice(0, descMaxLength)}...`

  const values: Record<string, string> = {
    "{id}": wallpaper.workshopId,
    "{title}": wallpaper.title,
    "{original_name}": wallpaper.folderName,
    "{type}": wallpaper.wallpaperType,
    "{rating}": wallpaper.contentRating,
    "{desc}": description,
  }

  let next = template
  for (const [placeholder, value] of Object.entries(values)) next = next.split(placeholder).join(value)
  next = sanitizePathSegment(next)

  if (nameMaxLength > 0 && next.length > nameMaxLength) {
    const idSuffix = `#${wallpaper.workshopId}`
    const suffixIndex = next.lastIndexOf(idSuffix)
    const suffix = suffixIndex >= 0 ? next.slice(suffixIndex) : ""
    const available = suffix ? nameMaxLength - suffix.length - 1 : nameMaxLength
    next = available > 4 ? `${next.slice(0, available - 3)}...${suffix ? ` ${suffix}` : ""}` : next.slice(0, nameMaxLength)
  }
  return next || wallpaper.folderName
}

export function validateTemplate(template: string): string[] {
  const issues: string[] = []
  const valid = new Set(["{id}", "{title}", "{original_name}", "{type}", "{rating}", "{desc}"])
  if (!/[{}]/.test(template) || ![...valid].some((placeholder) => template.includes(placeholder))) issues.push("Template does not include a known placeholder.")
  if (/[<>:"\/\\|?*\x00-\x1f]/.test(template.replace(/\{[^}]+\}/g, ""))) issues.push("Template contains illegal path characters outside placeholders.")
  for (const match of template.match(/\{[^}]+\}/g) ?? []) {
    if (!valid.has(match)) issues.push(`Unknown placeholder: ${match}`)
  }
  return issues
}

export async function buildRenamePlan(
  wallpapers: EngineVWallpaper[],
  input: Pick<NormalizedEngineVInput, "workshopIds" | "template" | "descMaxLength" | "nameMaxLength" | "copyMode" | "targetPath">,
  runtime: Pick<EngineVRuntime, "join" | "dirname" | "pathInfo">,
): Promise<EngineVRenameResult[]> {
  const targets = selectWallpapers(wallpapers, input.workshopIds, false)
  const planned = new Set<string>()
  const results: EngineVRenameResult[] = []
  for (const wallpaper of targets) {
    const newName = generateNewName(wallpaper, input.template, { descMaxLength: input.descMaxLength, nameMaxLength: input.nameMaxLength })
    const baseDir = input.copyMode && input.targetPath ? input.targetPath : runtime.dirname(wallpaper.path)
    const newPath = await uniqueFolderPath(runtime.join(baseDir, newName), planned, runtime)
    planned.add(newPath)
    results.push({
      workshopId: wallpaper.workshopId,
      title: wallpaper.title,
      oldPath: wallpaper.path,
      newPath,
      oldName: wallpaper.folderName,
      newName: pathName(newPath),
      status: "planned",
    })
  }
  return results
}

export function calculateStats(wallpapers: EngineVWallpaper[]): Pick<EngineVData, "typeStats" | "ratingStats"> {
  const typeStats: Record<string, number> = {}
  const ratingStats: Record<string, number> = {}
  for (const wallpaper of wallpapers) {
    if (wallpaper.wallpaperType) typeStats[wallpaper.wallpaperType] = (typeStats[wallpaper.wallpaperType] ?? 0) + 1
    if (wallpaper.contentRating) ratingStats[wallpaper.contentRating] = (ratingStats[wallpaper.contentRating] ?? 0) + 1
  }
  return { typeStats, ratingStats }
}

async function runScan(normalized: NormalizedEngineVInput, runtime: EngineVRuntime, onEvent: (event: NodeRunEvent) => void): Promise<EngineVResult> {
  if (!normalized.workshopPath) return failure("Workshop path is required.")
  const wallpapers = await scanWorkshop(normalized.workshopPath, runtime, onEvent)
  onEvent({ type: "progress", progress: 100, message: "Scan complete." })
  return success(`Scan complete: ${wallpapers.length} wallpaper(s).`, dataWithWallpapers(wallpapers, wallpapers))
}

async function runFilter(normalized: NormalizedEngineVInput, runtime: EngineVRuntime, onEvent: (event: NodeRunEvent) => void): Promise<EngineVResult> {
  const wallpapers = await loadWallpapers(normalized, runtime, onEvent)
  const filtered = sortWallpapers(filterWallpapers(wallpapers, normalized.filters), normalized.sortField, normalized.sortOrder)
  return success(`Filter complete: ${filtered.length}/${wallpapers.length} wallpaper(s).`, dataWithWallpapers(wallpapers, filtered))
}

async function runRename(normalized: NormalizedEngineVInput, runtime: EngineVRuntime, onEvent: (event: NodeRunEvent) => void): Promise<EngineVResult> {
  const issues = validateTemplate(normalized.template)
  if (issues.length) return failure(issues.join(" "))
  const allWallpapers = await loadWallpapers(normalized, runtime, onEvent)
  const wallpapers = filterWallpapers(allWallpapers, normalized.filters)
  const plan = await buildRenamePlan(wallpapers, normalized, runtime)
  const results: EngineVRenameResult[] = []

  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]!
    onEvent({ type: "progress", progress: 15 + Math.round((index / Math.max(plan.length, 1)) * 80), message: item.oldName })
    if (normalized.dryRun) {
      results.push(item)
      continue
    }
    try {
      await runtime.ensureDir(runtime.dirname(item.newPath))
      if (normalized.copyMode) {
        await runtime.copyDir(item.oldPath, item.newPath)
        results.push({ ...item, status: "copied" })
      } else {
        await runtime.movePath(item.oldPath, item.newPath)
        results.push({ ...item, status: "renamed" })
      }
    } catch (error) {
      results.push({ ...item, status: "error", error: error instanceof Error ? error.message : String(error) })
    }
  }

  const failed = results.filter((item) => item.status === "error").length
  return {
    success: failed === 0,
    message: normalized.dryRun ? `Rename plan complete: ${results.length} item(s).` : `Rename complete: ${results.length - failed} succeeded, ${failed} failed.`,
    data: { ...dataWithWallpapers(allWallpapers, wallpapers), renameResults: results, successCount: results.length - failed, failedCount: failed, errors: results.filter((item) => item.error).map((item) => item.error!) },
  }
}

async function runDelete(normalized: NormalizedEngineVInput, runtime: EngineVRuntime, onEvent: (event: NodeRunEvent) => void): Promise<EngineVResult> {
  if (!normalized.workshopIds.length) return failure("Delete requires at least one workshop id.")
  const wallpapers = await loadWallpapers(normalized, runtime, onEvent)
  const targets = selectWallpapers(wallpapers, normalized.workshopIds, true)
  const results: EngineVDeleteResult[] = []

  for (let index = 0; index < targets.length; index += 1) {
    const wallpaper = targets[index]!
    onEvent({ type: "progress", progress: 15 + Math.round((index / Math.max(targets.length, 1)) * 80), message: wallpaper.folderName })
    if (normalized.dryRun) {
      results.push({ workshopId: wallpaper.workshopId, title: wallpaper.title, path: wallpaper.path, status: "planned", message: "dry_run" })
      continue
    }
    try {
      await runtime.removePath(wallpaper.path, { trash: !normalized.permanent })
      results.push({ workshopId: wallpaper.workshopId, title: wallpaper.title, path: wallpaper.path, status: "deleted", message: normalized.permanent ? "deleted" : "trashed" })
    } catch (error) {
      results.push({ workshopId: wallpaper.workshopId, title: wallpaper.title, path: wallpaper.path, status: "error", message: error instanceof Error ? error.message : String(error) })
    }
  }

  const failed = results.filter((item) => item.status === "error").length
  return {
    success: failed === 0,
    message: normalized.dryRun ? `Delete plan complete: ${results.length} item(s).` : `Delete complete: ${results.length - failed} succeeded, ${failed} failed.`,
    data: { ...dataWithWallpapers(wallpapers, wallpapers), deleteResults: results, successCount: results.length - failed, failedCount: failed, errors: results.filter((item) => item.status === "error").map((item) => item.message) },
  }
}

async function runExport(normalized: NormalizedEngineVInput, runtime: EngineVRuntime, onEvent: (event: NodeRunEvent) => void): Promise<EngineVResult> {
  if (!normalized.exportPath) return failure("Export path is required.")
  const wallpapers = await loadWallpapers(normalized, runtime, onEvent)
  const filtered = sortWallpapers(filterWallpapers(wallpapers, normalized.filters), normalized.sortField, normalized.sortOrder)
  const content = normalized.exportFormat === "paths"
    ? `${filtered.map((wallpaper) => wallpaper.path).join("\n")}\n`
    : `${JSON.stringify(filtered, null, 2)}\n`
  await runtime.ensureDir(runtime.dirname(normalized.exportPath))
  await runtime.writeText(normalized.exportPath, content)
  return success(`Export complete: ${filtered.length} item(s).`, { ...dataWithWallpapers(wallpapers, filtered), exportPath: normalized.exportPath })
}

async function loadWallpapers(normalized: NormalizedEngineVInput, runtime: EngineVRuntime, onEvent: (event: NodeRunEvent) => void): Promise<EngineVWallpaper[]> {
  if (normalized.wallpapers.length) return normalized.wallpapers
  if (!normalized.workshopPath) throw new Error("Workshop path or wallpapers are required.")
  return scanWorkshop(normalized.workshopPath, runtime, onEvent)
}

async function folderSize(path: string, runtime: EngineVRuntime): Promise<number> {
  let total = 0
  for (const entry of await runtime.listDir(path)) {
    if (entry.isFile) total += entry.size
    else if (entry.isDirectory) total += await folderSize(entry.path, runtime)
  }
  return total
}

function selectWallpapers(wallpapers: EngineVWallpaper[], ids: string[], requireIds: boolean): EngineVWallpaper[] {
  if (!ids.length) return requireIds ? [] : wallpapers
  const selected = new Set(ids)
  return wallpapers.filter((wallpaper) => selected.has(wallpaper.workshopId))
}

async function uniqueFolderPath(path: string, planned: Set<string>, runtime: Pick<EngineVRuntime, "pathInfo" | "dirname" | "join">): Promise<string> {
  let candidate = path
  let suffix = 1
  while (planned.has(candidate) || (await runtime.pathInfo(candidate)).exists) {
    candidate = `${path}_${suffix}`
    suffix += 1
  }
  return candidate
}

function dataWithWallpapers(wallpapers: EngineVWallpaper[], filteredWallpapers: EngineVWallpaper[]): EngineVData {
  return emptyData({
    wallpapers,
    filteredWallpapers,
    totalCount: wallpapers.length,
    filteredCount: filteredWallpapers.length,
    ...calculateStats(wallpapers),
  })
}

function success(message: string, data: EngineVData): EngineVResult {
  return { success: true, message, data }
}

function failure(message: string): EngineVResult {
  return { success: false, message, data: emptyData({ errors: [message], failedCount: 1 }) }
}

function emptyData(partial: Partial<EngineVData> = {}): EngineVData {
  return {
    wallpapers: [],
    filteredWallpapers: [],
    totalCount: 0,
    filteredCount: 0,
    successCount: 0,
    failedCount: 0,
    typeStats: {},
    ratingStats: {},
    renameResults: [],
    deleteResults: [],
    exportPath: "",
    errors: [],
    ...partial,
  }
}

function normalizeWallpapers(value: Array<EngineVWallpaper | Record<string, unknown>>): EngineVWallpaper[] {
  return value.map((item) => {
    const record = item as Record<string, unknown>
    return {
      path: stringValue(record.path),
      folderName: stringValue(record.folderName ?? record.folder_name),
      workshopId: stringValue(record.workshopId ?? record.workshop_id),
      title: stringValue(record.title),
      description: stringValue(record.description),
      contentRating: stringValue(record.contentRating ?? record.content_rating),
      ratingSex: stringValue(record.ratingSex ?? record.rating_sex),
      ratingViolence: stringValue(record.ratingViolence ?? record.rating_violence),
      tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
      fileName: stringValue(record.fileName ?? record.file_name),
      preview: stringValue(record.preview),
      wallpaperType: stringValue(record.wallpaperType ?? record.wallpaper_type),
      createdTime: stringValue(record.createdTime ?? record.created_time),
      modifiedTime: stringValue(record.modifiedTime ?? record.modified_time),
      size: Number(record.size ?? 0),
      projectData: asRecord(record.projectData ?? record.project_data),
    }
  }).filter((item) => item.path && item.workshopId)
}

function normalizeIds(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return unique(value.map(clean).filter(Boolean))
  if (typeof value === "string") return unique(value.split(/[,;\s]+/).map(clean).filter(Boolean))
  return []
}

function normalizeTags(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.map(String).map(clean).filter(Boolean)
  if (typeof value === "string") return value.split(/[,;\s]+/).map(clean).filter(Boolean)
  return []
}

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[<>:"\/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
}

function pathName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function clean(value = ""): string {
  return value.trim().replace(/^["']|["']$/g, "")
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}
