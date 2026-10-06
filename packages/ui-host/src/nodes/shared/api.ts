/**
 * Node UI transport seam — how a node's React view reaches the backend, and nothing else.
 *
 * ADR-0069 forbids a node UI from depending on Xiranite's own state, so `src/nodes/**` must not import
 * `src/backend/**` (enforced by `bun run audit:node-ui-independence`). Everything a node needs from the
 * process behind it — node runs and their `/operations` journal, node-scoped configuration, source
 * thumbnails, the nexus inbox — is reachable from this module, and this module speaks only
 * `@xiranite/api/client` plus the injected endpoint. When the Rust/Axum host takes over (ADR-0063) the
 * endpoint and the adapter seams change; no node file does.
 *
 * Node-local operation state lives in `./nodeOperationStore.ts`, which projects the update feed published by
 * `src/lib/nodeOperationTransport.ts`; the Xiranite shell keeps its own projection in
 * `src/store/nodeOperationStoreBridge.ts`. Neither is imported from the other.
 */
import type { SourceThumbnailClient } from "@xiranite/api/client"
import type { NexusCaptureDTO } from "@xiranite/shared"
import { getSourceThumbnailApiClient, requestBackendApi } from "@/lib/xiraniteApiClient"

// Node runs and the operation journal: the same transport the Xiranite shell uses, exposed with node-side names.
export {
  cancelNodeOperation,
  cleanupNodeOperations,
  getNodeRuntimeInfo,
  listNodeOperations,
  pauseNodeOperation,
  refreshNodeOperationEvents,
  resumeNodeOperation,
  runNodeOperation,
  subscribeNodeOperationUpdates,
} from "@/lib/nodeOperationTransport"

// Node-scoped configuration (`/config/nodes/...`), including the read-modify-write patch helpers.
export { nodeConfigApi } from "@/lib/nodeConfigApi"
export { getConfigApiClient, getNodeApiClient, getSourceThumbnailApiClient } from "@/lib/xiraniteApiClient"

/**
 * Thumbnail registration is stateful per context, so the client is resolved per call rather than captured at
 * module load: the endpoint may not be hydrated yet when a node view is first imported.
 */
export const sourceThumbnailApi: SourceThumbnailClient = {
  register(contextId, generation, items, signal) {
    return getSourceThumbnailApiClient().register(contextId, generation, items, signal)
  },
  async releaseContext(contextId) {
    await getSourceThumbnailApiClient().releaseContext(contextId)
  },
}

/** Nexus captures addressed to this node, newest-first as the backend stores them. */
export async function listNexusCaptures(targetNodeId: string): Promise<NexusCaptureDTO[]> {
  const response = await requestBackendApi("/nexus/captures", { query: { targetNodeId } })
  if (!response.ok) throw new Error(await response.text().catch(() => `Nexus inbox returned ${response.status}.`))
  const body = await response.json() as { captures?: NexusCaptureDTO[] }
  return Array.isArray(body.captures) ? body.captures : []
}

/** `false` means the capture was already consumed by another surface, which is not an error. */
export async function removeNexusCapture(id: string): Promise<boolean> {
  const response = await requestBackendApi(`/nexus/captures/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(await response.text().catch(() => `Nexus inbox returned ${response.status}.`))
  const body = await response.json() as { removed?: boolean }
  return body.removed === true
}
