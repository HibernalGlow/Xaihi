import { useEffect, useRef } from "react"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import { parseSettingsSectionId } from "@/components/views/settings/settingsNavigation"
import { getWorkspaceState, useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { ViewMode } from "@/types/workspace"

const VIEW_MODES = ["dashboard", "cards", "dockview", "flow", "lane", "bento"] as const satisfies readonly ViewMode[]

const workspaceUrlParsers = {
  view: parseAsStringLiteral(VIEW_MODES).withDefault("cards"),
  /** Global settings deep link: `?settings=workspace` opens the settings overlay on that stage. */
  settings: parseAsString,
}

/**
 * ADR-0019：多工作空间退役后 URL 只承载视图与设置深链；
 * 原来的 `?workspace=<id>` 参数随多空间概念一并删除。
 */
export function WorkspaceUrlState() {
  const [{ view, settings }, setUrlState] = useQueryStates(workspaceUrlParsers, {
    history: "replace",
    shallow: true,
    clearOnDefault: false,
  })
  const state = useWorkspaceShallowSelector((workspaceState) => ({
    viewMode: workspaceState.viewMode,
    overlay: workspaceState.overlay,
  }))
  const workspaceActions = useWorkspaceActions()
  const lastUrlStateRef = useRef<ViewMode | null>(null)
  const suppressStoreToUrlRef = useRef(false)
  const settingsSection = parseSettingsSectionId(settings)

  useEffect(() => {
    const urlChanged = lastUrlStateRef.current !== view
    if (urlChanged) lastUrlStateRef.current = view

    let appliedUrlState = false
    const currentStoreState = getWorkspaceState()

    if (urlChanged && view !== currentStoreState.viewMode) {
      workspaceActions.setViewMode(view)
      appliedUrlState = true
    }

    if (appliedUrlState) {
      suppressStoreToUrlRef.current = true
    }
  }, [workspaceActions, view])

  // Deep link: valid ?settings=<sectionId> opens the global settings overlay.
  useEffect(() => {
    if (!settingsSection) return
    if (state.overlay === "settings") return
    workspaceActions.setOverlay("settings")
  }, [settingsSection, state.overlay, workspaceActions])

  // Drop the settings query when the overlay is closed so the URL does not re-open it.
  useEffect(() => {
    if (state.overlay === "settings") return
    if (!settings) return
    void setUrlState({ settings: null })
  }, [setUrlState, settings, state.overlay])

  useEffect(() => {
    if (suppressStoreToUrlRef.current) {
      suppressStoreToUrlRef.current = false
      return
    }

    if (view !== state.viewMode) {
      lastUrlStateRef.current = state.viewMode
      void setUrlState({ view: state.viewMode })
    }
  }, [setUrlState, state.viewMode, view])

  return null
}
