/**
 * Seed 的来源解析。规则只有一条：**解不出来必须说解不出来**。
 *
 * 三个来源（`Md3SeedSource`，`image` 不在其中——没人实现过的枚举值不进类型，见 contract）：
 * - `manual`：用户在设置里填的 `config.md3.seed`。
 * - `activeTheme`：颜色主题应用完之后，调用方读到的 `--primary`（`context.activeThemeSeed`）。
 *   引擎不去读 store，也不自己去碰 DOM——那是挂载组件的活。
 * - `systemAccent`：`AccentColor`，走 `domColor.ts` 的 1×1 canvas + 哨兵色路径。
 *   浏览器解析不出这个关键字时它返回 `null`，本平台是否支持由 `context.systemAccentAvailable`
 *   如实带上来（本模块不猜 webview 版本，见设计文档 §5 最后一条）。
 *
 * 任何来源解不出来都回落到 `config.md3.seed`，并把 `fallback: true` 带回去。
 * `fallback` 不是装饰：设置页的 SOURCE/FALLBACK 两行和 `data-md3-seed-fallback`
 * 就是它的展示位，「悄悄换个颜色」正是这条要防止的事。
 */

import { cssColorToHex, readSystemAccentColor } from "../domColor"
import { MD3_BASELINE_SEED, type DesignThemeConfig, type DesignThemeContext, type Md3SeedSource } from "../contract"
import { resolveColorRolePair, type Md3RolePair } from "./color"

export interface SeedResolution {
  /** 真正参与取色的 seed，永远是 `#rrggbb`。 */
  seed: string
  /** 用户要求的那个来源，不受回落影响——回落时它和实际用的来源是两件事。 */
  source: Md3SeedSource
  /** `true` = `source` 没解出来，用了 `config.md3.seed`。 */
  fallback: boolean
}

export interface SeedHost {
  /** 系统强调色。默认是 `domColor.readSystemAccentColor()`，测试里注入假实现。 */
  readSystemAccent: () => string | null
}

const HOST_DEFAULTS: SeedHost = { readSystemAccent: readSystemAccentColor }

const HEX_6 = /^#[0-9a-fA-F]{6}$/

/**
 * 把任意「浏览器认得的颜色字符串」收敛成 `#rrggbb`。
 * 已经是 hex 就直接用（不绕 canvas，避免大小写与量化被二次改写）；
 * 否则交给 `domColor.cssColorToHex` 解析 `oklch()` / `color-mix()` / 系统关键字，
 * 它解析不出来就返回 `null`，这里跟着一起判为「解不出来」。
 */
export function toSeedHex(value: string | null | undefined): string | null {
  const candidate = typeof value === "string" ? value.trim() : ""
  if (!candidate) return null
  if (HEX_6.test(candidate)) return `#${candidate.slice(1).toLowerCase()}`
  const resolved = cssColorToHex(candidate)
  return resolved === null ? null : resolved.toLowerCase()
}

/**
 * `seedSource` 要求的来源 -> 实际 seed。
 * @param host 只用于注入系统色读取，缺省走真实 DOM 路径。
 */
export function resolveSeed(
  config: DesignThemeConfig,
  context: DesignThemeContext,
  host: SeedHost = HOST_DEFAULTS,
): SeedResolution {
  // 连回落用的 seed 都不是颜色时（config 没经过 normalize 就直接调进来），
  // 用的是 contract 里的 M3 基线 primary，不是随手编的 hex。
  const fallbackSeed = toSeedHex(config.md3.seed) ?? MD3_BASELINE_SEED
  const source: Md3SeedSource = config.md3.seedSource

  if (source === "manual") {
    return { seed: fallbackSeed, source, fallback: false }
  }

  if (source === "activeTheme") {
    const seed = toSeedHex(context.activeThemeSeed)
    if (seed !== null) return { seed, source, fallback: false }
    // `--primary` 没读到 / 本机解析不出：如实报 fallback，不拿系统色或别的主题色顶上。
    return { seed: fallbackSeed, source, fallback: true }
  }

  // systemAccent：可用性由 context 说了算，返回值再兜一层（两者都可能判为不可用）。
  if (!context.systemAccentAvailable) return { seed: fallbackSeed, source, fallback: true }
  const seed = toSeedHex(host.readSystemAccent())
  if (seed !== null) return { seed, source, fallback: false }
  return { seed: fallbackSeed, source, fallback: true }
}

export interface SeedSwatchPair extends Md3RolePair {
  seed: string
}

/**
 * 给设置页的色板对照：同一个 seed 的明暗两套角色。
 * 这里只有数据，没有任何 UI 代码；渲染归界面层。
 */
export function seedSwatchPair(config: DesignThemeConfig, seed = config.md3.seed): SeedSwatchPair {
  const normalized = toSeedHex(seed) ?? config.md3.seed
  return {
    seed: normalized,
    ...resolveColorRolePair({
      seed: normalized,
      variant: config.md3.variant,
      contrastLevel: config.md3.contrastLevel,
    }),
  }
}
