/**
 * Backend 实例访问 hook。
 *
 * 通过 TanStack Query 等待 backend runtime 初始化完成，返回同一个 Backend 实例。
 * 生命周期、缓存和错误状态交给 TanStack Query 管理：
 * - staleTime: Infinity — Backend 实例不会过期，避免重复 init；
 * - retry: false — 初始化失败时由调用方决定如何提示用户重启；
 * - queryKey: ["backend"] — 全局唯一，所有 useBackend 调用共享同一缓存。
 *
 * @returns { backend, error, ready } — backend 在就绪前为 null
 */
import { useQuery } from "@tanstack/react-query"
import { getBackend } from "@/backend/client"
import type { Backend } from "@/backend/client"

export function useBackend() {
  const query = useQuery<Backend, Error>({
    queryKey: ["backend"],
    queryFn: getBackend,
    staleTime: Infinity,
    retry: false,
  })

  return {
    backend: query.data ?? null,
    error: query.error,
    ready: query.isSuccess,
  }
}
