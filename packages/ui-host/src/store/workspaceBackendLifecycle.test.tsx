// @vitest-environment happy-dom
//
// 2026-10-07 起 `WorkspaceProvider` 与 `BackendStatusBanner` 走的是 DSH 插件标准面
// （桥 + `ctx.remote.settings`，见 ADR-0013 与 `tests/document-bridge-wiring.spec.ts`），
// 不再是 Xiranite 那个本地后端。这份文件里 **`WorkspaceProvider` 与 `BackendStatusBanner`
// 两段都已跟着重写**：前者把"本地后端健康"那道门换成"桥握手落地"，读写从 REST 换成
// `state.getData` / `state.patchData`（假桥 `fakeHost` 在下面）；后者断的是桥在/不在两条读法。
// `WorkspaceProvider backend lifecycle` 里 `remounts backend-owned content…` 那一条保持原样：
// 它单量的 `BackendConnectionBoundary` 本身没改（`workspaceContext.tsx` 只是不再包它）。
// 文件顶部的 `@xiranite/api/client` mock 留着当回归网：凡断言 `not.toHaveBeenCalled()` 的用例，
// 量的都是"REST 通路确实一次都没被碰"。
// 注意这份文件**不在** `vitest.config.ts` 的 `include` 白名单里 —— 跑它要显式指配置
// （`pnpm exec vitest run --config <一份把 include 指到本文件的配置>`），默认门禁不跑它。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { BRIDGE_CONTRACT_VERSION, BRIDGE_SCHEMA, type BridgeReady, type DocumentBridge } from "@hibernalglow/xaihi-sdk/bridge"
import type { WorkspaceSnapshotDTO } from "@xiranite/shared"
import { createXiraniteSystemClient, createXiraniteWorkspaceClient } from "@xiranite/api/client"
import { DocumentBridgeProvider } from "@/document/bridge-context"
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
    const host = fakeHost({
      workspaces: [{ id: "ws-restore", label: "Restore", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [{ id: "component-restore", moduleId: "neoview", workspaceId: "ws-restore", createdAt: 1, updatedAt: 1 }],
    })

    renderWorkspace(host.bridge)

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("ready"))
    expect(screen.getByTestId("component-count").textContent).toBe("0")
    useWorkspaceStore.getState().setRestoreWorkspaceComponents(true)
    await waitFor(() => expect(screen.getByTestId("component-count").textContent).toBe("1"))
  })

  test("没有桥（不在宿主里）时不加载快照，也不碰 REST 客户端", async () => {
    renderWorkspace(null)

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("not-ready"))
    expect(createXiraniteSystemClient).not.toHaveBeenCalled()
    expect(createXiraniteWorkspaceClient).not.toHaveBeenCalled()
    expect(loadSnapshotMock).not.toHaveBeenCalled()
  })

  test("握手落地（bridge.ready() 非 null）之前不读快照，落地后才读", async () => {
    const host = fakeHost({
      workspaces: [{ id: "ws-late", label: "Late", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [],
    })
    // 起手还没握手：`ready()` 回 null；握手是异步落地的，用一个开关模拟那一小段在飞。
    let handshaken = false
    const lateBridge: DocumentBridge = { ...host.bridge, ready: () => (handshaken ? HOST_READY : null) }

    renderWorkspace(lateBridge)

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("not-ready"))
    expect(host.calls.some((call) => call.method === "state.getData")).toBe(false)

    handshaken = true
    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("ready"))
    expect(host.calls.some((call) => call.method === "state.getData")).toBe(true)
  })

  test("握手落地后从宿主读出整份快照（走 xaihi-workspace 那一格）并灌进 store", async () => {
    const host = fakeHost({
      workspaces: [{ id: "ws-backend-ready", label: "Backend Ready", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [],
    })

    renderWorkspace(host.bridge)

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("ready"))
    expect(screen.getByTestId("active-workspace").textContent).toBe("ws-backend-ready")
    expect(host.calls.some((call) => call.method === "state.getData" && call.args[0] === "xaihi-workspace")).toBe(true)
    // REST 通路整块下线：即使被 import 进来也不该有一次调用。
    expect(createXiraniteSystemClient).not.toHaveBeenCalled()
    expect(createXiraniteWorkspaceClient).not.toHaveBeenCalled()
  })

  test("does not persist a snapshot solely because it was hydrated", async () => {
    const host = fakeHost({
      workspaces: [{ id: "ws-hydrated", label: "Hydrated", createdAt: 1, updatedAt: 1 }],
      lanes: [],
      components: [{ id: "component-hydrated", moduleId: "neoview", workspaceId: "ws-hydrated", createdAt: 1, updatedAt: 1 }],
    })

    renderWorkspace(host.bridge)

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("ready"))
    await new Promise((resolve) => setTimeout(resolve, 650))
    expect(host.calls.some((call) => call.method === "state.patchData")).toBe(false)
  })

  test("does not hydrate an older persisted snapshot over newer component data", async () => {
    const host = fakeHost(
      {
        workspaces: [{ id: "ws-race", label: "Race", createdAt: 1, updatedAt: 1 }],
        lanes: [],
        components: [{ id: "component-race", moduleId: "classf", workspaceId: "ws-race", data: { value: "initial" }, createdAt: 1, updatedAt: 1 }],
      },
      { deferFirstPersist: true },
    )
    const { queryClient } = renderWorkspace(host.bridge)

    await waitFor(() => expect(screen.getByTestId("component-value").textContent).toBe("initial"))
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "set older component data" }))
    await waitFor(() => expect(host.calls.filter((call) => call.method === "state.patchData")).toHaveLength(1), { timeout: 2_000 })
    await user.click(screen.getByRole("button", { name: "set latest component data" }))
    expect(screen.getByTestId("component-value").textContent).toBe("latest")

    host.releaseFirstPersist()
    await waitFor(() => {
      const cached = queryClient.getQueryData<{ components: Array<{ data?: Record<string, unknown> }> }>(["workspace", "snapshot", "hosted"])
      expect(cached?.components[0]?.data?.value).toBe("older")
    })
    // 落盘回来的是更旧的那份，但它不该把界面从 "latest" 拽回去。
    expect(screen.getByTestId("component-value").textContent).toBe("latest")
  })

  test("桥一直没握手（ready() 恒 null）时保持 not-ready，也不读也不写", async () => {
    const host = fakeHost({ workspaces: [], lanes: [], components: [] })
    const neverReady: DocumentBridge = { ...host.bridge, ready: () => null }

    renderWorkspace(neverReady)

    await waitFor(() => expect(screen.getByTestId("backend-ready").textContent).toBe("not-ready"))
    expect(host.calls.some((call) => call.method === "state.getData")).toBe(false)
    expect(host.calls.some((call) => call.method === "state.patchData")).toBe(false)
    expect(createXiraniteSystemClient).not.toHaveBeenCalled()
  })
})

describe("BackendStatusBanner", () => {
  test("不在宿主里时给一条说真话的退化，并且能开工作台自己的设置面", async () => {
    const user = userEvent.setup()
    // 没有 `<DocumentBridgeProvider>` ⇒ 桥读出来是 null ⇒ "这份文档不在宿主里"。
    // 它过去断的是 "Local Backend is not configured" —— 那条 REST 通路与它要的
    // `window.__XIRANITE_BACKEND__` 已在 2026-10-07 作废（见该组件的头注释）。
    renderWithQueryAndI18n(<BackendStatusBanner />)

    // 断的是它真渲染出来的那句话（内联资源是英文），不是那个 i18n key。
    expect(await screen.findByText(/not running inside a host/)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /runtime settings/i }))
    await waitFor(() => expect(screen.getByTestId("overlay").textContent).toBe("settings"))
  })

  test("有桥时整条横幅不出现（接通是常态，不为在飞的握手闪红）", () => {
    // 这里**不能**用 `renderWithQueryAndI18n`：它顺手挂的 `WorkspaceStateProbe` 用了一批
    // `<output>` 元素，而 `<output>` 的隐式 ARIA role 就是 `status` —— 那样 `queryByRole("status")`
    // 命中的是探针而不是横幅，判据会恒绿。不加探针，`role="status"` 才唯一指向横幅。
    renderWithI18n(
      <DocumentBridgeProvider bridge={bridgeStub()}>
        <BackendStatusBanner />
      </DocumentBridgeProvider>,
    )
    expect(screen.queryByRole("status")).toBeNull()
  })
})

/** 最小假桥：横幅只看 `bridge !== null`，这一格占住就够，桥的动词一条都不会被调到。 */
function bridgeStub(): DocumentBridge {
  return {
    ready: () => null,
    hello: () => {},
    receive: () => false,
    call: () => Promise.reject(new Error("bridgeStub: 这条判据不该调桥")),
    abortAll: () => {},
  }
}

/** 一份"握手已完成"的应答：`useBridgeReady` 只认 `ready() !== null`，字段照契约填齐。 */
const HOST_READY: BridgeReady = {
  schema: BRIDGE_SCHEMA,
  kind: "ready",
  contractVersion: BRIDGE_CONTRACT_VERSION,
  granted: ["contract", "state", "env", "config"],
  refused: [],
  degraded: [],
}

type HostCall = { method: string; args: readonly unknown[] }

/**
 * 假的宿主桥。
 *
 * 只答 `WorkspaceProvider` 会问的两条 `state` 动词（读回 `{json, revision}`、写时带 `expectedRevision`），
 * 其余一律点名拒绝 —— 于是"它到底调了什么"是一份可数的账（`calls`），而不是靠 mock 的调用次数去猜。
 * 与 `bridgeStub` 的分工：那个只占位（横幅判据用），这个要真答一轮往返（工作区判据用）。
 * @param initial - 那一格已存的快照；不给 = 还没存过（读回空 `json`，即空工作区）。
 * @param options.deferFirstPersist - 第一次 `state.patchData` 挂住不返回，给竞态那一条用。
 */
function fakeHost(initial?: WorkspaceSnapshotDTO, options: { deferFirstPersist?: boolean } = {}) {
  let stored = initial === undefined ? "" : JSON.stringify(initial)
  let revision = initial === undefined ? 0 : 1
  let persistCount = 0
  const calls: HostCall[] = []
  const deferred = createDeferred<void>()
  const bridge: DocumentBridge = {
    ready: () => HOST_READY,
    hello: () => {},
    receive: () => false,
    call: (method: string, ...args: readonly unknown[]) => {
      calls.push({ method, args })
      if (method === "state.getData") return Promise.resolve({ json: stored, revision })
      if (method === "state.patchData") {
        persistCount += 1
        stored = String(args[1] ?? "")
        revision += 1
        if (options.deferFirstPersist && persistCount === 1) return deferred.promise.then(() => ({ revision }))
        return Promise.resolve({ revision })
      }
      return Promise.reject(new Error(`fakeHost: 不认识的动词 ${method}`))
    },
    abortAll: () => {},
  }
  return { bridge, calls, releaseFirstPersist: () => deferred.resolve() }
}

/** 把 `WorkspaceProvider` 挂在一条（可能是 `null` 的）桥下面。 */
function renderWorkspace(bridge: DocumentBridge | null) {
  return renderWithQuery(
    <DocumentBridgeProvider bridge={bridge}>
      <WorkspaceProvider>
        <WorkspaceStateProbe />
      </WorkspaceProvider>
    </DocumentBridgeProvider>,
  )
}

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
  return renderWithI18n(
    <>
      {ui}
      <WorkspaceStateProbe />
    </>,
  )
}

/**
 * 只挂 i18n，不挂探针。
 *
 * 与上面那个的区别是判据要断的东西：探针用 `<output>`（隐式 role=`status`），
 * 所以凡是要拿 `role="status"` 指认横幅的用例都得走这一条，否则指认的是探针。
 */
function renderWithI18n(ui: React.ReactElement) {
  return renderWithQuery(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)
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
          noHost: "This document is not running inside a host, so the capabilities that need one (config, persisted state, environment) are unavailable.",
          missingConfig: "Local Backend is not configured, so workspace and node execution are paused.",
          unreachable: "Local Backend is unreachable: {{url}}. Workspace and node execution are paused.",
          retry: "Retry",
          openRuntime: "Runtime settings",
        },
      },
    },
  },
})
