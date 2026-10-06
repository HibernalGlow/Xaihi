/**
 * Oracle 测试：我们发的角色必须等于 MCU 自己算出来的角色。
 *
 * 期望值不是从任何网站抄的 hex —— 那是「把同一个猜测写两遍」。这里每条断言的参照物都是
 * `@material/material-color-utilities@0.4.0` 本体：`new DynamicScheme(...)` +
 * `new MaterialDynamicColors().<role>().getArgb(scheme)`，走的是**现行访问形态**
 * （实例方法；`material_dynamic_colors.d.ts` 里那批同名静态成员几乎都标了
 * `@deprecated Use xxx() instead`，其中 `onSurfaceVariant` / `outlineVariant` 就是被点名那两个）。
 *
 * 也包含对照组：variant / isDark / contrastLevel 三个参数若有一个没接线，
 * 下面这几条就会红，而不是「参数是死的但测试照样过」。
 */
import { describe, expect, test } from "vitest"

import {
  DynamicScheme,
  Hct,
  MaterialDynamicColors,
  Variant,
  argbFromHex,
  hexFromArgb,
} from "@material/material-color-utilities"

import { MD3_BASELINE_SEED } from "../contract"
import {
  MD3_COLOR_ROLES,
  MD3_VARIANT_BY_NAME,
  createMd3Scheme,
  kebabRoleName,
  paletteToneHex,
  resolveColorRolePair,
  resolveColorRoles,
  roleVarName,
} from "./color"

/** Google 基线色板里的 primary-40；当固定 seed 用，不参与任何计算。 */
const SEED = MD3_BASELINE_SEED

type Role = (typeof MD3_COLOR_ROLES)[number]

/** 参照实现：完全绕开本模块，直接用 MCU 的现行形态。 */
function oracleScheme(variant: Variant, contrastLevel: number, isDark: boolean): DynamicScheme {
  return new DynamicScheme({
    sourceColorHct: Hct.fromInt(argbFromHex(SEED)),
    variant,
    contrastLevel,
    isDark,
  })
}

function oracleArgb(scheme: DynamicScheme, role: Role): string {
  // 唯一一处 cast：`highestSurface` 要 scheme，其余 59 个是无参方法（见 color.ts 文件头）。
  const table = new MaterialDynamicColors() as unknown as Record<Role, (s?: DynamicScheme) => DynamicColorLike>
  const color = table[role](scheme)
  return hexFromArgb(color.getArgb(scheme))
}

type DynamicColorLike = { getArgb(scheme: DynamicScheme): number }

describe("md3 color roles against the MCU oracle", () => {
  for (const [label, isDark] of [
    ["tonalSpot light", false],
    ["tonalSpot dark", true],
  ] as const) {
    test(`every emitted role equals MaterialDynamicColors for ${label}`, () => {
      const request = { seed: SEED, variant: "tonalSpot" as const, contrastLevel: 0 as const, isDark }
      const emitted = resolveColorRoles(createMd3Scheme(request))
      const reference = oracleScheme(Variant.TONAL_SPOT, 0, isDark)

      expect(Object.keys(emitted)).toHaveLength(MD3_COLOR_ROLES.length)
      for (const role of MD3_COLOR_ROLES) {
        expect(emitted[roleVarName(role)], `${label} ${kebabRoleName(role)}`).toBe(oracleArgb(reference, role))
      }
    })
  }

  test("the headline role is the MCU value, not a transcribed hex", () => {
    const emitted = resolveColorRoles(createMd3Scheme({ seed: SEED, variant: "tonalSpot", contrastLevel: 0, isDark: false }))
    const reference = oracleScheme(Variant.TONAL_SPOT, 0, false)
    expect(emitted["--md-sys-color-primary"]).toBe(hexFromArgb(new MaterialDynamicColors().primary().getArgb(reference)))
    // 顺带钉住「这不是 #6750a4 那个基线字面量」：tonalSpot 从 seed 推出的 primary 会偏 tone 40 但不同值。
    expect(emitted["--md-sys-color-primary"]).not.toBe(SEED.toLowerCase())
  })

  test("role variable names keep the Google spelling", () => {
    const emitted = resolveColorRoles(createMd3Scheme({ seed: SEED, variant: "tonalSpot", contrastLevel: 0, isDark: false }))
    for (const name of [
      "--md-sys-color-primary",
      "--md-sys-color-on-primary",
      "--md-sys-color-primary-container",
      "--md-sys-color-on-primary-container",
      "--md-sys-color-primary-fixed",
      "--md-sys-color-primary-fixed-dim",
      "--md-sys-color-on-primary-fixed-variant",
      "--md-sys-color-primary-palette-key-color",
      "--md-sys-color-surface-container-lowest",
      "--md-sys-color-surface-container-highest",
      "--md-sys-color-surface-bright",
      "--md-sys-color-surface-dim",
      "--md-sys-color-surface-variant",
      "--md-sys-color-surface-tint",
      "--md-sys-color-on-surface-variant",
      "--md-sys-color-outline-variant",
      "--md-sys-color-inverse-on-surface",
      "--md-sys-color-background",
      "--md-sys-color-on-background",
      "--md-sys-color-scrim",
      "--md-sys-color-shadow",
      "--md-sys-color-error-container",
      "--md-sys-color-on-error-container",
      "--md-sys-color-highest-surface",
    ]) {
      expect(emitted[name], name).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  test("light and dark come from the same seed, not from inverting the hex", () => {
    const pair = resolveColorRolePair({ seed: SEED, variant: "tonalSpot", contrastLevel: 0 })
    expect(pair.light["--md-sys-color-primary"]).not.toBe(pair.dark["--md-sys-color-primary"])
    // 取反会得到 #9aaf5b 这种颜色；两套值都必须在 seed 的色相家族里。
    expect(pair.dark["--md-sys-color-primary"]).toBe(oracleArgb(oracleScheme(Variant.TONAL_SPOT, 0, true), "primary"))
    expect(Object.keys(pair.dark)).toEqual(Object.keys(pair.light))
  })

  test("contrastLevel is wired: level 1 moves the surfaces versus level 0", () => {
    const standard = resolveColorRoles(createMd3Scheme({ seed: SEED, variant: "tonalSpot", contrastLevel: 0, isDark: false }))
    const maximum = resolveColorRoles(createMd3Scheme({ seed: SEED, variant: "tonalSpot", contrastLevel: 1, isDark: false }))
    const minimum = resolveColorRoles(createMd3Scheme({ seed: SEED, variant: "tonalSpot", contrastLevel: -1, isDark: false }))

    expect(maximum["--md-sys-color-surface-container"]).not.toBe(standard["--md-sys-color-surface-container"])
    expect(maximum["--md-sys-color-on-surface"]).not.toBe(standard["--md-sys-color-on-surface"])
    // 最低对比度动的是「前景/描边」这一类；实测 `surfaceContainer` 在 -1 上和 0 一样，
    // 所以这条不能照抄上面那句 —— 拿一个真会动的角色来证明 -1 这一档不是死参数。
    expect(minimum["--md-sys-color-on-surface"]).not.toBe(standard["--md-sys-color-on-surface"])
    expect(minimum["--md-sys-color-outline-variant"]).not.toBe(standard["--md-sys-color-outline-variant"])
    // 对照：参照实现同样动，证明差异来自 MCU 的 contrastLevel 而不是我的拼接。
    expect(maximum["--md-sys-color-surface-container"]).toBe(oracleArgb(oracleScheme(Variant.TONAL_SPOT, 1, false), "surfaceContainer"))
  })

  test("variant is wired: the nine names reach nine distinct MCU variants", () => {
    const values = Object.values(MD3_VARIANT_BY_NAME)
    expect(values).toHaveLength(9)
    expect(new Set(values).size).toBe(9)

    const primaryByVariant = Object.fromEntries(
      Object.keys(MD3_VARIANT_BY_NAME).map((name) => [
        name,
        resolveColorRoles(createMd3Scheme({
          seed: SEED,
          variant: name as keyof typeof MD3_VARIANT_BY_NAME,
          contrastLevel: 0,
          isDark: false,
        }))["--md-sys-color-primary"],
      ]),
    )
    expect(primaryByVariant.monochrome).not.toBe(primaryByVariant.tonalSpot)
    expect(primaryByVariant.vibrant).not.toBe(primaryByVariant.neutral)
    // 每个 variant 都和参照实现一致，包括 rainbow / fruitSalad 这两条容易接错的。
    for (const [name, emitted] of Object.entries(primaryByVariant)) {
      const reference = oracleScheme(MD3_VARIANT_BY_NAME[name as keyof typeof MD3_VARIANT_BY_NAME], 0, false)
      expect(emitted, name).toBe(oracleArgb(reference, "primary"))
    }
  })

  test("palette tones are readable for the chart convention", () => {
    const light = createMd3Scheme({ seed: SEED, variant: "tonalSpot", contrastLevel: 0, isDark: false })
    const reference = oracleScheme(Variant.TONAL_SPOT, 0, false)
    expect(paletteToneHex(light, "primary", 40)).toBe(hexFromArgb(reference.primaryPalette.tone(40)))
    expect(paletteToneHex(light, "neutralVariant", 40)).toBe(hexFromArgb(reference.neutralVariantPalette.tone(40)))
    expect(paletteToneHex(light, "neutral", 40)).not.toBe(paletteToneHex(light, "tertiary", 40))
  })

  test("a seed that is not a color fails instead of silently becoming black", () => {
    expect(() => createMd3Scheme({ seed: "not-a-color", variant: "tonalSpot", contrastLevel: 0, isDark: false })).toThrow(/#rrggbb/)
  })
})
