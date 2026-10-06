/**
 * 设计语言 → 宿主 token 的那一层（唯一的一条主题缝）。
 *
 * 三件事必须先说清楚，因为这一层上一次是错的：
 *
 * 1. **`ctx.theme.overrideTokens` 的键是宿主自己的 `--dsw-alias-*` 名字，不是我们的。**
 *    装的这份 0.2.0-rc.2 的类型逐字写着 `ThemeTokens = Record<string, string>` 的注释是
 *    "Theme token dictionary: --dsw-alias-* overrides keyed by variable name"，而
 *    `overrideTokens(source, tokens)` 收 `Record<name, {light, dark}>`。
 *    我上一版（`theme/material-you.ts`，已删）把 `--xaihi-*` 当名字喂给它，
 *    那一层因此**从未生效过**——`docs/stages/step-4.md` §21 实测过同一家族：
 *    照前缀规律拼出来的名字在真宿主里逐个 `(unset)`。
 * 2. **名字只许现读，不许拼。** 目录由 `ctx.theme.exportInspectTokens()` 给
 *    （注释逐字："Export the current token directory without reading DOM or computed styles"）。
 *    本模块只接受"在这份目录里真的存在"的名字；不在的一律进 `absent` 桶，
 *    由调用方如实报出来，而不是悄悄少一层颜色。
 * 3. **颜色只有一个来源，就是搬进来的那台引擎。** 值全部出自
 *    `src/lib/design-theme/registry.ts` 的 `resolveDesignTheme`，这里不出现任何硬编码 hex，
 *    也不再引 `@material/material-color-utilities`（那是引擎内部的依赖，不是接缝的）。
 *    `native` 配方 ⇒ 这一层完全不存在：把某一份候选提成默认等于替使用者做选择。
 *
 * `description` 只用来**交叉核对语义**（名字对了但角色写的是别的用途，要看得见），
 * 判据仍然是"在不在目录里"——名字才是权威，描述可能漂。
 *
 * @module xaihi-ui/client/theme/design-language
 */

import { DEFAULT_DESIGN_THEME, type DesignThemeConfig } from '../../lib/design-theme/contract'
import { resolveDesignThemeForSchemes } from './engine'

/** `ctx.theme.exportInspectTokens()` 返回的那一条的最小子集（本模块只用到这三个字段）。 */
export interface DswTokenDescriptor {
  name: string
  description?: string
}

/**
 * 一个设计语言角色 → 宿主别名名的候选对。
 *
 * `dswName` 全部来自实测（`docs/stages/step-4.md` §21 那张表，遍历真宿主的 107 个
 * `--dsw-alias*` / `--dsw-specific*` 名字得到），**不是**按前缀规律拼的。
 * `roleWords` 是描述里应当出现的词，用来发现"名字撞对了但语义其实不是这回事"。
 */
export interface HostRole {
  /** 设计语言侧的变量名（`BRIDGED_COLOR_VARS` 的成员）。 */
  designVar: string
  /** 宿主侧的别名 token 名。 */
  dswName: string
  /** `description` 里至少要命中一个，否则进 `unconfirmed`。 */
  roleWords: readonly string[]
}

export const HOST_ROLES: readonly HostRole[] = [
  { designVar: '--background', dswName: '--dsw-alias-bg-layer-1', roleWords: ['background', 'surface', 'layer'] },
  { designVar: '--card', dswName: '--dsw-alias-bg-layer-2', roleWords: ['elevat', 'layer', 'card', 'surface'] },
  { designVar: '--foreground', dswName: '--dsw-alias-label-primary', roleWords: ['label', 'text', 'foreground'] },
  { designVar: '--muted-foreground', dswName: '--dsw-alias-label-secondary', roleWords: ['label', 'text', 'second'] },
  { designVar: '--border', dswName: '--dsw-alias-border-l2', roleWords: ['border', 'outline', 'divider'] },
  { designVar: '--destructive', dswName: '--dsw-alias-state-error-primary', roleWords: ['error', 'destruct', 'danger'] },
  { designVar: '--accent', dswName: '--dsw-alias-interactive-bg-hover', roleWords: ['hover', 'interact', 'accent'] },
]

/** 一层的产出：要交给 `overrideTokens` 的东西，加上"为什么少了"的三个桶。 */
export interface DesignHostLayer {
  /** 交给 `ctx.theme.overrideTokens` 的第一参数（层身份）。 */
  source: string
  /** token 名 → 明暗两值；DSH 自己是明暗的拥有者，所以两值都必须给。 */
  tokens: Record<string, { light: string; dark: string }>
  applied: string[]
  /** 目录里有这个名字，但 description 里一个角色词都没命中：应用了，但要看得见。 */
  unconfirmed: string[]
  /** 目录里根本没有这个名字：不应用，也不假装应用。 */
  absent: string[]
  /** 配方是 native（或引擎没发这个槽）时整层为空，但仍然要能读出口径。 */
  recipe: DesignThemeConfig['id']
}

/** 层身份：宿主 Plugins 页与 `theme/change` 里都以此名归属。 */
export const DESIGN_LAYER_SOURCE = 'xaihi.design-language'

/**
 * 把某一份设计语言配方叠到宿主别名上。
 *
 * @param config - 归一化后的设计语言配置（`normalizeDesignThemeConfig` 的形状）。
 * @param directory - `ctx.theme.exportInspectTokens()` 的原样返回。
 */
export function designHostLayer(
  config: DesignThemeConfig = DEFAULT_DESIGN_THEME,
  directory: readonly DswTokenDescriptor[] = [],
): DesignHostLayer {
  const known = new Map(directory.map((token) => [token.name, token.description ?? '']))
  const empty: DesignHostLayer = {
    source: DESIGN_LAYER_SOURCE,
    tokens: {},
    applied: [],
    unconfirmed: [],
    absent: HOST_ROLES.map((role) => role.dswName).filter((name) => !known.has(name)),
    recipe: config.id,
  }
  if (config.id === 'native') return { ...empty, tokens: {}, applied: [], unconfirmed: [] }

  const { light, dark } = resolveDesignThemeForSchemes(config)
  const layer: DesignHostLayer = { ...empty, tokens: {}, applied: [], unconfirmed: [], absent: [] }
  for (const role of HOST_ROLES) {
    const value = { light: light[role.designVar], dark: dark[role.designVar] }
    if (value.light === undefined || value.dark === undefined) {
      // 引擎没发这一槽就是"这条配方不管颜色这一维"，不是名字的问题。
      layer.absent.push(`${role.dswName}（引擎未发 ${role.designVar}）`)
      continue
    }
    if (!known.has(role.dswName)) {
      layer.absent.push(role.dswName)
      continue
    }
    layer.tokens[role.dswName] = value
    layer.applied.push(role.dswName)
    const description = (known.get(role.dswName) ?? '').toLowerCase()
    if (description.length > 0 && !role.roleWords.some((word) => description.includes(word.toLowerCase()))) {
      layer.unconfirmed.push(role.dswName)
    }
  }
  return layer
}
