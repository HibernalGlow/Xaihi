/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 marku 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线 tag `noxide` 的
 * `packages/shared/src/index.ts`（`nodeRunEventSchema` 与同文件的 `NodeRunResultDTO`），
 * 上游 `packages/contract/src/index.ts` 把它们别名成 `NodeRunEvent` / `NodeRunResult`，
 * marku 的 `core.ts:1` 就是按这两个名字引的（搬进来时换成本文件，见 `src/core.ts` 头注释
 * 那条"恰好删掉 1 行"的台账）。这样 `core.ts` 能逐字移植，保真度由
 * `tests/core.spec.ts` 里手抄上游 `core.test.ts` 的那 13 条用例守住，而不是靠重写。
 *
 * 本包不许真的依赖 `@xiranite/*`：那是 `workspace:*`，写进依赖全仓 pnpm 就解不出树
 * （`pnpm-workspace.yaml` 顶部注释、`docs/adr/0002-self-contained-plugin-packages.md`）。
 *
 * 与 Xaihi 自己的 operation stream 的关系：这里的 `progress` 事件是**内核**往上吐进度的
 * 方式，接到运行账本的那一刀在 `src/index.ts` 的 `forward()`。marku 内核吐的是**百分数**
 * （`run` 腿：10 → 10+80·占比 → 100；`workflow` 腿：5 → 5+75·占比 → 80+20·占比 → 100；
 * `undo` 腿：`Math.round(index / max · 100)`），与 `crashu` / `samea` / `timeu` 一致、
 * 与 `dissolvef` 那份 0..1 不同 ⇒ 接线时不许照抄 dissolvef 的 `* 100`。
 *
 * @module xaihi-marku/contract
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
