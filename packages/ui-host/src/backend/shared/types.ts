/**
 * Backend shared types — 前后端共享的数据契约。
 *
 * 这个文件是「事实之源」：
 * - 前端 src/types/workspace.ts 的领域类型用于 UI 状态
 * - 后端 src/backend/shared/types.ts 的 DTO 用于跨进程传输
 * 二者解耦：UI 状态可以加临时字段，DTO 只保留持久化与传输所需。
 *
 * WorkspaceDTO / LaneDTO / ComponentDTO 现从 @xiranite/shared re-export，
 * 与 zod schema 保持单一来源。
 */

// ── DTO（re-export 自 @xiranite/shared，与 zod schema 同源）─────────────────
export type { WorkspaceDTO, LaneDTO, ComponentDTO } from "@xiranite/shared"

// ── 通用 Result ─────────────────────────────────────────────────────────────
export interface Result<T> {
  success: boolean
  message: string
  data?: T
  error?: string
}

export interface ProgressEvent {
  taskId: string
  percent: number
  message: string
  timestamp: number
}
