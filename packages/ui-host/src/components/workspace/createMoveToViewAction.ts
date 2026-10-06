import { createElement } from "react"
import type { TFunction } from "i18next"
import { ArrowRight, Share2 } from "lucide-react"
import { COMPONENT_VIEW_MODES, type ComponentViewMode } from "@/store/workspace/constants"
import type { WorkspaceActions } from "@/store/workspace/types"
import type { NodeSurfaceChromeAction } from "./NodeSurfaceChrome"

export function createMoveToViewAction(params: {
  componentId: string
  currentMode: ComponentViewMode
  workspaceActions: WorkspaceActions
  t: TFunction
}): NodeSurfaceChromeAction {
  const { componentId, currentMode, workspaceActions, t } = params
  return {
    key: "moveToView",
    label: t("common:moveToView"),
    icon: createElement(Share2, { className: "h-3 w-3" }),
    tone: "neutral",
    submenu: COMPONENT_VIEW_MODES
      .filter((mode) => mode !== currentMode)
      .map((mode) => ({
        key: `moveTo-${mode}`,
        label: t(`topbar:viewMode.${mode}`),
        icon: createElement(ArrowRight, { className: "h-3.5 w-3.5" }),
        tone: "neutral" as const,
        onClick: () => {
          workspaceActions.setComponentVisibility(componentId, currentMode, false)
          workspaceActions.setComponentVisibility(componentId, mode, true)
          workspaceActions.setViewMode(mode)
        },
      })),
  }
}
