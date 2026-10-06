/**
 * Material You 桥：一个 seed 算出 Xaihi 别名层的值，交给 DSH 的主题覆盖缝。
 *
 * 边界（D6 定的）：Xaihi **没有第二套主题引擎**。明暗模式、token 分层、切换时机全归
 * `ctx.theme`；这里只产出 `Record<别名, {light, dark}>` 然后
 * `ctx.theme.overrideTokens('xaihi.md3', …)` 叠一层。壳的 CSS 一律写
 * `var(--xaihi-*, var(--dsw-alias-*))`，所以这一层缺席时宿主原样回落，不会花屏。
 *
 * 数值只有一个来源：`@material/material-color-utilities@0.4.0` 的 `DynamicScheme`。
 * 这里不出现任何硬编码角色 hex，也不抄文档站示例值。light 与 dark 是同一个 seed 的两次
 * `DynamicScheme`（`isDark` 不同），不是把 hex 取反。
 *
 * 访问形态照 Xiranite `src/lib/design-theme/md3/color.ts` 实测过的那条路：0.4.0 的
 * `MaterialDynamicColors` 静态成员几乎全部 `@deprecated`，所以一律走实例方法。
 *
 * @module xaihi-ui/theme/material-you
 */

import { argbFromHex, DynamicScheme, Hct, hexFromArgb, MaterialDynamicColors, Variant } from '@material/material-color-utilities'

/** 默认 seed；用户可配的 seed 是下一步（那需要设置面，见阶段文档）。 */
export const DEFAULT_SEED = '#6750a4'

/** 用的取色方案：FIDELITY 保色相最接近 seed，适合"一个 seed 一套壳"。 */
export const SCHEME_VARIANT = Variant.FIDELITY

/**
 * Xaihi 别名 → MCU 实例访问器名。
 *
 * 这张表是"壳用了哪些别名"的一侧；另一侧是 `styles.ts` 里的 `var(--xaihi-*)`。
 * 两边不一致由 `tests/theme.spec.ts` 的覆盖率断言抓住，不靠人记得同步。
 */
export const ALIAS_ACCESSORS: Record<string, string> = {
  '--xaihi-surface': 'surface',
  '--xaihi-on-surface': 'onSurface',
  '--xaihi-on-surface-variant': 'onSurfaceVariant',
  '--xaihi-outline': 'outline',
  '--xaihi-secondary-container': 'secondaryContainer',
  '--xaihi-on-secondary-container': 'onSecondaryContainer',
  '--xaihi-primary': 'primary',
  '--xaihi-on-primary': 'onPrimary',
  '--xaihi-error': 'error',
}

/** 一个 seed 在明暗两套下的全部别名值；DSH 的覆盖层要求两个模式都给，缺一个就抛。 */
export interface AliasModes {
  light: string
  dark: string
}

function colorsFor(seed: string, isDark: boolean): Record<string, string> {
  // 0.4.0 的 DynamicScheme 收的是 `sourceColorHct`（不是 argb），这里不猜参数名：
  // 类型少一个都会红，所以构造形状是编译器认可的。
  const scheme = new DynamicScheme({
    sourceColorHct: Hct.fromInt(argbFromHex(seed)),
    variant: SCHEME_VARIANT,
    isDark,
    contrastLevel: 0,
  })
  const colors: Record<string, string> = {}
  const table = MaterialDynamicColors as unknown as Record<string, { getArgb: (scheme: DynamicScheme) => number }>
  for (const accessor of Object.values(ALIAS_ACCESSORS)) {
    const dynamicColor = table[accessor]
    if (dynamicColor === undefined) {
      // 访问器不在了就是依赖换版了，宁可直接炸也别悄悄少一层颜色。
      throw new Error(`material-color-utilities has no role "${accessor}"`)
    }
    colors[accessor] = hexFromArgb(dynamicColor.getArgb(scheme))
  }
  return colors
}

/**
 * 产出可直接交给 `ctx.theme.overrideTokens` 的一层。
 * @param seed - `#rrggbb`。
 * @returns 别名 → 明暗两值。
 */
export function xaihiMd3Layer(seed: string = DEFAULT_SEED): Record<string, AliasModes> {
  const light = colorsFor(seed, false)
  const dark = colorsFor(seed, true)
  const layer: Record<string, AliasModes> = {}
  for (const [alias, accessor] of Object.entries(ALIAS_ACCESSORS)) {
    layer[alias] = { light: light[accessor] as string, dark: dark[accessor] as string }
  }
  return layer
}
