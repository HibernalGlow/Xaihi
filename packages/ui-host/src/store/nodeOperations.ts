/**
 * Node Operations Store —— Xiranite 壳层的应用级操作监视状态。
 *
 * 这份 store 归 Xiranite 主应用所有（运行历史 / 终端面板 / 全局任务角标），节点 UI 不得导入它：
 * 节点自己的一份投影在 `src/nodes/shared/nodeOperationStore.ts`。两边都只是
 * `src/lib/nodeOperationJournal.ts` 纯 reducer 的订阅者，写入由
 * `src/store/nodeOperationStoreBridge.ts` 从 `src/lib/nodeOperationTransport.ts` 的更新流转发过来，
 * 因此传输层（HTTP/Operation 协议）本身不再持有任何 Xiranite 状态。
 */
import { createNodeOperationJournalStore } from "@/lib/nodeOperationJournal"

export const useNodeOperations = createNodeOperationJournalStore({ name: "xiranite-node-operations" })

export {
  activeNodeOperationCount,
  isTerminalPhase,
  type NodeOperationJournalState,
  type NodeOperationUpdate,
  type TrackedNodeOperation,
} from "@/lib/nodeOperationJournal"
