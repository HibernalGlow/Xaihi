/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 cleanf 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线 tag `noxide` 的
 * `packages/shared/src/index.ts:91-98`（`nodeRunEventSchema`）与 `:370-376`
 * （`NodeRunResultDTO`），`packages/contract/src/index.ts` 把它们别名成
 * `NodeRunEvent` / `NodeRunResult`，上游 `packages/nodes/cleanf/src/core.ts:1`
 * 就是按这两个名字引的。这样 `core.ts` 能逐字移植，保真度由它自带的用例守住。
 *
 * 本包不许真的依赖 `@xiranite/*`：那是 `workspace:*`，写进依赖全仓 pnpm 就解不出树
 * （`pnpm-workspace.yaml` 顶部注释、`docs/adr/0002-self-contained-plugin-packages.md`）。
 * 另一个被 `core.ts` 之外用到的上游包 `@xiranite/file-operations`（撤销账本那层）
 * **没有对应垫片**：Xaihi 侧到今天没有可恢复删除的缝，处置写在 `src/platform.ts` 的文件头。
 *
 * 与 Xaihi 自己的 operation stream 的关系：这里的 `progress` 事件是**内核**往上吐进度的方式，
 * 接到运行账本的那一刀在 `src/index.ts`。cleanf 内核吐的是百分数
 * （`Math.round((index / paths.length) * 40)`、70、100，见 `core.ts` 里 `onEvent` 的三处），
 * 与 `nameu` / `mvz` / `rawfilter` 同一单位，与 `dissolvef` 那份 0..1 不同，
 * 所以接线时不许照抄 dissolvef 的 `* 100`。
 *
 * @module xaihi-cleanf/contract
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
