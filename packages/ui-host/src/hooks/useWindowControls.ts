/**
 * 窗口控制 hook。
 *
 * 封装与后端窗口管理 API 的交互，提供：
 * - capabilities — 当前平台支持的窗口操作能力（如是否支持多窗口、是否支持 taskbar 自定义等）；
 * - controlMain — 控制主窗口（最小化/最大化/恢复/关闭等）；
 * - openComponent — 在独立窗口中打开某个组件（多窗口模式）；
 * - closeComponent — 关闭指定组件窗口。
 *
 * 查询用 useQuery（capabilities 只读），变更用 useMutation（控制类操作）。
 * 每个 mutation 都暴露 mutateAsync 与 isPending，便于调用方 await 结果与显示 loading。
 */
import { useMutation, useQuery } from "@tanstack/react-query"
import { useCallback } from "react"
import { getBackend } from "@/backend/client"
import { resolveComponentWindowSize } from "@/backend/workspaceRpcClient"
import { createLogger } from "@/lib/logger"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { MainWindowAction, OpenComponentWindowInput, WindowCommandResult } from "@/backend/runtime/runtime"

const componentOpenRequests = new Map<string, Promise<WindowCommandResult>>()
const logger = createLogger("window.controls")

export function withRememberedComponentWindowSize(
  input: OpenComponentWindowInput,
  workspaceId: string,
  rememberedSize: { width: number; height: number } | null,
): OpenComponentWindowInput {
  return {
    ...input,
    workspaceId,
    ...(rememberedSize ? { width: rememberedSize.width, height: rememberedSize.height } : {}),
  }
}

/** Shares concurrent opens from the explicit launcher and window restorer. */
export function openComponentOnce(
  input: OpenComponentWindowInput,
  open: (input: OpenComponentWindowInput) => Promise<WindowCommandResult>,
): Promise<WindowCommandResult> {
  const pending = componentOpenRequests.get(input.componentId)
  if (pending) return pending

  const request = open(input)
  componentOpenRequests.set(input.componentId, request)
  const clearRequest = () => {
    if (componentOpenRequests.get(input.componentId) === request) {
      componentOpenRequests.delete(input.componentId)
    }
  }
  void request.then(clearRequest, clearRequest)
  return request
}

export function useWindowControls() {
  const capabilitiesQuery = useQuery({
    queryKey: ["window-capabilities"],
    queryFn: async () => {
      const backend = await getBackend()
      return backend.windows.getCapabilities()
    },
  })

  const controlMainMutation = useMutation({
    mutationFn: async (action: MainWindowAction): Promise<WindowCommandResult> => {
      const backend = await getBackend()
      return backend.windows.controlMain(action)
    },
  })

  const controlComponentMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: MainWindowAction }): Promise<WindowCommandResult> => {
      const backend = await getBackend()
      return backend.windows.controlComponent(id, action)
    },
  })
  const controlComponentMutateAsync = controlComponentMutation.mutateAsync
  const controlComponent = useCallback(
    (id: string, action: MainWindowAction) => controlComponentMutateAsync({ id, action }),
    [controlComponentMutateAsync],
  )

  const openComponentMutation = useMutation({
    mutationFn: async (input: OpenComponentWindowInput): Promise<WindowCommandResult> => {
      return openComponentOnce(input, async (request) => {
        const state = useWorkspaceStore.getState()
        const component = state.components.find((item) => item.id === request.componentId)
        const workspaceId = request.workspaceId ?? component?.workspaceId ?? state.activeWorkspaceId
        const backendPromise = getBackend()
        let rememberedSize: { width: number; height: number } | null = null
        try {
          rememberedSize = await resolveComponentWindowSize({
            componentId: request.componentId,
            moduleId: request.moduleId,
            workspaceId,
          })
        } catch (error) {
          logger.info("Unable to restore component window size", { componentId: request.componentId, workspaceId }, error)
        }
        const backend = await backendPromise
        return backend.windows.openComponent(withRememberedComponentWindowSize(request, workspaceId, rememberedSize))
      })
    },
  })

  const closeComponentMutation = useMutation({
    mutationFn: async (id: string): Promise<WindowCommandResult> => {
      const backend = await getBackend()
      return backend.windows.close(id)
    },
  })

  return {
    capabilities: capabilitiesQuery.data,
    capabilitiesPending: capabilitiesQuery.isPending,
    controlMain: controlMainMutation.mutateAsync,
    controlMainPending: controlMainMutation.isPending,
    controlComponent,
    controlComponentPending: controlComponentMutation.isPending,
    openComponent: openComponentMutation.mutateAsync,
    openComponentPending: openComponentMutation.isPending,
    closeComponent: closeComponentMutation.mutateAsync,
    closeComponentPending: closeComponentMutation.isPending,
  }
}
