import { createElement } from "react"
import type { TFunction } from "i18next"
import { ExternalLink, X } from "lucide-react"
import type { OpenComponentWindowInput, WindowCommandResult } from "@/backend/runtime/runtime"
import type { ComponentViewMode } from "@/store/workspace/constants"
import type { WorkspaceActions } from "@/store/workspace/types"
import type { NodeSurfaceChromeAction } from "./NodeSurfaceChrome"
import { createMoveToViewAction } from "./createMoveToViewAction"
import { createLogger } from "@/lib/logger"

const logger = createLogger("window.actions")

type OpenComponent = (input: OpenComponentWindowInput) => Promise<WindowCommandResult>

export function createSurfaceCommonActions(params: {
  componentId: string
  componentData?: Record<string, unknown>
  currentMode: ComponentViewMode
  height?: number
  moduleId: string
  moduleName: string
  openComponent: OpenComponent
  t: TFunction
  width?: number
  workspaceActions: WorkspaceActions
}): NodeSurfaceChromeAction[] {
  const {
    componentId,
    currentMode,
    height,
    moduleId,
    moduleName,
    openComponent,
    t,
    width,
    workspaceActions,
  } = params

  return [
    {
      key: "float",
      label: t("common:openFloatingWindow"),
      icon: createElement(ExternalLink, { className: "h-3 w-3" }),
      tone: "neutral",
      onClick: () => {
        void openComponent({ componentId, moduleId, title: moduleName, width, height })
          .then((result) => {
            if (result.success) workspaceActions.setComponentState(componentId, "floating")
            else logger.info("Unable to open component window", { message: result.message, componentId, moduleId })
          })
          .catch((error: unknown) => logger.info("Failed to open component window", { componentId, moduleId }, error))
      },
    },
    createMoveToViewAction({ componentId, currentMode, workspaceActions, t }),
    {
      key: "hide",
      label: t("common:hideIn", { view: t(`topbar:viewMode.${currentMode}`) }),
      icon: createElement(X, { className: "h-3 w-3" }),
      danger: true,
      tone: "close",
      onClick: () => workspaceActions.setComponentVisibility(componentId, currentMode, false),
    },
  ]
}
