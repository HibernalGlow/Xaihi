/**
 * sleept 的定时器内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/sleept/src/core.ts`
 * （350 行）逐字搬来：类型、函数顺序、判据、消息文案全部原样，**一处逻辑都没改**。
 * 六个触发器/读数动作（`status` / `countdown` / `specific_time` / `netspeed` / `cpu` /
 * `get_stats`）都在这份文件里，落地动作一律从 `SleeptRuntime` 那 5+2 个方法注入，
 * **这份文件本身零 I/O**（与 `plugins/timeu/src/core.ts` 同一个设计）。
 *
 * 两处偏离基线的地方，都写在明处（第二条不是类型层的让步，判据见 `docs/stages/sleept-core-close.md`）：
 *
 * 1. **import 说明符**：第 2 行 `@xiranite/contract` 的两个类型换成本包的 `./contract.ts`
 *    垫片（ADR-0002：装进 profile 的包必须自足，`scripts/check-installable.mjs`）。
 *    `.js` 后缀同理换 `.ts`。这属于 `scripts/check-verbatim.mjs` 允许的第一类。
 * 2. **`countdownSeconds` 与 `formatDuration` 住在 `./duration.ts`**，这里只 import + 再导出。
 *    分出去的理由是消费者已经钉死：`packages/ui-host/src/nodes/sleept/Component.tsx:5` 用
 *    **value-import** 取这两条纯函数，指到本文件就会把 `runSleept` 整只执行宿主拖进浏览器产物，
 *    而 ADR-0007 决定 4 禁的就是"面里能跑节点逻辑"。两条函数体逐字来自基线第 116-126 行。
 *    **`node scripts/check-verbatim.mjs --only sleept` 因此对 `plugins/sleept/src/core.ts` 报红**，
 *    红得对：那把尺只放行 import 说明符、`| undefined` 与注释三类偏差，这一条不在里面，
 *    所以要在这里点名并等使用者裁决，而不是去改尺。
 *
 * `| undefined` 那一处是本仓 `exactOptionalPropertyTypes` 的让步（上游 `tsconfig.app.json` 没开）：
 * `defaultSleeptInput` 的声明里 `targetDatetime` 要写成 `string | undefined`，否则基线第 56 行那句
 * `targetDatetime: undefined` 编译不过。值一个都没动。
 *
 * 与 `src/platform.ts` / `src/index.ts` 的关系要说清，别把两份 `SleeptAction` 当成同一件事：
 * 本文件的 `SleeptAction` 是**上游定时器**那六个动作；`src/platform.ts` 的 `SleeptAction` 是
 * **本仓电源节点**那六个动作（真源 `package.json#xaihi.node`）。两者同名不同集，本文件不与它们互引。
 *
 * @module xaihi-sleept/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"
import { countdownSeconds, formatDuration } from "./duration.ts"

export type SleeptAction = "status" | "countdown" | "specific_time" | "netspeed" | "cpu" | "get_stats"
// PowerMode 的真源在 `./schedule.ts`（上游 HEAD 把词表升成 6 值并让三个面都从常量派生，
// 本仓旧基线的 4 值手写定义随之作废——`display-sleep` / `screensaver` 从此是合法取值）。
// 这里既本地使用（SleeptInput / SleeptRuntime）也再导出，维持 `./core.ts` 消费面一行不改。
import { parseTargetDatetime, type PowerMode } from "./schedule.ts"
export { POWER_MODE_VALUES, parseTargetDatetime, type PowerMode } from "./schedule.ts"
export type NetTriggerMode = "both" | "any"

export interface SleeptInput {
  action?: SleeptAction
  powerMode?: PowerMode
  hours?: number
  minutes?: number
  seconds?: number
  targetDatetime?: string
  uploadThreshold?: number
  downloadThreshold?: number
  netDuration?: number
  netTriggerMode?: NetTriggerMode
  cpuThreshold?: number
  cpuDuration?: number
  dryrun?: boolean
  maxWaitSeconds?: number
}

export interface SleeptData {
  timerStatus: "idle" | "running" | "completed" | "cancelled"
  remainingSeconds: number
  currentUpload: number
  currentDownload: number
  currentCpu: number
  targetTime?: string
}

export interface NetCounters {
  bytesSent: number
  bytesReceived: number
}

export interface SleeptRuntime {
  now: () => Date
  sleep: (milliseconds: number) => Promise<void>
  getCpuPercent: () => Promise<number> | number
  getNetCounters: () => Promise<NetCounters> | NetCounters
  executePowerAction: (mode: PowerMode, dryrun: boolean) => Promise<void> | void
  isCancelled?: () => boolean
  waitWhilePaused?: () => Promise<void>
}

export type SleeptResult = NodeRunResult<SleeptData>

export const defaultSleeptInput: Required<Omit<SleeptInput, "targetDatetime">> & { targetDatetime?: string | undefined } = {
  action: "status",
  powerMode: "sleep",
  hours: 0,
  minutes: 0,
  seconds: 5,
  targetDatetime: undefined,
  uploadThreshold: 242,
  downloadThreshold: 242,
  netDuration: 2,
  netTriggerMode: "both",
  cpuThreshold: 10,
  cpuDuration: 2,
  dryrun: true,
  maxWaitSeconds: 3600,
}

export async function runSleept(
  rawInput: SleeptInput,
  runtime: SleeptRuntime,
  onEvent?: (event: NodeRunEvent) => void,
): Promise<SleeptResult> {
  const input = normalizeInput(rawInput)

  if (input.action === "status") {
    return statusResult(await runtime.getCpuPercent())
  }

  if (input.action === "get_stats") {
    return getStats(runtime)
  }

  if (input.action === "countdown") {
    return runCountdown(input, runtime, onEvent)
  }

  if (input.action === "specific_time") {
    return runSpecificTime(input, runtime, onEvent)
  }

  if (input.action === "netspeed") {
    return runNetSpeedMonitor(input, runtime, onEvent)
  }

  if (input.action === "cpu") {
    return runCpuMonitor(input, runtime, onEvent)
  }

  return {
    success: false,
    message: `Unknown action: ${input.action}`,
    data: idleData(),
  }
}

export function normalizeInput(raw: SleeptInput): Required<SleeptInput> {
  return {
    ...defaultSleeptInput,
    ...raw,
    action: raw.action ?? defaultSleeptInput.action,
    powerMode: raw.powerMode ?? defaultSleeptInput.powerMode,
    targetDatetime: raw.targetDatetime ?? "",
    maxWaitSeconds: Math.max(0, Math.trunc(raw.maxWaitSeconds ?? defaultSleeptInput.maxWaitSeconds)),
  }
}

// 这两条的定义在 `./duration.ts`（理由见那个文件的头注释与本文件顶部第 2 条偏离）。
// 这里既要**用**得到它们（`runCountdown` 与 `tickCountdown`），也要**再导出**一次，
// 好让基线里从 `./core.js` 取这两条的消费者一行都不用改。
export { countdownSeconds, formatDuration }

// parseTargetDatetime 的定义已迁至 `./schedule.ts`（与上游 HEAD 同形；本仓旧副本逐字相同，删重复）。

async function runCountdown(
  input: Required<SleeptInput>,
  runtime: SleeptRuntime,
  onEvent?: (event: NodeRunEvent) => void,
): Promise<SleeptResult> {
  const totalSeconds = countdownSeconds(input)
  if (totalSeconds <= 0) {
    return { success: false, message: "Countdown duration must be greater than zero.", data: idleData() }
  }

  const target = new Date(runtime.now().getTime() + totalSeconds * 1000)
  if (!await tickCountdown(totalSeconds, runtime, onEvent)) {
    return countdownCancelled("Countdown")
  }
  await runtime.executePowerAction(input.powerMode, input.dryrun)

  return {
    success: true,
    message: input.dryrun ? `[dryrun] Countdown completed; simulated ${input.powerMode}.` : `Countdown completed; executed ${input.powerMode}.`,
    data: {
      ...idleData(),
      timerStatus: "completed",
      targetTime: formatDatetime(target),
    },
  }
}

async function runSpecificTime(
  input: Required<SleeptInput>,
  runtime: SleeptRuntime,
  onEvent?: (event: NodeRunEvent) => void,
): Promise<SleeptResult> {
  const target = parseTargetDatetime(input.targetDatetime, runtime.now())
  const totalSeconds = Math.ceil((target.getTime() - runtime.now().getTime()) / 1000)
  if (!await tickCountdown(totalSeconds, runtime, onEvent)) {
    return countdownCancelled("Scheduled timer")
  }
  await runtime.executePowerAction(input.powerMode, input.dryrun)

  return {
    success: true,
    message: input.dryrun ? `[dryrun] Scheduled time reached; simulated ${input.powerMode}.` : `Scheduled time reached; executed ${input.powerMode}.`,
    data: {
      ...idleData(),
      timerStatus: "completed",
      targetTime: formatDatetime(target),
    },
  }
}

async function runNetSpeedMonitor(
  input: Required<SleeptInput>,
  runtime: SleeptRuntime,
  onEvent?: (event: NodeRunEvent) => void,
): Promise<SleeptResult> {
  const durationSeconds = Math.max(1, input.netDuration * 60)
  let last = await runtime.getNetCounters()
  let lastTime = runtime.now().getTime()
  let lowStart: number | null = null

  for (let elapsedTotal = 0; input.maxWaitSeconds === 0 || elapsedTotal < input.maxWaitSeconds; elapsedTotal += 1) {
    await runtime.waitWhilePaused?.()
    if (runtime.isCancelled?.()) return monitorCancelled("Network")
    await runtime.sleep(1000)
    if (runtime.isCancelled?.()) return monitorCancelled("Network")
    const nowCounters = await runtime.getNetCounters()
    const nowTime = runtime.now().getTime()
    const intervalSeconds = Math.max(0.001, (nowTime - lastTime) / 1000)
    const upload = (nowCounters.bytesSent - last.bytesSent) / intervalSeconds / 1024
    const download = (nowCounters.bytesReceived - last.bytesReceived) / intervalSeconds / 1024
    const lowUp = upload < input.uploadThreshold
    const lowDown = download < input.downloadThreshold
    const triggered = input.netTriggerMode === "both" ? lowUp && lowDown : lowUp || lowDown

    if (triggered) {
      lowStart ??= nowTime
      const elapsed = (nowTime - lowStart) / 1000
      const progress = Math.min(99, Math.floor((elapsed / durationSeconds) * 100))
      onEvent?.({ type: "progress", progress, message: `low network ${Math.floor(elapsed)}s/${Math.floor(durationSeconds)}s (up ${upload.toFixed(1)} down ${download.toFixed(1)} KB/s)` })

      if (elapsed >= durationSeconds) {
        await runtime.executePowerAction(input.powerMode, input.dryrun)
        return {
          success: true,
          message: input.dryrun ? `[dryrun] Network monitor triggered; simulated ${input.powerMode}.` : `Network monitor triggered; executed ${input.powerMode}.`,
          data: { ...idleData(), timerStatus: "completed", currentUpload: upload, currentDownload: download },
        }
      }
    } else {
      lowStart = null
      onEvent?.({ type: "progress", progress: 0, message: `monitoring network (up ${upload.toFixed(1)} down ${download.toFixed(1)} KB/s)` })
    }

    last = nowCounters
    lastTime = nowTime
  }

  return { success: false, message: "Network monitor timed out.", data: { ...idleData(), timerStatus: "cancelled" } }
}

async function runCpuMonitor(
  input: Required<SleeptInput>,
  runtime: SleeptRuntime,
  onEvent?: (event: NodeRunEvent) => void,
): Promise<SleeptResult> {
  const durationSeconds = Math.max(1, input.cpuDuration * 60)
  let lowStart: number | null = null

  for (let elapsedTotal = 0; input.maxWaitSeconds === 0 || elapsedTotal < input.maxWaitSeconds; elapsedTotal += 1) {
    await runtime.waitWhilePaused?.()
    if (runtime.isCancelled?.()) return monitorCancelled("CPU")
    await runtime.sleep(1000)
    if (runtime.isCancelled?.()) return monitorCancelled("CPU")
    const cpu = await runtime.getCpuPercent()
    const nowTime = runtime.now().getTime()

    if (cpu < input.cpuThreshold) {
      lowStart ??= nowTime
      const elapsed = (nowTime - lowStart) / 1000
      const progress = Math.min(99, Math.floor((elapsed / durationSeconds) * 100))
      onEvent?.({ type: "progress", progress, message: `low CPU ${cpu.toFixed(1)}% ${Math.floor(elapsed)}s/${Math.floor(durationSeconds)}s` })

      if (elapsed >= durationSeconds) {
        await runtime.executePowerAction(input.powerMode, input.dryrun)
        return {
          success: true,
          message: input.dryrun ? `[dryrun] CPU monitor triggered; simulated ${input.powerMode}.` : `CPU monitor triggered; executed ${input.powerMode}.`,
          data: { ...idleData(), timerStatus: "completed", currentCpu: cpu },
        }
      }
    } else {
      lowStart = null
      onEvent?.({ type: "progress", progress: 0, message: `monitoring CPU ${cpu.toFixed(1)}%` })
    }
  }

  return { success: false, message: "CPU monitor timed out.", data: { ...idleData(), timerStatus: "cancelled" } }
}

function monitorCancelled(kind: "Network" | "CPU"): SleeptResult {
  return {
    success: false,
    message: `${kind} monitor cancelled.`,
    data: { ...idleData(), timerStatus: "cancelled" },
  }
}

function countdownCancelled(kind: "Countdown" | "Scheduled timer"): SleeptResult {
  return {
    success: false,
    message: `${kind} cancelled.`,
    data: { ...idleData(), timerStatus: "cancelled" },
  }
}

async function tickCountdown(totalSeconds: number, runtime: SleeptRuntime, onEvent?: (event: NodeRunEvent) => void): Promise<boolean> {
  for (let remaining = totalSeconds; remaining > 0; remaining -= 1) {
    await runtime.waitWhilePaused?.()
    if (runtime.isCancelled?.()) return false
    const progress = Math.floor((1 - remaining / totalSeconds) * 100)
    onEvent?.({ type: "progress", progress, message: `remaining ${formatDuration(remaining)}` })
    await runtime.sleep(1000)
    if (runtime.isCancelled?.()) return false
  }
  onEvent?.({ type: "progress", progress: 100, message: "time reached" })
  return true
}

async function getStats(runtime: SleeptRuntime): Promise<SleeptResult> {
  const first = await runtime.getNetCounters()
  await runtime.sleep(500)
  const second = await runtime.getNetCounters()
  const cpu = await runtime.getCpuPercent()
  const upload = (second.bytesSent - first.bytesSent) / 0.5 / 1024
  const download = (second.bytesReceived - first.bytesReceived) / 0.5 / 1024

  return {
    success: true,
    message: `CPU: ${cpu.toFixed(1)}%, upload: ${upload.toFixed(1)}KB/s, download: ${download.toFixed(1)}KB/s`,
    data: { ...idleData(), currentCpu: cpu, currentUpload: upload, currentDownload: download },
  }
}

function statusResult(cpu: number): SleeptResult {
  return {
    success: true,
    message: "Status ready.",
    data: { ...idleData(), currentCpu: cpu },
  }
}

function idleData(): SleeptData {
  return {
    timerStatus: "idle",
    remainingSeconds: 0,
    currentUpload: 0,
    currentDownload: 0,
    currentCpu: 0,
  }
}

function formatDatetime(value: Date): string {
  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, "0")
  const dd = String(value.getDate()).padStart(2, "0")
  const hh = String(value.getHours()).padStart(2, "0")
  const mi = String(value.getMinutes()).padStart(2, "0")
  const ss = String(value.getSeconds()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}
