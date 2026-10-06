// @vitest-environment happy-dom
import { describe, expect, test } from "vitest"
import { THEME_DESIGN_RECIPES } from "@/lib/appearance"
import { useWorkspaceStore } from "../workspaceStore"

/**
 * `setTheme` 带不带字体，取决于这份 fontPreset 是谁给的：等于当前主题的配方值 ⇒ 配方给的；
 * 不相等 ⇒ 用户在字体选择器里显式挑过，换主题不许覆盖（2026-10-05 定）。
 *
 * ⚠️ 口径变化：2026-10-05 内置预设只剩武陵一套之后，原来那对夹具（spatial / endfield，
 * 两个配方的字体互不相同）不存在了，「换主题时按配方带走」这条臂**没法再用两个预设证**。
 * 这里保留仍然成立、且真正要紧的那半条：显式挑过的字体不许被预设覆盖。
 * 等第二份预设（武陵升格成高级主题之后是配方）进来时，再补「带走」那条臂。
 */
const PRESET = "wuling"
/** 预设配方里的字体都不是它，才配当「用户自己挑的那一个」。 */
const USER_CHOICE = "serif"

describe("theme recipe and explicit font choice", () => {
  test("夹具本身可用：USER_CHOICE 不是任何预设的配方字体", () => {
    const recipeFont = THEME_DESIGN_RECIPES[PRESET].fontPreset
    expect(typeof recipeFont).toBe("string")
    expect(USER_CHOICE).not.toBe(recipeFont)
  })

  test("用户显式选过字体后，应用预设不覆盖它", () => {
    const actions = useWorkspaceStore.getState()
    actions.setTheme(PRESET)
    actions.setFontPreset(USER_CHOICE)

    actions.setTheme(PRESET)

    expect(useWorkspaceStore.getState().fontPreset).toBe(USER_CHOICE)
  })

  test("没人动过字体时，应用预设按配方落字体，并把选择拉回预设", () => {
    const actions = useWorkspaceStore.getState()
    actions.setFontPreset(THEME_DESIGN_RECIPES[PRESET].fontPreset)
    // 先选一个自定义主题，验证 setTheme 会把选择与 custom 指针一起收回去。
    actions.setCustomThemes([{ name: "Temp", cssVars: { light: { background: "oklch(1 0 0)" } } }])
    actions.setThemeSelection("light", { kind: "custom", name: "Temp" })

    useWorkspaceStore.getState().setTheme(PRESET)

    const state = useWorkspaceStore.getState()
    expect(state.fontPreset).toBe(THEME_DESIGN_RECIPES[PRESET].fontPreset)
    expect(state.activeCustomThemeName).toBeNull()
    expect(state.themeSelections.light).toEqual({ kind: "preset", name: PRESET })
    expect(state.themeSelections.dark).toEqual({ kind: "preset", name: PRESET })
  })
})
