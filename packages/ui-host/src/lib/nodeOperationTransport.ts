/**
 * Node operation transport — the `/operations` family of ADR-0063, without any UI state attached.
 *
 * This is the single implementation shared by `src/backend/nodeRpcClient.ts` (the Xiranite shell) and
 * `src/nodes/shared/api.ts` (the node UI seam). It performs the HTTP calls, replays a stream that broke in
 * transit, and publishes a `NodeOperationUpdate` feed; it deliberately writes no store, because a node's UI
 * may own its operation state but must not reach into Xiranite's. Consumers subscribe to the feed:
 * `src/store/nodeOperationStoreBridge.ts` for the app-wide monitor, `src/nodes/shared/nodeOperationStore.ts`
 * for the node layer.
 *
 * The request/response shapes are the protocol the Rust backend mirrors, so they are not restated here.
 */
import type { NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { NodeOperationCleanupResponseDTO, NodeOperationDTO, NodeRunResultDTO } from "@xiranite/shared"
import { isTerminalPhase, type NodeOperationUpdate } from "./nodeOperationJournal"
import { getNodeApiClient } from "./xiraniteApiClient"

/** Bounds for the transport's own bookkeeping; operation ids come from a long-running backend process. */
const MAX_TRACKED_CURSORS = 128

const updateListeners = new Set<(update: NodeOperationUpdate) => void>()

/**
 * Replay cursor per operation: the next backend event index this client still needs. It is transport state,
 * not UI state — polling must not re-append events a projection already saw, and the transport must work even
 * when nothing is subscribed.
 */
const replayCursors = new Map<string, number>()

export function subscribeNodeOperationUpdates(listener: (update: NodeOperationUpdate) => void): () => void {
  updateListeners.add(listener)
  return () => updateListeners.delete(listener)
}

export async function getNodeRuntimeInfo<TInfo = unknown>(nodeId: string): Promise<TInfo> {
  return await getNodeApiClient().getNodeRuntimeInfo<TInfo>(nodeId)
}

export async function listNodeOperations(options?: {
  nodeId?: string
  activeOnly?: boolean
  limit?: number
}): Promise<NodeOperationDTO[]> {
  const response = await getNodeApiClient().listNodeOperations(options)
  for (const operation of response.operations) publish({ type: "operation", operation })
  return response.operations
}

export async function refreshNodeOperationEvents(operationId: string): Promise<void> {
  const page = await getNodeApiClient().getNodeOperationEvents(operationId, {
    fromEventIndex: replayCursor(operationId),
    limit: 100,
  })
  publish({ type: "operation", operation: page.operation })
  for (const entry of page.events) {
    publish({ type: "event", operationId, index: entry.index, event: entry.event })
  }
  if (page.operation.result && isTerminalPhase(page.operation.phase)) {
    publish({ type: "result", operation: page.operation, result: page.operation.result })
  }
}

export async function runNodeOperation<TInput = unknown, TData = unknown>(
  nodeId: string,
  input: TInput,
  onEvent?: (event: NodeRunEvent) => void,
  context?: { componentId?: string; workspaceId?: string },
): Promise<NodeRunResult<TData>> {
  let operationId: string | undefined
  try {
    const client = getNodeApiClient()
    const operation = await client.startNodeOperation<TInput>(nodeId, input, context)
    operationId = operation.operationId
    publish({ type: "operation", operation })

    let finalResult: NodeRunResult<TData> | undefined
    await client.streamNodeOperation<TData>(operation.operationId, (message) => {
      if (message.type === "operation") {
        publish({ type: "operation", operation: message.operation })
      } else if (message.type === "event") {
        publish({ type: "event", operationId: operation.operationId, index: message.index, event: message.event })
        onEvent?.(message.event)
      } else {
        finalResult = message.result
        publish({ type: "result", operation: message.operation, result: message.result })
      }
    })

    if (!finalResult) throw new Error(`Node operation did not return a result: ${operation.operationId}`)
    return finalResult
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const result: NodeRunResult<TData> = { success: false, message }
    if (operationId) {
      const recovered = await reconcileTrackedOperationAfterStreamFailure(operationId, result)
      if (recovered) return recovered
    } else {
      publish({ type: "start-failure", nodeId, message })
    }
    return result
  }
}

export async function cancelNodeOperation<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  const operation = await getNodeApiClient().cancelNodeOperation<TData>(operationId)
  publish({ type: "operation", operation })
  return operation
}

export async function pauseNodeOperation<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  const operation = await getNodeApiClient().pauseNodeOperation<TData>(operationId)
  publish({ type: "operation", operation })
  return operation
}

export async function resumeNodeOperation<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  const operation = await getNodeApiClient().resumeNodeOperation<TData>(operationId)
  publish({ type: "operation", operation })
  return operation
}

export async function cleanupNodeOperations(options?: { maxAgeMs?: number }): Promise<NodeOperationCleanupResponseDTO> {
  return getNodeApiClient().cleanupNodeOperations(options)
}

/** Clears replay state — a new backend process restarts its own event numbering. */
export function resetNodeOperationTransportState(): void {
  replayCursors.clear()
}

async function reconcileTrackedOperationAfterStreamFailure<TData>(
  operationId: string,
  streamFailure: NodeRunResult<TData>,
): Promise<NodeRunResult<TData> | undefined> {
  try {
    const latest = await getNodeApiClient().getNodeOperation<TData>(operationId)
    publish({ type: "operation", operation: latest })
    if (isTerminalPhase(latest.phase)) {
      if (latest.result) {
        publish({ type: "result", operation: latest, result: latest.result })
        return latest.result
      } else {
        markTrackedOperationFailed(latest, streamFailure)
      }
    }
  } catch {
    // A broken stream or status request does not prove that the worker stopped.
    // Leave the journal entry active so the task monitor can recover it later.
  }
  return undefined
}

function markTrackedOperationFailed<TData>(latest: NodeOperationDTO<TData>, streamFailure: NodeRunResult<TData>): void {
  const now = Date.now()
  publish({ type: "event", operationId: latest.operationId, event: { type: "log", message: streamFailure.message } })
  publish({
    type: "result",
    operation: {
      ...latest,
      phase: "error",
      updatedAt: now,
      finishedAt: now,
      // The synthetic log above is already part of the journal, so the envelope must carry its count too;
      // dropping it would make the monitor show "N events" for N+1 rendered lines.
      eventCount: (latest.eventCount ?? 0) + 1,
    },
    result: streamFailure as NodeRunResultDTO<TData>,
  })
}

function publish(update: NodeOperationUpdate): void {
  if (update.type === "event" && update.index !== undefined) rememberReplayCursor(update.operationId, update.index)
  // Snapshot before notifying: a projection can unsubscribe (or attach) while it is being called, and walking
  // the live Set would then skip subscribers. A projection that throws — for example a devtools limit — must
  // not fail the operation the user started, because the transport contract is the returned DTO.
  const subscribers = [...updateListeners]
  for (const listener of subscribers) {
    try {
      listener(update)
    } catch {
      // Swallowed on purpose: journal projections are derived state, never the source of truth.
    }
  }
}

function replayCursor(operationId: string): number {
  return replayCursors.get(operationId) ?? 0
}

function rememberReplayCursor(operationId: string, index: number): void {
  if (!replayCursors.has(operationId) && replayCursors.size >= MAX_TRACKED_CURSORS) {
    const oldest = replayCursors.keys().next().value
    if (oldest !== undefined) replayCursors.delete(oldest)
  }
  replayCursors.set(operationId, Math.max(replayCursor(operationId), index + 1))
}
