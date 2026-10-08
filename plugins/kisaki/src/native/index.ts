import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { prependNativeLibraryPath, resolveKisakiBindingPath } from "./native-asset.js"
import type * as Generated from "./binding.generated.js"

export type CzkawkaInfo = Generated.CzkawkaInfo
export type TrashCapabilities = Generated.TrashCapabilities
export type TrashItemReceipt = Generated.TrashItemReceipt
export type TrashPathResult = Generated.TrashPathResult
export type DuplicateFile = Generated.DuplicateFile
export type DuplicateScanResult = Generated.DuplicateScanResult
export type BasicEntry = Generated.BasicEntry
export type BasicScanResult = Generated.BasicScanResult
export type ExifTag = Generated.ExifTag
export type ExifEntry = Generated.ExifEntry
export type ExifScanResult = Generated.ExifScanResult
export type ExifCandidate = Generated.ExifCandidate
export type MediaEntry = Generated.MediaEntry
export type MediaGroup = Generated.MediaGroup
export type MediaScanResult = Generated.MediaScanResult
export type CzkawkaScanProgress = Generated.CzkawkaScanProgress
export type VideoOptimizerEntry = Generated.VideoOptimizerEntry
export type VideoOptimizerScanResult = Generated.VideoOptimizerScanResult
export type VideoOptimizerCandidate = Generated.VideoOptimizerCandidate
export type ExifCandidateOptions = Generated.ExifCandidateOptions

export type CzkawkaBasicTool = "big-files" | "empty-files" | "empty-folders" | "temporary-files" | "invalid-symlinks" | "bad-names"
export type CzkawkaMediaTool = "similar-images" | "similar-videos" | "duplicate-music" | "broken-files" | "bad-extensions"
export type DuplicateCheckMethod = "name" | "size" | "size-and-name" | "sizeAndName" | "hash"
export type DuplicateHashType = "crc32" | "xxh3" | "blake3"
export type ImageHashAlgorithm = "mean" | "gradient" | "blockhash" | "vert-gradient" | "double-gradient" | "median"
export type ImageResizeAlgorithm = "lanczos3" | "gaussian" | "catmull-rom" | "triangle" | "nearest"
export type ImageGeometricInvariance = "off" | "mirror-flip" | "mirror-flip-rotate-90"
export type VideoCropDetect = "letterbox" | "motion" | "none"
export type MusicCheckType = "tags" | "fingerprint"
export type VideoOptimizerMode = "transcode" | "crop"
export type VideoOptimizerCodec = "h264" | "h265" | "av1" | "vp9"
export type VideoOptimizerNoiseReduction = "none" | "hqdn3d"

export type DuplicateScanOptions = Omit<Generated.DuplicateScanOptions, "checkMethod" | "hashType"> & {
  checkMethod?: DuplicateCheckMethod
  hashType?: DuplicateHashType
}

export type BasicScanOptions = Omit<Generated.BasicScanOptions, "tool"> & {
  tool: CzkawkaBasicTool
}

export type ExifScanOptions = Generated.ExifScanOptions

export type VideoOptimizerScanOptions = Omit<Generated.VideoOptimizerScanOptions, "mode"> & {
  mode: VideoOptimizerMode
}

export type VideoOptimizerCandidateOptions = Omit<Generated.VideoOptimizerCandidateOptions, "mode" | "targetCodec" | "noiseReduction"> & {
  mode: VideoOptimizerMode
  targetCodec: VideoOptimizerCodec
  noiseReduction?: VideoOptimizerNoiseReduction
}

export type MediaScanOptions = Omit<Generated.MediaScanOptions,
  "tool" | "imageHashAlgorithm" | "imageResizeAlgorithm" | "imageGeometricInvariance" | "videoCropDetect" | "musicCheckType"
> & {
  tool: CzkawkaMediaTool
  imageHashAlgorithm?: ImageHashAlgorithm
  imageResizeAlgorithm?: ImageResizeAlgorithm
  imageGeometricInvariance?: ImageGeometricInvariance
  videoCropDetect?: VideoCropDetect
  musicCheckType?: MusicCheckType
}

type CzkawkaBindingInfo = Omit<CzkawkaInfo, "capabilities"> & {
  capabilities?: string[]
}

type GeneratedBinding = typeof import("./binding.generated.js")

export type CzkawkaBinding = Omit<GeneratedBinding,
  "getCzkawkaInfo" | "cancelCzkawkaScan" | "getCzkawkaScanProgress"
> & {
  getCzkawkaInfo(): CzkawkaBindingInfo
} & Partial<Pick<GeneratedBinding, "cancelCzkawkaScan" | "getCzkawkaScanProgress">>

export type CzkawkaScanControls = {
  onProgress?: (progress: CzkawkaScanProgress) => void
  shouldCancel?: () => boolean
}

let cachedBinding: CzkawkaBinding | undefined

export function loadCzkawkaBinding(): CzkawkaBinding {
  if (cachedBinding) return cachedBinding
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const bindingPath = resolveKisakiBindingPath(packageRoot)
  if (!existsSync(bindingPath)) {
    throw new Error(`Xaihi Kisaki native binding not found at ${bindingPath}.`)
  }
  prependNativeLibraryPath(bindingPath)
  cachedBinding = createRequire(import.meta.url)(bindingPath) as CzkawkaBinding
  return cachedBinding
}

export const loadKisakiBinding = loadCzkawkaBinding

export const getCzkawkaInfo = (): CzkawkaInfo => {
  const info = loadCzkawkaBinding().getCzkawkaInfo()
  return { ...info, capabilities: info.capabilities ?? [] }
}
export const getKisakiInfo = getCzkawkaInfo

export const getTrashCapabilities = (): TrashCapabilities => loadCzkawkaBinding().getTrashCapabilities()
export const trashPath = (path: string): Promise<TrashPathResult> => loadCzkawkaBinding().trashPath(path) as Promise<TrashPathResult>
export const listTrashItems = (): Promise<TrashItemReceipt[]> => loadCzkawkaBinding().listTrashItems() as Promise<TrashItemReceipt[]>
export const restoreTrashItem = (receipt: TrashItemReceipt): Promise<void> => loadCzkawkaBinding().restoreTrashItem(receipt) as Promise<void>

function wrapWithControls<TOptions extends { scanId?: string }, TResult>(
  fn: (options: TOptions) => Promise<TResult>,
  options: TOptions,
  controls?: CzkawkaScanControls,
): Promise<TResult> {
  const scanId = options.scanId
  let timer: NodeJS.Timeout | undefined
  if (scanId && (controls?.onProgress || controls?.shouldCancel)) {
    timer = setInterval(() => {
      if (controls.shouldCancel?.()) {
        cancelCzkawkaScan(scanId)
      }
      if (controls.onProgress) {
        const progress = getCzkawkaScanProgress(scanId)
        if (progress) controls.onProgress(progress)
      }
    }, 100)
  }
  return fn(options).finally(() => {
    if (timer) clearInterval(timer)
  })
}

export const scanDuplicateFiles = (options: DuplicateScanOptions, controls?: CzkawkaScanControls): Promise<DuplicateScanResult> =>
  wrapWithControls((opts) => loadCzkawkaBinding().scanDuplicateFiles(opts) as Promise<DuplicateScanResult>, options, controls)

export const scanBasicFiles = (options: BasicScanOptions, controls?: CzkawkaScanControls): Promise<BasicScanResult> =>
  wrapWithControls((opts) => loadCzkawkaBinding().scanBasicFiles(opts) as Promise<BasicScanResult>, options, controls)

export const scanExifFiles = (options: ExifScanOptions, controls?: CzkawkaScanControls): Promise<ExifScanResult> =>
  wrapWithControls((opts) => loadCzkawkaBinding().scanExifFiles(opts) as Promise<ExifScanResult>, options, controls)

export const createExifCandidate = (options: ExifCandidateOptions): Promise<ExifCandidate> =>
  loadCzkawkaBinding().createExifCandidate(options) as Promise<ExifCandidate>

export const scanVideoOptimizer = (options: VideoOptimizerScanOptions, controls?: CzkawkaScanControls): Promise<VideoOptimizerScanResult> =>
  wrapWithControls((opts) => loadCzkawkaBinding().scanVideoOptimizer(opts) as Promise<VideoOptimizerScanResult>, options, controls)

export const createVideoOptimizerCandidate = (options: VideoOptimizerCandidateOptions, controls?: { shouldCancel?: () => boolean }): Promise<VideoOptimizerCandidate> => {
  if (options.scanId && controls?.shouldCancel?.()) cancelCzkawkaScan(options.scanId)
  return loadCzkawkaBinding().createVideoOptimizerCandidate(options) as Promise<VideoOptimizerCandidate>
}

export const scanMediaFiles = (options: MediaScanOptions, controls?: CzkawkaScanControls): Promise<MediaScanResult> =>
  wrapWithControls((opts) => loadCzkawkaBinding().scanMediaFiles(opts) as Promise<MediaScanResult>, options, controls)

export const cancelCzkawkaScan = (scanId: string): boolean => loadCzkawkaBinding().cancelCzkawkaScan?.(scanId) ?? false
export const getCzkawkaScanProgress = (scanId: string): CzkawkaScanProgress | undefined => loadCzkawkaBinding().getCzkawkaScanProgress?.(scanId) ?? undefined

export {
  assertCzkawkaCompatibility,
  checkCzkawkaCompatibility,
  type CzkawkaBindingRequirement,
  type CzkawkaCompatibilityResult,
} from "./compatibility.js"
