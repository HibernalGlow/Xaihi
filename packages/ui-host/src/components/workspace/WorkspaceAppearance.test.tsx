// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { INITIAL_STATE } from "@/store/workspace/constants"
import { useWorkspaceStore } from "@/store/workspaceStore"
import { WorkspaceAppearance } from "./WorkspaceAppearance"

const themeState = vi.hoisted(() => ({ theme: "light" as "light" | "dark" | "system" }))
vi.mock("@/components/use-theme", () => ({ useTheme: () => themeState }))

afterEach(() => {
  cleanup()
  themeState.theme = "light"
  useWorkspaceStore.getState().setCustomThemes([])
  useWorkspaceStore.getState().setTheme("wuling")
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
