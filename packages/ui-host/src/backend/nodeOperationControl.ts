/**
 * 节点操作控制（取消 / 暂停 / 继续 / 清理）的本地桩。
 *
 * 过去这四个函数直打 Xiranite 的 REST 后端（`@/backend/nodeRpcClient`）。那条通路整块
 * 作废（2026-10-07 使用者口径："不再使用 rest 架构通信，一切都走这个 DSH 插件标准来"），
 * 而它们的真源是桥的 **runner 组——当前没有提供者**（提案 P1：命令要跑在一个 Agent 上，
 * 宿主只给了"程序化造一个 Agent"那条路；等上游"在现有 Agent 上执行"的口子）。
 *
 * 所以这里的形状与原来一致（调用点不用改），语义如实：
 * - cancel/pause/resume：抛出带原因的错。没有 runner 就没有可取消的操作，
 *   监视器列表为空时这三个按钮本来就点不到；
 * - cleanup：返回"清理了 0 条"而不是抛。监视器随后清空的"已完成"列表是
 *   **文档侧 store** 的状态（`useNodeOperations.clearTerminal`），那半边是真的、
 *   应该照常工作，不该被服务端的缺席连坐。
 */

export async function cancelNodeOperationOnLocalBackend<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  throw new Error(
    `runner 未接入（提案 P1）：命令要跑在一个 Agent 上，操作 ${operationId} 无法在这一格取消。见 tests 与 roadmap 的提案账。`,
  )
}

export async function pauseNodeOperationOnLocalBackend<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  throw new Error(
    `runner 未接入（提案 P1）：命令要跑在一个 Agent 上，操作 ${operationId} 无法在这一格暂停。`,
  )
}

export async function resumeNodeOperationOnLocalBackend<TData = unknown>(operationId: string): Promise<NodeOperationDTO<TData>> {
  throw new Error(
    `runner 未接入（提案 P1）：命令要跑在一个 Agent 上，操作 ${operationId} 无法在这一格继续。`,
  )
}

export async function cleanupNodeOperationsOnLocalBackend(_options?: { maxAgeMs?: number }): Promise<NodeOperationCleanupResponseDTO> {
  // 服务端没有可清理的东西（历史记录的 REST 通路已作废）；文档侧列表由调用方自己清。
  return { removed: 0 }
}

/** 与 `@xiranite/shared` 的 `NodeOperationDTO` 同形的最小本地形状（这里只到"抛出"那一步，不需要真值）。 */
export interface NodeOperationDTO<TData = unknown> {
  id: string
  phase: string
  data?: TData
  [key: string]: unknown
}

export interface NodeOperationCleanupResponseDTO {
  removed: number
}
