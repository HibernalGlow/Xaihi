/**
 * seed 来源的单测。核心断言只有一句话：**要求的来源解不出来时，必须报 fallback**。
 *
 * 系统强调色那条走注入（`SeedHost.readSystemAccent`），因为「本机读不读得到 AccentColor」
 * 是运行时事实，不是单元测试该赌的东西（设计文档 §5 明确不给任何 webview 版本背书）。
 * `domColor.ts` 的哨兵逻辑本身不在这里重测，这里只测「它返回 null 时本模块怎么表现」。
 */
import { describe, expect, test } from "vitest"

import { ALL_DIMENSIONS_ON, DEFAULT_DESIGN_THEME, MD3_BASELINE_SEED, type DesignThemeConfig, type DesignThemeContext } from "../contract"
import { resolveSeed, seedSwatchPair, toSeedHex } from "./seed"

const context = (overrides: Partial<DesignThemeContext> = {}): DesignThemeContext => ({
  scheme: "light",
  activeThemeSeed: null,
  systemAccentAvailable: true,
  ...overrides,
})

const config = (overrides: Partial<DesignThemeConfig["md3"]> = {}): DesignThemeConfig => ({
  id: "md3",
  dimensions: { ...ALL_DIMENSIONS_ON },
  md3: { ...DEFAULT_DESIGN_THEME.md3, ...overrides },
  mondrian: DEFAULT_DESIGN_THEME.mondrian,
  swiss: DEFAULT_DESIGN_THEME.swiss,
  lonestar: DEFAULT_DESIGN_THEME.lonestar,
  wuling: DEFAULT_DESIGN_THEME.wuling,
})

describe("md3 seed resolution", () => {
  test("manual uses the configured seed and never reports a fallback", () => {
    const result = resolveSeed(config({ seed: "#123456", seedSource: "manual" }), context(), { readSystemAccent: () => "#ffffff" })
    expect(result).toEqual({ seed: "#123456", source: "manual", fallback: false })
  })

  test("activeTheme takes the caller's --primary, normalised to lowercase #rrggbb", () => {
    const result = resolveSeed(config({ seedSource: "activeTheme" }), context({ activeThemeSeed: "#ABCDEF" }))
    expect(result.seed).toBe("#abcdef")
    expect(result.fallback).toBe(false)
  })

  test("activeTheme missing => fallback, and the manual seed is what actually got used", () => {
    const result = resolveSeed(config({ seed: "#123456", seedSource: "activeTheme" }), context({ activeThemeSeed: null }))
    expect(result).toEqual({ seed: "#123456", source: "activeTheme", fallback: true })
  })

  test("activeTheme that the browser cannot parse is a fallback, not a guess", () => {
    const result = resolveSeed(config({ seed: "#123456", seedSource: "activeTheme" }), context({ activeThemeSeed: "not-a-color" }))
    expect(result.fallback).toBe(true)
    expect(result.seed).toBe("#123456")
  })

  test("systemAccent honoured only when the platform reports it available and returns a color", () => {
    const host = { readSystemAccent: () => "#0078d4" }
    const ok = resolveSeed(config({ seed: "#123456", seedSource: "systemAccent" }), context(), host)
    expect(ok).toEqual({ seed: "#0078d4", source: "systemAccent", fallback: false })

    // 对照组 1：平台说读不到 —— 不许再调 host，也不许拿别的颜色顶上。
    const unavailable = resolveSeed(config({ seed: "#123456", seedSource: "systemAccent" }), context({ systemAccentAvailable: false }), {
      readSystemAccent: () => {
        throw new Error("must not be consulted when the platform reports no accent color")
      },
    })
    expect(unavailable).toEqual({ seed: "#123456", source: "systemAccent", fallback: true })

    // 对照组 2：平台说有，但 canvas 解析不出来 -> 仍然是 fallback。
    const unreadable = resolveSeed(config({ seed: "#123456", seedSource: "systemAccent" }), context(), { readSystemAccent: () => null })
    expect(unreadable).toEqual({ seed: "#123456", source: "systemAccent", fallback: true })
  })

  test("an unparseable configured seed falls back to the M3 baseline, not to black", () => {
    const result = resolveSeed(config({ seed: "nonsense", seedSource: "activeTheme" }), context({ activeThemeSeed: null }))
    expect(result.seed.toLowerCase()).toBe(MD3_BASELINE_SEED.toLowerCase())
    expect(result.fallback).toBe(true)
  })

  test("toSeedHex: lowercase normalisation, rejection of anything the browser can't parse", () => {
    expect(toSeedHex("#ABCDEF")).toBe("#abcdef")
    expect(toSeedHex("  #6750a4 ")).toBe("#6750a4")
    expect(toSeedHex(null)).toBeNull()
    expect(toSeedHex("")).toBeNull()
    // 用「一定解析不出来」的串，而不是带 alpha 的合法色：后者在有 canvas 的环境里会被量化成 hex，
    // 那条断言就会随环境翻面。
    expect(toSeedHex("not-a-color")).toBeNull()
  })

  test("seedSwatchPair gives the UI both schemes for one seed", () => {
    const pair = seedSwatchPair(config({ seed: "#6750a4" }))
    expect(pair.seed).toBe("#6750a4")
    expect(Object.keys(pair.light)).toEqual(Object.keys(pair.dark))
    expect(pair.light["--md-sys-color-primary"]).not.toBe(pair.dark["--md-sys-color-primary"])
  })
})
