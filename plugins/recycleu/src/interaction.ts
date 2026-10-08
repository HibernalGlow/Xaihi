import type { InteractionField, InteractionValue, InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"

import type { RecycleuAction, RecycleuInput, RecycleuResult } from "./core.ts"
import { createRecycleuTranslator } from "./i18n.ts"

export type RecycleuInteractionValues = InteractionValues & {
  action: RecycleuAction
  driveLetter: string
  interval: number
  maxCycles: number
}

export const defaultRecycleuInteractionValues: RecycleuInteractionValues = {
  action: "status",
  driveLetter: "",
  interval: 10,
  maxCycles: 360,
}

export function createRecycleuInteractionSchema(
  defaults: Partial<RecycleuInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<RecycleuInput, RecycleuResult> {
  const t = createRecycleuTranslator(language)
  const initialValues: RecycleuInteractionValues = { ...defaultRecycleuInteractionValues }
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== undefined) initialValues[key] = value
  }
  const starts = (values: Readonly<InteractionValues>) => values.action === "start"
  const fields: InteractionField[] = [
    {
      id: "action",
      label: t("action"),
      kind: "select",
      role: "action",
      options: [
        { value: "status", label: t("actionStatus") },
        { value: "clean_now", label: t("actionClean") },
        { value: "start", label: t("actionStart") },
      ],
    },
    {
      id: "driveLetter",
      label: t("drive"),
      description: t("driveHint"),
      kind: "text",
      placeholder: "C",
      validate: (value) => {
        const normalized = String(value).trim()
        return normalized && !/^[a-zA-Z](?::)?$/.test(normalized) ? t("driveHint") : null
      },
    },
    {
      id: "interval",
      label: t("interval"),
      kind: "number",
      min: 5,
      step: 1,
      visibleWhen: starts,
      validate: (value: InteractionValue) => Number(value) >= 5 ? null : t("intervalMinimum"),
    },
    {
      id: "maxCycles",
      label: t("maxCycles"),
      description: t("cycleHint"),
      kind: "number",
      min: 0,
      step: 1,
      visibleWhen: starts,
      validate: (value: InteractionValue) => Number.isInteger(Number(value)) && Number(value) >= 0 ? null : t("cyclesMinimum"),
    },
  ]

  return {
    id: "recycleu",
    title: t("name"),
    description: t("description"),
    initialValues,
    fields,
    view: {
      sections: [
        { id: "scope", title: t("sourceSection"), fieldIds: ["action", "driveLetter"] },
        { id: "schedule", title: t("scheduleSection"), description: t("cycleHint"), fieldIds: ["interval", "maxCycles"] },
      ],
      dashboard: {
        title: t("dashboard"),
        description: t("dashboardHint"),
        display(values) {
          const input = recycleuInputFromInteractionValues(values)
          const action = actionLabel(input.action ?? "status", t)
          return {
            primary: input.action === "start" ? `${input.interval ?? 10}s` : action,
            secondary: input.action === "status" ? t("statusReady") : t("previewDrive", { value: input.driveLetter || t("allDrives") }),
            metrics: [
              { label: t("action"), value: action },
              { label: t("drive"), value: input.driveLetter || t("allDrives") },
              ...(input.action === "start" ? [
                { label: t("interval"), value: `${input.interval ?? 10}s` },
                { label: t("maxCycles"), value: input.maxCycles === 0 ? t("unlimited") : String(input.maxCycles ?? 360) },
              ] : []),
            ],
          }
        },
      },
    },
    toInput: recycleuInputFromInteractionValues,
    validate(values, input) {
      if (input.action === "start" && (input.interval ?? 0) < 5) return t("intervalMinimum")
      if (input.action === "start" && (!Number.isInteger(input.maxCycles) || (input.maxCycles ?? -1) < 0)) return t("cyclesMinimum")
      return null
    },
    preview(input) {
      const action = input.action ?? "status"
      const lines = [t("previewAction", { value: actionLabel(action, t) })]
      if (action !== "status") lines.push(t("previewDrive", { value: input.driveLetter || t("allDrives") }))
      if (action === "start") lines.push(t("previewInterval", { interval: input.interval ?? 10, cycles: input.maxCycles === 0 ? t("unlimited") : input.maxCycles ?? 360 }))
      return lines
    },
    isDangerous: (input) => input.action === "clean_now" || input.action === "start",
    dangerPrompt: () => ({ title: t("dangerTitle"), body: t("dangerBody"), confirmLabel: t("dangerConfirm") }),
    result(result) {
      const data = result.data
      return {
        success: result.success,
        message: result.message,
        lines: data ? [
          t("resultStatus", { value: data.timerStatus }),
          t("resultCleaned", { value: data.cleanCount }),
          t("resultRemaining", { value: data.remainingSeconds }),
          t("resultLastClean", { value: data.lastCleanTime ?? "—" }),
        ] : [],
      }
    },
  }
}

export function recycleuInputFromInteractionValues(values: Readonly<InteractionValues>): RecycleuInput {
  const action = values.action === "clean_now" || values.action === "start" ? values.action : "status"
  return {
    action,
    driveLetter: String(values.driveLetter ?? "").trim(),
    interval: finiteNumber(values.interval, 10),
    maxCycles: finiteNumber(values.maxCycles, 360),
  }
}

function actionLabel(action: RecycleuAction, t: ReturnType<typeof createRecycleuTranslator>): string {
  if (action === "clean_now") return t("actionClean")
  if (action === "start") return t("actionStart")
  return t("actionStatus")
}

function finiteNumber(value: InteractionValue | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}
