/**
 * 类型垫片：classf 内核用到的 Xiranite **MigrateF** 形状。
 *
 * 为什么在 classf 里有一份副本而不是 import：见 `./crashu-core.ts` 文件头那条
 * （缺口 **G10**，`docs/service-mapping.md` §缺口台账）。classf 对 MigrateF 的依赖
 * 在 `core.ts` 里只有类型（`core.ts:3`），真执行经 `ClassfRuntime.runMigratef` 注入。
 *
 * 逐条抄自基线 tag `noxide` 的 `packages/nodes/migratef/src/core.ts`
 * （`MigratefAction` / `MigratefMode` / `MigratefRelativeTargetBase`、`MigratefInput`、
 * `MigrateOperation`、`MigratePlanItem`、`UndoRecord`、`MigratefData`、`MigratefResult`），
 * 与本仓 `plugins/migratef/src/core.ts:54-143` 那份是同一批字面（那里是整块内核的逐字移植）。
 *
 * classf 真正读到的格（`core.ts:291,301-303,313-315,365-367`）：
 * `plan[].sourcePath` / `targetPath` / `action`（`move` 还是 `copy` 决定 `moved` 还是
 * `copied`）/ `kind`（`directory` ⇒ classf 记成 `folder`）/ `status`
 * （`pending` ⇒ `ready`，`success` ⇒ 按 action 分，`error` ⇒ `error`，其余 ⇒ `skipped`）/
 * `reason`，以及七个计数与 `errors`。
 *
 * @module xaihi-classf/migratef-core
 */

import type { NodeRunResult } from './contract.ts'

export type MigratefAction = 'move' | 'copy' | 'undo' | 'history' | 'plan'
export type MigratefMode = 'preserve' | 'flat' | 'direct'
export type MigratefRelativeTargetBase = 'working-directory' | 'source-parent'

export interface MigratefInput {
  action?: MigratefAction
  mode?: MigratefMode
  path?: string
  sourcePaths?: string[]
  targetPath?: string
  maxWorkers?: number
  batchId?: string
  historyLimit?: number
  historyPath?: string
  dryRun?: boolean
  relativeTargetBase?: MigratefRelativeTargetBase
  mergeExistingDirectories?: boolean
}

export interface MigrateOperation {
  sourcePath: string
  targetPath: string
  action: 'move' | 'copy'
}

export interface MigratePlanItem extends MigrateOperation {
  kind: 'file' | 'directory'
  operation?: 'transfer' | 'remove-empty-source'
  status: 'pending' | 'skipped' | 'success' | 'error'
  reason?: string
}

export interface UndoRecord {
  id: string
  timestamp: string
  description: string
  action: 'move' | 'copy'
  operations: MigrateOperation[]
  removedSourceDirectories?: string[]
  undone?: boolean
}

export interface MigratefData {
  plan: MigratePlanItem[]
  history: UndoRecord[]
  migratedCount: number
  skippedCount: number
  errorCount: number
  totalCount: number
  operationId: string
  successCount: number
  failedCount: number
  errors: string[]
}

export type MigratefResult = NodeRunResult<MigratefData>
