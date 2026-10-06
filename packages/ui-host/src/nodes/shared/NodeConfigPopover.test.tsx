// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createCapabilityAdapters, NodeConfigPopover } from "./NodeConfigPopover"
import { NodeRuntimeProvider } from "./NodeRuntimeContext"

const configApi = vi.hoisted(() => ({
  getUi: vi.fn(),
  saveUi: vi.fn(),
}))

// Node configuration goes through the node UI seam; the remaining `nodeConfigApi` methods stay real so this
// test keeps exercising the component's own adapter wiring.
vi.mock("@/nodes/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nodes/shared/api")>()
  return { ...actual, nodeConfigApi: { ...actual.nodeConfigApi, ...configApi } }
})

beforeEach(() => {
  window.localStorage.clear()
  configApi.getUi.mockResolvedValue({ config: undefined, path: "D:/config/xiranite.config.toml" })
  configApi.saveUi.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("NodeConfigPopover configuration center", () => {
  test("keeps the dialog on left click and exposes common configuration actions on right click", async () => {
    const onClearOverride = vi.fn()
    const onOpenFile = vi.fn()
    const onReload = vi.fn()
    const onRestore = vi.fn()
    const onSave = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(<NodeConfigPopover
      configPath="D:/config/xiranite.config.toml"
      dirty={true}
      defaults={{ format: "AVIF" }}
      triggerLabel="Xlchemy configuration"
      t={translate}
      onClearOverride={onClearOverride}
      onOpenFile={onOpenFile}
      onReload={onReload}
      onRestore={onRestore}
      onSave={onSave}
    />)

    const trigger = screen.getByRole("button", { name: "Xlchemy configuration" })
    fireEvent.contextMenu(trigger, { clientX: 48, clientY: 64 })

    expect(screen.queryByRole("dialog", { name: "Xlchemy configuration" })).toBeNull()
    expect(await screen.findByRole("menuitem", { name: "Save as default" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Restore saved configuration" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Clear override" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Reload from TOML" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Open TOML file" })).toBeTruthy()

    await user.click(screen.getByRole("menuitem", { name: "Save as default" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    fireEvent.contextMenu(trigger, { clientX: 48, clientY: 64 })
    await user.click(await screen.findByRole("menuitem", { name: "Restore saved configuration" }))
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1))

    fireEvent.contextMenu(trigger, { clientX: 48, clientY: 64 })
    await user.click(await screen.findByRole("menuitem", { name: "Clear override" }))
    await waitFor(() => expect(onClearOverride).toHaveBeenCalledTimes(1))

    fireEvent.contextMenu(trigger, { clientX: 48, clientY: 64 })
    await user.click(await screen.findByRole("menuitem", { name: "Reload from TOML" }))
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))

    fireEvent.contextMenu(trigger, { clientX: 48, clientY: 64 })
    await user.click(await screen.findByRole("menuitem", { name: "Open TOML file" }))
    await waitFor(() => expect(onOpenFile).toHaveBeenCalledTimes(1))

    await user.click(trigger)
    expect(await screen.findByRole("dialog", { name: "Xlchemy configuration" })).toBeTruthy()
  })

  test("persists restore-on-startup in node UI config and restores after remount", async () => {
    let persisted = false
    configApi.getUi.mockImplementation(async () => ({
      config: { restoreOnStartup: persisted },
      path: "D:/config/xiranite.config.toml",
    }))
    configApi.saveUi.mockImplementation(async (_nodeId, config) => {
      persisted = config.restoreOnStartup
    })
    const onRestore = vi.fn()
    const user = userEvent.setup()

    const first = renderWithProviders(<NodeConfigPopover
      dirty={false}
      defaults={{ format: "AVIF" }}
      triggerLabel="Xlchemy configuration"
      t={translate}
      onReload={vi.fn()}
      onRestore={onRestore}
      onSave={vi.fn()}
    />, "xlchemy")

    await user.click(screen.getByRole("button", { name: "Xlchemy configuration" }))
    const restoreSwitch = await screen.findByRole("switch")
    await waitFor(() => expect(restoreSwitch.hasAttribute("disabled")).toBe(false))
    await user.click(restoreSwitch)
    await waitFor(() => expect(configApi.saveUi).toHaveBeenCalledWith("xlchemy", { restoreOnStartup: true }))
    first.unmount()
    onRestore.mockClear()

    renderWithProviders(<NodeConfigPopover
      dirty={false}
      defaults={{ format: "AVIF" }}
      triggerLabel="Xlchemy configuration"
      t={translate}
      onReload={vi.fn()}
      onRestore={onRestore}
      onSave={vi.fn()}
    />, "xlchemy")

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1))
    expect(configApi.getUi).toHaveBeenLastCalledWith("xlchemy")
  })

  test("migrates the config-path localStorage preference into node UI config", async () => {
    const configPath = "D:/config/xiranite.config.toml"
    const legacyKey = `xiranite:auto-restore:config:${configPath}`
    window.localStorage.setItem(legacyKey, "1")
    const onRestore = vi.fn()

    renderWithProviders(<NodeConfigPopover
      configPath={configPath}
      dirty={false}
      defaults={{ format: "AVIF" }}
      triggerLabel="Xlchemy configuration"
      t={translate}
      onReload={vi.fn()}
      onRestore={onRestore}
      onSave={vi.fn()}
    />, "xlchemy")

    await waitFor(() => expect(configApi.saveUi).toHaveBeenCalledWith("xlchemy", { restoreOnStartup: true }))
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1))
    expect(window.localStorage.getItem(legacyKey)).toBeNull()
  })

  test("keeps history off the hot path and loads it only when its tab opens", async () => {
    const list = vi.fn().mockResolvedValue({ versions: [] })
    const user = userEvent.setup()

    renderWithProviders(<NodeConfigPopover
      dirty={false}
      defaults={{ reader: { columns: 2 } }}
      triggerLabel="Configuration center"
      history={{
        list,
        inspect: vi.fn(),
        restore: vi.fn(),
      }}
      t={translate}
      onReload={vi.fn()}
      onRestore={vi.fn()}
      onSave={vi.fn()}
    />)

    expect(list).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Configuration center" }))

    expect(await screen.findByRole("dialog", { name: "Configuration center" })).toBeTruthy()
    expect(list).not.toHaveBeenCalled()
    expect(screen.getByRole("tab", { name: "Current configuration" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Presets" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Change history" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Import / export" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Backup / sync" })).toBeTruthy()

    await user.click(screen.getByRole("tab", { name: "Change history" }))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  })

  test("uses the structured fallback while allowing a node-owned current view", async () => {
    const user = userEvent.setup()
    const view = renderWithProviders(<NodeConfigPopover
      dirty={false}
      defaults={{ reader: { columns: 2 } }}
      triggerLabel="Configuration center"
      t={translate}
      onReload={vi.fn()}
      onRestore={vi.fn()}
      onSave={vi.fn()}
    />)

    await user.click(screen.getByRole("button", { name: "Configuration center" }))
    expect(await screen.findByText('"columns": 2')).toBeTruthy()

    view.unmount()
    renderWithProviders(<NodeConfigPopover
      dirty={false}
      defaults={{ reader: { columns: 2 } }}
      tomlSource={'[nodes.neoview]\ncolumns = 2\n'}
      triggerLabel="Configuration center"
      presentation={{ current: () => <div>NeoView configuration summary</div> }}
      t={translate}
      onReload={vi.fn()}
      onRestore={vi.fn()}
      onSave={vi.fn()}
    />)
    await user.click(screen.getByRole("button", { name: "Configuration center" }))
    expect(await screen.findByText("NeoView configuration summary")).toBeTruthy()
    expect(await screen.findByText("TOML source")).toBeTruthy()
  })

  test("adapts injected node config capabilities for any configuration center", async () => {
    const reload = vi.fn()
    const getVersions = vi.fn().mockResolvedValue({ versions: [] })
    const restoreVersion = vi.fn().mockResolvedValue({ config: {}, path: "xiranite.config.toml" })
    const exportConfig = vi.fn().mockResolvedValue({ content: "", filename: "demo.toml", mimeType: "application/toml" })
    const importConfig = vi.fn().mockResolvedValue({ config: {}, path: "xiranite.config.toml" })
    const adapters = createCapabilityAdapters({
      getVersions,
      inspectVersion: vi.fn(),
      restoreVersion,
      exportConfig,
      importConfig,
      getHistoryRepository: vi.fn(),
      createBackup: vi.fn(),
      setHistoryRemote: vi.fn(),
      syncHistory: vi.fn(),
    } as never, reload)

    await adapters.history?.list({ limit: 5 })
    await adapters.history?.restore("revision-1")
    await adapters.transfer?.export("toml")
    await adapters.transfer?.import("[nodes.demo]", "toml")

    expect(getVersions).toHaveBeenCalledWith({ limit: 5 })
    expect(restoreVersion).toHaveBeenCalledWith("revision-1")
    expect(reload).toHaveBeenCalledTimes(1)
    expect(exportConfig).toHaveBeenCalledWith("toml")
    expect(importConfig).toHaveBeenCalledWith("[nodes.demo]", "toml")
    expect(adapters.backup).toBeTruthy()
  })

  test("renders canonical TOML with lazily loaded Shiki highlighting", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NodeConfigPopover
      dirty={false}
      defaults={{ accent: "#22c55e", enabled: true }}
      tomlSource={'[nodes.demo]\naccent = "#22c55e"\nenabled = true\n'}
      triggerLabel="Configuration center"
      t={translate}
      onReload={vi.fn()}
      onRestore={vi.fn()}
      onSave={vi.fn()}
    />)

    await user.click(screen.getByRole("button", { name: "Configuration center" }))
    expect(await screen.findByText("TOML source")).toBeTruthy()
    await waitFor(() => expect(document.querySelector(".node-config-toml .shiki")).toBeTruthy())
    expect(screen.queryByText('"accent": "#22c55e"')).toBeNull()
    expect(screen.getAllByText("#22c55e").length).toBeGreaterThan(0)
    const sourceScroll = document.querySelector('[data-node-config-source-scroll="true"]')
    expect(sourceScroll?.className).toContain("h-[min(30rem,calc(100dvh-12rem))]")
    expect(sourceScroll?.className).toContain("overflow-hidden")
    expect(sourceScroll?.getAttribute("data-input-interactive")).toBe("true")
    expect(sourceScroll?.querySelector('[data-slot="scroll-area-viewport"]')).toBeTruthy()
  })
})

const translate = (_key: string, fallback?: string) => fallback ?? _key

function renderWithProviders(element: React.ReactElement, nodeId?: string) {
  const content = nodeId ? <NodeRuntimeProvider nodeId={nodeId}>{element}</NodeRuntimeProvider> : element
  return render(<TooltipProvider>{content}</TooltipProvider>)
}
