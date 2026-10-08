/**
 * sleept 的交互面 schema，逐字搬自 `<Xiranite>` 当前 HEAD（`v1.0.0-587-g8e42280f`）的
 * `packages/nodes/sleept/src/interaction.ts`（282 行）——取代此前按 tag `noxide`（280 行）
 * 搬的旧基线。HEAD 相对 `noxide` 的实质差异：`powerMode` 从 4 值升为 6 值（新增
 * `display-sleep` / `screensaver`），且选项与标签从常量 `POWER_MODE_VALUES` 派生
 * （`schedule.ts`），`asPowerMode` 改为 `POWER_MODE_VALUES.includes`。
 *
 * 本仓改动只有说明符：`@xiranite/cli-runtime/{interaction,i18n}` →
 * `@hibernalglow/xaihi-cli-runtime/{interaction,i18n}`（cli-runtime 已入 workspace，
 * 本包以 devDependency 引用，tsdown 里保持 external）；相对导入 `.js` 后缀改 `.ts`。
 * 消费者：`packages/ui-host/src/nodes/sleept/Component.tsx` value-import
 * `sleeptInputFromInteractionValues` / `SleeptInteractionAction`；引导流经
 * `runInteractionCli` 读 `createSleeptInteractionSchema`。
 *
 * @module xaihi-sleept/interaction
 */

import type {
  InteractionField,
  InteractionValue,
  InteractionValues,
  TerminalInteractionSchema,
} from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"

import type { NetTriggerMode, SleeptInput, SleeptResult } from "./core.ts"
// The two values the schema needs live in `schedule.ts`, not `core.ts`: importing them from the engine module
// would evaluate that whole module here, and for this face's reader (the GUI) that means shipping the node's
// business logic into the browser chunk. `core.ts` re-exports the same names for the host-side contract.
import { parseTargetDatetime, POWER_MODE_VALUES, type PowerMode } from "./schedule.ts"
import { countdownSeconds, formatDuration } from "./duration.ts"
import { createSleeptTranslator } from "./i18n.ts"

export type SleeptInteractionAction = "countdown" | "specific_time" | "netspeed" | "cpu" | "get_stats"

export type SleeptInteractionValues = InteractionValues & {
  action: SleeptInteractionAction
  powerMode: PowerMode
  hours: number
  minutes: number
  seconds: number
  targetDatetime: string
  uploadThreshold: number
  downloadThreshold: number
  netDuration: number
  netTriggerMode: NetTriggerMode
  cpuThreshold: number
  cpuDuration: number
  dryrun: boolean
  maxWaitSeconds: number
}

export const defaultSleeptInteractionValues: SleeptInteractionValues = {
  action: "countdown",
  powerMode: "sleep",
  hours: 0,
  minutes: 0,
  seconds: 5,
  targetDatetime: "",
  uploadThreshold: 242,
  downloadThreshold: 242,
  netDuration: 2,
  netTriggerMode: "both",
  cpuThreshold: 10,
  cpuDuration: 2,
  dryrun: true,
  maxWaitSeconds: 3600,
}

export function createSleeptInteractionSchema(
  defaults: Partial<SleeptInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<SleeptInput, SleeptResult> {
  const t = createSleeptTranslator(language)
  const initialValues: SleeptInteractionValues = { ...defaultSleeptInteractionValues }
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== undefined) initialValues[key] = value
  }
  const forAction = (...actions: SleeptInteractionAction[]) => (values: Readonly<InteractionValues>) => actions.includes(values.action as SleeptInteractionAction)
  const nonNegative = (value: InteractionValue) => validateNumber(value, 0, t("invalidNumber", { min: 0 }))
  const fields: InteractionField[] = [
    {
      id: "action",
      label: t("action"),
      description: t("actionHint"),
      kind: "select",
      options: [
        { value: "countdown", label: t("timerCountdown") },
        { value: "specific_time", label: t("timerAt") },
        { value: "netspeed", label: t("timerNet") },
        { value: "cpu", label: t("timerCpu") },
        { value: "get_stats", label: t("statusAction") },
      ],
    },
    { id: "hours", label: t("hours"), kind: "number", min: 0, max: 23, visibleWhen: forAction("countdown"), validate: nonNegative },
    { id: "minutes", label: t("minutes"), kind: "number", min: 0, max: 59, visibleWhen: forAction("countdown"), validate: nonNegative },
    { id: "seconds", label: t("seconds"), kind: "number", min: 0, max: 59, visibleWhen: forAction("countdown"), validate: nonNegative },
    {
      id: "targetDatetime",
      label: t("targetDatetime"),
      placeholder: "YYYY-MM-DD HH:MM:SS",
      kind: "text",
      visibleWhen: forAction("specific_time"),
      validate: (value) => validateTarget(String(value), t("targetRequired")),
    },
    { id: "uploadThreshold", label: t("uploadThreshold"), kind: "number", min: 0, visibleWhen: forAction("netspeed"), validate: nonNegative },
    { id: "downloadThreshold", label: t("downloadThreshold"), kind: "number", min: 0, visibleWhen: forAction("netspeed"), validate: nonNegative },
    { id: "netDuration", label: t("sustainedMinutes"), kind: "number", min: 0.5, step: 0.5, visibleWhen: forAction("netspeed"), validate: (value) => validateNumber(value, 0.5, t("invalidNumber", { min: 0.5 })) },
    {
      id: "netTriggerMode",
      label: t("triggerMode"),
      kind: "select",
      visibleWhen: forAction("netspeed"),
      options: [
        { value: "both", label: t("triggerBoth") },
        { value: "any", label: t("triggerAny") },
      ],
    },
    { id: "cpuThreshold", label: t("thresholdPct"), kind: "number", min: 1, max: 100, visibleWhen: forAction("cpu"), validate: (value) => validateNumber(value, 1, t("invalidNumber", { min: 1 })) },
    { id: "cpuDuration", label: t("sustainedMinutes"), kind: "number", min: 0.5, step: 0.5, visibleWhen: forAction("cpu"), validate: (value) => validateNumber(value, 0.5, t("invalidNumber", { min: 0.5 })) },
    { id: "maxWaitSeconds", label: t("maxWait"), kind: "number", min: 0, visibleWhen: forAction("netspeed", "cpu"), validate: nonNegative },
    {
      id: "powerMode",
      label: t("powerMode"),
      kind: "select",
      visibleWhen: forAction("countdown", "specific_time", "netspeed", "cpu"),
      options: POWER_MODE_VALUES.map((value) => ({ value, label: t(POWER_MODE_LABEL_KEYS[value]) })),
    },
    {
      id: "dryrun",
      label: t("dryRun"),
      description: t("dryRunHint"),
      kind: "boolean",
      visibleWhen: forAction("countdown", "specific_time", "netspeed", "cpu"),
    },
  ]

  return {
    id: "sleept",
    title: t("name"),
    description: t("description"),
    initialValues,
    fields,
    view: {
      sections: [{
        id: "trigger",
        title: t("triggerSequence"),
        description: t("triggerSequenceHint"),
        fieldIds: [
          "action",
          "hours",
          "minutes",
          "seconds",
          "targetDatetime",
          "uploadThreshold",
          "downloadThreshold",
          "netDuration",
          "netTriggerMode",
          "cpuThreshold",
          "cpuDuration",
          "maxWaitSeconds",
        ],
      }, {
        id: "execution",
        title: t("executionAction"),
        description: t("executionActionHint"),
        fieldIds: ["powerMode", "dryrun"],
      }],
      dashboard: {
        title: t("systemStandby"),
        description: t("systemStandbyHint"),
        display(values) {
          const action = values.action as SleeptInteractionAction
          const powerMode = asPowerMode(values.powerMode)
          const primary = action === "countdown"
            ? formatDuration(countdownSeconds(sleeptInputFromInteractionValues(values)))
            : action === "specific_time"
              ? String(values.targetDatetime || "YYYY-MM-DD HH:MM:SS")
              : action === "netspeed"
                ? t("monitorNetwork")
                : action === "cpu"
                  ? t("monitorCpu")
                  : t("statusDisplay")
          return {
            primary,
            secondary: actionLabel(action, t),
            metrics: [
              { label: t("metricMode"), value: actionLabel(action, t) },
              { label: t("metricPower"), value: action === "get_stats" ? t("notApplicable") : powerLabel(powerMode, t) },
              { label: t("metricSafety"), value: action === "get_stats" ? t("notApplicable") : values.dryrun !== false ? t("dryRun") : t("live") },
            ],
          }
        },
      },
    },
    toInput: sleeptInputFromInteractionValues,
    validate(_values, input) {
      if (input.action === "countdown" && countdownSeconds(input) <= 0) return t("durationRequired")
      if (input.action === "specific_time") return validateTarget(input.targetDatetime ?? "", t("targetRequired"))
      return null
    },
    preview(input) {
      const action = actionLabel(input.action as SleeptInteractionAction, t)
      const lines = [t("previewAction", { value: action })]
      if (input.action === "countdown") lines.push(t("previewDuration", { value: formatDuration(countdownSeconds(input)) }))
      if (input.action === "specific_time") lines.push(t("previewTarget", { value: input.targetDatetime ?? "" }))
      if (input.action === "netspeed") {
        lines.push(t("previewThreshold", { value: `${input.uploadThreshold}/${input.downloadThreshold} KB/s` }))
      }
      if (input.action === "cpu") lines.push(t("previewThreshold", { value: `${input.cpuThreshold}%` }))
      if (input.action === "netspeed" || input.action === "cpu") {
        lines.push(t("previewWait", { value: input.maxWaitSeconds === 0 ? t("unlimited") : `${input.maxWaitSeconds}s` }))
      }
      if (input.action !== "get_stats") {
        lines.push(t("previewPower", { value: powerLabel(input.powerMode ?? "sleep", t) }))
        lines.push(t("previewDryRun", { value: input.dryrun ? t("dryRun") : t("live") }))
      }
      return lines
    },
    isDangerous: (input) => input.action !== "get_stats" && !input.dryrun,
    result(result) {
      const lines: string[] = []
      if (result.data?.timerStatus) lines.push(t("resultState", { value: result.data.timerStatus }))
      if (result.data?.targetTime) lines.push(t("resultTarget", { value: result.data.targetTime }))
      return { success: result.success, message: result.message, lines }
    },
  }
}

export function sleeptInputFromInteractionValues(values: Readonly<InteractionValues>): SleeptInput {
  const action = values.action as SleeptInteractionAction
  if (action === "get_stats") return { action }
  return {
    action,
    powerMode: asPowerMode(values.powerMode),
    hours: asNumber(values.hours, 0),
    minutes: asNumber(values.minutes, 0),
    seconds: asNumber(values.seconds, 5),
    targetDatetime: String(values.targetDatetime ?? ""),
    uploadThreshold: asNumber(values.uploadThreshold, 242),
    downloadThreshold: asNumber(values.downloadThreshold, 242),
    netDuration: asNumber(values.netDuration, 2),
    netTriggerMode: values.netTriggerMode === "any" ? "any" : "both",
    cpuThreshold: asNumber(values.cpuThreshold, 10),
    cpuDuration: asNumber(values.cpuDuration, 2),
    dryrun: values.dryrun !== false,
    maxWaitSeconds: asNumber(values.maxWaitSeconds, 3600),
  }
}

function validateNumber(value: InteractionValue, min: number, message: string): string | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= min ? null : message
}

function validateTarget(value: string, message: string): string | null {
  try {
    parseTargetDatetime(value)
    return null
  } catch {
    return message
  }
}

function asNumber(value: InteractionValue | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asPowerMode(value: InteractionValue | undefined): PowerMode {
  return POWER_MODE_VALUES.includes(value as PowerMode) ? (value as PowerMode) : "sleep"
}

type Translator = ReturnType<typeof createSleeptTranslator>

function actionLabel(action: SleeptInteractionAction, t: Translator): string {
  if (action === "specific_time") return t("timerAt")
  if (action === "netspeed") return t("timerNet")
  if (action === "cpu") return t("timerCpu")
  if (action === "get_stats") return t("statusAction")
  return t("timerCountdown")
}

/**
 * One row per `PowerMode`, so a mode added to `core.ts` cannot be listed in the field and left unlabelled in
 * the preview: `satisfies` makes the compiler check both directions of that claim.
 */
const POWER_MODE_LABEL_KEYS = {
  sleep: "powerSleep",
  hibernate: "powerHibernate",
  shutdown: "powerOff",
  restart: "powerReboot",
  "display-sleep": "powerDisplaySleep",
  screensaver: "powerScreensaver",
} as const satisfies Record<PowerMode, Parameters<Translator>[0]>

function powerLabel(mode: PowerMode, t: Translator): string {
  return t(POWER_MODE_LABEL_KEYS[mode])
}
