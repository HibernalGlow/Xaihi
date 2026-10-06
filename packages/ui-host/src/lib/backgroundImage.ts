/**
 * 背景图片处理工具。
 *
 * 该模块负责处理工作区背景图的体积适配（超大原图自动压缩）、URL 规范化、
 * 持久化过滤与 CSS url() 转换。核心约束：base64 data URL 不写入 localStorage，
 * 只保留 URL/path 字符串；完整的 base64 数据由后端 SQLite kv_store 表持久化。
 * 正因为 data URL 会同时进 store、CSS 变量和数据库，入口必须先把它压到有限体积。
 */
import { localBackendFileUrl } from "@/backend/localBackendConfig"

/** 背景图 data URL 的体积上限（解码后的字节数）。 */
export const BACKGROUND_IMAGE_MAX_DATA_URL_BYTES = 2 * 1024 * 1024

/** 背景图渲染的最长边：窗口背景不需要原图分辨率，原图只会吃满解码内存。 */
export const BACKGROUND_IMAGE_MAX_EDGE = 2048

/** 原图已经够小且不超尺寸时保留原编码，避免无谓的二次有损压缩。 */
const BACKGROUND_IMAGE_INLINE_SOURCE_BYTES = 512 * 1024

/** 体积超标时先降质量，降到底还超标再缩尺寸。 */
const BACKGROUND_IMAGE_QUALITY_STEPS = [0.82, 0.72, 0.6] as const
const BACKGROUND_IMAGE_SCALE_STEPS = [1, 0.75, 0.55] as const

export interface PreparedBackgroundImage {
  dataUrl: string
  /** 编码后的像素尺寸；无法解码的格式（如 SVG）为 0，表示未知。 */
  width: number
  height: number
  sourceBytes: number
  outputBytes: number
  /** false 表示原图够小、直接保留了原编码。 */
  recompressed: boolean
}

/** 压缩阶梯跑完仍然超限：此时必须让用户看到失败，而不是把超大图片塞进内存。 */
export class BackgroundImageTooLargeError extends Error {
  readonly outputBytes: number

  constructor(outputBytes: number) {
    super(`Background image is ${outputBytes} bytes, above the ${BACKGROUND_IMAGE_MAX_DATA_URL_BYTES} byte limit.`)
    this.name = "BackgroundImageTooLargeError"
    this.outputBytes = outputBytes
  }
}

/** 把图片缩放到不超过最长边，保持宽高比（至少 1px）。 */
export function fitBackgroundImageEdge(
  width: number,
  height: number,
  maxEdge = BACKGROUND_IMAGE_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (!Number.isFinite(longest) || longest < 1 || longest <= maxEdge) {
    return { width: Math.max(1, Math.round(width) || 1), height: Math.max(1, Math.round(height) || 1) }
  }
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 是否为内嵌图片数据 URL（只有它需要走压缩与体积估算）。 */
export function isBackgroundImageDataUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim())
}

/** 估算字符串作为背景图值占用的字节数；非 data URL 返回其字符长度。 */
export function estimateBackgroundImageBytes(value: string): number {
  const trimmed = value.trim()
  if (!isBackgroundImageDataUrl(trimmed)) return trimmed.length
  const comma = trimmed.indexOf(",")
  const payload = comma < 0 ? "" : trimmed.slice(comma + 1).replace(/=+$/, "")
  return Math.floor(payload.length * 3 / 4)
}

/**
 * 把用户选中的图片转成可以安全放进 store / CSS / 数据库的 data URL。
 *
 * 足够小的图片原样保留；其余解码到最长边 2048px 以内并沿质量与尺寸阶梯重编码，
 * 直到落进体积上限。无法解码的格式（SVG 等）只在小体积时原样放行。
 */
export async function prepareBackgroundImage(source: Blob | string): Promise<PreparedBackgroundImage> {
  const { blob, sourceBytes } = await resolveImageSource(source)
  const bitmap = await createImageBitmap(blob).catch(() => undefined)
  if (!bitmap) return passthroughOrThrow(blob, sourceBytes, 0, 0)
  try {
    const target = fitBackgroundImageEdge(bitmap.width, bitmap.height)
    if (target.width === bitmap.width && target.height === bitmap.height && sourceBytes <= BACKGROUND_IMAGE_INLINE_SOURCE_BYTES) {
      return await toPrepared(blob, blob.type || "image/png", bitmap.width, bitmap.height, false, sourceBytes)
    }
    for (const scale of BACKGROUND_IMAGE_SCALE_STEPS) {
      const width = Math.max(1, Math.round(target.width * scale))
      const height = Math.max(1, Math.round(target.height * scale))
      const canvas = drawScaled(bitmap, width, height)
      try {
        const encodings = await candidateEncodings(blob.type, canvas)
        for (const quality of BACKGROUND_IMAGE_QUALITY_STEPS) {
          for (const mimeType of encodings) {
            const encoded = await encodeCanvas(canvas, mimeType, quality)
            if (!encoded || encoded.size > BACKGROUND_IMAGE_MAX_DATA_URL_BYTES) continue
            return await toPrepared(encoded, mimeType, width, height, true, sourceBytes)
          }
        }
      } finally {
        canvas.width = 0
        canvas.height = 0
      }
    }
    throw new BackgroundImageTooLargeError(sourceBytes)
  } finally {
    bitmap.close?.()
  }
}

/**
 * 把已存的背景图值收敛到体积上限内：历史数据里可能是一张未压缩的超大 data URL，
 * 启动时原样灌进 store 就是本次要修的爆内存路径。非 data URL 原样返回。
 */
export async function shrinkStoredBackgroundImageUrl(value: string): Promise<string> {
  const trimmed = value.trim()
  if (!isBackgroundImageDataUrl(trimmed)) return trimmed
  if (estimateBackgroundImageBytes(trimmed) <= BACKGROUND_IMAGE_MAX_DATA_URL_BYTES) return trimmed
  const prepared = await prepareBackgroundImage(trimmed)
  return prepared.dataUrl
}

async function resolveImageSource(source: Blob | string): Promise<{ blob: Blob; sourceBytes: number }> {
  if (typeof source !== "string") return { blob: source, sourceBytes: source.size }
  if (!isBackgroundImageDataUrl(source)) throw new Error("Only base64 image data URLs can be prepared from a string.")
  const blob = await dataUrlToBlob(source)
  return { blob, sourceBytes: blob.size }
}

async function passthroughOrThrow(blob: Blob, sourceBytes: number, width: number, height: number): Promise<PreparedBackgroundImage> {
  if (sourceBytes > BACKGROUND_IMAGE_MAX_DATA_URL_BYTES) throw new BackgroundImageTooLargeError(sourceBytes)
  return toPrepared(blob, blob.type || "image/png", width, height, false, sourceBytes)
}

async function toPrepared(
  output: Blob,
  mimeType: string,
  width: number,
  height: number,
  recompressed: boolean,
  sourceBytes: number,
): Promise<PreparedBackgroundImage> {
  const dataUrl = output.type === mimeType ? await blobToDataUrl(output) : await withMimeType(output, mimeType)
  return {
    dataUrl,
    width,
    height,
    sourceBytes,
    outputBytes: estimateBackgroundImageBytes(dataUrl),
    recompressed,
  }
}

async function withMimeType(blob: Blob, mimeType: string): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return blobToDataUrl(new Blob([buffer], { type: mimeType }))
}

function drawScaled(source: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Unable to create the background image canvas.")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(source, 0, 0, width, height)
  return canvas
}

/** JPEG 永远不带透明通道；其余格式只在画布确实有透明像素时保 PNG，否则退回 JPEG。 */
async function candidateEncodings(sourceType: string, canvas: HTMLCanvasElement): Promise<string[]> {
  if (/^image\/jpe?g$/i.test(sourceType)) return ["image/webp", "image/jpeg"]
  return await hasTransparency(canvas) ? ["image/webp", "image/png"] : ["image/webp", "image/jpeg"]
}

/** 64×64 抽样：判断是否含透明像素，避免为了 alpha 检测把整张画布读进内存。 */
function hasTransparency(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    const sample = document.createElement("canvas")
    sample.width = 64
    sample.height = 64
    const context = sample.getContext("2d", { willReadFrequently: true })
    if (!context) return resolve(false)
    context.clearRect(0, 0, 64, 64)
    context.drawImage(canvas, 0, 0, 64, 64)
    try {
      const { data } = context.getImageData(0, 0, 64, 64)
      for (let index = 3; index < data.length; index += 4) {
        if (data[index]! < 250) return resolve(true)
      }
    } catch {
      // 读不到像素时按不透明处理：最坏结果是多一层 JPEG 转换，而不是爆内存。
    }
    resolve(false)
  })
}

function encodeCanvas(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      // 引擎不支持请求的类型时会静默回退成 PNG，这里用 blob.type 认出真实结果。
      resolve(blob && blob.type === mimeType ? blob : undefined)
    }, mimeType, quality)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Failed to encode the background image."))
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error(`Failed to decode the stored background image: ${response.status}`)
  return await response.blob()
}

/**
 * 规范化持久化的背景图 URL。
 *
 * - 非字符串 / 空字符串 / blob: URL 返回 undefined（不持久化）
 * - 其他 URL/path 字符串原样返回
 *
 * blob: URL 是浏览器内存中的临时对象，刷新页面后失效，不应持久化。
 */
export function normalizePersistedBackgroundImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed || isTransientBackgroundImageUrl(trimmed)) return undefined
  return trimmed
}

/** sanitize 版本：normalize 的非空包装，返回字符串（空串表示无背景图）。 */
export function sanitizePersistedBackgroundImageUrl(value: string): string {
  return normalizePersistedBackgroundImageUrl(value) ?? ""
}

/**
 * 把背景图 URL 转换为可直接写入 CSS url() 的形式。
 *
 * 本地文件路径（如 `C:\images\bg.jpg` 或 `/home/user/bg.jpg`）会通过
 * localBackendFileUrl 转为后端 file 协议 URL，让浏览器能加载本地文件。
 * 转换失败时回退为原值（可能是已经可用的 URL）。
 */
export function toBackgroundImageCssUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (isLocalFilePath(trimmed)) {
    try {
      return localBackendFileUrl(trimmed)
    } catch {
      return trimmed
    }
  }
  return trimmed
}

/** 判断是否为临时 URL（blob: 开头，刷新后失效，不应持久化）。 */
export function isTransientBackgroundImageUrl(value: string): boolean {
  return value.startsWith("blob:")
}

/**
 * 从 File 对象提取本地路径（Electron / Tauri 等环境在 file.path 上提供）。
 * 浏览器原生 File 对象没有 path 字段，返回 undefined。
 */
export function localPathFromFile(file: File): string | undefined {
  const maybePath = (file as File & { path?: unknown }).path
  return typeof maybePath === "string" && maybePath.trim() ? maybePath.trim() : undefined
}

/**
 * 判断字符串是否为本地文件路径（Windows 盘符 / UNC / Unix 绝对路径）。
 * 用于决定是否需要通过后端 file 协议转换。
 */
function isLocalFilePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/")
}
