/**
 * Marku 的内核，从 `<Xiranite>` tag `noxide` 基线（只读档
 * `.scratch/xiranite-noxide/packages/nodes/marku/src/core.ts`，**556 行**）逐字搬来：类型、
 * 9 个模块枚举、函数顺序、消息文案、历史条数上限全部原样，**一处逻辑都没改**。
 * 唯一改动是第 1 行那条 import —— `@xiranite/contract` 的两个类型换成本包的
 * `./contract.ts` 垫片（理由见那个文件的头注释与 `docs/adr/0002-self-contained-plugin-packages.md`）。
 * 差多少是有数的：与本基线文件逐行比，**恰好删掉 1 行**（那条 import），其余全是新增。
 *
 * 会被"顺手优化"改掉的语义，逐条钉在这里（行号指基线文件）：
 * - 动作 `action` 缺省时由**输入形状**推：有 `inputText`/"input_text" 就是 `text`，否则 `run`（`:125`）。
 *   `MarkuAction` 有 5 个值，其中 `workflow` 只在 `core.ts` 与基线 CLI 之间存在，
 *   `node-definitions/marku.json` 的动作表只声明 4 条（`text`/`run`/`history`/`undo`）⇒
 *   宿主面上没有 `marku_workflow` 这个工具，这一腿只有 `marku workflow` 走得到。
 * - `module` 缺省 `"markt"`；`MARKU_MODULES`（`:111-121`）那 9 条的**次序**就是模块工具箱
 *   下拉的次序，基线 `interaction.ts` 的图标数组（`≡ # ◇ ▦ Aa ↔ 1. ▣ ☷`）按同一下标配它，
 *   排序或改名会让图标串位。
 * - `dryRun` 内核默认 **true**（`:132`），与 `crashu` 那份（默认 false）相反 ⇒ 终端面与宿主面
 *   都不许照抄另一家的默认值。`enableUndo` 默认 true，`recursive` 默认 false。
 * - camelCase 与 snake_case 两套键名同时吃（`:123-136`），`paths` 走 `uniqueClean`
 *   （去首尾空白 + 剥一层引号 + Set 保序去重，`:525-531`）。
 * - `run` 腿的撤销记录在**写盘之后**（`:186-188`），而 `workflow` 腿的记录在**写盘之前**
 *   （`:276-278`，注释写着"No retry and no silent rollback"）：两条腿的顺序不一样是上游
 *   的既有设计，不许统一成一条。
 * - `workflow` 腿分两段：先把每个源**完整算完**（`:247-261`）再一次性写（`:279-289`）；
 *   评估期出错就一条都不写，写入期出错报 `Write failed at <path>: <msg>` 并**保留**已写的
 *   那份与撤销记录。`inputText` 优先于 `paths`（`:223`）。
 * - 历史：`history` 只回前 **20** 条（`:420`），落盘只留前 **100** 条（`:450`）；
 *   `undo` 缺省取**第一条未撤销**的记录，给了 `undoId` 就按 id 找（`:426`）。
 *   账本损坏（JSON 解析失败/不是数组/条目缺 id|files）一律当**空历史**（`:458-467`），不抛。
 * - `createUnifiedDiff`（`:338-342`）从 `diff` 那份补丁里切掉头部（`slice(indexOf("--- "))`），
 *   两边相同就返回空串。
 * - Markdown 文件的判据是 `\.(md|markdown|mdown)$`（`:505`），收集结果**去重后按
 *   numeric-aware、sensitivity=base 的比较器排序**（`:321`），目录只在 `recursive` 时下降。
 * - `applyMarkuModule`（`:324-336`）对 9 个 id 是全覆盖的纯函数；`applyWorkflowStep`（`:300-303`）
 *   对未知 id **抛** `Unknown module: <id>`（不是返回原文），工作流校验器 `:`:214` 先用
 *   `validateMarkuWorkflowForRun` 挡一遍。
 *
 * 台账：本文件的 I/O 与宿主能力全部从 `MarkuRuntime` 那 **10 个方法**注入（`:96-107`，
 * 基线本来就这么设计），落地实现在 `src/platform.ts`；判据见
 * `docs/adr/0003-migrated-node-file-state.md` 决定 1。**这里仍然零 `node:fs`**。
 *
 * 两个第三方裸依赖（`diff` 在第 2 行、`./markdown-ast.ts` 里的 `remark`）本仓**没有装**，
 * 也没有按"新依赖要人拍板"的口径擅自加进 `package.json` —— 请求与影响面写在
 * `docs/service-mapping.md` 的缺口台账对应条目与本包的 `src/markdown-ast.ts` 头注释里。
 *
 * @module xaihi-marku/core
 */
import type { NodeRunEvent, NodeRunResult } from "./contract.ts"
import { createTwoFilesPatch } from "diff"
import { transformContentDedup, transformImagePaths, transformMarkt, transformTitles } from "./markdown-transforms.js"
import type { MarkuWorkflowSourceResult } from "./workflow.js"
import { evaluateMarkuWorkflowSource, normalizeMarkuWorkflow, validateMarkuWorkflowForRun } from "./workflow.js"

export type MarkuAction = "run" | "text" | "history" | "undo" | "workflow"
export type MarkuModuleId =
  | "markt"
  | "consecutive_header"
  | "content_dedup"
  | "html2sy_table"
  | "title_convert"
  | "content_replace"
  | "single_orderlist_remover"
  | "image_path_replacer"
  | "t2list"

export interface MarkuInput {
  action?: MarkuAction
  module?: MarkuModuleId | string
  paths?: string[]
  inputText?: string
  input_text?: string
  stepConfig?: Record<string, unknown>
  step_config?: Record<string, unknown>
  recursive?: boolean
  dryRun?: boolean
  dry_run?: boolean
  enableUndo?: boolean
  enable_undo?: boolean
  historyPath?: string
  history_path?: string
  undoId?: string
  undo_id?: string
  /** Complete workflow definition for the "workflow" action; named workflows are resolved by the caller. */
  workflow?: unknown
}

export interface MarkuPathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
}

export interface MarkuDirEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
}

export interface MarkuFileDiff {
  file: string
  diff: string
  changed: boolean
}

export interface MarkuUndoFile {
  path: string
  content: string
}

export interface MarkuUndoRecord {
  id: string
  timestamp: string
  module: string
  summary: string
  files: MarkuUndoFile[]
  undone?: boolean
}

/** Transient result of one workflow run; never persisted into the reusable workflow library. */
export interface MarkuWorkflowRunData {
  workflowId: string
  workflowName: string
  stepCount: number
  sources: MarkuWorkflowSourceResult[]
}

export interface MarkuData {
  filesProcessed: number
  filesChanged: number
  inputText: string
  outputText: string
  diffText: string
  diffs: MarkuFileDiff[]
  history: MarkuUndoRecord[]
  undoId: string
  errors: string[]
  /** Present only after a workflow run. Normal-mode result fields stay unchanged. */
  workflow?: MarkuWorkflowRunData
}

export interface MarkuRuntime {
  pathInfo: (path: string) => Promise<MarkuPathInfo>
  listDir: (path: string) => Promise<MarkuDirEntry[]>
  readText: (path: string) => Promise<string | null>
  writeText: (path: string, content: string) => Promise<void>
  join: (...parts: string[]) => string
  dirname: (path: string) => string
  basename: (path: string) => string
  now: () => Date
  randomId: () => string
  defaultHistoryPath: () => string
}

export type MarkuResult = NodeRunResult<MarkuData>

export const MARKU_MODULES: Array<{ id: MarkuModuleId; name: string }> = [
  { id: "markt", name: "Heading/list converter" },
  { id: "consecutive_header", name: "Consecutive heading cleanup" },
  { id: "content_dedup", name: "Content deduplication" },
  { id: "html2sy_table", name: "HTML table to Markdown" },
  { id: "title_convert", name: "Title normalization" },
  { id: "content_replace", name: "Content replacement" },
  { id: "single_orderlist_remover", name: "Single ordered-list remover" },
  { id: "image_path_replacer", name: "Image path replacer" },
  { id: "t2list", name: "Table to list" },
]

export function normalizeMarkuInput(input: MarkuInput): Required<Omit<MarkuInput, "input_text" | "step_config" | "dry_run" | "enable_undo" | "history_path" | "undo_id">> {
  return {
    action: input.action ?? (input.inputText || input.input_text ? "text" : "run"),
    workflow: input.workflow,
    module: input.module ?? "markt",
    paths: uniqueClean(input.paths ?? []),
    inputText: input.inputText ?? input.input_text ?? "",
    stepConfig: input.stepConfig ?? input.step_config ?? {},
    recursive: input.recursive ?? false,
    dryRun: input.dryRun ?? input.dry_run ?? true,
    enableUndo: input.enableUndo ?? input.enable_undo ?? true,
    historyPath: clean(input.historyPath ?? input.history_path),
    undoId: clean(input.undoId ?? input.undo_id),
  }
}

export async function runMarku(
  input: MarkuInput,
  runtime: MarkuRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<MarkuResult> {
  const normalized = normalizeMarkuInput(input)
  try {
    if (normalized.action === "history") return await history(normalized, runtime)
    if (normalized.action === "undo") return await undo(normalized, runtime, onEvent)
    if (normalized.action === "workflow") return await runWorkflowAction(normalized, runtime, onEvent)
    if (!isMarkuModuleId(normalized.module)) return failure(`Unknown module: ${normalized.module}`)

    if (normalized.inputText || normalized.action === "text") {
      const outputText = applyMarkuModule(normalized.module, normalized.inputText, normalized.stepConfig)
      const diffText = createUnifiedDiff(normalized.inputText, outputText, "input.md")
      return success(outputText === normalized.inputText ? "Text processed: no changes." : "Text processed: changed.", {
        filesProcessed: 1,
        filesChanged: outputText === normalized.inputText ? 0 : 1,
        inputText: normalized.inputText,
        outputText,
        diffText,
      })
    }

    if (!normalized.paths.length) return failure("No input paths or text provided.")
    onEvent({ type: "progress", progress: 10, message: "Collecting Markdown files." })
    const files = await collectMarkdownFiles(normalized.paths, normalized.recursive, runtime)
    if (!files.length) return failure("No Markdown files found.")

    const diffs: MarkuFileDiff[] = []
    const originals: MarkuUndoFile[] = []
    let changed = 0
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      onEvent({ type: "progress", progress: 10 + Math.round((index / files.length) * 80), message: runtime.basename(file) })
      const original = await runtime.readText(file)
      if (original === null) continue
      const output = applyMarkuModule(normalized.module, original, normalized.stepConfig)
      const didChange = output !== original
      if (didChange) {
        changed += 1
        originals.push({ path: file, content: original })
        if (!normalized.dryRun) await runtime.writeText(file, output)
      }
      diffs.push({ file, changed: didChange, diff: didChange ? createUnifiedDiff(original, output, runtime.basename(file)) : "" })
    }

    const undoId = normalized.enableUndo && !normalized.dryRun && originals.length
      ? await recordUndo(normalized, originals, runtime)
      : ""

    onEvent({ type: "progress", progress: 100, message: "Marku completed." })
    return success(`Processed ${files.length} file(s), ${changed} changed${normalized.dryRun ? " (dry-run)" : ""}.`, {
      filesProcessed: files.length,
      filesChanged: changed,
      diffs,
      undoId,
    })
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Workflow action: evaluate every source completely in memory, then write
 * changed final outputs. Editor text wins over paths, mirroring run/text
 * precedence; each discovered file is an independent source run.
 */
async function runWorkflowAction(
  normalized: ReturnType<typeof normalizeMarkuInput>,
  runtime: MarkuRuntime,
  onEvent: (event: NodeRunEvent) => void,
): Promise<MarkuResult> {
  const workflow = normalizeMarkuWorkflow(normalized.workflow)
  if (!workflow) return failure("Workflow definition is missing or malformed.")
  const validationError = validateMarkuWorkflowForRun(workflow, isMarkuModuleId)
  if (validationError) return failure(validationError)
  const runData = (sources: MarkuWorkflowSourceResult[]): MarkuWorkflowRunData => ({
    workflowId: workflow.id,
    workflowName: workflow.name,
    stepCount: workflow.steps.length,
    sources,
  })

  if (normalized.inputText) {
    const source = evaluateMarkuWorkflowSource(workflow, { sourceId: "input.md", sourceLabel: "input.md", text: normalized.inputText }, applyWorkflowStep)
    if (source.error) return failure(source.error, { workflow: runData([source]) })
    const changed = source.outputText !== normalized.inputText
    return success(changed ? "Workflow processed text: changed." : "Workflow processed text: no changes.", {
      filesProcessed: 1,
      filesChanged: changed ? 1 : 0,
      inputText: normalized.inputText,
      outputText: source.outputText,
      diffText: createUnifiedDiff(normalized.inputText, source.outputText, "input.md"),
      workflow: runData([source]),
    })
  }

  if (!normalized.paths.length) return failure("No input paths or text provided.")
  onEvent({ type: "progress", progress: 5, message: "Collecting Markdown files." })
  const files = await collectMarkdownFiles(normalized.paths, normalized.recursive, runtime)
  if (!files.length) return failure("No Markdown files found.")

  // Evaluation phase: produce all final outputs before touching any file.
  const sources: MarkuWorkflowSourceResult[] = []
  const diffs: MarkuFileDiff[] = []
  const originals: MarkuUndoFile[] = []
  const pendingWrites: Array<{ path: string; content: string }> = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    onEvent({ type: "progress", progress: 5 + Math.round((index / files.length) * 75), message: runtime.basename(file) })
    const original = await runtime.readText(file)
    if (original === null) continue
    const source = evaluateMarkuWorkflowSource(workflow, { sourceId: file, sourceLabel: runtime.basename(file), text: original }, applyWorkflowStep)
    sources.push(source)
    if (source.error) return failure(`${source.sourceLabel}: ${source.error}`, { diffs, workflow: runData(sources) })
    const didChange = source.outputText !== original
    diffs.push({ file, changed: didChange, diff: didChange ? createUnifiedDiff(original, source.outputText, runtime.basename(file)) : "" })
    if (didChange) {
      originals.push({ path: file, content: original })
      pendingWrites.push({ path: file, content: source.outputText })
    }
  }
  if (!sources.length) return failure("No readable Markdown files found.")

  const changed = pendingWrites.length
  if (normalized.dryRun) {
    onEvent({ type: "progress", progress: 100, message: "Workflow dry-run completed." })
    return success(`Workflow processed ${sources.length} file(s), ${changed} changed (dry-run).`, {
      filesProcessed: sources.length,
      filesChanged: changed,
      diffs,
      workflow: runData(sources),
    })
  }

  // Write phase: record undo from originals first so a partial write stays restorable.
  const undoId = normalized.enableUndo && originals.length
    ? await recordUndo(normalized, originals, runtime, `workflow:${workflow.name || workflow.id}`)
    : ""
  for (let index = 0; index < pendingWrites.length; index += 1) {
    const pending = pendingWrites[index]
    onEvent({ type: "progress", progress: 80 + Math.round((index / Math.max(pendingWrites.length, 1)) * 20), message: runtime.basename(pending.path) })
    try {
      await runtime.writeText(pending.path, pending.content)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // No retry and no silent rollback: report the exact partial-write point and keep the undo record.
      return failure(`Write failed at ${pending.path}: ${message}`, { diffs, undoId, workflow: runData(sources) })
    }
  }
  onEvent({ type: "progress", progress: 100, message: "Workflow completed." })
  return success(`Workflow processed ${sources.length} file(s), ${changed} changed.`, {
    filesProcessed: sources.length,
    filesChanged: changed,
    diffs,
    undoId,
    workflow: runData(sources),
  })
}

function applyWorkflowStep(module: string, text: string, config: Record<string, unknown>): string {
  if (!isMarkuModuleId(module)) throw new Error(`Unknown module: ${module}`)
  return applyMarkuModule(module, text, config)
}

export async function collectMarkdownFiles(paths: string[], recursive: boolean, runtime: MarkuRuntime): Promise<string[]> {
  const files: string[] = []
  async function visit(path: string) {
    const info = await runtime.pathInfo(path)
    if (!info.exists) return
    if (info.isFile && isMarkdownFile(path)) {
      files.push(info.path)
      return
    }
    if (!info.isDirectory) return
    for (const entry of await runtime.listDir(info.path)) {
      if (entry.isFile && isMarkdownFile(entry.name)) files.push(entry.path)
      else if (entry.isDirectory && recursive) await visit(entry.path)
    }
  }
  for (const path of paths) await visit(path)
  return [...new Set(files)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
}

export function applyMarkuModule(module: MarkuModuleId, text: string, config: Record<string, unknown> = {}): string {
  switch (module) {
    case "markt": return transformMarkt(text, config)
    case "consecutive_header": return transformConsecutiveHeaders(text, config)
    case "content_dedup": return transformContentDedup(text, config)
    case "html2sy_table": return transformHtmlTables(text)
    case "title_convert": return transformTitles(text, config)
    case "content_replace": return transformContentReplace(text, config)
    case "single_orderlist_remover": return transformSingleOrderList(text)
    case "image_path_replacer": return transformImagePaths(text, config)
    case "t2list": return transformTableToList(text)
  }
}

export function createUnifiedDiff(original: string, processed: string, filename = "input.md"): string {
  if (original === processed) return ""
  const patch = createTwoFilesPatch(`a/${filename}`, `b/${filename}`, original, processed, "", "", { context: 3 })
  return patch.slice(patch.indexOf("--- "))
}

function transformConsecutiveHeaders(text: string, config: Record<string, unknown>): string {
  const mode = stringConfig(config.processing_mode ?? config.mode, "remove")
  const lines = text.split(/\n/)
  const output: string[] = []
  for (const line of lines) {
    const previous = output[output.length - 1] ?? ""
    if (/^#{1,6}\s+/.test(previous) && /^#{1,6}\s+/.test(line)) {
      if (mode === "merge") output[output.length - 1] = `${previous} / ${line.replace(/^#{1,6}\s+/, "").trim()}`
      else if (mode === "keep_first" || mode === "remove") continue
    } else {
      output.push(line)
    }
  }
  return output.join("\n")
}

function transformHtmlTables(text: string): string {
  return text.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) => {
      return [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cleanHtml(cell[1]))
    }).filter((row) => row.length)
    if (!rows.length) return table
    const width = Math.max(...rows.map((row) => row.length))
    const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")])
    const [head, ...body] = normalized
    return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((row) => `| ${row.join(" | ")} |`)].join("\n")
  })
}

function transformContentReplace(text: string, config: Record<string, unknown>): string {
  const patterns = parsePatterns(config.patterns)
  let output = text
  for (const pattern of patterns) {
    if (!pattern.from) continue
    const replacement = pattern.to ?? ""
    output = pattern.regex
      ? output.replace(new RegExp(pattern.from, pattern.flags ?? "g"), replacement)
      : output.split(pattern.from).join(replacement)
  }
  return output
}

function transformSingleOrderList(text: string): string {
  const lines = text.split(/\n/)
  return lines.map((line, index) => {
    if (!/^\s*\d+[.)]\s+/.test(line)) return line
    const prev = lines[index - 1] ?? ""
    const next = lines[index + 1] ?? ""
    if (/^\s*\d+[.)]\s+/.test(prev) || /^\s*\d+[.)]\s+/.test(next)) return line
    return line.replace(/^(\s*)\d+[.)]\s+/, "$1")
  }).join("\n")
}

function transformTableToList(text: string): string {
  const lines = text.split(/\n/)
  const output: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const next = lines[index + 1] ?? ""
    if (isTableRow(line) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next)) {
      const headers = splitTableRow(line)
      index += 1
      while (isTableRow(lines[index + 1] ?? "")) {
        index += 1
        const values = splitTableRow(lines[index])
        output.push(`- ${headers.map((header, i) => `${header}: ${values[i] ?? ""}`).join("; ")}`)
      }
      continue
    }
    output.push(line)
  }
  return output.join("\n")
}

async function history(input: ReturnType<typeof normalizeMarkuInput>, runtime: MarkuRuntime): Promise<MarkuResult> {
  const records = parseHistory(await runtime.readText(historyPath(input, runtime)))
  return success(`Loaded ${records.length} history record(s).`, { history: records.slice(0, 20) })
}

async function undo(input: ReturnType<typeof normalizeMarkuInput>, runtime: MarkuRuntime, onEvent: (event: NodeRunEvent) => void): Promise<MarkuResult> {
  const path = historyPath(input, runtime)
  const records = parseHistory(await runtime.readText(path))
  const record = input.undoId ? records.find((item) => item.id === input.undoId) : records.find((item) => !item.undone)
  if (!record) return failure(input.undoId ? `Undo record not found: ${input.undoId}` : "No undoable record found.")
  for (let index = 0; index < record.files.length; index += 1) {
    const file = record.files[index]
    onEvent({ type: "progress", progress: Math.round((index / Math.max(record.files.length, 1)) * 100), message: file.path })
    await runtime.writeText(file.path, file.content)
  }
  record.undone = true
  await runtime.writeText(path, `${JSON.stringify(records, null, 2)}\n`)
  return success(`Undo completed: ${record.files.length} file(s).`, { history: records, undoId: record.id })
}

async function recordUndo(input: ReturnType<typeof normalizeMarkuInput>, files: MarkuUndoFile[], runtime: MarkuRuntime, moduleLabel?: string): Promise<string> {
  const path = historyPath(input, runtime)
  const records = parseHistory(await runtime.readText(path))
  const label = moduleLabel ?? String(input.module)
  const record: MarkuUndoRecord = {
    id: runtime.randomId(),
    timestamp: runtime.now().toISOString(),
    module: label,
    summary: `marku ${label}: ${files.length} file(s)`,
    files,
  }
  records.unshift(record)
  await runtime.writeText(path, `${JSON.stringify(records.slice(0, 100), null, 2)}\n`)
  return record.id
}

function historyPath(input: ReturnType<typeof normalizeMarkuInput>, runtime: MarkuRuntime): string {
  return input.historyPath || runtime.defaultHistoryPath()
}

function parseHistory(content: string | null): MarkuUndoRecord[] {
  if (!content?.trim()) return []
  try {
    const parsed = JSON.parse(content) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is MarkuUndoRecord => Boolean(item && typeof item === "object" && typeof (item as MarkuUndoRecord).id === "string" && Array.isArray((item as MarkuUndoRecord).files)))
  } catch {
    return []
  }
}

function parsePatterns(value: unknown): Array<{ from: string; to?: string; regex?: boolean; flags?: string }> {
  if (Array.isArray(value)) return value.filter(isPattern)
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.filter(isPattern) : []
    } catch {
      return []
    }
  }
  return []
}

function isPattern(value: unknown): value is { from: string; to?: string; regex?: boolean; flags?: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { from?: unknown }).from === "string")
}

function splitKeepEnd(text: string): string[] {
  if (!text) return []
  const matches = text.match(/.*(?:\n|$)/g) ?? []
  return matches.filter((line) => line.length).map((line) => line.endsWith("\n") ? line : `${line}\n`)
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
}

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line)
}

function cleanHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown|mdown)$/i.test(path)
}

export function isMarkuModuleId(value: string): value is MarkuModuleId {
  return MARKU_MODULES.some((item) => item.id === value)
}

function stringConfig(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function numberConfig(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanConfig(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function uniqueClean(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function clean(value?: string): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "")
}

function data(partial: Partial<MarkuData>): MarkuData {
  return {
    filesProcessed: 0,
    filesChanged: 0,
    inputText: "",
    outputText: "",
    diffText: "",
    diffs: [],
    history: [],
    undoId: "",
    errors: [],
    ...partial,
  }
}

function success(message: string, partial: Partial<MarkuData>): MarkuResult {
  return { success: true, message, data: data(partial) }
}

function failure(message: string, partial: Partial<MarkuData> = {}): MarkuResult {
  return { success: false, message, data: data({ ...partial, errors: [message] }) }
}

export * from "./workflow.js"
