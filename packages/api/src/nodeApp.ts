import { Elysia, t } from "elysia"
import type { XiraniteServices } from "@xiranite/services"
import type { NodeOperationDTO, NodeOperationStreamMessageDTO } from "@xiranite/shared"

type ElysiaSet = { status?: number | string }

/**
 * HTTP surface for a single packaged node. Keeping this separate from the
 * workspace API prevents standalone applications from exposing workspace,
 * Nexus, runtime-history, or unrelated node routes.
 */
export interface NodeAppOperationLifecycle {
  onOperationStarted?: (operation: NodeOperationDTO) => Promise<void> | void
}

export function createNodeAppApi(services: XiraniteServices, nodeId: string, lifecycle: NodeAppOperationLifecycle = {}) {
  const rejectOtherNode = (requested: string, set: ElysiaSet) => {
    if (requested === nodeId) return false
    set.status = 404
    return true
  }

  return new Elysia({ name: "xiranite-node-app-api" })
    .get("/health", () => ({ ok: true, nodeId }))
    .post("/nodes/:id/operations", async ({ body, params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot run another node." }
      const operation = services.nodes.startOperation(nodeId, body.input, body.context)
      try {
        await lifecycle.onOperationStarted?.(operation)
      } catch (error) {
        services.nodes.cancelOperation(operation.operationId, "The standalone application could not record this operation for crash recovery.")
        set.status = 500
        return { error: error instanceof Error ? error.message : String(error) }
      }
      return { operation }
    }, { body: t.Object({ input: t.Any(), context: t.Optional(t.Object({ componentId: t.Optional(t.String()), workspaceId: t.Optional(t.String()) })) }) })
    .get("/node-operations", ({ query }) => {
      return services.nodes.listOperations({
        nodeId,
        activeOnly: query.activeOnly === "true",
        limit: optionalInteger(query.limit),
      })
    }, { query: t.Object({ activeOnly: t.Optional(t.String()), limit: t.Optional(t.String()) }) })
    .get("/node-operations/:operationId", ({ params, set }) => operationForNode(services, nodeId, params.operationId, set))
    .get("/node-operations/:operationId/events", ({ params, query, set }) => {
      const operation = operationForNode(services, nodeId, params.operationId, set)
      if ("error" in operation) return operation
      return services.nodes.getOperationEvents(params.operationId, {
        fromEventIndex: optionalInteger(query.from),
        limit: optionalInteger(query.limit),
      })
    }, { query: t.Object({ from: t.Optional(t.String()), limit: t.Optional(t.String()) }) })
    .get("/node-operations/:operationId/stream", ({ params, query, set }) => {
      const operation = operationForNode(services, nodeId, params.operationId, set)
      if ("error" in operation) return operation
      return createNodeOperationStream(services, params.operationId, optionalInteger(query.from) ?? 0)
    }, { query: t.Object({ from: t.Optional(t.String()) }) })
    .post("/node-operations/:operationId/cancel", ({ params, set }) => {
      const operation = operationForNode(services, nodeId, params.operationId, set)
      if ("error" in operation) return operation
      return { operation: services.nodes.cancelOperation(params.operationId) }
    })
    .post("/node-operations/:operationId/pause", ({ params, set }) => {
      const operation = operationForNode(services, nodeId, params.operationId, set)
      if ("error" in operation) return operation
      return { operation: services.nodes.pauseOperation(params.operationId) }
    })
    .post("/node-operations/:operationId/resume", ({ params, set }) => {
      const operation = operationForNode(services, nodeId, params.operationId, set)
      if ("error" in operation) return operation
      return { operation: services.nodes.resumeOperation(params.operationId) }
    })
    .get("/node-run-history", async ({ query, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Node run history is not available." }
      }
      return await services.history.list({ nodeId, limit: optionalInteger(query.limit) ?? 50 })
    }, { query: t.Object({ limit: t.Optional(t.String()) }) })
    .get("/node-run-history/:id", async ({ params, set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Node run history is not available." }
      }
      const item = await services.history.get(params.id)
      if (!item || item.nodeId !== nodeId) {
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
      const item = await services.history.get(params.id)
      if (!item || item.nodeId !== nodeId) {
        set.status = 404
        return { error: "History item not found." }
      }
      await services.history.delete(params.id)
      return { ok: true }
    })
    .delete("/node-run-history", async ({ set }) => {
      if (!services.history) {
        set.status = 503
        return { error: "Node run history is not available." }
      }
      return await services.history.clear({ nodeId })
    })
    .get("/config/path", () => ({ path: services.config.getConfigPath() }))
    .post("/config/open", async () => await services.config.openConfigFile())
    .get("/config/nodes/:id", async ({ params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot read another node configuration." }
      return await services.config.getNodeConfig(nodeId)
    })
    .put("/config/nodes/:id", async ({ body, params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot update another node configuration." }
      return await services.config.updateNodeConfig(nodeId, body.config)
    }, { body: t.Object({ config: t.Any() }) })
    .get("/config/nodes/:id/presets", async ({ params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot read another node presets." }
      return await services.config.getNodePresets(nodeId)
    })
    .post("/config/nodes/:id/presets", async ({ body, params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot update another node presets." }
      return await services.config.createNodePreset(nodeId, body)
    }, { body: t.Object({ name: t.String(), values: t.Object({}, { additionalProperties: true }) }) })
    .patch("/config/nodes/:id/presets/:presetId", async ({ body, params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot update another node presets." }
      return await services.config.updateNodePreset(nodeId, params.presetId, body)
    }, { body: t.Object({ name: t.Optional(t.String()), values: t.Optional(t.Object({}, { additionalProperties: true })) }) })
    .delete("/config/nodes/:id/presets/:presetId", async ({ params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot update another node presets." }
      return await services.config.deleteNodePreset(nodeId, params.presetId)
    })
    .get("/config/nodes/:id/versions", async ({ params, query, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot read another node configuration history." }
      return await services.config.getNodeConfigVersions(nodeId, { limit: optionalInteger(query.limit) })
    }, { query: t.Object({ limit: t.Optional(t.String()) }) })
    .get("/config/nodes/:id/versions/:revision", async ({ params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot read another node configuration history." }
      return await services.config.inspectNodeConfigVersion(nodeId, params.revision)
    })
    .post("/config/nodes/:id/versions/:revision/restore", async ({ params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot restore another node configuration." }
      return await services.config.restoreNodeConfigVersion(nodeId, params.revision)
    })
    .get("/config/nodes/:id/export", async ({ params, query, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot export another node configuration." }
      return await services.config.exportNodeConfig(nodeId, query.format)
    }, { query: t.Object({ format: t.Optional(t.Union([t.Literal("json"), t.Literal("toml")])) }) })
    .post("/config/nodes/:id/import", async ({ body, params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot import another node configuration." }
      return await services.config.importNodeConfig(nodeId, body.content, body.format)
    }, { body: t.Object({ content: t.String(), format: t.Optional(t.Union([t.Literal("auto"), t.Literal("json"), t.Literal("toml")])) }) })
    .post("/config/nodes/:id/backup", async ({ body, params, set }) => {
      if (rejectOtherNode(params.id, set)) return { error: "This node application cannot back up another node configuration." }
      return await services.config.createNodeConfigBackup(nodeId, body.label)
    }, { body: t.Object({ label: t.Optional(t.String()) }) })
    .get("/config/app/:section", async ({ params }) => {
      return await services.config.getAppConfig(params.section)
    })
    .put("/config/app/:section", async ({ body, params }) => {
      return await services.config.updateAppConfig(params.section, body.config)
    }, { body: t.Object({ config: t.Any() }) })
    .get("/config/themes", async () => {
      return await services.config.getCustomThemes()
    })
    .put("/config/themes", async ({ body }) => {
      return await services.config.saveCustomThemes(body.themes)
    }, { body: t.Object({ themes: t.Array(t.Any()) }) })
    .get("/config/bg-image", async () => {
      return await services.config.getBackgroundImage()
    })
    .put("/config/bg-image", async ({ body }) => {
      return await services.config.saveBackgroundImage(body.url)
    }, { body: t.Object({ url: t.Union([t.String(), t.Null()]) }) })
}

function operationForNode(services: XiraniteServices, nodeId: string, operationId: string, set: ElysiaSet) {
  const operation = services.nodes.getOperation(operationId)
  if (operation && operation.nodeId === nodeId) return operation
  set.status = 404
  return { error: "Node operation not found." }
}

function optionalInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function createNodeOperationStream(services: XiraniteServices, operationId: string, fromEventIndex: number): Response {
  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return
        closed = true
        unsubscribe()
        controller.close()
      }
      const write = (message: NodeOperationStreamMessageDTO) => {
        if (closed) return
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`))
        if (message.type === "result") close()
      }
      unsubscribe = services.nodes.subscribeOperation(operationId, write, {
        fromEventIndex,
        includeSnapshot: true,
      })
    },
    cancel() {
      closed = true
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
