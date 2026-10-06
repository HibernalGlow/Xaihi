/**
 * 引擎的两次求值：同一份配方，明暗各算一遍。
 *
 * 为什么要有这一层薄壳而不是在接缝里直接调 `resolveDesignTheme`：
 * DSH 的 `overrideTokens` 一次要收 `{light, dark}` **两个**值
 * （`ThemeTokenModes` 的注释逐字："both palette modes are mandatory"），
 * 而上游引擎一次只出一个 scheme。所以"两个模式"这件事必须在这里凑齐，
 * 并且**是同一个 seed 的两次求值**，不是把 hex 取反。
 *
 * 上游 `applyDesignTheme` 不引用它，是因为那一半写 `document.documentElement`
 * （`:root` 选择器实测占 1214 条 data 属性规则里的 535 条），那是"工作台自己的 DOM"
 * 那一步的事；这一层只负责把值算出来，不碰 DOM。
 *
 * @module xaihi-ui/client/theme/engine
 */

import type { DesignThemeConfig, DesignThemeContext } from '../../lib/design-theme/contract'
import { resolveDesignTheme } from '../../lib/design-theme/registry'

/** 一台配方的明暗两套变量；缺槽就是 `undefined`，由调用方如实记账，不当成黑色。 */
export interface SchemeVars {
  light: Record<string, string | undefined>
  dark: Record<string, string | undefined>
}

/**
 * @param config - 归一化后的设计语言配置。
 * @param context - 除 `scheme` 之外的外部输入（seed 来源、系统主色是否可用）。
 */
export function resolveDesignThemeForSchemes(
  config: DesignThemeConfig,
  context: Omit<DesignThemeContext, 'scheme'> = { activeThemeSeed: null, systemAccentAvailable: false },
): SchemeVars {
  const out: Record<'light' | 'dark', Record<string, string | undefined>> = { light: {}, dark: {} }
  for (const scheme of ['light', 'dark'] as const) {
    const resolution = resolveDesignTheme(config, { ...context, scheme })
    out[scheme] = { ...(resolution?.bundle.vars ?? {}) }
  }
  return out
}
