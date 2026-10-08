import { appendUrlPath } from "@hibernalglow/xaihi-shared"
import type {
  FileDeletionExportFormat,
  FileDeletionList,
  FileDeletionQuery,
  FileDeletionRestoreResult,
} from "./file-deletion-dtos.js"
export type {
  FileDeletionExportFormat,
  FileDeletionList,
  FileDeletionQuery,
  FileDeletionRecord,
  FileDeletionRestoreResult,
  FileDeletionState,
} from "./file-deletion-dtos.js"
// 上游这四个来自 `@xiranite/services`；本仓的移植落点是 contract（字段逐一对应，见该包 377-403），
// 与 `file-deletion-dtos.ts` 同一处置：在这条 import 上做别名，不改本文件里已有的用法。
import type {
  NodeConfigExport as NodeConfigExportResult,
  NodeConfigHistoryRepositoryStatus as ConfigHistoryRepositoryStatus,
  NodeConfigVersion as ConfigVersion,
  NodeConfigVersionDetail as ConfigVersionDetail,
} from "@hibernalglow/xaihi-contract"
import type {
  ComponentWindowSizeDTO,
  ComponentWindowSizeLookupDTO,
  ComponentWindowSizeUpdateDTO,
  NodeOperationCleanupResponseDTO,
  NodeOperationDTO,
  NodeOperationEventsResponseDTO,
  NodeOperationListResponseDTO,
  NodeOperationStartResponseDTO,
  NodeOperationStreamMessageDTO,
  NodeRunEventDTO,
  NodeRunHistoryClearQueryDTO,
  NodeRunHistoryClearResultDTO,
  NodeRunHistoryItemDTO,
  NodeRunHistoryListDTO,
  NodeRunHistoryQueryDTO,
  NodeRunResultDTO,
  RuntimeHistoryClearQueryDTO,
  RuntimeHistoryClearResultDTO,
  RuntimeHistoryItemDTO,
  RuntimeHistoryListDTO,
  RuntimeHistoryQueryDTO,
  WorkspaceSnapshotDTO,
} from "@hibernalglow/xaihi-shared"
export * from "./source-thumbnail-client.js"

export interface XiraniteClientOptions {
  token?: string
}

export interface XiraniteSystemClient {
  health(): Promise<{ ok: boolean; instanceId?: string }>
}

export interface XiraniteWorkspaceClient {
  loadSnapshot(): Promise<WorkspaceSnapshotDTO>
  persistSnapshot(snapshot: WorkspaceSnapshotDTO): Promise<WorkspaceSnapshotDTO>
  resolveComponentWindowSize(input: ComponentWindowSizeLookupDTO): Promise<ComponentWindowSizeDTO | null>
  persistComponentWindowSize(input: ComponentWindowSizeUpdateDTO): Promise<ComponentWindowSizeDTO>
}

export interface XiraniteNodeClient {
  getNodeRuntimeInfo<TInfo = unknown>(nodeId: string): Promise<TInfo>
  startNodeOperation<TInput = unknown>(
    nodeId: string,
    input: TInput,
    context?: { componentId?: string; workspaceId?: string },
  ): Promise<NodeOperationDTO>
  getNodeOperation<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>>
  listNodeOperations<TData = unknown>(options?: { nodeId?: string; activeOnly?: boolean; limit?: number }): Promise<NodeOperationListResponseDTO<TData>>
  getNodeOperationEvents<TData = unknown>(
    operationId: string,
    options?: { fromEventIndex?: number; limit?: number },
  ): Promise<NodeOperationEventsResponseDTO<TData>>
  cancelNodeOperation<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>>
  pauseNodeOperation<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>>
  resumeNodeOperation<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>>
  cleanupNodeOperations(options?: { maxAgeMs?: number }): Promise<NodeOperationCleanupResponseDTO>
  streamNodeOperation<TData = unknown>(
    operationId: string,
    onMessage: (message: NodeOperationStreamMessageDTO<TData>) => void,
    options?: { fromEventIndex?: number },
  ): Promise<void>
  runNode<TInput = unknown, TData = unknown>(
    nodeId: string,
    input: TInput,
    onEvent?: (event: NodeRunEventDTO) => void,
  ): Promise<NodeRunResultDTO<TData>>
}

export interface XiraniteConfigClient {
  getConfig(): Promise<{ config: unknown; path: string }>
  getConfigPath(): Promise<string>
  getNodeConfig<T = unknown>(nodeId: string): Promise<{ config: T | undefined; path: string }>
  updateNodeConfig<T = unknown>(nodeId: string, config: T): Promise<{ config: T; path: string }>
  getNodeConfigVersions(nodeId: string, options?: { limit?: number }): Promise<{ versions: ConfigVersion[] }>
  inspectNodeConfigVersion(nodeId: string, revision: string): Promise<ConfigVersionDetail>
  restoreNodeConfigVersion<T = unknown>(nodeId: string, revision: string): Promise<{ config: T; path: string }>
  exportNodeConfig(nodeId: string, format?: "json" | "toml"): Promise<NodeConfigExportResult>
  importNodeConfig<T = unknown>(nodeId: string, content: string, format?: "auto" | "json" | "toml"): Promise<{ config: T; path: string }>
  createNodeConfigBackup(nodeId: string, label?: string): Promise<{ version: ConfigVersion }>
  getConfigHistoryRepositoryStatus(): Promise<ConfigHistoryRepositoryStatus>
  setConfigHistoryRemote(url: string | null): Promise<ConfigHistoryRepositoryStatus>
  syncConfigHistory(direction: "pull" | "push"): Promise<ConfigHistoryRepositoryStatus>
  getNodePresets<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string): Promise<{ presets: Array<NodePreset<TValues>> }>
  createNodePreset<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string, input: { name: string; values: TValues }): Promise<{ preset: NodePreset<TValues> }>
  updateNodePreset<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string, presetId: string, input: { name?: string; values?: TValues }): Promise<{ preset: NodePreset<TValues> }>
  deleteNodePreset(nodeId: string, presetId: string): Promise<{ deleted: boolean }>
  getAppConfig<T = unknown>(section: string): Promise<{ config: T | undefined; path: string }>
  updateAppConfig<T = unknown>(section: string, config: T): Promise<{ config: T; path: string }>
  getCustomThemes(): Promise<{ themes: unknown[]; path: string }>
  saveCustomThemes(themes: unknown[]): Promise<{ themes: unknown[]; path: string }>
  getBackgroundImage(): Promise<{ url: string | null; path: string }>
  saveBackgroundImage(url: string | null): Promise<{ url: string | null; path: string }>
  openConfigFile(): Promise<{ opened: boolean; path: string }>
  importLegacy(legacyPath: string, nodeId: string): Promise<{ imported: boolean; config: unknown; path: string }>
}

export interface XiraniteRuntimeHistoryClient {
  list(query: RuntimeHistoryQueryDTO): Promise<RuntimeHistoryListDTO>
  get(id: string): Promise<RuntimeHistoryItemDTO>
  delete(id: string): Promise<void>
  clear(query: RuntimeHistoryClearQueryDTO): Promise<RuntimeHistoryClearResultDTO>
}

export interface XiraniteNodeRunHistoryClient {
  list(query: NodeRunHistoryQueryDTO): Promise<NodeRunHistoryListDTO>
  get(id: string): Promise<NodeRunHistoryItemDTO>
  delete(id: string): Promise<void>
  clear(query: NodeRunHistoryClearQueryDTO): Promise<NodeRunHistoryClearResultDTO>
}

export function createXiraniteConfigClient(baseUrl: string, options: XiraniteClientOptions = {}): XiraniteConfigClient {
  const headers = requestHeaders(options)

  return {
    async getConfig() {
      const response = await fetch(apiUrl(baseUrl, "/config"), { headers })
      if (!response.ok) throw new Error(`Config load failed: ${response.status}`)
      return await response.json() as { config: unknown; path: string }
    },
    async getConfigPath() {
      const response = await fetch(apiUrl(baseUrl, "/config/path"), { headers })
      if (!response.ok) throw new Error(`Config path load failed: ${response.status}`)
      const data = await response.json() as { path: string }
      return data.path
    },
    async getNodeConfig<T = unknown>(nodeId: string) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}`), { headers })
      if (!response.ok) throw new Error(`Node config load failed: ${response.status}`)
      return await response.json() as { config: T | undefined; path: string }
    },
    async updateNodeConfig<T = unknown>(nodeId: string, config: T) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}`), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ config }),
      })
      if (!response.ok) throw new Error(`Node config save failed: ${response.status}`)
      return await response.json() as { config: T; path: string }
    },
    async getNodeConfigVersions(nodeId: string, options: { limit?: number } = {}) {
      const query = options.limit === undefined ? "" : `?limit=${encodeURIComponent(options.limit)}`
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/versions${query}`), { headers })
      if (!response.ok) throw new Error(`Node config history load failed: ${response.status}`)
      return await response.json() as { versions: ConfigVersion[] }
    },
    async inspectNodeConfigVersion(nodeId: string, revision: string) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/versions/${encodeURIComponent(revision)}`), { headers })
      if (!response.ok) throw new Error(`Node config version load failed: ${response.status}`)
      return await response.json() as ConfigVersionDetail
    },
    async restoreNodeConfigVersion<T = unknown>(nodeId: string, revision: string) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/versions/${encodeURIComponent(revision)}/restore`), { method: "POST", headers })
      if (!response.ok) throw new Error(`Node config restore failed: ${response.status}`)
      return await response.json() as { config: T; path: string }
    },
    async exportNodeConfig(nodeId: string, format: "json" | "toml" = "toml") {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/export?format=${format}`), { headers })
      if (!response.ok) throw new Error(`Node config export failed: ${response.status}`)
      return await response.json() as NodeConfigExportResult
    },
    async importNodeConfig<T = unknown>(nodeId: string, content: string, format: "auto" | "json" | "toml" = "auto") {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/import`), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ content, format }),
      })
      if (!response.ok) throw new Error(`Node config import failed: ${response.status}`)
      return await response.json() as { config: T; path: string }
    },
    async createNodeConfigBackup(nodeId: string, label?: string) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/backup`), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ label }),
      })
      if (!response.ok) throw new Error(`Node config backup failed: ${response.status}`)
      return await response.json() as { version: ConfigVersion }
    },
    async getConfigHistoryRepositoryStatus() {
      const response = await fetch(apiUrl(baseUrl, "/config/history-repository"), { headers })
      if (!response.ok) throw new Error(`Config history repository load failed: ${response.status}`)
      return await response.json() as ConfigHistoryRepositoryStatus
    },
    async setConfigHistoryRemote(url: string | null) {
      const response = await fetch(apiUrl(baseUrl, "/config/history-repository/remote"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!response.ok) throw new Error(`Config history remote update failed: ${response.status}`)
      return await response.json() as ConfigHistoryRepositoryStatus
    },
    async syncConfigHistory(direction: "pull" | "push") {
      const response = await fetch(apiUrl(baseUrl, "/config/history-repository/sync"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      })
      if (!response.ok) throw new Error(`Config history sync failed: ${response.status}`)
      return await response.json() as ConfigHistoryRepositoryStatus
    },
    async getNodePresets<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/presets`), { headers })
      if (!response.ok) throw new Error(`Node preset load failed: ${response.status}`)
      return await response.json() as { presets: Array<NodePreset<TValues>> }
    },
    async createNodePreset<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string, input: { name: string; values: TValues }) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/presets`), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(`Node preset create failed: ${response.status}`)
      return await response.json() as { preset: NodePreset<TValues> }
    },
    async updateNodePreset<TValues extends Record<string, unknown> = Record<string, unknown>>(nodeId: string, presetId: string, input: { name?: string; values?: TValues }) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/presets/${encodeURIComponent(presetId)}`), {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(`Node preset update failed: ${response.status}`)
      return await response.json() as { preset: NodePreset<TValues> }
    },
    async deleteNodePreset(nodeId: string, presetId: string) {
      const response = await fetch(apiUrl(baseUrl, `/config/nodes/${encodeURIComponent(nodeId)}/presets/${encodeURIComponent(presetId)}`), {
        method: "DELETE",
        headers,
      })
      if (!response.ok) throw new Error(`Node preset delete failed: ${response.status}`)
      return await response.json() as { deleted: boolean }
    },
    async getAppConfig<T = unknown>(section: string) {
      const response = await fetch(apiUrl(baseUrl, `/config/app/${encodeURIComponent(section)}`), { headers })
      if (!response.ok) throw new Error(`App config load failed: ${response.status}`)
      return await response.json() as { config: T | undefined; path: string }
    },
    async updateAppConfig<T = unknown>(section: string, config: T) {
      const response = await fetch(apiUrl(baseUrl, `/config/app/${encodeURIComponent(section)}`), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ config }),
      })
      if (!response.ok) throw new Error(`App config save failed: ${response.status}`)
      return await response.json() as { config: T; path: string }
    },
    async getCustomThemes() {
      const response = await fetch(apiUrl(baseUrl, "/config/themes"), { headers })
      if (!response.ok) throw new Error(`Custom themes load failed: ${response.status}`)
      return await response.json() as { themes: unknown[]; path: string }
    },
    async saveCustomThemes(themes: unknown[]) {
      const response = await fetch(apiUrl(baseUrl, "/config/themes"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ themes }),
      })
      if (!response.ok) throw new Error(`Custom themes save failed: ${response.status}`)
      return await response.json() as { themes: unknown[]; path: string }
    },
    async getBackgroundImage() {
      const response = await fetch(apiUrl(baseUrl, "/config/bg-image"), { headers })
      if (!response.ok) throw new Error(`Background image load failed: ${response.status}`)
      return await response.json() as { url: string | null; path: string }
    },
    async saveBackgroundImage(url: string | null) {
      const response = await fetch(apiUrl(baseUrl, "/config/bg-image"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!response.ok) throw new Error(`Background image save failed: ${response.status}`)
      return await response.json() as { url: string | null; path: string }
    },
    async openConfigFile() {
      const response = await fetch(apiUrl(baseUrl, "/config/open"), {
        method: "POST",
        headers,
      })
      if (!response.ok) throw new Error(`Config open failed: ${response.status}`)
      return await response.json() as { opened: boolean; path: string }
    },
    async importLegacy(legacyPath: string, nodeId: string) {
      const response = await fetch(apiUrl(baseUrl, "/config/import-legacy"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ legacyPath, nodeId }),
      })
      if (!response.ok) throw new Error(`Legacy import failed: ${response.status}`)
      return await response.json() as { imported: boolean; config: unknown; path: string }
    },
  }
}

export function createXiraniteSystemClient(baseUrl: string, options: XiraniteClientOptions = {}): XiraniteSystemClient {
  const headers = requestHeaders(options)

  return {
    async health() {
      const response = await fetch(apiUrl(baseUrl, "/health"), { headers })
      if (!response.ok) throw new Error(`Local backend health check failed: ${response.status}`)
      return await response.json() as { ok: boolean; instanceId?: string }
    },
  }
}

export interface XiraniteFileDeletionClient {
  list(query: FileDeletionQuery): Promise<FileDeletionList>
  listNodes(): Promise<string[]>
  restore(id: string): Promise<FileDeletionRestoreResult>
  exportUrl(format: FileDeletionExportFormat, query?: Omit<FileDeletionQuery, "cursor" | "limit">): string
}

export function createXiraniteWorkspaceClient(baseUrl: string, options: XiraniteClientOptions = {}): XiraniteWorkspaceClient {
  const headers = requestHeaders(options)

  return {
    async loadSnapshot() {
      const response = await fetch(apiUrl(baseUrl, "/workspace/snapshot"), { headers })
      if (!response.ok) throw new Error(`Workspace snapshot load failed: ${response.status}`)
      const result = await response.json() as { snapshot: WorkspaceSnapshotDTO }
      return result.snapshot
    },
    async persistSnapshot(snapshot) {
      const response = await fetch(apiUrl(baseUrl, "/workspace/snapshot"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(snapshot),
      })
      if (!response.ok) throw new Error(`Workspace snapshot persist failed: ${response.status}`)
      const result = await response.json() as { snapshot: WorkspaceSnapshotDTO }
      return result.snapshot
    },
    async resolveComponentWindowSize(input) {
      const url = apiUrl(baseUrl, "/workspace/window-size")
      url.searchParams.set("componentId", input.componentId)
      url.searchParams.set("moduleId", input.moduleId)
      url.searchParams.set("workspaceId", input.workspaceId)
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`Component window size load failed: ${response.status}`)
      const result = await response.json() as { size: ComponentWindowSizeDTO | null }
      return result.size
    },
    async persistComponentWindowSize(input) {
      const response = await fetch(apiUrl(baseUrl, "/workspace/window-size"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(`Component window size persist failed: ${response.status}`)
      const result = await response.json() as { size: ComponentWindowSizeDTO }
      return result.size
    },
  }
}

export function createXiraniteNodeClient(baseUrl: string, options: XiraniteClientOptions = {}): XiraniteNodeClient {
  const headers = requestHeaders(options)

  return {
    async getNodeRuntimeInfo<TInfo = unknown>(nodeId: string) {
      const response = await fetch(apiUrl(baseUrl, `/nodes/${encodeURIComponent(nodeId)}/runtime-info`), { headers })
      if (!response.ok) throw new Error(`Node runtime info load failed: ${response.status}`)
      const payload = await response.json() as { info: TInfo }
      return payload.info
    },
    async startNodeOperation(nodeId, input, context) {
      const response = await fetch(apiUrl(baseUrl, `/nodes/${encodeURIComponent(nodeId)}/operations`), {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input, context }),
      })
      if (!response.ok) throw new Error(`Node operation start failed: ${response.status}`)
      const data = await response.json() as NodeOperationStartResponseDTO
      return data.operation
    },
    async getNodeOperation<TData = unknown>(operationId: string) {
      const response = await fetch(apiUrl(baseUrl, `/node-operations/${encodeURIComponent(operationId)}`), {
        headers,
      })
      if (!response.ok) throw new Error(`Node operation load failed: ${response.status}`)
      const data = await response.json() as { operation: NodeOperationDTO<TData> }
      return data.operation
    },
    async listNodeOperations<TData = unknown>(listOptions?: { nodeId?: string; activeOnly?: boolean; limit?: number }) {
      const url = apiUrl(baseUrl, "/node-operations")
      if (listOptions?.nodeId) url.searchParams.set("nodeId", listOptions.nodeId)
      if (listOptions?.activeOnly) url.searchParams.set("activeOnly", "true")
      if (listOptions?.limit !== undefined) url.searchParams.set("limit", String(listOptions.limit))
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`Node operation list failed: ${response.status}`)
      return await response.json() as NodeOperationListResponseDTO<TData>
    },
    async getNodeOperationEvents<TData = unknown>(operationId: string, eventOptions?: { fromEventIndex?: number; limit?: number }) {
      const url = apiUrl(baseUrl, `/node-operations/${encodeURIComponent(operationId)}/events`)
      if (eventOptions?.fromEventIndex !== undefined) url.searchParams.set("from", String(eventOptions.fromEventIndex))
      if (eventOptions?.limit !== undefined) url.searchParams.set("limit", String(eventOptions.limit))
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`Node operation events load failed: ${response.status}`)
      return await response.json() as NodeOperationEventsResponseDTO<TData>
    },
    async cancelNodeOperation<TData = unknown>(operationId: string) {
      const response = await fetch(apiUrl(baseUrl, `/node-operations/${encodeURIComponent(operationId)}/cancel`), {
        method: "POST",
        headers,
      })
      if (!response.ok) throw new Error(`Node operation cancel failed: ${response.status}`)
      const data = await response.json() as { operation: NodeOperationDTO<TData> }
      return data.operation
    },
    async pauseNodeOperation<TData = unknown>(operationId: string) {
      return await controlNodeOperation<TData>(baseUrl, headers, operationId, "pause")
    },
    async resumeNodeOperation<TData = unknown>(operationId: string) {
      return await controlNodeOperation<TData>(baseUrl, headers, operationId, "resume")
    },
    async cleanupNodeOperations(cleanupOptions?: { maxAgeMs?: number }) {
      const url = apiUrl(baseUrl, "/node-operations")
      if (cleanupOptions?.maxAgeMs !== undefined) url.searchParams.set("maxAgeMs", String(cleanupOptions.maxAgeMs))
      const response = await fetch(url, {
        method: "DELETE",
        headers,
      })
      if (!response.ok) throw new Error(`Node operation cleanup failed: ${response.status}`)
      return await response.json() as NodeOperationCleanupResponseDTO
    },
    async streamNodeOperation<TData = unknown>(operationId: string, onMessage: (message: NodeOperationStreamMessageDTO<TData>) => void, streamOptions?: { fromEventIndex?: number }) {
      const url = apiUrl(baseUrl, `/node-operations/${encodeURIComponent(operationId)}/stream`)
      if (streamOptions?.fromEventIndex !== undefined) url.searchParams.set("from", String(streamOptions.fromEventIndex))
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`Node operation stream failed: ${response.status}`)
      await readNdjsonStream<NodeOperationStreamMessageDTO>(response, (message) => {
        onMessage(message as NodeOperationStreamMessageDTO<TData>)
      })
    },
    async runNode<TInput = unknown, TData = unknown>(nodeId: string, input: TInput, onEvent?: (event: NodeRunEventDTO) => void) {
      const operation = await this.startNodeOperation(nodeId, input)
      let finalResult: NodeRunResultDTO<TData> | undefined
      await this.streamNodeOperation<TData>(operation.operationId, (message) => {
        if (message.type === "event") onEvent?.(message.event)
        if (message.type === "result") finalResult = message.result
      })
      if (!finalResult) throw new Error(`Node operation did not return a result: ${operation.operationId}`)
      return finalResult
    },
  }
}

export function createXiraniteRuntimeHistoryClient(baseUrl: string, options: XiraniteClientOptions = {}): XiraniteRuntimeHistoryClient {
  const headers = requestHeaders(options)

  return {
    async list(query) {
      const url = apiUrl(baseUrl, "/runtime-history")
      if (query.kind) url.searchParams.set("kind", query.kind)
      if (query.operation) url.searchParams.set("operation", query.operation)
      if (query.nodeId) url.searchParams.set("nodeId", query.nodeId)
      if (query.componentId) url.searchParams.set("componentId", query.componentId)
      if (query.workspaceId) url.searchParams.set("workspaceId", query.workspaceId)
      if (query.status) url.searchParams.set("status", query.status)
      if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit))
      if (query.cursor) url.searchParams.set("cursor", query.cursor)
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`Runtime history load failed: ${response.status}`)
      return await response.json() as RuntimeHistoryListDTO
    },
    async get(id) {
      const response = await fetch(apiUrl(baseUrl, `/runtime-history/${encodeURIComponent(id)}`), { headers })
      if (!response.ok) throw new Error(`Runtime history item load failed: ${response.status}`)
      const data = await response.json() as { item: RuntimeHistoryItemDTO }
      return data.item
    },
    async delete(id) {
      const response = await fetch(apiUrl(baseUrl, `/runtime-history/${encodeURIComponent(id)}`), {
        method: "DELETE",
        headers,
      })
      if (!response.ok) throw new Error(`Runtime history delete failed: ${response.status}`)
    },
    async clear(query) {
      const url = apiUrl(baseUrl, "/runtime-history")
      if (query.kind) url.searchParams.set("kind", query.kind)
      if (query.operation) url.searchParams.set("operation", query.operation)
      if (query.nodeId) url.searchParams.set("nodeId", query.nodeId)
      if (query.componentId) url.searchParams.set("componentId", query.componentId)
      if (query.workspaceId) url.searchParams.set("workspaceId", query.workspaceId)
      if (query.before !== undefined) url.searchParams.set("before", String(query.before))
      const response = await fetch(url, { method: "DELETE", headers })
      if (!response.ok) throw new Error(`Runtime history clear failed: ${response.status}`)
      return await response.json() as RuntimeHistoryClearResultDTO
    },
  }
}

export function createXiraniteFileDeletionClient(
  baseUrl: string,
  options: XiraniteClientOptions = {},
): XiraniteFileDeletionClient {
  const headers = requestHeaders(options)

  return {
    async list(query) {
      const url = fileDeletionUrl(baseUrl, "/file-deletions", query)
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`File deletion history load failed: ${response.status}`)
      return await response.json() as FileDeletionList
    },
    async listNodes() {
      const response = await fetch(apiUrl(baseUrl, "/file-deletions/nodes"), { headers })
      if (!response.ok) throw new Error(`File deletion node list failed: ${response.status}`)
      const data = await response.json() as { nodes: string[] }
      return data.nodes
    },
    async restore(id) {
      const response = await fetch(apiUrl(baseUrl, `/file-deletions/${encodeURIComponent(id)}/restore`), {
        method: "POST",
        headers,
      })
      if (!response.ok) throw new Error(`File deletion restore failed: ${response.status}`)
      return await response.json() as FileDeletionRestoreResult
    },
    exportUrl(format, query = {}) {
      const url = fileDeletionUrl(baseUrl, "/file-deletions/export", query)
      url.searchParams.set("format", format)
      if (options.token) url.searchParams.set("token", options.token)
      return url.href
    },
  }
}

function fileDeletionUrl(
  baseUrl: string,
  path: string,
  query: Omit<FileDeletionQuery, "cursor" | "limit"> & Pick<FileDeletionQuery, "cursor" | "limit">,
): URL {
  const url = apiUrl(baseUrl, path)
  if (query.nodeId) url.searchParams.set("nodeId", query.nodeId)
  if (query.componentId) url.searchParams.set("componentId", query.componentId)
  if (query.workspaceId) url.searchParams.set("workspaceId", query.workspaceId)
  if (query.state) url.searchParams.set("state", query.state)
  if (query.deletionKind) url.searchParams.set("deletionKind", query.deletionKind)
  if (query.restoreAvailable !== undefined) url.searchParams.set("restoreAvailable", String(query.restoreAvailable))
  if (query.from !== undefined) url.searchParams.set("from", String(query.from))
  if (query.to !== undefined) url.searchParams.set("to", String(query.to))
  if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit))
  if (query.cursor) url.searchParams.set("cursor", query.cursor)
  return url
}

function requestHeaders(options: XiraniteClientOptions): Record<string, string> {
  return options.token ? { "x-xiranite-token": options.token } : {}
}

function apiUrl(baseUrl: string, path: string): URL {
  return appendUrlPath(baseUrl, path)
}

export interface NodePreset<TValues extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  name: string
  values: TValues
}

async function controlNodeOperation<TData>(baseUrl: string, headers: HeadersInit, operationId: string, action: "pause" | "resume"): Promise<NodeOperationDTO<TData>> {
  const response = await fetch(apiUrl(baseUrl, `/node-operations/${encodeURIComponent(operationId)}/${action}`), { method: "POST", headers })
  if (!response.ok) throw new Error(`Node operation ${action} failed: ${response.status}`)
  const data = await response.json() as { operation: NodeOperationDTO<TData> }
  return data.operation
}

export function createXiraniteNodeRunHistoryClient(baseUrl: string, options: XiraniteClientOptions = {}): XiraniteNodeRunHistoryClient {
  const headers = requestHeaders(options)

  return {
    async list(query) {
      const url = apiUrl(baseUrl, "/node-run-history")
      if (query.nodeId) url.searchParams.set("nodeId", query.nodeId)
      if (query.componentId) url.searchParams.set("componentId", query.componentId)
      if (query.workspaceId) url.searchParams.set("workspaceId", query.workspaceId)
      if (query.status) url.searchParams.set("status", query.status)
      if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit))
      if (query.cursor) url.searchParams.set("cursor", query.cursor)
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`Node run history load failed: ${response.status}`)
      return await response.json() as NodeRunHistoryListDTO
    },
    async get(id) {
      const response = await fetch(apiUrl(baseUrl, `/node-run-history/${encodeURIComponent(id)}`), { headers })
      if (!response.ok) throw new Error(`Node run history item load failed: ${response.status}`)
      const data = await response.json() as { item: NodeRunHistoryItemDTO }
      return data.item
    },
    async delete(id) {
      const response = await fetch(apiUrl(baseUrl, `/node-run-history/${encodeURIComponent(id)}`), {
        method: "DELETE",
        headers,
      })
      if (!response.ok) throw new Error(`Node run history delete failed: ${response.status}`)
    },
    async clear(query) {
      const url = apiUrl(baseUrl, "/node-run-history")
      if (query.nodeId) url.searchParams.set("nodeId", query.nodeId)
      if (query.componentId) url.searchParams.set("componentId", query.componentId)
      if (query.workspaceId) url.searchParams.set("workspaceId", query.workspaceId)
      if (query.before !== undefined) url.searchParams.set("before", String(query.before))
      const response = await fetch(url, { method: "DELETE", headers })
      if (!response.ok) throw new Error(`Node run history clear failed: ${response.status}`)
      return await response.json() as NodeRunHistoryClearResultDTO
    },
  }
}

async function readNdjsonStream<TMessage>(response: Response, onMessage: (message: TMessage) => void): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Response does not contain a readable stream.")

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = consumeLines(buffer, onMessage)
  }

  buffer += decoder.decode()
  consumeLines(`${buffer}\n`, onMessage)
}

function consumeLines<TMessage>(buffer: string, onMessage: (message: TMessage) => void): string {
  const lines = buffer.split(/\r?\n/)
  const rest = lines.pop() ?? ""
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) onMessage(JSON.parse(trimmed) as TMessage)
  }
  return rest
}
