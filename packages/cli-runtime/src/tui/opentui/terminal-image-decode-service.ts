import { LRUCache } from "lru-cache"
import PQueue from "p-queue"
import type { ResourceScheduler } from "@xiranite/contract"

export interface TerminalDecodedImageFrame {
  rgba: Uint8Array
  width: number
  height: number
  delayMs: number
  png: Uint8Array
}

export interface TerminalImageDecodeServiceOptions {
  maxBytes?: number
  maxConcurrent?: number
  resourceScheduler?: ResourceScheduler
  ownerId?: string
}

export interface TerminalImageDecodeSnapshot {
  cachedEntries: number
  cachedBytes: number
  queued: number
  running: number
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

export class TerminalImageDecodeService {
  readonly #cache: LRUCache<string, readonly TerminalDecodedImageFrame[]>
  readonly #queue: PQueue
  readonly #resourceScheduler?: ResourceScheduler
  readonly #ownerId?: string

  constructor(options: TerminalImageDecodeServiceOptions = {}) {
    const maxBytes = boundedInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes", 1, Number.MAX_SAFE_INTEGER)
    const maxConcurrent = boundedInteger(options.maxConcurrent ?? 3, "maxConcurrent", 1, 64)
    this.#cache = new LRUCache({
      maxSize: maxBytes,
      sizeCalculation: decodedFramesBytes,
    })
    this.#queue = new PQueue({ concurrency: maxConcurrent })
    this.#resourceScheduler = options.resourceScheduler
    this.#ownerId = options.ownerId
  }

  async decode(
    cacheKey: string | undefined,
    task: (signal: AbortSignal) => Promise<readonly TerminalDecodedImageFrame[]>,
    signal?: AbortSignal,
  ): Promise<readonly TerminalDecodedImageFrame[]> {
    signal?.throwIfAborted()
    const cached = cacheKey ? this.#cache.get(cacheKey) : undefined
    if (cached) return cached
    const taskSignal = signal ?? new AbortController().signal
    const frames = await this.#queue.add(
      async () => {
        const lease = await this.#resourceScheduler?.acquire({
          resource: "cpu",
          kind: "terminal.image.decode",
          priority: "view",
          ownerId: this.#ownerId,
        }, taskSignal)
        try {
          return await task(taskSignal)
        } finally {
          lease?.release()
        }
      },
      { signal: taskSignal },
    )
    taskSignal.throwIfAborted()
    if (!frames?.length || decodedFramesBytes(frames) < 1) throw new Error("Terminal image decode returned no frame bytes.")
    if (cacheKey) this.#cache.set(cacheKey, frames)
    return frames
  }

  snapshot(): TerminalImageDecodeSnapshot {
    return {
      cachedEntries: this.#cache.size,
      cachedBytes: this.#cache.calculatedSize,
      queued: this.#queue.size,
      running: this.#queue.pending,
    }
  }

  clear(): void {
    this.#cache.clear()
  }
}

export const defaultTerminalImageDecodeService = new TerminalImageDecodeService()

function decodedFramesBytes(frames: readonly TerminalDecodedImageFrame[]): number {
  return frames.reduce((bytes, frame) => bytes + frame.rgba.byteLength + frame.png.byteLength, 0)
}

function boundedInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}
