/**
 * 武陵配方的 token 组装。
 *
 * 输出两份东西，和另外两条配方一样：
 *  1. `--wl-*` 自己的命名空间（形状/层级/排版/动效/状态/几何），CSS 层 `wuling-components.css` 只读这些；
 *  2. 桥接的 shadcn 变量——组件不认「武陵」这个名字，只认 `--primary`/`--card`。
 *
 * 三条结构约束（都不是审美偏好，是可判定的）：
 *  - **配方不改预设文件，也不读预设的 `--wuling-*`**。预设是颜色主题那一层，配方是设计语言那一层，
 *    两者都往 `:root` inline 写就会互相误认成对方的输出（`apply.ts` 里那条「解析必须在撤干净之后」
 *    就是为了这个）。所以这里发的是 `--wl-*`，值从 `spec.ts` 的表来。
 *  - **维度关掉就不发那一组变量**，不写近似值、不写 0。带未定义 `var()` 的声明会落到属性初始值
 *    （本仓 2026-10-05 实测过一次：`--radius` 缺失使全界面直角），所以「关掉」的正确形状是
 *    「这一条不存在」+ CSS 层的维度门。
 *  - **形状缩放用 `calc()` 乘档位**，不重排阶梯：`1.25×` 之后 4px 变 5px 是刻意的连续变化，
 *    阶梯重排会让「角半径档位」这一维变成另一件事。
 */

import {
  BRIDGED_COLOR_VARS,
  type DesignThemeConfig,
  type DesignThemeContext,
  type DesignThemeResolution,
} from "../contract"
import {
  WULING_CORNER_ATTR,
  WULING_LABEL_ATTR,
  WULING_PRESET_COLORS,
  WULING_PRESET_COLOR_LINES,
  WULING_SEED_ATTR,
  WULING_SEED_FALLBACK_ATTR,
  WULING_SEED_RULE,
  WULING_SEED_SOURCE_ATTR,
  WULING_TOKENS,
  WULING_TOKEN_COUNT_ATTR,
  type WulingToken,
} from "./spec"
import { Hct, TonalPalette, argbFromHex, hexFromArgb } from "@material/material-color-utilities"

export const WL_VAR = "--wl-"

/** 词表（给门禁与诊断面板用）；发射的名字全部来自 `WULING_TOKENS`，不留第二份手抄名单。 */
export const WULING_TOKEN_NAMES: readonly string[] = WULING_TOKENS.map((token) => token.cssVar)

function scaleCorner(value: string, scale: number): string {
  // 档位 1 就发原值：界面上「没缩放」必须与缩放前逐字节相同，否则任何一条 `toBe("8px")` 的断言都会漂。
  if (scale === 1) return value
  return `calc(${value} * ${scale})`
}

/**
 * 按写死的规则从种子色派生主色槽（见 `spec.ts` 的 `WULING_SEED_RULE`）。
 *
 * 用 MCU 的 `TonalPalette` 而不是手调 oklch：这一档要能被任何人重跑复现，
 * 而「取 tone 60 / 80」正是预设实测到的 oklch 明度（0.72 / 0.80）在 MCU 音阶上的对应档。
 */
function seedSlots(seed: string, scheme: "light" | "dark"): Record<string, string> {
  const hct = Hct.fromInt(argbFromHex(seed))
  const tone = scheme === "dark" ? WULING_SEED_RULE.darkTone : WULING_SEED_RULE.lightTone
  const primary = hexFromArgb(TonalPalette.fromHct(hct).tone(tone))
  return {
    "--primary": primary,
    "--primary-foreground": scheme === "dark" ? WULING_SEED_RULE.onDark : WULING_SEED_RULE.onLight,
    // ring 在预设里与 primary 同值（wuling.css:38 与 :26 是同一个 oklch），派生时保持这条事实。
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": scheme === "dark" ? WULING_SEED_RULE.onDark : WULING_SEED_RULE.onLight,
    "--sidebar-ring": primary,
  }
}

export function resolveWulingTheme(config: DesignThemeConfig, context: DesignThemeContext): DesignThemeResolution {
  const { dimensions, wuling } = config
  const scheme = context.scheme
  const vars: Record<string, string> = {}
  const attributes: Record<string, string> = {
    [WULING_CORNER_ATTR]: String(wuling.cornerScale),
    [WULING_LABEL_ATTR]: wuling.ledgerLabels ? "ledger" : "plain",
  }

  // 非颜色 token：逐维度决定发不发（`states` 也算颜色相关的除外——那些值是 color-mix 里的主色比例，
  // 主色由谁定都跟着走，所以归 states 管）。
  const emit = new Map<string, boolean>([
    ["shape", dimensions.shape],
    ["elevation", dimensions.elevation],
    ["typography", dimensions.typography],
    ["motion", dimensions.motion],
    ["states", dimensions.states],
    ["geometry", dimensions.geometry],
  ])

  for (const token of WULING_TOKENS as readonly WulingToken[]) {
    if (token.dimension === "color") continue
    if (emit.get(token.dimension) !== true) continue
    const base = scheme === "dark" ? token.dark : token.light
    if (token.dimension === "shape") {
      vars[token.cssVar] = scaleCorner(base, wuling.cornerScale)
      continue
    }
    // 账本式大写标签是可关的：关掉就发 `none`，而不是不发——`--wl-label-transform` 不发会让
    // CSS 层那条声明落到初始值 `none`，效果一样但「这一维在做事」的回读就丢了。
    if (token.cssVar === "--wl-label-transform") {
      vars[token.cssVar] = wuling.ledgerLabels ? base : "none"
      continue
    }
    vars[token.cssVar] = base
  }

  let seed: string | null = null
  let seedSource: string | null = null
  let seedFallback: boolean | null = null

  if (dimensions.color) {
    const presetColors = WULING_PRESET_COLORS[scheme] as Record<string, string>
    const missing = BRIDGED_COLOR_VARS.filter((name) => !(name in presetColors))
    if (missing.length > 0) {
      throw new Error(`wuling bridge: 预设色板缺 ${missing.join(", ")}——补进 spec.ts 或在这里显式派生，不许发空变量`)
    }
    Object.assign(vars, presetColors)

    // 取色：`manual` 用用户指定的种子，`activeTheme` 用当前配色主题的主色；两者走同一条派生规则。
    // 解不出来就**如实回落**到预设值并打上 fallback 标记，不拿别的颜色顶上。
    seedSource = wuling.seedSource
    const requested = wuling.seedSource === "manual" ? wuling.seed : context.activeThemeSeed
    if (requested) {
      seed = requested
      Object.assign(vars, seedSlots(requested, scheme))
      seedFallback = false
    } else {
      seed = wuling.seedSource === "manual" ? wuling.seed : presetColors["--primary"]
      seedFallback = true
    }

    // 逐槽直接映射（与 MD3 同一条规则）：配色主题自己声明了的槽，主题值原样赢。
    const themeVars = context.themeColorVars
    if (themeVars) {
      for (const name of BRIDGED_COLOR_VARS) {
        const value = themeVars[name]
        if (typeof value === "string" && value.length > 0) vars[name] = value
      }
    }

    attributes[WULING_SEED_ATTR] = seed
    attributes[WULING_SEED_SOURCE_ATTR] = seedSource
    attributes[WULING_SEED_FALLBACK_ATTR] = seedFallback ? "true" : "false"
  }

  attributes[WULING_TOKEN_COUNT_ATTR] = String(Object.keys(vars).filter((name) => name.startsWith(WL_VAR)).length)

  return { bundle: { vars, attributes }, seed, seedSource, seedFallback }
}

/** 供测试与诊断面板用：token → 出处。*/
export function wulingTokenProvenance(): Record<string, WulingToken> {
  return Object.fromEntries(WULING_TOKENS.map((token) => [token.cssVar, token]))
}

/** 反向核对用的行号表（`spec.test.ts` 会拿它去读预设原文）。 */
export const WULING_PRESET_COLOR_LINES_TABLE = WULING_PRESET_COLOR_LINES
