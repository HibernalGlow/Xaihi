/**
 * 节点运行历史（node run history）hooks。
 *
 * 包装 TanStack Query，提供节点级"运行历史"的列表/详情查询、删除、批量清理与缓存预热。
 *
 * 与 useRuntimeHistory 的区别：
 * - useNodeRunHistory 是粗粒度的"一次节点运行"记录（一次执行一条）；
 * - useRuntimeHistory 是细粒度的运行时事件记录（一次节点运行可能产生多条）。
 *
 * 缓存策略：列表 staleTime 10s，详情 staleTime 30s；retry: false 由调用方决定重试。
 * 翻页时使用 keepPreviousData 避免列表闪烁。
 *
 * 传输取 `@/lib/xiraniteApiClient` 的 client 工厂而不是 `@/backend/*`：本 hook 同时被节点 popover
 * （`src/nodes/shared/NodeRunHistoryPopover.tsx`）和壳层视图使用，而 ADR-0069 要求节点 UI 的闭包里
 * 不许出现 Xiranite 专有壳层模块，否则逐节点独立分发那条路就被这条 import 关掉了。
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query"
import type {
  NodeRunHistoryClearQueryDTO,
  NodeRunHistoryItemDTO,
  NodeRunHistoryQueryDTO,
} from "@xiranite/shared"
import { getNodeRunHistoryApiClient } from "@/lib/xiraniteApiClient"

/** 全局 query key 前缀，所有 node-run-history 相关查询共享。 */
const HISTORY_QUERY_KEY = ["node-run-history"] as const

/**
 * 构造列表查询的 query key。
 *
 * 把筛选维度（nodeId/componentId/workspaceId/status/limit/cursor）展开为 key 数组，
 * 确保任一维度变化触发重新查询，缓存命中精确到具体筛选组合。
 */
function listQueryKey(query: NodeRunHistoryQueryDTO): readonly unknown[] {
  return [
    ...HISTORY_QUERY_KEY,
    "list",
    query.nodeId ?? "",
    query.componentId ?? "",
    query.workspaceId ?? "",
    query.status ?? "",
    query.limit ?? 50,
    query.cursor ?? "",
  ] as const
}

function itemQueryKey(id: string): readonly unknown[] {
  return [...HISTORY_QUERY_KEY, "item", id] as const
}

/**
 * 节点运行历史列表查询。
 *
 * 默认不启用 placeholderData，分页查询时建议传入 enabled 控制触发时机。
 * 使用 keepPreviousData 避免翻页时列表闪烁。
 */
export function useNodeRunHistory(query: NodeRunHistoryQueryDTO, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: listQueryKey(query),
    queryFn: () => getNodeRunHistoryApiClient().list(query),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

/** 单条历史详情查询。 */
export function useNodeRunHistoryItem(id: string | undefined) {
  return useQuery({
    queryKey: id ? itemQueryKey(id) : [...HISTORY_QUERY_KEY, "item", "missing"],
    queryFn: () => getNodeRunHistoryApiClient().get(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  })
}

/** 删除单条历史。成功后失效相关列表缓存。 */
export function useDeleteNodeRunHistory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => getNodeRunHistoryApiClient().delete(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: itemQueryKey(id), exact: true })
      invalidateHistoryLists(queryClient)
    },
  })
}

/** 按节点/组件/工作区/时间清理历史。 */
export function useClearNodeRunHistory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (query: NodeRunHistoryClearQueryDTO) => getNodeRunHistoryApiClient().clear(query),
    onSuccess: () => {
      invalidateHistoryLists(queryClient)
    },
  })
}

/** 失效所有历史列表缓存（删除/清理后调用）。 */
export function invalidateHistoryLists(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({
    queryKey: [...HISTORY_QUERY_KEY, "list"],
    refetchType: "active",
  })
}

/** 主动把一条历史写入缓存（运行结束后立即刷新场景用）。 */
export function prefetchNodeRunHistoryItem(
  queryClient: ReturnType<typeof useQueryClient>,
  item: NodeRunHistoryItemDTO,
): void {
  queryClient.setQueryData(itemQueryKey(item.id), item)
}
