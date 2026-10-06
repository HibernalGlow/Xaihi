/**
 * bandia 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/bandia/src/core.ts`
 * （552 行）逐字搬来：类型、默认值、参数拼法、事件顺序、EFU 列序全部原样，
 * **一处逻辑都没改**。改动只有下面这些，全部是类型级的：
 * - 第 1 行那条 import：`@xiranite/contract` 的两个类型换成本包的 `./contract.ts` 垫片
 *   （理由见那个文件的头注释与 ADR-0002）。
 * - `BandiaItemResult.outputPath?`（上游 `:71`）与 `BandiaItemResult.command?`（上游 `:75`）
 *   写成 `?: T | undefined`。上游 `failedExtract`（`:489`）与 `failedCompress`（`:497`）把
 *   自己的可选参数原样塞进返回值，那两条在本仓的 `exactOptionalPropertyTypes` 下必须允许
 *   "键在、值为 undefined"；同一个接口里的其余可选成员没动。
 * - 垫片侧同一条理由：`NodeRunEvent.progress` 声明成 `?: number | undefined`，因为
 *   `emit()`（上游 `:450-452`）传的就是 `number | undefined`。
 * 无 `!` 新增：上游这份本来就写满了 `!`（`:301`、`:304`、`:465`、`:506`、`:509`、`:510`），
 * `noUncheckedIndexedAccess` 下零新增（两档严格度都实测过 `tsc --noEmit`）。
 *
 * 台账里这个节点的 hostRequirements 是 `file-io` + 外部程序（Bandizip）：本文件仍然
 * **零 I/O、零 spawn**，触达机动的动作全从 `BandiaRuntime` 那 13 个方法注入（`:50-65`，
 * 上游原本就这么设计）。落地实现分两处，按 DSH 有没有那条缝分：
 * - 文件与路径算术 → `src/platform.ts`（`node:fs`，判据与 ADR-0003 决定 1 同源）；
 * - `findBandizip` / `runCommand` / `openEverything` → `src/exec.ts`，走 DSH 的
 *   `ctx.subprocess`（`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬基础件」）。
 *
 * 会被"顺手优化"改掉的语义，逐条钉在这里：
 * - `stopRequested` 是**模块级全局**（`:97`）：`runBandia` 每次非 `stop` 动作都先把它清掉
 *   （`:175`），`stop` 只是置真并回一句 `Stop requested.`。G3 记着 `NodeCall` 不带取消信号，
 *   所以宿主面没有任何东西会调 `stop`——这条腿在 Xaihi 目前是死的，不在这里假装接上。
 * - `BandiaAction` 有 5 个值，而清单（上游 `node-definitions/bandia.json`）只声明 4 条动作：
 *   `stop` 没有对应的 `actions[]` 项，因此 `defineNode` 不会为它生成工具。两份各钉一条测试。
 * - `dryRun` 为真时 **连 Bandizip 都不找**：`bz = input.dryRun ? "bz" : await runtime.findBandizip()`
 *   （`:186`、`:292`），所以预演不需要装 Bandizip，产物里的 `command` 是 `bz …` 字面量。
 * - 内核的 `deleteAfter` / `deleteSource` 默认是 **true**（`:251`、`:351` 的 `?? true`），
 *   而清单里这两条字段的默认是 `{boolean: false}`。两份都不许统一（缺口 G8 的那一族）。
 *   `useTrash` 内核默认 **true**（`:253`），而清单里**没有**这条字段。
 * - `extractMode` 两条路：`auto` 走 `-target:auto` 并**先 `bz l` 猜输出目录**
 *   （`getAutoOutputPath`：跳过空行、`-` 开头、`date `/`attr ` 开头，第 5 列起当路径，
 *   只有唯一根目录时才用它，`:270-286`）；`normal` 走 `-o:<path>`，路径 =
 *   `dirname(归档)/<outputPrefix><去扩展名的名字>`，并先 `ensureDir`。
 * - `outputPrefix` 内核默认 `"[extract] "`（`:95`），上游终端面 `cli.ts:40` 那份常量是
 *   `"【a】"`。本包 `src/cli.ts` 的 `--outputPrefix` 不传值时**不下发**，落回内核那份；
 *   两条默认各钉一条测试，不许合并。
 * - 覆盖模式翻成 Bandizip 的开关：`skip → -aos`、`rename → -aou`、其余 `-aoa`（`:472-476`），
 *   且三条路径都带 `-y`。
 * - 压缩的参数是**相对名 + cwd**：`["a","-y",archivePath, basename(extractedPath)]` 配
 *   `{cwd: dirname(extractedPath)}`（`:331`、`:346`）——绝对路径进去会把整棵树抄一遍，
 *   上游测试 `runtime.commands[0]` 钉的就是这个形状。
 * - `ensureArchiveExtension` 的 `format || extname(path).slice(1) || "zip"`（`:479`）：
 *   `format` 由 `?? "zip"` 兜底，所以后两段只在**空串**格式时到达，不是死代码，别删。
 * - EFU 导出写的是 UTF-8 **BOM + CRLF**（`\ufeff` + `\r\n`，`:392`），列序
 *   `Filename,Size,Date Modified,Date Created,Attributes`，目录属性 `16`、文件 `32`，
 *   时间戳是 Windows FILETIME（`ms*10000 + 116444736000000000`，`:550-552`）。
 *   默认落点是 `join(tempDir(), "bandia_export.efu")`（`:390`）。
 * - `openInEverything` 的默认是 **false**（`:393`），并且它是**唯一**一条 GUI 启动腿。
 * - 并发只作用于解压：`parallel` 为假时 workers=1，为真时 `clamp(workers ?? 2, 1, 8)`（`:191`）；
 *   压缩/重打包是 `for` 串行（`:299-308`）。`runLimited` 先写 `nextIndex` 再 `await`（`:461-466`），
 *   所以结果数组按**输入序**回填，不是完成序。
 * - `emit()` 把当前文件名用竖线拼在 message 尾部：`${message}|${currentFile}`（`:451`）。
 *   账本侧要按整串读回，别在这里拆。
 * - 失败文本 `shortError` 取 stderr→stdout→`exit code N` 的第一非空，超过 500 字符时
 *   **留尾**并冠 `...`（`:537-540`）。
 * - `stripOuterQuotes` 先成对剥、再单侧剥剩下的一个引号（`:504-512`）；
 *   `parseBandiaPaths` 的分隔符是 `\r?\n`、`;` 与**裸空格**（`:101`），并且要求扩展名在
 *   `ARCHIVE_EXTENSIONS` 那 7 项里，整行不匹配时才退回"从文本里抓一个归档名"（`:109`）。
 * - `collectArchivePaths` 对 `paths` / `path` / `pathText` 三路合并后**再过滤**扩展名（`:410-416`），
 *   所以传目录给 extract 会被静默丢掉，报的是 `No archive paths provided.`。
 *
 * @module xaihi-bandia/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type BandiaAction = "extract" | "compress" | "repack" | "export_efu" | "stop"
export type BandiaExtractMode = "auto" | "normal"
export type BandiaOverwriteMode = "overwrite" | "skip" | "rename"
export type BandiaArchiveFormat = "zip" | "7z"

export interface BandiaPathMapping {
  archivePath: string
  extractedPath: string
}

export interface BandiaInput {
  action?: BandiaAction
  paths?: string[]
  path?: string
  pathText?: string
  mappings?: Array<BandiaPathMapping | Record<string, unknown>>
  mappingText?: string
  deleteAfter?: boolean
  useTrash?: boolean
  overwriteMode?: BandiaOverwriteMode
  parallel?: boolean
  workers?: number
  extractMode?: BandiaExtractMode
  outputPrefix?: string
  outputDir?: string
  compressFormat?: BandiaArchiveFormat
  deleteSource?: boolean
  efuOutputPath?: string
  openInEverything?: boolean
  dryRun?: boolean
}

export interface BandiaCommandResult {
  code: number
  stdout: string
  stderr: string
  durationMs?: number
}

export interface BandiaFileStat {
  exists: boolean
  isDirectory: boolean
  size: number
  mtimeMs: number
  ctimeMs: number
}

export interface BandiaRuntime {
  findBandizip: () => Promise<string | null>
  runCommand: (command: string, args: string[], options?: { cwd?: string }) => Promise<BandiaCommandResult>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<BandiaFileStat | null>
  ensureDir: (path: string) => Promise<void>
  removePath: (path: string, options?: { trash?: boolean }) => Promise<void>
  writeText: (path: string, content: string) => Promise<void>
  openEverything?: (efuPath: string) => Promise<void>
  tempDir: () => string
  dirname: (path: string) => string
  basename: (path: string) => string
  extname: (path: string) => string
  join: (...parts: string[]) => string
  resolve: (path: string) => string
}

export interface BandiaItemResult {
  kind: "extract" | "compress" | "export"
  sourcePath: string
  archivePath?: string
  outputPath?: string | undefined
  success: boolean
  durationMs: number
  fileSize?: number
  command?: string | undefined
  error?: string
  skipped?: boolean
}

export interface BandiaData {
  action: BandiaAction
  extractedCount: number
  compressedCount: number
  failedCount: number
  totalCount: number
  exportedCount: number
  efuPath?: string
  pathMappings: BandiaPathMapping[]
  results: BandiaItemResult[]
}

export type BandiaResult = NodeRunResult<BandiaData>

export const ARCHIVE_EXTENSIONS = [".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz"] as const
export const DEFAULT_OUTPUT_PREFIX = "[extract] "

let stopRequested = false

export function parseBandiaPaths(text = ""): string[] {
  const results: string[] = []
  for (const rawLine of text.split(/\r?\n|[;]/)) {
    const line = stripOuterQuotes(rawLine.trim())
    if (!line) continue
    if (isArchivePath(line)) {
      results.push(line)
      continue
    }

    const match = line.match(/(?:^|\s)([^\s"']+\.(?:zip|7z|rar|tar|gz|bz2|xz))(?:\s|$)/i)
    if (match?.[1]) results.push(stripOuterQuotes(match[1]))
  }
  return unique(results)
}

export function isArchivePath(path: string): boolean {
  return ARCHIVE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))
}

export function parsePathMappings(text = ""): BandiaPathMapping[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return normalizeMappings(parsed)
  } catch {
    const mappings: BandiaPathMapping[] = []
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      const parts = line.includes("=>")
        ? line.split("=>")
        : line.includes("\t")
          ? line.split("\t")
          : line.split("|")
      if (parts.length < 2) continue
      mappings.push({
        archivePath: stripOuterQuotes(parts[0]?.trim() ?? ""),
        extractedPath: stripOuterQuotes(parts.slice(1).join("|").trim()),
      })
    }
    return mappings.filter((mapping) => mapping.archivePath && mapping.extractedPath)
  }
}

export function normalizeMappings(value: unknown): BandiaPathMapping[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { mappings?: unknown }).mappings)
      ? (value as { mappings: unknown[] }).mappings
      : []

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      const archivePath = stringValue(record.archivePath) || stringValue(record.archive_path)
      const extractedPath = stringValue(record.extractedPath) || stringValue(record.extracted_path)
      return archivePath && extractedPath ? { archivePath, extractedPath } : null
    })
    .filter((item): item is BandiaPathMapping => Boolean(item))
}

export function mappingsToText(mappings: BandiaPathMapping[]): string {
  return JSON.stringify({ mappings }, null, 2)
}

export async function runBandia(input: BandiaInput, runtime: BandiaRuntime, onEvent?: (event: NodeRunEvent) => void): Promise<BandiaResult> {
  const action = input.action ?? "extract"
  if (action === "stop") {
    stopRequested = true
    return result(true, "Stop requested.", emptyData("stop"))
  }

  stopRequested = false
  if (action === "extract") return runExtract(input, runtime, onEvent)
  if (action === "compress" || action === "repack") return runCompress(action, input, runtime, onEvent)
  if (action === "export_efu") return runExportEfu(input, runtime, onEvent)
  return result(false, `Unknown action: ${String(action)}`, emptyData(action))
}

async function runExtract(input: BandiaInput, runtime: BandiaRuntime, onEvent?: (event: NodeRunEvent) => void): Promise<BandiaResult> {
  const archives = collectArchivePaths(input)
  if (!archives.length) return result(false, "No archive paths provided.", emptyData("extract"))

  const bz = input.dryRun ? "bz" : await runtime.findBandizip()
  if (!bz) return result(false, "Bandizip executable was not found. Set BANDIZIP_PATH or install Bandizip.", emptyData("extract"))

  const total = archives.length
  emit(onEvent, "progress", 0, `Preparing ${total} archive(s).`)
  const workers = input.parallel ? Math.max(1, Math.min(input.workers ?? 2, 8)) : 1
  const results = await runLimited(archives, workers, async (archive, index) => {
    if (stopRequested) return skippedExtract(archive, "Stopped by user.")
    emit(onEvent, "progress", progress(index, total), `Extracting ${index + 1}/${total}`, runtime.basename(archive))
    const item = await extractSingle(archive, bz, input, runtime)
    emit(onEvent, item.success ? "log" : "log", undefined, `${item.success ? "ok" : "fail"} ${runtime.basename(archive)}${item.error ? `: ${item.error}` : ""}`)
    emit(onEvent, "progress", progress(index + 1, total), `Extracted ${index + 1}/${total}`, runtime.basename(archive))
    return item
  })

  const ok = results.filter((item) => item.success)
  const data: BandiaData = {
    action: "extract",
    extractedCount: ok.length,
    compressedCount: 0,
    failedCount: results.length - ok.length,
    totalCount: results.length,
    exportedCount: 0,
    pathMappings: ok
      .filter((item) => item.outputPath)
      .map((item) => ({ archivePath: item.sourcePath, extractedPath: item.outputPath ?? "" })),
    results,
  }
  emit(onEvent, "progress", 100, "Extract complete.")
  return result(data.failedCount === 0, `Extract complete: ${data.extractedCount} succeeded, ${data.failedCount} failed.`, data)
}

async function extractSingle(archive: string, bz: string, input: BandiaInput, runtime: BandiaRuntime): Promise<BandiaItemResult> {
  const stat = await runtime.stat(archive)
  if (!stat?.exists) return failedExtract(archive, "Archive does not exist.")
  if (stat.isDirectory) return failedExtract(archive, "Archive path is a directory.")

  const overwrite = overwriteFlag(input.overwriteMode ?? "overwrite")
  const mode = input.extractMode ?? "auto"
  const outputPath = mode === "auto"
    ? await getAutoOutputPath(archive, bz, runtime)
    : runtime.join(runtime.dirname(archive), `${input.outputPrefix ?? DEFAULT_OUTPUT_PREFIX}${archiveStem(archive, runtime)}`)
  const args = mode === "auto"
    ? ["x", "-y", overwrite, "-target:auto", archive]
    : ["x", "-y", overwrite, `-o:${outputPath}`, archive]

  if (mode === "normal") await runtime.ensureDir(outputPath)
  if (input.dryRun) {
    return {
      kind: "extract",
      sourcePath: archive,
      outputPath,
      success: true,
      durationMs: 0,
      fileSize: stat.size,
      command: formatCommand(bz, args),
      skipped: true,
    }
  }

  const executed = await runtime.runCommand(bz, args)
  if (executed.code !== 0) {
    return failedExtract(archive, shortError(executed), executed.durationMs, stat.size, formatCommand(bz, args), outputPath)
  }

  if (input.deleteAfter ?? true) {
    try {
      await runtime.removePath(archive, { trash: input.useTrash ?? true })
    } catch {
      // Keep extraction successful; deletion is a follow-up cleanup failure in the original tool too.
    }
  }

  return {
    kind: "extract",
    sourcePath: archive,
    outputPath,
    success: true,
    durationMs: executed.durationMs ?? 0,
    fileSize: stat.size,
    command: formatCommand(bz, args),
  }
}

async function getAutoOutputPath(archive: string, bz: string, runtime: BandiaRuntime): Promise<string> {
  const fallback = runtime.join(runtime.dirname(archive), archiveStem(archive, runtime))
  const listed = await runtime.runCommand(bz, ["l", archive])
  if (listed.code !== 0) return fallback

  const roots = new Set<string>()
  for (const rawLine of listed.stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("-") || /^date\s+/i.test(line) || /^attr\s+/i.test(line)) continue
    const parts = line.split(/\s+/)
    if (parts.length < 5) continue
    const itemPath = parts.slice(4).join(" ")
    const root = itemPath.split(/[\\/]/)[0]
    if (root) roots.add(root)
  }
  return roots.size === 1 ? runtime.join(runtime.dirname(archive), [...roots][0] ?? archiveStem(archive, runtime)) : fallback
}

async function runCompress(action: "compress" | "repack", input: BandiaInput, runtime: BandiaRuntime, onEvent?: (event: NodeRunEvent) => void): Promise<BandiaResult> {
  const mappings = await collectMappings(input, runtime)
  if (!mappings.length) return result(false, "No valid path mappings or source paths provided.", emptyData(action))

  const bz = input.dryRun ? "bz" : await runtime.findBandizip()
  if (!bz) return result(false, "Bandizip executable was not found. Set BANDIZIP_PATH or install Bandizip.", emptyData(action))

  const total = mappings.length
  emit(onEvent, "progress", 0, `Preparing ${total} mapping(s).`)
  const results: BandiaItemResult[] = []

  for (let index = 0; index < mappings.length; index += 1) {
    if (stopRequested) {
      results.push(skippedCompress(mappings[index]!, "Stopped by user."))
      continue
    }
    const mapping = mappings[index]!
    emit(onEvent, "progress", progress(index, total), `Compressing ${index + 1}/${total}`, runtime.basename(mapping.extractedPath))
    results.push(await compressSingle(mapping, bz, input, runtime))
    emit(onEvent, "progress", progress(index + 1, total), `Compressed ${index + 1}/${total}`, runtime.basename(mapping.extractedPath))
  }

  const compressed = results.filter((item) => item.success).length
  const data: BandiaData = {
    action,
    extractedCount: 0,
    compressedCount: compressed,
    failedCount: results.length - compressed,
    totalCount: results.length,
    exportedCount: 0,
    pathMappings: mappings,
    results,
  }
  emit(onEvent, "progress", 100, "Compress complete.")
  return result(data.failedCount === 0, `${action === "repack" ? "Repack" : "Compress"} complete: ${data.compressedCount} succeeded, ${data.failedCount} failed.`, data)
}

async function compressSingle(mapping: BandiaPathMapping, bz: string, input: BandiaInput, runtime: BandiaRuntime): Promise<BandiaItemResult> {
  const stat = await runtime.stat(mapping.extractedPath)
  if (!stat?.exists) return failedCompress(mapping, "Source path does not exist.")

  const archivePath = ensureArchiveExtension(mapping.archivePath, input.compressFormat ?? "zip", runtime)
  await runtime.ensureDir(runtime.dirname(archivePath))
  const args = ["a", "-y", archivePath, runtime.basename(mapping.extractedPath)]

  if (input.dryRun) {
    return {
      kind: "compress",
      sourcePath: mapping.extractedPath,
      archivePath,
      success: true,
      durationMs: 0,
      fileSize: stat.size,
      command: formatCommand(bz, args),
      skipped: true,
    }
  }

  const executed = await runtime.runCommand(bz, args, { cwd: runtime.dirname(mapping.extractedPath) })
  if (executed.code !== 0) {
    return failedCompress(mapping, shortError(executed), executed.durationMs, formatCommand(bz, args), archivePath)
  }

  if (input.deleteSource ?? true) {
    await runtime.removePath(mapping.extractedPath, { trash: true })
  }

  return {
    kind: "compress",
    sourcePath: mapping.extractedPath,
    archivePath,
    success: true,
    durationMs: executed.durationMs ?? 0,
    fileSize: stat.size,
    command: formatCommand(bz, args),
  }
}

async function runExportEfu(input: BandiaInput, runtime: BandiaRuntime, onEvent?: (event: NodeRunEvent) => void): Promise<BandiaResult> {
  const candidates = normalizeMappings(input.mappings).map((mapping) => mapping.extractedPath)
  if (input.mappingText) candidates.push(...parsePathMappings(input.mappingText).map((mapping) => mapping.extractedPath))
  candidates.push(...collectRawPaths(input))

  const paths = unique(candidates)
  const rows: string[] = [csvRow(["Filename", "Size", "Date Modified", "Date Created", "Attributes"])]
  let exported = 0

  for (const item of paths) {
    const stat = await runtime.stat(item)
    if (!stat?.exists) continue
    rows.push(csvRow([
      runtime.resolve(item),
      stat.isDirectory ? "0" : String(stat.size),
      toFileTime(stat.mtimeMs),
      toFileTime(stat.ctimeMs),
      stat.isDirectory ? "16" : "32",
    ]))
    exported += 1
  }

  if (!exported) return result(false, "No existing paths were available for EFU export.", emptyData("export_efu"))

  const efuPath = input.efuOutputPath || runtime.join(runtime.tempDir(), "bandia_export.efu")
  emit(onEvent, "progress", 50, `Writing ${exported} EFU row(s).`)
  await runtime.writeText(efuPath, `\ufeff${rows.join("\r\n")}\r\n`)
  if (input.openInEverything ?? false) await runtime.openEverything?.(efuPath)

  const data: BandiaData = {
    action: "export_efu",
    extractedCount: 0,
    compressedCount: 0,
    failedCount: 0,
    totalCount: exported,
    exportedCount: exported,
    efuPath,
    pathMappings: [],
    results: paths.map((path) => ({ kind: "export", sourcePath: path, outputPath: efuPath, success: true, durationMs: 0 })),
  }
  emit(onEvent, "progress", 100, "EFU export complete.")
  return result(true, `Exported ${exported} path(s) to ${efuPath}.`, data)
}

function collectArchivePaths(input: BandiaInput): string[] {
  return unique([
    ...(input.paths ?? []),
    ...(input.path ? [input.path] : []),
    ...parseBandiaPaths(input.pathText),
  ].map((item) => stripOuterQuotes(item.trim())).filter(isArchivePath))
}

function collectRawPaths(input: BandiaInput): string[] {
  return unique([
    ...(input.paths ?? []),
    ...(input.path ? [input.path] : []),
    ...(input.pathText ?? "").split(/\r?\n|[;]/),
  ].map((item) => stripOuterQuotes(item.trim())).filter(Boolean))
}

async function collectMappings(input: BandiaInput, runtime: BandiaRuntime): Promise<BandiaPathMapping[]> {
  const explicit = [
    ...normalizeMappings(input.mappings),
    ...parsePathMappings(input.mappingText),
  ]
  if (explicit.length) return uniqueMappings(explicit)

  const sources = unique([...(input.paths ?? []), ...(input.path ? [input.path] : []), ...parseBandiaPaths(input.pathText)])
  const format = input.compressFormat ?? "zip"
  return sources.map((source) => {
    const archiveName = `${runtime.basename(source)}.${format}`
    const archivePath = input.outputDir ? runtime.join(input.outputDir, archiveName) : runtime.join(runtime.dirname(source), archiveName)
    return { archivePath, extractedPath: source }
  })
}

function emptyData(action: BandiaAction): BandiaData {
  return { action, extractedCount: 0, compressedCount: 0, failedCount: 0, totalCount: 0, exportedCount: 0, pathMappings: [], results: [] }
}

function result(success: boolean, message: string, data: BandiaData): BandiaResult {
  return { success, message, data }
}

function emit(onEvent: ((event: NodeRunEvent) => void) | undefined, type: NodeRunEvent["type"], progressValue: number | undefined, message: string, currentFile?: string): void {
  onEvent?.({ type, progress: progressValue, message: currentFile ? `${message}|${currentFile}` : message })
}

function progress(done: number, total: number): number {
  return Math.min(100, Math.max(0, Math.round((done / Math.max(total, 1)) * 100)))
}

async function runLimited<T, R>(items: T[], workers: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await task(items[index]!, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, worker))
  return results
}

function overwriteFlag(mode: BandiaOverwriteMode): string {
  if (mode === "skip") return "-aos"
  if (mode === "rename") return "-aou"
  return "-aoa"
}

function ensureArchiveExtension(path: string, format: BandiaArchiveFormat, runtime: BandiaRuntime): string {
  return isArchivePath(path) ? path : `${path}.${format || runtime.extname(path).slice(1) || "zip"}`
}

function archiveStem(path: string, runtime: BandiaRuntime): string {
  const name = runtime.basename(path)
  const ext = runtime.extname(name)
  return ext ? name.slice(0, -ext.length) : name
}

function failedExtract(path: string, error: string, durationMs = 0, fileSize = 0, command?: string, outputPath?: string): BandiaItemResult {
  return { kind: "extract", sourcePath: path, outputPath, success: false, durationMs, fileSize, command, error }
}

function skippedExtract(path: string, error: string): BandiaItemResult {
  return { kind: "extract", sourcePath: path, success: false, durationMs: 0, error, skipped: true }
}

function failedCompress(mapping: BandiaPathMapping, error: string, durationMs = 0, command?: string, archivePath = mapping.archivePath): BandiaItemResult {
  return { kind: "compress", sourcePath: mapping.extractedPath, archivePath, success: false, durationMs, command, error }
}

function skippedCompress(mapping: BandiaPathMapping, error: string): BandiaItemResult {
  return { kind: "compress", sourcePath: mapping.extractedPath, archivePath: mapping.archivePath, success: false, durationMs: 0, error, skipped: true }
}

function stripOuterQuotes(value: string): string {
  let resultValue = value.trim()
  while (resultValue.length >= 2 && isQuote(resultValue[0]!) && isQuote(resultValue[resultValue.length - 1]!)) {
    resultValue = resultValue.slice(1, -1).trim()
  }
  if (resultValue && isQuote(resultValue[0]!)) resultValue = resultValue.slice(1).trim()
  if (resultValue && isQuote(resultValue[resultValue.length - 1]!)) resultValue = resultValue.slice(0, -1).trim()
  return resultValue
}

function isQuote(value: string): boolean {
  return value === "\"" || value === "'"
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => value && !seen.has(value) && Boolean(seen.add(value)))
}

function uniqueMappings(values: BandiaPathMapping[]): BandiaPathMapping[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = `${value.archivePath}\0${value.extractedPath}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function shortError(resultValue: BandiaCommandResult): string {
  const message = (resultValue.stderr || resultValue.stdout || `exit code ${resultValue.code}`).trim()
  return message.length > 500 ? `...${message.slice(-497)}` : message
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map((part) => /\s/.test(part) ? `"${part.replace(/"/g, "\\\"")}"` : part).join(" ")
}

function csvRow(values: string[]): string {
  return values.map((value) => `"${value.replace(/"/g, "\"\"")}"`).join(",")
}

function toFileTime(milliseconds: number): string {
  return (BigInt(Math.round(milliseconds)) * 10000n + 116444736000000000n).toString()
}
