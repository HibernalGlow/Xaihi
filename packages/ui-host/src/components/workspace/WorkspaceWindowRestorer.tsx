import { useEffect, useMemo, useRef } from "react"
import { getModule } from "@/components/modules/registry"
import { useWindowControls } from "@/hooks/useWindowControls"
import { useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { createLogger } from "@/lib/logger"

const logger = createLogger("window.restore")

export function WorkspaceWindowRestorer() {
  const { appConfigReady, backendReady, components, restoreWorkspaceComponents } = useWorkspaceShallowSelector((state) => ({
    appConfigReady: state.appConfigReady,
    backendReady: state.backendReady,
    components: state.components,
    restoreWorkspaceComponents: state.restoreWorkspaceComponents,
  }))
  const windowComponents = useMemo(
    () => components.filter((component) => component.placement === "window"),
    [components],
  )
  const { capabilities, capabilitiesPending, openComponent } = useWindowControls()
  const attemptedIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!appConfigReady || !backendReady || !restoreWorkspaceComponents || capabilitiesPending || !capabilities) return
    // Browser popups require a user gesture and must never be created during startup.
    // Only a native shell can restore an independent window safely here; browser users
    // can still open one explicitly from the workspace action.
    if (!capabilities.supported || capabilities.componentWindows !== "native") return

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
  }, [appConfigReady, backendReady, capabilities, capabilitiesPending, openComponent, restoreWorkspaceComponents, windowComponents])

  return null
}
