/**
 * 高级主题注册表：id → 元数据 + 解析器。
 *
 * `native` 不是「没找到主题」的兜底分支，它是一条真实的注册项，语义是
 * 「本维度不接管，沿用颜色主题与既有组件样式」。把它写成数据而不是 if，
 * 是为了让第二个设计语言（如果以后真的要做）只能再加一条注册项，
 * 而不是在 apply/设置页各加一个分支。
 */

import type { DesignDimension } from "./contract"
import { DESIGN_DIMENSIONS, type DesignThemeConfig, type DesignThemeContext, type DesignThemeResolution, type AppDesignThemeId } from "./contract"
import { resolveMd3Theme } from "./md3/resolve"
import { resolveMondrianTheme } from "./mondrian/resolve"
import { resolveWulingTheme } from "./wuling/resolve"
import { resolveSwissTheme } from "./swiss/resolve"
import { resolveLoneStarTheme } from "./lonestar/resolve"

export interface DesignThemeEntry {
  id: AppDesignThemeId
  /** i18n key（`settings:` 命名空间），同时喂选择器与搜索索引。 */
  labelKey: string
  descriptionKey: string
  /** 这个主题真的能接管的维度；不在列表里的维度，界面上就不该出现开关。 */
  ownsDimensions: readonly DesignDimension[]
}

const ALL: readonly DesignDimension[] = DESIGN_DIMENSIONS

export const DESIGN_THEME_ENTRIES: readonly DesignThemeEntry[] = [
  {
    id: "native",
    labelKey: "settings:designTheme.native.label",
    descriptionKey: "settings:designTheme.native.description",
    ownsDimensions: [],
  },
  {
    id: "md3",
    labelKey: "settings:designTheme.md3.label",
    descriptionKey: "settings:designTheme.md3.description",
    ownsDimensions: ALL,
  },
  {
    id: "mondrian",
    labelKey: "settings:designTheme.mondrian.label",
    descriptionKey: "settings:designTheme.mondrian.description",
    ownsDimensions: ALL,
  },
  {
    // 2026-10-06 用户裁定「主题预设和设计语言合并了」的后半：武陵不再只是一个配色预设。
    // 它接管七个维度，但**值来自它自己那份预设的实测**（`wuling/spec.ts` 逐条带行号），
    // 所以默认档位下画面不许与旧预设不同——那是「保留现有的预设的风格」的可验证形式。
    id: "wuling",
    labelKey: "settings:designTheme.wuling.label",
    descriptionKey: "settings:designTheme.wuling.description",
    ownsDimensions: ALL,
  },
  {
    // 第四份配方：瑞士国际主义。**唯一一份「值来自另一个公司的公开规范」**（SBB 5.2.0）的配方，
    // 所以它没有取色开关——只有一个红，而那个红是功能信号色（见 swiss/spec.ts 的 SWISS_COLOR_POLICY）。
    id: "swiss",
    labelKey: "settings:designTheme.swiss.label",
    descriptionKey: "settings:designTheme.swiss.description",
    ownsDimensions: ALL,
  },
  {
    // 第五份配方：孤星。色值不是官方发布的，是一份**已经落过一遍的校准**（Kisaki），
    // 设置面板照实披露这件事；它自带取色，但默认不跟随配色主题，理由见 contract 的 LoneStarOptions。
    id: "lonestar",
    labelKey: "settings:designTheme.lonestar.label",
    descriptionKey: "settings:designTheme.lonestar.description",
    ownsDimensions: ALL,
  },
]

export function designThemeById(id: AppDesignThemeId): DesignThemeEntry | undefined {
  return DESIGN_THEME_ENTRIES.find((entry) => entry.id === id)
}

export function resolveDesignTheme(
  config: DesignThemeConfig,
  context: DesignThemeContext,
): DesignThemeResolution | null {
  switch (config.id) {
    case "md3":
      return resolveMd3Theme(config, context)
    case "mondrian":
      return resolveMondrianTheme(config, context)
    case "wuling":
      return resolveWulingTheme(config, context)
    case "swiss":
      return resolveSwissTheme(config, context)
    case "lonestar":
      return resolveLoneStarTheme(config, context)
    case "native":
    default:
      // default 与 native 合并是刻意的：未知 id 在 normalize 阶段就回 native 了，
      // 走到这里只可能是调用方传了未注册的 id，此时必须是什么都不接管。
      return null
  }
}
