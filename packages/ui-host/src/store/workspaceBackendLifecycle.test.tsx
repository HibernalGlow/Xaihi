// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createXiraniteSystemClient, createXiraniteWorkspaceClient } from "@xiranite/api/client"
import { BackendStatusBanner } from "@/components/workspace/BackendStatusBanner"
import { BackendConnectionBoundary, WorkspaceProvider, workspaceSnapshotHydrationKey } from "./workspaceContext"
import { useWorkspaceActions, useWorkspaceShallowSelector, useWorkspaceStore } from "./workspaceStore"

const healthMock = vi.hoisted(() => vi.fn())
const loadSnapshotMock = vi.hoisted(() => vi.fn())
const persistSnapshotMock = vi.hoisted(() => vi.fn())

vi.mock("@xiranite/api/client", () => ({
  createXiraniteSystemClient: vi.fn(() => ({ health: healthMock })),
  createXiraniteWorkspaceClient: vi.fn(() => ({
    loadSnapshot: loadSnapshotMock,
    persistSnapshot: persistSnapshotMock,
  })),
}))

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))
  useWorkspaceStore.setState({ restoreWorkspaceComponents: true, components: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  healthMock.mockReset()
  loadSnapshotMock.mockReset()
  persistSnapshotMock.mockReset()
  vi.unstubAllGlobals()
  delete window.__XIRANITE_BACKEND__
  localStorage.clear()
  useWorkspaceStore.setState({ restoreWorkspaceComponents: false, components: [] })
})

describe("WorkspaceProvider backend lifecycle", () => {
  test("remounts backend-owned content when the backend connection changes", async () => {
    let mounts = 0
    function BackendOwnedProbe() {
      const [instance] = useState(() => ++mounts)
      return <output data-testid="backend-instance">{instance}</output>
    }

    const view = render(
      <BackendConnectionBoundary config={{ baseUrl: "http://127.0.0.1:39110", token: "old-token" }}>
        <BackendOwnedProbe />
      </BackendConnectionBoundary>,
    )
    expect(screen.getByTestId("backend-instance").textContent).toBe("1")

    view.rerender(
      <BackendConnectionBoundary config={{ baseUrl: "http://127.0.0.1:39111", token: "new-token" }}>
        <BackendOwnedProbe />
      </BackendConnectionBoundary>,
    )

    await waitFor(() => expect(screen.getByTestId("backend-instance").textContent).toBe("2"))

    view.rerender(
      <BackendConnectionBoundary config={{ baseUrl: "http://127.0.0.1:39111", token: "new-token", instanceId: "replacement" }}>
        <BackendOwnedProbe />
      </BackendConnectionBoundary>,
    )

    await waitFor(() => expect(screen.getByTestId("backend-instance").textContent).toBe("3"))
  })

  test("does not rehydrate for component-only snapshots while component restore is disabled", () => {
    const base = {
      workspaces: [{ id: "ws-stable", label: "Stable", createdAt: 1, updatedAt: 1 }],
      lanes: [],
    }
    const first = { ...base, components: [{ id: "component-a", moduleId: "neoview", workspaceId: "ws-stable", createdAt: 1, updatedAt: 1 }] }
    const second = { ...base, components: [{ id: "component-b", moduleId: "neoview", workspaceId: "ws-stable", createdAt: 2, updatedAt: 2 }] }

    expect(workspaceSnapshotHydrationKey(first, false)).toBe(workspaceSnapshotHydrationKey(second, false))
    expect(workspaceSnapshotHydrationKey(first, true)).not.toBe(workspaceSnapshotHydrationKey(second, true))
  })

  test("restores cached component rows only after automatic restore is enabled", async () => {
    useWorkspaceStore.setState({ restoreWorkspaceComponents: false, components: [] })
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:39106", token: "workspace-token" }
    healthMock.mockResolvedValue({ ok: true })
    loadSnapshotMock.mockResolvedValue({
      workspaces: [{ id: "ws-restore", label: "Restore", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [{ id: "component-restore", moduleId: "neoview", workspaceId: "ws-restore", createdAt: 1, updatedAt: 1 }],
    })

    renderWithQuery(
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("component-count").textContent).toBe("0"))
    useWorkspaceStore.getState().setRestoreWorkspaceComponents(true)
    await waitFor(() => expect(screen.getByTestId("component-count").textContent).toBe("1"))
  })

  test("does not load a workspace snapshot when the local backend is not configured", async () => {
    renderWithQuery(
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("not-ready"))
    expect(createXiraniteSystemClient).not.toHaveBeenCalled()
    expect(createXiraniteWorkspaceClient).not.toHaveBeenCalled()
    expect(loadSnapshotMock).not.toHaveBeenCalled()
  })

  test("checks local backend health without forwarding the TanStack Query context as an argument", async () => {
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:39103", token: "workspace-token" }
    healthMock.mockResolvedValueOnce({ ok: true })
    loadSnapshotMock.mockResolvedValueOnce({
      workspaces: [{ id: "ws-backend-ready", label: "Backend Ready", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [],
    })

    renderWithQuery(
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("ready"))
    expect(healthMock).toHaveBeenCalledWith()
  })

  test("loads and hydrates the workspace only after the local backend health check is ready", async () => {
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:39101", token: "workspace-token" }
    healthMock.mockResolvedValueOnce({ ok: true })
    loadSnapshotMock.mockResolvedValueOnce({
      workspaces: [{ id: "ws-backend-ready", label: "Backend Ready", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [],
    })

    renderWithQuery(
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("ready"))
    expect(screen.getByTestId("active-workspace").textContent).toBe("ws-backend-ready")
    expect(createXiraniteSystemClient).toHaveBeenCalledWith("http://127.0.0.1:39101", { token: "workspace-token" })
    expect(createXiraniteWorkspaceClient).toHaveBeenCalledWith("http://127.0.0.1:39101", { token: "workspace-token" })
    expect(loadSnapshotMock).toHaveBeenCalledTimes(1)
  })

  test("does not persist a snapshot solely because it was hydrated", async () => {
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:39105", token: "workspace-token" }
    healthMock.mockResolvedValueOnce({ ok: true })
    loadSnapshotMock.mockResolvedValueOnce({
      workspaces: [{ id: "ws-hydrated", label: "Hydrated", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [{ id: "component-hydrated", moduleId: "neoview", workspaceId: "ws-hydrated", createdAt: 1, updatedAt: 1 }],
    })

    renderWithQuery(
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("ready"))
    await new Promise((resolve) => setTimeout(resolve, 650))
    expect(persistSnapshotMock).not.toHaveBeenCalled()
  })

  test("does not hydrate an older persisted snapshot over newer component data", async () => {
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:39104", token: "workspace-token" }
    healthMock.mockResolvedValueOnce({ ok: true })
    loadSnapshotMock.mockResolvedValueOnce({
      workspaces: [{ id: "ws-race", label: "Race", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [{ id: "component-race", moduleId: "classf", workspaceId: "ws-race", data: { value: "initial" }, createdAt: 1, updatedAt: 1 }],
    })
    const { queryClient } = renderWithQuery(
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("component-value").textContent).toBe("initial"))
    const deferred = createDeferred<void>()
    persistSnapshotMock.mockImplementationOnce(() => deferred.promise)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "set older component data" }))
    await waitFor(() => expect(persistSnapshotMock).toHaveBeenCalledTimes(1), { timeout: 2_000 })
    await user.click(screen.getByRole("button", { name: "set latest component data" }))
    expect(screen.getByTestId("component-value").textContent).toBe("latest")

    deferred.resolve()
    await waitFor(() => {
      const cached = queryClient.getQueryData<{ components: Array<{ data?: Record<string, unknown> }> }>(["workspace", "snapshot", "http://127.0.0.1:39104", "token:set", "instance:unknown"])
      expect(cached?.components[0]?.data?.value).toBe("older")
    })
    expect(screen.getByTestId("component-value").textContent).toBe("latest")
  })

  test("keeps the workspace not-ready and does not load snapshots when health check fails", async () => {
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:39102" }
    healthMock.mockRejectedValueOnce(new Error("connection refused"))

    renderWithQuery(
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>,
    )

    await waitFor(() => expect(createXiraniteSystemClient).toHaveBeenCalled())
    expect(screen.getByTestId("backend-ready").textContent).toBe("not-ready")
    expect(createXiraniteWorkspaceClient).not.toHaveBeenCalled()
    expect(loadSnapshotMock).not.toHaveBeenCalled()
  })
})

describe("BackendStatusBanner", () => {
  test("shows a runtime banner for missing backend config and opens settings", async () => {
    const user = userEvent.setup()
    renderWithQueryAndI18n(<BackendStatusBanner />)

    expect(await screen.findByText(/Local Backend is not configured/i)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /runtime settings/i }))
    await waitFor(() => expect(screen.getByTestId("overlay").textContent).toBe("settings"))
  })
})

function WorkspaceStateProbe() {
  const state = useWorkspaceShallowSelector((workspace) => ({
    backendReady: workspace.backendReady,
    activeWorkspaceId: workspace.activeWorkspaceId,
    overlay: workspace.overlay,
    componentValue: workspace.components.find((component) => component.id === "component-race")?.data?.value,
    componentCount: workspace.components.length,
  }))
  const workspaceActions = useWorkspaceActions()

  return (
    <div>
      <output data-testid="backend-ready">{state.backendReady ? "ready" : "not-ready"}</output>
      <output data-testid="active-workspace">{state.activeWorkspaceId}</output>
      <output data-testid="overlay">{state.overlay ?? "none"}</output>
      <output data-testid="component-value">{String(state.componentValue ?? "")}</output>
      <output data-testid="component-count">{state.componentCount}</output>
      <button type="button" onClick={() => workspaceActions.patchComponentData("component-race", { value: "older" })}>set older component data</button>
      <button type="button" onClick={() => workspaceActions.patchComponentData("component-race", { value: "latest" })}>set latest component data</button>
    </div>
  )
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    ...render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
    ),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

function renderWithQueryAndI18n(ui: React.ReactElement) {
  return renderWithQuery(
    <I18nextProvider i18n={i18n}>
      {ui}
      <WorkspaceStateProbe />
    </I18nextProvider>,
  )
}

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources: {
    en: {
      common: { unknown: "unknown" },
      settings: {
        developerRuntime: { statusChecking: "CHECKING" },
        backendBanner: {
          missingConfig: "Local Backend is not configured, so workspace and node execution are paused.",
          unreachable: "Local Backend is unreachable: {{url}}. Workspace and node execution are paused.",
          retry: "Retry",
          openRuntime: "Runtime settings",
        },
      },
    },
  },
})
