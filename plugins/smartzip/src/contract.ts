/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 smartzip 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线 tag `noxide` 的
 * `packages/shared/src/index.ts`（`nodeRunEventSchema` 与 `NodeRunResultDTO`），
 * 上游 `packages/nodes/smartzip/src/core.ts:1` 就是按这两个名字引的。
 *
 * 本包不许真的依赖 `@xiranite/*`：那是 `workspace:*`，写进依赖全仓 pnpm 就解不出树
 * （`pnpm-workspace.yaml` 顶部注释、`docs/adr/0002-self-contained-plugin-packages.md`）。
 *
 * smartzip 的 `progress` 有两处单位差别，接线时要点名：
 * - 内核自己那三句是百分数（20 / 45 / 100，`core.ts:244,260,262`）；
 * - `src/platform.ts` 的 `execute()` 里那句是**按已完成条目折算**的百分数
 *   （`Math.round(index / sources.length * 100)`，上游 `platform.ts:76`），也是百分数。
 * 所以 `src/index.ts` 直接当 `done / total=100` 用，不许照抄 dissolvef 那句 `* 100`
 * （那份内核给的是 0..1）。
 *
 * @module xaihi-smartzip/contract
 */

/** 内核吐出的过程事件。`progress` 在这里是 0..100 的百分数（见文件头那条单位说明）。 */
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
