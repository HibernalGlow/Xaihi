import { useEffect, useMemo, useRef } from "react"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import { parseSettingsSectionId } from "@/components/views/settings/settingsNavigation"
import { getWorkspaceState, useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import type { ViewMode } from "@/types/workspace"

const VIEW_MODES = ["dashboard", "cards", "dockview", "flow", "lane", "bento"] as const satisfies readonly ViewMode[]

const workspaceUrlParsers = {
  view: parseAsStringLiteral(VIEW_MODES).withDefault("cards"),
  workspace: parseAsString,
  /** Global settings deep link: `?settings=workspace` opens the settings overlay on that stage. */
  settings: parseAsString,
}

export function WorkspaceUrlState() {
  const [{ view, workspace, settings }, setUrlState] = useQueryStates(workspaceUrlParsers, {
    history: "replace",
    shallow: true,
    clearOnDefault: false,
  })
  const state = useWorkspaceShallowSelector((workspaceState) => ({
    viewMode: workspaceState.viewMode,
    activeWorkspaceId: workspaceState.activeWorkspaceId,
    backendReady: workspaceState.backendReady,
    workspaces: workspaceState.workspaces,
    overlay: workspaceState.overlay,
  }))
  const workspaceActions = useWorkspaceActions()
  const lastUrlStateRef = useRef<{ view: ViewMode; workspace: string | null } | null>(null)
  const suppressStoreToUrlRef = useRef(false)
  const workspaceIds = useMemo(() => new Set(state.workspaces.map((item) => item.id)), [state.workspaces])
  const settingsSection = parseSettingsSectionId(settings)

  useEffect(() => {
    const currentUrlState = { view, workspace }
    const lastUrlState = lastUrlStateRef.current
    const urlChanged = !lastUrlState
      || lastUrlState.view !== currentUrlState.view
      || lastUrlState.workspace !== currentUrlState.workspace
    if (urlChanged) lastUrlStateRef.current = currentUrlState

    let appliedUrlState = false
    const currentStoreState = getWorkspaceState()

    if (urlChanged && view !== currentStoreState.viewMode) {
      workspaceActions.setViewMode(view)
      appliedUrlState = true
    }

    if (
      state.backendReady
      && workspace
      && workspaceIds.has(workspace)
      && workspace !== currentStoreState.activeWorkspaceId
    ) {
      workspaceActions.setActiveWorkspace(workspace)
      appliedUrlState = true
    }

    if (appliedUrlState) {
      suppressStoreToUrlRef.current = true
    }
  }, [workspaceActions, state.backendReady, view, workspace, workspaceIds])

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

    const nextUrlState: Partial<{ view: ViewMode; workspace: string }> = {}
    if (view !== state.viewMode) nextUrlState.view = state.viewMode
    if (state.backendReady && state.activeWorkspaceId && workspace !== state.activeWorkspaceId) {
      nextUrlState.workspace = state.activeWorkspaceId
    }

    if (Object.keys(nextUrlState).length > 0) {
      lastUrlStateRef.current = {
        view: nextUrlState.view ?? view,
        workspace: nextUrlState.workspace ?? workspace,
      }
      void setUrlState(nextUrlState)
    }
  }, [setUrlState, state.activeWorkspaceId, state.backendReady, state.viewMode, view, workspace])

  return null
}
