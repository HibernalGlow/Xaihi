/**
 * mapper.ts 的单测。字典走**内联小夹具**（值抄自 `@material/web` v0_192 的真实条目），
 * 角色表走真 MCU —— 因为「桥接是否齐全」这件事只有拿真的角色表来喂才有意义。
 *
 * 重点在对照组（falsification）：维度关掉时断言的是「那组变量一条都没有」，
 * 而不是「有一条等于空」。颜色维度关闭那条尤其要证伪：
 * 它必须证明 `--md-sys-color-primary` 是被注入的主题读出来的，
 * 而不是顺手又用了一遍 MCU 的值（所以同一条测试里 reader 返回 null 时必须回落到 scheme）。
 */
import { describe, expect, test } from "vitest"

import {
  ALL_DIMENSIONS_ON,
  BRIDGED_COLOR_VARS,
  DEFAULT_DESIGN_THEME,
  type DesignDimensionSwitches,
  type Md3Options,
} from "../contract"
import { createMd3Scheme, resolveColorRoles, roleVarName } from "./color"
import { MD3_SPACE_STEPS } from "./space"
import {
  BRIDGE_ROLE_MAP,
  MD3_ELEVATION_SHADOWS,
  REVERSE_BRIDGE_MAP,
  THEME_UNEXPRESSIBLE_ROLES,
  buildBridgeVars,
  buildChartVars,
  buildMd3Vars,
  MD3_EMITTED_COMPONENT_SETS,
  scaleShapeValue,
} from "./mapper"

const SYS_FIXTURE: Record<string, Record<string, string>> = {
  "md-sys-shape": {
    "corner-none": "0px",
    "corner-extra-small": "4px",
    "corner-small": "8px",
    "corner-medium": "12px",
    "corner-large": "16px",
    "corner-extra-large": "28px",
    "corner-full": "9999px",
    "corner-large-top": "16px 16px 0 0",
  },
  "md-sys-elevation": { level0: "0", level1: "1", level2: "3", level3: "6", level4: "8", level5: "12" },
  "md-sys-typescale": {
    "body-large-size": "1rem",
    "body-large-line-height": "1.5rem",
    "body-large-tracking": "0.03125rem",
    "body-large-weight": "ref:md-ref-typeface:weight-regular",
    "body-large-font": "ref:md-ref-typeface:plain",
    "body-large-composite": "ref:md-ref-typeface:weight-regular 1rem / ref:md-ref-typeface:plain",
  },
  "md-sys-motion": {
    "duration-short4": "200ms",
    "easing-standard": "cubic-bezier(0.2, 0, 0, 1)",
    path: "null",
  },
  "md-sys-state": {
    "hover-state-layer-opacity": "0.08",
    "focus-state-layer-opacity": "0.12",
    "pressed-state-layer-opacity": "0.12",
    "dragged-state-layer-opacity": "0.16",
  },
  "md-ref-typeface": {
    brand: "Roboto",
    plain: "Roboto",
    "weight-regular": "400",
    "weight-medium": "500",
    "weight-bold": "700",
  },
  // 静态色与静态基线调色板：动态取色之后必须被忽略，测试把它们放进去就是为了证伪。
  "md-sys-color.light": { primary: "#6750a4", surface: "#fffbff" },
  "md-sys-color.dark": { primary: "#d0bcff" },
  "md-ref-palette": { primary40: "#6750a4" },
  // 间距阶梯：分组存在时必须发出来，且不受 geometry 开关影响（和 --md-comp-* 同一条理由）。
}

const COMPONENT_FIXTURE: Record<string, Record<string, string>> = {
  "filled-button": {
    "container-color": "ref:md-sys-color:primary",
    "container-height": "40px",
    "container-shape": "ref:md-sys-shape:corner-full",
    "container-elevation": "ref:md-sys-elevation:level0",
    "label-text-color": "ref:md-sys-color:on-primary",
    "label-text-weight": "ref:md-sys-typescale:body-large-weight",
    "label-text-font": "ref:md-sys-typescale:body-large-font",
    "hover-state-layer-opacity": "ref:md-sys-state:hover-state-layer-opacity",
  },
  "outlined-card": { "outline-color": "ref:md-sys-color:outline-variant" },
}

const SCHEME = createMd3Scheme({ seed: "#6750a4", variant: "tonalSpot", contrastLevel: 0, isDark: false })
const ROLE_VARS = resolveColorRoles(SCHEME)

function varsFor(
  dimensionOverrides: Partial<DesignDimensionSwitches> = {},
  optionOverrides: Partial<Md3Options> = {},
  readThemeColorVar: (name: string) => string | null = () => null,
  themeColorVars: Record<string, string> | null = null,
): Record<string, string> {
  return buildMd3Vars({
    roleVars: ROLE_VARS,
    scheme: SCHEME,
    isDark: false,
    options: { ...DEFAULT_DESIGN_THEME.md3, ...optionOverrides },
    dimensions: { ...ALL_DIMENSIONS_ON, ...dimensionOverrides },
    sysTokens: SYS_FIXTURE,
    componentTokens: COMPONENT_FIXTURE,
    readThemeColorVar,
    themeColorVars,
  }).vars
}

const startsWith = (vars: Record<string, string>, prefix: string): string[] =>
  Object.keys(vars).filter((name) => name.startsWith(prefix))

describe("md3 bridge to shadcn variables", () => {
  const bridge = buildBridgeVars(ROLE_VARS, buildChartVars(SCHEME, false)).vars

  test("the emitted set is exactly BRIDGED_COLOR_VARS — no missing, no extra", () => {
    expect(new Set(Object.keys(bridge))).toEqual(new Set<string>(BRIDGED_COLOR_VARS))
    expect(Object.keys(bridge).length).toBe(BRIDGED_COLOR_VARS.length)
  })

  test("every documented pairing points at the role the design doc names", () => {
    const hex = (role: string) => ROLE_VARS[roleVarName(role)]
    expect(bridge["--background"]).toBe(hex("surface"))
    expect(bridge["--foreground"]).toBe(hex("onBackground"))
    expect(bridge["--card"]).toBe(hex("surfaceContainer"))
    expect(bridge["--card-foreground"]).toBe(hex("onSurface"))
    expect(bridge["--popover"]).toBe(hex("surfaceContainerHigh"))
    expect(bridge["--primary"]).toBe(hex("primary"))
    expect(bridge["--primary-foreground"]).toBe(hex("onPrimary"))
    // shadcn 的 secondary 按钮 == M3 的 tonal 按钮 => 容器色是 secondaryContainer，不是 secondary。
    expect(bridge["--secondary"]).toBe(hex("secondaryContainer"))
    expect(bridge["--secondary"]).not.toBe(hex("secondary"))
    expect(bridge["--secondary-foreground"]).toBe(hex("onSecondaryContainer"))
    expect(bridge["--muted"]).toBe(hex("surfaceContainerHighest"))
    expect(bridge["--muted-foreground"]).toBe(hex("onSurfaceVariant"))
    expect(bridge["--destructive"]).toBe(hex("error"))
    expect(bridge["--destructive-foreground"]).toBe(hex("onError"))
    expect(bridge["--border"]).toBe(hex("outlineVariant"))
    expect(bridge["--input"]).toBe(hex("outline"))
    expect(bridge["--ring"]).toBe(hex("primary"))
    expect(bridge["--sidebar"]).toBe(hex("surfaceContainerLow"))
    expect(bridge["--sidebar-border"]).toBe(hex("outlineVariant"))
  })

  test("--md-sys-color-* keeps the dynamic value, not the dictionary's static baseline", () => {
    const vars = varsFor()
    expect(vars["--md-sys-color-primary"]).toBe(ROLE_VARS["--md-sys-color-primary"])
    expect(vars["--md-sys-color-primary"]).not.toBe("#6750a4")
    expect(startsWith(vars, "--md-ref-palette-")).toEqual([])
    expect(startsWith(vars, "--md-sys-color-")).toContain("--md-sys-color-surface-container-lowest")
  })

  test("chart + workspace are labelled derivations, and they stay tied to the roles", () => {
    const vars = varsFor()
    // 这两组是本仓约定（不是 Google 规范表）：断言它们引用角色变量而不是各自为政的字面量。
    expect(vars["--ws-grid-color"]).toContain("var(--md-sys-color-primary)")
    expect(vars["--ws-focused-overlay"]).toContain("var(--md-sys-color-on-surface)")
    expect(vars["--ws-canvas"]).toContain("var(--md-sys-color-surface)")
    expect(vars["--chart-1"]).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set([vars["--chart-1"], vars["--chart-2"], vars["--chart-3"], vars["--chart-4"], vars["--chart-5"]]).size)
      .toBe(5)
  })

  test("an incomplete role table fails loudly instead of dropping a bridged var", () => {
    const { "--md-sys-color-surface": _dropped, ...partial } = ROLE_VARS
    expect(() => buildBridgeVars(partial, buildChartVars(SCHEME, false)).vars).toThrow(/surface/)
  })
})

describe("md3 dimension gates", () => {
  test("color off: no bridged var is emitted and the roles come from the injected reader", () => {
    const read = (name: string) => (name === "--primary" ? "oklch(0.58 0.22 262)" : name === "--background" ? "lime" : null)
    const vars = varsFor({ color: false }, {}, read)
    for (const name of BRIDGED_COLOR_VARS) expect(vars[name], name).toBeUndefined()
    expect(vars["--md-sys-color-primary"]).toBe("oklch(0.58 0.22 262)")
    expect(vars["--md-sys-color-primary"]).not.toBe(ROLE_VARS["--md-sys-color-primary"])
    expect(vars["--md-sys-color-surface"]).toBe("lime")
    // 主题词表里没有的角色（scrim/shadow/*-fixed*…）不能变成空变量：沿用 scheme 的那一套。
    expect(THEME_UNEXPRESSIBLE_ROLES).toContain("scrim")
    expect(vars["--md-sys-color-scrim"]).toBe(ROLE_VARS["--md-sys-color-scrim"])
  })

  test("color off with an unreadable theme still emits the seed-derived roles", () => {
    const vars = varsFor({ color: false }, {}, () => null)
    expect(vars["--md-sys-color-primary"]).toBe(ROLE_VARS["--md-sys-color-primary"])
    expect(vars["--background"]).toBeUndefined()
  })

  test("shape off: the whole shape namespace disappears, refs stay symbolic", () => {
    const vars = varsFor({ shape: false })
    expect(startsWith(vars, "--md-sys-shape-")).toEqual([])
    expect(vars["--md-comp-filled-button-container-shape"]).toBe("var(--md-sys-shape-corner-full)")
  })

  test("elevation off: neither dp numbers nor shadow recipes; typography/motion/states likewise", () => {
    expect(startsWith(varsFor({ elevation: false }), "--md-sys-elevation-")).toEqual([])
    const typo = varsFor({ typography: false })
    expect(startsWith(typo, "--md-sys-typescale-")).toEqual([])
    expect(startsWith(typo, "--md-ref-typeface-")).toEqual([])
    expect(startsWith(varsFor({ motion: false }), "--md-sys-motion-")).toEqual([])
    const states = varsFor({ states: false })
    expect(startsWith(states, "--md-sys-state-")).toEqual([])
    // 对照：全开时这些命名空间都在，否则「关掉」和「从来没实现」分不出来。
    expect(startsWith(varsFor(), "--md-sys-state-").length).toBeGreaterThan(3)
  })

  test("geometry off still emits --md-comp-* and --md-sys-space-* (only geometry-gated rules read them)", () => {
    const vars = varsFor({ geometry: false })
    // 夹具里 8 条 filled-button + 1 条 outlined-card，两个集都在 Tier-1 名单上。
    expect(startsWith(vars, "--md-comp-").length).toBe(9)
    // 间距不再来自字典（v0_192 没有那一组），真源是 ./space：unit + 每一档一条。
    expect(startsWith(vars, "--md-sys-space-").length).toBe(Object.keys(MD3_SPACE_STEPS).length + 1)
  })

  test("the component allowlist is what gates a set (falsification for the 29-set filter)", () => {
    const vars = varsFor()
    expect(vars["--md-comp-filled-button-container-height"]).toBe("40px")
    // 名单外的集即使在字典里也不该出现；名单本身写了这个名才会红，不是碰巧没这条。
    expect(startsWith(vars, "--md-comp-fab-primary-")).toEqual([])
    expect(MD3_EMITTED_COMPONENT_SETS).toContain("filled-button")
    expect(MD3_EMITTED_COMPONENT_SETS).not.toContain("fab-primary")
  })
})

describe("md3 non-color namespaces", () => {
  test("shape scaling: corner-medium 12px -> 6px at 0.5, and the two exemptions never move", () => {
    expect(varsFor()["--md-sys-shape-corner-medium"]).toBe("12px")
    expect(varsFor({}, { shapeScale: 0.5 })["--md-sys-shape-corner-medium"]).toBe("6px")
    expect(varsFor({}, { shapeScale: 2 })["--md-sys-shape-corner-medium"]).toBe("24px")
    for (const scale of [0.5, 1, 1.75, 2]) {
      expect(varsFor({}, { shapeScale: scale })["--md-sys-shape-corner-full"]).toBe("9999px")
      expect(varsFor({}, { shapeScale: scale })["--md-sys-shape-corner-none"]).toBe("0px")
    }
    // 多角值逐原子缩放，`0` 保持为 0。
    expect(scaleShapeValue("corner-large-top", "16px 16px 0 0", 0.5)).toBe("8px 8px 0 0")
  })

  test("elevation keeps dp numbers and adds the copied two-layer recipes", () => {
    const vars = varsFor()
    expect(vars["--md-sys-elevation-level0"]).toBe("0")
    expect(vars["--md-sys-elevation-level5"]).toBe("12")
    expect(Object.keys(MD3_ELEVATION_SHADOWS)).toEqual(["0", "1", "2", "3", "4", "5"])
    expect(vars["--md-sys-elevation-shadow-0"]).toBe("none")
    expect(vars["--md-sys-elevation-shadow-3"]).toBe(
      "0 1px 3px 0 hsl(from var(--md-sys-color-shadow) h s l / 0.3), 0 4px 8px 3px hsl(from var(--md-sys-color-shadow) h s l / 0.15)",
    )
  })

  test("elevationShadows off: shadows become none, level numbers stay intact", () => {
    const vars = varsFor({}, { elevationShadows: false })
    for (const level of ["0", "1", "2", "3", "4", "5"]) {
      expect(vars[`--md-sys-elevation-shadow-${level}`]).toBe("none")
    }
    expect(vars["--md-sys-elevation-level2"]).toBe("3")
  })

  test("references stay symbolic so the dimension gates keep working", () => {
    const vars = varsFor()
    expect(vars["--md-comp-filled-button-container-color"]).toBe("var(--md-sys-color-primary)")
    expect(vars["--md-comp-filled-button-label-text-color"]).toBe("var(--md-sys-color-on-primary)")
    expect(vars["--md-comp-outlined-card-outline-color"]).toBe("var(--md-sys-color-outline-variant)")
    expect(vars["--md-comp-filled-button-container-elevation"]).toBe("var(--md-sys-elevation-level0)")
    expect(vars["--md-comp-filled-button-hover-state-layer-opacity"]).toBe("var(--md-sys-state-hover-state-layer-opacity)")
    // 字面量原样通过。
    expect(vars["--md-comp-filled-button-container-height"]).toBe("40px")
  })

  test("weights resolve to the dictionary's own numbers; fonts and chained refs stay var()", () => {
    const vars = varsFor()
    expect(vars["--md-sys-typescale-body-large-weight"]).toBe("400")
    expect(vars["--md-sys-typescale-body-large-composite"]).toBe("400 1rem / var(--md-ref-typeface-plain)")
    // ref 指向 typescale 时要保持链式引用，不能顺着链把字重摊平下来。
    expect(vars["--md-comp-filled-button-label-text-weight"]).toBe("var(--md-sys-typescale-body-large-weight)")
    expect(vars["--md-sys-typescale-body-large-size"]).toBe("1rem")
    expect(vars["--md-sys-motion-easing-standard"]).toBe("cubic-bezier(0.2, 0, 0, 1)")
  })

  test("typeface deviation: brand/plain bind to the app's own font variables, weights do not", () => {
    const vars = varsFor()
    expect(vars["--md-ref-typeface-brand"]).toBe("var(--font-app-sans)")
    expect(vars["--md-ref-typeface-plain"]).toBe("var(--font-app-mono)")
    expect(vars["--md-ref-typeface-weight-bold"]).toBe("700")
    expect(vars["--md-sys-state-hover-state-layer-opacity"]).toBe("0.08")
  })

  test("tokens the design system does not export are skipped, not invented", () => {
    expect(startsWith(varsFor(), "--md-sys-motion-")).toEqual([
      "--md-sys-motion-duration-short4",
      "--md-sys-motion-easing-standard",
    ])
  })
})

describe("md3 reverse bridge", () => {
  test("each role has at most one canonical bridged source, and the map covers the role-backed subset", () => {
    const roleBacked = Object.values(BRIDGE_ROLE_MAP).filter((role) => role !== undefined)
    expect(new Set(Object.keys(REVERSE_BRIDGE_MAP)).size).toBe(new Set(roleBacked).size)
    expect(REVERSE_BRIDGE_MAP.onSurface).toBe("--card-foreground")
    expect(REVERSE_BRIDGE_MAP.surface).toBe("--background")
    expect(REVERSE_BRIDGE_MAP.outlineVariant).toBe("--border")
    expect(THEME_UNEXPRESSIBLE_ROLES).toContain("shadow")
    expect(THEME_UNEXPRESSIBLE_ROLES).not.toContain("surface")
  })
})

/**
 * 「直接映射」那一半：配色主题声明了的槽必须原样过来，没声明的才由 seed 派生。
 * 这条是用户 2026-10-05 那句「在使用高级主题的情况下，使用 shadcn 的配色主题就是直接映射」的尺。
 */
describe("md3 colour dimension merges the active colour theme per slot", () => {
  const null2fn = () => null
  const themeOnly = (provided: Record<string, string>) => (name: string): string | null => provided[name] ?? null

  test("a theme-provided slot passes through verbatim, including oklch()/color-mix() forms", () => {
    const vars = varsFor({}, {}, null2fn, { "--primary": "oklch(0.62 0.19 259)", "--card": "color-mix(in oklab, red 20%, white)" })
    expect(vars["--primary"]).toBe("oklch(0.62 0.19 259)")
    expect(vars["--card"]).toBe("color-mix(in oklab, red 20%, white)")
    // 没声明的槽仍是 MCU 派生的角色值——两半缺一不可。
    expect(vars["--muted-foreground"]).toBe(ROLE_VARS[roleVarName("onSurfaceVariant")])
  })

  test("chart and workspace slots take part in the merge too", () => {
    const vars = varsFor({}, {}, null2fn, { "--chart-1": "#111111", "--ws-canvas": "#222222" })
    expect(vars["--chart-1"]).toBe("#111111")
    expect(vars["--ws-canvas"]).toBe("#222222")
    expect(vars["--chart-2"]).toBe(buildChartVars(SCHEME, false)["--chart-2"])
  })

  test("the themeProvided list is exactly the slots that came from the theme (falsification)", () => {
    const provided = { "--primary": "#010203", "--border": "#040506", "--sidebar-ring": "#070809" }
    const result = buildBridgeVars(ROLE_VARS, buildChartVars(SCHEME, false), themeOnly(provided))
    expect(Object.keys(provided).sort()).toEqual([...result.themeProvided].sort())
    // 反空对照：一把都不给 ⇒ 名单必须是空的，而不是「看起来全都映射了」。
    expect(buildBridgeVars(ROLE_VARS, buildChartVars(SCHEME, false), () => null).themeProvided).toEqual([])
    // 阳性对照：给了值就必须真的出现在输出里（不是只记在名单上）。
    expect(result.vars["--primary"]).toBe("#010203")
    expect(result.vars["--border"]).toBe("#040506")
  })

  test("the merge is driven by the theme's own declarations, not by whatever :root computes to", () => {
    // 这条是踩过的坑：用 `:root` 计算值判「主题有没有声明」会让合并退化成 36/36 全透传，
    // 于是高级主题的颜色维度一条都不做事，而界面上完全看不出来。
    const vars = varsFor({}, {}, () => "#ff0000")
    expect(vars["--primary"]).toBe(ROLE_VARS[roleVarName("primary")])
    expect(vars["--primary"]).not.toBe("#ff0000")
  })

  test("colour dimension off still emits no bridged var at all", () => {
    const vars = varsFor({ color: false }, {}, () => "#ff0000")
    for (const name of BRIDGED_COLOR_VARS) expect(name in vars, `关掉颜色之后还在覆盖 ${name}`).toBe(false)
  })
})
