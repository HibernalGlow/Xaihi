/**
 * BitV 的 `BitvRuntime` 落地实现。两条运行时，对应两个面（与 `plugins/mvz/src/platform.ts`
 * 同一形状）：
 *
 * 1. `createNodeBitvRuntime(subprocess, options)` —— **宿主半边**（`src/index.ts`）。外部程序
 *    这一格从上游的 `node:child_process.execFile`（基线
 *    `packages/nodes/bitv/src/platform.ts:48-58` 与 `:265-285`）换成 **DSH 的
 *    `ctx.subprocess`**：`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬基础件」那一行定的
 *    就是这条，先例 `plugins/sleept/src/exec.ts`、`plugins/recycleu/src/exec.ts`、
 *    `plugins/mvz/src/platform.ts`。形状与判据见 `docs/subsystems/subprocess.md`
 *    （Service Definition `@deepseek-ai/dsh-subprocess` / Service Provider
 *    `dsh-subprocess-local`）。`core.ts` 一行都不碰机器，所以"不在内核里 shell out"由类型系统
 *    保证：内核只认 `BitvRuntime` 那 10 个方法（`core.ts:92-105`）。
 * 2. `createBitvPlanRuntime()` —— **终端半边**（`src/cli.ts`）。独立 bin 不在宿主进程里，
 *    拿不到 `ctx.subprocess` ⇒ 碰外部程序的那两格（`findFfprobe` / `runFfprobeJson`）**当场抛
 *    拒答**（缺口 G1/G6 那一类：缝活在插件进程里，能装进 `$PATH` 的那一面活在它外面）。
 *    `src/cli.ts` 在调内核**之前**就按动作表整条拒绝，所以这两个 throw 是第二道兜底：万一将来
 *    有人把某条腿接成"只读报告也能跑"，炸的是这一句，不是偷偷 spawn。
 *
 * DI 缝 → 出处（逐条）：
 * - `findFfprobe` → `ctx.subprocess.resolveExecutable('ffprobe')`
 *   （`dsh-subprocess/lib/types/index.d.ts:88`；`subprocess.md` 的 "Executable lookup" 那段：
 *   裸名走 provider 洗过的 `PATH`，绝对路径做校验）。上游用 `which` / `where.exe` **起进程**去找
 *   （`:60-75`），这里换成缝自带的查找回合，**少起的正是那条定位进程**；查找顺序照上游
 *   （① 环境变量 `BITV_FFPROBE_PATH` ② `PATH` 上的 `ffprobe`），两条都空 ⇒ `null`，
 *   由 `core.ts:230,255` 那句 "ffprobe was not found on this system." 出面（不在这里另写一句失败）。
 *   与 `plugins/mvz/src/platform.ts` 同一取舍：**不替可执行文件位置新增 `Config` 键**——
 *   ADR-0013 那条讲的是"落盘位置与部署可变量要使用者给"，而上游这里本来就只有
 *   "环境变量 + PATH"两档，给它加第三个开关属于发明。
 * - `runFfprobeJson` → `ctx.subprocess.spawn(spec)`（同一份 `.d.ts:102`）。`argv` 永不经 shell
 *   解释；这条缝 "applies no defaults"，所以 `stdio` 三根都要显式给、`graceMs` 必须显式给正数。
 *   参数序列 `["-v","error","-print_format","json","-show_format","-show_streams", path]`
 *   与上游 `:49-56` 逐字一致（少一个 flag，输出的 JSON 就少一格，`parseFfprobeVideo` 会整条失败）。
 *   `maxBuffer: 1024 * 1024 * 32`（`:272`）换成 `stdout`/`stderr` 各自的 `maxBytes` 收集上限；
 *   差别写明：execFile 超限是**报错**，这条缝是**留尾**（`CollectedOutput.truncated`），
 *   所以超限时 stdout 会短、退出码仍是真的——症状会是 "invalid JSON" 而不是 maxBuffer 那条消息。
 *   `windowsHide: true`（`:271`）在这条缝上没有对应旋钮：窗口可见性是 provider 的事。
 * - 退出码那格 `outcome.exitCode ?? 1`：**照上游的语义而不是照 mvz 那份**。上游是
 *   `typeof error.code === "number" ? error.code : error ? 1 : 0`（`:277-279`），"被信号杀掉"
 *   与"根本没起来"都落进非零那一侧；这条缝的 `done` 只在真的退出后给 `exitCode`
 *   （`types.d.ts:107-112`：信号杀是 `null`），spawn 失败则直接 reject。所以 `null → 1` 与上游同判，
 *   而 reject 由 `core.ts:486` 那圈 `try/catch` 收成一条 `${file.path}: …` 错误，
 *   与上游 `exec` 从不 reject 的差别是**多了一种失败写法**，不是少了一种。
 * - `discoverVideos` / `statFile` / `readJson` / `writeJson` / `resolveAvailablePath` /
 *   `transferFile` → `node:fs/promises` + `node:path`，**逐字搬上游那份**（`:77-190` 与
 *   `:192-246`）。不走 `ctx.fs`：`docs/adr/0003-migrated-node-file-state.md` 决定 1 判的是同一件事
 *   ——那条缝面向模型发起的工具调用、要求不透明 `FsTarget` 且禁止解析路径，而本内核要
 *   `resolve`、`relative`、`readdir(withFileTypes)`、`link`+`unlink` 与 `wx` 独占写。
 *   权限边界因此靠**动作分级**：`classify` / `report` 的非预演那一次在定义里是 `danger.all`，
 *   `defineNode` 把它变成 `tools/pre-execute` 的 `ask`，审批走 DSH 的 `approval` 缝。
 * - `now` / `dirname` → 与上游同一格（`:71-72`）。
 *
 * 类型层的一件事是**本仓的债**不是 DSH 的缺口：`BitvSubprocessSeam` 及伴生类型是
 * `@deepseek-ai/dsh-subprocess` 已发布 `.d.ts` 的**子集镜像**（照 `lib/types/index.d.ts:88,102`
 * 与 `lib/types/types.d.ts` 的 `SubprocessSpawnSpec` / `SubprocessHandle` / `SubprocessOutcome` /
 * `SubprocessStdio` 抄），因为本包现在没声明那个依赖：装了 `findz` / `sleept` / `recycleu` 那份
 * `@deepseek-ai/dsh-subprocess@0.2.0-rc.2` 需要一次 `pnpm install`，而本批不许跑。
 * 取用时走 `ctx.get('subprocess')`（`index.ts`），依赖补上之后应改回 `import type` +
 * `ctx.subprocess`，届时删掉这份镜像。
 *
 * @module xaihi-bitv/platform
 */

import { constants } from 'node:fs'
import { access, copyFile, link, lstat, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'

import {
  isBitvVideoPath,
  type BitvDiscoveryResult,
  type BitvRuntime,
  type BitvSourceFile,
  type BitvTransferMode,
} from './core.ts'

/**
 * 拒答那句：终端面打印的与运行时抛的是**同一句**（一份真源，别处不许再抄）。
 * `src/cli.ts` 把它写进 stderr 与 `--json` 的 `refused` 字段。
 */
export const BITV_PROCESS_SEAM_REFUSAL =
  'bitv 的四条动作都要跑 ffprobe，而外部程序一律走 DSH 的 `ctx.subprocess`（`src/platform.ts`）；'
  + '独立 bin 不在宿主进程里，拿不到那条缝（缺口 G1/G6 那一类：缝活在插件进程里，`$PATH` 上那一面活在它外面）。'
  + '这里既不出计划也不动文件。要真跑请用宿主侧的工具 `bitv_status` / `bitv_analyze` / `bitv_classify` / '
  + '`bitv_report`（`classify` 与 `report` 的非预演那一次由定义里的 `danger.all` 变成 DSH 的 `ask`）。'

/** 收集上限：对齐基线 `:272` 那个 `maxBuffer: 1024 * 1024 * 32`。 */
const MAX_OUTPUT_BYTES = 1024 * 1024 * 32

/**
 * `SubprocessSpawnSpec.graceMs` 要求的正有限宽限期（基线那份镜像的说明里指向
 * `types.d.ts` 的 spec 段：本缝不给默认值）。本包从不主动 `terminate()`——取消信号到不了
 * 节点调用（缺口 G3），所以这个数字今天唯一的作用是满足 spec 的"必须显式给"。
 * 5 秒与 `plugins/sleept/src/exec.ts`、`plugins/recycleu/src/exec.ts` 同一量级。
 */
const SPAWN_GRACE_MS = 5000

/** `SubprocessOutcome`（`dsh-subprocess/lib/types/types.d.ts:107`）里本包用到的那一格。 */
export interface BitvSubprocessOutcome {
  /** 退出码；被信号杀掉时是 `null`。 */
  exitCode: number | null
}

/** `SubprocessOutputReader.readFrom(0)` 的返回里本包用到的那一格。 */
export interface BitvSubprocessOutputRead {
  text: string
}

/** `SubprocessHandle` 里本包用到的两格（其余流式能力本节点用不上）。 */
export interface BitvSubprocessHandle {
  /** 收集到的 stdout/stderr，退出之后仍然可读。 */
  readonly collected: {
    readonly stdout?: BitvSubprocessOutputReader
    readonly stderr?: BitvSubprocessOutputReader
  }
  /** 退出事实；spawn 或 provider 失败时 reject。 */
  readonly done: Promise<BitvSubprocessOutcome>
}

/** `SubprocessOutputReader` 的本包镜像：只用 `readFrom` 那一个动词。 */
export interface BitvSubprocessOutputReader {
  readFrom(offset: number): BitvSubprocessOutputRead
}

/**
 * `SubprocessSpawnSpec` 中本包给得到的那几格（`index.d.ts:102` 要求"全部显式"：
 * `argv`、`cwd`、`stdio`、`graceMs` 一个都不给默认）。
 */
export interface BitvSubprocessSpawnSpec {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly stdio: {
    readonly stdin: 'ignore' | 'pipe' | { readonly data: string }
    readonly stdout: 'pipe' | 'inherit' | { readonly maxBytes: number }
    readonly stderr: 'pipe' | 'inherit' | { readonly maxBytes: number }
  }
  readonly graceMs: number
}

/**
 * `SubprocessRuntime`（`dsh-subprocess/lib/types/index.d.ts:75-111`）里本包用到的两个方法。
 * 装进宿主时 `ctx.subprocess` 的真实实现结构上比这份宽，所以按子集取用是安全的。
 */
export interface BitvSubprocessSeam {
  /** 裸名走 provider 洗过的 `PATH`；绝对路径做校验。找不到就抛。 */
  resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>
  /** 同步拿到活句柄；失败经 `done` reject。 */
  spawn(spec: BitvSubprocessSpawnSpec): BitvSubprocessHandle
}

export interface BitvRuntimeOptions {
  cwd?: string
  env?: Record<string, string | undefined>
  now?: () => Date
}

interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * 宿主半边的运行时。
 * @param subprocess - DSH 的 `ctx.subprocess`（`index.ts` 用 `ctx.get('subprocess')` 取）。
 * @param options - `cwd` / `env` / 时间源；基线那份同样吃 `cwd` 与 `env`
 *   （`:33-38`），时间源留给测试。
 */
export function createNodeBitvRuntime(subprocess: BitvSubprocessSeam, options: BitvRuntimeOptions = {}): BitvRuntime {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env

  return {
    findFfprobe: () => findFfprobe(subprocess, cwd, env),
    discoverVideos: (paths, recursive) => discoverVideos(paths, recursive, cwd),
    async statFile(path) {
      const file = await stat(resolveFrom(cwd, path))
      if (!file.isFile()) throw new Error("Path is not a file.")
      return { sizeBytes: file.size }
    },
    async runFfprobeJson(ffprobePath, path) {
      const result = await runProcess(subprocess, cwd, ffprobePath, [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        resolveFrom(cwd, path),
      ])
      if (result.code !== 0) throw new Error(shortProcessError(result, "ffprobe failed"))
      try {
        return JSON.parse(result.stdout) as unknown
      } catch (error) {
        throw new Error(`ffprobe returned invalid JSON: ${errorMessage(error)}`)
      }
    },
    async readJson(path) {
      return JSON.parse(await readFile(resolveFrom(cwd, path), "utf8")) as unknown
    },
    writeJson: (desiredPath, value) => writeJsonExclusive(resolveFrom(cwd, desiredPath), value),
    resolveAvailablePath: (desiredPath) => findAvailablePath(resolveFrom(cwd, desiredPath)),
    transferFile: (sourcePath, desiredPath, mode) => transferFileExclusive(
      resolveFrom(cwd, sourcePath),
      resolveFrom(cwd, desiredPath),
      mode,
    ),
    now: options.now ?? (() => new Date()),
    dirname,
  }
}

/**
 * 终端半边的运行时：外部程序那两格当场抛拒答。
 * 文件那几格**留着**（`node:fs` 在 bin 里够得着），为的是 `src/cli.ts` 万一将来要出纯预演
 * 计划时用的还是同一份内核；今天这条路上一次都不会被调用，因为 bin 在进内核之前就按动作表拒绝了。
 */
export function createBitvPlanRuntime(options: BitvRuntimeOptions = {}): BitvRuntime {
  const refuse = (): never => {
    throw new Error(BITV_PROCESS_SEAM_REFUSAL)
  }
  const runtime = createNodeBitvRuntime(
    {
      resolveExecutable: async () => refuse(),
      spawn: () => refuse(),
    },
    options,
  )
  // `findFfprobe` 那一格要**自己**抛：它里面有一条 `catch ⇒ null`（缝查不到就交给内核那句
  // "ffprobe was not found on this system."），把拒绝塞进缝里就会被那条兜底咽掉——
  // 症状是"这台机器没装 ffmpeg"，而真相是"这条缝不在宿主进程之外"。测试抓到过一次。
  return { ...runtime, findFfprobe: async () => refuse() }
}

/**
 * 基线 `:60-75` 的查找顺序，候选与顺序照上游：`BITV_FFPROBE_PATH` → `PATH` 上的
 * `ffprobe`；两条都空 ⇒ `null`（上游由 `core.ts:230,255` 出面报错，这里不另写一句失败）。
 * `which` / `where.exe` 那条定位进程换成 `resolveExecutable`，非零退出与"抛找不到"同判 `null`。
 */
export async function findFfprobe(
  subprocess: BitvSubprocessSeam,
  cwd: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const configured = env.BITV_FFPROBE_PATH?.trim()
  if (configured) {
    const path = resolveFrom(cwd, configured)
    if (await isFile(path)) return path
  }

  try {
    return await subprocess.resolveExecutable('ffprobe')
  } catch {
    return null
  }
}

export async function discoverVideos(paths: string[], recursive: boolean, cwd = process.cwd()): Promise<BitvDiscoveryResult> {
  const files: BitvSourceFile[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  for (const input of paths) {
    const path = resolveFrom(cwd, input)
    let info
    try {
      info = await lstat(path)
    } catch (error) {
      errors.push(`${input}: ${errorMessage(error)}`)
      continue
    }

    if (info.isFile()) {
      if (!isBitvVideoPath(path)) {
        errors.push(`${input}: unsupported video extension`)
        continue
      }
      addDiscoveredFile(files, seen, {
        path,
        basePath: dirname(path),
        relativePath: basename(path),
      })
      continue
    }

    if (!info.isDirectory()) {
      errors.push(`${input}: path is not a regular file or directory`)
      continue
    }

    await walkVideoDirectory(path, path, recursive, files, seen, errors)
  }

  files.sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: "base" }))
  return { files, errors }
}

export async function findAvailablePath(desiredPath: string): Promise<string> {
  for (let index = 0; ; index += 1) {
    const candidate = collisionCandidate(desiredPath, index)
    if (!await pathExists(candidate)) return candidate
  }
}

export async function transferFileExclusive(
  sourcePath: string,
  desiredPath: string,
  mode: BitvTransferMode,
): Promise<string> {
  await mkdir(dirname(desiredPath), { recursive: true })
  for (let index = 0; ; index += 1) {
    const candidate = collisionCandidate(desiredPath, index)
    try {
      if (mode === "copy") {
        await copyFile(sourcePath, candidate, constants.COPYFILE_EXCL)
      } else {
        await moveFileWithoutOverwrite(sourcePath, candidate)
      }
      return candidate
    } catch (error) {
      if (isErrorCode(error, "EEXIST")) continue
      throw error
    }
  }
}

async function walkVideoDirectory(
  basePath: string,
  directory: string,
  recursive: boolean,
  files: BitvSourceFile[],
  seen: Set<string>,
  errors: string[],
): Promise<void> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    errors.push(`${directory}: ${errorMessage(error)}`)
    return
  }

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (recursive) await walkVideoDirectory(basePath, path, recursive, files, seen, errors)
      continue
    }
    if (!entry.isFile() || !isBitvVideoPath(path)) continue
    addDiscoveredFile(files, seen, {
      path,
      basePath,
      relativePath: relative(basePath, path),
    })
  }
}

function addDiscoveredFile(files: BitvSourceFile[], seen: Set<string>, file: BitvSourceFile): void {
  const key = process.platform === "win32" ? file.path.toLowerCase() : file.path
  if (seen.has(key)) return
  seen.add(key)
  files.push(file)
}

async function writeJsonExclusive(desiredPath: string, value: unknown): Promise<string> {
  await mkdir(dirname(desiredPath), { recursive: true })
  const json = `${JSON.stringify(value, null, 2)}\n`
  for (let index = 0; ; index += 1) {
    const candidate = collisionCandidate(desiredPath, index)
    try {
      await writeFile(candidate, json, { encoding: "utf8", flag: "wx" })
      return candidate
    } catch (error) {
      if (isErrorCode(error, "EEXIST")) continue
      throw error
    }
  }
}

async function moveFileWithoutOverwrite(sourcePath: string, targetPath: string): Promise<void> {
  try {
    // A hard link is atomic and cannot replace an existing destination. It is
    // safer than rename(), which overwrites on POSIX.
    await link(sourcePath, targetPath)
    await unlink(sourcePath)
    return
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) throw error
    if (!isCrossDeviceOrUnsupported(error)) throw error
  }

  await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL)
  await unlink(sourcePath)
}

function collisionCandidate(path: string, index: number): string {
  if (index === 0) return path
  const extension = extname(path)
  const filename = basename(path, extension)
  return join(dirname(path), `${filename} (${index})${extension}`)
}

function resolveFrom(cwd: string, path: string): string {
  return resolve(cwd, path)
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 基线 `exec()`（`:265-285`）的 `ctx.subprocess` 版：同一份 `{code, stdout, stderr}` 结局，
 * 底下换的是"谁起进程、谁收流、谁管进程树"。
 *
 * `env` 与 `DSH_*` 那套由这条缝自己洗（`scrubbedParentEnv`），所以上游那份
 * `env: env as NodeJS.ProcessEnv`（`:270`）没有对应参数：基线是把整个 `process.env` 递给子进程，
 * 这条缝是"洗过的基础环境 + 调用方显式给的条目"，本包没有需要显式递出去的条目。
 * @returns 退出码 + 两条收集到的流；`done` reject（起不来 / provider 故障）时原样抛出。
 */
async function runProcess(
  subprocess: BitvSubprocessSeam,
  cwd: string,
  command: string,
  args: string[],
): Promise<ExecResult> {
  const handle = subprocess.spawn({
    argv: [command, ...args],
    cwd,
    graceMs: SPAWN_GRACE_MS,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: MAX_OUTPUT_BYTES },
      stderr: { maxBytes: MAX_OUTPUT_BYTES },
    },
  })
  const outcome = await handle.done
  return {
    // 上游：`typeof error.code === "number" ? error.code : error ? 1 : 0`（`:277-279`）。
    // 这里 `null`（信号杀）落 1，正常退出用真的退出码。
    code: outcome.exitCode ?? 1,
    stdout: handle.collected.stdout?.readFrom(0).text ?? '',
    stderr: handle.collected.stderr?.readFrom(0).text ?? '',
  }
}

function shortProcessError(result: ExecResult, fallback: string): string {
  const message = (result.stderr || result.stdout || fallback).trim()
  return message.length > 500 ? `${message.slice(0, 497)}...` : message
}

function isCrossDeviceOrUnsupported(error: unknown): boolean {
  return ["EXDEV", "EPERM", "EACCES", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].some((code) => isErrorCode(error, code))
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && "code" in error && (error as { code?: unknown }).code === code
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
