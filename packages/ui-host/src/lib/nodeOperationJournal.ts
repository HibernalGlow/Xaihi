/**
 * Tracked node-operation journal — the pure state machine behind every operation view.
 *
 * Two projections read the same journal: the Xiranite shell's `src/store/nodeOperations.ts` (the global
 * operation monitor) and the node layer's `src/nodes/shared/nodeOperationStore.ts` (a node's own task view).
 * The reducers live here so those two can never disagree about event cursors or FIFO truncation.
 *
 * 跟踪 node 运行操作（CLI 调用、进度事件、结果）：
 * 1. 后端创建一条 operation 记录，回传 NodeOperationDTO → upsertOperation
 * 2. 后端流式推送 NodeRunEventDTO（log/progress/output 等） → appendEvent
 * 3. 操作结束时回传 NodeRunResultDTO → finishOperation
 *
 * 为防止内存膨胀，采用两个上限：
 * - MAX_TRACKED_OPERATIONS：保留最近 30 次操作
 * - MAX_EVENTS_PER_OPERATION：每次操作只保留最近 80 条事件
 *
 * 失败前置（failBeforeStart）用于后端尚未启动就检测到错误（例如参数校验失败），
 * 此时直接在前端合成一条 error 操作，避免 UI 卡在"等待中"状态。
 */
import { create } from "zustand"
import { devtools } from "zustand/middleware"
import type { NodeOperationDTO, NodeOperationPhaseDTO, NodeRunEventDTO, NodeRunResultDTO } from "@xiranite/shared"

/** 最多保留多少条历史操作（FIFO 截断）。 */
const MAX_TRACKED_OPERATIONS = 30
/** 单次操作最多保留多少条事件日志（保留尾部，丢弃头部旧事件）。 */
const MAX_EVENTS_PER_OPERATION = 80

/**
 * 前端跟踪态：在后端 DTO 基础上补充 events 数组、lastMessage、lastProgress
 * 等运行时派生字段，方便 UI 直接渲染而无需重新计算。
 */
export interface TrackedNodeOperation<TData = unknown> {
  operationId: string
  nodeId: string
  componentId?: string
  workspaceId?: string
  phase: NodeOperationPhaseDTO
  createdAt: number
  updatedAt: number
  startedAt?: number
  cancelledAt?: number
  finishedAt?: number
  /** 累计事件总数（即使被截断也保留真实计数，方便 UI 显示"共 N 条"）。 */
  eventCount: number
  /** Next backend event index that the client needs to request. This is separate
   * from eventCount, which is the backend's cumulative count. */
  nextEventIndex: number
  result?: NodeRunResultDTO<TData>
  /** 事件日志缓冲（最多保留 MAX_EVENTS_PER_OPERATION 条）。 */
  events: NodeRunEventDTO[]
  lastMessage?: string
  lastProgress?: number
}

/**
 * The journal feed published by `src/lib/nodeOperationTransport.ts`. It mirrors the `/operations` stream
 * envelope (`operation` / `event` / `result`) plus the one client-side case the backend cannot report: a
 * start that failed before an operation existed.
 */
export type NodeOperationUpdate =
  | { type: "operation"; operation: NodeOperationDTO }
  | { type: "event"; operationId: string; index?: number; event: NodeRunEventDTO }
  | { type: "result"; operation: NodeOperationDTO; result: NodeRunResultDTO }
  | { type: "start-failure"; nodeId: string; message: string }

export interface NodeOperationJournalState {
  operations: TrackedNodeOperation[]
  upsertOperation: (operation: NodeOperationDTO) => void
  appendEvent: (operationId: string, index: number | undefined, event: NodeRunEventDTO) => void
  finishOperation: (operation: NodeOperationDTO, result: NodeRunResultDTO) => void
  failBeforeStart: (nodeId: string, message: string) => void
  applyUpdate: (update: NodeOperationUpdate) => void
  clearTerminal: () => void
  removeOperation: (operationId: string) => void
  reset: () => void
}

export type NodeOperationJournalStore = ReturnType<typeof createNodeOperationJournalStore>

/**
 * Creates one journal projection. `name` is the devtools label, which distinguishes the shell's monitor copy
 * from a node UI's own copy while both run in the same WebView.
 */
export function createNodeOperationJournalStore(options: { name: string }) {
  return create<NodeOperationJournalState>()(
    devtools(
      (set) => ({
        operations: [],
        upsertOperation: (operation) => {
          set((state) => ({ operations: upsertTrackedOperation(state.operations, operation) }), false, `${options.name}/upsert`)
        },
        appendEvent: (operationId, index, event) => {
          set((state) => ({ operations: appendTrackedEvent(state.operations, operationId, index, event) }), false, `${options.name}/event`)
        },
        finishOperation: (operation, result) => {
          set((state) => ({ operations: finishTrackedOperation(state.operations, operation, result) }), false, `${options.name}/finish`)
        },
        failBeforeStart: (nodeId, message) => {
          set((state) => ({ operations: addSyntheticFailure(state.operations, nodeId, message) }), false, `${options.name}/failBeforeStart`)
        },
        applyUpdate: (update) => applyNodeOperationUpdate(set, update),
        clearTerminal: () => {
          set((state) => ({ operations: state.operations.filter((operation) => !isTerminalPhase(operation.phase)) }), false, `${options.name}/clearTerminal`)
        },
        removeOperation: (operationId) => {
          set((state) => ({ operations: state.operations.filter((operation) => operation.operationId !== operationId) }), false, `${options.name}/remove`)
        },
        reset: () => {
          set({ operations: [] }, false, `${options.name}/reset`)
        },
      }),
      { name: options.name },
    ),
  )
}

/** Maps a transport update onto the journal mutations; shared so every projection stays equivalent. */
export function applyNodeOperationUpdate(
  set: (updater: (state: NodeOperationJournalState) => Partial<NodeOperationJournalState>) => void,
  update: NodeOperationUpdate,
): void {
  switch (update.type) {
    case "operation":
      set((state) => ({ operations: upsertTrackedOperation(state.operations, update.operation) }))
      return
    case "event":
      set((state) => ({ operations: appendTrackedEvent(state.operations, update.operationId, update.index, update.event) }))
      return
    case "result":
      set((state) => ({ operations: finishTrackedOperation(state.operations, update.operation, update.result) }))
      return
    case "start-failure":
      set((state) => ({ operations: addSyntheticFailure(state.operations, update.nodeId, update.message) }))
      return
  }
}

/** 返回非终态（仍在运行）的操作数，用于 UI 角标显示。 */
export function activeNodeOperationCount(operations: TrackedNodeOperation[]): number {
  return operations.filter((operation) => !isTerminalPhase(operation.phase)).length
}

/** 判断 phase 是否为终态（completed/error/cancelled 三态之一）。 */
export function isTerminalPhase(phase: NodeOperationPhaseDTO): boolean {
  return phase === "completed" || phase === "error" || phase === "cancelled"
}

/**
 * 插入或更新一条操作记录。
 *
 * 已存在的 operationId 会合并字段（保留已有 events 与 lastProgress），
 * 新增的 operationId 会插入到数组头部（最新的在前），随后执行 FIFO 截断。
 */
export function upsertTrackedOperation(operations: TrackedNodeOperation[], operation: NodeOperationDTO): TrackedNodeOperation[] {
  const existing = operations.find((item) => item.operationId === operation.operationId)
  const next: TrackedNodeOperation = {
    ...existing,
    ...operation,
    events: existing?.events ?? [],
    nextEventIndex: existing?.nextEventIndex ?? 0,
    lastMessage: existing?.lastMessage ?? operation.result?.message,
    lastProgress: existing?.lastProgress,
  }
  return trimOperations([next, ...operations.filter((item) => item.operationId !== operation.operationId)])
}

/**
 * 向指定 operation 追加一条事件。
 *
 * - events 数组超过上限时丢弃头部旧事件
 * - eventCount 取 max(原值, index+1)：index 来自后端流式事件序号，能更准确
 *   地反映真实事件总数（即使前端已丢弃部分事件）
 * - progress 类型事件会刷新 lastProgress；其他类型保留旧值
 */
export function appendTrackedEvent(
  operations: TrackedNodeOperation[],
  operationId: string,
  index: number | undefined,
  event: NodeRunEventDTO,
): TrackedNodeOperation[] {
  return operations.map((operation) => {
    if (operation.operationId !== operationId) return operation
    if (index !== undefined && index < operation.nextEventIndex) return operation
    const events = [...operation.events, event].slice(-MAX_EVENTS_PER_OPERATION)
    return {
      ...operation,
      updatedAt: Date.now(),
      eventCount: Math.max(operation.eventCount, (index ?? operation.eventCount) + 1),
      nextEventIndex: Math.max(operation.nextEventIndex, (index ?? operation.nextEventIndex) + 1),
      events,
      lastMessage: event.message,
      lastProgress: event.type === "progress" ? event.progress : operation.lastProgress,
    }
  })
}

/**
 * 终结一条操作：先 upsert 最新 operation 字段，再附加 result。
 *
 * 成功时 lastProgress 强制设为 100，失败时保留原有进度（避免视觉回退）。
 */
export function finishTrackedOperation(
  operations: TrackedNodeOperation[],
  operation: NodeOperationDTO,
  result: NodeRunResultDTO,
): TrackedNodeOperation[] {
  const withOperation = upsertTrackedOperation(operations, operation)
  return withOperation.map((item) => {
    if (item.operationId !== operation.operationId) return item
    return {
      ...item,
      ...operation,
      result,
      lastMessage: result.message,
      lastProgress: result.success ? 100 : item.lastProgress,
    }
  })
}

/**
 * 合成一条"启动前失败"的操作记录。
 *
 * 用于后端尚未真正创建 operation 就在前端检测到错误（例如必填参数缺失、
 * 工作区无可用 node 等）。operationId 使用时间戳 + 随机串，避免与后端
 * 真实 id 冲突。
 */
export function addSyntheticFailure(operations: TrackedNodeOperation[], nodeId: string, message: string): TrackedNodeOperation[] {
  const now = Date.now()
  const operation: TrackedNodeOperation = {
    operationId: `local-failure-${now.toString(36)}-${Math.random().toString(36).slice(2)}`,
    nodeId,
    phase: "error",
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
    eventCount: 1,
    nextEventIndex: 1,
    events: [{ type: "log", message }],
    result: { success: false, message },
    lastMessage: message,
  }
  return trimOperations([operation, ...operations])
}

/** FIFO 截断到 MAX_TRACKED_OPERATIONS 条。 */
function trimOperations(operations: TrackedNodeOperation[]): TrackedNodeOperation[] {
  return operations.slice(0, MAX_TRACKED_OPERATIONS)
}
