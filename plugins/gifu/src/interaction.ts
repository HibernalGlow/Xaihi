import type {
  InteractionField,
  InteractionValue,
  InteractionValues,
  TerminalInteractionSchema,
} from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import { defaultGifuInput, normalizeGifuInput, parsePathList, validateGifuInput } from "./input-shape.ts"
import type { GifuAction, GifuFormat, GifuInput, GifuOutputMode, GifuResult } from "./core.ts"
import { createGifuTranslator } from "./i18n.ts"

export type GifuInteractionValues = InteractionValues & {
  action: GifuAction
  pathsText: string
  recursive: boolean
  format: GifuFormat
  outMode: GifuOutputMode
  outDir: string
  namePrefix: string
  nameTemplate: string
  durationMs: number
  loop: number
  quality: number
  webpMethod: number
  ffmpegThreads: number
  webmCrf: number
  webmCpuUsed: number
  mp4Preset: string
  mp4Cq: number
  maxWorkers: number
  extractSingle: boolean
  overwrite: boolean
  dryRun: boolean
  recordRun: boolean
  databasePath: string
  configPath: string
}

export const defaultGifuInteractionValues: GifuInteractionValues = {
  action: defaultGifuInput.action,
  pathsText: "",
  recursive: defaultGifuInput.recursive,
  format: defaultGifuInput.format,
  outMode: defaultGifuInput.outMode,
  outDir: defaultGifuInput.outDir,
  namePrefix: defaultGifuInput.namePrefix,
  nameTemplate: defaultGifuInput.nameTemplate,
  durationMs: defaultGifuInput.durationMs,
  loop: defaultGifuInput.loop,
  quality: defaultGifuInput.quality,
  webpMethod: defaultGifuInput.webpMethod,
  ffmpegThreads: defaultGifuInput.ffmpegThreads,
  webmCrf: defaultGifuInput.webmCrf,
  webmCpuUsed: defaultGifuInput.webmCpuUsed,
  mp4Preset: defaultGifuInput.mp4Preset,
  mp4Cq: defaultGifuInput.mp4Cq,
  maxWorkers: defaultGifuInput.maxWorkers,
  extractSingle: defaultGifuInput.extractSingle,
  overwrite: defaultGifuInput.overwrite,
  dryRun: defaultGifuInput.dryRun,
  recordRun: defaultGifuInput.recordRun,
  databasePath: defaultGifuInput.databasePath,
  configPath: defaultGifuInput.configPath,
}

export function createGifuInteractionSchema(
  defaults: Partial<GifuInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<GifuInput, GifuResult> {
  const t = createGifuTranslator(language)
  const initialValues: GifuInteractionValues = { ...defaultGifuInteractionValues }
  for (const [key, value] of Object.entries(defaults)) if (value !== undefined) initialValues[key] = value
  const isFormat = (...formats: GifuFormat[]) => (values: Readonly<InteractionValues>) => formats.includes(values.format as GifuFormat)
  const fields: InteractionField[] = [
    {
      id: "action", label: t("action"), kind: "select", role: "action",
      options: [
        { value: "inspect", label: t("inspect") },
        { value: "plan", label: t("plan") },
        { value: "make", label: t("make") },
      ],
    },
    { id: "pathsText", label: t("paths"), description: t("pathsHint"), kind: "path-list", lines: 5 },
    { id: "recursive", label: t("recursive"), kind: "boolean" },
    {
      id: "format", label: t("format"), kind: "select",
      options: ["webp", "gif", "apng", "webm", "mp4", "auto"].map((value) => ({ value, label: value.toUpperCase() })),
    },
    {
      id: "outMode", label: t("outMode"), kind: "select",
      options: [{ value: "same", label: t("same") }, { value: "separate", label: t("separate") }],
    },
    { id: "outDir", label: t("outDir"), kind: "text" },
    { id: "namePrefix", label: t("namePrefix"), kind: "text" },
    { id: "nameTemplate", label: t("nameTemplate"), kind: "text" },
    numberField("durationMs", t("duration"), 1, 60_000, t),
    { ...numberField("loop", t("loop"), 0, 100_000, t), visibleWhen: isFormat("gif", "webp", "wbp", "apng", "auto") },
    { ...numberField("quality", t("quality"), 1, 100, t), visibleWhen: isFormat("webp", "wbp", "auto") },
    { ...numberField("webpMethod", t("webpMethod"), 0, 6, t), visibleWhen: isFormat("webp", "wbp", "auto") },
    { ...numberField("ffmpegThreads", t("ffmpegThreads"), 0, 256, t), visibleWhen: isFormat("apng", "webm", "mp4") },
    { ...numberField("webmCrf", t("webmCrf"), 0, 63, t), visibleWhen: isFormat("webm") },
    { ...numberField("webmCpuUsed", t("webmCpuUsed"), 0, 8, t), visibleWhen: isFormat("webm") },
    {
      id: "mp4Preset", label: t("mp4Preset"), kind: "select", visibleWhen: isFormat("mp4"),
      options: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((value) => ({ value, label: value.toUpperCase() })),
    },
    { ...numberField("mp4Cq", t("mp4Cq"), 0, 63, t), visibleWhen: isFormat("mp4") },
    numberField("maxWorkers", t("maxWorkers"), 0, 128, t),
    { id: "extractSingle", label: t("extractSingle"), kind: "boolean" },
    { id: "overwrite", label: t("overwrite"), kind: "boolean" },
    { id: "dryRun", label: t("dryRun"), kind: "boolean" },
    { id: "recordRun", label: t("recordRun"), kind: "boolean" },
    { id: "databasePath", label: t("databasePath"), kind: "text", visibleWhen: (values) => values.recordRun === true },
    { id: "configPath", label: t("configPath"), kind: "text" },
  ]

  return {
    id: "gifu",
    title: t("name"),
    description: t("description"),
    initialValues,
    fields,
    view: {
      sections: [
        { id: "input", title: t("inputSection"), description: t("inputSectionHint"), fieldIds: ["action", "pathsText", "recursive", "configPath"] },
        { id: "output", title: t("outputSection"), description: t("outputSectionHint"), fieldIds: ["format", "outMode", "outDir", "namePrefix", "nameTemplate", "durationMs", "loop", "quality", "webpMethod", "ffmpegThreads", "webmCrf", "webmCpuUsed", "mp4Preset", "mp4Cq"] },
        { id: "execution", title: t("executionSection"), description: t("executionSectionHint"), fieldIds: ["maxWorkers", "extractSingle", "overwrite", "dryRun", "recordRun", "databasePath"] },
      ],
      dashboard: {
        title: t("dashboard"),
        description: t("dashboardHint"),
        display(values) {
          const paths = parsePathList(String(values.pathsText ?? ""))
          return {
            primary: `${paths.length} ${t("paths")}`,
            secondary: String(values.outDir || values.outMode || "same"),
            metrics: [
              { label: t("metricAction"), value: actionLabel(values.action as GifuAction, t) },
              { label: t("metricFormat"), value: String(values.format ?? "webp").toUpperCase() },
              { label: t("metricSafety"), value: values.dryRun !== false ? t("preview") : t("live") },
            ],
            table: {
              columns: [{ id: "path", label: t("tablePath"), width: 42 }, { id: "state", label: t("tableState"), width: 14 }],
              rows: paths.map((path) => ({ path, state: t("pending") })),
              emptyMessage: t("emptyPaths"),
            },
          }
        },
      },
    },
    toInput: gifuInputFromInteractionValues,
    validate(_values, input) {
      if (!input.paths?.length) return t("emptyPaths")
      return validateGifuInput(normalizeGifuInput(input))
    },
    preview(input) {
      const normalized = normalizeGifuInput(input)
      return [
        `${t("action")}: ${actionLabel(normalized.action, t)}`,
        `${t("paths")}: ${normalized.paths.length}`,
        `${t("format")}: ${normalized.format.toUpperCase()}`,
        `${t("outMode")}: ${normalized.outMode}`,
        `${t("metricSafety")}: ${normalized.dryRun ? t("preview") : t("live")}`,
      ]
    },
    isDangerous: (input) => input.action === "make" && input.dryRun === false,
    dangerPrompt: () => ({ title: t("dangerTitle"), body: t("dangerBody"), confirmLabel: t("dangerConfirm") }),
    result(result) {
      return {
        success: result.success,
        message: result.message,
        lines: result.data?.errors ?? [],
        table: {
          columns: [
            { id: "path", label: t("tablePath"), width: 34 },
            { id: "state", label: t("tableState"), width: 12 },
            { id: "images", label: t("resultImages"), width: 10 },
            { id: "output", label: t("outDir"), width: 36 },
          ],
          rows: (result.data?.archives ?? []).map((item) => ({
            path: item.archivePath,
            state: item.status,
            images: String(item.imageCount),
            output: item.outputPath,
          })),
          emptyMessage: result.message,
        },
      }
    },
  }
}

export function gifuInputFromInteractionValues(values: Readonly<InteractionValues>): GifuInput {
  return {
    action: asAction(values.action),
    paths: parsePathList(String(values.pathsText ?? "")),
    recursive: values.recursive !== false,
    format: asFormat(values.format),
    outMode: values.outMode === "separate" ? "separate" : "same",
    outDir: String(values.outDir ?? ""),
    namePrefix: String(values.namePrefix ?? defaultGifuInput.namePrefix),
    nameTemplate: String(values.nameTemplate ?? defaultGifuInput.nameTemplate),
    durationMs: asNumber(values.durationMs, defaultGifuInput.durationMs),
    loop: asNumber(values.loop, defaultGifuInput.loop),
    quality: asNumber(values.quality, defaultGifuInput.quality),
    webpMethod: asNumber(values.webpMethod, defaultGifuInput.webpMethod),
    ffmpegThreads: asNumber(values.ffmpegThreads, defaultGifuInput.ffmpegThreads),
    webmCrf: asNumber(values.webmCrf, defaultGifuInput.webmCrf),
    webmCpuUsed: asNumber(values.webmCpuUsed, defaultGifuInput.webmCpuUsed),
    mp4Preset: String(values.mp4Preset ?? defaultGifuInput.mp4Preset),
    mp4Cq: asNumber(values.mp4Cq, defaultGifuInput.mp4Cq),
    maxWorkers: asNumber(values.maxWorkers, defaultGifuInput.maxWorkers),
    extractSingle: values.extractSingle !== false,
    overwrite: values.overwrite === true,
    dryRun: values.dryRun !== false,
    recordRun: values.recordRun === true,
    databasePath: String(values.databasePath ?? ""),
    configPath: String(values.configPath ?? ""),
  }
}

function numberField(id: string, label: string, min: number, max: number, t: ReturnType<typeof createGifuTranslator>): InteractionField {
  return {
    id, label, kind: "number", min, max,
    validate: (value) => {
      const number = Number(value)
      return Number.isFinite(number) && number >= min && number <= max ? null : t("invalidNumber", { min, max })
    },
  }
}

function asNumber(value: InteractionValue | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asAction(value: InteractionValue | undefined): GifuAction {
  return value === "inspect" || value === "make" ? value : "plan"
}

function asFormat(value: InteractionValue | undefined): GifuFormat {
  return value === "gif" || value === "apng" || value === "webm" || value === "mp4" || value === "auto" || value === "wbp" ? value : "webp"
}

function actionLabel(action: GifuAction, t: ReturnType<typeof createGifuTranslator>): string {
  return action === "inspect" ? t("inspect") : action === "make" ? t("make") : t("plan")
}
