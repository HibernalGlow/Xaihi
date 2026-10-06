/**
 * smartzip 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/smartzip/src/core.ts`
 * （455 行）逐字搬来：动作与阶段的字面量、INI 解析的默认表与逐键默认值、命令 argv 的拼法、
 * 编码候选与打分、运行记录的脱敏与 JSONL 路径推导全部原样，**一处逻辑都没改**
 * （`node scripts/check-verbatim.mjs --only smartzip` 对上游复核过：差异只有第 1 行那条
 * import 说明符与下面逐条列出的类型让步行，上游被删 0 行）。
 *
 * 那条 import 换成本包的 `./contract.ts` 垫片：`@xiranite/*` 在本仓是 `workspace:*`，
 * 一写进依赖全仓 pnpm 就解不出依赖树（`pnpm-workspace.yaml` 顶部注释、ADR-0002）。
 *
 * 复核这件事的尺是 **`node scripts/check-verbatim.mjs --only smartzip`**（剥掉注释与空白后
 * 只许差在 import 说明符、`| undefined`、`_` 前缀与非空断言这几类上，不等就打印两侧原文）；
 * 本批实测 rc=0，上游被删 0 行。
 *
 * **类型层的让步（只在这一处，逐条列出；运行期一个字节都不变）**：本仓开了
 * `exactOptionalPropertyTypes`（`tsconfig.base.json:11`），而上游那份把"可选"当
 * "可以显式传 undefined"写（`:167,197,212,221` 都在往可选槽位里塞 `undefined`）。
 * 于是**这 17 条可选属性**显式收了 `| undefined`，一条不多一条不少（现数：
 * `node scripts/check-verbatim.mjs --only smartzip` 放行 + `awk 'NR>76 && /\\| undefined/' src/core.ts`
 * 命中这 17 行，本批实测就是 17）：
 * `SmartZipCommandPlan.displayArgs` / `.detached`、`SmartZipTools.fileManager`、
 * `SmartZipOperationResult.outputPath` / `.command` / `.commandResult` / `.passwordUsed`、
 * `SmartZipEncodingInspection.recommendedCodePage` / `.entries` / `.archiveStatus` / `.treeError`、
 * `SmartZipData.database` / `.command` / `.commandResult` / `.operations` / `.encodingInspections`、
 * `SmartZipExecutionRequest.codePage`。
 * **`SmartZipInput` 那 10 条可选属性没有放宽**（`action` / `paths` / `path` / `iniPath` /
 * `iniText` / `passwords` / `codePage` / `databasePath` / `recordRun` / `dryRun`）：
 * 内核只**读**它们（`normalizeSmartZipInput` 那一格是"读进来 ⇒ 写出 `Required<>` 的新对象"），
 * 没有任何一处往这些槽位里赋 `undefined`，所以 `exactOptionalPropertyTypes` 不需要让步。
 * 两个可选**方法**（`SmartZipRuntime.inspectCodePages` / `.resolveInputPaths`）同理没有放宽：
 * 那两处若加 `| undefined` 会改到返回类型而不是属性本身，而内核只读不写它们。
 * 其余文件里出现的 `| undefined`（返回类型 `SmartZipDatabase | undefined`、几个形参与
 * `Array<string | undefined>`）都是**上游自己就写了的**，两侧一起抹掉才是对称比较。
 * **没有新增 `!`**，也没改动任何一条判据。
 *
 * 台账里这个节点的 hostRequirements 是 **os-native + external-process +
 * recursive-enumeration + file-io**（本批最重的一格），而**这份文件自己一行 I/O、
 * 一个进程都不碰**：触达机器的事件全部从 `SmartZipRuntime` 那 6 个方法注入
 * （`:118-125`，上游原本就这么设计），落地实现在 `src/platform.ts`（文件系统与 ZIP
 * 字节层）+ `src/exec.ts`（DSH 的 `ctx.subprocess`）。"从 core.ts 里 spawn"这件事
 * 在这里不存在，也不许出现。
 *
 * 会被"顺手优化"改掉、所以在这里点名的上游语义（行号指上游那份文件）：
 * - **`dryRun` 有一份分叉**：内核 `:150` 是 `input.dryRun ?? false` ⇒ 内核默认**执行**；
 *   `node-definitions/smartzip.json` 给 `dryRun` 字段声明的默认是 **true** ⇒ 界面默认**预演**。
 *   两份都是真源、都不许统一（`rawfilter` 的 `dryRun` 是同一格先例，台账 **G8** 是它的原因）：
 *   `tests/core.spec.ts` 钉内核那一侧，`tests/definition.spec.ts` 钉清单那一侧。
 * - `recordRun` 的默认是 `Boolean(input.databasePath)`（`:149`）：给了库路径就默认记账，
 *   没给就不记；它不是第三个开关。
 * - `status` 与 `inspect_codepage` 在 `:166-186` 就返回，**永远不碰 7-Zip**；
 *   `inspect_codepage` 还先问 `runtime.inspectCodePages` 在不在（`:176`），
 *   缺席时那句是 `Filename encoding inspection is unavailable in this runtime.`。
 * - 其余四条动作先 `find7z`，但 **`dryRun` 为真时跳过查找**，直接用
 *   `{ cli: "7z", fileManager: "7zFM" }` 这对占位名出计划（`:187` 那个三元）——
 *   这一条就是独立 bin 还能"只出计划"的全部依据（`src/cli.ts` 的边界据此划）。
 * - 找不到 7-Zip 那句原文点名了**不该被拉回来的东西**：
 *   "SmartZip.exe and AutoHotkey are never required."（`:188`）。
 * - 计划行由 `buildSmartZipCommand` 生成（`:261-268`）：`open` 的命令是 `7zFM`、
 *   `archive` 是 `a <out.zip> <source> -y -sccUTF-8`、解压是
 *   `x <source> -o<去掉后缀的同名目录> -y -sccUTF-8`，`-mcp=` 只在
 *   `extract_codepage` **且给了 codePage** 时才追加。
 * - `codePage` 只收**正整数**，否则折成 0（`:147`）：0 在下游意味着"不许加 `-mcp=`"。
 * - INI 默认值逐键（`:235-257`）：`zipDir`/`7zipDir` 缺省 `"auto"`、`partSkip` 与
 *   `nesting` 默认 **true**、`nestingMuilt`（上游就是这个拼写）/ `delSource` /
 *   `delWhenHasPass` / `addDir2Pass` 默认 **false**、`contextMenu` / `sendTo` 默认 **true**；
 *   `[ext]` 缺省 9 项、`[extExp]` 缺省 4 项、`[extForOpen]` 缺省 4 项一份不减；
 *   `[7z]` 的 `add` / `openAdd` 缺省是带一个**光杆引号**的 `.zip"` 与
 *   `.zip" -tzip -mx=0 -aou -ad`（`:254-255`）——那是旧 INI 的截断产物，
 *   `parseLegacyArchiveArgs`（`src/platform.ts`）就是按这个形状解析的，不许"修正"它。
 * - 密码：`passwords` 是"输入给的 + INI `[password]` 的"并集去重（`:163`），
 *   而**任何回显都被折成 `••••`**（`:434`）；运行记录里只写 `passwordCount`（`:330`）。
 *   所以这个节点的输出面读不到明文，也不许为了"看起来完整"把密码带出去。
 * - `archiveCount` 用的是**配置里的**扩展名表（`:436`），表空才落回
 *   `SMARTZIP_ARCHIVE_EXTENSIONS`（`:137`，10 项：zip/7z/rar/tar/gz/bz2/xz/cbz/cbr/iso）。
 * - 默认运行记录路径 `joinLike(base, ".xiranite", "smartzip-runs.jsonl")`（`:309`）：
 *   这是**旧数据所在的位置**，改名等于数据迁移（AGENTS.md「跨语言的格式判别符与落盘文件名
 *   属于改名 = 数据迁移」），所以原样留着；上游 `core.test.ts:40,71,86` 三条断言钉的正是
 *   这份字面值，本包 `tests/core.spec.ts` 抄进来了。品牌尺 `scripts/check-brand.mjs`
 *   会在这里报一处——那是**这条决定本身**，不是漏改（要改要先有 ADR-0010 里被点名的追加决定）。
 *
 * @module xaihi-smartzip/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type SmartZipAction = "status" | "inspect_codepage" | "extract" | "extract_codepage" | "open" | "archive"
export type SmartZipExecutionAction = Exclude<SmartZipAction, "status" | "inspect_codepage">

export interface SmartZipInput {
  action?: SmartZipAction
  paths?: string[]
  path?: string
  iniPath?: string
  iniText?: string
  passwords?: string[]
  codePage?: number
  databasePath?: string
  recordRun?: boolean
  dryRun?: boolean
}

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface SmartZipCommandPlan {
  label: string
  command: string
  args: string[]
  displayArgs?: string[] | undefined
  detached?: boolean | undefined
}

export interface SmartZipTools {
  cli: string
  fileManager?: string | undefined
}

export interface SmartZipRule {
  match: string
  replacement: string
}

export interface SmartZipOperationResult {
  sourcePath: string
  outputPath?: string | undefined
  action: SmartZipExecutionAction
  status: "completed" | "skipped" | "error"
  message: string
  command?: SmartZipCommandPlan | undefined
  commandResult?: CommandResult | undefined
  passwordUsed?: boolean | undefined
}

export interface SmartZipEncodingCandidate {
  codePage: number
  label: string
  score: number
  preview: string[]
}

export interface SmartZipEncodingInspection {
  sourcePath: string
  recommendedCodePage?: number | undefined
  confidence: "certain" | "high" | "medium" | "low" | "unknown"
  unicodeMetadata: boolean
  candidates: SmartZipEncodingCandidate[]
  entries?: string[] | undefined
  archiveStatus?: "readable" | "encrypted" | "incomplete" | "unsupported" | undefined
  treeError?: string | undefined
  message: string
}

export interface SmartZipConfig {
  sevenZipDir: string
  passwords: string[]
  archiveExtensions: string[]
  archiveExtensionPatterns: string[]
  openArchiveExtensions: string[]
  codePages: number[]
  targetDir: string
  skipMultipart: boolean
  nestedExtraction: boolean
  nestedExtractionForMultiple: boolean
  deleteSource: boolean
  deleteSourceWhenPassword: boolean
  addDirectoryAsPassword: boolean
  excludeExtensions: string[]
  excludeNames: string[]
  renameExtensions: SmartZipRule[]
  renameNames: SmartZipRule[]
  renamePatterns: SmartZipRule[]
  deletePatterns: string[]
  archiveArgs: string
  openArchiveArgs: string
  contextMenu: boolean
  sendTo: boolean
}

export interface SmartZipDatabase {
  path: string
  enabled: boolean
  mode: "jsonl"
  defaultPath: boolean
}

export interface SmartZipData {
  config: SmartZipConfig
  database?: SmartZipDatabase | undefined
  command?: SmartZipCommandPlan | undefined
  commandResult?: CommandResult | undefined
  operations?: SmartZipOperationResult[] | undefined
  encodingInspections?: SmartZipEncodingInspection[] | undefined
  selectedPaths: string[]
  archiveCount: number
  errors: string[]
}

export interface SmartZipRuntime {
  readText: (path: string) => Promise<string>
  appendRecord: (path: string, record: unknown) => Promise<void>
  find7z: (configuredDirectory?: string) => Promise<SmartZipTools | null>
  execute: (request: SmartZipExecutionRequest, onEvent: (event: NodeRunEvent) => void) => Promise<SmartZipOperationResult[]>
  inspectCodePages?: (paths: string[], config: SmartZipConfig) => Promise<SmartZipEncodingInspection[]>
  resolveInputPaths?: (paths: string[], config: SmartZipConfig, action: SmartZipExecutionAction) => Promise<string[]>
}

export interface SmartZipExecutionRequest {
  action: SmartZipExecutionAction
  paths: string[]
  config: SmartZipConfig
  tools: SmartZipTools
  codePage?: number | undefined
}

export type SmartZipResult = NodeRunResult<SmartZipData>

export const SMARTZIP_ARCHIVE_EXTENSIONS = ["zip", "7z", "rar", "tar", "gz", "bz2", "xz", "cbz", "cbr", "iso"]

export function normalizeSmartZipInput(input: SmartZipInput): Required<SmartZipInput> {
  return {
    action: input.action ?? "status",
    paths: uniqueClean([input.path, ...(input.paths ?? [])]),
    path: clean(input.path),
    iniPath: clean(input.iniPath),
    iniText: input.iniText ?? "",
    passwords: uniqueClean(input.passwords ?? []),
    codePage: Number.isInteger(input.codePage) && Number(input.codePage) > 0 ? Number(input.codePage) : 0,
    databasePath: clean(input.databasePath),
    recordRun: input.recordRun ?? Boolean(input.databasePath),
    dryRun: input.dryRun ?? false,
  }
}

export async function runSmartZip(
  input: SmartZipInput,
  runtime: SmartZipRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<SmartZipResult> {
  const normalized = normalizeSmartZipInput(input)
  try {
    onEvent({ type: "progress", progress: 20, message: "Loading SmartZip config." })
    const parsedConfig = parseSmartZipIni(normalized.iniText || (normalized.iniPath ? await runtime.readText(normalized.iniPath) : ""))
    const config = { ...parsedConfig, passwords: [...new Set([...normalized.passwords, ...parsedConfig.passwords])] }
    const selectedPaths = normalized.paths
    const database = buildSmartZipDatabase(normalized)
    if (normalized.action === "status") {
      await writeSmartZipRecordIfEnabled("status", normalized, config, selectedPaths, undefined, undefined, database, runtime)
      return success(`SmartZip status loaded: ${config.archiveExtensions.length} archive extension(s).`, {
        config,
        database,
        selectedPaths,
      })
    }
    if (!selectedPaths.length) return failure("At least one archive or directory path is required.")
    if (normalized.action === "inspect_codepage") {
      if (!runtime.inspectCodePages) return failure("Filename encoding inspection is unavailable in this runtime.")
      onEvent({ type: "progress", progress: 45, message: "Inspecting raw ZIP filename bytes." })
      const encodingInspections = await runtime.inspectCodePages(selectedPaths, config)
      onEvent({ type: "progress", progress: 100, message: "Filename encoding inspection completed." })
      return success(`Inspected filename encodings for ${encodingInspections.length} archive(s).`, {
        config,
        database,
        selectedPaths,
        encodingInspections,
      })
    }
    const tools = normalized.dryRun ? { cli: "7z", fileManager: "7zFM" } : await runtime.find7z(config.sevenZipDir)
    if (!tools) return failure("7-Zip was not found. Install 7-Zip or add 7z to PATH; SmartZip.exe and AutoHotkey are never required.")
    const executionAction = normalized.action as SmartZipExecutionAction
    const executionPaths = runtime.resolveInputPaths && (executionAction === "extract" || executionAction === "extract_codepage")
      ? await runtime.resolveInputPaths(selectedPaths, config, executionAction)
      : selectedPaths
    if (!executionPaths.length) return failure("No supported archive or first multipart volume was found.")
    const plans = executionPaths.map((path) => buildSmartZipCommand({ ...normalized, paths: [path], path }, tools.cli))
    const command = plans[0]
    if (normalized.dryRun) {
      await writeSmartZipRecordIfEnabled(normalized.action, normalized, config, selectedPaths, command, undefined, database, runtime)
      const operations = executionPaths.map((sourcePath, index): SmartZipOperationResult => ({
        sourcePath,
        action: normalized.action as SmartZipExecutionAction,
        status: "completed",
        message: "Planned",
        command: plans[index],
      }))
      return success(`SmartZip dry-run: ${plans.length} TypeScript-planned operation(s).`, { config, database, selectedPaths, command, operations })
    }
    const operations = await runtime.execute({
      action: executionAction,
      paths: executionPaths,
      config,
      tools,
      codePage: normalized.action === "extract_codepage" ? (normalized.codePage || undefined) : undefined,
    }, onEvent)
    const results = operations.map((operation) => operation.commandResult).filter((result): result is CommandResult => Boolean(result))
    const commandResult = combineResults(results)
    const errors = operations.filter((operation) => operation.status === "error").map((operation) => `${operation.sourcePath}: ${operation.message}`)
    await writeSmartZipRecordIfEnabled(normalized.action, normalized, config, selectedPaths, command, commandResult, database, runtime)
    return {
      success: errors.length === 0,
      message: errors.length === 0 ? `Completed ${operations.length} SmartZip workflow operation(s).` : `${errors.length} SmartZip workflow operation(s) failed.`,
      data: data({ config, database, selectedPaths, command: operations[0]?.command ?? command, commandResult, operations, errors }),
    }
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export const runSmartzip = runSmartZip

export function parseSmartZipIni(text: string): SmartZipConfig {
  const sections = parseIni(text)
  const set = sections.set ?? {}
  const menu = sections.menu ?? {}
  return {
    sevenZipDir: set.zipDir ?? set["7zipDir"] ?? "auto",
    passwords: [...new Set([sections.temp?.lastPass ?? "", ...numberedValues(sections.password)].filter(Boolean))],
    archiveExtensions: withDefaults(numberedValues(sections.ext), ["zip", "rar", "7z", "001", "cab", "bz2", "gz", "gzip", "tar"]).map(extension),
    archiveExtensionPatterns: withDefaults(numberedValues(sections.extExp), ["^\\d+$", "zi", "7", "z"]),
    openArchiveExtensions: withDefaults(numberedValues(sections.extForOpen), ["iso", "apk", "wim", "exe"]).map(extension),
    codePages: numberedValues(sections.codepage).map(Number).filter((value) => Number.isInteger(value) && value > 0),
    targetDir: set.targetDir ?? "",
    skipMultipart: boolValue(set.partSkip, true),
    nestedExtraction: boolValue(set.nesting, true),
    nestedExtractionForMultiple: boolValue(set.nestingMuilt, false),
    deleteSource: boolValue(set.delSource, false),
    deleteSourceWhenPassword: boolValue(set.delWhenHasPass, false),
    addDirectoryAsPassword: boolValue(set.addDir2Pass, false),
    excludeExtensions: numberedValues(sections.excludeExt).map(extension),
    excludeNames: numberedValues(sections.excludeName),
    renameExtensions: ruleValues(sections.renameExt),
    renameNames: ruleValues(sections.renameName),
    renamePatterns: ruleValues(sections.renameExp),
    deletePatterns: numberedValues(sections.deleteExp),
    archiveArgs: sections["7z"]?.add ?? '.zip"',
    openArchiveArgs: sections["7z"]?.openAdd ?? '.zip" -tzip -mx=0 -aou -ad',
    contextMenu: boolValue(menu.contextMenu, true),
    sendTo: boolValue(menu.sendTo, true),
  }
}

export function buildSmartZipCommand(input: Required<SmartZipInput>, executable = "7z"): SmartZipCommandPlan {
  const source = input.paths[0] ?? input.path
  if (input.action === "open") return { label: `Smart-open ${source}`, command: "7zFM", args: [source] }
  if (input.action === "archive") return { label: `Archive ${source}`, command: executable, args: ["a", archiveOutput(source), source, "-y", "-sccUTF-8"] }
  const args = ["x", source, `-o${extractOutput(source)}`, "-y", "-sccUTF-8"]
  if (input.action === "extract_codepage" && input.codePage) args.push(`-mcp=${input.codePage}`)
  return { label: `Extract ${source}`, command: executable, args }
}

export function actionMode(action: SmartZipAction): string {
  if (action === "inspect_codepage") return "cp"
  if (action === "extract") return "x"
  if (action === "extract_codepage") return "xc"
  if (action === "open") return "o"
  if (action === "archive") return "a"
  return ""
}

function extractOutput(path: string): string {
  return path.replace(/\.(zip|7z|rar|tar|gz|bz2|xz|cbz|cbr|iso)$/i, "")
}

function archiveOutput(path: string): string {
  return `${path.replace(/[\\/]+$/g, "")}.zip`
}

function combineResults(results: CommandResult[]): CommandResult {
  return { code: results.some((result) => result.code !== 0) ? 1 : 0, stdout: results.map((result) => result.stdout).filter(Boolean).join("\n"), stderr: results.map((result) => result.stderr).filter(Boolean).join("\n") }
}

export function isArchivePath(path: string, extensions = SMARTZIP_ARCHIVE_EXTENSIONS): boolean {
  const lower = path.toLowerCase()
  return extensions.some((extension) => lower.endsWith(`.${extension.toLowerCase().replace(/^\./, "")}`))
}

export function buildSmartZipDatabase(input: Required<SmartZipInput>): SmartZipDatabase | undefined {
  const path = input.databasePath || defaultSmartZipDatabasePath(input)
  if (!path) return undefined
  return {
    path,
    enabled: input.recordRun,
    mode: "jsonl",
    defaultPath: !input.databasePath,
  }
}

export function defaultSmartZipDatabasePath(input: Pick<Required<SmartZipInput>, "paths" | "iniPath">): string {
  const base = input.paths[0] ? pathBaseFor(input.paths[0]!) : input.iniPath ? dirnameLike(input.iniPath) : ""
  return base ? joinLike(base, ".xiranite", "smartzip-runs.jsonl") : ""
}

export function buildSmartZipRunRecord(
  action: SmartZipAction,
  input: Pick<Required<SmartZipInput>, "paths" | "iniPath" | "dryRun">,
  config: SmartZipConfig,
  selectedPaths: string[],
  command: SmartZipCommandPlan | undefined,
  commandResult?: CommandResult,
): Record<string, unknown> {
  return {
    toolId: "smartzip",
    action,
    iniPath: input.iniPath || undefined,
    dryRun: input.dryRun,
    selectedPaths,
    archiveCount: selectedPaths.filter((path) => isArchivePath(path, config.archiveExtensions.length ? config.archiveExtensions : SMARTZIP_ARCHIVE_EXTENSIONS)).length,
    config: {
      sevenZipDir: config.sevenZipDir,
      archiveExtensions: config.archiveExtensions,
      passwordCount: config.passwords.length,
      contextMenu: config.contextMenu,
      sendTo: config.sendTo,
    },
    command,
    success: commandResult ? commandResult.code === 0 : true,
    code: commandResult?.code,
    stdoutLength: commandResult?.stdout.length,
    stderrLength: commandResult?.stderr.length,
    at: new Date().toISOString(),
  }
}

async function writeSmartZipRecordIfEnabled(
  action: SmartZipAction,
  input: Required<SmartZipInput>,
  config: SmartZipConfig,
  selectedPaths: string[],
  command: SmartZipCommandPlan | undefined,
  commandResult: CommandResult | undefined,
  database: SmartZipDatabase | undefined,
  runtime: Pick<SmartZipRuntime, "appendRecord">,
): Promise<void> {
  if (!database?.enabled) return
  await runtime.appendRecord(database.path, buildSmartZipRunRecord(action, input, config, selectedPaths, command, commandResult))
}

function parseIni(text: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {}
  let current = "set"
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(";") || line.startsWith("#")) continue
    const section = /^\[([^\]]+)\]$/.exec(line)
    if (section) {
      current = section[1]!.trim()
      sections[current] ??= {}
      continue
    }
    const index = line.indexOf("=")
    if (index < 0) continue
    sections[current] ??= {}
    sections[current]![line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return sections
}

function numberedValues(section?: Record<string, string>): string[] {
  if (!section) return []
  return Object.entries(section)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, value]) => value)
}

function ruleValues(section?: Record<string, string>): SmartZipRule[] {
  return numberedValues(section).map((value) => {
    const separator = value.indexOf("<--->")
    return separator < 0
      ? { match: value, replacement: "" }
      : { match: value.slice(0, separator), replacement: value.slice(separator + 5) }
  }).filter((rule) => Boolean(rule.match))
}

function withDefaults(values: string[], defaults: string[]): string[] {
  return values.length ? values : defaults
}

function extension(value: string): string {
  return value.replace(/^\./, "").toLowerCase()
}

function boolValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === "1" || value.toLowerCase() === "true"
}

function pathBaseFor(path: string): string {
  return isArchivePath(path) || /\.[^\\/]+$/.test(path) ? dirnameLike(path) : path
}

function dirnameLike(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  const index = normalized.lastIndexOf("/")
  if (index > 0) return normalized.slice(0, index)
  if (index === 0) return "/"
  return "."
}

function joinLike(...parts: string[]): string {
  return parts
    .map((part, index) => {
      const value = index === 0 ? clean(part).replace(/[\\/]+$/g, "") : clean(part).replace(/^[\\/]+|[\\/]+$/g, "")
      return value === "." ? "" : value
    })
    .filter(Boolean)
    .join("/")
}

function data(partial: Partial<SmartZipData>): SmartZipData {
  const selectedPaths = partial.selectedPaths ?? []
  const config = partial.config ?? parseSmartZipIni("")
  return {
    ...partial,
    config: { ...config, passwords: config.passwords.map(() => "••••") },
    selectedPaths,
    archiveCount: selectedPaths.filter((path) => isArchivePath(path, config.archiveExtensions.length ? config.archiveExtensions : SMARTZIP_ARCHIVE_EXTENSIONS)).length,
    errors: partial.errors ?? [],
  }
}

function success(message: string, partial: Partial<SmartZipData>): SmartZipResult {
  return { success: true, message, data: data(partial) }
}

function failure(message: string): SmartZipResult {
  return { success: false, message, data: data({ errors: [message] }) }
}

function uniqueClean(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function clean(value?: string): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "")
}
