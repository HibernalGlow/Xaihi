/**
 * 迁移期垫片：`<Xiranite>` tag `noxide` 的 `@xiranite/contract` 里被本包内核用到的两个类型。
 *
 * 只搬这两个，不搬 runner 协议。与 `plugins/timeu/src/contract.ts`、`plugins/marku` 同一个
 * 口径：形状逐条抄自基线（`packages/contract/src/index.ts:1-4` 把 `NodeRunEvent` /
 * `NodeRunResult` 别名到 `packages/shared/src/index.ts` 的 `nodeRunEventSchema` 推导类型与
 * `NodeRunResultDTO`），这样 `src/core.ts` 能逐字移植，保真度由它自带的用例守住。
 *
 * 本包不许真的依赖 `@xiranite/*`：那是 `workspace:*`，写进依赖全仓 pnpm 就解不出树，
 * 而且装进 profile 的包必须自足（`docs/adr/0002-self-contained-plugin-packages.md`、
 * `scripts/check-installable.mjs`）。
 *
 * 与 Xaihi 自己的运行账本的关系：这里的 `progress` 是**内核**往上吐进度的方式。
 * **单位**：sleept 内核吐的是百分数（`core.ts` 的 `tickCountdown` / `runNetSpeedMonitor` /
 * `runCpuMonitor` 里 `Math.floor((elapsed / durationSeconds) * 100)` 那一族），不是 0..1，
 * 接线时不许照抄 dissolvef 的 `* 100`。本包目前还没有把这条吐线接到账本的那一刀
 * （`src/index.ts` 的 `defineNode` 只登记电源那六个动作），所以定时器那一路的事件仍在内核内循环。
 *
 * @module xaihi-sleept/contract
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
