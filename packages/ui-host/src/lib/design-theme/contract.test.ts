import { describe, expect, test } from "vitest"

import {
  BRIDGED_COLOR_VARS,
  DEFAULT_DESIGN_THEME,
  DESIGN_DIMENSIONS,
  MD3_SCHEME_VARIANTS,
  normalizeDesignThemeConfig,
} from "./contract"

describe("design theme contract normalization", () => {
  test("the default recipe is the honest one — native applies nothing", () => {
    expect(DEFAULT_DESIGN_THEME.id).toBe("native")
    // 维度开关的默认值仍是全开：它描述的是「一旦启用高级主题，它管哪些事」，
    // 而不是「现在有没有启用」。两者混淆会让 data 属性在 native 下说谎。
    expect(DESIGN_DIMENSIONS.every((dimension) => DEFAULT_DESIGN_THEME.dimensions[dimension])).toBe(true)
  })

  test("bridged color list has no duplicates and no non-var entries", () => {
    expect(new Set(BRIDGED_COLOR_VARS).size).toBe(BRIDGED_COLOR_VARS.length)
    expect(BRIDGED_COLOR_VARS.every((name) => name.startsWith("--"))).toBe(true)
  })

  test("unknown or half-written persisted config falls back to defaults, never to a partial adopt", () => {
    expect(normalizeDesignThemeConfig(undefined).id).toBe("native")
    expect(normalizeDesignThemeConfig("md3")).toEqual(DEFAULT_DESIGN_THEME)

    const partial = normalizeDesignThemeConfig({
      id: "md3",
      dimensions: { color: false, nonsense: true },
      md3: { seed: "not-a-color", variant: "vibes", contrastLevel: 0.7, shapeScale: 9, seedSource: "image", elevationShadows: false },
    })
    expect(partial.id).toBe("md3")
    expect(partial.dimensions.color).toBe(false)
    // 没点名的维度不被野键污染，也不被静默关掉。
    expect(partial.dimensions.shape).toBe(true)
    expect((partial.dimensions as Record<string, unknown>).nonsense).toBeUndefined()
    expect(partial.md3.seed).toBe(DEFAULT_DESIGN_THEME.md3.seed)
    expect(partial.md3.variant).toBe(DEFAULT_DESIGN_THEME.md3.variant)
    expect(partial.md3.seedSource).toBe("manual")
    expect(partial.md3.elevationShadows).toBe(false)
  })

  test("out-of-range scalars snap onto the declared vocabulary", () => {
    // 对比度是有限档位：0.7 必须吸附到合法档，而不是原样存进 TOML。
    expect(snappedContrast(normalizeDesignThemeConfig({ id: "md3", md3: { contrastLevel: 0.7 } }))).toBe(0.5)
    expect(snappedContrast(normalizeDesignThemeConfig({ id: "md3", md3: { contrastLevel: -0.4 } }))).toBe(0)
    expect(normalizeDesignThemeConfig({ id: "md3", md3: { shapeScale: 1.1 } }).md3.shapeScale).toBe(1)
    expect(normalizeDesignThemeConfig({ id: "md3", md3: { shapeScale: 1.4 } }).md3.shapeScale).toBe(1.5)
    expect(normalizeDesignThemeConfig({ id: "md3", md3: { shapeScale: 99 } }).md3.shapeScale).toBe(2)
    expect(normalizeDesignThemeConfig({ id: "md3", md3: { shapeScale: -5 } }).md3.shapeScale).toBe(0.5)
  })

  test("every scheme variant the UI can name is a variant the normalizer accepts", () => {
    for (const variant of MD3_SCHEME_VARIANTS) {
      expect(normalizeDesignThemeConfig({ id: "md3", md3: { variant } }).md3.variant).toBe(variant)
    }
  })

  test("normalization is idempotent (a saved config re-saves byte-identical)", () => {
    const once = normalizeDesignThemeConfig({ id: "md3", dimensions: { color: false }, md3: { seed: "#006A60", variant: "vibrant", contrastLevel: 1, shapeScale: 1.25 } })
    expect(normalizeDesignThemeConfig(once)).toEqual(once)
    expect(once.md3.seed).toBe("#006a60")
  })
})

/** contrastLevel 吸附结果（类型收窄用，避免测试里再抄一份档位表）。 */
function snappedContrast(config: ReturnType<typeof normalizeDesignThemeConfig>): number {
  return config.md3.contrastLevel
}
