/**
 * Local Backend 健康状态轮询 hook。
 *
 * Local Backend 是独立运行的 Go 进程，可能在 app 启动后才就绪、运行中崩溃或被外部重启。
 * 本 hook 通过定期轮询 `checkLocalBackendStatus` 维护最新状态，供 UI 显示连接指示器与触发重新连接。
 *
 * 轮询策略：
 * - 未就绪时每 2s 轮询一次（快速感知就绪）；
 * - 就绪后降为 10s 一次（节省 CPU/IO）；
 * - 窗口聚焦/网络恢复时立即 refetch；
 * - 后台也保持轮询（refetchIntervalInBackground），避免最小化时状态过时；
 * - retry: false — 轮询自身已是重试机制，单次失败不必让 TanStack Query 再叠加重试。
 */
import { useQuery } from "@tanstack/react-query"
import { checkLocalBackendStatus } from "@/backend/localBackendStatus"
import { startupDebugAsync } from "@/lib/startupDebug"

export const LOCAL_BACKEND_STATUS_QUERY_KEY = ["local-backend", "status"] as const

export function useLocalBackendStatus() {
  return useQuery({
    queryKey: LOCAL_BACKEND_STATUS_QUERY_KEY,
    queryFn: () => startupDebugAsync("backend:status-check", checkLocalBackendStatus),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status || status !== "ready") return 2_000
      if (import.meta.env.DEV) return 2_000
      return 10_000
    },
    refetchIntervalInBackground: true,
    retry: false,
  })
}
