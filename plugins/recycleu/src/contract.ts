/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 recycleu 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线
 * `.scratch/xiranite-noxide/packages/shared/src/index.ts` 的
 * `nodeRunEventSchema`（第 91 行）与 `NodeRunResultDTO`（第 370 行，
 * `nodeRunResultSchema` 第 100 行是它的校验版）——`packages/contract/src/index.ts:1`
 * 把它们别名成 `NodeRunEvent` / `NodeRunResult`，`core.ts:1` 就是按这两个别名写的。
 * 与 `plugins/dissolvef/src/contract.ts` 同一件事：照抄才能让 `core.ts` 逐字移植，
 * 保真度由它自带的测试守住，而不是靠重写。
 *
 * 为什么这里要带 `progress: undefined` 这种写法：`core.ts` 的 `cleanOnce` 在成功时发
 * `{ type: "log", progress: undefined }`，上游 schema 的 `progress` 是 optional
 * （`packages/shared/src/index.ts:93` 的 `z.number().optional()`，推出来就是
 * `number | undefined`），所以"键在、值为 undefined"是合法事件，不是 bug——面板按 `type`
 * 分流时不许把它当成进度事件（见 `docs/service-mapping.md` 的 operation stream 一节）。
 * 本仓 tsconfig.base 开了 `exactOptionalPropertyTypes`，只写 `progress?: number` 会把上游
 * 那句合法事件判成类型错，所以这里按上游推出来的形状显式带上 `| undefined`。
 *
 * @module xaihi-recycleu/contract
 */

/** 内核吐出的过程事件。 */
export interface NodeRunEvent {
  type: 'progress' | 'log'
  progress?: number | undefined
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
