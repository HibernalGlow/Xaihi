/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 mvz 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线 tag `noxide` 的
 * `packages/shared/src/index.ts`（`nodeRunEventSchema` 与 `NodeRunResultDTO`），
 * `packages/contract/src/index.ts` 把它们别名成 `NodeRunEvent` / `NodeRunResult`，
 * 上游 `packages/nodes/mvz/src/core.ts:1` 就是按这两个名字引的。这样 `core.ts`
 * 能逐字移植，保真度由它自带的用例守住，而不是靠重写。
 *
 * 本包不许真的依赖 `@xiranite/*`：那是 `workspace:*`，写进依赖全仓 pnpm 就解不出树
 * （`pnpm-workspace.yaml` 顶部注释、`docs/adr/0002-self-contained-plugin-packages.md`）。
 *
 * 与 Xaihi 自己的 operation stream 的关系：这里的 `progress` 事件是**内核**往上吐进度的
 * 方式，接到运行账本的那一刀在 `src/index.ts`。mvz 内核吐的是百分数
 * （`Math.round(done / total * 100)`，见 `core.ts` 的 `progress()`），与 `nameu` / `rawfilter`
 * 同一单位，与 `dissolvef` 那份 0..1 不同，所以接线时不许照抄 dissolvef 的 `* 100`。
 * `message` 那一格在 mvz 里可能是 `"<action> 3/7|book.zip"` 这种带 `|` 的复合串
 * （`core.ts:266`），账本原样转发，不在这里拆。
 *
 * @module xaihi-mvz/contract
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
