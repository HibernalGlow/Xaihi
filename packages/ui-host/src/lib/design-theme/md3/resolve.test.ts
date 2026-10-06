/**
 * 入口件的单测：`resolveMd3Theme` 走**真实的 `tokens.generated.ts`**（只有 `resolve.ts` 读它），
 * 所以这里同时是「字典有没有被静默漏掉」的门禁——计数全部从注入的表本身推出来，
 * 不写死「多少条变量」这种一改字典就红的数字。
 *
 * 明暗两套都断言一遍 MCU oracle：入口的接线（seed -> scheme -> roles -> vars）
 * 只要有一处串错（比如 dark 用了 light 的 scheme），这条就会红。
 *
 * 为什么这里不跑「真的写进 DOM」那一轮：实测 `applyDesignTheme` + `clearDesignTheme`
 * 在 happy-dom 里写/撤这份 3.2k 条变量要 ~12s + ~14s（`setProperty` 每次重排整份 cssText）。
 * 「resolution 到 DOM」这一段由 `apply.test.ts`（同一批属性常量）与 `tokenCoverage.test.ts`
 * （走 `resolveDesignTheme` 的真实产物）两把尺覆盖，本文件只测引擎侧。
 */
import { describe, expect, test } from "vitest"

import { DynamicScheme, Hct, MaterialDynamicColors, Variant, argbFromHex, hexFromArgb } from "@material/material-color-utilities"

import {
  ALL_DIMENSIONS_ON,
  BRIDGED_COLOR_VARS,
  DEFAULT_DESIGN_THEME,
  DESIGN_CONTRAST_ATTR,
  DESIGN_DIM_ATTR_PREFIX,
  DESIGN_REV_ATTR,
  DESIGN_ROOT_ATTR,
  DESIGN_SEED_ATTR,
  DESIGN_SEED_FALLBACK_ATTR,
  DESIGN_SEED_SOURCE_ATTR,
  DESIGN_VARIANT_ATTR,
  MD3_VAR,
  type DesignDimensionSwitches,
  type DesignThemeConfig,
  type DesignThemeContext,
} from "../contract"
import { MD3_COMPONENT_TOKENS, MD3_SYS_TOKENS, MD3_TOKEN_SOURCE } from "./tokens.generated"
import { MD3_EMITTED_COMPONENT_SETS } from "./mapper"
import { MD3_SPACE_STEPS } from "./space"
import {
  MD3_BRIDGE_THEME_ATTR,
  MD3_COLOR_ROLE_COUNT_ATTR,
  MD3_ELEVATION_SHADOW_ATTR,
  MD3_SHAPE_SCALE_ATTR,
  MD3_TOKEN_DICTIONARY_ATTR,
  readAppliedColorVar,
  resolveMd3Theme,
} from "./resolve"

const context = (overrides: Partial<DesignThemeContext> = {}): DesignThemeContext => ({
  scheme: "light",
  activeThemeSeed: null,
  systemAccentAvailable: true,
  ...overrides,
})

const config = (
  md3: Partial<DesignThemeConfig["md3"]> = {},
  dimensions: Partial<DesignDimensionSwitches> = {},
): DesignThemeConfig => ({
  id: "md3",
  dimensions: { ...ALL_DIMENSIONS_ON, ...dimensions },
  // 这一份夹具固定用 manual：本文件测的是「接线对不对」，取色默认档另有专门的断言。
  md3: { ...DEFAULT_DESIGN_THEME.md3, seed: "#6750A4", seedSource: "manual" as const, ...md3 },
  mondrian: DEFAULT_DESIGN_THEME.mondrian,
  swiss: DEFAULT_DESIGN_THEME.swiss,
  lonestar: DEFAULT_DESIGN_THEME.lonestar,
  wuling: DEFAULT_DESIGN_THEME.wuling,
})

/** MCU 参照实现：现行访问形态（实例方法）。 */
function oracleRole(variant: Variant, contrastLevel: number, isDark: boolean, role: "primary" | "surface" | "outlineVariant"): string {
  const scheme = new DynamicScheme({
    sourceColorHct: Hct.fromInt(argbFromHex("#6750a4")),
    variant,
    contrastLevel,
    isDark,
  })
  const colors = new MaterialDynamicColors() as unknown as Record<string, (s: DynamicScheme) => { getArgb(s: DynamicScheme): number }>
  return hexFromArgb(colors[role]!(scheme)!.getArgb(scheme))
}

const startsWith = (names: string[], prefix: string): string[] => names.filter((name) => name.startsWith(prefix))

describe("resolveMd3Theme against the real token dictionary", () => {
  test("the emitted primary is MCU's, in both schemes", () => {
    const light = resolveMd3Theme(config(), context())
    expect(light.bundle.vars["--md-sys-color-primary"]).toBe(oracleRole(Variant.TONAL_SPOT, 0, false, "primary"))
    expect(light.seed).toBeTypeOf("string")
    expect(light.seed?.toLowerCase()).toBe("#6750a4")
    expect(light.seedSource).toBe("manual")
    expect(light.seedFallback).toBe(false)

    // 默认档是「按配色主题取色」（用户 2026-10-05：本身是取色的就按取色的来）。
    // 这里把主题主色喂进去，seed 必须换成它，而不是继续用 config.md3.seed。
    const fromTheme = resolveMd3Theme(
      { ...config(), md3: { ...config().md3, seedSource: "activeTheme" as const } },
      context({ activeThemeSeed: "#123456" }),
    )
    expect(fromTheme.seed).toBe("#123456")
    expect(fromTheme.seedSource).toBe("activeTheme")
    expect(fromTheme.seedFallback).toBe(false)
    // 读不到主题主色时如实报回落，不拿别的颜色顶上。
    const unreadable = resolveMd3Theme(
      { ...config(), md3: { ...config().md3, seedSource: "activeTheme" as const } },
      context({ activeThemeSeed: null }),
    )
    expect(unreadable.seedFallback).toBe(true)

    const dark = resolveMd3Theme(config(), context({ scheme: "dark" }))
    expect(dark.bundle.vars["--md-sys-color-primary"]).toBe(oracleRole(Variant.TONAL_SPOT, 0, true, "primary"))
    expect(dark.bundle.vars["--md-sys-color-surface"]).toBe(oracleRole(Variant.TONAL_SPOT, 0, true, "surface"))
    expect(dark.bundle.vars["--md-sys-color-primary"]).not.toBe(light.bundle.vars["--md-sys-color-primary"])
  })

  test("every bridged variable and every dictionary namespace actually reaches the bundle", () => {
    const vars = resolveMd3Theme(config(), context()).bundle.vars
    const names = Object.keys(vars)
    for (const name of BRIDGED_COLOR_VARS) expect(vars[name], name).toBeTruthy()

    // 「字典里有多少条，就发了多少条」——差集门禁的引擎侧半边。
    // 唯一的例外是上游自己不导出值的 token（值是字符串 "null"），它们必须**不发**而不是发个假值；
    // 所以每条断言都减去这一批，缺多少就当场看得见。
    const unspecified = (section: string): number =>
      Object.values(MD3_SYS_TOKENS[section] ?? {}).filter((value) => value === "null").length
    // 只发 CSS 层在册的那 29 个集（名单与引用由 audit:design-theme-tokens 双向核对）。
    // 「字典有多少就发多少」在挂 3160 条 inline 变量时是假优点：实测一次 apply 要三十多秒。
    const allowedTokens = MD3_EMITTED_COMPONENT_SETS
      .reduce((n, set) => n + Object.keys(MD3_COMPONENT_TOKENS[set] ?? {}).length, 0)
    const unspecifiedTokens = MD3_EMITTED_COMPONENT_SETS
      .reduce((n, set) => n + Object.values(MD3_COMPONENT_TOKENS[set] ?? {}).filter((value) => value === "null").length, 0)
    expect(MD3_EMITTED_COMPONENT_SETS.every((set) => MD3_COMPONENT_TOKENS[set] !== undefined), "名单里有字典没有的集").toBe(true)
    expect(allowedTokens + unspecifiedTokens, "名单内集 token 数与字典不一致").toBeGreaterThan(0)
    expect(startsWith(names, MD3_VAR.component).length).toBe(allowedTokens - unspecifiedTokens)
    // 名单外的集必须一条都不发——否则这条断言会因为「碰巧也发了」而假绿。
    expect(names.filter((name) => name.startsWith(`${MD3_VAR.component}fab-primary-`))).toEqual([])
    // 间距阶梯来自 ./space（v0_192 字典里没有那一组）。
    expect(startsWith(names, "--md-sys-space-").length).toBe(Object.keys(MD3_SPACE_STEPS).length + 1)

    for (const [prefix, section] of [
      [MD3_VAR.shape, "md-sys-shape"],
      [MD3_VAR.state, "md-sys-state"],
      [MD3_VAR.typescale, "md-sys-typescale"],
      [MD3_VAR.motion, "md-sys-motion"],
      [MD3_VAR.refTypeface, "md-ref-typeface"],
    ] as const) {
      const declared = Object.keys(MD3_SYS_TOKENS[section] ?? {}).length
      expect(startsWith(names, prefix).length, section).toBe(declared - unspecified(section))
    }

    // 静态基线不该盖住动态值：md-sys-color.* 与 md-ref-palette* 整组不发。
    expect(startsWith(names, "--md-sys-color-").length).toBeGreaterThan(50)
    expect(startsWith(names, "--md-ref-palette").length).toBe(0)
    // 上游明确不导出的 token（md-sys-motion.path = "null"）不能变成一条假变量。
    expect(vars["--md-sys-motion-path"]).toBeUndefined()
    expect(startsWith(names, MD3_VAR.elevation).length)
      .toBe(Object.keys(MD3_SYS_TOKENS["md-sys-elevation"] ?? {}).length + 6)
  })

  test("shape scale and the shadow switch travel through the entry point", () => {
    const small = resolveMd3Theme(config({ shapeScale: 0.5 }), context())
    expect(small.bundle.vars["--md-sys-shape-corner-medium"]).toBe("6px")
    expect(small.bundle.vars["--md-sys-shape-corner-full"]).toBe("9999px")
    expect(small.bundle.attributes[MD3_SHAPE_SCALE_ATTR]).toBe("0.5")

    const flat = resolveMd3Theme(config({ elevationShadows: false }), context())
    expect(flat.bundle.vars["--md-sys-elevation-shadow-3"]).toBe("none")
    expect(flat.bundle.vars["--md-sys-elevation-level3"]).toBe("6")
    expect(flat.bundle.attributes[MD3_ELEVATION_SHADOW_ATTR]).toBe("off")
  })

  test("color off: the bridge stays with the applied theme, the roles follow it back", () => {
    const read = (name: string) => (name === "--primary" ? "oklch(0.58 0.22 262)" : null)
    const resolution = resolveMd3Theme(config({ seedSource: "activeTheme" }, { color: false }), context({ activeThemeSeed: "#224466" }), {
      readThemeColorVar: read,
    })
    const vars = resolution.bundle.vars
    for (const name of BRIDGED_COLOR_VARS) expect(vars[name], name).toBeUndefined()
    expect(vars["--md-sys-color-primary"]).toBe("oklch(0.58 0.22 262)")
    // seed 仍然是 activeTheme 解出来的那个（颜色维度关掉不影响取色来源）。
    expect(resolution.seed).toBe("#224466")
    expect(resolution.seedFallback).toBe(false)
  })

  test("an unavailable system accent is reported as a fallback, never silently swapped", () => {
    const resolution = resolveMd3Theme(config({ seed: "#123456", seedSource: "systemAccent" }), context({ systemAccentAvailable: false }), {
      seedHost: { readSystemAccent: () => "#abcdef" },
    })
    expect(resolution.seed).toBe("#123456")
    expect(resolution.seedSource).toBe("systemAccent")
    expect(resolution.seedFallback).toBe(true)
  })

  test("attributes are diagnostics only and never collide with what apply.ts writes", () => {
    const attributes = resolveMd3Theme(config(), context()).bundle.attributes
    expect(Object.keys(attributes).sort()).toEqual([
      MD3_COLOR_ROLE_COUNT_ATTR,
      MD3_ELEVATION_SHADOW_ATTR,
      MD3_SHAPE_SCALE_ATTR,
      MD3_TOKEN_DICTIONARY_ATTR,
      MD3_BRIDGE_THEME_ATTR,
    ].sort())
    // 「直接映射」的回读路径：没有可读的配色主题变量时是 0/36，一条都不许谎报成映射来的。
    expect(attributes[MD3_BRIDGE_THEME_ATTR]).toBe(`0/${BRIDGED_COLOR_VARS.length}`)
    expect(attributes[MD3_TOKEN_DICTIONARY_ATTR]).toBe(MD3_TOKEN_SOURCE.designVersion)
    expect(Number(attributes[MD3_COLOR_ROLE_COUNT_ATTR])).toBeGreaterThan(50)

    // 这一条是「两处真源」的证伪：apply.ts 自己那七个 + 五个 data-md3-* 都不许出现在这里。
    for (const taken of [
      DESIGN_ROOT_ATTR, DESIGN_REV_ATTR, DESIGN_VARIANT_ATTR, DESIGN_SEED_ATTR,
      DESIGN_SEED_SOURCE_ATTR, DESIGN_SEED_FALLBACK_ATTR, DESIGN_CONTRAST_ATTR,
    ]) {
      expect(attributes[taken]).toBeUndefined()
    }
    expect(Object.keys(attributes).some((name) => name.startsWith(DESIGN_DIM_ATTR_PREFIX))).toBe(false)
  })

  test("readAppliedColorVar returns the raw declaration and null when it is absent", () => {
    document.documentElement.style.setProperty("--md3-probe-color", "oklch(0.5 0.1 200)")
    try {
      expect(readAppliedColorVar("--md3-probe-color")).toBe("oklch(0.5 0.1 200)")
      expect(readAppliedColorVar("--md3-probe-missing")).toBeNull()
    } finally {
      document.documentElement.style.removeProperty("--md3-probe-color")
    }
  })
})
