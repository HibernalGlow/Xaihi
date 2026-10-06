import { Elysia, t } from "elysia"
import type { XiraniteServices } from "@xiranite/services"
import {
  createWorkspaceInputSchema,
  componentWindowSizeLookupSchema,
  componentWindowSizeUpdateSchema,
  nexusCaptureRequestSchema,
  NODE_MEMORY_PROTECTION_APP_SECTION,
  nodeMemoryProtectionSettingsSchema,
  nodeRunHistoryClearQuerySchema,
  nodeRunHistoryQuerySchema,
  nodeRunRequestSchema,
  renameWorkspaceInputSchema,
  runtimeHistoryClearQuerySchema,
  runtimeHistoryQuerySchema,
  workspaceSnapshotSchema,
  type NodeOperationStreamMessageDTO,
  type NodeRunEventDTO,
} from "@xiranite/shared"
import { NexusCaptureInbox } from "./nexusCaptureInbox.js"

export function createXiraniteApp(services: XiraniteServices) {
  const nexusCaptures = new NexusCaptureInbox()
  return new Elysia({ name: "xiranite-api" })
    .get("/health", () => ({ ok: true }))
    .post("/nexus/captures", ({ body, set }) => {
      const capture = nexusCaptures.add(body)
      set.status = 202
      return { id: capture.id, accepted: true }
    }, {
      body: nexusCaptureRequestSchema,
    })
    .get("/nexus/captures", ({ query }) => ({
      captures: nexusCaptures.list(query.targetNodeId || undefined),
    }), {
      query: t.Object({ targetNodeId: t.Optional(t.String()) }),
    })
    .delete("/nexus/captures/:id", ({ params, set }) => {
      const removed = nexusCaptures.remove(params.id)
      if (!removed) set.status = 404
      return { removed }
    })
    .post("/system/restart", async ({ set }) => {
      const restartBackend = services.system?.restartBackend
      if (!restartBackend) {
        set.status = 501
        return {
          restarted: false,
          supported: false,
          message: "Local backend restart is not supported by this runtime.",
        }
      }
      return await restartBackend()
    })
    .get("/system/node-source-hot-reload", ({ set }) => {
      const getEnabled = services.system?.getNodeSourceHotReload
      if (!getEnabled) {
        set.status = 501
        return { supported: false, enabled: false }
      }
      return { supported: true, enabled: getEnabled() }
    })
    .put("/system/node-source-hot-reload", ({ body, set }) => {
      const setEnabled = services.system?.setNodeSourceHotReload
      if (!setEnabled) {
        set.status = 501
        return { supported: false, enabled: false }
      }
      return { supported: true, enabled: setEnabled(body.enabled) }
    }, {
      body: t.Object({ enabled: t.Boolean() }),
    })
    .get("/system/node-memory-protection", ({ set }) => {
      const getSettings = services.system?.getNodeMemoryProtection
      if (!getSettings) {
        set.status = 501
        return { supported: false, settings: null }
      }
      return { supported: true, settings: getSettings() }
    })
    .put("/system/node-memory-protection", async ({ body, set }) => {
      const setSettings = services.system?.setNodeMemoryProtection
      if (!setSettings) {
        set.status = 501
        return { supported: false, settings: null }
      }
      const parsed = nodeMemoryProtectionSettingsSchema.safeParse(body)
      if (!parsed.success) {
        set.status = 400
        return { supported: true, settings: null, error: "Invalid node memory protection settings." }
      }
      const persisted = await services.config.updateAppConfig(NODE_MEMORY_PROTECTION_APP_SECTION, parsed.data)
      const merged = nodeMemoryProtectionSettingsSchema.safeParse(persisted.config)
      const settings = setSettings(merged.success ? merged.data : parsed.data)
      return { supported: true, settings }
    }, {
      body: t.Any(),
    })
    .post("/nodes/:id/operations", ({ body, params }) => {
      const operation = services.nodes.startOperation(params.id, body.input, body.context)
      return { operation }
    }, {
      body: nodeRunRequestSchema,
    })
    .post("/nodes/:id/run", async ({ body, params }) => {
      const events: NodeRunEventDTO[] = []
      const result = await services.nodes.runNode(params.id, body.input, (event) => {
        events.push(event)
        if (events.length > 1_000) events.splice(0, events.length - 1_000)
      }, body.context)
      return { result, events }
    }, {
      body: nodeRunRequestSchema,
    })
    .get("/nodes/:id/runtime-info", async ({ params, set }) => {
      try {
        return { info: await services.nodes.getNodeRuntimeInfo(params.id) }
      } catch (error) {
        set.status = 404
        return { error: error instanceof Error ? error.message : String(error) }
      }
    })
    .delete("/node-operations", ({ query }) => {
      return services.nodes.cleanupOperations({
        maxAgeMs: parseOptionalInteger(query.maxAgeMs),
      })
    })
    .get("/node-operations", ({ query }) => {
      return services.nodes.listOperations({
        nodeId: query.nodeId || undefined,
        activeOnly: query.activeOnly === "true",
        limit: parseOptionalInteger(query.limit),
      })
    })
    .get("/node-operations/:operationId/events", ({ params, query, set }) => {
      const events = services.nodes.getOperationEvents(params.operationId, {
        fromEventIndex: parseEventIndex(query.from),
        limit: parseOptionalInteger(query.limit),
      })
      if (!events) {
        set.status = 404
        return { error: "Node operation not found." }
      }
      return events
    })
    .post("/node-operations/:operationId/cancel", ({ params, set }) => {
      const operation = services.nodes.cancelOperation(params.operationId)
      if (!operation) {
        set.status = 404
        return { error: "Node operation not found." }
      }
      return { operation }
    })
    .post("/node-operations/:operationId/pause", ({ params, set }) => {
      const operation = services.nodes.pauseOperation(params.operationId)
      if (!operation) { set.status = 404; return { error: "Node operation not found." } }
      return { operation }
    })
    .post("/node-operations/:operationId/resume", ({ params, set }) => {
      const operation = services.nodes.resumeOperation(params.operationId)
      if (!operation) { set.status = 404; return { error: "Node operation not found." } }
      return { operation }
    })
    .get("/node-operations/:operationId/stream", ({ params, query, set }) => {
      const operation = services.nodes.getOperation(params.operationId)
      if (!operation) {
        set.status = 404
        return { error: "Node operation not found." }
      }

      const fromEventIndex = parseEventIndex(query.from)
      return createNodeOperationStream(services, params.operationId, fromEventIndex)
    })
    .get("/node-operations/:operationId", ({ params, set }) => {
      const operation = services.nodes.getOperation(params.operationId)
      if (!operation) {
        set.status = 404
        return { error: "Node operation not found." }
      }
      return { operation }
    })
    .get("/workspace", async () => {
      const workspaces = await services.workspace.listWorkspaces()
      return { workspaces }
    })
    .get("/workspace/snapshot", async () => {
      const snapshot = await services.workspace.getSnapshot()
      return { snapshot }
    })
    .put("/workspace/snapshot", async ({ body }) => {
      const snapshot = await services.workspace.saveSnapshot(body)
      return { snapshot }
    }, {
      body: workspaceSnapshotSchema,
    })
    .get("/workspace/window-size", async ({ query }) => {
      const size = await services.workspace.resolveComponentWindowSize(query)
      return { size: size ?? null }
    }, {
      query: componentWindowSizeLookupSchema,
    })
    .put("/workspace/window-size", async ({ body }) => {
      const size = await services.workspace.saveComponentWindowSize(body)
      return { size }
    }, {
      body: componentWindowSizeUpdateSchema,
    })
    .post("/workspace", async ({ body, set }) => {
      const workspace = await services.workspace.createWorkspace(body)
      set.status = 201
      return { workspace }
    }, {
      body: createWorkspaceInputSchema,
    })
    .post("/workspace/:id/rename", async ({ body, params }) => {
      const workspace = await services.workspace.renameWorkspace(params.id, body)
      return { workspace }
    }, {
      body: renameWorkspaceInputSchema,
    })
    .delete("/workspace/:id", async ({ params }) => {
      await services.workspace.deleteWorkspace(params.id)
      return { ok: true }
    })
    .get("/runtime-history", async ({ query, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Runtime history is not available." }
      }
      const parsed = runtimeHistoryQuerySchema.parse(query)
      return await services.history.listRuntime(parsed)
    })
    .get("/runtime-history/:id", async ({ params, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Runtime history is not available." }
      }
      const item = await services.history.getRuntime(params.id)
      if (!item) {
        set.status = 404
        return { error: "History item not found." }
      }
      return { item }
    })
    .delete("/runtime-history/:id", async ({ params, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Runtime history is not available." }
      }
      await services.history.deleteRuntime(params.id)
      return { ok: true }
    })
    .delete("/runtime-history", async ({ query, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Runtime history is not available." }
      }
      const parsed = runtimeHistoryClearQuerySchema.parse(query)
      return await services.history.clearRuntime(parsed)
    })
    .get("/node-run-history", async ({ query, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Node run history is not available." }
      }
      const parsed = nodeRunHistoryQuerySchema.parse(query)
      return await services.history.list(parsed)
    })
    .get("/node-run-history/:id", async ({ params, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Node run history is not available." }
      }
      const item = await services.history.get(params.id)
      if (!item) {
        set.status = 404
        return { error: "History item not found." }
      }
      return { item }
    })
    .delete("/node-run-history/:id", async ({ params, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Node run history is not available." }
      }
      await services.history.delete(params.id)
      return { ok: true }
    })
    .delete("/node-run-history", async ({ query, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Node run history is not available." }
      }
      const parsed = nodeRunHistoryClearQuerySchema.parse(query)
      return await services.history.clear(parsed)
    })
    .get("/config", async () => {
      const result = await services.config.getConfig()
      return result
    })
    .get("/config/path", () => {
      return { path: services.config.getConfigPath() }
    })
    .post("/config/open", async () => {
      return await services.config.openConfigFile()
    })
    .get("/config/history-repository", async () => {
      return await services.config.getConfigHistoryRepositoryStatus()
    })
    .put("/config/history-repository/remote", async ({ body }) => {
      return await services.config.setConfigHistoryRemote(body.url)
    }, {
      body: t.Object({ url: t.Union([t.String(), t.Null()]) }),
    })
    .post("/config/history-repository/sync", async ({ body }) => {
      return await services.config.syncConfigHistory(body.direction)
    }, {
      body: t.Object({ direction: t.Union([t.Literal("pull"), t.Literal("push")]) }),
    })
    .get("/config/nodes/:nodeId/presets", async ({ params }) => {
      return await services.config.getNodePresets(params.nodeId)
    })
    .post("/config/nodes/:nodeId/presets", async ({ body, params }) => {
      return await services.config.createNodePreset(params.nodeId, body)
    }, {
      body: t.Object({
        name: t.String(),
        values: t.Object({}, { additionalProperties: true }),
      }),
    })
    .patch("/config/nodes/:nodeId/presets/:presetId", async ({ body, params }) => {
      return await services.config.updateNodePreset(params.nodeId, params.presetId, body)
    }, {
      body: t.Object({
        name: t.Optional(t.String()),
        values: t.Optional(t.Object({}, { additionalProperties: true })),
      }),
    })
    .delete("/config/nodes/:nodeId/presets/:presetId", async ({ params }) => {
      return await services.config.deleteNodePreset(params.nodeId, params.presetId)
    })
    .get("/config/nodes/:nodeId/versions", async ({ params, query }) => {
      const limit = query.limit === undefined ? undefined : Number(query.limit)
      return await services.config.getNodeConfigVersions(params.nodeId, { limit })
    }, {
      query: t.Object({ limit: t.Optional(t.String()) }),
    })
    .get("/config/nodes/:nodeId/versions/:revision", async ({ params }) => {
      return await services.config.inspectNodeConfigVersion(params.nodeId, params.revision)
    })
    .post("/config/nodes/:nodeId/versions/:revision/restore", async ({ params }) => {
      return await services.config.restoreNodeConfigVersion(params.nodeId, params.revision)
    })
    .get("/config/nodes/:nodeId/export", async ({ params, query }) => {
      return await services.config.exportNodeConfig(params.nodeId, query.format)
    }, {
      query: t.Object({ format: t.Optional(t.Union([t.Literal("json"), t.Literal("toml")])) }),
    })
    .post("/config/nodes/:nodeId/import", async ({ body, params }) => {
      return await services.config.importNodeConfig(params.nodeId, body.content, body.format)
    }, {
      body: t.Object({
        content: t.String(),
        format: t.Optional(t.Union([t.Literal("auto"), t.Literal("json"), t.Literal("toml")])),
      }),
    })
    .post("/config/nodes/:nodeId/backup", async ({ body, params }) => {
      return await services.config.createNodeConfigBackup(params.nodeId, body.label)
    }, {
      body: t.Object({ label: t.Optional(t.String()) }),
    })
    .get("/config/nodes/:nodeId", async ({ params }) => {
      return await services.config.getNodeConfig(params.nodeId)
    })
    .put("/config/nodes/:nodeId", async ({ body, params }) => {
      const { config } = body as { config: unknown }
      return await services.config.updateNodeConfig(params.nodeId, config)
    }, {
      body: t.Object({
        config: t.Any(),
      }),
    })
    .get("/config/app/:section", async ({ params }) => {
      return await services.config.getAppConfig(params.section)
    })
    .put("/config/app/:section", async ({ body, params }) => {
      const { config } = body as { config: unknown }
      return await services.config.updateAppConfig(params.section, config)
    }, {
      body: t.Object({
        config: t.Any(),
      }),
    })
    .get("/config/webview2", async () => {
      const result = await services.config.getWebview2Config()
      return { config: result.config, path: result.path }
    })
    .put("/config/webview2", async ({ body }) => {
      const result = await services.config.updateWebview2Config(body.config)
      return { config: result.config, path: result.path }
    }, {
      body: t.Object({
        config: t.Object({
          features: t.Array(t.String()),
          switches: t.Array(t.String()),
        }),
      }),
    })
    .get("/config/themes", async () => {
      return await services.config.getCustomThemes()
    })
    .put("/config/themes", async ({ body }) => {
      const { themes } = body as { themes: unknown[] }
      return await services.config.saveCustomThemes(themes)
    }, {
      body: t.Object({
        themes: t.Array(t.Any()),
      }),
    })
    .get("/config/bg-image", async () => {
      return await services.config.getBackgroundImage()
    })
    .put("/config/bg-image", async ({ body }) => {
      const { url } = body as { url: string | null }
      return await services.config.saveBackgroundImage(url)
    }, {
      body: t.Object({
        url: t.Union([t.String(), t.Null()]),
      }),
    })
    .post("/config/import-legacy", async ({ body }) => {
      const { legacyPath, nodeId } = body as { legacyPath: string; nodeId: string }
      return await services.config.importLegacy(legacyPath, nodeId)
    }, {
      body: t.Object({
        legacyPath: t.String(),
        nodeId: t.String(),
      }),
    })
}

export type XiraniteApp = ReturnType<typeof createXiraniteApp>

export { createNodeAppApi } from "./nodeApp.js"

function parseEventIndex(value: unknown): number {
  if (typeof value !== "string" || value.trim() === "") return 0
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function parseOptionalInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

const NODE_STREAM_MAX_PENDING_MESSAGES = 256
const NODE_STREAM_MAX_PENDING_BYTES = 2 * 1024 * 1024

interface PendingNodeStreamMessage {
  message: NodeOperationStreamMessageDTO
  bytes: Uint8Array
}

function createNodeOperationStream(services: XiraniteServices, operationId: string, fromEventIndex: number): Response {
  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  let closed = false
  let terminalQueued = false
  let pendingBytes = 0
  const pending: PendingNodeStreamMessage[] = []
  let flushPending = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return
        closed = true
        unsubscribe()
        controller.close()
      }

      const flush = () => {
        while (!closed && pending.length && (controller.desiredSize ?? 0) > 0) {
          const next = pending.shift()!
          pendingBytes -= next.bytes.byteLength
          controller.enqueue(next.bytes)
        }
        if (terminalQueued && pending.length === 0) close()
      }
      flushPending = flush

      const write = (message: NodeOperationStreamMessageDTO) => {
        if (closed || terminalQueued) return
        const item = { message, bytes: encoder.encode(`${JSON.stringify(message)}\n`) }
        if (message.type === "result") terminalQueued = true
        pending.push(item)
        pendingBytes += item.bytes.byteLength
        trimNodeStreamQueue(pending, () => pendingBytes, (removedBytes) => { pendingBytes -= removedBytes })
        flush()
      }

      unsubscribe = services.nodes.subscribeOperation(operationId, write, {
        fromEventIndex,
        includeSnapshot: true,
      })
    },
    pull() {
      flushPending()
    },
    cancel() {
      closed = true
      pending.length = 0
      pendingBytes = 0
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function trimNodeStreamQueue(
  pending: PendingNodeStreamMessage[],
  currentBytes: () => number,
  removeBytes: (bytes: number) => void,
): void {
  while (pending.length > NODE_STREAM_MAX_PENDING_MESSAGES || currentBytes() > NODE_STREAM_MAX_PENDING_BYTES) {
    const removable = pending.findIndex((item) => item.message.type !== "result")
    if (removable < 0) return
    const [removed] = pending.splice(removable, 1)
    if (removed) removeBytes(removed.bytes.byteLength)
  }
}
