/**
 * Gifu 的 `GifuRuntime` 落地实现。搬的是基线 tag `noxide` 的
 * `packages/nodes/gifu/src/platform.ts`（418 行）里的全部管线，**只有外部程序那一格换了执行方**，
 * 并且分两条运行时，对应两个面：
 *
 * 1. `createNodeGifuRuntime(seam, cwd)` —— **宿主半边**（`src/index.ts`）。上游 `:1` 的
 *    `node:child_process.execFile` 换成 **DSH 的 `ctx.subprocess`**（provider
 *    `dsh-subprocess-local`）：`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬」那一行定的
 *    就是这条（先例 `plugins/sleept/src/exec.ts`、`plugins/mvz/src/platform.ts`、
 *    `plugins/bitv/src/platform.ts`），判据是 `docs/subsystems/subprocess.md`。
 *    `core.ts` 一行都不碰机器，所以"不在内核里 shell out"这件事由类型系统保证：内核只认
 *    `GifuRuntime` 那 11 个方法（`core.ts:144-158`，本文件里不带说明符的行号均指基线那份 platform.ts）。
 * 2. `createGifuUnwiredRuntime()` —— **终端半边**（`src/cli.ts`）。独立 bin 不在宿主进程里，
 *    拿不到 `ctx.subprocess` ⇒ 碰外部程序的两格（`listArchiveImages` / `convertArchive`）
 *    当场抛 `GIFU_PROCESS_SEAM_REFUSAL`。这一档不是兜底而是**唯一档**：gifu 连"只出计划"都要
 *    先 `7z l -slt` 数图片（`core.ts:279`），所以 `xgifu inspect|plan|make` 三条腿在 bin 里
 *    一律拒绝，`cli.ts` 在调内核**之前**就把那句话说完。
 *
 * DI 缝 → DSH 服务的对应（逐条出处）：
 * - `listArchiveImages` / `convertArchive` 的每一次外部调用 → `ctx.subprocess.spawn(spec)`
 *   （`dsh-subprocess/lib/types/index.d.ts:102`）。`argv` 永不经 shell 解释。
 * - `findSevenZip` / `findFfmpeg` / `findFfprobe` 的裸名查找 → `ctx.subprocess.resolveExecutable(name)`
 *   （同一份 `.d.ts:88`；`subsystem` 文档的 "Executable lookup" 那段：裸名走 provider 洗过的
 *   `PATH`，绝对路径做校验）。上游是**起一个 `which`/`where.exe` 进程**去找（`:332-342`），
 *   这里换成缝自带的查找回合 ⇒ 少起的正是那条定位进程；**候选名单与顺序逐字保留**
 *   （`SEVEN_ZIP_NAMES` 六条 / `FFMPEG_NAMES` 两条 / `FFPROBE_NAMES` 两条 + 三条 Windows 固定路径）。
 *   查不到 ⇒ 试下一个，全空 ⇒ `null`，由 `core.ts` 那句 "ffmpeg was not found…" 之类的原文出面，
 *   不在这里另写一句失败。
 * - `readText` / `appendRecord` / `pathInfo` / `listDir` 与 `convertArchive` 里的
 *   `mkdtemp` / `mkdir` / `copyFile` / `rm` / `stat` / `access` → **不接 `ctx.fs`**，
 *   继续用 `node:fs/promises`（`docs/adr/0003-migrated-node-file-state.md` 决定 1：`ctx.fs` 的
 *   对象是模型发起的工具调用，装不下"要算相对位置、要 rename/rmdir、要临时目录树"的媒体管线）。
 * - `join` / `dirname` / `basename` / `extname` / `relative` → `node:path`（`:6`），纯函数。
 * - `cancel()` → 上游是 `child.kill()` 逐个杀（`:54-57`）；这里是 `handle.terminate()`
 *   （`types.d.ts:174`，缝唯一的终止动词，管的是**整棵被托管的进程范围**）。缺口 G3
 *   （`docs/service-mapping.md`：`NodeCall` 不往下传取消信号）让这一格在宿主动作路径上**今天没人调用**，
 *   搬它不是为了接一条假信号，而是 `GifuRuntime` 声明了它（`core.ts:151-152`）就必须给得出真行为。
 *
 * 三处偏离，都写在能看见的地方：
 * 1. **临时目录前缀 `xiranite-gifu-` → `xaihi-gifu-`**（`:107` 的 `mkdtemp`）。这是
 *    `docs/adr/0010-brand-is-xaihi.md` 点名的"临时目录前缀"那一类：它不是被旧工具继续读写的
 *    数据，改名不迁数据。相比之下 `core.ts:486` 那个 `.xiranite` 运行记录目录**逐字保留**
 *    （读的是旧那份 JSONL 的位置，动它等于数据迁移，得先由使用者点头）。
 * 2. **`execFile` 的 `windowsHide: true` 没有对应物**：那条缝不给这个开关，Windows 上 ffmpeg
 *    可能闪一个控制台窗口。行为差记在这里，不在这里自己起进程绕缝。
 * 3. **超长的 stdout 语义换了**：`execFile` 的 `maxBuffer` 超限是**报错**（退出码折成 1、
 *    stderr 是那条 Node 错误消息），缝是**留尾**（`CollectedOutput` 截断，退出码仍是真的）。
 *    上限逐条对齐（7z 列表 64 MiB，默认 32 MiB）。后果只在"归档列表大到超限"这一格：
 *    这边会拿到一份**被截短的**清单继续算 `imageCount`，那边会把整条归档判成 `failed`。
 *
 * 类型层的两件事，都是**本仓的债**不是 DSH 的缺口：
 * - `GifuSubprocessSeam` 及伴生类型是 `@deepseek-ai/dsh-subprocess` 已发布 `.d.ts` 的**子集镜像**
 *   （照 `lib/types/index.d.ts:88,102` 与 `lib/types/types.d.ts` 的 `SubprocessSpawnSpec` /
 *   `SubprocessHandle` / `SubprocessOutcome` / `SubprocessStdio` / `SubprocessOutputReader` 抄），
 *   因为本包现在没声明那个依赖：装它需要一次 `pnpm install`，本批不许跑（`findz` / `sleept` /
 *   `recycleu` / `mvz` 那份是 `@deepseek-ai/dsh-subprocess@0.2.0-rc.2`）。**依赖请求写在阶段报告里。**
 *   取用时走 `ctx.get('subprocess')`（`mvz` / `bitv` 同一条口径：判服务在不在以运行时 `ctx.get(name)`
 *   为准），依赖补上之后应改回 `import type` + `ctx.subprocess`，届时删掉这份镜像。
 * - `SubprocessSpawnSpec.graceMs` 与 `stdio` 三根本族都不给默认值（"this seam applies no defaults"），
 *   所以 `SPAWN_GRACE_MS` 与 `stdio` 必须显式写出来；这个数字今天唯一的作用是满足 spec，
 *   因为本包不靠超时判失败（取消才判失败，见上面 G3 那条）。
 *
 * @module xaihi-gifu/platform
 */

import { access, appendFile, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type {
  CommandResult,
  GifuArchiveImageEntry,
  GifuConversionOutcome,
  GifuConversionTask,
  GifuRuntime,
} from './core.ts'
import { isGifuImage } from './core.ts'

/** 基线 `:16` 那份名单，一条不减、顺序不改。 */
const SEVEN_ZIP_NAMES = ['7z', '7zz', '7za', '7z.exe', '7zz.exe', '7za.exe']
/** 基线 `:17`。 */
const FFMPEG_NAMES = ['ffmpeg', 'ffmpeg.exe']
/** 基线 `:18`。 */
const FFPROBE_NAMES = ['ffprobe', 'ffprobe.exe']

/** 基线 `:39` 那次 `7z l` 的 `maxBuffer`（64 MiB）。 */
const LIST_MAX_BYTES = 64 * 1024 * 1024
/** 基线 `:112` 那次 `7z x` 的 `maxBuffer`（64 MiB）。 */
const EXTRACT_MAX_BYTES = 64 * 1024 * 1024
/** 基线 `:355` 那个缺省 `maxBuffer`（32 MiB）：ffmpeg / ffprobe 各次调用用的就是它。 */
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024

/** `graceMs` 要的是正有限宽限期（spec 不给默认值），本包从不按超时判失败，见文件头。 */
const SPAWN_GRACE_MS = 5000

/**
 * 拒答那句：终端面与运行时抛的是**同一句**（一份真源，别处不许再抄）。
 * `src/cli.ts` 把它写进 stderr 与 `--json` 的 `refused` 字段。
 */
export const GIFU_PROCESS_SEAM_REFUSAL =
  'gifu 的每一次外部程序调用（7-Zip 列目录 / 解包、ffmpeg 逐帧缩放、ffprobe 读尺寸、ffmpeg 编码）'
  + '都走 DSH 的 `ctx.subprocess`（provider `dsh-subprocess-local`），而独立 bin 不在宿主进程里，'
  + '拿不到那条缝（缺口 G1/G6 那一类：缝活在插件进程里，`$PATH` 上那一面活在它外面）。'
  + 'gifu 连"只出计划"都要先起 7-Zip 数一遍归档里的图片，所以 inspect / plan / make 三条腿在 bin 里'
  + '一条都跑不动，这里不降格成"猜一个图片数"的假计划。'
  + '真跑请用宿主侧的工具 `gifu_inspect` / `gifu_plan` / `gifu_make`'
  + '（`danger` 会把非预演那一次变成 DSH 的 `ask`）。'

/** `SubprocessOutcome`（`dsh-subprocess/lib/types/types.d.ts:107-112`）里本包用到的那一格。 */
export interface GifuSubprocessOutcome {
  /** 退出码；被信号杀掉时是 `null`。 */
  exitCode: number | null
}

/** `SubprocessOutputReader.readFrom(0)` 的返回里本包用到的那一格。 */
export interface GifuSubprocessOutputRead {
  text: string
}

/** `SubprocessHandle` 里本包用到的三格（流式那几根本节点用不上）。 */
export interface GifuSubprocessHandle {
  /** 收集到的 stdout/stderr，退出之后仍然可读。 */
  readonly collected: {
    readonly stdout?: { readFrom(fromByte: number): GifuSubprocessOutputRead }
    readonly stderr?: { readFrom(fromByte: number): GifuSubprocessOutputRead }
  }
  /** 退出事实；spawn 或 provider 失败时 reject。 */
  readonly done: Promise<GifuSubprocessOutcome>
  /** 缝唯一的终止动词，管的是整棵被托管的进程范围。 */
  terminate(): void
}

/**
 * `SubprocessSpawnSpec`（`types.d.ts:69-99`）中本包给得到的那几格：`argv`、`cwd`、`stdio`、
 * `graceMs` 一个都不给默认，`signal` / `env` 本包不用（取消走 `terminate()`，环境由 provider 洗）。
 */
export interface GifuSubprocessSpawnSpec {
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
export interface GifuSubprocessSeam {
  /** 裸名走 provider 洗过的 `PATH`；绝对路径做校验。找不到就抛。 */
  resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>
  /** 同步拿到活句柄；失败经 `done` reject。 */
  spawn(spec: GifuSubprocessSpawnSpec): GifuSubprocessHandle
}

/**
 * 宿主半边的运行时：外部程序经缝，文件与路径算术留在本进程。
 * @param subprocess - DSH 的 `ctx.subprocess`（`index.ts` 用 `ctx.get('subprocess')` 取）。
 * @param cwd - 子进程工作目录：基线那侧是 `execFile` 的隐式默认（进程自己的 cwd），
 *   这条缝要求显式给，所以调用方把 `process.cwd()` 交进来，行为与基线同一格。
 */
export function createNodeGifuRuntime(subprocess: GifuSubprocessSeam, cwd: string = process.cwd()): GifuRuntime {
  const children = new Set<GifuSubprocessHandle>()
  let cancelled = false
  let sevenZipPromise: Promise<string | null> | undefined
  let ffmpegPromise: Promise<string | null> | undefined
  let ffprobePromise: Promise<string | null> | undefined

  const trackedCommand = (command: string, args: string[], options: RunOptions = {}) =>
    runCommand(subprocess, cwd, children, command, args, options)

  return {
    readText: path => readFile(path, 'utf8'),
    appendRecord,
    pathInfo,
    listDir,
    async listArchiveImages(path) {
      cancelled = false
      sevenZipPromise ??= findSevenZip(subprocess)
      const sevenZip = await sevenZipPromise
      if (!sevenZip) throw new Error('7-Zip was not found. Install 7-Zip or add 7z to PATH.')
      const result = await trackedCommand(sevenZip, ['l', '-slt', '-ba', path], { maxBytes: LIST_MAX_BYTES })
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || `7-Zip exited with code ${result.code}.`)
      return parse7zImageEntries(result.stdout)
    },
    async convertArchive(task) {
      if (cancelled) throw new Error('Conversion cancelled.')
      sevenZipPromise ??= findSevenZip(subprocess)
      ffmpegPromise ??= findFfmpeg(subprocess)
      ffprobePromise ??= findFfprobe(subprocess, await ffmpegPromise)
      const [sevenZip, ffmpeg, ffprobe] = await Promise.all([sevenZipPromise, ffmpegPromise, ffprobePromise])
      if (!sevenZip) throw new Error('7-Zip was not found. Install 7-Zip or add 7z to PATH.')
      if (!ffmpeg) throw new Error('ffmpeg was not found. Install ffmpeg or add it to PATH.')
      if (!ffprobe) throw new Error('ffprobe was not found next to ffmpeg or on PATH.')
      return convertArchive(task, { sevenZip, ffmpeg, ffprobe, run: trackedCommand, isCancelled: () => cancelled })
    },
    cancel() {
      cancelled = true
      for (const child of children) child.terminate()
    },
    isCancelled: () => cancelled,
    join,
    dirname,
    basename,
    extname,
    relative,
  }
}

/**
 * 终端半边的运行时：文件那一半是真的，外部程序那一半**响亮拒绝**。
 * 留着 `readText` / `pathInfo` / `listDir` / `appendRecord` 与四个路径函数，是为了让"预演"这一步
 * 与宿主面用的是同一份内核；但 gifu 的预演也要 `listArchiveImages`，所以 `src/cli.ts` 在进内核
 * **之前**就把拒绝说完了——这两个 throw 是第二道兜底：万一将来内核不再需要数图，炸的是这一句，
 * 不是偷偷 spawn。
 */
export function createGifuUnwiredRuntime(): GifuRuntime {
  const refuse = (): never => {
    throw new Error(GIFU_PROCESS_SEAM_REFUSAL)
  }
  return {
    readText: path => readFile(path, 'utf8'),
    appendRecord,
    pathInfo,
    listDir,
    listArchiveImages: async () => refuse(),
    convertArchive: async () => refuse(),
    join,
    dirname,
    basename,
    extname,
    relative,
  }
}

export function parse7zImageEntries(text: string): GifuArchiveImageEntry[] {
  const entries: GifuArchiveImageEntry[] = []
  let record: Record<string, string> = {}

  function flush() {
    const path = record.Path?.trim()
    const folder = record.Folder === '+' || /D/.test(record.Attributes ?? '') || path?.endsWith('/') || path?.endsWith('\\')
    if (path && !folder && isGifuImage(path)) {
      entries.push({
        path: path.replace(/\\/g, '/'),
        extension: extname(path).toLowerCase(),
        size: numberOrUndefined(record.Size),
      })
    }
    record = {}
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const match = /^([^=]+?)\s*=\s*(.*)$/.exec(line)
    if (match) record[match[1]!.trim()] = match[2]!
  }
  flush()
  return entries
}

async function convertArchive(
  task: GifuConversionTask,
  tools: {
    sevenZip: string
    ffmpeg: string
    ffprobe: string
    run: (command: string, args: string[], options?: RunOptions) => Promise<CommandResult>
    isCancelled: () => boolean
  },
): Promise<GifuConversionOutcome> {
  const workspace = await mkdtemp(join(tmpdir(), 'xaihi-gifu-'))
  const extractedRoot = join(workspace, 'archive')
  const framesRoot = join(workspace, 'frames')
  try {
    await mkdir(extractedRoot, { recursive: true })
    const extraction = await tools.run(tools.sevenZip, ['x', '-y', `-o${extractedRoot}`, task.archivePath], { maxBytes: EXTRACT_MAX_BYTES })
    if (extraction.code !== 0) throw new Error(extraction.stderr || extraction.stdout || `7-Zip extraction exited with code ${extraction.code}.`)
    if (tools.isCancelled()) throw new Error('Conversion cancelled.')

    const extractedImages: Array<{ entry: GifuArchiveImageEntry; path: string }> = []
    for (const entry of task.images) {
      const candidate = safeExtractedPath(extractedRoot, entry.path)
      if (candidate && await isFile(candidate)) extractedImages.push({ entry, path: candidate })
    }

    if (extractedImages.length === 1 && task.extractSingle) {
      const outputPath = replaceExtension(task.outputPath, extractedImages[0]!.entry.extension)
      await assertWritableOutput(outputPath, task.overwrite)
      await mkdir(dirname(outputPath), { recursive: true })
      await copyFile(extractedImages[0]!.path, outputPath)
      return {
        status: 'extracted',
        outputPath,
        decodedFrames: 1,
        skippedFrames: 0,
        encoder: '7z-copy',
        message: 'Extracted the single image without re-encoding it.',
      }
    }
    if (extractedImages.length < 2) {
      return {
        status: 'skipped',
        outputPath: task.outputPath,
        decodedFrames: extractedImages.length,
        skippedFrames: Math.max(0, task.images.length - extractedImages.length),
        encoder: 'none',
        message: 'Fewer than two extractable image entries remain.',
      }
    }

    const probed: Array<{ path: string; width: number; height: number }> = []
    let skippedFrames = task.images.length - extractedImages.length
    for (const image of extractedImages) {
      if (tools.isCancelled()) throw new Error('Conversion cancelled.')
      const dimensions = await probeImage(tools.ffprobe, image.path, tools.run)
      if (dimensions) probed.push({ path: image.path, ...dimensions })
      else skippedFrames += 1
    }
    if (probed.length < 2) {
      return {
        status: 'skipped',
        outputPath: task.outputPath,
        decodedFrames: probed.length,
        skippedFrames,
        encoder: 'none',
        message: 'Fewer than two decodable image frames remain.',
      }
    }

    let width = Math.max(...probed.map((item) => item.width))
    let height = Math.max(...probed.map((item) => item.height))
    if (task.format === 'webm' || task.format === 'mp4') {
      if (width % 2) width += 1
      if (height % 2) height += 1
    }
    await mkdir(framesRoot, { recursive: true })
    const resizeFlags = task.format === 'webm' || task.format === 'mp4' ? 'bilinear' : 'lanczos'
    let decodedFrames = 0
    for (const image of probed) {
      if (tools.isCancelled()) throw new Error('Conversion cancelled.')
      const framePath = join(framesRoot, `frame-${String(decodedFrames).padStart(8, '0')}.png`)
      const result = await tools.run(tools.ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', image.path,
        '-map', '0:v:0', '-frames:v', '1', '-vf', `scale=${width}:${height}:flags=${resizeFlags},format=rgba`,
        framePath,
      ])
      if (result.code === 0 && await isNonEmptyFile(framePath)) decodedFrames += 1
      else skippedFrames += 1
    }
    if (decodedFrames < 2) {
      return {
        status: 'skipped',
        outputPath: task.outputPath,
        decodedFrames,
        skippedFrames,
        encoder: 'none',
        message: 'Fewer than two frames could be normalized.',
      }
    }

    await assertWritableOutput(task.outputPath, task.overwrite)
    await mkdir(dirname(task.outputPath), { recursive: true })
    const encode = await encodeAnimation(task, tools.ffmpeg, framesRoot, decodedFrames, tools.run)
    if (encode.result.code !== 0) {
      await rm(task.outputPath, { force: true }).catch(() => undefined)
      throw new Error(encode.result.stderr || encode.result.stdout || `${encode.encoder} exited with code ${encode.result.code}.`)
    }
    if (!await isNonEmptyFile(task.outputPath)) throw new Error(`Encoder created an empty output: ${task.outputPath}`)
    return {
      status: 'converted',
      outputPath: task.outputPath,
      decodedFrames,
      skippedFrames,
      encoder: encode.encoder,
      message: `Encoded ${decodedFrames} frame(s) with ${encode.encoder}.`,
    }
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function encodeAnimation(
  task: GifuConversionTask,
  ffmpeg: string,
  framesRoot: string,
  frameCount: number,
  run: (command: string, args: string[], options?: RunOptions) => Promise<CommandResult>,
): Promise<{ encoder: string; result: CommandResult }> {
  const fps = (1000 / task.durationMs).toFixed(6)
  const input = [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...(task.ffmpegThreads > 0 ? ['-threads', String(task.ffmpegThreads)] : []),
    '-framerate', fps, '-start_number', '0', '-i', join(framesRoot, 'frame-%08d.png'),
    '-frames:v', String(frameCount), '-an',
  ]

  if (task.format === 'gif') {
    const args = [...input,
      '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a',
      '-loop', String(task.loop), task.outputPath,
    ]
    return { encoder: 'ffmpeg-gif', result: await run(ffmpeg, args) }
  }
  if (task.format === 'webp') {
    const args = [...input, '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', String(task.quality),
      '-compression_level', String(task.webpMethod), '-loop', String(task.loop), task.outputPath]
    return { encoder: 'libwebp_anim', result: await run(ffmpeg, args) }
  }
  if (task.format === 'apng') {
    const args = [...input, '-plays', String(task.loop), '-f', 'apng', task.outputPath]
    return { encoder: 'ffmpeg-apng', result: await run(ffmpeg, args) }
  }
  if (task.format === 'webm') {
    const args = [...input, '-vsync', '0', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0',
      '-crf', String(task.webmCrf), '-deadline', 'realtime', '-cpu-used', String(task.webmCpuUsed), '-row-mt', '1', task.outputPath]
    return { encoder: 'libvpx-vp9', result: await run(ffmpeg, args) }
  }

  const nvencArgs = [...input, '-vsync', '0', '-c:v', 'av1_nvenc', '-rc', 'vbr', '-b:v', '0', '-pix_fmt', 'yuv420p',
    '-preset', task.mp4Preset, '-cq:v', String(task.mp4Cq), task.outputPath]
  const nvenc = await run(ffmpeg, nvencArgs)
  if (nvenc.code === 0) return { encoder: 'av1_nvenc', result: nvenc }

  await rm(task.outputPath, { force: true }).catch(() => undefined)
  const softwareArgs = [...input, '-vsync', '0', '-c:v', 'libaom-av1', '-b:v', '0', '-crf', String(task.mp4Cq),
    '-cpu-used', '6', '-pix_fmt', 'yuv420p', task.outputPath]
  return { encoder: 'libaom-av1', result: await run(ffmpeg, softwareArgs) }
}

async function probeImage(
  ffprobe: string,
  path: string,
  run: (command: string, args: string[], options?: RunOptions) => Promise<CommandResult>,
): Promise<{ width: number; height: number } | null> {
  const result = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path])
  if (result.code !== 0) return null
  try {
    const parsed = JSON.parse(result.stdout) as { streams?: Array<{ width?: number; height?: number }> }
    const stream = parsed.streams?.[0]
    return stream && Number(stream.width) > 0 && Number(stream.height) > 0
      ? { width: Number(stream.width), height: Number(stream.height) }
      : null
  } catch {
    return null
  }
}

async function pathInfo(path: string) {
  try {
    const info = await stat(path)
    return { path: resolve(path), exists: true, isFile: info.isFile(), isDirectory: info.isDirectory() }
  } catch {
    return { path, exists: false, isFile: false, isDirectory: false }
  }
}

async function listDir(path: string) {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map((entry) => ({ name: entry.name, path: join(path, entry.name), isFile: entry.isFile(), isDirectory: entry.isDirectory() }))
}

async function appendRecord(path: string, record: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8')
}

async function findSevenZip(subprocess: GifuSubprocessSeam): Promise<string | null> {
  const configured = process.env.GIFU_7Z?.trim()
  if (configured && await exists(configured)) return configured
  const found = await findExecutable(subprocess, SEVEN_ZIP_NAMES)
  if (found) return found
  for (const candidate of [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    join(process.env.LOCALAPPDATA ?? '', '7-Zip', '7z.exe'),
  ]) if (candidate && await exists(candidate)) return candidate
  return null
}

async function findFfmpeg(subprocess: GifuSubprocessSeam): Promise<string | null> {
  const configured = process.env.GIFU_FFMPEG?.trim()
  if (configured && await exists(configured)) return configured
  return findExecutable(subprocess, FFMPEG_NAMES)
}

async function findFfprobe(subprocess: GifuSubprocessSeam, ffmpeg: string | null): Promise<string | null> {
  const configured = process.env.GIFU_FFPROBE?.trim()
  if (configured && await exists(configured)) return configured
  if (ffmpeg) {
    const sibling = join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
    if (await exists(sibling)) return sibling
  }
  return findExecutable(subprocess, FFPROBE_NAMES)
}

/**
 * 基线 `:332-342` 是"逐个候选起一条 `which`/`where.exe`"。这里换成缝的 `resolveExecutable`
 * （文件头第 2 条）：名单与顺序一字不动，少起的正是那条定位进程。缝是**抛错式**的
 * （`SubprocessExecutableNotFoundError`），基线是"退出码非 0"，两者在这里落到同一个 `null`，
 * 好让调用方继续试下一个候选。
 */
async function findExecutable(subprocess: GifuSubprocessSeam, names: readonly string[]): Promise<string | null> {
  for (const name of names) {
    try {
      return await subprocess.resolveExecutable(name)
    } catch {
      // 没找到就是往下一个候选走，这里不吞别的错：缝只对"解析不到"这一件事抛。
    }
  }
  return null
}

interface RunOptions {
  cwd?: string
  maxBytes?: number
}

/**
 * 一次外部命令：`execFile` 换成缝的 `spawn` + `done`。
 *
 * 退出码那一格与基线同一个折法（`:357-361`）：没有错误 ⇒ 0；错误带数字 `code` ⇒ 那个数；
 * **其余一律 1**（基线里是"`error ? 1 : 0`"，也就是"被信号杀掉"与"根本没起起来"都算 1）。
 * 这边 `exitCode` 为 `null` 就是那两种情况的合并，所以 `?? 1`；缝在 spawn/provider 失败时
 * **reject**，基线那条 ENOENT 路径给的是 `code: 1` + `stderr: error.message`，`catch` 里照写同一条。
 * 上限的语义差别（超限报错 ⇒ 超限留尾）写在文件头第 3 条。
 */
async function runCommand(
  subprocess: GifuSubprocessSeam,
  cwd: string,
  children: Set<GifuSubprocessHandle>,
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<CommandResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  let handle: GifuSubprocessHandle
  try {
    handle = subprocess.spawn({
      argv: [command, ...args],
      cwd: options.cwd ?? cwd,
      graceMs: SPAWN_GRACE_MS,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes },
        stderr: { maxBytes },
      },
    })
  } catch (error) {
    return { code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
  children.add(handle)
  try {
    const outcome = await handle.done
    return {
      code: outcome.exitCode ?? 1,
      stdout: handle.collected.stdout?.readFrom(0).text ?? '',
      stderr: handle.collected.stderr?.readFrom(0).text ?? '',
    }
  } catch (error) {
    return { code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  } finally {
    children.delete(handle)
  }
}

function safeExtractedPath(root: string, entryPath: string): string | null {
  const candidate = resolve(root, entryPath.replace(/[\\/]/g, sep))
  const rel = relative(root, candidate)
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(rel) === rel) return null
  return candidate
}

function replaceExtension(path: string, extension: string): string {
  const normalized = extension.startsWith('.') ? extension : `.${extension}`
  return path.slice(0, path.length - extname(path).length) + normalized
}

async function assertWritableOutput(path: string, overwrite: boolean): Promise<void> {
  if (!overwrite && await exists(path)) throw new Error(`Output already exists: ${path}`)
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function isNonEmptyFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function numberOrUndefined(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// Exported only for deterministic platform tests without invoking host tools.
export const __gifuPlatformTest = {
  encodeAnimation,
  safeExtractedPath,
}
