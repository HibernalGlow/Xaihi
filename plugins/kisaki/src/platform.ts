import { cp, link, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, parse, relative } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import {
  createExifCandidate,
  createVideoOptimizerCandidate,
  getCzkawkaInfo,
  scanBasicFiles,
  scanDuplicateFiles,
  scanExifFiles,
  scanMediaFiles,
  scanVideoOptimizer,
  trashPath,
  type BasicScanOptions,
  type CzkawkaScanControls,
  type CzkawkaScanProgress,
  type DuplicateScanOptions,
  type ExifScanOptions,
  type MediaScanOptions,
  type VideoOptimizerCandidateOptions,
  type VideoOptimizerScanOptions,
} from "./native/index.js"
import { toNativeVideoCropDetect } from "./similar-video-crop.js"
import type { KisakiNativeProgress, KisakiNormalizedInput, KisakiRuntime, KisakiRuntimeInfo } from "./core.js"

const execFileAsync = promisify(execFile)

export interface FileMutation {
  kind: "trash" | "delete" | "move"
  sourcePath: string
  destinationPath?: string
}

export interface FileOperationResult {
  index: number
  operation: FileMutation
  status: "succeeded" | "failed" | "cancelled"
  error?: string
  errorCode?: string
  deletionId?: string
}

export interface FileOperationBatchResult {
  results: FileOperationResult[]
  succeeded: number
  failed: number
  cancelled: number
  undoable: number
}

export interface FileOperationRequest {
  operations: FileMutation[]
  concurrency?: number
}

export interface FileOperationExecutor {
  execute(request: FileOperationRequest): Promise<FileOperationBatchResult>
}

export async function executeSingleFileMutation(
  executor: FileOperationExecutor,
  operation: FileMutation,
): Promise<FileOperationBatchResult> {
  const batch = await executor.execute({ operations: [operation], concurrency: 1 })
  const result = batch.results[0]
  if (!result || result.status !== "succeeded") {
    throw Object.assign(new Error(result?.error ?? `File operation failed: ${operation.kind}`), {
      code: result?.errorCode ?? "FILE_OPERATION_FAILED",
      deletionId: result?.deletionId,
    })
  }
  return batch
}

export const hostCapabilities = {
  path: { basename, dirname, join, parse, relative },
  fs: {
    stat: async (p: string) => {
      try {
        const s = await stat(p)
        return { kind: s.isDirectory() ? "dir" : "file", size: s.size }
      } catch {
        return null
      }
    },
    list: async (p: string) => {
      try {
        const items = await readdir(p, { withFileTypes: true })
        return items.map((i) => ({ path: join(p, i.name), kind: i.isDirectory() ? "dir" : "file" }))
      } catch {
        return []
      }
    },
    ensureDir: async (p: string) => {
      await mkdir(p, { recursive: true })
    },
    copy: async (src: string, dest: string, opts?: { recursive?: boolean; force?: boolean }) => {
      await cp(src, dest, { recursive: opts?.recursive ?? true, force: opts?.force ?? false })
    },
    move: async (src: string, dest: string) => {
      await rename(src, dest)
    },
    hardLink: async (src: string, dest: string) => {
      await link(src, dest)
    },
    remove: async (p: string, _opts?: { recursive?: boolean }) => {
      await rm(p, { recursive: true, force: true })
    },
    readText: async (p: string) => {
      try {
        return await readFile(p, "utf8")
      } catch {
        return null
      }
    },
    writeText: async (p: string, content: string) => {
      await writeFile(p, content, "utf8")
    },
  },
  proc: {
    exec: async (program: string, args: string[]) => {
      try {
        const { stdout, stderr } = await execFileAsync(program, args)
        return { exitCode: 0, stdout, stderr }
      } catch (err: any) {
        return { exitCode: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? err.message }
      }
    },
  },
  crypto: {
    uuid: async () => crypto.randomUUID(),
  },
  os: {
    platform: async () => ({ platform: process.platform, arch: process.arch }),
  },
}


type NormalizedInput = KisakiNormalizedInput
let cacheEnvironmentSignature: string | undefined

export function toDuplicateScanOptions(input: NormalizedInput): DuplicateScanOptions {
  return {
    includedDirectories: input.includedDirectories,
    referenceDirectories: input.includedDirectoriesReferenced,
    excludedDirectories: input.excludedDirectories,
    excludedItems: input.excludedItems,
    allowedExtensions: input.allowedExtensions,
    excludedExtensions: input.excludedExtensions,
    minimumFileSize: input.minimumFileSize,
    maximumFileSize: input.maximumFileSize,
    recursive: input.recursive,
    useCache: input.useCache,
    saveAlsoAsJson: input.saveAlsoAsJson,
    deleteOutdatedCache: input.deleteOutdatedCache,
    minimalCacheFileSize: input.duplicateMinimalHashCacheSizeKiB * 1024,
    minimalPrehashCacheFileSize: input.duplicateMinimalPrehashCacheSizeKiB * 1024,
    ignoreHardLinks: input.ignoreHardLinks,
    usePrehash: input.usePrehash,
    caseSensitiveNames: input.caseSensitiveNames,
    checkMethod: input.checkMethod,
    hashType: input.hashType,
  }
}

export function toBasicScanOptions(input: NormalizedInput): BasicScanOptions {
  return {
    tool: input.tool as BasicScanOptions["tool"],
    includedDirectories: input.includedDirectories,
    referenceDirectories: input.includedDirectoriesReferenced,
    excludedDirectories: input.excludedDirectories,
    excludedItems: input.excludedItems,
    allowedExtensions: input.allowedExtensions,
    excludedExtensions: input.excludedExtensions,
    recursive: input.recursive,
    minimumFileSize: input.minimumFileSize,
    maximumFileSize: input.maximumFileSize,
    useCache: input.useCache,
    saveAlsoAsJson: input.saveAlsoAsJson,
    deleteOutdatedCache: input.deleteOutdatedCache,
    numberOfFiles: input.numberOfFiles,
    biggestFirst: input.biggestFirst,
    emptyFilesSearchZeroByteContent: input.emptyFilesSearchZeroByteContent,
    emptyFilesSearchNonPrintableContent: input.emptyFilesSearchNonPrintableContent,
    temporaryFileExtensions: input.temporaryFileExtensions,
  }
}

export function toExifScanOptions(input: NormalizedInput): ExifScanOptions {
  return {
    includedDirectories: input.includedDirectories,
    referenceDirectories: input.includedDirectoriesReferenced,
    excludedDirectories: input.excludedDirectories,
    excludedItems: input.excludedItems,
    allowedExtensions: input.allowedExtensions,
    excludedExtensions: input.excludedExtensions,
    recursive: input.recursive,
    minimumFileSize: input.minimumFileSize,
    maximumFileSize: input.maximumFileSize,
    useCache: input.useCache,
    saveAlsoAsJson: input.saveAlsoAsJson,
    deleteOutdatedCache: input.deleteOutdatedCache,
  }
}

export function toVideoOptimizerScanOptions(input: NormalizedInput): VideoOptimizerScanOptions {
  return {
    mode: input.videoOptimizerMode,
    includedDirectories: input.includedDirectories,
    referenceDirectories: input.includedDirectoriesReferenced,
    excludedDirectories: input.excludedDirectories,
    excludedItems: input.excludedItems,
    allowedExtensions: input.allowedExtensions,
    excludedExtensions: input.excludedExtensions,
    recursive: input.recursive,
    minimumFileSize: input.minimumFileSize,
    maximumFileSize: input.maximumFileSize,
    useCache: input.useCache,
    saveAlsoAsJson: input.saveAlsoAsJson,
    deleteOutdatedCache: input.deleteOutdatedCache,
    excludedCodecs: input.videoOptimizerExcludedCodecs,
    blackPixelThreshold: input.videoOptimizerBlackPixelThreshold,
    blackBarMinPercentage: input.videoOptimizerBlackBarMinPercentage,
    maxSamples: input.videoOptimizerMaxSamples,
    minCropSize: input.videoOptimizerMinCropSize,
  }
}

export function toMediaScanOptions(input: NormalizedInput): MediaScanOptions {
  return {
    tool: input.tool as MediaScanOptions["tool"],
    includedDirectories: input.includedDirectories,
    referenceDirectories: input.includedDirectoriesReferenced,
    excludedDirectories: input.excludedDirectories,
    excludedItems: input.excludedItems,
    allowedExtensions: input.allowedExtensions,
    excludedExtensions: input.excludedExtensions,
    recursive: input.recursive,
    minimumFileSize: input.minimumFileSize,
    maximumFileSize: input.maximumFileSize,
    useCache: input.useCache,
    saveAlsoAsJson: input.saveAlsoAsJson,
    deleteOutdatedCache: input.deleteOutdatedCache,
    ignoreHardLinks: input.ignoreHardLinks,
    similarity: input.similarity,
    imageHashSize: input.similarImagesHashSize,
    imageHashAlgorithm: input.similarImagesHashAlgorithm,
    imageResizeAlgorithm: input.similarImagesResizeAlgorithm,
    imageIgnoreSameSize: input.similarImagesIgnoreSameSize,
    imageIgnoreSameResolution: input.similarImagesIgnoreSameResolution,
    imageGeometricInvariance: input.similarImagesGeometricInvariance,
    videoIgnoreSameSize: input.similarVideosIgnoreSameSize,
    videoIgnoreSameResolution: input.similarVideosIgnoreSameResolution,
    videoSkipForward: input.similarVideosSkipForward,
    videoHashDuration: input.similarVideosHashDuration,
    videoCropDetect: toNativeVideoCropDetect(input.similarVideosLetterboxCrop),
    videoWindowCount: input.similarVideosWindowCount,
    videoDurationTolerancePct: input.similarVideosDurationTolerancePct,
    videoMinMatchingWindows: input.similarVideosMinMatchingWindows,
    videoSubclipMinMatch: input.similarVideosSubclipMinMatch,
    videoCheckAudioContent: input.similarVideosCheckAudioContent,
    musicCheckType: input.musicCheckType,
    musicApproximateComparison: input.musicApproximateComparison,
    musicCompareTitle: input.musicCompareTitle,
    musicCompareArtist: input.musicCompareArtist,
    musicCompareBitrate: input.musicCompareBitrate,
    musicCompareGenre: input.musicCompareGenre,
    musicCompareYear: input.musicCompareYear,
    musicCompareLength: input.musicCompareLength,
    musicMaximumDifference: input.musicMaximumDifference,
    musicMinimumFragmentDuration: input.musicMinimumFragmentDuration,
    musicCompareFingerprintsOnlyWithSimilarTitles: input.musicCompareFingerprintsOnlyWithSimilarTitles,
    brokenAudio: input.brokenAudio,
    brokenPdf: input.brokenPdf,
    brokenArchive: input.brokenArchive,
    brokenImage: input.brokenImage,
    brokenVideoFfprobe: input.brokenVideoFfprobe,
    brokenVideoFfmpeg: input.brokenVideoFfmpeg,
    brokenFont: input.brokenFont,
    brokenMarkup: input.brokenMarkup,
  }
}

export interface KisakiRuntimeContext {
  fileOperations?: FileOperationExecutor
}

export function getNodeRuntimeInfo(): KisakiRuntimeInfo {
  const info = getCzkawkaInfo()
  return { apiVersion: info.apiVersion, sourceVersion: info.sourceVersion, capabilities: [...info.capabilities] }
}

/**
 * kisaki's machine half, through the host capability surface (ADR-0079).
 *
 * Only the file and process edges moved. The scans stay in `@xiranite/czkawka-native` and the trash/delete
 * mutations stay in the scoped `@xiranite/file-operations` executor, because those are host services the node
 * declares rather than `node:*` calls this file may reach for.
 */
export function createNodeKisakiRuntime(context: KisakiRuntimeContext = {}): KisakiRuntime {
  const nativeInfo = getNodeRuntimeInfo()
  const runtime: KisakiRuntime = {
    capabilities: nativeInfo.capabilities,
    scanDuplicates: (input, onProgress) => { configureKisakiCacheEnvironment(input); return runNativeScan(toDuplicateScanOptions(input), input.threadCount, runtime, onProgress, scanDuplicateFiles) },
    scanBasic: (input, onProgress) => { configureKisakiCacheEnvironment(input); return runNativeScan(toBasicScanOptions(input), input.threadCount, runtime, onProgress, scanBasicFiles) },
    scanExif: (input, onProgress) => { configureKisakiCacheEnvironment(input); return runNativeScan(toExifScanOptions(input), input.threadCount, runtime, onProgress, scanExifFiles) },
    scanVideoOptimizer: (input, onProgress) => { configureKisakiCacheEnvironment(input); return runNativeScan(toVideoOptimizerScanOptions(input), input.threadCount, runtime, onProgress, scanVideoOptimizer) },
    scanMedia: (input, onProgress) => { configureKisakiCacheEnvironment(input); return runNativeScan(toMediaScanOptions(input), input.threadCount, runtime, onProgress, scanMediaFiles) },
    createExifCandidate: (sourcePath, tags) => createExifCandidate({ sourcePath, tags }),
    createVideoOptimizerCandidate: (item, input) => runNativeVideoOptimizerCandidate(item, input, runtime),
    replaceWithCandidate: (candidatePath, sourcePath) => replaceWithCandidate(candidatePath, sourcePath, context.fileOperations),
    pathExists,
    listDirectory,
    removePath: (path, options) => removePath(path, options, context.fileOperations),
    copyPath,
    movePath,
    linkPath,
    readText: async (path) => {
      // `KisakiRuntime.readText` promises a string (`core.ts:226`), so the capability's `null` for "no such
      // document" goes back to being the error `readFile` raised: `undoSimiuSetLog` names a log it was told
      // to undo, and a missing one is a failure rather than an empty payload.
      const text = await hostCapabilities.fs.readText(path)
      if (text === null) throw new Error(`File could not be read: ${path}`)
      return text
    },
    writeText: async (path, content) => { await hostCapabilities.fs.writeText(path, content) },
    ensureDirectory: async (path) => { if (path) await hostCapabilities.fs.ensureDir(path) },
    join,
    dirname,
    basename,
    relativeDirectoryFromRoot: (path) => relative(parse(path).root, dirname(path)),
  }
  return runtime
}

/**
 * Hand a path to the desktop shell.
 *
 * The four programs below are the whole of kisaki's external-process surface besides the clipboard: which
 * of them this node may run is the manifest's decision (`docs/xiranite-target-node-manifest.json`), not
 * this file's. `proc.exec` answers a shell refusal as a value where `execFileAsync` rejected, so the
 * rejection the CLI's error path still expects is re-raised here.
 */
export async function openKisakiPath(path: string): Promise<void> {
  const entry = await hostCapabilities.fs.stat(path)
  if (entry === null) throw new Error(`Path does not exist: ${path}`)
  const platform = (await hostCapabilities.os.platform()).platform
  if (platform === "win32") {
    if (entry.kind === "dir") await runOrThrow("explorer.exe", [path])
    else await runOrThrow("rundll32.exe", ["url.dll,FileProtocolHandler", path])
    return
  }
  await runOrThrow(platform === "darwin" ? "open" : "xdg-open", [path])
}

async function runOrThrow(program: string, args: string[]): Promise<void> {
  const result = await hostCapabilities.proc.exec(program, args)
  if (result.exitCode === 0) return
  const detail = result.stderr.trim() || `${program} exited with code ${result.exitCode}`
  throw new Error(`${program} could not open the path: ${detail}`)
}

/**
 * One native scan, with the wait left to the binding.
 *
 * This file used to run the polling loop itself over `setInterval`, which is exactly one runtime's
 * primitive: Node/Bun has timers, the host's QuickJS realm does not. The scan would have reported
 * progress on the first and silently stalled on the second, so the loop moved down to the binding
 * (`packages/czkawka-native` for the addon, `packages/quickjs-shims/src/czkawka-service.ts` for the
 * realm) and this function only hands the two controls down. The progress *wording* stays here, in
 * `normalizeProgress` and the node's own event text — one vocabulary, whichever runtime runs it.
 */
async function runNativeScan<TOptions extends object, TResult>(options: TOptions, threadCount: number, runtime: KisakiRuntime, onProgress: ((progress: KisakiNativeProgress) => void) | undefined, scan: (options: TOptions & { scanId: string; threadCount: number }, controls: CzkawkaScanControls) => Promise<TResult>): Promise<TResult> {
  const scanId = await hostCapabilities.crypto.uuid()
  let lastProgress = ""
  return scan({ ...options, scanId, threadCount }, {
    onProgress: (progress: CzkawkaScanProgress) => {
      const signature = `${progress.stage}:${progress.stageIndex}:${progress.entriesChecked}:${progress.bytesChecked}`
      if (signature === lastProgress) return
      lastProgress = signature
      onProgress?.(normalizeProgress(progress))
    },
    shouldCancel: () => runtime.isCancelled?.() ?? false,
  })
}

async function runNativeVideoOptimizerCandidate(item: Parameters<KisakiRuntime["createVideoOptimizerCandidate"]>[0], input: NormalizedInput, runtime: KisakiRuntime) {
  const scanId = await hostCapabilities.crypto.uuid()
  const options: VideoOptimizerCandidateOptions = {
    sourcePath: item.path,
    mode: input.videoOptimizerMode,
    targetCodec: input.videoOptimizerTargetCodec,
    quality: input.videoOptimizerQuality,
    failIfNotSmaller: input.videoOptimizerFailIfNotSmaller,
    limitVideoSize: input.videoOptimizerLimitVideoSize,
    maximumWidth: input.videoOptimizerMaximumWidth,
    maximumHeight: input.videoOptimizerMaximumHeight,
    noiseReduction: input.videoOptimizerNoiseReduction,
    noiseReductionStrength: input.videoOptimizerNoiseReductionStrength,
    cropLeft: item.cropRect?.left,
    cropTop: item.cropRect?.top,
    cropRight: item.cropRect?.right,
    cropBottom: item.cropRect?.bottom,
    cropTranscode: input.videoOptimizerCropTranscode,
    currentCodec: item.codec,
    scanId,
  }
  return createVideoOptimizerCandidate(options, { shouldCancel: () => runtime.isCancelled?.() ?? false })
}

/**
 * Pin the two Czkawka folder variables before the first native scan reads them.
 *
 * This stays a `process.env` write on purpose: `CZKAWKA_CACHE_PATH` / `CZKAWKA_CONFIG_PATH` are read by the
 * native binding inside this process, and the capability surface has no operation for setting an environment
 * (`os.platform()` reports the environment but never writes it). No host equivalent exists to route to.
 */
export function configureKisakiCacheEnvironment(input: { cacheFolderPath?: string; configFolderPath?: string }): void {
  const cacheFolderPath = input.cacheFolderPath?.trim() ?? ""
  const configFolderPath = input.configFolderPath?.trim() ?? ""
  const signature = `${cacheFolderPath}\n${configFolderPath}`
  if (cacheEnvironmentSignature !== undefined && cacheEnvironmentSignature !== signature) throw new Error("Czkawka cache/config folders are initialized by the first native scan; restart the desktop backend after changing them.")
  if (cacheEnvironmentSignature !== undefined) return
  if (cacheFolderPath) process.env.CZKAWKA_CACHE_PATH = cacheFolderPath
  else delete process.env.CZKAWKA_CACHE_PATH
  if (configFolderPath) process.env.CZKAWKA_CONFIG_PATH = configFolderPath
  else delete process.env.CZKAWKA_CONFIG_PATH
  cacheEnvironmentSignature = signature
}

function normalizeProgress(progress: CzkawkaScanProgress): KisakiNativeProgress { return { stage: progress.stage, stageIndex: Number(progress.stageIndex), stageCount: Number(progress.stageCount), entriesChecked: Number(progress.entriesChecked), entriesTotal: Number(progress.entriesTotal), bytesChecked: Number(progress.bytesChecked), bytesTotal: Number(progress.bytesTotal) } }

async function pathExists(path: string): Promise<boolean> {
  // `fs.stat` answers `null` only for "nothing there", which is the one case the old `catch` turned into
  // `false`; every other failure (a refusal included) still propagates, as it did with `ENOENT`-vs-other.
  return (await hostCapabilities.fs.stat(path)) !== null
}

async function listDirectory(path: string): Promise<Array<{ path: string; isDirectory: boolean; isFile: boolean }>> {
  return (await hostCapabilities.fs.list(path)).map((entry) => ({
    path: entry.path,
    isDirectory: entry.kind === "dir",
    isFile: entry.kind === "file",
  }))
}

async function removePath(
  path: string,
  options?: { trash?: boolean; emptyFoldersOnly?: boolean },
  fileOperations?: KisakiRuntimeContext["fileOperations"],
): Promise<void> {
  if (options?.emptyFoldersOnly && !await containsOnlyDirectories(path)) throw new Error("Folder contains files and is no longer empty.")
  if (fileOperations) {
    await executeSingleFileMutation(fileOperations, { kind: options?.trash ? "trash" : "delete", sourcePath: path })
    return
  }
  if (options?.trash) {
    await trashPath(path)
    return
  }
  await hostCapabilities.fs.remove(path, { recursive: true })
}

/**
 * The empty-folder test, one level per call.
 *
 * `fs.list` is a single directory in both transports, so the descent stays here; a child that is a symlink
 * still stops the answer at `false`, because `fs.stat` reports the link and not its target.
 */
async function containsOnlyDirectories(path: string): Promise<boolean> {
  const { fs } = hostCapabilities
  const item = await fs.stat(path)
  if (item?.kind !== "dir") return false
  for (const child of await fs.list(path)) {
    if (child.kind !== "dir" || !await containsOnlyDirectories(child.path)) return false
  }
  return true
}

async function copyPath(source: string, target: string): Promise<void> {
  const { fs } = hostCapabilities
  await fs.ensureDir(dirname(target))
  // `force: false` is the old `errorOnExist: true`: a duplicate set never overwrites what is already there.
  await fs.copy(source, target, { recursive: true, force: false })
}

/**
 * The rename, with the target's parent made first.
 *
 * Both transports' `fs.move` creates that parent too (`filesystem.rs:357-360`), so the explicit `ensureDir`
 * is kept for the order the old body had — a fresh group folder must exist before the copy-then-remove
 * fallback runs inside `fs.move`, not after it — and the call is idempotent.
 */
async function movePath(source: string, target: string): Promise<void> {
  const { fs } = hostCapabilities
  await fs.ensureDir(dirname(target))
  await fs.move(source, target)
}

async function linkPath(source: string, target: string): Promise<void> {
  const { fs } = hostCapabilities
  await fs.ensureDir(dirname(target))
  await fs.hardLink(source, target)
}

async function replaceWithCandidate(candidatePath: string, sourcePath: string, fileOperations?: KisakiRuntimeContext["fileOperations"]): Promise<void> {
  if (!fileOperations) {
    await trashPath(sourcePath)
    await movePath(candidatePath, sourcePath)
    return
  }
  const result = await fileOperations.execute({
    operations: [
      { kind: "trash", sourcePath },
      { kind: "move", sourcePath: candidatePath, destinationPath: sourcePath },
    ],
    concurrency: 1,
  })
  const failure = result.results.find((entry) => entry.status !== "succeeded")
  if (failure) throw new Error(failure.error ?? `File operation failed: ${failure.operation.kind}`)
}
