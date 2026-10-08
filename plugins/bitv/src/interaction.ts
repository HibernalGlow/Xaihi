import type {
  InteractionField,
  InteractionValue,
  InteractionValues,
  TerminalInteractionSchema,
} from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"

import { BITV_DEFAULTS } from "./defaults.ts"
import { createBitvTranslator } from "./i18n.ts"
import { parseBitvPaths } from "./paths.ts"

import type {
  BitvAction,
  BitvInput,
  BitvResult,
  BitvTransferMode,
} from "./core.ts"

export type BitvInteractionValues = InteractionValues & {
  action: BitvAction
  paths: string
  reportPath: string
  targetPath: string
  outputPath: string
  recursive: boolean
  bitrateStepMbps: number
  maxLevels: number
  transferMode: BitvTransferMode
  dryRun: boolean
}

export const defaultBitvInteractionValues: BitvInteractionValues = {
  action: "analyze",
  paths: "",
  reportPath: "",
  targetPath: "",
  outputPath: "",
  recursive: BITV_DEFAULTS.recursive,
  bitrateStepMbps: BITV_DEFAULTS.bitrateStepMbps,
  maxLevels: BITV_DEFAULTS.maxLevels,
  transferMode: BITV_DEFAULTS.transferMode,
  dryRun: BITV_DEFAULTS.dryRun,
}

export function createBitvInteractionSchema(
  defaults: Partial<BitvInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<BitvInput, BitvResult> {
  const t = createBitvTranslator(language)
  const initialValues: BitvInteractionValues = { ...defaultBitvInteractionValues }
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== undefined) initialValues[key] = value
  }

  const forAction = (...actions: BitvAction[]) => (values: Readonly<InteractionValues>) => actions.includes(values.action as BitvAction)
  const positive = (value: InteractionValue) => Number.isFinite(Number(value)) && Number(value) > 0 ? null : t("positiveNumber")
  const levels = (value: InteractionValue) => {
    const number = Number(value)
    return Number.isInteger(number) && number >= 1 && number <= 1000 ? null : t("integerRange")
  }
  const fields: InteractionField[] = [
    {
      id: "action",
      label: t("action"),
      description: t("actionHint"),
      kind: "select",
      role: "action",
      options: [
        { value: "status", label: t("actionStatus") },
        { value: "analyze", label: t("actionAnalyze") },
        { value: "classify", label: t("actionClassify") },
        { value: "report", label: t("actionReport") },
      ],
    },
    {
      id: "paths",
      label: t("paths"),
      description: t("pathsHint"),
      kind: "path-list",
      lines: 5,
      visibleWhen: forAction("analyze", "classify"),
    },
    {
      id: "reportPath",
      label: t("reportPath"),
      kind: "text",
      visibleWhen: forAction("report"),
    },
    {
      id: "recursive",
      label: t("recursive"),
      kind: "boolean",
      visibleWhen: forAction("analyze", "classify"),
    },
    {
      id: "bitrateStepMbps",
      label: t("bitrateStep"),
      kind: "number",
      min: 0.1,
      step: 0.5,
      visibleWhen: forAction("analyze", "classify", "report"),
      validate: positive,
    },
    {
      id: "maxLevels",
      label: t("maxLevels"),
      kind: "number",
      min: 1,
      max: 1000,
      step: 1,
      visibleWhen: forAction("analyze", "classify", "report"),
      validate: levels,
    },
    {
      id: "outputPath",
      label: t("outputPath"),
      description: t("outputHint"),
      kind: "text",
      visibleWhen: forAction("analyze"),
    },
    {
      id: "targetPath",
      label: t("targetPath"),
      kind: "text",
      visibleWhen: forAction("classify", "report"),
    },
    {
      id: "transferMode",
      label: t("transferMode"),
      kind: "select",
      visibleWhen: forAction("classify", "report"),
      options: [
        { value: "copy", label: t("transferCopy") },
        { value: "move", label: t("transferMove") },
      ],
    },
    {
      id: "dryRun",
      label: t("dryRun"),
      description: t("dryRunHint"),
      kind: "boolean",
      visibleWhen: forAction("classify", "report"),
    },
  ]

  return {
    id: "bitv",
    title: t("name"),
    description: t("description"),
    initialValues,
    fields,
    view: {
      sections: [
        {
          id: "source",
          title: t("sourceSection"),
          description: t("sourceSectionHint"),
          fieldIds: ["action", "paths", "reportPath", "recursive", "bitrateStepMbps", "maxLevels"],
        },
        {
          id: "output",
          title: t("outputSection"),
          description: t("outputSectionHint"),
          fieldIds: ["outputPath", "targetPath", "transferMode", "dryRun"],
        },
      ],
      dashboard: {
        title: t("dashboard"),
        description: t("dashboardHint"),
        display(values) {
          const action = asAction(values.action)
          const source = action === "report"
            ? String(values.reportPath || t("reportRequired"))
            : action === "status"
              ? t("actionStatus")
              : `${parseBitvPaths([String(values.paths ?? "")]).length} path(s)`
          return {
            primary: source,
            secondary: actionLabel(action, t),
            metrics: [
              { label: t("metricAction"), value: actionLabel(action, t) },
              { label: t("metricScan"), value: action === "report" || action === "status" ? t("notApplicable") : values.recursive !== false ? t("yes") : t("no") },
              { label: t("metricSafety"), value: action === "classify" || action === "report" ? values.dryRun !== false ? t("preview") : t("live") : t("notApplicable") },
            ],
          }
        },
      },
    },
    toInput: bitvInputFromInteractionValues,
    validate(values, input) {
      if ((input.action === "analyze" || input.action === "classify") && parseBitvPaths(input.paths).length === 0) return t("pathsRequired")
      if (input.action === "report" && !String(values.reportPath ?? "").trim()) return t("reportRequired")
      if ((input.action === "classify" || input.action === "report") && !String(values.targetPath ?? "").trim()) return t("targetRequired")
      return null
    },
    preview(input) {
      const action = input.action ?? "analyze"
      const lines = [t("previewAction", { value: actionLabel(action, t) })]
      if (action === "analyze" || action === "classify") lines.push(t("previewSources", { value: parseBitvPaths(input.paths).length }))
      if (action === "report") lines.push(t("previewReport", { value: input.reportPath ?? "" }))
      if (action !== "status") {
        lines.push(t("previewLevels", { step: input.bitrateStepMbps ?? BITV_DEFAULTS.bitrateStepMbps, levels: input.maxLevels ?? BITV_DEFAULTS.maxLevels }))
      }
      if (action === "classify" || action === "report") {
        lines.push(t("previewTarget", { value: input.targetPath ?? "" }))
        lines.push(t("previewTransfer", { value: transferLabel(input.transferMode ?? "copy", t) }))
        lines.push(t("previewSafety", { value: input.dryRun !== false ? t("preview") : t("live") }))
      }
      return lines
    },
    isDangerous: (input) => (input.action === "classify" || input.action === "report") && input.dryRun === false,
    dangerPrompt(input) {
      return {
        title: t("dangerTitle"),
        body: t("dangerBody", { mode: transferLabel(input.transferMode ?? "copy", t) }),
        confirmLabel: t("dangerConfirm"),
      }
    },
    result(result) {
      const data = result.data
      const lines = data ? [
        t("resultVideos", { value: data.videos.length }),
        t("resultOperations", { value: data.operations.length }),
        t("resultErrors", { value: data.errors.length }),
      ] : []
      if (data?.reportPath) lines.push(t("resultReport", { value: data.reportPath }))
      return {
        success: result.success,
        message: result.message,
        lines,
        table: {
          columns: [
            { id: "file", label: t("tableFile"), width: 28 },
            { id: "bitrate", label: t("tableBitrate"), width: 12 },
            { id: "resolution", label: t("tableResolution"), width: 12 },
            { id: "level", label: t("tableLevel"), width: 16 },
          ],
          rows: (data?.videos ?? []).map((video) => ({
            file: video.filename,
            bitrate: `${video.bitrateMbps.toFixed(2)} Mbps`,
            resolution: video.resolution,
            level: video.bitrateLevel,
          })),
          emptyMessage: t("tableEmpty"),
        },
      }
    },
  }
}

export function bitvInputFromInteractionValues(values: Readonly<InteractionValues>): BitvInput {
  const action = asAction(values.action)
  return {
    action,
    paths: parseBitvPaths([String(values.paths ?? "")]),
    reportPath: String(values.reportPath ?? "").trim() || undefined,
    targetPath: String(values.targetPath ?? "").trim() || undefined,
    outputPath: String(values.outputPath ?? "").trim() || undefined,
    recursive: values.recursive !== false,
    bitrateStepMbps: finiteNumber(values.bitrateStepMbps, BITV_DEFAULTS.bitrateStepMbps),
    maxLevels: finiteNumber(values.maxLevels, BITV_DEFAULTS.maxLevels),
    transferMode: values.transferMode === "move" ? "move" : "copy",
    dryRun: values.dryRun !== false,
  }
}

function asAction(value: InteractionValue | undefined): BitvAction {
  return value === "status" || value === "classify" || value === "report" ? value : "analyze"
}

function finiteNumber(value: InteractionValue | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

type Translator = ReturnType<typeof createBitvTranslator>

function actionLabel(action: BitvAction, t: Translator): string {
  if (action === "status") return t("actionStatus")
  if (action === "classify") return t("actionClassify")
  if (action === "report") return t("actionReport")
  return t("actionAnalyze")
}

function transferLabel(mode: BitvTransferMode, t: Translator): string {
  return mode === "move" ? t("transferMove") : t("transferCopy")
}
