// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { INITIAL_STATE } from "@/store/workspace/constants"
import { DEFAULT_DESIGN_THEME } from "@/lib/design-theme/contract"
import { WULING_PRESET_COLORS } from "@/lib/design-theme/wuling/spec"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { WorkspaceAppearance } from "./WorkspaceAppearance"

const themeState = vi.hoisted(() => ({ theme: "light" as "light" | "dark" | "system", forcedTheme: undefined as string | undefined }))
vi.mock("@/components/use-theme", () => ({ useTheme: () => themeState }))

afterEach(() => {
  cleanup()
  themeState.theme = "light"
  themeState.forcedTheme = undefined
  useWorkspaceStore.getState().setCustomThemes([])
  useWorkspaceStore.getState().setTheme("wuling")
  useWorkspaceStore.getState().setDesignTheme(DEFAULT_DESIGN_THEME)
  document.documentElement.removeAttribute("style")
  document.documentElement.removeAttribute("data-custom-theme")
})

describe("workspace appearance mode assignments", () => {
  test("applies the shared scrollbar display preference on the document root", async () => {
    useWorkspaceStore.getState().setScrollbarDisplayStyle("rounded")
    render(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.dataset.scrollbarStyle).toBe("rounded"))
  })

  test("applies the shared slider display preference on the document root", async () => {
    useWorkspaceStore.getState().setSliderDisplayStyle("pill")
    render(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.dataset.sliderStyle).toBe("pill"))
  })

  test("uses the product forced mode for shared custom color tokens without changing the global mode", async () => {
    const actions = useWorkspaceStore.getState()
    const previousDark = actions.themeSelections.dark
    actions.setCustomThemes([{ name: "Product dark", cssVars: { dark: { primary: "oklch(0.72 0.12 250)" } } }])
    actions.setThemeSelection("dark", { kind: "custom", name: "Product dark" })
    themeState.theme = "light"
    themeState.forcedTheme = "dark"
    render(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.dataset.customThemeName).toBe("Product dark"))
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("oklch(0.72 0.12 250)")
    expect(themeState.theme).toBe("light")
    actions.setThemeSelection("dark", previousDark)
  })

  test("applies a tweakcn theme natively and uses only its primary as an advanced seed", async () => {
    const actions = useWorkspaceStore.getState()
    actions.setCustomThemes([{
      name: "tweakcn jade",
      cssVars: {
        theme: { radius: "1.75rem", "font-sans": "Imported Font" },
        light: { primary: "#28bf9d", background: "#1122ee", foreground: "#eeeeff" },
        dark: { primary: "#f6540e", background: "#0011aa", foreground: "#ffffff" },
      },
    }])
    actions.setThemeSelection("light", { kind: "custom", name: "tweakcn jade" })
    actions.setThemeSelection("dark", { kind: "custom", name: "tweakcn jade" })

    const view = render(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--background")).toBe("#1122ee"))
    expect(document.documentElement.style.getPropertyValue("--radius")).toBe("1.75rem")
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe("Imported Font")

    actions.setDesignTheme({ ...DEFAULT_DESIGN_THEME, id: "wuling" })
    await waitFor(() => expect(document.documentElement.dataset.wulingSeed).toBe("#28bf9d"))
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(WULING_PRESET_COLORS.light["--background"])
    expect(document.documentElement.style.getPropertyValue("--radius")).not.toBe("1.75rem")
    expect(document.documentElement.style.getPropertyValue("--font-sans")).not.toBe("Imported Font")

    themeState.theme = "dark"
    view.rerender(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.dataset.wulingSeed).toBe("#f6540e"))
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(WULING_PRESET_COLORS.dark["--background"])

    actions.setDesignTheme(DEFAULT_DESIGN_THEME)
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--background")).toBe("#0011aa"))
    expect(document.documentElement.style.getPropertyValue("--radius")).toBe("1.75rem")
  })

  test("none selects the advanced theme default palette and native baseline", async () => {
    const actions = useWorkspaceStore.getState()
    actions.setCustomThemes([{
      name: "blue source",
      cssVars: { light: { primary: "#1133ee", background: "#0011aa" } },
    }])
    actions.setThemeSelection("light", { kind: "custom", name: "blue source" })
    actions.setDesignTheme({ ...DEFAULT_DESIGN_THEME, id: "wuling" })

    const view = render(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.dataset.wulingSeed).toBe("#1133ee"))

    actions.setThemeSelection("light", { kind: "none" })
    await waitFor(() => expect(document.documentElement.dataset.wulingSeedSource).toBe("default"))
    expect(document.documentElement.dataset.wulingSeedFallback).toBe("false")
    for (const [name, value] of Object.entries(WULING_PRESET_COLORS.light)) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe(value)
    }

    actions.setDesignTheme(DEFAULT_DESIGN_THEME)
    await waitFor(() => expect(document.documentElement.dataset.wulingSeed).toBeUndefined())
    expect(document.documentElement.style.getPropertyValue("--primary")).not.toBe("#1133ee")
    void view
  })

  test("switches the existing theme choice between independent light and dark assignments", async () => {
    const actions = useWorkspaceStore.getState()
    actions.setCustomThemes([{
      name: "Imported dark",
      cssVars: {
        light: { primary: "oklch(0.5 0.1 120)" },
        dark: { primary: "oklch(0.72 0.12 250)" },
      },
    }])
    actions.setThemeSelection("light", { kind: "preset", name: "wuling" })
    actions.setThemeSelection("dark", { kind: "custom", name: "Imported dark" })

    const view = render(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.dataset.appTheme).toBe("wuling"))
    expect(document.documentElement.dataset.customTheme).toBeUndefined()

    themeState.theme = "dark"
    view.rerender(<WorkspaceAppearance />)
    await waitFor(() => expect(document.documentElement.dataset.customThemeName).toBe("Imported dark"))
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("oklch(0.72 0.12 250)")
  })
})

/**
 * 「不接管」档必须写成**属性缺失**。
 *
 * 皮肤规则的选择器是 `:root[data-choice-control-style] [data-slot=…]` 这种只判存在的形式，
 * 所以把值写成 `"none"` 等于「皮肤还在场但没人这么认为」：`data-choice-control-style="none"`
 * 照样命中那批声明，而高级主题的让位门 `:not([data-choice-control-style])` 又永远不生效。
 * 两边同时以为对方在管这个控件，结果就是谁都不管。
 */
const SKIN_FAMILIES = [
  { field: "tabDisplayStyle", dataset: "tabsStyle", setter: "setTabDisplayStyle", sample: "pill" },
  { field: "switchDisplayStyle", dataset: "switchStyle", setter: "setSwitchDisplayStyle", sample: "filled" },
  { field: "scrollbarDisplayStyle", dataset: "scrollbarStyle", setter: "setScrollbarDisplayStyle", sample: "rounded" },
  { field: "sliderDisplayStyle", dataset: "sliderStyle", setter: "setSliderDisplayStyle", sample: "pill" },
  { field: "choiceControlStyle", dataset: "choiceControlStyle", setter: "setChoiceControlStyle", sample: "tiles" },
  { field: "fieldTitleStyle", dataset: "fieldTitleStyle", setter: "setFieldTitleStyle", sample: "legend" },
] as const

describe("component skin 'none' means the attribute is absent", () => {
  for (const family of SKIN_FAMILIES) {
    test(`${family.dataset}: 'none' deletes the attribute, a real value sets it back`, async () => {
      const actions = useWorkspaceStore.getState() as unknown as Record<string, (value: string) => void>
      actions[family.setter]("none")
      render(<WorkspaceAppearance />)
      await waitFor(() => expect(family.dataset in document.documentElement.dataset).toBe(false))

      actions[family.setter](family.sample)
      await waitFor(() => expect(document.documentElement.dataset[family.dataset as keyof typeof document.documentElement.dataset]).toBe(family.sample))
    })
  }

  test("the shipped defaults are unchanged (adding the option must not change anyone's look)", () => {
    const defaults = INITIAL_STATE as unknown as Record<string, string>
    for (const family of SKIN_FAMILIES) {
      expect(defaults[family.field], `${family.field} 的默认值被动过`).not.toBe("none")
      expect(typeof defaults[family.field], `${family.field} 在默认值里根本不存在`).toBe("string")
    }
  })
})
