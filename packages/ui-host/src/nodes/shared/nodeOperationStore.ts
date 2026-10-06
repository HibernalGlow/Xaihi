/**
 * The node layer's own copy of the node-operation journal.
 *
 * Node views need live operation state (task lists, progress, cancellation), and that state must be owned by
 * the node layer: importing `@/store/nodeOperations` would make a node's UI unusable outside Xiranite, which
 * is the coupling ADR-0069 forbids. Both this store and the shell's `@/store/nodeOperations` project the same
 * `NodeOperationUpdate` feed through the same pure reducers in `src/lib/nodeOperationJournal.ts`, so they
 * cannot disagree.
 */
import {
  activeNodeOperationCount,
  createNodeOperationJournalStore,
  isTerminalPhase,
  type NodeOperationJournalState,
  type TrackedNodeOperation,
} from "@/lib/nodeOperationJournal"
import { subscribeNodeOperationUpdates } from "@/lib/nodeOperationTransport"

export const useNodeOperationJournal = createNodeOperationJournalStore({ name: "xiranite-node-ui-operations" })

/** Subscribed once per process; a node view that reads the journal has already imported this module. */
subscribeNodeOperationUpdates((update) => useNodeOperationJournal.getState().applyUpdate(update))

export {
  activeNodeOperationCount,
  isTerminalPhase,
  type NodeOperationJournalState,
  type TrackedNodeOperation,
}
