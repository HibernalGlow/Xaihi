/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 logx 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线
 * `.scratch/xiranite-noxide/packages/shared/src/index.ts` 的
 * `nodeRunEventSchema`（第 91 行）/ `nodeRunResultSchema`（第 100 行）与
 * `NodeRunResultDTO`（第 370 行）——`packages/contract/src/index.ts:1` 把它们别名成
 * `NodeRunEvent` / `NodeRunResult`，而 logx 的 `core.ts` 就是按这两个别名写的。
 * 照抄（与 `plugins/dissolvef/src/contract.ts` 同一件事）是为了让 `core.ts` 逐字移植，
 * 保真度由它自带的测试守住，而不是靠重写。
 *
 * 与 Xaihi 自己的 operation stream 的关系：这里的 `progress` / `log` 事件是**内核**
 * 往上吐进度的方式，`defineNode` 那侧再由 `call.run.progress()` 把它接到事件流上
 * （`packages/core/src/operations.ts`，判据见 `docs/service-mapping.md`「搬」那一节）。
 *
 * @module xaihi-logx/contract
 */

/** 内核吐出的过程事件。 */
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
