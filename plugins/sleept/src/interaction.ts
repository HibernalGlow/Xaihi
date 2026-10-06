/**
 * sleept 的**交互面 schema**，从 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/sleept/src/interaction.ts`（280 行）逐字搬来：字段清单、`visibleWhen` 的
 * 每一条条件、校验阈值、`dashboard.display` 的三元指标、`preview` 的行序、`isDangerous` 的判据
 * 全部原样，一处逻辑都没改。
 *
 * 改动只有顶部那四条 import 的**说明符**（ADR-0002：本包不许依赖 `@xiranite/*`）：
 * `@xiranite/cli-runtime/interaction` → `./interaction-types.ts`，
 * `@xiranite/cli-runtime/i18n` → `./cli-i18n.ts`，`./core.js` / `./i18n.js` → `.ts` 后缀。
 *
 * 本仓的消费者要说清，别把"搬来了"读成"接上了"：
 * - `sleeptInputFromInteractionValues` 与 `SleeptInteractionAction` 是**已接**的：
 *   `packages/ui-host/src/nodes/sleept/Component.tsx:6` 就 value-import 它们，
 *   面板把卡片状态折成内核入参走的正是这一条（`buildInput`，同文件 596 行起）。
 * - `createSleeptInteractionSchema` 的读者是引导流（`runInteractionCli` / `runGuidedInteraction`，
 *   OpenTUI 与 @clack 两条腿）。那两条腿在本包是**响亮拒绝的未接面**（`src/cli.ts` 的
 *   `UNWIRED_TIMER_ACTIONS` 与 `interactiveBlockedReason`），而且它一进来就要
 *   `createSleeptTranslator`，那条工厂在本仓还是未接的（理由见 `./cli-i18n.ts` 的头注释）。
 *   所以这一份搬来是为了留可比对的另一半：词表、可见条件与"什么算危险"的判据
 *   （`isDangerous: action !== "get_stats" && !dryrun`，211 行）在这儿，不在谁的手抄笔记里。
 *
 * 逐字搬来的语义钉子（"顺手改一版更干净"会丢的就是这几枚）：
 * - 默认值是**这一份**的 `defaultSleeptInteractionValues`（`seconds: 5`、两个阈值都 `242`、
 *   `netDuration/cpuDuration: 2`、`cpuThreshold: 10`、`maxWaitSeconds: 3600`、`dryrun: true`），
 *   与 `./core.ts` 的 `defaultSleeptInput` 逐键相等但 `action` 不同（这里是 `countdown`，
 *   内核那边是 `status`）——两份不是一条真源，别合并。
 * - `defaults` 的覆盖只收 `!== undefined` 的键（62-64 行），不是 `{...base, ...defaults}` 的裸合并。
 * - `hours` 0..23、`minutes/seconds` 0..59、`netDuration/cpuDuration` 最小 0.5 步长 0.5、
 *   `cpuThreshold` 1..100、`maxWaitSeconds` 最小 0（0 = 无限，107 行的可见条件含 netspeed 与 cpu）。
 * - `sleeptInputFromInteractionValues` 对 `get_stats` **短路**返回 `{ action }`（223 行），
 *   其余动作才逐字段折；`netTriggerMode` 只认 `"any"`，其它一律 `"both"`；`dryrun` 是
 *   `values.dryrun !== false`（缺省当演练），`asNumber` 的兜底是**每个字段自己的**默认值。
 * - `validate` 只在 `countdown`（时长必须 > 0）与 `specific_time`（目标时间必须解得开且在将来）
 *   两条上说话，其它动作返回 null。
 *
 * @module xaihi-sleept/interaction
 */

import type {
  InteractionField,
  InteractionValue,
  InteractionValues,
  TerminalInteractionSchema,
} from "./interaction-types.ts"
import type { TerminalLanguage } from "./cli-i18n.ts"

import {
  countdownSeconds,
  formatDuration,
  parseTargetDatetime,
  type NetTriggerMode,
  type PowerMode,
  type SleeptInput,
  type SleeptResult,
} from "./core.ts"
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
      options: [
        { value: "sleep", label: t("powerSleep") },
        { value: "hibernate", label: t("powerHibernate") },
        { value: "shutdown", label: t("powerOff") },
        { value: "restart", label: t("powerReboot") },
      ],
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
  return value === "hibernate" || value === "shutdown" || value === "restart" ? value : "sleep"
}

type Translator = ReturnType<typeof createSleeptTranslator>

function actionLabel(action: SleeptInteractionAction, t: Translator): string {
  if (action === "specific_time") return t("timerAt")
  if (action === "netspeed") return t("timerNet")
  if (action === "cpu") return t("timerCpu")
  if (action === "get_stats") return t("statusAction")
  return t("timerCountdown")
}

function powerLabel(mode: PowerMode, t: Translator): string {
  if (mode === "hibernate") return t("powerHibernate")
  if (mode === "shutdown") return t("powerOff")
  if (mode === "restart") return t("powerReboot")
  return t("powerSleep")
}
