// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setOverlay = vi.hoisted(() => vi.fn())
const setUrlState = vi.hoisted(() => vi.fn())
const urlState = vi.hoisted(() => ({
  view: "cards" as "cards" | "flow" | null,
  layout: "trellis" as "trellis" | null,
  navigation: "free" as "free" | null,
  workspace: null as string | null,
  settings: null as string | null,
  settingsStep: null as string | null,
}))
const storeState = vi.hoisted(() => ({
  viewMode: "cards" as "cards" | "flow",
  cardLayout: "trellis",
  trellisNavigation: "free",
  viewModeTouched: true,
  activeWorkspaceId: "ws-1",
  backendReady: true,
  workspaces: [{ id: "ws-1" }],
  overlay: null as null | "settings" | "dashboard",
}))

vi.mock("nuqs", async () => {
  const actual = await vi.importActual<typeof import("nuqs")>("nuqs")
  return {
    ...actual,
    useQueryStates: () => [
      {
        view: urlState.view,
        workspace: urlState.workspace,
        layout: urlState.layout,
        navigation: urlState.navigation,
        settings: urlState.settings,
        settingsStep: urlState.settingsStep,
      },
      setUrlState,
    ],
  }
})

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: { getState: () => storeState },
  getWorkspaceState: () => ({
    viewMode: storeState.viewMode,
    activeWorkspaceId: storeState.activeWorkspaceId,
  }),
  useWorkspaceActions: () => ({
    setViewMode: vi.fn(),
    setActiveWorkspace: vi.fn(),
    setCardLayout: vi.fn(),
    setTrellisNavigation: vi.fn(),
    setOverlay,
  }),
  useWorkspaceShallowSelector: (select: (state: typeof storeState) => unknown) => select(storeState),
}))

import { WorkspaceUrlState } from "./WorkspaceUrlState"

describe("WorkspaceUrlState settings deep link", () => {
  beforeEach(() => {
    setOverlay.mockClear()
    setUrlState.mockClear()
    urlState.settings = null
    urlState.settingsStep = null
    storeState.overlay = null
    storeState.viewMode = "cards"
    storeState.viewModeTouched = true
    urlState.view = "cards"
    urlState.layout = "trellis"
    urlState.navigation = "free"
  })

  afterEach(() => {
    cleanup()
  })

  it("writes the first user view change after remounting an already matching explicit link", async () => {
    const { rerender } = render(<WorkspaceUrlState />)
    expect(setUrlState).not.toHaveBeenCalled()
    storeState.viewMode = "flow"
    rerender(<WorkspaceUrlState />)
    await waitFor(() => expect(setUrlState).toHaveBeenCalledWith({ view: "flow", layout: null, navigation: null }))
  })
  it("leaves an unqualified startup URL untouched until the user changes views", () => {
    urlState.view = null; urlState.layout = null; urlState.navigation = null
    storeState.viewModeTouched = false
    render(<WorkspaceUrlState />)
    expect(setUrlState).not.toHaveBeenCalled()
  })
  it("[settings.deeplink.open] opens settings overlay for ?settings=workspace", async () => {
    urlState.settings = "workspace"
    render(<WorkspaceUrlState />)

    await waitFor(() => {
      expect(setOverlay).toHaveBeenCalledWith("settings")
    })
  })

  it("[settings.deeplink.ignore-unknown] does not open overlay for unknown settings values", async () => {
    urlState.settings = "not-a-real-section"
    render(<WorkspaceUrlState />)

    await waitFor(() => {
      expect(setOverlay).not.toHaveBeenCalled()
    })
  })

  it("closes settings without reopening it and clears the exact step link", async () => {
    urlState.settings = "runtime"
    urlState.settingsStep = "connection"
    storeState.overlay = "settings"
    const { rerender } = render(<WorkspaceUrlState />)
    setOverlay.mockClear()
    storeState.overlay = null
    rerender(<WorkspaceUrlState />)
    await waitFor(() => expect(setUrlState).toHaveBeenCalledWith({ settings: null, settingsStep: null }))
    expect(setOverlay).not.toHaveBeenCalled()
  })
  it("writes a dashboard link while preserving the selected workspace view, then restores the view link", async () => {
    storeState.viewMode = "flow"; urlState.view = "flow"; urlState.layout = null; urlState.navigation = null
    const { rerender } = render(<WorkspaceUrlState />)
    storeState.overlay = "dashboard"
    rerender(<WorkspaceUrlState />)
    await waitFor(() => expect(setUrlState).toHaveBeenCalledWith({ view: "dashboard", layout: null, navigation: null }))
    expect(storeState.viewMode).toBe("flow")
    setUrlState.mockClear(); storeState.overlay = null; rerender(<WorkspaceUrlState />)
    expect(setOverlay).not.toHaveBeenCalled()
  })
})
