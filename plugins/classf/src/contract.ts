/**
 * 迁移期垫片：Xiranite `@xiranite/contract` 里被 classf 内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。形状逐条抄自基线 tag `noxide` 的
 * `packages/shared/src/index.ts`（`nodeRunEventSchema` 与 `NodeRunResultDTO`），
 * 上游 `packages/nodes/classf/src/core.ts:1` 就是按 `NodeRunEvent` / `NodeRunResult`
 * 这两个名字引的。这样 `core.ts` 能逐字移植，保真度由它自带的用例守住。
 *
 * 本包不许真的依赖 `@xiranite/*`：那是 `workspace:*`，写进依赖全仓 pnpm 就解不出树
 * （`pnpm-workspace.yaml` 顶部注释、`docs/adr/0002-self-contained-plugin-packages.md`）。
 *
 * classf 这一份为什么要单独存在：它是**编排器**，`progress` 事件有三层来源——自己的阶段
 * 通知（5 / 20 / 35 / 40 / 45 / 50 / 65 / 80 / 92-100）、SameA 与 CrashU 的事件经
 * `forward(event, offset, span)` 折进一段区间（`core.ts:358`），以及 MigrateF 的
 * `forwardMigrate`（`:359-363`，它还会把 `message` 当文件名去比对）。三条都是百分数，
 * 与 `rawfilter` / `crashu` 同一单位，与 `dissolvef` 那份 0..1 不同，
 * 所以接线时不许照抄 dissolvef 的 `* 100`。
 *
 * @module xaihi-classf/contract
 */

/** 内核吐出的过程事件。`progress` 在这里是 0..100 的百分数（见文件头那条单位说明）。 */
export interface NodeRunEvent {
  type: 'progress' | 'log'
  progress?: number
  message: string
  /** 可选的结构化载荷：classf 用它带 `classf-plan` / `classf-stage` / `classf-item`。 */
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
