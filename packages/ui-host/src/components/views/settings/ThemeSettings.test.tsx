// @vitest-environment happy-dom
import { DEFAULT_DESIGN_THEME } from "@/lib/design-theme/contract"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NodeMemoryProtectionSettingsDTO } from "@xiranite/shared"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"
import { resolveSettingsChrome } from "./ThemeSettings"

const settingsQuery = vi.hoisted(() => ({
  value: null as string | null,
  set: vi.fn(async (next: string | null) => {
    settingsQuery.value = next
  }),
}))

const surfaceState = vi.hoisted(() => ({
  width: 920,
  height: 560,
  mode: "expanded" as NodeSurfaceMode,
  density: "roomy" as "tight" | "normal" | "roomy",
}))

vi.mock("nuqs", async () => {
  const actual = await vi.importActual<typeof import("nuqs")>("nuqs")
  return {
    ...actual,
    useQueryState: (key: string) => {
      if (key === "settings") return [settingsQuery.value, settingsQuery.set] as const
      return [null, vi.fn()] as const
    },
  }
})

vi.mock("@/nodes/shared/useNodeSurface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nodes/shared/useNodeSurface")>()
  return {
    ...actual,
    useNodeSurface: () => ({
      ref: { current: null },
      width: surfaceState.width,
      height: surfaceState.height,
      mode: surfaceState.mode,
      density: surfaceState.density,
    }),
  }
})

vi.mock("@/store/workspaceStore", () => {
  const state = {
    theme: "wuling",
    themeSelections: { light: { kind: "preset", name: "wuling" }, dark: { kind: "preset", name: "wuling" } },
    customThemes: [],
    fontPreset: "default",
    vignetteDepth: 20,
    grainIntensity: 10,
    actionGlow: true,
    cardElevation: true,
    bgMode: "grid",
    bgImageUrl: "",
    bgOpacity: 100,
    bgBlur: 0,
    bgCoverTopBar: false,
    grainEnabled: true,
    chromeVisible: true,
    chromePosition: "right",
    chromeStyle: "default",
    chromeIslandScale: 100,
    chromeIslandMotion: 100,
    chromeIslandDelay: 0,
    chromeIslandIdleOffset: 0,
    alphabetIndexVisible: true,
    alphabetIndexOpacity: 80,
    alphabetIndexStyle: "glass",
    alphabetIndexWaveIntensity: 40,
    cardClickAction: "focus",
    cardDoubleClickAction: "fullscreen",
    tabDisplayStyle: "underline",
    switchDisplayStyle: "outlined",
    scrollbarDisplayStyle: "soft",
    sliderDisplayStyle: "solid",
    choiceControlStyle: "segmented",
    fieldTitleStyle: "stacked",
    moduleTitleStyle: "legend",
    modulePanelStyle: "soft",
    resizableHandleStyle: "grip",
    // 高级主题（设计语言）是持久化偏好的一部分；这份桩从契约取默认值，
    // 不手抄形状——手抄的那份加字段时一定会漏（这次就是）。
    designTheme: DEFAULT_DESIGN_THEME,
    activeWorkspaceId: "ws-1",
    laneWorkspacePreferences: {},
  }
  return {
    useWorkspaceShallowSelector: (select: (s: typeof state) => unknown) => select(state),
    useWorkspaceActions: () => new Proxy({}, { get: () => vi.fn() }),
  }
})

vi.mock("@/components/use-theme", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}))

vi.mock("@/hooks/useLocalBackendStatus", () => ({
  useLocalBackendStatus: () => ({
    data: { status: "ready" },
    isFetching: false,
    refetch: vi.fn(),
  }),
}))

vi.mock("@/backend/runtimeConnectionInfo", () => ({
  getRuntimeConnectionInfo: () => ({
    hostRuntime: "test",
    frontendSource: "vite-dev",
    frontendOrigin: "http://127.0.0.1:5173",
    frontendDevUrl: "http://127.0.0.1:5173",
    backendUrl: "http://127.0.0.1:41000",
    backendTokenConfigured: true,
    devAttachCommand: "bun run dev:desktop:attach",
    devStartCommand: "bun run dev:desktop",
  }),
}))

vi.mock("@/backend/localBackendControl", () => ({
  getNodeSourceHotReload: vi.fn(async () => ({ supported: true, enabled: false })),
  setNodeSourceHotReload: vi.fn(async (enabled: boolean) => ({ supported: true, enabled })),
  getNodeMemoryProtection: vi.fn(async () => ({
    supported: true,
    settings: {
      defaultPolicy: { maxRssGrowthMiB: 8192, maxHeapGrowthMiB: 4096, maxRetainedEvents: 1000, sampleIntervalMs: 250 },
      nodePolicies: {},
    },
  })),
  setNodeMemoryProtection: vi.fn(async (settings: NodeMemoryProtectionSettingsDTO) => ({ supported: true, settings })),
  restartLocalBackend: vi.fn(async () => ({ restarted: true, supported: true, source: "test", message: "ok" })),
}))

vi.mock("@/components/views/Webview2ExperimentsPanel", () => ({
  Webview2ExperimentsPanel: () => <div data-testid="webview2-panel">WebView2</div>,
}))

vi.mock("@/components/workspace/swimlane/SwimlaneInteractionSettings", () => ({
  SwimlaneInteractionSettings: () => <div data-testid="swimlane-settings">Swimlane</div>,
}))

import { ThemeSettings } from "./ThemeSettings"
import { parseSettingsSectionId } from "./settingsNavigation"

function setSurface(mode: NodeSurfaceMode) {
  const spec = NODE_SURFACE_TEST_SPECS[mode]
  surfaceState.width = spec.width
  surfaceState.height = spec.height
  surfaceState.mode = mode
  surfaceState.density = spec.density
}

describe("resolveSettingsChrome", () => {
  it("[settings.surface.modes] maps node surface modes to nav chrome", () => {
    expect(resolveSettingsChrome("collapsed", 90).navVariant).toBe("select")
    expect(resolveSettingsChrome("compact", 200).navVariant).toBe("chips")
    expect(resolveSettingsChrome("portrait", 450).navVariant).toBe("chips")
    expect(resolveSettingsChrome("regular", 400).expandAll).toBe(false)
    expect(resolveSettingsChrome("regular", 560).expandAll).toBe(true)
    expect(resolveSettingsChrome("expanded", 600).expandAll).toBe(true)
    expect(resolveSettingsChrome("workspace", 700).navVariant).toBe("rail")
  })
})

describe("ThemeSettings shell", () => {
  beforeEach(() => {
    settingsQuery.value = null
    settingsQuery.set.mockClear()
    setSurface("expanded")
  })

  afterEach(() => {
    cleanup()
  })

  it("[settings.shell.smoke] expanded surface uses rail with all sub-steps", () => {
    render(<ThemeSettings />)

    expect(document.querySelector("[data-settings-surface]")?.getAttribute("data-settings-mode")).toBe("expanded")
    expect(document.querySelector("[data-settings-stage-nav]")?.getAttribute("data-settings-nav-variant")).toBe("rail")
    expect(document.querySelector("[data-settings-stage-nav]")?.getAttribute("data-settings-nav-expand")).toBe("all")
    expect(document.querySelector("[data-settings-search]")).toBeTruthy()
    expect(document.querySelector('[data-settings-active-section="appearance"]')).toBeTruthy()
    // Content still single-stage only.
    expect(document.querySelector('[data-timeline-entry="workspace"]')).toBeNull()
    expect(document.querySelector('[data-settings-nav-steps="workspace"]')).toBeTruthy()
    expect(screen.getByText("设置")).toBeTruthy()
  })

  it("[settings.surface.compact] compact surface uses chip nav and single-stage content", () => {
    setSurface("compact")
    render(<ThemeSettings />)

    expect(document.querySelector("[data-settings-surface]")?.getAttribute("data-settings-mode")).toBe("compact")
    expect(document.querySelector("[data-settings-stage-nav]")?.getAttribute("data-settings-nav-variant")).toBe("chips")
    expect(document.querySelector('[data-settings-nav-stage="workspace"]')).toBeTruthy()
    expect(document.querySelector('[data-settings-step="theme"]')).toBeTruthy()
    expect(document.querySelector('[data-settings-step="chrome"]')).toBeNull()
  })

  it("[settings.surface.collapsed] collapsed surface uses select nav", () => {
    setSurface("collapsed")
    render(<ThemeSettings />)

    expect(document.querySelector("[data-settings-stage-nav]")?.getAttribute("data-settings-nav-variant")).toBe("select")
    expect(document.querySelector("[data-settings-search]")).toBeNull()
  })

  it("[settings.nav.quick-switch] stage nav switches mounted section without multi-stage tree", () => {
    render(<ThemeSettings />)

    fireEvent.click(document.querySelector('[data-settings-nav-stage="workspace"]')!)

    expect(document.querySelector('[data-settings-active-section="workspace"]')).toBeTruthy()
    expect(document.querySelector('[data-settings-step="chrome"]')).toBeTruthy()
    expect(document.querySelector('[data-settings-step="theme"]')).toBeNull()
    expect(settingsQuery.set).toHaveBeenCalledWith("workspace")
  })

  it("[settings.nav.substeps] step nav scrolls to data-settings-step", async () => {
    render(<ThemeSettings />)

    fireEvent.click(document.querySelector('[data-settings-nav-stage="workspace"]')!)

    const chrome = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-settings-step="chrome"]')
      expect(el).toBeTruthy()
      return el!
    })
    const scrollSpy = vi.spyOn(chrome, "scrollIntoView")

    const stepButtons = document.querySelectorAll('[data-settings-nav-step="chrome"]')
    expect(stepButtons.length).toBeGreaterThan(0)
    fireEvent.click(stepButtons[0]!)

    expect(scrollSpy).toHaveBeenCalled()
    expect(scrollSpy.mock.calls[0]?.[0]).toMatchObject({ block: "start" })
  })

  it("[settings.search.scroll] search switches stage then scrolls to step", async () => {
    render(<ThemeSettings />)

    const input = screen.getByLabelText(/搜索设置/)
    fireEvent.change(input, { target: { value: "操作栏" } })
    fireEvent.click(await screen.findByRole("option", { name: /操作栏/ }))

    await waitFor(() => {
      expect(document.querySelector('[data-settings-active-section="workspace"]')).toBeTruthy()
      expect(document.querySelector('[data-settings-step="chrome"]')).toBeTruthy()
    })
  })

  it("[settings.deeplink.section] ?settings=workspace mounts workspace stage only", async () => {
    settingsQuery.value = "workspace"
    expect(parseSettingsSectionId(settingsQuery.value)).toBe("workspace")

    render(<ThemeSettings />)

    await waitFor(() => {
      expect(document.querySelector('[data-settings-active-section="workspace"]')).toBeTruthy()
    })
    expect(document.querySelector('[data-timeline-entry="workspace"]')).toBeTruthy()
    expect(document.querySelector('[data-settings-step="chrome"]')).toBeTruthy()
    expect(document.querySelector('[data-settings-step="theme"]')).toBeNull()
  })
})
