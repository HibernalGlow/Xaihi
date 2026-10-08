import { useEffect } from "react"
import { getBackend } from "@/backend/client"
import { persistComponentWindowSize } from "./componentWindowSizeStore"
import { createLogger } from "@/lib/logger"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { updateComponentWindowSize } from "./componentWindowSize"

const logger = createLogger("window.frame-sync")

export function WorkspaceWindowFrameSync() {
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    void getBackend()
      .then(async (backend) => {
        const stop = await backend.windows.subscribeFrameChanges((event) => {
          const state = useWorkspaceStore.getState()
          const component = state.components.find((item) => item.id === event.componentId)
          const workspaceId = event.workspaceId ?? component?.workspaceId ?? state.activeWorkspaceId
          const size = { width: Math.round(event.width), height: Math.round(event.height) }
          if (size.width < 360 || size.height < 260) return

          useWorkspaceStore.setState((current) => ({
            components: updateComponentWindowSize(current.components, event.componentId, size),
          }))
          // 落文档侧 localStorage（过去打 REST 后端，那条通路作废——见 componentWindowSizeStore 头注释）。
          try {
            persistComponentWindowSize({
              componentId: event.componentId,
              moduleId: event.moduleId,
              workspaceId,
              size,
            })
          } catch (error) {
            logger.error("Failed to persist component window size", { componentId: event.componentId, workspaceId, size }, error)
          }
        })
        if (cancelled) stop()
        else unsubscribe = stop
      })
      .catch((error) => {
        logger.error("Failed to subscribe to component window frames", error)
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return null
}
