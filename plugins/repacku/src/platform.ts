/**
 * Repacku 的执行后端：内核那 13 个方法（`core.ts:53-67` 的 `RepackuRuntime`）在这里落地。
 * 文件那一半从 `<Xiranite>` tag `noxide` 的 `packages/nodes/repacku/src/platform.ts`
 * （**309 行**）搬来，压缩那一半**换了执行后端**，两条腿分得很清：
 *
 * - **文件与路径代数** → `node:fs/promises` + `node:path`，原样照搬
 *   （`docs/adr/0003-migrated-node-file-state.md` 决定 1：内核要算相对位置、要 `mkdir -p`、
 *   要 stat 目录大小，`ctx.fs` 的设计对象是模型发起的工具调用且明令不得把 targetKey 当本地绝对
 *   路径解析，硬套等于重写内核）。
 * - **外部程序（7-Zip / PowerShell `Compress-Archive`）** → DSH 的子进程缝
 *   `ctx.subprocess`（Service Definition `@deepseek-ai/dsh-subprocess`，Service Provider
 *   `dsh-subprocess-local`，`docs/subsystems/subprocess.md`）。上游这里是一份
 *   `node:child_process.execFile`（`platform.ts:1,238-249`），按
 *   `docs/service-mapping.md`「子进程 / 命令执行 ⇒ DSH 已有 ⇒ 不搬基础件」整块不搬：
 *   `which` / `where.exe` 的探测换成 `resolveExecutable()`，7z / PowerShell 的真执行换成
 *   `spawn(spec)`，进程树终止与 scrubbed env 归 provider。**本文件不 import
 *   `node:child_process`**，`core.ts` 也不 import——所以独立 bin 里"真压缩"这件事唯一的
 *   症状就是 `createRepackuPlannerRuntime()` 那句拒绝，见下面那条常量。
 *
 * 三条偏离，逐条点名（每条都有对应测试或台账）：
 * 1. **env 变量不再是配置面**：上游从 `process.env.REPACKU_7Z_PATH` / `SEVEN_ZIP_PATH` /
 *    `7ZIP_PATH` 取 7-Zip 位置（`:165`），从 `process.env.REPACKU_COMPRESSION_LEVEL` 取压缩率
 *    （`:278`）。按 `docs/adr/0013-config-goes-through-dsh-settings.md`，同一些值在 Xaihi 是
 *    `src/index.ts` 的 `Config.sevenZipPath` / `Config.compressionLevel`，值由 DSH 的 patch 层
 *    给、读写走 `ctx.settings`。本文件因此**一个 `process.env` 都不读**（平台判定
 *    `process.platform` 是宿主事实，不是可调项，保留）。
 * 2. **代码页兜底那一半到不了**：上游把子进程输出当 **buffer** 收（`encoding: "buffer"`，
 *    `:240`），非 UTF-8 且在 win32 时回退 `TextDecoder("gbk")`（`decodeProcessOutput`
 *    `:299-309`）。`ctx.subprocess` 的 collect 形状交回的是 provider 已解码的
 *    `CollectedOutput.text`（`docs/subsystems/subprocess.md`「Managed environment namespace
 *    and captured output」），
 *    要拿字节就得改走 `stdio: 'pipe'` 并自己负责退出后的排空与挂死边界——本包不为了保住
 *    GBK 兜底把这条放弃。症状：Windows 上 7z 的 GBK 错误行会以 UTF-8 解码后的形态进
 *    `error` 文本（可能是乱码，但**仍然是那条尾部输出**，不是被咽掉）。记为**新缺口
 *    G-repacku-codepage**。
 * 3. **`windowsHide` / `maxBuffer` 两个 execFile 选项没有对应物**：前者是 provider 的窗口策略；
 *    后者折成 `SPAWN_OUTPUT_MAX_BYTES`（数值取上游那个 `1024*1024*32`，不另定一个数），
 *    再经由 `shortError()`（`:282-285`）截到 800 字符。上游那句 `resultCommandArgs()`
 *    恒返回空数组（`:287-289`），`formatCommand()` 因此永远只印可执行文件名，两条一起搬；
 *    上游那个没人调用的 `exists()`（`:268-275`）**不搬**——`noUnusedLocals` 会红，
 *    而它本来就是死码。
 *
 * 取消信号（G3）：`SubprocessSpawnSpec.signal` 是有的，但 `defineNode` 的 `NodeCall` 不往下传
 * `exec.signal`（`docs/service-mapping.md` G3），所以这里不伪造取消：一次真压缩只能跑到
 * `graceMs` 让 provider 收尾，界面没有中止按钮可读回来。
 *
 * @module xaihi-repacku/platform
 */

import { mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { RepackuCompressionResult, RepackuDirEntry, RepackuPathInfo, RepackuRuntime } from './core.ts'

/** 上游 `platform.ts:19` 那份候选名清单，逐字。 */
const SEVEN_ZIP_NAMES = ['7z', '7zz', '7za', '7z.exe', '7zz.exe', '7za.exe']

/** 上游 `execFile` 的 `maxBuffer`（`:240`），折成 collect 形状的字节上限。 */
const SPAWN_OUTPUT_MAX_BYTES = 1024 * 1024 * 32

/** `graceMs` 与 `plugins/recycleu/src/exec.ts` 同一档：进程树收尾 + 输出排空。 */
const GRACE_MS = 5_000

/** 上游 `compressionLevel()` 的默认值与夹取区间（`:277-280`）。 */
const DEFAULT_COMPRESSION_LEVEL = 7

/**
 * 缺的那条缝点名在这里：`--json` 的载荷与 stderr 用同一句话，不分叉。
 *
 * 这条常量是 bin 面唯一的"为什么"：`ctx.subprocess` 活在宿主进程里，
 * `xrepacku` 那颗 bin 不在，所以它只出计划（与台账 G1 里 `xlogx` 那一档同一条边界，
 * 缺的服务从 `ctx.fs` 换成 `ctx.subprocess`）。
 */
export const REPACKU_EXECUTION_REFUSAL
  = '真压缩要调用外部程序（7-Zip，或 Windows 上的 PowerShell Compress-Archive），而 Xaihi 侧执行外部程序'
    + '只有 DSH 的子进程缝 `ctx.subprocess`（Service Definition `dsh-subprocess`，Provider'
    + ' `dsh-subprocess-local`），它接在 `src/index.ts` 里；`src/core.ts` 与 `src/platform.ts`'
    + '都不许 spawn，独立 bin 不在宿主进程里，因此拿不到它，也拿不到把危险动作变成 ask 的'
    + ' `ctx.approval`（台账 G6）。加 `--dryRun` 只出计划（一个归档都不写）；真执行请用宿主里注册的'
    + ' `repacku_analyze` / `repacku_compress` / `repacku_full` / `repacku_single-pack` /'
    + ' `repacku_gallery-pack`。'

/** 压缩那一半的可调项；来源是 `src/index.ts` 的 `Config`，不是 `process.env`。 */
export interface RepackuCompressorOptions {
  /** 上游 `REPACKU_7Z_PATH` 那一格：绝对路径或装着 7z 的目录。空串按"没配"处理。 */
  sevenZipPath?: string
  /** 上游 `REPACKU_COMPRESSION_LEVEL`：`-mx=` 的取值，内核侧夹 0..9，非有限值折回 7。 */
  compressionLevel?: number
  /** 测试用平台判定；缺省取真实平台（与 `plugins/recycleu/src/exec.ts` 的 `platform` 参数同一口子）。 */
  platform?: NodeJS.Platform
}

/** 内核那 13 个方法里"只碰文件"的那 11 个（两条 `compress*` 不在内）。 */
export type RepackuFsRuntime = Omit<RepackuRuntime, 'compressWholeFolder' | 'compressFiles'>

/**
 * 文件那一半：逐字照搬上游 `createNodeRepackuRuntime()`（`:21-37`）里除两条 `compress*`
 * 之外的全部方法。独立 bin 也用它（分析只读目录 + 写一份 config JSON）。
 */
export function createRepackuFsRuntime (): RepackuFsRuntime {
  return {
    pathInfo,
    listDir,
    readText: (path) => readFile(path, 'utf8'),
    writeText: (path, content) => writeFile(path, content, 'utf8').then(() => undefined),
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    join,
    dirname,
    basename,
    extname,
    resolve,
    now: () => new Date(),
  }
}

/**
 * 宿主侧的完整 `RepackuRuntime`：文件那一半 + 压缩那一半走 `ctx.subprocess`。
 *
 * @param subprocess - DSH 的 `ctx.subprocess`（provider `dsh-subprocess-local`）。
 * @param cwd - spec 要求显式工作目录；探测与打包都在它下面跑（上游 execFile 省略 cwd 时
 *   就是这个语义，`src/index.ts` 传 `process.cwd()`，与 `plugins/recycleu/src/index.ts:44` 一致）。
 * @param options - `Config` 那两格（7-Zip 位置、压缩率）与测试用的平台判定。
 */
export function createSubprocessRepackuRuntime (
  subprocess: SubprocessRuntime,
  cwd: string,
  options: RepackuCompressorOptions = {},
): RepackuRuntime {
  const platform = options.platform ?? process.platform
  const runCommand = (command: string, args: string[], options?: { cwd?: string }) =>
    runViaSubprocess(subprocess, command, args, options?.cwd ?? cwd)

  /** 上游 `findCompressor()`（`:164-181`）：env/Config 那一格优先，再按候选名走 PATH，最后 PowerShell。 */
  async function findCompressor (): Promise<Compressor | null> {
    const configured = options.sevenZipPath?.trim() ?? ''
    if (configured !== '') {
      const fromConfig = await resolveCompressorPath(configured)
      if (fromConfig !== null) return { kind: '7z', command: fromConfig }
    }
    for (const name of SEVEN_ZIP_NAMES) {
      const fromPath = await findOnPath(subprocess, name)
      if (fromPath !== null) return { kind: '7z', command: fromPath }
    }
    if (platform === 'win32') {
      const ps = await findOnPath(subprocess, 'powershell.exe')
      if (ps !== null) return { kind: 'powershell', command: ps }
    }
    return null
  }

  async function compressWholeFolder (sourcePath: string, targetPath: string, compressOptions: { deleteSource?: boolean }): Promise<RepackuCompressionResult> {
    const resolvedSource = resolve(sourcePath)
    const resolvedTarget = resolve(targetPath)
    const source = await safeStat(resolvedSource)
    if (source === null || !source.isDirectory()) return { success: false, originalSize: 0, compressedSize: 0, error: `Source is not a directory: ${sourcePath}` }

    const originalSize = await folderSize(resolvedSource)
    await mkdir(dirname(resolvedTarget), { recursive: true })
    const compressor = await findCompressor()
    if (compressor === null) return { success: false, originalSize, compressedSize: 0, error: 'No compressor found. Install 7-Zip or use Windows PowerShell Compress-Archive.' }

    const result = compressor.kind === '7z'
      ? await run7zWithList(subprocess, cwd, compressor.command, resolvedTarget, [basename(resolvedSource)], { cwd: dirname(resolvedSource), recursive: true }, options.compressionLevel)
      : await runPowerShellCompressArchive(runCommand, compressor.command, [resolvedSource], resolvedTarget)

    if (result.code !== 0) return { success: false, originalSize, compressedSize: 0, error: shortError(result), command: formatCommand(compressor.command, resultCommandArgs(result)) }
    const after = await safeStat(resolvedTarget)
    const compressedSize = after === null ? 0 : after.size

    if (compressOptions.deleteSource) await rm(resolvedSource, { recursive: true, force: true })
    return {
      success: true,
      originalSize,
      compressedSize,
      command: compressor.kind,
    }
  }

  async function compressFiles (sourcePath: string, targetPath: string, extensions: string[], compressOptions: { deleteSource?: boolean }): Promise<RepackuCompressionResult> {
    const resolvedSource = resolve(sourcePath)
    const resolvedTarget = resolve(targetPath)
    const source = await safeStat(resolvedSource)
    if (source === null || !source.isDirectory()) return { success: false, originalSize: 0, compressedSize: 0, error: `Source is not a directory: ${sourcePath}` }

    const files = await matchingDirectFiles(resolvedSource, extensions, resolvedTarget)
    if (!files.length) return { success: false, originalSize: 0, compressedSize: 0, error: 'No matching files found.' }

    const originalSize = files.reduce((sum, item) => sum + item.size, 0)
    await mkdir(dirname(resolvedTarget), { recursive: true })
    const compressor = await findCompressor()
    if (compressor === null) return { success: false, originalSize, compressedSize: 0, error: 'No compressor found. Install 7-Zip or use Windows PowerShell Compress-Archive.' }

    const result = compressor.kind === '7z'
      ? await run7zWithList(subprocess, cwd, compressor.command, resolvedTarget, files.map((file) => basename(file.path)), { cwd: resolvedSource }, options.compressionLevel)
      : await runPowerShellCompressArchive(runCommand, compressor.command, files.map((file) => file.path), resolvedTarget)

    if (result.code !== 0) return { success: false, originalSize, compressedSize: 0, error: shortError(result), command: compressor.kind }
    const after = await safeStat(resolvedTarget)
    const compressedSize = after === null ? 0 : after.size

    if (compressOptions.deleteSource) {
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)))
    }
    return {
      success: true,
      originalSize,
      compressedSize,
      command: compressor.kind,
    }
  }

  return { ...createRepackuFsRuntime(), compressWholeFolder, compressFiles }
}

/**
 * 独立 bin 的 runtime：文件那一半照用，两条 `compress*` 一被调用就把缺的缝喊出来。
 *
 * 为什么留一个会抛的实现而不是让 `--dryRun` 那条路径根本不碰它：内核
 * （`core.ts:502-505`）在 `dryRun` 成立时才短路，真执行那一路是 `ensureDir` + `compress*`；
 * 终端面已经在前面拦了一次（`src/cli.ts` 的 `runHostedAction`），这里是**第二道**——
 * 万一接线被改掉，症状是这句话，不是"归档没写出来但报了成功"。
 */
export function createRepackuPlannerRuntime (): RepackuRuntime {
  const refuse = async (): Promise<RepackuCompressionResult> => {
    throw new Error(REPACKU_EXECUTION_REFUSAL)
  }
  return { ...createRepackuFsRuntime(), compressWholeFolder: refuse, compressFiles: refuse }
}

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

interface Compressor {
  kind: '7z' | 'powershell'
  command: string
}

/**
 * 一次 `ctx.subprocess` 的批量执行：collect 两条流，退出码 0 / 非 0 都算"跑完了"。
 *
 * `spawn` 同步返回句柄，`done` 才是结局；provider 失败（可执行文件没了）时 `done` 会
 * **拒绝**，上游对应的是 `execFile` 的 error 分支（`:241`：非数字 code 折成 1），
 * 所以这里折成 `{ code: 1, stderr: message }`，让上层照旧走 `shortError()`。
 */
async function runViaSubprocess (
  subprocess: SubprocessRuntime,
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  const handle = subprocess.spawn({
    argv: [command, ...args],
    cwd,
    graceMs: GRACE_MS,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: SPAWN_OUTPUT_MAX_BYTES },
      stderr: { maxBytes: SPAWN_OUTPUT_MAX_BYTES },
    },
  })
  try {
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    return { code: outcome.exitCode ?? 1, stdout, stderr }
  } catch (error) {
    return { code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 上游 `findOnPath()`（`:196-201`）的对应物：`which` / `where.exe` 那条探测本身也是外部程序，
 * 这里改用 provider 的可执行文件解析（`resolveExecutable` 走的就是同一份 scrubbed PATH，
 * `docs/subsystems/subprocess.md`「Executable lookup」）。找不到时 provider 抛
 * `SubprocessExecutableNotFoundError`，而上游那句的语义是"返回 null，接着试下一个候选"。
 */
async function findOnPath (subprocess: SubprocessRuntime, command: string): Promise<string | null> {
  try {
    return await subprocess.resolveExecutable(command)
  } catch {
    return null
  }
}

async function pathInfo (path: string): Promise<RepackuPathInfo> {
  const resolved = resolve(path)
  try {
    const item = await stat(resolved)
    return {
      path: resolved,
      exists: true,
      isFile: item.isFile(),
      isDirectory: item.isDirectory(),
      size: item.size,
    }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false, size: 0 }
  }
}

async function listDir (path: string): Promise<RepackuDirEntry[]> {
  const resolved = resolve(path)
  const entries = await readdir(resolved, { withFileTypes: true })
  return Promise.all(entries.map(async (entry) => {
    const entryPath = join(resolved, entry.name)
    const item = await safeStat(entryPath)
    return {
      name: entry.name,
      path: entryPath,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      size: item?.isFile() ? item.size : 0,
    }
  }))
}

async function matchingDirectFiles (sourcePath: string, extensions: string[], targetPath: string): Promise<Array<{ path: string; size: number }>> {
  const normalizedExtensions = new Set(extensions.map((item) => item.toLowerCase()))
  const target = resolve(targetPath).toLowerCase()
  const entries = await readdir(sourcePath, { withFileTypes: true })
  const files: Array<{ path: string; size: number }> = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const path = join(sourcePath, entry.name)
    if (resolve(path).toLowerCase() === target) continue
    if (normalizedExtensions.size && !normalizedExtensions.has(extname(entry.name).toLowerCase())) continue
    const item = await safeStat(path)
    if (item?.isFile()) files.push({ path, size: item.size })
  }
  return files
}

/** 上游 `resolveCompressorPath()`（`:183-194`）：给的是文件就用，给的是目录就按候选名找。 */
async function resolveCompressorPath (value: string): Promise<string | null> {
  const info = await safeStat(value)
  if (info?.isFile()) return value
  if (info?.isDirectory()) {
    for (const name of SEVEN_ZIP_NAMES) {
      const candidate = join(value, name)
      const candidateInfo = await safeStat(candidate)
      if (candidateInfo?.isFile()) return candidate
    }
  }
  return null
}

async function safeStat (path: string) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

async function folderSize (path: string): Promise<number> {
  let total = 0
  for (const entry of await listDir(path)) {
    if (entry.isFile) total += entry.size
    else if (entry.isDirectory) total += await folderSize(entry.path)
  }
  return total
}

/** 上游 `run7z()`（`:203-205`）：那两条 `-sccUTF-8 -scsUTF-8` 是中文路径的命根子，逐字留着。 */
async function run7z (
  subprocess: SubprocessRuntime,
  cwd: string,
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<CommandResult> {
  return runViaSubprocess(subprocess, command, ['-sccUTF-8', '-scsUTF-8', ...args], options?.cwd ?? cwd)
}

/**
 * 上游 `run7zWithList()`（`:207-225`）：文件清单落在临时目录里（`@<listPath>` 是 7z 的
 * list-file 语法），用完 `finally` 里删掉。临时目录**前缀**从上游的 `xiranite-repacku-`
 * 改成 `xaihi-repacku-`（`docs/adr/0010-brand-is-xaihi.md`：临时目录前缀属于"会随代码活下去
 * 的称呼"；它不是落盘的数据格式，所以这次改名不构成数据迁移）。
 */
async function run7zWithList (
  subprocess: SubprocessRuntime,
  cwd: string,
  command: string,
  targetPath: string,
  entries: string[],
  options: { cwd: string; recursive?: boolean },
  compressionLevel: number | undefined,
): Promise<CommandResult> {
  const dir = await mkdtemp(join(tmpdir(), 'xaihi-repacku-'))
  const listPath = join(dir, 'files.txt')
  try {
    await writeFile(listPath, `\uFEFF${entries.join('\n')}\n`, 'utf8')
    return await run7z(subprocess, cwd, command, [
      'a',
      '-tzip',
      targetPath,
      `@${listPath}`,
      options.recursive ? '-r' : '',
      `-mx=${compressionLevelValue(compressionLevel)}`,
      '-mmt=on',
      '-aou',
    ].filter(Boolean), { cwd: options.cwd })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function runPowerShellCompressArchive (
  runCommand: (command: string, args: string[], options?: { cwd?: string }) => Promise<CommandResult>,
  command: string,
  literalPaths: string[],
  targetPath: string,
): Promise<CommandResult> {
  const pathList = literalPaths.map(quotePowerShell).join(', ')
  const script = [
    '$ErrorActionPreference = \'Stop\'',
    '$ProgressPreference = \'SilentlyContinue\'',
    `$paths = @(${pathList})`,
    `Compress-Archive -LiteralPath $paths -DestinationPath ${quotePowerShell(targetPath)} -Force`,
  ].join('; ')
  return runCommand(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script])
}

/** 上游 `compressionLevel()`（`:277-280`）的夹取，取值来源换成 `Config`。 */
function compressionLevelValue (value: number | undefined): number {
  const parsed = Number(value ?? DEFAULT_COMPRESSION_LEVEL)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(9, Math.floor(parsed))) : DEFAULT_COMPRESSION_LEVEL
}

/** 上游 `shortError()`（`:282-285`）：800 字符的尾部，逐字。 */
function shortError (result: CommandResult): string {
  const text = (result.stderr || result.stdout || `exit code ${result.code}`).trim()
  return text.length > 800 ? `...${text.slice(-797)}` : text
}

/** 上游 `resultCommandArgs()`（`:287-289`）恒返回空数组，原样搬（它是个已知的一次性形状）。 */
function resultCommandArgs (_result: CommandResult): string[] {
  return []
}

/** 上游 `formatCommand()`（`:291-293`）：带空格的片段加引号。 */
function formatCommand (command: string, args: string[]): string {
  return [command, ...args].map((part) => /\s/.test(part) ? `"${part.replace(/"/g, '\\\"')}"` : part).join(' ')
}

/** 上游 `quotePowerShell()`（`:295-297`）：单引号成对翻倍。 */
function quotePowerShell (value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
