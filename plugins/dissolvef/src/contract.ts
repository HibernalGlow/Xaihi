/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 dissolvef 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线
 * `.scratch/xiranite-baseline/packages/shared/src/index.ts` 的
 * `nodeRunEventSchema` / `nodeRunResultSchema`（`packages/contract/src/index.ts:1`
 * 把它们别名成 `NodeRunEvent` / `NodeRunResult`），这样 `core.ts` 能逐字移植，
 * 保真度由它自带的 7 组测试守住，而不是靠我重写。
 *
 * 与 Xaihi 自己的 operation stream 的关系：这里的 `progress` / `log` 事件是**内核**
 * 往上吐进度的方式，`defineNode` 那侧再由 `call.run.progress()` 把它接到事件流上。
 *
 * @module xaihi-dissolvef/contract
 */

/** 内核吐出的过程事件。`progress` 是 0..1 的比例，缺省表示只有一句话。 */
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
