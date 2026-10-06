/**
 * 一次节点运行的事件词表 —— 「进度 / 预览 / 结果视图」三态的契约面。
 *
 * 为什么 Xaihi 有这件事而 DSH 没有：`@deepseek-ai/dsh-tools` 的工具有"一次调用的
 * output schema + 呈现意图"，`ctx.emit` 是通用事件缝；两者都没有"同一次运行的中间态
 * 流给面板订阅"。DSH 唯一的主机→浏览器推送通道（`ctx.remote.$on` 的转发集）是主机装配
 * 侧写死的白名单，第三方事件进不去（`docs/subsystems/typert.md` 与
 * `dsh-api-remotes` 的 `API_REMOTE_FORWARDED_EVENTS`），所以这里定义词表、由
 * xaihi-core 经自己的 `/xaihi` 路由搬运。
 *
 * 本模块只有类型与常量：生产者（core 的 journal）与消费者（面板）共用同一份词表，
 * 谁也不许自己再造一套事件名。
 *
 * @module xaihi-sdk/operations
 */

import type { LocalizedText } from './manifest.ts'

/** 事件流的契约版本，写进快照与流的握手帧；不认识的读取方必须拒绝而不是降级。 */
export const OPERATIONS_SCHEMA = 'xaihi.operations/1'

/** 挂在 `ctx` 上的服务名；由 xaihi-core 提供。 */
export const OPERATIONS_SERVICE = 'xaihiOperations'

/** 主机侧事件流路由。 */
export const OPERATIONS_STREAM_PATH = '/xaihi/operations/stream'

/** 主机侧快照路由（轮询兜底与诊断用）。 */
export const OPERATIONS_SNAPSHOT_PATH = '/xaihi/operations.json'

/**
 * 事件种类。`started` / `finished` / `failed` 由 `defineNode` 自动补，节点不必操心；
 * `progress` / `preview` / `result_view` 只有节点自己知道什么时候发。
 */
export const OPERATION_EVENT_KINDS = ['started', 'progress', 'preview', 'result_view', 'finished', 'failed'] as const

/** 事件种类。 */
export type OperationEventKind = (typeof OPERATION_EVENT_KINDS)[number]

/** 一次运行的结局。运行中的 `finishedAt` 缺失，不许用 0 假装。 */
export type OperationOutcome = 'running' | 'finished' | 'failed'

/**
 * `/xaihi/operations.json` 的响应体，也是 SSE 握手帧的内容。
 * 定义在契约里而不是 core 里：浏览器侧不许为了拿一个类型去 import Node 侧模块。
 */
export interface OperationsSnapshot {
  schema: typeof OPERATIONS_SCHEMA
  /** 已分配到的高水位。 */
  seq: OperationSeq
  /** 缓冲区里还在的最旧事件；`since` 比它小也只会拿到这一段。 */
  oldestSeq: OperationSeq
  /** 是否已经丢过更旧的事件。读取方据此区分"没有历史"与"历史被截断"。 */
  truncated: boolean
  kinds: readonly string[]
  runs: ActiveRun[]
}

/** 进度；`total` 未知时省略而不是写 0（0 会被读成"一秒就好"）。 */
export interface OperationProgress {
  done: number
  total?: number
  unit?: LocalizedText
  label?: LocalizedText
}

/** 事件序号，由 journal 赋值的单调递增整数。 */
export type OperationSeq = number

/** 一条已赋值的事件。 */
export interface OperationEvent {
  seq: OperationSeq
  runId: string
  nodeId: string
  actionId: string
  /** epoch ms。 */
  at: number
  kind: OperationEventKind
  progress?: OperationProgress
  /** `preview` / `result_view` 的载荷：形状由节点决定，壳只负责搬运与展示 JSON。 */
  payload?: unknown
  /** `failed` 的原因。 */
  message?: string
}

/** journal 赋值前的输入：`seq`/`at` 由主机决定，不接受外部注入。 */
export type OperationEventInput = Omit<OperationEvent, 'seq' | 'at'>

/** 一次运行的概要，快照与 SSE 握手帧都用它。 */
export interface ActiveRun {
  runId: string
  nodeId: string
  actionId: string
  startedAt: number
  finishedAt?: number
  outcome: OperationOutcome
  /** 该运行最后一条事件的 seq，重连时按它补齐。 */
  lastSeq: OperationSeq
  message?: string
}

/** 交给动作实现的操作句柄。 */
export interface OperationRun {
  runId: string
  /** 报一次进度；`done` 必须单调不减由调用方保证，这里不做二次加工。 */
  progress(progress: OperationProgress): void
  /** 中途预览（例如"这批将删除这些文件"）。 */
  preview(payload: unknown): void
  /** 结果视图：节点声明了 `resultExport` 时由它自己发。 */
  resultView(payload: unknown): void
}

/** 空句柄：没有 journal 时动作也要能跑，因此进度上报必须是无操作而不是抛。 */
export const NULL_RUN: OperationRun = {
  runId: 'none',
  progress() {},
  preview() {},
  resultView() {},
}

/** 节点侧看到的运行账本面（core 实现它）。 */
export interface OperationJournal {
  /** 开一次运行并拿到句柄；同时补一条 `started`。 */
  open(identity: { nodeId: string; actionId: string }): OperationRun
  /** 收尾一次成功的运行，补 `finished`。由 `defineNode` 调用，节点自己不该收口。 */
  finish(runId: string): void
  /** 收尾一次失败的运行，补 `failed` 并带上原因。 */
  fail(runId: string, message: string): void
  /** 订阅后续事件；返回取消订阅。 */
  subscribe(listener: (event: OperationEvent) => void): () => void
  /** `seq` 之后的事件，按序；更早的已被截断（core 的快照会说明截断与否）。 */
  since(seq: OperationSeq): OperationEvent[]
  /** 全部运行概要，新→旧。 */
  runs(): ActiveRun[]
  /** 当前已分配到的序号。 */
  seq(): OperationSeq
}
