import { useEffect, useMemo, useRef } from "react"
import { getModule } from "@/components/modules/registry"
import { useWindowControls } from "@/hooks/useWindowControls"
import { useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { createLogger } from "@/lib/logger"

const logger = createLogger("window.restore")

export function WorkspaceWindowRestorer() {
  const { backendReady, components } = useWorkspaceShallowSelector((state) => ({
    backendReady: state.backendReady,
    components: state.components,
  }))
  const windowComponents = useMemo(
    () => components.filter((component) => component.placement === "window"),
    [components],
  )
  const { capabilities, capabilitiesPending, openComponent } = useWindowControls()
  const attemptedIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!backendReady || capabilitiesPending || !capabilities) return
    if (!capabilities.supported || capabilities.componentWindows === "unsupported") return

    const pending = windowComponents.filter((component) => !attemptedIdsRef.current.has(component.id))
    if (pending.length === 0) return

    for (const component of pending) attemptedIdsRef.current.add(component.id)

    void (async () => {
      for (const component of pending) {
        try {
          const result = await openComponent({
            componentId: component.id,
            moduleId: component.moduleId,
            title: getModule(component.moduleId)?.name ?? component.moduleId,
          })
          if (!result.success) logger.info("Unable to restore component window", { componentId: component.id, message: result.message })
        } catch (error) {
          logger.info("Failed to restore component window", { componentId: component.id }, error)
        }
      }
    })()
  }, [backendReady, capabilities, capabilitiesPending, openComponent, windowComponents])

  return null
}
