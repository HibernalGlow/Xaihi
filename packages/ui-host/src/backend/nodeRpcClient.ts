/**
 * Xiranite shell surface for node operations.
 *
 * Two things used to live here: the `/operations` HTTP protocol and the writes into `@/store/nodeOperations`.
 * The protocol now has one implementation (`src/lib/nodeOperationTransport.ts`, shared with the node UI seam
 * `src/nodes/shared/api.ts`) and the store writes live in `src/store/nodeOperationStoreBridge.ts`. What is
 * left is the shell's own naming for the app UI: the operation monitor, the node host API and the standalone
 * node app.
 *
 * Node UI code must not import this module — `bun run audit:node-ui-independence` fails on `@/backend` inside
 * `src/nodes/**`.
 */
import type { NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { NodeOperationCleanupResponseDTO, NodeOperationDTO } from "@xiranite/shared"
import {
  cancelNodeOperation,
  cleanupNodeOperations,
  getNodeRuntimeInfo,
  listNodeOperations,
  pauseNodeOperation,
  refreshNodeOperationEvents,
  resumeNodeOperation,
  runNodeOperation,
} from "@/lib/nodeOperationTransport"
import { attachNodeOperationStoreMirror } from "@/store/nodeOperationStoreBridge"

// Any shell surface that can start or control an operation also gets the app-wide journal mirror.
attachNodeOperationStoreMirror()

export async function getNodeRuntimeInfoFromLocalBackend<TInfo = unknown>(nodeId: string): Promise<TInfo> {
  return await getNodeRuntimeInfo<TInfo>(nodeId)
}

export async function listNodeOperationsOnLocalBackend(options?: {
  nodeId?: string
  activeOnly?: boolean
  limit?: number
}): Promise<NodeOperationDTO[]> {
  return await listNodeOperations(options)
}

export async function refreshNodeOperationEventsOnLocalBackend(operationId: string): Promise<void> {
  await refreshNodeOperationEvents(operationId)
}

export async function runNodeOnLocalBackend<TInput = unknown, TData = unknown>(
  nodeId: string,
  input: TInput,
  onEvent?: (event: NodeRunEvent) => void,
  context?: { componentId?: string; workspaceId?: string },
): Promise<NodeRunResult<TData>> {
  return await runNodeOperation<TInput, TData>(nodeId, input, onEvent, context)
}

export async function cancelNodeOperationOnLocalBackend<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  return await cancelNodeOperation<TData>(operationId)
}

export async function pauseNodeOperationOnLocalBackend<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  return await pauseNodeOperation<TData>(operationId)
}

export async function resumeNodeOperationOnLocalBackend<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  return await resumeNodeOperation<TData>(operationId)
}

export async function cleanupNodeOperationsOnLocalBackend(options?: { maxAgeMs?: number }): Promise<NodeOperationCleanupResponseDTO> {
  return await cleanupNodeOperations(options)
}
