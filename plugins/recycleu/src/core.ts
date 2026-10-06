import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type RecycleuAction = "status" | "clean_now" | "start"
export type RecycleuTimerStatus = "idle" | "running" | "completed" | "cancelled" | "error"
export type RecycleBinStatus = "cleaned" | "empty" | "unsupported" | "failed"

export interface RecycleuInput {
  action?: RecycleuAction
  interval?: number
  maxCycles?: number
  driveLetter?: string
}

export interface EmptyRecycleBinResult {
  status: RecycleBinStatus
  message: string
}

export interface RecycleuRuntime {
  now: () => Date
  sleep: (milliseconds: number) => Promise<void>
  emptyRecycleBin: (driveLetter?: string) => Promise<EmptyRecycleBinResult>
  isCancelled?: () => boolean
  waitWhilePaused?: () => Promise<void>
}

export interface RecycleuState {
  timerStatus: RecycleuTimerStatus
  cleanCount: number
  lastCleanTime: string | null
}

export interface RecycleuData extends RecycleuState {
  remainingSeconds: number
}

export type RecycleuResult = NodeRunResult<RecycleuData>

export const DEFAULT_RECYCLEU_STATE: RecycleuState = {
  timerStatus: "idle",
  cleanCount: 0,
  lastCleanTime: null,
}

export function normalizeRecycleuInput(input: RecycleuInput): Required<RecycleuInput> {
  return {
    action: input.action ?? "status",
    interval: Math.max(1, Math.trunc(input.interval ?? 10)),
    maxCycles: Math.max(0, Math.trunc(input.maxCycles ?? 360)),
    driveLetter: normalizeDriveLetter(input.driveLetter),
  }
}

export function normalizeDriveLetter(value?: string): string {
  const trimmed = value?.trim() ?? ""
  const match = trimmed.match(/^([a-zA-Z])(?::)?$/)
  // 同一条正则、同一个结果，只是写成类型说得出的话：本仓 `tsconfig.base` 开了
  // `noUncheckedIndexedAccess`，`match[1]` 在类型上是 `string | undefined`（这条正则的
  // 捕获组 1 命中时必然存在），所以用可选链 + `?? ""` 与上游那句等价。
  return match?.[1]?.toUpperCase() ?? ""
}

export function formatClock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export async function runRecycleu(
  input: RecycleuInput,
  runtime: RecycleuRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
  initialState: RecycleuState = DEFAULT_RECYCLEU_STATE,
): Promise<RecycleuResult> {
  const normalized = normalizeRecycleuInput(input)
  const state: RecycleuState = { ...initialState }

  if (normalized.action === "status") {
    return {
      success: true,
      message: "Recycle cleaner is idle.",
      data: { ...state, remainingSeconds: 0 },
    }
  }

  if (normalized.action === "clean_now") {
    return cleanOnce(runtime, state, onEvent, normalized.driveLetter)
  }

  if (normalized.interval < 5) {
    return {
      success: false,
      message: "Clean interval cannot be less than 5 seconds.",
      data: { ...state, timerStatus: "error", remainingSeconds: 0 },
    }
  }

  state.timerStatus = "running"
  const unlimited = normalized.maxCycles === 0
  onEvent({
    type: "log",
    message: unlimited
      ? `Start auto-clean, interval ${normalized.interval}s, unlimited cycles until cancelled.`
      : `Start auto-clean, interval ${normalized.interval}s, ${normalized.maxCycles} cycle(s).`,
  })

  for (let cycle = 0; unlimited || cycle < normalized.maxCycles; cycle += 1) {
    await runtime.waitWhilePaused?.()
    if (runtime.isCancelled?.()) return cancelledResult(state, onEvent, normalized.interval)

    const cleanResult = await cleanOnce(runtime, state, onEvent, normalized.driveLetter, false)
    if (!cleanResult.success) {
      return cleanResult
    }

    for (let remaining = normalized.interval; remaining > 0; remaining -= 1) {
      await runtime.waitWhilePaused?.()
      if (runtime.isCancelled?.()) return cancelledResult(state, onEvent, remaining)
      const cycleProgress = (normalized.interval - remaining) / normalized.interval
      const progress = unlimited
        ? Math.min(99, Math.round(cycleProgress * 100))
        : Math.min(99, Math.round(((cycle + cycleProgress) / normalized.maxCycles) * 100))
      onEvent({
        type: "progress",
        progress,
        message: unlimited
          ? `cleaned ${state.cleanCount} time(s), unlimited mode, next clean in ${remaining}s`
          : `cleaned ${state.cleanCount} time(s), next clean in ${remaining}s`,
      })
      await runtime.sleep(1000)
    }
  }

  state.timerStatus = "completed"
  onEvent({ type: "progress", progress: 100, message: "Auto-clean completed." })

  return {
    success: true,
    message: `Auto-clean completed, cleaned ${state.cleanCount} time(s).`,
    data: { ...state, remainingSeconds: 0 },
  }
}

function cancelledResult(
  state: RecycleuState,
  onEvent: (event: NodeRunEvent) => void,
  remainingSeconds: number,
): RecycleuResult {
  state.timerStatus = "cancelled"
  const message = `Auto-clean cancelled after ${state.cleanCount} clean(s).`
  onEvent({ type: "log", message })
  return {
    success: false,
    message,
    data: { ...state, remainingSeconds },
  }
}

async function cleanOnce(
  runtime: RecycleuRuntime,
  state: RecycleuState,
  onEvent: (event: NodeRunEvent) => void,
  driveLetter: string,
  setIdle = true,
): Promise<RecycleuResult> {
  const result = await runtime.emptyRecycleBin(driveLetter || undefined)
  const success = result.status === "cleaned" || result.status === "empty"

  if (result.status === "cleaned") {
    state.cleanCount += 1
    state.lastCleanTime = formatClock(runtime.now())
  }

  if (setIdle) {
    state.timerStatus = success ? "idle" : "error"
  }

  onEvent({ type: success ? "log" : "progress", progress: success ? undefined : 100, message: result.message })

  return {
    success,
    message: result.message,
    data: { ...state, remainingSeconds: 0 },
  }
}
