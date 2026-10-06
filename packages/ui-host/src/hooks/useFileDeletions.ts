import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { FileDeletionQuery } from "@xiranite/api/client"
import {
  listFileDeletionNodes,
  listFileDeletions,
  restoreFileDeletion,
} from "@/backend/fileDeletionClient"

const FILE_DELETIONS_KEY = ["file-deletions"] as const
const PAGE_SIZE = 80

export function useFileDeletions(query: Omit<FileDeletionQuery, "cursor" | "limit">) {
  return useInfiniteQuery({
    queryKey: fileDeletionListKey(query),
    queryFn: ({ pageParam }) => listFileDeletions({ ...query, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 2_000,
    refetchInterval: (query) => (query.state.data?.pages.length ?? 0) <= 1 ? 2_000 : false,
    retry: false,
  })
}

export function useFileDeletionNodes() {
  return useQuery({
    queryKey: [...FILE_DELETIONS_KEY, "nodes"],
    queryFn: listFileDeletionNodes,
    staleTime: 10_000,
    retry: false,
  })
}

export function useRestoreFileDeletion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: restoreFileDeletion,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...FILE_DELETIONS_KEY, "list"],
        refetchType: "active",
      })
    },
  })
}

function fileDeletionListKey(query: Omit<FileDeletionQuery, "cursor" | "limit">) {
  return [
    ...FILE_DELETIONS_KEY,
    "list",
    query.nodeId ?? "",
    query.componentId ?? "",
    query.workspaceId ?? "",
    query.state ?? "",
    query.deletionKind ?? "",
    query.restoreAvailable === undefined ? "" : String(query.restoreAvailable),
    query.from ?? "",
    query.to ?? "",
  ] as const
}
