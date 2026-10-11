import { useEffect, useRef } from "react"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import { parseSettingsSectionId } from "@/components/views/settings/settingsNavigation"
import { useWorkspaceActions, useWorkspaceShallowSelector, useWorkspaceStore } from "@/store/workspaceStore"

const workspaceUrlParsers = {
  view: parseAsStringLiteral(["dashboard", "cards", "flow", "lane"] as const),
  layout: parseAsStringLiteral(["focus", "trellis"] as const),
  navigation: parseAsStringLiteral(["focus", "free"] as const),
  settings: parseAsString,
}

/** Explicit share/deep links override the startup preference, including child modes. */
export function WorkspaceUrlState() {
  const [url, setUrlState] = useQueryStates(workspaceUrlParsers, { history: "replace", shallow: true })
  const state = useWorkspaceShallowSelector((s) => ({ viewMode: s.viewMode, cardLayout: s.cardLayout, navigation: s.trellisNavigation, touched: s.viewModeTouched, overlay: s.overlay }))
  const actions = useWorkspaceActions()
  const last = useRef<string | null>(null)
  const initialized = useRef(false)
  const settingsSection = parseSettingsSectionId(url.settings)
  const signature = JSON.stringify([url.view, url.layout, url.navigation])
  useEffect(() => {
    if (last.current === signature) return
    const first = last.current === null
    last.current = signature
    initialized.current = true
    // An unqualified launch leaves startup settings in control.
    if (first && !url.view && !url.layout && !url.navigation) return
    if (url.view) actions.setViewMode(url.view)
    else if (url.layout || url.navigation) actions.setViewMode("cards")
    if (url.layout) actions.setCardLayout(url.layout)
    else if (url.navigation) actions.setCardLayout("trellis")
    if (url.navigation) actions.setTrellisNavigation(url.navigation)
  }, [signature, url.view, url.layout, url.navigation, actions])

  useEffect(() => {
    if (settingsSection && state.overlay !== "settings") actions.setOverlay("settings")
  }, [settingsSection, state.overlay, actions])
  useEffect(() => {
    if (state.overlay !== "settings" && url.settings) void setUrlState({ settings: null })
  }, [setUrlState, url.settings, state.overlay])

  useEffect(() => {
    if (!initialized.current) return
    // URL hydration writes synchronously. Wait for React to render that snapshot;
    // a persistent "suppress next update" flag can swallow the first user change after remount.
    const live = useWorkspaceStore.getState()
    if (live.viewMode !== state.viewMode || live.cardLayout !== state.cardLayout || live.trellisNavigation !== state.navigation) return
    if (!state.touched) return
    const next = { view: state.viewMode, layout: state.viewMode === 'cards' ? state.cardLayout : null,
      navigation: state.viewMode === 'cards' && state.cardLayout === 'trellis' ? state.navigation : null }
    const nextSignature = JSON.stringify([next.view, next.layout, next.navigation])
    if (signature !== nextSignature) { last.current = nextSignature; void setUrlState(next) }
  }, [state.viewMode, state.cardLayout, state.navigation, state.touched, signature, setUrlState])
  return null
}
