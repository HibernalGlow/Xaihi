// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setOverlay = vi.hoisted(() => vi.fn())
const setUrlState = vi.hoisted(() => vi.fn())
const urlState = vi.hoisted(() => ({
  view: "cards" as const,
  workspace: null as string | null,
  settings: null as string | null,
}))
const storeState = vi.hoisted(() => ({
  viewMode: "cards" as const,
  activeWorkspaceId: "ws-1",
  backendReady: true,
  workspaces: [{ id: "ws-1" }],
  overlay: null as null | "settings",
}))

vi.mock("nuqs", async () => {
  const actual = await vi.importActual<typeof import("nuqs")>("nuqs")
  return {
    ...actual,
    useQueryStates: () => [
      {
        view: urlState.view,
        workspace: urlState.workspace,
        settings: urlState.settings,
      },
      setUrlState,
    ],
  }
})

vi.mock("@/store/workspaceStore", () => ({
  getWorkspaceState: () => ({
    viewMode: storeState.viewMode,
    activeWorkspaceId: storeState.activeWorkspaceId,
  }),
  useWorkspaceActions: () => ({
    setViewMode: vi.fn(),
    setActiveWorkspace: vi.fn(),
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
    storeState.overlay = null
  })

  afterEach(() => {
    cleanup()
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

  it("[settings.deeplink.clear] clears settings query when overlay is closed", async () => {
    urlState.settings = "runtime"
    storeState.overlay = null
    render(<WorkspaceUrlState />)

    await waitFor(() => {
      expect(setUrlState).toHaveBeenCalledWith({ settings: null })
    })
  })
})
