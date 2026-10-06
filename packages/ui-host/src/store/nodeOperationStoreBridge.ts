/**
 * Xiranite shell mirror for the node operation journal.
 *
 * This is the module that keeps writing the app-wide store: `src/backend/nodeRpcClient.ts` used to call
 * `useNodeOperations.upsertOperation/appendEvent/finishOperation` inline, which made every operation transport
 * — including the one node UIs use — depend on Xiranite state. The transport now publishes a
 * `NodeOperationUpdate` feed and this bridge is the shell's subscriber, so a node can run operations with no
 * Xiranite store loaded at all.
 *
 * Attachment is explicit (main app bootstrap plus the shell's operation shim) rather than a module-load side
 * effect in the store, so a missing wiring shows up as an empty monitor instead of silent double writes.
 */
import { subscribeNodeOperationUpdates } from "@/lib/nodeOperationTransport"
import { useNodeOperations } from "./nodeOperations"

let detach: (() => void) | null = null

/** Idempotent: attaching twice would append every streamed event to the journal twice. */
export function attachNodeOperationStoreMirror(): void {
  if (detach) return
  detach = subscribeNodeOperationUpdates((update) => useNodeOperations.getState().applyUpdate(update))
}

export function detachNodeOperationStoreMirror(): void {
  detach?.()
  detach = null
}

export function isNodeOperationStoreMirrorAttached(): boolean {
  return detach !== null
}
