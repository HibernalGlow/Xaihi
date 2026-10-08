/**
 * 上游 `@xiranite/file-operations` 的类型垫片。
 *
 * 为什么是垫片而不是搬包：本仓没有 `file-operations`（上游在
 * `<Xiranite>/packages/file-operations`，11 文件 / 1636 行），而 `packages/api` 只借它的
 * **类型**——`src/client.ts` 里那条 `import type` / `export type` 全在类型位，一个运行期符号都没用。
 * 同一处境在本仓已有成法：`plugins/sleept/src/interaction-types.ts` 与
 * `plugins/marku/src/interaction-types.ts` 就是为 `@xiranite/cli-runtime/interaction` 立的同一种垫片。
 *
 * 另一半（`@xiranite/services` 的 `ConfigVersion` / `ConfigVersionDetail` /
 * `ConfigHistoryRepositoryStatus` / `NodeConfigExportResult`）**不在这里**，因为本仓已经有移植好的
 * 落点：`packages/contract/src/index.ts:377-403` 的 `NodeConfigVersion` / `NodeConfigVersionDetail` /
 * `NodeConfigHistoryRepositoryStatus` / `NodeConfigExport`——字段逐一对应（`delta?: unknown` 那份
 * 上游是 `Delta | undefined`，从 `jsondiffpatch` 来；本仓没有那条依赖，contract 已经拍成 `unknown`）。
 * `src/client.ts` 直接改指 contract，不在这份垫片里再抄一遍。
 *
 * 下面每一条都**逐字**抄自上游 `<Xiranite>/packages/file-operations/src/types.ts`，连字段顺序与
 * 注释都没改；改的只有"从哪个文件来"。`FileMutation` / `FileMutationGuard` /
 * `RustTrashItemReceipt` / `FileUndoReceipt` 是 `FileDeletionRecord.receipt` 的传递闭包，一并抄来。
 *
 * @module xaihi-api/file-deletion-dtos
 */

export type FileMutation =
  | { kind: "copy" | "move" | "rename"; sourcePath: string; destinationPath: string; overwrite?: boolean }
  | { kind: "delete" | "trash"; sourcePath: string }
  | { kind: "create-directory"; destinationPath: string }

export interface FileMutationGuard {
  path: string
  kind: "file" | "directory" | "symbolic-link" | "other"
  size: number
  mtimeMs: number
  ctimeMs: number
  device: number
  inode: number
}

export interface RustTrashItemReceipt {
  id: string
  name: string
  originalParent: string
  timeDeleted: number
}

export interface FileUndoReceipt {
  original: FileMutation
  inverse: FileMutation
  guard: FileMutationGuard
  providerData?: {
    kind: "trash-rs"
    item: RustTrashItemReceipt
  } | {
    /** Legacy NeoView receipt. Read-only compatibility; new operations never create it. */
    kind: "windows-recycle-bin"
    itemPath: string
  }
}

export type FileDeletionState =
  | "pending"
  | "trashed"
  | "restored"
  | "restore-failed"
  | "permanent"
  | "delete-failed"

export interface FileDeletionRecord {
  id: string
  transactionId?: string
  transactionIndex?: number
  nodeId: string
  componentId?: string
  workspaceId?: string
  sourcePath: string
  deletionKind: "trash" | "delete"
  pathKind?: FileMutationGuard["kind"]
  size?: number
  deletedAt: number
  state: FileDeletionState
  restoreAvailable: boolean
  receipt?: FileUndoReceipt
  restoredAt?: number
  lastRestoreAttemptAt?: number
  lastError?: string
}

export interface FileDeletionQuery {
  nodeId?: string
  componentId?: string
  workspaceId?: string
  state?: FileDeletionState
  deletionKind?: "trash" | "delete"
  restoreAvailable?: boolean
  from?: number
  to?: number
  limit?: number
  cursor?: string
}

export interface FileDeletionList {
  items: FileDeletionRecord[]
  nextCursor: string | null
}

export interface FileDeletionRestoreResult {
  record: FileDeletionRecord
  historyPersisted: boolean
}

export type FileDeletionExportFormat = "jsonl" | "csv" | "markdown"
