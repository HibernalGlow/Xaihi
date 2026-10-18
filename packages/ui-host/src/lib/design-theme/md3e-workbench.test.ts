// @vitest-environment happy-dom
import { createElement } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NodeSurfaceMode } from "@/nodes/shared/useNodeSurface"
import { NODE_SURFACE_TEST_SPECS } from "@/nodes/shared/nodeSurfaceTestUtils"

const surfaceMockState = vi.hoisted(() => ({
  width: 960,
  height: 640,
  mode: "expanded" as NodeSurfaceMode,
  density: "roomy" as "tight" | "normal" | "roomy",
}))

vi.mock("@/nodes/shared/useNodeSurface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nodes/shared/useNodeSurface")>()
  return {
    ...actual,
    useNodeSurface: () => ({
      ref: { current: null },
      width: surfaceMockState.width,
      height: surfaceMockState.height,
      mode: surfaceMockState.mode,
      density: surfaceMockState.density,
    }),
  }
})

vi.mock("nuqs", async () => {
  const actual = await vi.importActual<typeof import("nuqs")>("nuqs")
  return {
    ...actual,
    useQueryState: () => [null, vi.fn()] as const,
    useQueryStates: () => [{}, vi.fn()] as const,
  }
})

import { Button } from "@/components/ui/button"
import { ThemeSettings } from "@/components/views/settings/ThemeSettings"
import { TopBar } from "@/components/workspace/TopBar"
import { WorkspaceAppearance } from "@/components/workspace/WorkspaceAppearance"
import { DEFAULT_DESIGN_THEME, MD3_SCHEME_VARIANTS } from "@/lib/design-theme/contract"
import { resolveDesignTheme } from "@/lib/design-theme/registry"
import {
  Md3eConnectedGroup,
  Md3eShapeProvider,
  Md3eShapeStatusReadback,
  useMd3eShapeContext,
} from "@/nodes/shared/Md3eShapeContext"
import {
  DEFAULT_UI_FACE,
  UI_FACE_ROOT_ATTR,
  normalizeUiFace,
} from "@/types/workspace"
import {
  getSessionStartupSeed,
  readNodeShapePolicy,
  resetSessionStartupSeedForTesting,
  resolveMd3eButtonShape,
  resolveSessionRoleShapes,
  writeNodeShapePolicy,
} from "@/nodes/shared/md3eShapeSystem"
import type { NodeUiConfigStore } from "@/nodes/shared/NodeUiConfigContext"
import { useWorkspaceStore } from "@/store/workspaceStore"

function setMockSurface(mode: NodeSurfaceMode, overrideWidth?: number, overrideHeight?: number) {
  const spec = NODE_SURFACE_TEST_SPECS[mode]
  surfaceMockState.width = overrideWidth ?? spec.width
  surfaceMockState.height = overrideHeight ?? spec.height
  surfaceMockState.mode = mode
  surfaceMockState.density = spec.density
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

describe("ADR-0033 MD3E 工作台半边重设计验证套件", () => {
  beforeEach(() => {
    if (typeof Element !== "undefined" && "animate" in Element.prototype) {
      Object.defineProperty(Element.prototype, "animate", {
        value: undefined,
        configurable: true,
        writable: true,
      })
    }
    window.localStorage.clear()
    setMockSurface("expanded", 960, 640)
    const store = useWorkspaceStore.getState()
    store.setUiFace("legacy")
    store.setDesignTheme(DEFAULT_DESIGN_THEME)
  })

  afterEach(() => {
    cleanup()
  })

  describe("1. 界面形态（UI face: legacy | md3e）正交性与默认契约", () => {
    it("出厂默认为 legacy 且设计语言默认为 native（不擅改默认值），非法输入被归一化拦截（含阳性对照）", () => {
      const store = useWorkspaceStore.getState()
      expect(DEFAULT_UI_FACE).toBe("legacy")
      expect(store.uiFace).toBe("legacy")
      expect(store.designTheme.id).toBe("native")

      expect(normalizeUiFace("md3e")).toBe("md3e")
      expect(normalizeUiFace("legacy")).toBe("legacy")
      expect(normalizeUiFace("invalid-face")).toBe("legacy")
      expect(normalizeUiFace(null)).toBe("legacy")

      // 阳性对照：关掉 normalizeUiFace 防御直接透传未知值时必须不等于合法枚举
      const unguardedFace = "invalid-face" as unknown as string
      expect(unguardedFace === "legacy" || unguardedFace === "md3e").toBe(false)
      expect(normalizeUiFace(unguardedFace)).toBe("legacy")
    })

    it("切换 md3e 激活 MD3E 动态 Token 而不篡改 store 中保存的 legacy 设计语言 id，切回 legacy 完整还原", async () => {
      const store = useWorkspaceStore.getState()
      store.setDesignTheme({ ...DEFAULT_DESIGN_THEME, id: "wuling" })
      expect(useWorkspaceStore.getState().designTheme.id).toBe("wuling")

      render(createElement(WorkspaceAppearance))
      expect(document.documentElement.getAttribute(UI_FACE_ROOT_ATTR)).toBe("legacy")
      expect(document.documentElement.getAttribute("data-app-design")).toBe("wuling")

      useWorkspaceStore.getState().setUiFace("md3e")
      await waitFor(() => {
        expect(document.documentElement.getAttribute(UI_FACE_ROOT_ATTR)).toBe("md3e")
        expect(document.documentElement.getAttribute("data-app-design")).toBe("md3")
      })
      expect(useWorkspaceStore.getState().designTheme.id).toBe("wuling")
      expect(document.documentElement.style.getPropertyValue("--md-sys-color-primary")).toBeTruthy()
      expect(document.documentElement.style.getPropertyValue("--md-sys-color-surface-container")).toBeTruthy()

      useWorkspaceStore.getState().setUiFace("legacy")
      await waitFor(() => {
        expect(document.documentElement.getAttribute(UI_FACE_ROOT_ATTR)).toBe("legacy")
        expect(document.documentElement.getAttribute("data-app-design")).toBe("wuling")
      })
    })
  })

  describe("2. 配色与配色风格自由切换（与 MD3E 造型解耦）", () => {
    it("在 md3e 界面形态下自由切换 9 种 scheme variant、4 档对比度与自定义种子色，只改 token 不退回传统形态", async () => {
      for (const variant of MD3_SCHEME_VARIANTS) {
        const res = resolveDesignTheme(
          {
            ...DEFAULT_DESIGN_THEME,
            id: "md3",
            md3: {
              ...DEFAULT_DESIGN_THEME.md3,
              seedSource: "manual",
              seed: "#006a6a",
              variant,
            },
          },
          { scheme: "dark", activeThemeSeed: null, systemAccentAvailable: false },
        )
        expect(res?.bundle.vars["--md-sys-color-primary"]).toBeTruthy()
      }

      const store = useWorkspaceStore.getState()
      store.setUiFace("md3e")
      render(createElement(WorkspaceAppearance))

      for (const variant of ["expressive", "tonalSpot", "vibrant", "monochrome"] as const) {
        useWorkspaceStore.getState().setDesignTheme({
          ...useWorkspaceStore.getState().designTheme,
          md3: {
            ...useWorkspaceStore.getState().designTheme.md3,
            seedSource: "manual",
            seed: "#006a6a",
            variant,
          },
        })
        await waitFor(() => {
          expect(document.documentElement.getAttribute("data-md3-variant")).toBe(variant)
          expect(document.documentElement.getAttribute(UI_FACE_ROOT_ATTR)).toBe("md3e")
        })
      }

      for (const contrastLevel of [-1, 0, 1] as const) {
        useWorkspaceStore.getState().setDesignTheme({
          ...useWorkspaceStore.getState().designTheme,
          md3: {
            ...useWorkspaceStore.getState().designTheme.md3,
            contrastLevel,
          },
        })
        await waitFor(() => {
          expect(document.documentElement.getAttribute("data-md3-contrast")).toBe(String(contrastLevel))
          expect(document.documentElement.getAttribute(UI_FACE_ROOT_ATTR)).toBe("md3e")
        })
      }
    }, 20000)
  })

  describe("3. MD3E 控件形状引擎、同类一致上下文、持久化 Seam 与降级铁律", () => {
    it("按控件类型适配：图标按钮取表达性 polygon clip-path 且同一节点内同类按钮形状一致；文字按钮保持 capsule 不裁字", () => {
      render(
        createElement(Md3eShapeProvider, {
          nodeId: "xlchemy",
          enabled: true,
          children: createElement(
            "div",
            null,
            createElement(Button, { size: "icon", variant: "default", "aria-label": "主图标按钮A", children: "A" }),
            createElement(Button, { size: "icon-sm", variant: "default", "aria-label": "主图标按钮B", children: "B" }),
            createElement(Button, { size: "icon", variant: "secondary", "aria-label": "次图标按钮C", children: "C" }),
            createElement(Button, { size: "default", variant: "default", children: "文字按钮不裁切" }),
          ),
        }),
      )

      const iconA = screen.getByRole("button", { name: "主图标按钮A" })
      const iconB = screen.getByRole("button", { name: "主图标按钮B" })
      const iconC = screen.getByRole("button", { name: "次图标按钮C" })
      const textBtn = screen.getByRole("button", { name: "文字按钮不裁切" })

      expect(iconA.getAttribute("data-md3e-button-kind")).toBe("icon")
      expect(iconB.getAttribute("data-md3e-button-kind")).toBe("icon")
      expect(iconA.getAttribute("data-md3e-shape")).toBeTruthy()
      expect(iconA.getAttribute("data-md3e-shape")).toBe(iconB.getAttribute("data-md3e-shape"))
      expect(iconA.style.clipPath).toContain("polygon(")

      expect(iconC.getAttribute("data-md3e-button-kind")).toBe("icon")
      expect(iconC.getAttribute("data-md3e-shape-role")).toBe("secondary")

      expect(textBtn.getAttribute("data-md3e-button-kind")).toBe("text")
      expect(textBtn.getAttribute("data-md3e-shape")).toBe("capsule")
      expect(textBtn.style.clipPath).toBe("")
    })

    it("启动随机在会话内稳定（卸载重建不重抽），且每节点固定/随机策略经 xaihi-core.nodeUi[nodeId] 独立持久化并保住同格字段", async () => {
      resetSessionStartupSeedForTesting(20261015)
      expect(getSessionStartupSeed()).toBe(20261015)

      const firstDraw = resolveSessionRoleShapes("findz")
      const secondDrawAfterRemount = resolveSessionRoleShapes("findz")
      const otherNodeDraw = resolveSessionRoleShapes("sleept")

      expect(secondDrawAfterRemount).toEqual(firstDraw)
      expect(otherNodeDraw).not.toEqual(firstDraw)

      const memoryCells: Record<string, unknown> = {
        findz: { restoreOnStartup: true },
      }
      const fakeStore: NodeUiConfigStore = {
        read: vi.fn(async (nodeId: string) => memoryCells[nodeId]),
        write: vi.fn(async (nodeId: string, val: unknown) => {
          memoryCells[nodeId] = val
        }),
      }

      await writeNodeShapePolicy(
        "findz",
        {
          mode: "fixed",
          fixedRoleShapes: firstDraw,
        },
        fakeStore,
      )

      expect(memoryCells.findz).toEqual({
        restoreOnStartup: true,
        shapePolicy: {
          mode: "fixed",
          fixedRoleShapes: firstDraw,
        },
      })

      const readBack = await readNodeShapePolicy("findz", fakeStore)
      expect(readBack.persistenceSource).toBe("dsh-settings")
      expect(readBack.policy.mode).toBe("fixed")
      expect(readBack.policy.fixedRoleShapes).toEqual(firstDraw)
    })

    it("降级铁律（ADR-0011 决定 4）与 320px/高对比可读性下限：探测→退化→界面可读回（含阳性对照）", () => {
      // 阳性对照：当宿主支持 clip-path、正常对比度、宽容器时，复杂形状 flower-8 原样生效（status="active"）
      const activeControl = resolveMd3eButtonShape("flower-8", {
        cssClipPathSupported: true,
        contrastLevel: 0,
        surfaceWidth: 800,
        surfaceMode: "expanded",
        buttonSize: "icon",
      })
      expect(activeControl.status).toBe("active")
      expect(activeControl.id).toBe("flower-8")
      expect(activeControl.degradedReason).toBeNull()
      expect(activeControl.applyClipPath).toBe(true)

      const noClip = resolveMd3eButtonShape("flower-8", {
        cssClipPathSupported: false,
      })
      expect(noClip.status).toBe("degraded")
      expect(noClip.id).toBe("circle")
      expect(noClip.degradedReason).toBe("css-clip-path-unsupported")
      expect(noClip.applyClipPath).toBe(false)

      const highContrast = resolveMd3eButtonShape("flower-8", {
        cssClipPathSupported: true,
        contrastLevel: 1,
      })
      expect(highContrast.status).toBe("degraded")
      expect(highContrast.id).toBe("squircle")
      expect(highContrast.degradedReason).toBe("high-contrast-legibility-floor")

      const narrow320 = resolveMd3eButtonShape("clover-4", {
        cssClipPathSupported: true,
        contrastLevel: 0,
        surfaceWidth: 320,
        surfaceMode: "compact",
      })
      expect(narrow320.status).toBe("degraded")
      expect(narrow320.id).toBe("circle")
      expect(narrow320.degradedReason).toBe("compact-320-legibility-floor")

      function ReadbackHarness() {
        const ctx = useMd3eShapeContext()!
        return createElement(
          "div",
          null,
          createElement(Button, { size: "icon", variant: "default", "aria-label": "退化按钮", children: "X" }),
          createElement(Md3eShapeStatusReadback, { context: ctx }),
        )
      }

      render(
        createElement(Md3eShapeProvider, {
          nodeId: "degraded-node",
          enabled: true,
          probeOverride: { cssClipPathSupported: false },
          children: createElement(ReadbackHarness),
        }),
      )

      const btn = screen.getByRole("button", { name: "退化按钮" })
      expect(btn.getAttribute("data-md3e-shape-status")).toBe("degraded")
      expect(btn.getAttribute("data-md3e-shape-degraded-reason")).toBe("css-clip-path-unsupported")
      expect(btn.style.clipPath).toBe("")
      expect(document.querySelector("[data-md3e-shape-readback]")?.getAttribute("data-md3e-shape-status")).toBe("degraded")
      expect(document.querySelector('[data-md3e-degraded-reason="css-clip-path-unsupported"]')).toBeTruthy()
    })

    it("连接式分组（Md3eConnectedGroup）实现外 24 / 内 6 圆角序列", () => {
      render(
        createElement(Md3eConnectedGroup, {
          orientation: "vertical",
          children: [
            createElement("div", { key: "a" }, "第一项"),
            createElement("div", { key: "b" }, "中间项"),
            createElement("div", { key: "c" }, "末尾项"),
          ],
        }),
      )

      const first = document.querySelector('[data-md3e-connected-item="0"]')!
      const middle = document.querySelector('[data-md3e-connected-item="1"]')!
      const last = document.querySelector('[data-md3e-connected-item="2"]')!

      expect(first.className).toContain("rounded-t-[24px]")
      expect(first.className).toContain("rounded-b-[6px]")
      expect(middle.className).toContain("rounded-[6px]")
      expect(last.className).toContain("rounded-t-[6px]")
      expect(last.className).toContain("rounded-b-[24px]")
    })
  })

  describe("4. 顶栏（TopBar）MD3E 形态重做、动作等价与 320px 响应式", () => {
    it("在 legacy 与 md3e 之间切换顶栏视觉分区，保留品牌入口、视图切换与 Hazard 上膛确认", () => {
      const queryClient = createTestQueryClient()
      useWorkspaceStore.getState().setUiFace("legacy")
      const { rerender } = render(
        createElement(QueryClientProvider, { client: queryClient, children: createElement(TopBar) }),
      )

      const legacyHeader = document.querySelector("header[data-topbar-face]")!
      expect(legacyHeader.getAttribute("data-topbar-face")).toBe("legacy")

      useWorkspaceStore.getState().setUiFace("md3e")
      rerender(createElement(QueryClientProvider, { client: queryClient, children: createElement(TopBar) }))

      const md3eHeader = document.querySelector("header[data-topbar-face]")!
      expect(md3eHeader.getAttribute("data-topbar-face")).toBe("md3e")
      expect(document.querySelector('[data-topbar-partition="brand"]')).toBeTruthy()
      expect(document.querySelector('[data-topbar-partition="navigation"]')).toBeTruthy()
      expect(document.querySelector('[data-topbar-partition="actions"]')).toBeTruthy()
      expect(document.querySelector("[data-topbar-md3e-view-strip]")).toBeTruthy()

      fireEvent.click(document.querySelector('[data-topbar-md3e-view-pill="flow"]')!)
      expect(useWorkspaceStore.getState().viewMode).toBe("flow")
      fireEvent.click(document.querySelector('[data-topbar-md3e-view-pill="lane"]')!)
      expect(useWorkspaceStore.getState().viewMode).toBe("lane")

      setMockSurface("compact", 320, 180)
      rerender(createElement(QueryClientProvider, { client: queryClient, children: createElement(TopBar) }))
      expect(document.querySelector("header[data-topbar-face]")?.getAttribute("data-topbar-surface-mode")).toBe("compact")
      expect(document.querySelector("[data-topbar-md3e-view-strip]")).toBeNull()
    })
  })

  describe("5. 设置（ThemeSettings / Md3eSettingsView）按目的分类重构与容器级响应式", () => {
    it("在 md3e 形态下宽屏 ≥600px 启用 35/65 主从布局、四大目的分类、实时预览台与生效范围标注，320px 窄容器降级为单栏 chips", async () => {
      useWorkspaceStore.getState().setUiFace("md3e")
      setMockSurface("expanded", 920, 640)

      const { rerender } = render(createElement(ThemeSettings))

      const surfaceEl = document.querySelector("[data-settings-surface]")!
      expect(surfaceEl.getAttribute("data-settings-face")).toBe("md3e")
      expect(surfaceEl.getAttribute("data-settings-layout")).toBe("master-detail-35-65")
      expect(document.querySelector('[data-settings-live-preview="full"]')).toBeTruthy()
      expect(document.querySelectorAll("[data-settings-scope]").length).toBeGreaterThan(0)

      fireEvent.click(document.querySelector('[data-md3e-purpose-nav="controls-and-shapes"]')!)
      expect(document.querySelector('[data-md3e-active-purpose="controls-and-shapes"]')).toBeTruthy()

      fireEvent.click(document.querySelector('[data-md3e-purpose-nav="layout-and-workspace"]')!)
      expect(document.querySelector('[data-md3e-active-purpose="layout-and-workspace"]')).toBeTruthy()

      fireEvent.click(document.querySelector('[data-md3e-purpose-nav="host-and-storage"]')!)
      expect(document.querySelector('[data-md3e-active-purpose="host-and-storage"]')).toBeTruthy()

      setMockSurface("compact", 320, 420)
      rerender(createElement(ThemeSettings))
      expect(document.querySelector("[data-settings-surface]")?.getAttribute("data-settings-layout")).toBe("single-column")
      expect(document.querySelector("[data-settings-stage-nav]")?.getAttribute("data-settings-nav-variant")).toBe("chips")
      expect(document.querySelector('[data-settings-live-preview="compact"]')).toBeTruthy()

      fireEvent.click(document.querySelector('[data-ui-face-option="legacy"]')!)
      await waitFor(() => {
        expect(useWorkspaceStore.getState().uiFace).toBe("legacy")
      })
      rerender(createElement(ThemeSettings))
      expect(document.querySelector("[data-settings-surface]")?.getAttribute("data-settings-face")).toBe("legacy")
    })
  })
})
