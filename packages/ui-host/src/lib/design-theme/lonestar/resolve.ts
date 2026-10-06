/**
 * 孤星配方的 token 组装。
 *
 * 两条与另外三份配方不同的地方，都写在这里而不是散进 CSS：
 *  1. **切角不是 border-radius**。`--ls-cut-*` 是 clip-path 多边形的量，不是圆角半径；
 *     所以这一维关掉时必须**两条一起停**：既不发 `--ls-*`，也不让那条 clip-path 存在
 *     （未定义的 `var()` 会让 clip-path 整条失效，而 clip-path 的初始值是 `none` —— 这次恰好
 *     是「回到原样」，但下一句 CSS 不一定是，所以维度门一条都不许省）。
 *  2. **种子色只许带动「动作面」那一组槽**。`LONESTAR_SEED_RULE.frozenSlots` 里那七条
 *     （选区青与图表循环）永远不跟着变——那是「选中永远不是那个橙」这条律的代码形状。
 *     有专门的测试拿一个离谱种子（纯绿）撞这条，撞不过就是律没了。
 */

import { bestForeground } from "../contrast"
import {
  BRIDGED_COLOR_VARS,
  type DesignThemeConfig,
  type DesignThemeContext,
  type DesignThemeResolution,
} from "../contract"
import {
  LONESTAR_BRIDGED_COLORS,
  LONESTAR_BRIDGED_COLOR_SOURCES,
  LONESTAR_CUT_ATTR,
  LONESTAR_FIGURE_ATTR,
  LONESTAR_LABEL_ATTR,
  LONESTAR_SEED_ATTR,
  LONESTAR_SEED_FALLBACK_ATTR,
  LONESTAR_SEED_RULE,
  LONESTAR_SEED_SOURCE_ATTR,
  LONESTAR_TOKENS,
  LONESTAR_TOKEN_COUNT_ATTR,
  LONESTAR_CONTRACT_CUTS,
  type LoneStarToken,
} from "./spec"

export const LS_VAR = "--ls-"

/**
 * 种子只覆盖这六条——「动作面」那一组：主色、主色上的字、焦点环，以及侧栏里的同三件。
 * 前景不是记死的，是拿 `bestForeground` 现算的（默认种子算回 #16150F，与校准同值）。
 */
function seedSlots(seed: string): Record<string, string> {
  const primary = seed
  const onPrimary = bestForeground(seed, LONESTAR_SEED_RULE.foregroundCandidates)
  return {
    "--primary": primary,
    "--primary-foreground": onPrimary,
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": onPrimary,
    "--sidebar-ring": primary,
  }
}

export function resolveLoneStarTheme(config: DesignThemeConfig, context: DesignThemeContext): DesignThemeResolution {
  const { dimensions, lonestar } = config
  const scheme = context.scheme
  const vars: Record<string, string> = {}
  const attributes: Record<string, string> = {
    // 两个切角档一起披露：界面与浏览器测要能读出「面板 6 / 抬起块 12」而不是只看到一个数。
    [LONESTAR_CUT_ATTR]: `${LONESTAR_CONTRACT_CUTS.cutSm}/${LONESTAR_CONTRACT_CUTS.cutMd}`,
    [LONESTAR_LABEL_ATTR]: lonestar.uppercaseLabels ? "upper" : "plain",
    [LONESTAR_FIGURE_ATTR]: lonestar.monoFigures ? "mono" : "plain",
  }

  for (const token of LONESTAR_TOKENS as readonly LoneStarToken[]) {
    if (token.dimension === "color") continue
    if (!dimensions[token.dimension]) continue
    const base = scheme === "dark" ? token.dark : token.light
    // 这三条关的时候发「初始值那一侧的显式反义」而不是不发：
    // 不发会让 CSS 层那条声明落到初始值，效果一样但回读看不出这一维在做事。
    if (token.cssVar === "--ls-label-transform") {
      vars[token.cssVar] = lonestar.uppercaseLabels ? base : "none"
      continue
    }
    if (token.cssVar === "--ls-figure-variant") {
      vars[token.cssVar] = lonestar.monoFigures ? base : "normal"
      continue
    }
    if (token.cssVar === "--ls-figure-font") {
      vars[token.cssVar] = lonestar.monoFigures ? base : "inherit"
      continue
    }
    vars[token.cssVar] = base
  }

  let seed: string | null = null
  let seedSource: string | null = null
  let seedFallback: boolean | null = null

  if (dimensions.color) {
    const palette = LONESTAR_BRIDGED_COLORS[scheme] as Record<string, string>
    const sources = LONESTAR_BRIDGED_COLOR_SOURCES[scheme] as Record<string, string>
    const missing = BRIDGED_COLOR_VARS.filter((name) => !(name in palette))
    if (missing.length > 0) {
      throw new Error(`lonestar bridge: 色板缺 ${missing.join(", ")}——补进 spec.ts，不许发空变量`)
    }
    const unsource = BRIDGED_COLOR_VARS.filter((name) => !(name in sources))
    if (unsource.length > 0) {
      throw new Error(`lonestar bridge: ${unsource.join(", ")} 没有出处记录`)
    }
    Object.assign(vars, palette)

    seedSource = lonestar.seedSource
    const requested = lonestar.seedSource === "manual" ? lonestar.seed : context.activeThemeSeed
    // 「没换色」必须逐字节等于校准表，而不是等于大小写不同的同一个色：
    // 持久化边界把 hex 统一成小写，而表里抄的是上游写法。与武陵的 scale===1 走原值同一条纪律。
    const isCalibrationDefault = lonestar.seedSource === "manual"
      && typeof requested === "string"
      && requested.toLowerCase() === palette["--primary"].toLowerCase()
    if (requested && isCalibrationDefault) {
      // 用户没换色：这条路径**不走派生**，直接把校准表发出去，并如实报「没有回落」。
      seed = requested
      seedFallback = false
    } else if (requested) {
      seed = requested
      const derived = seedSlots(requested)
      const frozen = new Set<string>(LONESTAR_SEED_RULE.frozenSlots)
      const leaking = Object.keys(derived).filter((name) => frozen.has(name))
      if (leaking.length > 0) {
        throw new Error(`lonestar seed: ${leaking.join(", ")} 既在派生名单里又在 frozenSlots 里——「选中永远不是那个橙」这条律被打穿了`)
      }
      Object.assign(vars, derived)
      seedFallback = false
    } else {
      // 「跟随配色主题」但宿主没给出主色：如实回落，不拿别的颜色顶上。
      seed = lonestar.seedSource === "manual" ? lonestar.seed : palette["--primary"]
      seedFallback = true
    }

    // 逐槽直接映射：配色主题自己声明了的槽，主题值原样赢（与 MD3/武陵/Swiss 同一条规则）。
    const themeVars = context.themeColorVars
    if (themeVars) {
      for (const name of BRIDGED_COLOR_VARS) {
        const value = themeVars[name]
        if (typeof value === "string" && value.length > 0) vars[name] = value
      }
    }

    attributes[LONESTAR_SEED_ATTR] = seed
    attributes[LONESTAR_SEED_SOURCE_ATTR] = seedSource
    attributes[LONESTAR_SEED_FALLBACK_ATTR] = seedFallback ? "true" : "false"
  }

  attributes[LONESTAR_TOKEN_COUNT_ATTR] = String(Object.keys(vars).filter((name) => name.startsWith(LS_VAR)).length)

  return { bundle: { vars, attributes }, seed, seedSource, seedFallback }
}

/** 供测试与诊断面板用：token → 出处。 */
export function loneStarTokenProvenance(): Record<string, LoneStarToken> {
  return Object.fromEntries(LONESTAR_TOKENS.map((token) => [token.cssVar, token]))
}
