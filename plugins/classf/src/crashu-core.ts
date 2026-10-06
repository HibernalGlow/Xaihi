/**
 * 类型垫片：classf 内核用到的 Xiranite **CrashU** 形状。
 *
 * classf 是 SameA / CrashU / MigrateF 三个节点的编排器，但它对这三者的依赖
 * 在 `core.ts` 里**只有类型**（`core.ts:2-4`）——真正的执行经 `ClassfRuntime` 的
 * `runCrashu` 注入。所以这里只抄那几个类型，不抄内核，也不引 `@xiranite/*`
 * （`docs/adr/0002-self-contained-plugin-packages.md`）。
 *
 * 逐条抄自基线 tag `noxide` 的 `packages/nodes/crashu/src/core.ts`
 * （`:45-48` 四个联合、`:50-72` `CrashuInput`、`:99-107` `CrashuSimilarFolder`、
 * `:110-133` `CrashuPlanItem` / `CrashuData`、`:147` `CrashuResult`），
 * 与本仓 `plugins/crashu/src/core.ts` 的那份是同一批字面（那里是逐字移植的整块内核）。
 *
 * **漂移风险点名**：这里是一份副本，不是 import。`docs/service-mapping.md` 的
 * **G10**（新缺口）记的就是"节点之间复用内核没有缝"：本包既不能依赖 sibling 包
 * （`package.json#exports` 只发 `.` / `./cli` / `./help`，`.` 会把 cordis 与 SDK 拉进来），
 * 也不能自己重写那三个内核（那是发明）。副本只覆盖 classf 用到的这一小截，
 * 真源在 `plugins/crashu/src/core.ts`；改动那边要回头看这里。
 *
 * @module xaihi-classf/crashu-core
 */

import type { NodeRunResult } from './contract.ts'

export type CrashuAction = 'scan' | 'plan' | 'move' | 'execute'
export type CrashuMoveDirection = 'to_target' | 'to_source'
export type CrashuConflictPolicy = 'skip' | 'overwrite' | 'rename'
export type CrashuPlanStatus = 'pending' | 'skipped' | 'success' | 'error'

/** 上游 `CrashuInput`：camelCase 与 snake_case **两条都收**（上游 `:50-72` 原样，别删一半）。 */
export interface CrashuInput {
  action?: CrashuAction
  sourcePaths?: string[]
  source_paths?: string[]
  source?: string
  targetPath?: string
  target_path?: string
  targetNames?: string[]
  target_names?: string[]
  destinationPath?: string
  destination_path?: string
  similarityThreshold?: number
  similarity_threshold?: number
  autoMove?: boolean
  auto_move?: boolean
  moveDirection?: CrashuMoveDirection
  move_direction?: CrashuMoveDirection
  conflictPolicy?: CrashuConflictPolicy
  conflict_policy?: CrashuConflictPolicy
  pairsFileName?: string
  pairs_file_name?: string
  dryRun?: boolean
}

/** classf 读的就是 `target` 这一格（`core.ts:262` 用它当已匹配画师集合）。 */
export interface CrashuSimilarFolder {
  name: string
  path: string
  target: string
  similarity: number
  matchDim: string
  matchSrc: string
  matchTgt: string
  targetFullpath?: string
}

export interface CrashuPlanItem {
  sourcePath: string
  targetName: string
  targetPath?: string
  destinationPath: string
  direction: CrashuMoveDirection
  similarity: number
  status: CrashuPlanStatus
  reason: string
}

export interface CrashuData {
  sourceCount: number
  targetCount: number
  totalScanned: number
  similarFound: number
  movedCount: number
  skippedCount: number
  errorCount: number
  pairsFile: string
  similarFolders: CrashuSimilarFolder[]
  plan: CrashuPlanItem[]
  errors: string[]
}

export type CrashuResult = NodeRunResult<CrashuData>
