/**
 * smartzip 的 `SmartZipRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/smartzip/src/platform.ts`（643 行）里除"起进程"那一件事以外的全部。
 * 台账里这个节点的 hostRequirements 是 **os-native + external-process +
 * recursive-enumeration + file-io**（本批最重的一格），这一格今天落在三个文件上：
 * 本文件（文件系统 + ZIP 字节层）、`src/exec.ts`（DSH 的 `ctx.subprocess`）、
 * `src/index.ts`（两半合成成一条缝）。
 *
 * ## 改动清单（运行期只有两类：起进程换缝、回收站换拒绝；字节层与枚举逻辑一行没动）
 *
 * 1. **`node:child_process` 不引**（上游 `:1`）。`docs/service-mapping.md`「子进程 / 命令执行
 *    ⇒ **不搬**基础件」的判据是 `subprocess.md` 的 `ctx.subprocess`，原话"节点要外部程序就走
 *    `ctx.subprocess`"。于是上游那份模块级的 `runRaw()`（`:626-638`）在本仓是**一条注入的缝**：
 *    `SmartZipRuntimeContext.runCommand`（类型是本文件的 `SmartZipRunCommand`），宿主半边由
 *    `src/exec.ts`
 *    兑现（落地形状与 `plugins/bandia/src/exec.ts`、`plugins/sleept/src/exec.ts` 同源）。
 *    **连带改动只有形参**：上游把 `fileOperations` 沿调用链往下传（`execute` → `extractArchive`），
 *    本仓在同一位置上往下传 `runCommand`——`find7z` / `execute` / `extractArchive` /
 *    `inspectCodePages` / `listArchiveEntries` / `archivePaths` / `smartOpen` /
 *    `isArchiveByContent` 各多一条尾参。**没有删过任何一条上游分支**，也没有把任何一次调用
 *    改成"直接跑"。
 * 2. **没有 `runCommand` 时响亮拒绝**，不折成"7-Zip 没装"。上游 `find7z` 找不到就回 `null`，
 *    内核据此说 `7-Zip was not found. Install 7-Zip or add 7z to PATH…`（`core.ts:188`）——
 *    独立 bin 里 7z 很可能就在盘上，把"够不到那条缝"报成"没装"是伪造读数（AGENTS.md
 *    「不许伪造它没给的数据」）。所以缺缝时抛 `NO_SUBPROCESS_MESSAGE`，由内核的 `catch`
 *    折成 `success:false` 的那一句（`core.ts:297-299`），退出码与面板都读得回来。
 *    **后果**：bin 里 `status` 与四条动作的 `--dryRun` 计划是真跑的（`core.ts:187` 那个三元
 *    在 dryRun 时跳过 `find7z`，`execute` 又不进），`inspect_codepage` 与"真执行"那几条
 *    在 bin 里一律可见地拒（缺口 G1/G6 那一族：缝活在宿主进程里）。
 * 3. **`@xiranite/file-operations` 那一层不引**（上游 `:5-6` 的 `executeSingleFileMutation` /
 *    `PlatformFileMutationProvider` 与 `:21` 的 `FileOperationExecutor`、`:24` 那个模块级
 *    `standaloneFileMutations`）。`docs/service-mapping.md`「可恢复删除 + 删除历史」判的是"搬"，
 *    落点写着"批次 C 之前落，**v1 不做**"，本仓今天确实没有那条缝（`plugins/**` 里
 *    `FileOperationService` 零命中）。于是 `recyclePath()` 的 trash 语义**没有对应物 ⇒
 *    抛 `NO_TRASH_MESSAGE`**（缺口 **G-no-os-trash**，与 `plugins/bandia/src/platform.ts`、
 *    `plugins/enginev/src/platform.ts` 同一条）：
 *    **绝不退化成 `rm` 永久删**。上游两处调用者一条都不改判据——嵌套归档解完之后的清理
 *    （`:170`）与 `deleteSource` / `deleteSourceWhenPassword`（`:175`）。
 *    `src/index.ts` 在合成缝里把这一句补进运行账本的 `preview`，因为这一抛会让**整次运行**
 *    在"文件已经解出来"之后失败：不写进账本就是静默。
 * 4. `:1` 的 `@xiranite/contract` → 本包 `./contract.ts`，`./core.js` → `./core.ts`
 *    （`@xiranite/*` 是 `workspace:*`，写进依赖全仓 pnpm 就解不出树，ADR-0002）。
 *
 * ## 会被"顺手优化"改掉、所以在这里点名的上游语义（行号指基线那份文件）
 *
 * - **解压先 `t` 后 `x`**：`extractArchive` 对每个密码候选（`passwordCandidates`：空密码 +
 *   目录名（`addDirectoryAsPassword` 为真时）+ INI/入参里的密码，`:528-531`）跑一次
 *   `7z t`，**第一个通过才动手**；全失败时那句由 `archiveTestFailureMessage`（`:247-258`）
 *   分三档：缺卷 / 密码不对（并报"试了几个密码"）/ 其它失败。空密码槽位喂的是
 *   `-p__XIRANITE_NO_PASSWORD__`（`:122`）——那是**旧 7-Zip 的哨兵**，改成不传 `-p` 会让
 *   "不带密码去测"变成"用交互提示去测"，不许改。品牌尺（`scripts/check-brand.mjs`）会把这个
 *   字面量在本文件报三处（`:122` 那一条的三个调用点）：**那是喂给外部程序的参数本体**，
 *   改名 = 改协议，不是漏改（同一格先例见 `src/core.ts` 文件头为 `.xiranite` 那个落盘目录名
 *   写的说明）。
 * - 解压目标永远是 `mkdtemp(join(outputRoot, ".smartzip-"))` 这个临时目录（`:116`），
 *   再由 `materializeExtraction`（`:492-506`）按"顶层只有一项就提那一项，只有一个文件就提
 *   那个文件，否则整个临时目录"折成最终目录名，名字来自 `uniquePath` 的 `_1/_2…` 让位。
 *   这两步分开是有原因的：`-aoa` 直接解进目标目录会覆盖同名产物。
 * - **`-aoa` + `-sccUTF-8`** 在真实解压那一条上固定出现（`:144-154`），`-mcp=` 只在
 *   `extract_codepage` 且**有码页**（显式或自动推荐）时才加；排除项走 `excludeArgs`
 *   （`:533-539`，有排除项时补一条 `-r`）。
 * - `displayArgs` 把 `-p*` 折成 `-p••••`（`:155`）：**进账本与结果视图的计划里不许有明文密码**
 *   （内核 `data()` 那边还把 `config.passwords` 整体折成 `••••`，`core.ts:508`）。
 * - `detached` 只有 `open` 经 7zFM 那一支用（`:458`），其它一律 false。
 * - 嵌套递归的深度上限是**写死的 32**（`:165`），不是配置项；`skipMultipart` 为真时
 *   非首卷直接 `status:"skipped"`（`:109-111`），而 `expandExtractSources` 早在一层就把
 *   续卷筛掉了（`:87`）。
 * - `inspectCodePage` 只读**尾部最多 32 MiB**（`:270-274`）去定位 ZIP 中央目录，
 *   `7z` 签名（`isSevenZipSignature`）走"不适用"那一句（`:268`）；
 *   `detectZipFilenameEncoding` 是本文件唯一被 `platform` 之外（测试）直接调的导出，
 *   候选打分与置信度门槛（`margin >= 16 → high`、`>= 6 → medium`、否则 `low`）都在
 *   `filenameScore` / `codePageEncoding` / `codePageLabel` 这三张表里，`DEFAULT_CODE_PAGES`
 *   是 `[65001, 936, 950, 932, 949]`（`:189`），与配置里声明的码页取并集、保持那个顺序。
 * - `archivePaths`：**只有输入全是目录时才一根一条压缩**，混着文件时全并成一个包（`:430-431`）；
 *   单目录那条把源换成 `join(dir, "*")`（`:438`）——那是 7-Zip 的"压目录内容"写法，
 *   改成裸目录名会多一层目录。目标名与附加参数来自 `parseLegacyArchiveArgs`（`:566-573`），
 *   它专治旧 INI 里那个带光杆引号的 `.zip"`。
 * - `smartOpen`：单条路径 + 认得出是归档（扩展名或 `7z l` 退 0）+ 找到 `7zFM` 才开 GUI，
 *   **否则退化成用 `openArchiveArgs` 压缩**，并把结果里的 action 改回 `open`（`:465`）——
 *   那条退化是上游行为，别当 bug 修。
 * - `isArchiveByContent` 认"能列出来"或 `Type = 非 ERROR`（`:523`）；`isConfiguredArchive`
 *   在**没有扩展名时返回 true**（`:543`，那是"目录/无名文件当候选"的上游口径）。
 * - `appendRecord` 先 `mkdir(dirname(path), {recursive:true})` 再追一行 JSON（`:640-643`）——
 *   运行记录的默认落点是 `.xiranite/smartzip-runs.jsonl`（`core.ts:309`），
 *   那是**旧数据所在的位置**，改名等于数据迁移，所以两侧都原样留着。
 *
 * @module xaihi-smartzip/platform
 */

import { appendFile, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat } from "node:fs/promises"
import { basename, dirname, extname, join, parse } from "node:path"
import type { NodeRunEvent } from "./contract.ts"
import type {
  CommandResult,
  SmartZipCommandPlan,
  SmartZipConfig,
  SmartZipEncodingCandidate,
  SmartZipEncodingInspection,
  SmartZipExecutionRequest,
  SmartZipExecutionAction,
  SmartZipOperationResult,
  SmartZipRuntime,
  SmartZipTools,
} from "./core.ts"

/** 起外部程序那条缝的形态——上游 `runRaw`（`:626`）的三个参数原样。 */
export type SmartZipRunCommand = (command: string, args: string[], detached?: boolean) => Promise<CommandResult>

export interface SmartZipRuntimeContext {
  /**
   * 外部程序那一半（宿主半边由 `src/exec.ts` 经 `ctx.subprocess` 兑现）。
   * 缺省时**每一条要碰 7-Zip 的路径都抛** `NO_SUBPROCESS_MESSAGE`；不抛的那些
   * （`readText` / `appendRecord` / `resolveInputPaths` / dry-run 计划）照常真跑。
   */
  runCommand?: SmartZipRunCommand
}

/** 没有 `ctx.subprocess` 时读得到的那句（独立 bin 的边界据此划）。 */
export const NO_SUBPROCESS_MESSAGE = "SmartZip needs 7-Zip through DSH's ctx.subprocess, which only exists inside the host process; run the action from the workspace panel or the smartzip_* tools, or ask for a dry run plan."

/** 没有可恢复删除提供方时读得到的那句（缺口 G-no-os-trash）。 */
export const NO_TRASH_MESSAGE = "SmartZip needs the recoverable-delete seam (the upstream trash provider this node was ported from) before removing a file; Xaihi has none, so it refuses instead of deleting permanently."

/** 上游 `:626` 的 `runRaw`：本仓不许自己 spawn，所以缺缝时这里抛，不返回假结果。 */
function runCommandOf (context: SmartZipRuntimeContext): SmartZipRunCommand {
  const run = context.runCommand
  if (run === undefined) return async () => { throw new Error(NO_SUBPROCESS_MESSAGE) }
  return run
}

export function createNodeSmartZipRuntime (context: SmartZipRuntimeContext = {}): SmartZipRuntime {
  const runRaw = runCommandOf(context)
  return {
    readText: (path) => readFile(path, "utf8"),
    appendRecord,
    find7z: (configuredDirectory) => find7z(configuredDirectory, runRaw),
    execute: (request, onEvent) => execute(request, onEvent, runRaw),
    inspectCodePages: (paths, config) => inspectCodePages(paths, config, runRaw),
    resolveInputPaths: expandExtractSources,
  }
}

export const createNodeSmartzipRuntime = createNodeSmartZipRuntime

async function find7z (configuredDirectory = "", runRaw: SmartZipRunCommand): Promise<SmartZipTools | null> {
  const configured = configuredDirectory && configuredDirectory !== "auto" && !configuredDirectory.includes("%SmartZipDir%")
    ? configuredDirectory
    : ""
  const cliCandidates = configured ? [join(configured, "7z.exe"), join(configured, "7z")] : []
  cliCandidates.push(
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
    join(process.env.LOCALAPPDATA ?? "", "7-Zip", "7z.exe"),
  )
  for (const candidate of cliCandidates) {
    if (!candidate || !await pathExists(candidate)) continue
    const fileManager = join(dirname(candidate), process.platform === "win32" ? "7zFM.exe" : "7zFM")
    return { cli: candidate, fileManager: await pathExists(fileManager) ? fileManager : undefined }
  }
  for (const name of ["7z", "7z.exe", "7za", "7za.exe", "7zz", "7zz.exe"]) {
    const located = await runRaw(process.platform === "win32" ? "where.exe" : "which", [name])
    const cli = located.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (located.code !== 0 || !cli) continue
    const fileManager = join(dirname(cli), process.platform === "win32" ? "7zFM.exe" : "7zFM")
    return { cli, fileManager: await pathExists(fileManager) ? fileManager : undefined }
  }
  return null
}

async function execute (
  request: SmartZipExecutionRequest,
  onEvent: (event: NodeRunEvent) => void,
  runRaw: SmartZipRunCommand,
): Promise<SmartZipOperationResult[]> {
  if (request.action === "archive") return archivePaths(request, onEvent, runRaw)
  if (request.action === "open") return smartOpen(request, onEvent, runRaw)
  const sources = await expandExtractSources(request.paths, request.config)
  if (!sources.length) return request.paths.map((path) => operationError(request.action, path, "No supported archive or first multipart volume was found."))
  const results: SmartZipOperationResult[] = []
  for (let index = 0; index < sources.length; index += 1) {
    const sourcePath = sources[index]!
    onEvent({ type: "progress", progress: Math.round(index / sources.length * 100), message: `Extracting ${basename(sourcePath)}` })
    results.push(await extractArchive(sourcePath, request, 0, runRaw))
  }
  onEvent({ type: "progress", progress: 100, message: "Smart extraction completed." })
  return results
}

async function expandExtractSources (paths: string[], config: SmartZipConfig, _action?: SmartZipExecutionAction): Promise<string[]> {
  const sources: string[] = []
  for (const path of paths) {
    if (!await isDirectory(path)) {
      if (multipartKind(path) !== "continuation") sources.push(path)
      continue
    }
    const entries = await walk(path)
    const fileFlags = await Promise.all(entries.map(isFile))
    for (let index = 0; index < entries.length; index += 1) {
      const candidate = entries[index]!
      if (!fileFlags[index] || multipartKind(candidate) === "continuation" || !isConfiguredArchive(candidate, config)) continue
      sources.push(candidate)
    }
  }
  return [...new Set(sources)]
}

async function extractArchive (
  sourcePath: string,
  request: SmartZipExecutionRequest,
  depth: number,
  runRaw: SmartZipRunCommand,
): Promise<SmartZipOperationResult> {
  if (!await pathExists(sourcePath)) return operationError(request.action, sourcePath, "Path does not exist.")
  const multipart = multipartKind(sourcePath)
  if (request.config.skipMultipart && multipart === "continuation") {
    return { action: request.action, sourcePath, status: "skipped", message: "Skipped a non-first multipart archive." }
  }
  const outputRoot = request.config.targetDir && await isDirectory(request.config.targetDir)
    ? request.config.targetDir
    : dirname(sourcePath)
  await mkdir(outputRoot, { recursive: true })
  const temporary = await mkdtemp(join(outputRoot, ".smartzip-"))
  const candidates = passwordCandidates(sourcePath, request.config)
  let password: string | undefined
  let tested: CommandResult | undefined
  const testFailures: CommandResult[] = []
  for (const candidate of candidates) {
    const testPassword = candidate || "__XIRANITE_NO_PASSWORD__"
    const args = ["t", sourcePath, "-y", "-sccUTF-8", `-p${testPassword}`]
    tested = await runRaw(request.tools.cli, args)
    if (tested.code === 0) {
      password = candidate || undefined
      break
    }
    testFailures.push(tested)
  }
  if (!tested || tested.code !== 0) {
    await rm(temporary, { force: true, recursive: true })
    return operationError(
      request.action,
      sourcePath,
      archiveTestFailureMessage(testFailures, request.config.passwords.length),
      tested,
    )
  }
  const encodingInspection = request.action === "extract_codepage" && !request.codePage
    ? await inspectCodePage(sourcePath, request.config.codePages)
    : undefined
  const resolvedCodePage = request.codePage || encodingInspection?.recommendedCodePage
  const args = [
    "x",
    sourcePath,
    `-o${temporary}`,
    "-aoa",
    "-y",
    "-sccUTF-8",
    ...(password ? [`-p${password}`] : []),
    ...(resolvedCodePage ? [`-mcp=${resolvedCodePage}`] : []),
    ...excludeArgs(request.config),
  ]
  const displayArgs = args.map((arg) => arg.startsWith("-p") ? "-p••••" : arg)
  const command: SmartZipCommandPlan = { label: `Extract ${sourcePath}`, command: request.tools.cli, args: displayArgs }
  const commandResult = await runRaw(request.tools.cli, args)
  if (commandResult.code !== 0) {
    await rm(temporary, { force: true, recursive: true })
    return operationError(request.action, sourcePath, commandResult.stderr || commandResult.stdout || "7-Zip extraction failed.", commandResult, command)
  }
  await applyPostExtractionRules(temporary, request.config)
  const outputPath = await materializeExtraction(temporary, sourcePath, outputRoot)

  if (depth < 32 && request.config.nestedExtraction) {
    const nested = await nestedArchiveCandidates(outputPath, request, request.config.nestedExtractionForMultiple, runRaw)
    for (const nestedPath of nested) {
      const nestedResult = await extractArchive(nestedPath, request, depth + 1, runRaw)
      if (nestedResult.status === "completed" && multipartKind(nestedPath) !== "continuation") {
        await recyclePath(nestedPath)
      }
    }
  }
  if (request.config.deleteSource || (password && request.config.deleteSourceWhenPassword)) {
    await recyclePath(sourcePath)
  }
  return {
    action: request.action,
    sourcePath,
    outputPath,
    status: "completed",
    message: extractionMessage(password, resolvedCodePage, encodingInspection),
    command,
    commandResult,
    passwordUsed: Boolean(password),
  }
}

const DEFAULT_CODE_PAGES = [65001, 936, 950, 932, 949] as const

async function inspectCodePages (paths: string[], config: SmartZipConfig, runRaw: SmartZipRunCommand): Promise<SmartZipEncodingInspection[]> {
  const sources: string[] = []
  for (const path of paths) {
    if (!await isDirectory(path)) {
      if (multipartKind(path) !== "continuation") sources.push(path)
      continue
    }
    const entries = await walk(path)
    const fileFlags = await Promise.all(entries.map(isFile))
    for (let index = 0; index < entries.length; index += 1) {
      const candidate = entries[index]!
      if (fileFlags[index] && multipartKind(candidate) !== "continuation" && /\.(?:zip|cbz|7z|7z\.001)$/i.test(candidate)) sources.push(candidate)
    }
  }
  const tools = await find7z(config.sevenZipDir, runRaw)
  return Promise.all([...new Set(sources)].map(async (path) => {
    const inspection = await inspectCodePage(path, config.codePages)
    if (!tools) return { ...inspection, archiveStatus: "unsupported" as const, treeError: "7-Zip was not found; file-tree preview is unavailable." }
    const tree = await listArchiveEntries(path, tools.cli, config, inspection.recommendedCodePage, runRaw)
    return { ...inspection, ...tree }
  }))
}

async function listArchiveEntries (
  path: string,
  cli: string,
  config: SmartZipConfig,
  codePage: number | undefined,
  runRaw: SmartZipRunCommand,
): Promise<Pick<SmartZipEncodingInspection, "entries" | "archiveStatus" | "treeError">> {
  let lastResult: CommandResult | undefined
  for (const candidate of passwordCandidates(path, config)) {
    const password = candidate || "__XIRANITE_NO_PASSWORD__"
    const result = await runRaw(cli, ["l", "-slt", path, "-sccUTF-8", `-p${password}`, ...(codePage && codePage !== 65001 ? [`-mcp=${codePage}`] : [])])
    lastResult = result
    if (result.code !== 0) continue
    const entries = parseArchiveEntryPaths(result.stdout)
    return { entries, archiveStatus: candidate ? "encrypted" : "readable" }
  }
  const error = lastResult?.stderr || lastResult?.stdout || "7-Zip could not list this archive."
  return {
    entries: [],
    archiveStatus: /Unexpected end|missing volume|Can not open/i.test(error) ? "incomplete" : "unsupported",
    treeError: conciseArchiveError(error),
  }
}

function parseArchiveEntryPaths (stdout: string): string[] {
  const body = stdout.split(/\r?\n-{10,}\r?\n/).slice(1).join("\n")
  return [...body.matchAll(/^Path = (.+)$/gm)].map((match) => match[1]!.trim()).filter(Boolean)
}

function conciseArchiveError (value: string): string {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.find((line) => /Unexpected end|Wrong password|missing volume|Headers Error|Can not open/i.test(line)) ?? lines.at(-1) ?? "Unable to list archive entries."
}

function archiveTestFailureMessage (results: CommandResult[], configuredPasswordCount: number): string {
  const output = results.map((result) => `${result.stderr}\n${result.stdout}`).join("\n")
  const detail = conciseArchiveError(output)
  if (/Unexpected end|missing volume/i.test(output)) return `Archive is incomplete or a multipart volume is missing. 7-Zip: ${detail}`
  if (/Wrong password|Cannot open encrypted archive|Headers Error/i.test(output)) {
    const count = configuredPasswordCount
      ? `${configuredPasswordCount} configured password${configuredPasswordCount === 1 ? "" : "s"}`
      : "no configured passwords"
    return `Encrypted archive could not be unlocked after trying ${count}. 7-Zip: ${detail}`
  }
  return `Archive test failed. 7-Zip: ${detail}`
}

async function inspectCodePage (path: string, configuredCodePages: number[] = []): Promise<SmartZipEncodingInspection> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(path, "r")
    const info = await handle.stat()
    const signature = Buffer.alloc(Math.min(8, info.size))
    await handle.read(signature, 0, signature.length, 0)
    if (isSevenZipSignature(signature)) {
      return { sourcePath: path, confidence: "certain", unicodeMetadata: true, candidates: [], message: "7z stores Unicode filenames; legacy ZIP codepage selection is not applicable." }
    }
    const tailSize = Math.min(info.size, 32 * 1024 * 1024)
    const tailOffset = info.size - tailSize
    const tail = Buffer.alloc(tailSize)
    await handle.read(tail, 0, tailSize, tailOffset)
    return detectZipFilenameEncoding(tail, path, configuredCodePages, tailOffset)
  } catch (error) {
    return {
      sourcePath: path,
      confidence: "unknown",
      unicodeMetadata: false,
      candidates: [],
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await handle?.close()
  }
}

export function detectZipFilenameEncoding (
  bytes: Uint8Array,
  sourcePath = "archive.zip",
  configuredCodePages: number[] = [],
  baseOffset = 0,
): SmartZipEncodingInspection {
  if (isSevenZipSignature(bytes)) {
    return { sourcePath, confidence: "certain", unicodeMetadata: true, candidates: [], message: "7z stores Unicode filenames; legacy ZIP codepage selection is not applicable." }
  }
  const names = readZipCentralDirectoryNames(bytes, baseOffset)
  if (!names.length) {
    return { sourcePath, confidence: "unknown", unicodeMetadata: false, candidates: [], message: "No ZIP central-directory filenames were found." }
  }
  const nonAscii = names.filter((entry) => entry.bytes.some((byte) => byte > 0x7f))
  if (!nonAscii.length) {
    return { sourcePath, confidence: "certain", unicodeMetadata: false, candidates: [], message: "All archived filenames are ASCII; no codepage override is required." }
  }
  const unicodeMetadata = nonAscii.every((entry) => (entry.flags & 0x0800) !== 0)
  if (unicodeMetadata) {
    const preview = decodeNames(nonAscii.map((entry) => entry.bytes), 65001) ?? []
    return {
      sourcePath,
      recommendedCodePage: 65001,
      confidence: "certain",
      unicodeMetadata: true,
      candidates: [{ codePage: 65001, label: codePageLabel(65001), score: 100, preview }],
      message: "ZIP UTF-8 filename metadata is present.",
    }
  }

  const requested = [...new Set([...configuredCodePages, ...DEFAULT_CODE_PAGES])]
  const candidates = requested
    .map((codePage) => buildEncodingCandidate(nonAscii.map((entry) => entry.bytes), codePage))
    .filter((candidate): candidate is SmartZipEncodingCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score || requested.indexOf(left.codePage) - requested.indexOf(right.codePage))
  const best = candidates[0]
  const margin = best ? best.score - (candidates[1]?.score ?? best.score - 20) : 0
  const confidence = !best ? "unknown" : margin >= 16 ? "high" : margin >= 6 ? "medium" : "low"
  return {
    sourcePath,
    recommendedCodePage: best?.codePage,
    confidence,
    unicodeMetadata: false,
    candidates,
    message: best
      ? `Recommended ${best.label} (${confidence} confidence); review filename previews before extraction.`
      : "No candidate codepage could decode the archived filenames.",
  }
}

function readZipCentralDirectoryNames (bytes: Uint8Array, baseOffset = 0): Array<{ bytes: Uint8Array; flags: number }> {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let offset = Math.max(0, buffer.length - 65_557); offset <= buffer.length - 22; offset += 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) eocd = offset
  }
  if (eocd < 0) return []
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16) - baseOffset
  const result: Array<{ bytes: Uint8Array; flags: number }> = []
  for (let index = 0; index < count && offset + 46 <= buffer.length; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const flags = buffer.readUInt16LE(offset + 8)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const start = offset + 46
    const end = start + nameLength
    if (end > buffer.length) break
    result.push({ bytes: buffer.subarray(start, end), flags })
    offset = end + extraLength + commentLength
  }
  return result
}

function isSevenZipSignature (bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0x37 && bytes[1] === 0x7a && bytes[2] === 0xbc && bytes[3] === 0xaf && bytes[4] === 0x27 && bytes[5] === 0x1c
}

function buildEncodingCandidate (names: Uint8Array[], codePage: number): SmartZipEncodingCandidate | null {
  const preview = decodeNames(names, codePage)
  if (!preview) return null
  return {
    codePage,
    label: codePageLabel(codePage),
    score: preview.reduce((total, name) => total + filenameScore(name, codePage), 0),
    preview,
  }
}

function decodeNames (names: Uint8Array[], codePage: number): string[] | null {
  const encoding = codePageEncoding(codePage)
  if (!encoding) return null
  try {
    const decoder = new TextDecoder(encoding, { fatal: true })
    return names.slice(0, 12).map((name) => decoder.decode(name))
  } catch {
    return null
  }
}

function filenameScore (value: string, codePage: number): number {
  let score = 0
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0
    if (point === 0xfffd || point < 0x20) score -= 40
    else if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) score += codePage === 932 ? 14 : 2
    else if (/\p{Script=Hangul}/u.test(character)) score += codePage === 949 ? 14 : 2
    else if (/\p{Script=Han}/u.test(character)) score += 4
    else if (/[A-Za-z0-9 ._()[\]{}+\-\\/]/.test(character)) score += 1
    else score -= 1
  }
  if (/\.[A-Za-z0-9]{1,8}$/.test(value)) score += 4
  if (/[这为国画动压缩档测试目录文件]/.test(value)) score += codePage === 936 ? 3 : 0
  if (/[這為國畫動壓縮檔測試目錄文件]/.test(value)) score += codePage === 950 ? 3 : 0
  return score
}

function codePageEncoding (codePage: number): string | null {
  if (codePage === 65001) return "utf-8"
  if (codePage === 936) return "gbk"
  if (codePage === 950) return "big5"
  if (codePage === 932) return "shift_jis"
  if (codePage === 949) return "euc-kr"
  return null
}

function codePageLabel (codePage: number): string {
  return ({ 65001: "UTF-8 / CP65001", 936: "GBK / CP936", 950: "Big5 / CP950", 932: "Shift_JIS / CP932", 949: "EUC-KR / CP949" } as Record<number, string>)[codePage] ?? `CP${codePage}`
}

function extractionMessage (password: string | undefined, codePage: number | undefined, inspection: SmartZipEncodingInspection | undefined): string {
  const passwordText = password ? " with a configured password" : ""
  if (codePage && inspection) return `Extracted${passwordText}; auto-selected ${codePageLabel(codePage)} (${inspection.confidence} confidence).`
  if (codePage) return `Extracted${passwordText}; filename encoding ${codePageLabel(codePage)}.`
  return `Extracted${passwordText}.`
}

async function archivePaths (request: SmartZipExecutionRequest, onEvent: (event: NodeRunEvent) => void, runRaw: SmartZipRunCommand): Promise<SmartZipOperationResult[]> {
  const existing = [] as string[]
  for (const path of request.paths) if (await pathExists(path)) existing.push(path)
  if (!existing.length) return request.paths.map((path) => operationError("archive", path, "Path does not exist."))
  const allDirectories = (await Promise.all(existing.map(isDirectory))).every(Boolean)
  const groups = allDirectories ? existing.map((path) => [path]) : [existing]
  const archiveSettings = parseLegacyArchiveArgs(request.config.archiveArgs)
  const results: SmartZipOperationResult[] = []
  for (let index = 0; index < groups.length; index += 1) {
    const paths = groups[index]!
    onEvent({ type: "progress", progress: Math.round(index / groups.length * 100), message: `Archiving ${basename(paths[0]!)}` })
    const output = await uniquePath(archiveTarget(paths, archiveSettings.extension))
    const sources = allDirectories && paths.length === 1 ? [join(paths[0]!, "*")] : paths
    const args = ["a", output, ...archiveSettings.args, ...sources, "-y", "-sccUTF-8"]
    const command: SmartZipCommandPlan = { label: `Archive ${paths.join(", ")}`, command: request.tools.cli, args }
    const commandResult = await runRaw(command.command, command.args)
    results.push(commandResult.code === 0
      ? { action: "archive", sourcePath: paths.join("\n"), outputPath: output, status: "completed", message: "Archived.", command, commandResult }
      : operationError("archive", paths.join("\n"), commandResult.stderr || commandResult.stdout || "7-Zip archive creation failed.", commandResult, command))
  }
  onEvent({ type: "progress", progress: 100, message: "Archive creation completed." })
  return results
}

async function smartOpen (request: SmartZipExecutionRequest, onEvent: (event: NodeRunEvent) => void, runRaw: SmartZipRunCommand): Promise<SmartZipOperationResult[]> {
  onEvent({ type: "progress", progress: 20, message: "Inspecting selected paths." })
  const singlePath = request.paths.length === 1 ? request.paths[0]! : undefined
  const archiveDetected = singlePath
    ? isConfiguredArchive(singlePath, request.config) || (await runRaw(request.tools.cli, ["l", singlePath, "-sccUTF-8"])).code === 0
    : false
  if (singlePath && archiveDetected && request.tools.fileManager) {
    const path = singlePath
    const command: SmartZipCommandPlan = { label: `Open ${path}`, command: request.tools.fileManager, args: [path], detached: true }
    const commandResult = await runRaw(command.command, command.args, true)
    onEvent({ type: "progress", progress: 100, message: "Opened in 7-Zip File Manager." })
    return [commandResult.code === 0
      ? { action: "open", sourcePath: path, status: "completed", message: "Opened in 7-Zip File Manager.", command, commandResult }
      : operationError("open", path, commandResult.stderr || "Unable to open 7-Zip File Manager.", commandResult, command)]
  }
  return archivePaths({ ...request, action: "archive", config: { ...request.config, archiveArgs: request.config.openArchiveArgs } }, onEvent, runRaw).then((items) => items.map((item) => ({ ...item, action: "open" })))
}

async function applyPostExtractionRules (root: string, config: SmartZipConfig): Promise<void> {
  const entries = await walk(root)
  entries.sort((a, b) => b.length - a.length)
  for (const path of entries) {
    if (!await pathExists(path)) continue
    const name = basename(path)
    if (matchesAnyPattern(name, config.deletePatterns)) {
      await rm(path, { force: true, recursive: true })
      continue
    }
    let nextName = name
    if (await isFile(path)) {
      const currentExtension = extname(name).slice(1)
      const extensionRule = config.renameExtensions.find((rule) => rule.match.toLowerCase() === currentExtension.toLowerCase())
      if (extensionRule) nextName = `${parse(name).name}${extensionRule.replacement ? `.${extensionRule.replacement}` : ""}`
    }
    for (const rule of config.renameNames) nextName = nextName.split(rule.match).join(rule.replacement)
    for (const rule of config.renamePatterns) {
      try { nextName = nextName.replace(new RegExp(rule.match, "g"), rule.replacement) } catch { /* Invalid legacy regex: leave unchanged. */ }
    }
    if (nextName && nextName !== name) await rename(path, await uniquePath(join(dirname(path), nextName)))
  }
}

async function materializeExtraction (temporary: string, archivePath: string, outputRoot: string): Promise<string> {
  const top = await readdir(temporary, { withFileTypes: true })
  const walked = await walk(temporary)
  const fileFlags = await Promise.all(walked.map(isFile))
  const files = walked.filter((_path, index) => fileFlags[index])
  let source: string
  if (top.length === 1) source = join(temporary, top[0]!.name)
  else if (files.length === 1) source = files[0]!
  else source = temporary
  const defaultName = source === temporary ? parse(basename(archivePath)).name : basename(source)
  const output = await uniquePath(join(outputRoot, defaultName))
  await rename(source, output)
  if (source !== temporary) await rm(temporary, { force: true, recursive: true })
  return output
}

async function nestedArchiveCandidates (outputPath: string, request: SmartZipExecutionRequest, multiple: boolean, runRaw: SmartZipRunCommand): Promise<string[]> {
  if (await isFile(outputPath)) return await isArchiveByContent(outputPath, request, runRaw) ? [outputPath] : []
  const entries = await walk(outputPath)
  const fileFlags = await Promise.all(entries.map(isFile))
  const files = entries.filter((_path, index) => fileFlags[index])
  const detected: string[] = []
  for (const path of files) if (await isArchiveByContent(path, request, runRaw)) detected.push(path)
  return detected.length === 1 || multiple ? detected : []
}

async function isArchiveByContent (path: string, request: SmartZipExecutionRequest, runRaw: SmartZipRunCommand): Promise<boolean> {
  if (isConfiguredArchive(path, request.config)) return true
  for (const candidate of passwordCandidates(path, request.config)) {
    const password = candidate || "__XIRANITE_NO_PASSWORD__"
    const result = await runRaw(request.tools.cli, ["l", "-slt", path, "-sccUTF-8", `-p${password}`])
    if (result.code === 0 || /(?:^|\r?\n)Type = (?!ERROR)/m.test(result.stdout)) return true
  }
  return false
}

function passwordCandidates (sourcePath: string, config: SmartZipConfig): string[] {
  const directoryPassword = config.addDirectoryAsPassword ? basename(dirname(sourcePath)) : ""
  return [...new Set(["", directoryPassword, ...config.passwords].filter((value, index) => index === 0 || Boolean(value)))]
}

function excludeArgs (config: SmartZipConfig): string[] {
  const args = [
    ...config.excludeExtensions.map((extension) => `-x!*.${extension.replace(/^\./, "")}`),
    ...config.excludeNames.map((name) => `-x!*${name}*`),
  ]
  return args.length ? [...args, "-r"] : args
}

function isConfiguredArchive (path: string, config: SmartZipConfig): boolean {
  const extension = extname(path).slice(1).toLowerCase()
  if (!extension) return true
  if (config.archiveExtensions.some((item) => item === extension) || config.openArchiveExtensions.some((item) => item === extension)) return true
  return config.archiveExtensionPatterns.some((pattern) => {
    try { return new RegExp(pattern, "i").test(extension) } catch { return false }
  })
}

function multipartKind (path: string): "first" | "continuation" | "none" {
  const name = basename(path).toLowerCase()
  const rar = /\.part(\d+)\.rar$/.exec(name)
  if (rar) return Number(rar[1]) === 1 ? "first" : "continuation"
  const numeric = /\.[^.]+\.(\d+)$/.exec(name)
  if (numeric) return Number(numeric[1]) === 1 ? "first" : "continuation"
  return "none"
}

function archiveTarget (paths: string[], extension = ".zip"): string {
  const first = paths[0]!
  if (paths.length === 1) return join(dirname(first), `${basename(first, extname(first))}${extension}`)
  const directory = dirname(first)
  return join(directory, `${basename(directory).replace(/:/g, "") || "archive"}${extension}`)
}

function parseLegacyArchiveArgs (value: string): { extension: string; args: string[] } {
  const normalized = value.trim()
  const match = /^(\.[A-Za-z0-9]+)"?\s*(.*)$/.exec(normalized)
  const extension = match?.[1] ?? ".zip"
  const remainder = match?.[2] ?? ""
  const args = [...remainder.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((item) => item[1] ?? item[2] ?? item[3]!).filter(Boolean)
  return { extension, args }
}

async function uniquePath (path: string): Promise<string> {
  if (!await pathExists(path)) return path
  const parsed = parse(path)
  for (let index = 1; ; index += 1) {
    const candidate = join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`)
    if (!await pathExists(candidate)) return candidate
  }
}

async function walk (root: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    result.push(path)
    if (entry.isDirectory()) result.push(...await walk(path))
  }
  return result
}

function matchesAnyPattern (value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try { return new RegExp(pattern, "i").test(value) } catch { return false }
  })
}

function operationError (action: SmartZipOperationResult["action"], sourcePath: string, message: string, commandResult?: CommandResult, command?: SmartZipCommandPlan): SmartZipOperationResult {
  return { action, sourcePath, status: "error", message, commandResult, command }
}

async function pathExists (path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

async function isDirectory (path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory() } catch { return false }
}

async function isFile (path: string): Promise<boolean> {
  try { return (await stat(path)).isFile() } catch { return false }
}

/**
 * 上游 `:616-624` 这里是"把文件交给回收站提供方"：有 `FileOperationExecutor` 就走它，
 * 没有就自己 `new PlatformFileMutationProvider()`。两样都在 `@xiranite/file-operations` 里，
 * 而那条"可恢复删除 + 删除历史"的缝在本仓**还没落**（文件头第 3 条）⇒ **抛**，
 * 不退化成 `rm`。第二形参（上游的 `executor`）随之没有可传的东西，删掉的是形参不是分支。
 */
export async function recyclePath (path: string): Promise<void> {
  throw new Error(`${NO_TRASH_MESSAGE} (path: ${path})`)
}

async function appendRecord (path: string, record: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8")
}
