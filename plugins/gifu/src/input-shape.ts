/**
 * Gifu's input shape: the default input, its normalizer, its range validation and its path-list parser.
 *
 * These four used to live only in `core.ts`, which left the terminal schema in `interaction.ts` with exactly one
 * way to read them — a *value* import of `./core.js`. That edge drags the whole engine graph into the CLI/TUI
 * process (and, for the GUI, into the browser chunk), which ADR-0074 §5 rejects: a face may not hold a second
 * copy of the node's execution. One implementation, not one file: the definitions moved here, `core.ts` imports
 * them and re-exports the same names, so the host's QuickJS bundle, `./core.js` consumers and `core.test.ts` all
 * still resolve a single copy. Same shape as bandia's `path-mappings.ts` and enginev's `filter.ts`.
 *
 * The runtime edge is one-directional: this module value-imports nothing from `core.js` (the `GifuInput` types it
 * returns are imported as `import type`, which emits nothing). The helpers here are private on purpose — `core.ts`
 * no longer uses `clean`/`finiteOr`/`uniqueClean`/`defined` after `normalizeGifuInput` moved, so there is no second
 * copy and nothing to forward.
 *
 * Pure text and number work only: no `GifuRuntime`, no filesystem, no 7-Zip or ffmpeg invocation.
 */
import type { GifuInput, NormalizedGifuInput } from "./core.ts"

/** Every field a `GifuInput` may omit; `normalizeGifuInput` fills exactly these. */
export const defaultGifuInput: NormalizedGifuInput = {
  action: "plan",
  paths: [],
  path: "",
  listText: "",
  listFile: "",
  configPath: "",
  configText: "",
  databasePath: "",
  recordRun: false,
  recursive: true,
  format: "webp",
  outDir: "",
  outMode: "same",
  namePrefix: "[#dyna]",
  nameTemplate: "{prefix}{stem}",
  durationMs: 120,
  loop: 0,
  quality: 85,
  webpMethod: 2,
  ffmpegThreads: 0,
  webmCrf: 34,
  webmCpuUsed: 6,
  mp4Preset: "p3",
  mp4Cq: 32,
  maxWorkers: 0,
  extractSingle: true,
  overwrite: false,
  dryRun: true,
}

export function normalizeGifuInput(input: GifuInput): NormalizedGifuInput {
  const format = input.format === "wbp" ? "webp" : input.format ?? defaultGifuInput.format
  const template = clean(input.nameTemplate) || defaultGifuInput.nameTemplate
  return {
    ...defaultGifuInput,
    ...defined(input),
    action: input.action ?? defaultGifuInput.action,
    path: clean(input.path),
    paths: uniqueClean([input.path, ...(input.paths ?? []), ...parsePathList(input.listText ?? "")]),
    listText: input.listText ?? "",
    listFile: clean(input.listFile),
    configPath: clean(input.configPath),
    configText: input.configText ?? "",
    databasePath: clean(input.databasePath),
    recursive: input.recursive ?? defaultGifuInput.recursive,
    format,
    outDir: clean(input.outDir),
    outMode: input.outMode ?? defaultGifuInput.outMode,
    namePrefix: input.namePrefix === undefined ? defaultGifuInput.namePrefix : input.namePrefix.trim(),
    nameTemplate: template.includes("{stem}") ? template : `${template}{stem}`,
    durationMs: finiteOr(input.durationMs, defaultGifuInput.durationMs),
    loop: finiteOr(input.loop, defaultGifuInput.loop),
    quality: finiteOr(input.quality, defaultGifuInput.quality),
    webpMethod: finiteOr(input.webpMethod, defaultGifuInput.webpMethod),
    ffmpegThreads: finiteOr(input.ffmpegThreads, defaultGifuInput.ffmpegThreads),
    webmCrf: finiteOr(input.webmCrf, defaultGifuInput.webmCrf),
    webmCpuUsed: finiteOr(input.webmCpuUsed, defaultGifuInput.webmCpuUsed),
    mp4Preset: clean(input.mp4Preset) || defaultGifuInput.mp4Preset,
    mp4Cq: finiteOr(input.mp4Cq, defaultGifuInput.mp4Cq),
    maxWorkers: finiteOr(input.maxWorkers, defaultGifuInput.maxWorkers),
    extractSingle: input.extractSingle ?? defaultGifuInput.extractSingle,
    overwrite: input.overwrite ?? defaultGifuInput.overwrite,
    dryRun: input.dryRun ?? defaultGifuInput.dryRun,
    recordRun: input.recordRun ?? Boolean(input.databasePath),
  }
}

/**
 * Range checks on an already-normalized input. The messages are the operation's user-visible error strings, so the
 * terminal `validate` closure and the host's `runGifu` gate must read this one table rather than each face's own.
 */
export function validateGifuInput(input: NormalizedGifuInput): string | null {
  if (input.durationMs <= 0) return "durationMs must be greater than zero."
  if (input.loop < 0) return "loop must be greater than or equal to zero."
  if (input.quality < 1 || input.quality > 100) return "quality must be between 1 and 100."
  if (input.webpMethod < 0 || input.webpMethod > 6) return "webpMethod must be between 0 and 6."
  if (input.ffmpegThreads < 0) return "ffmpegThreads must be greater than or equal to zero."
  if (input.webmCrf < 0 || input.webmCrf > 63) return "webmCrf must be between 0 and 63."
  if (input.webmCpuUsed < 0 || input.webmCpuUsed > 8) return "webmCpuUsed must be between 0 and 8."
  if (!/^p[1-7]$/.test(input.mp4Preset)) return "mp4Preset must be p1 through p7."
  if (input.mp4Cq < 0 || input.mp4Cq > 63) return "mp4Cq must be between 0 and 63."
  if (input.maxWorkers < 0) return "maxWorkers must be greater than or equal to zero."
  return null
}

/** Newline/semicolon separated path list, `#` comments dropped — the same parser the list file and the TUI textarea use. */
export function parsePathList(text: string): string[] {
  return text.split(/\r?\n|;/).map(clean).filter((line) => line && !line.startsWith("#"))
}

function clean(value: unknown): string {
  const text = String(value ?? "").trim()
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1).trim()
  return text
}

function uniqueClean(values: unknown[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback
}

function defined(input: GifuInput): Partial<NormalizedGifuInput> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) if (value !== undefined) result[key] = value
  return result as Partial<NormalizedGifuInput>
}
