/**
 * 运行时历史（runtime history）hooks。
 *
 * 包装 TanStack Query，提供"运行时历史"列表/详情查询、删除、批量清理与缓存预热。
 *
 * 运行时历史是比节点运行历史（useNodeRunHistory）更细粒度的执行记录：
 * 一次节点运行通常会产生多条 runtime history 条目（如多次 CLI 调用、流式输出、子任务等）。
 * 通过 kind/operation/nodeId/componentId/workspaceId/status 等字段多维筛选。
 *
 * 缓存策略：列表 staleTime 5s，详情 staleTime 15s；删除/清理后失效所有相关查询。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  RuntimeHistoryClearQueryDTO,
  RuntimeHistoryItemDTO,
  RuntimeHistoryQueryDTO,
} from "@xiranite/shared"
import {
  clearRuntimeHistory,
  deleteRuntimeHistory,
  getRuntimeHistory,
  listRuntimeHistory,
} from "@/backend/runtimeHistoryClient"

/** 全局 query key 前缀，所有 runtime history 相关查询共享。 */
export const runtimeHistoryQueryKey = ["runtime-history"] as const

/**
 * 构造列表查询的 query key。
 *
 * 把所有筛选维度展开为 key 数组，确保任一维度变化都会触发重新查询，
 * 同时让缓存命中精确到具体的筛选组合。
 */
function listQueryKey(query: RuntimeHistoryQueryDTO): readonly unknown[] {
  return [
    ...runtimeHistoryQueryKey,
    "list",
    query.kind ?? "all",
    query.operation ?? "all",
    query.nodeId ?? "all",
    query.componentId ?? "all",
    query.workspaceId ?? "all",
    query.status ?? "all",
    query.limit ?? 50,
    query.cursor ?? "",
  ]
}

function itemQueryKey(id: string | undefined): readonly unknown[] {
  return [...runtimeHistoryQueryKey, "item", id ?? ""]
}

/**
 * 查询运行时历史列表。
 *
 * placeholderData 返回前一次的数据，避免翻页/筛选切换时列表闪烁。
 *
 * @param query 筛选条件
 * @param options.enabled 是否启用查询（默认 true）
 */
export function useRuntimeHistory(query: RuntimeHistoryQueryDTO, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: listQueryKey(query),
    queryFn: () => listRuntimeHistory(query),
    enabled: options?.enabled ?? true,
    placeholderData: (previous) => previous,
    staleTime: 5_000,
  })
}

/**
 * 查询单条运行时历史详情。
 *
 * @param id 条目 id，为 undefined 时禁用查询（不发起请求）
 */
export function useRuntimeHistoryItem(id: string | undefined) {
  return useQuery({
    queryKey: itemQueryKey(id),
    queryFn: () => getRuntimeHistory(id!),
    enabled: Boolean(id),
    staleTime: 15_000,
  })
}

/** 删除单条运行时历史；成功后失效所有 runtime history 缓存。 */
export function useDeleteRuntimeHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRuntimeHistory(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: runtimeHistoryQueryKey })
    },
  })
}

/** 按条件批量清理运行时历史；成功后失效所有 runtime history 缓存。 */
export function useClearRuntimeHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (query: RuntimeHistoryClearQueryDTO) => clearRuntimeHistory(query),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: runtimeHistoryQueryKey })
    },
  })
}

/**
 * 主动把一条历史写入缓存。
 *
 * 用于流式运行结束/新增条目时让 UI 立即显示，而不必等待下次列表查询 refetch。
 */
export function prefetchRuntimeHistoryItem(
  queryClient: ReturnType<typeof useQueryClient>,
  item: RuntimeHistoryItemDTO,
) {
  queryClient.setQueryData(itemQueryKey(item.id), item)
}
