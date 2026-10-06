// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import type { DesignThemeConfig, DesignThemeContext } from "./contract"
import { DEFAULT_DESIGN_THEME } from "./contract"
import { applyDesignTheme, clearDesignTheme, getDesignThemeReadback } from "./apply"

// apply.ts 只管「撤干净 + 写下去 + 留证据」这三件事，引擎那侧发什么变量由 mock 决定，
// 否则这条测试会被 md3 引擎的每次改动牵着红。
const resolveDesignTheme = vi.hoisted(() => vi.fn())
vi.mock("./registry", () => ({ resolveDesignTheme }))

const context: DesignThemeContext = { scheme: "light", activeThemeSeed: null, systemAccentAvailable: true }

function configWith(overrides: Partial<DesignThemeConfig["md3"]> = {}): DesignThemeConfig {
  return { ...DEFAULT_DESIGN_THEME, id: "md3", md3: { ...DEFAULT_DESIGN_THEME.md3, ...overrides } }
}

function emit(...vars: [string, string][]): { bundle: { vars: Record<string, string>; attributes: Record<string, string> }; seed: string; seedSource: string; seedFallback: boolean } {
  return {
    bundle: { vars: Object.fromEntries(vars), attributes: {} },
    seed: "#6750a4",
    seedSource: "manual",
    seedFallback: false,
  }
}

beforeEach(() => {
  resolveDesignTheme.mockReset()
})

afterEach(() => {
  clearDesignTheme()
  document.documentElement.removeAttribute("style")
})

describe("design theme application", () => {
  test("native writes no variables but still writes its own evidence", () => {
    resolveDesignTheme.mockReturnValue(null)
    applyDesignTheme({ ...DEFAULT_DESIGN_THEME }, context)
    const root = document.documentElement
    expect(root.getAttribute("data-app-design")).toBe("native")
    expect(root.getAttribute("data-design-applied-vars")).toBe("0")
    expect(root.style.length).toBe(0)
    // native 下不该留下 md3 的诊断属性，否则读出来的是上一个主题的残影。
    expect(root.hasAttribute("data-md3-seed")).toBe(false)
    expect(root.hasAttribute("data-md3-variant")).toBe(false)
  })

  test("re-applying replaces the previous key set instead of leaving stale tokens behind", () => {
    resolveDesignTheme.mockReturnValue(emit(["--md-sys-shape-corner-medium", "12px"], ["--md-comp-gone-token", "1px"]))
    applyDesignTheme(configWith(), context)
    expect(document.documentElement.style.getPropertyValue("--md-comp-gone-token")).toBe("1px")

    resolveDesignTheme.mockReturnValue(emit(["--md-sys-shape-corner-medium", "16px"]))
    applyDesignTheme(configWith({ shapeScale: 1.25 }), context)
    expect(document.documentElement.style.getPropertyValue("--md-comp-gone-token")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--md-sys-shape-corner-medium")).toBe("16px")
  })

  test("the color theme is asked back only when a bridged color var was actually withdrawn", () => {
    const restore = vi.fn()
    resolveDesignTheme.mockReturnValue(emit(["--primary", "#111111"], ["--background", "#222222"]))
    applyDesignTheme(configWith(), context, restore)
    expect(restore).not.toHaveBeenCalled()

    // 第二次：引擎不再发桥接色（等价于 color 维度被关掉）→ 上一轮盖住的那份必须重写回来。
    resolveDesignTheme.mockReturnValue(emit(["--md-sys-shape-corner-medium", "12px"]))
    applyDesignTheme(configWith(), context, restore)
    expect(restore).toHaveBeenCalledTimes(1)

    // 纯几何重应用不该顺手再刷一次 localStorage 镜像。
    resolveDesignTheme.mockReturnValue(emit(["--md-sys-shape-corner-medium", "16px"]))
    applyDesignTheme(configWith({ shapeScale: 1.5 }), context, restore)
    expect(restore).toHaveBeenCalledTimes(1)
  })

  test("clearing removes exactly what we wrote and nothing else", () => {
    document.documentElement.style.setProperty("--from-color-theme", "oklch(0.5 0.1 120)")
    resolveDesignTheme.mockReturnValue(emit(["--primary", "#333333"]))
    applyDesignTheme(configWith(), context)
    clearDesignTheme()
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--from-color-theme")).toBe("oklch(0.5 0.1 120)")
    expect(document.documentElement.hasAttribute("data-app-design")).toBe(false)
    expect(document.documentElement.hasAttribute("data-design-applied-vars")).toBe(false)
  })

  test("a recipe's own diagnostic attributes are cleared too, not just the listed ones", () => {
    // resolve.ts 这类解析器会通过 bundle.attributes 自带诊断属性（data-md3-token-dictionary…）。
    // 清理必须按前缀整批摘，点名清单会漏掉写清单的人当时不知道的那些。
    resolveDesignTheme.mockReturnValue({
      ...emit(["--md-sys-shape-corner-medium", "12px"]),
      bundle: {
        vars: { "--md-sys-shape-corner-medium": "12px" },
        attributes: { "data-md3-token-dictionary": "v0.192", "data-md3-color-roles": "61" },
      },
    })
    applyDesignTheme(configWith(), context)
    expect(document.documentElement.getAttribute("data-md3-token-dictionary")).toBe("v0.192")

    resolveDesignTheme.mockReturnValue(null)
    applyDesignTheme({ ...DEFAULT_DESIGN_THEME }, context)
    expect(document.documentElement.hasAttribute("data-md3-token-dictionary")).toBe(false)
    expect(document.documentElement.hasAttribute("data-md3-color-roles")).toBe(false)

    // clearDesignTheme 走同一条前缀规则（卸载路径）。
    resolveDesignTheme.mockReturnValue({
      bundle: { vars: {}, attributes: { "data-md3-elevation-shadow": "on" } },
      seed: "#6750a4",
      seedSource: "manual",
      seedFallback: false,
    })
    applyDesignTheme(configWith(), context)
    clearDesignTheme()
    expect(document.documentElement.hasAttribute("data-md3-elevation-shadow")).toBe(false)
  })

  test("every re-apply bumps the revision so a reader can tell the DOM actually changed", () => {
    resolveDesignTheme.mockReturnValue(emit(["--md-sys-state-hover-opacity", "0.08"]))
    applyDesignTheme(configWith(), context)
    const first = getDesignThemeReadback()
    applyDesignTheme(configWith(), context)
    const second = getDesignThemeReadback()
    expect(second.rev).toBe(first.rev + 1)
    expect(document.documentElement.getAttribute("data-design-rev")).toBe(String(second.rev))
    expect(second.appliedVars).toBe(1)
    expect(second.id).toBe("md3")
  })
})
