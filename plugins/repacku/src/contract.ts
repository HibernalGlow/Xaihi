/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 repacku 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线
 * `.scratch/xiranite-noxide/packages/shared/src/index.ts` 的
 * `nodeRunEventSchema`（`:91-98`）与 `NodeRunResultDTO`（`:370-376`），它们在
 * `packages/contract/src/index.ts:1` 被别名成 `NodeRunEvent` / `NodeRunResult`，
 * 而 `packages/nodes/repacku/src/core.ts:1` 用的正是这两个别名——这样 `core.ts` 能逐字移植，
 * 保真度由它自带的测试守住，而不是靠重写。
 * 同一对垫片在 `plugins/dissolvef/src/contract.ts` 与 `plugins/migratef/src/contract.ts`
 * 已经落地，本包是第三份，形状一致。
 *
 * 与 Xaihi 自己的 operation stream 的关系：这里的 `progress` / `log` 事件是**内核**
 * 往上吐进度的方式（repacku 内核吐的是 0..100 的百分数，见 `core.ts` 里
 * `operationProgress` 那条夹取），`defineNode` 那侧再由 `call.run.progress()` 把它接到
 * 事件流上；`src/index.ts` 的 `forward` 按 `done / total = 100` 折，不许照抄 dissolvef
 * 那句 `* 100`（那份内核给的是 0..1）。
 *
 * @module xaihi-repacku/contract
 */

/** 内核吐出的过程事件。`progress` 是内核自己那一套百分数（repacku 是 10 / 20..99 / 100）。 */
export interface NodeRunEvent {
  type: 'progress' | 'log'
  progress?: number
  message: string
  /** 可选的结构化载荷：长任务用它带实时预览。 */
  data?: unknown
}

/** 一次运行的结局。`success` 与"有没有抛异常"是两件事，内核两条都用。 */
export interface NodeRunResult<TData = unknown> {
  success: boolean
  message: string
  data?: TData
  stats?: Record<string, number>
  outputPath?: string
}
