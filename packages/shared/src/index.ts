import { z } from "zod"

export { appendUrlPath } from "./http-url.js"

export const workspaceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().optional(),
  flowCanvas: z.record(z.string(), z.unknown()).optional(),
  flowCamera: z.object({ x: z.number(), y: z.number(), z: z.number().positive() }).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const laneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  workspaceId: z.string().min(1),
  widthRatio: z.number().positive(),
  collapsed: z.boolean(),
  hidden: z.boolean().optional(),
  cardOrder: z.array(z.string()).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const componentPlacementSchema = z.enum(["workspace", "window"])

export const componentWindowSizeSchema = z.object({
  width: z.number().int().min(360),
  height: z.number().int().min(260),
})

export const componentWindowSizeLookupSchema = z.object({
  componentId: z.string().min(1),
  moduleId: z.string().min(1),
  workspaceId: z.string().min(1),
})

export const componentWindowSizeUpdateSchema = componentWindowSizeLookupSchema.extend({
  size: componentWindowSizeSchema,
})

export const componentSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  workspaceId: z.string().min(1),
  placement: componentPlacementSchema.optional(),
  windowSize: componentWindowSizeSchema.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  flowPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  flowSize: z.object({ width: z.number().positive(), height: z.number().positive() }).optional(),
  bentoLayout: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }).optional(),
  laneSize: z.object({ height: z.number().positive() }).optional(),
  dockPanel: z.string().optional(),
  laneId: z.string().optional(),
  hiddenIn: z.object({
    cards: z.boolean().optional(),
    dockview: z.boolean().optional(),
    flow: z.boolean().optional(),
    lane: z.boolean().optional(),
    bento: z.boolean().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  z: z.number().optional(),
  collapsed: z.boolean().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const createWorkspaceInputSchema = z.object({
  label: z.string().trim().min(1),
  icon: z.string().optional(),
})

export const renameWorkspaceInputSchema = z.object({
  label: z.string().trim().min(1),
})

export const workspaceSnapshotSchema = z.object({
  workspaces: z.array(workspaceSchema),
  lanes: z.array(laneSchema),
  components: z.array(componentSchema),
})

export const nodeRunEventSchema = z.object({
  type: z.enum(["progress", "log"]),
  progress: z.number().optional(),
  message: z.string(),
  // Optional structured progress payload.  Existing nodes keep using the
  // compact message-only form; long-running nodes can expose live previews.
  data: z.unknown().optional(),
})

export const nodeRunResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
  stats: z.record(z.string(), z.number()).optional(),
  outputPath: z.string().optional(),
})

export const nexusCaptureKindSchema = z.enum(["page", "selection", "image", "link"])

export const nexusCaptureRequestSchema = z.object({
  version: z.literal(1),
  targetNodeId: z.string().trim().min(1),
  kind: nexusCaptureKindSchema,
  source: z.object({
    url: z.string().url(),
    title: z.string().optional(),
    pageUrl: z.string().url().optional(),
    capturedAt: z.string().datetime(),
  }),
  content: z.object({
    text: z.string().optional(),
    html: z.string().optional(),
    markdown: z.string().optional(),
    fullHtml: z.string().optional(),
  }).optional(),
  attachments: z.array(z.object({
    url: z.string().url(),
    name: z.string().optional(),
    mimeType: z.string().optional(),
    dataBase64: z.string().optional(),
  })).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const nexusCaptureSchema = nexusCaptureRequestSchema.extend({
  id: z.string().min(1),
  receivedAt: z.string().datetime(),
})

export const nodeRunRequestSchema = z.object({
  input: z.unknown().optional(),
  context: z.object({
    componentId: z.string().optional(),
    workspaceId: z.string().optional(),
  }).optional(),
})

export const nodeRunResponseSchema = z.object({
  result: nodeRunResultSchema,
  events: z.array(nodeRunEventSchema),
})

export const nodeOperationPhaseSchema = z.enum(["queued", "running", "paused", "completed", "error", "cancelled"])

export const nodeOperationSchema = z.object({
  operationId: z.string().min(1),
  nodeId: z.string().min(1),
  componentId: z.string().optional(),
  workspaceId: z.string().optional(),
  phase: nodeOperationPhaseSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().optional(),
  cancelledAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  eventCount: z.number().int().nonnegative(),
  result: nodeRunResultSchema.optional(),
})

export const nodeOperationEventSchema = z.object({
  index: z.number().int().nonnegative(),
  event: nodeRunEventSchema,
})

export const nodeOperationStartResponseSchema = z.object({
  operation: nodeOperationSchema,
})

export const nodeOperationEventsResponseSchema = z.object({
  operation: nodeOperationSchema,
  events: z.array(nodeOperationEventSchema),
  from: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  next: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative(),
})

export const nodeOperationCleanupResponseSchema = z.object({
  removedCount: z.number().int().nonnegative(),
  remainingCount: z.number().int().nonnegative(),
})

export const nodeOperationStreamMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("operation"),
    operation: nodeOperationSchema,
  }),
  z.object({
    type: z.literal("event"),
    index: z.number().int().nonnegative(),
    event: nodeRunEventSchema,
  }),
  z.object({
    type: z.literal("result"),
    operation: nodeOperationSchema,
    result: nodeRunResultSchema,
  }),
])

export const nodeMemoryProtectionPolicySettingsSchema = z.object({
  maxRssGrowthMiB: z.number().int().min(1).max(65_536),
  maxHeapGrowthMiB: z.number().int().min(1).max(32_768),
  maxRetainedEvents: z.number().int().min(1).max(10_000),
  sampleIntervalMs: z.number().int().min(25).max(60_000),
})

export const nodeMemoryProtectionSettingsSchema = z.object({
  defaultPolicy: nodeMemoryProtectionPolicySettingsSchema,
  nodePolicies: z.record(z.string().min(1), nodeMemoryProtectionPolicySettingsSchema),
})

export const NODE_MEMORY_PROTECTION_APP_SECTION = "node_memory_protection"

export const DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS: NodeMemoryProtectionSettingsDTO = {
  defaultPolicy: {
    maxRssGrowthMiB: 8_192,
    maxHeapGrowthMiB: 4_096,
    maxRetainedEvents: 1_000,
    sampleIntervalMs: 250,
  },
  nodePolicies: {
    xlchemy: {
      maxRssGrowthMiB: 16_384,
      maxHeapGrowthMiB: 2_048,
      maxRetainedEvents: 256,
      sampleIntervalMs: 100,
    },
  },
}

// ── Node run history ───────────────────────────────────────────────
// 每次节点运行结束后持久化一条快照，用于全局历史中心 / 节点内参数恢复。
export const nodeRunHistoryStatusSchema = z.enum([
  "success",
  "error",
  "cancelled",
])

export const nodeRunHistoryItemSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  componentId: z.string().optional(),
  workspaceId: z.string().optional(),
  input: z.unknown().optional(),
  inputSummary: z.string().optional(),
  status: nodeRunHistoryStatusSchema,
  message: z.string(),
  result: nodeRunResultSchema.optional(),
  eventCount: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
})

export const nodeRunHistoryQuerySchema = z.object({
  nodeId: z.string().optional(),
  componentId: z.string().optional(),
  workspaceId: z.string().optional(),
  status: nodeRunHistoryStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(),
})

export const nodeRunHistoryClearQuerySchema = z.object({
  nodeId: z.string().optional(),
  componentId: z.string().optional(),
  workspaceId: z.string().optional(),
  before: z.coerce.number().int().nonnegative().optional(),
})

export const nodeRunHistoryListSchema = z.object({
  items: z.array(nodeRunHistoryItemSchema),
  nextCursor: z.string().nullable().optional(),
})

export const runtimeHistoryKindSchema = z.enum([
  "node",
  "workspace",
  "config",
  "system",
])

export const runtimeHistoryStatusSchema = z.enum([
  "success",
  "error",
  "cancelled",
  "info",
])

export const runtimeHistoryTargetSchema = z.object({
  type: z.string().min(1),
  id: z.string().optional(),
  label: z.string().optional(),
})

export const runtimeHistoryItemSchema = z.object({
  id: z.string().min(1),
  kind: runtimeHistoryKindSchema,
  operation: z.string().min(1),
  status: runtimeHistoryStatusSchema,
  title: z.string().optional(),
  message: z.string(),
  target: runtimeHistoryTargetSchema.optional(),
  nodeId: z.string().optional(),
  componentId: z.string().optional(),
  workspaceId: z.string().optional(),
  input: z.unknown().optional(),
  inputSummary: z.string().optional(),
  result: z.unknown().optional(),
  resultSummary: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  eventCount: z.number().int().nonnegative().optional(),
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
})

export const runtimeHistoryQuerySchema = z.object({
  kind: runtimeHistoryKindSchema.optional(),
  operation: z.string().optional(),
  nodeId: z.string().optional(),
  componentId: z.string().optional(),
  workspaceId: z.string().optional(),
  status: runtimeHistoryStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(),
})

export const runtimeHistoryClearQuerySchema = z.object({
  kind: runtimeHistoryKindSchema.optional(),
  operation: z.string().optional(),
  nodeId: z.string().optional(),
  componentId: z.string().optional(),
  workspaceId: z.string().optional(),
  before: z.coerce.number().int().nonnegative().optional(),
})

export const runtimeHistoryListSchema = z.object({
  items: z.array(runtimeHistoryItemSchema),
  nextCursor: z.string().nullable().optional(),
})

export type WorkspaceDTO = z.infer<typeof workspaceSchema>
export type LaneDTO = z.infer<typeof laneSchema>
export type ComponentDTO = z.infer<typeof componentSchema>
export type ComponentPlacementDTO = z.infer<typeof componentPlacementSchema>
export type ComponentWindowSizeDTO = z.infer<typeof componentWindowSizeSchema>
export type ComponentWindowSizeLookupDTO = z.infer<typeof componentWindowSizeLookupSchema>
export type ComponentWindowSizeUpdateDTO = z.infer<typeof componentWindowSizeUpdateSchema>
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>
export type RenameWorkspaceInput = z.infer<typeof renameWorkspaceInputSchema>
export type WorkspaceSnapshotDTO = z.infer<typeof workspaceSnapshotSchema>
export type NodeRunEventDTO = z.infer<typeof nodeRunEventSchema>
export type NexusCaptureKindDTO = z.infer<typeof nexusCaptureKindSchema>
export type NexusCaptureRequestDTO = z.infer<typeof nexusCaptureRequestSchema>
export type NexusCaptureDTO = z.infer<typeof nexusCaptureSchema>
export type NodeOperationPhaseDTO = z.infer<typeof nodeOperationPhaseSchema>
export type NodeMemoryProtectionPolicySettingsDTO = z.infer<typeof nodeMemoryProtectionPolicySettingsSchema>
export type NodeMemoryProtectionSettingsDTO = z.infer<typeof nodeMemoryProtectionSettingsSchema>
export interface NodeRunResultDTO<TData = unknown> {
  success: boolean
  message: string
  data?: TData
  stats?: Record<string, number>
  outputPath?: string
}
export interface NodeRunResponseDTO<TData = unknown> {
  result: NodeRunResultDTO<TData>
  events: NodeRunEventDTO[]
}
export interface NodeOperationDTO<TData = unknown> {
  operationId: string
  nodeId: string
  componentId?: string
  workspaceId?: string
  phase: NodeOperationPhaseDTO
  createdAt: number
  updatedAt: number
  startedAt?: number
  cancelledAt?: number
  finishedAt?: number
  eventCount: number
  result?: NodeRunResultDTO<TData>
}
export interface NodeOperationEventDTO {
  index: number
  event: NodeRunEventDTO
}
export interface NodeOperationStartResponseDTO<TData = unknown> {
  operation: NodeOperationDTO<TData>
}
export interface NodeOperationEventsResponseDTO<TData = unknown> {
  operation: NodeOperationDTO<TData>
  events: NodeOperationEventDTO[]
  from: number
  limit: number
  next?: number
  total: number
}
export interface NodeOperationListResponseDTO<TData = unknown> {
  operations: NodeOperationDTO<TData>[]
  total: number
}
export interface NodeOperationCleanupResponseDTO {
  removedCount: number
  remainingCount: number
}
export type NodeOperationStreamMessageDTO<TData = unknown> =
  | { type: "operation"; operation: NodeOperationDTO<TData> }
  | { type: "event"; index: number; event: NodeRunEventDTO }
  | { type: "result"; operation: NodeOperationDTO<TData>; result: NodeRunResultDTO<TData> }

export type NodeRunHistoryStatusDTO = z.infer<typeof nodeRunHistoryStatusSchema>
export type NodeRunHistoryItemDTO = z.infer<typeof nodeRunHistoryItemSchema>
export type NodeRunHistoryQueryDTO = z.infer<typeof nodeRunHistoryQuerySchema>
export type NodeRunHistoryClearQueryDTO = z.infer<typeof nodeRunHistoryClearQuerySchema>
export type NodeRunHistoryListDTO = z.infer<typeof nodeRunHistoryListSchema>
export interface NodeRunHistoryClearResultDTO {
  deletedCount: number
}

export type RuntimeHistoryKindDTO = z.infer<typeof runtimeHistoryKindSchema>
export type RuntimeHistoryStatusDTO = z.infer<typeof runtimeHistoryStatusSchema>
export type RuntimeHistoryTargetDTO = z.infer<typeof runtimeHistoryTargetSchema>
export type RuntimeHistoryItemDTO = z.infer<typeof runtimeHistoryItemSchema>
export type RuntimeHistoryQueryDTO = z.infer<typeof runtimeHistoryQuerySchema>
export type RuntimeHistoryClearQueryDTO = z.infer<typeof runtimeHistoryClearQuerySchema>
export type RuntimeHistoryListDTO = z.infer<typeof runtimeHistoryListSchema>
export interface RuntimeHistoryClearResultDTO {
  deletedCount: number
}
