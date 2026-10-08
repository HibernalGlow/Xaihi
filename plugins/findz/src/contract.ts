/**
 * 迁移期垫片：findz 内核用到的**类型与常量**，从 Xiranite 基线搬来。
 *
 * 两段来源不同，别混：
 *
 * 1. `findz-native/protocol.ts` 逐字（下面到 `FindzNativeClient` 结束为止）。
 *    它是「native 内核的面」的词表：请求/响应信封、`FINDZ_ABI_VERSION`、
 *    每个方法的载荷形状。基线里由 FFI 客户端 `@xiranite/findz-native` 导出，
 *    这里逐字搬过来，`core.ts` 才能一个标识符都不改地编译。
 * 2. 末尾的 `NodeRunEvent` / `NodeRunResult` 是 `@xiranite/contract` 里被内核用到的
 *    那两个类型（`packages/contract/src/index.ts:1` 把 `@xiranite/shared` 的
 *    `NodeRunEventDTO` / `NodeRunResultDTO` 别名成它们）。形状逐条抄，
 *    与 `xaihi-dissolvef` 的垫片同一处理。
 *
 * 这里**不放**任何运行时依赖：基线的 `findz-native` 还要 `bun:ffi` 与
 * `@xiranite/native-loader`，那整条链在 ADR-0004 里被换成了进程外宿主。
 *
 * @module xaihi-findz/contract
 */

export const FINDZ_ABI_VERSION = 1
export const FINDZ_REQUEST_VERSION = 1

export const FINDZ_REQUIRED_CAPABILITIES = [
  "library.open",
  "library.close",
  "scan.start",
  "scan.reconcile",
  "watcher.apply_changes",
  "watcher.set_health",
  "query.archives",
  "query.members",
  "export.rows",
  "projection.treemap",
  "analysis.start",
  "task.get",
  "task.pause",
  "task.resume",
  "task.cancel",
] as const

export interface FindzError {
  code: string
  message: string
  retryable: boolean
  details?: unknown
}

export type FindzResponse<T> =
  | { ok: true; requestId?: string; result: T }
  | { ok: false; requestId?: string; error: FindzError }

export interface FindzApiInfo {
  abiVersion: number
  coreVersion: string
  requestVersions: number[]
  capabilities: string[]
  supportedFormats: string[]
}

export interface FindzRequest<TParams> {
  requestVersion: typeof FINDZ_REQUEST_VERSION
  requestId: string
  method: string
  params: TParams
}

export interface FindzLibraryOpenParams {
  libraryId?: string
  root: string
  databasePath?: string
}

export interface FindzLibrarySummary {
  libraryId: string
  root: string
  databasePath: string
  archiveCount: number
  memberCount: number
  watcherHealth: string
  analysisPolicy: string
}

export interface FindzTask {
  id: string
  libraryId: string
  kind: "scan" | "watcher" | "analysis"
  status: "queued" | "running" | "paused" | "completed" | "completed_with_warnings" | "cancelled" | "failed"
  totalArchives: number
  doneArchives: number
  totalMembers: number
  doneMembers: number
  skippedMembers: number
  failedMembers: number
  startedAt?: string
  finishedAt?: string
  message: string
  analysisPolicy?: string
}

export interface FindzAnalysisScope {
  kind: "all" | "archives" | "members"
  archiveIds?: number[]
  memberIds?: number[]
  deepRetry?: boolean
}

export interface FindzPage {
  cursor?: string
  limit?: number
}

export interface FindzRuleCondition {
  id: string
  kind: "condition"
  field: string
  operator: string
  value?: string | number | boolean | null | Array<string | number | boolean | null>
}

export interface FindzRuleGroup {
  id: string
  kind: "group"
  combinator: "all" | "any"
  not: boolean
  children: Array<FindzRuleCondition | FindzRuleGroup>
}

export interface FindzRuleTree {
  format: "xiranite-rule-tree/v1"
  version: 1
  root: FindzRuleGroup
}

export interface FindzArchiveQuery {
  libraryId: string
  text?: string
  pathPrefix?: string
  rules?: FindzRuleTree
  sortBy?: string
  sortDesc?: boolean
  page?: FindzPage
}

export interface FindzArchiveRow {
  id: number
  relativePath: string
  size: number
  modifiedAt: string
  scanState: string
  errorCode?: string
  memberCount: number
  imageMemberCount: number
  analyzedImageCount: number
  compressedImageBytes: number
  averageImageBytes: number
  averageBytesPerMegapixel: number
  medianBytesPerMegapixel: number
  anomalyCount: number
  estimatedSavingsBytes: number
}

export interface FindzMemberRow {
  id: number
  archiveId: number
  memberPath: string
  nestingDepth: number
  compressedSize: number
  uncompressedSize: number
  compressionMethod: number
  crc32: number
  extension: string
  imageCandidate: boolean
  nestedArchive: boolean
  encrypted: boolean
  actualFormat?: string
  width?: number
  height?: number
  pixels?: number
  aspectRatio?: number
  bytesPerMegapixel?: number
  animated?: boolean
  frameCount?: number
  metadataStatus?: string
  metadataErrorCode?: string
  anomalyKind?: string
  anomalyScore?: number
  estimatedSavingsBytes: number
}

export interface FindzPagedResult<T> {
  items: T[]
  nextCursor?: string
  total: number
}

export interface FindzTreemapNode {
  id: string
  name: string
  value: number
  color: number
  archiveId?: number
  children?: FindzTreemapNode[]
}

export interface FindzNativeClient {
  getApiInfo(): Promise<FindzApiInfo>
  openLibrary(params: FindzLibraryOpenParams): Promise<FindzLibrarySummary>
  closeLibrary(libraryId: string): Promise<void>
  startScan(libraryId: string): Promise<FindzTask>
  reconcileScan(libraryId: string): Promise<FindzTask>
  applyWatcherChanges(libraryId: string, changes: Array<{ path: string; type: string }>): Promise<FindzTask>
  setWatcherHealth(libraryId: string, health: "healthy" | "degraded"): Promise<FindzLibrarySummary>
  startAnalysis(libraryId: string, scope?: FindzAnalysisScope): Promise<FindzTask>
  getTask(libraryId: string, taskId: string): Promise<FindzTask>
  pauseTask(libraryId: string, taskId: string): Promise<FindzTask>
  resumeTask(libraryId: string, taskId: string): Promise<FindzTask>
  cancelTask(libraryId: string, taskId: string): Promise<FindzTask>
  queryArchives(params: FindzArchiveQuery): Promise<FindzPagedResult<FindzArchiveRow>>
  exportRows(params: FindzArchiveQuery): Promise<FindzPagedResult<FindzArchiveRow>>
  queryMembers(params: { libraryId: string; archiveId: number; text?: string; page?: FindzPage }): Promise<FindzPagedResult<FindzMemberRow>>
  getTreemap(params: { libraryId: string; text?: string; pathPrefix?: string; rules?: FindzRuleTree; areaBy?: string }): Promise<FindzTreemapNode>
  close(): void
}

/* ------------------------------------------------------------------------- *
 * 下面两个类型来自 `@xiranite/contract`（= `@xiranite/shared` 的 DTO），
 * 只为让 `core.ts` 能逐字编译，不是 Xaihi 的运行事件词表。
 * 内核往上吐进度 → `defineNode` 那侧再由 `call.run.progress()` 接到运行账本上。
 * ------------------------------------------------------------------------- */

/** 内核吐出的过程事件。`progress` 是 0..100 的比例，缺省表示只有一句话。 */
export interface NodeRunEvent {
  type: "progress" | "log"
  progress?: number
  message?: string
}

/** 一次运行的结局。`success` 与"有没有抛异常"是两件事，内核两条都用。 */
export interface NodeRunResult<TData = unknown> {
  success: boolean
  message: string
  data?: TData
  stats?: Record<string, number>
  outputPath?: string
}
