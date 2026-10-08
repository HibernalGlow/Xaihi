/**
 * findz 的**纯调度内核**，从 Xiranite 基线 tag `noxide`（提交 `ccf465fe`）的
 * `packages/nodes/findz/src/core.ts` 逐字搬来。它不认识宿主、不认识 FFI、不认识
 * 进程：每个动作都只是"把 `FindzInput` 变成一个对 gateway 的方法调用"。
 *
 * 移植改动只有三处（见 `docs/stages/step-4.md` 批次 D 与 `README.md`）：
 *   a. `@xiranite/contract` 的两个类型 → `./contract.js`；
 *   b. `@xiranite/findz-native` 的类型 → `./contract.js`；
 *   c. 删掉 `runFindz`（它绑死了进程内 `Worker`）——宿主形态只保留
 *      `runFindzWithGateway` 这条依赖注入缝，由 `gateway.ts` 提供实现。
 *
 * 保真度由基线自带的 `tests/core.spec.ts` 守，不由重写者重述。
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.js"
import type {
  FindzApiInfo,
  FindzAnalysisScope,
  FindzArchiveQuery,
  FindzArchiveRow,
  FindzLibraryOpenParams,
  FindzLibrarySummary,
  FindzMemberRow,
  FindzPagedResult,
  FindzTask,
  FindzTreemapNode,
} from "./contract.js"
import type { FindzWorkerGateway, FindzWorkerMethod } from "./worker-protocol.js"

export type FindzAction =
  | "api_info"
  | "open_library"
  | "close_library"
  | "scan"
  | "analyze"
  | "query_archives"
  | "query_members"
  | "export_rows"
  | "treemap"
  | "task"
  | "pause"
  | "resume"
  | "cancel"

export interface FindzInput {
  action?: FindzAction
  library?: FindzLibraryOpenParams
  libraryId?: string
  taskId?: string
  archiveId?: number
  text?: string
  pathPrefix?: string
  areaBy?: string
  query?: Omit<FindzArchiveQuery, "libraryId">
  analysisScope?: FindzAnalysisScope
}

export interface FindzData {
  action: FindzAction
  apiInfo?: FindzApiInfo
  library?: FindzLibrarySummary
  task?: FindzTask
  archives?: FindzPagedResult<FindzArchiveRow>
  members?: FindzPagedResult<FindzMemberRow>
  treemap?: FindzTreemapNode
}

export type FindzResult = NodeRunResult<FindzData>

export async function runFindzWithGateway(input: FindzInput, gateway: FindzWorkerGateway, onEvent?: (event: NodeRunEvent) => void): Promise<FindzResult> {
  const action = input.action ?? "query_archives"
  try {
    onEvent?.({ type: "progress", progress: 0, message: actionMessage(action, "Starting") })
    const data = await dispatchFindzAction(action, input, gateway)
    onEvent?.({ type: "progress", progress: 100, message: actionMessage(action, "Queued") })
    return { success: true, message: actionMessage(action, "Findz"), data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onEvent?.({ type: "log", message })
    return { success: false, message, data: { action } }
  }
}

async function dispatchFindzAction(action: FindzAction, input: FindzInput, gateway: FindzWorkerGateway): Promise<FindzData> {
  switch (action) {
    case "api_info":
      return { action, apiInfo: await gateway.call<FindzApiInfo>("api.info", {}) }
    case "open_library": {
      if (!input.library?.root) throw new Error("A Findz library root is required.")
      return { action, library: await gateway.call<FindzLibrarySummary>("library.open", input.library) }
    }
    case "close_library":
      const libraryId = requiredString(input.libraryId, "libraryId")
      await gateway.call<void>("library.close", { libraryId })
      return { action }
    case "scan": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, task: await gateway.call<FindzTask>("scan.start", { libraryId }) }
    }
    case "analyze": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, task: await gateway.call<FindzTask>("analysis.start", { libraryId, scope: input.analysisScope ?? { kind: "all" } }) }
    }
    case "query_archives": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, archives: await gateway.call("query.archives", { libraryId, text: input.text, ...input.query, ...(input.pathPrefix ? { pathPrefix: input.pathPrefix } : {}) }) }
    }
    case "export_rows": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, archives: await gateway.call("export.rows", { libraryId, text: input.text, ...input.query, ...(input.pathPrefix ? { pathPrefix: input.pathPrefix } : {}) }) }
    }
    case "query_members": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, members: await gateway.call("query.members", { libraryId, archiveId: requiredNumber(input.archiveId, "archiveId"), text: input.text, page: input.query?.page }) }
    }
    case "treemap": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, treemap: await gateway.call("projection.treemap", { libraryId, text: input.text, rules: input.query?.rules, areaBy: input.areaBy, ...(input.pathPrefix ? { pathPrefix: input.pathPrefix } : {}) }) }
    }
    case "task": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, task: await gateway.call<FindzTask>("task.get", taskParams(input, libraryId)) }
    }
    case "pause": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, task: await gateway.call<FindzTask>("task.pause", taskParams(input, libraryId)) }
    }
    case "resume": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, task: await gateway.call<FindzTask>("task.resume", taskParams(input, libraryId)) }
    }
    case "cancel": {
      const libraryId = requiredString(input.libraryId, "libraryId")
      return { action, task: await gateway.call<FindzTask>("task.cancel", taskParams(input, libraryId)) }
    }
  }
  return assertNever(action)
}

function taskParams(input: FindzInput, libraryId: string) {
  return { libraryId, taskId: requiredString(input.taskId, "taskId") }
}

function requiredString(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Findz ${label} is required.`)
  return value
}

function requiredNumber(value: number | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`Findz ${label} is required.`)
  return value
}

function actionMessage(action: FindzAction, prefix: string): string {
  const labels: Record<FindzAction, string> = {
    api_info: "native capability check",
    open_library: "library open",
    close_library: "library close",
    scan: "ZIP scan",
    analyze: "image analysis",
    query_archives: "archive query",
    query_members: "member query",
    export_rows: "archive export",
    treemap: "treemap projection",
    task: "task status",
    pause: "task pause",
    resume: "task resume",
    cancel: "task cancel",
  }
  return `${prefix}: ${labels[action]}.`
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Findz action: ${value}`)
}

export type { FindzWorkerGateway, FindzWorkerMethod }
