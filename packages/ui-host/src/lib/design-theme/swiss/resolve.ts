/**
 * Swiss 配方的 token 组装。
 *
 * 发两份东西，与另外三条配方一样：
 *  1. `--sw-*` 自己的命名空间——CSS 层 `swiss-components.css` 只读这些；
 *  2. 桥接的 shadcn 变量（`--background`/`--primary`…），因为组件不认「Swiss」这个名字，只认语义槽。
 *
 * 三条结构约束（都可判定，不是偏好）：
 *  - **不读也不写颜色主题那一层的 `--swiss-*`**：设计语言与配色主题都往 `:root` inline 写，
 *    同名就会互相误认成对方的输出（`apply.ts` 里「解析必须在撤干净之后」为的是同一件事）。
 *  - **维度关掉就不发那一组变量**，也不写近似值。带未定义 `var()` 的声明会落到属性初始值
 *    （本仓 2026-10-05 实测过一次全界面直角），所以「关掉」只能是这条声明不存在 ＋ CSS 层的维度门。
 *    唯一的例外是 `--sw-label-transform`：它关时发 `none` 而不是不发，因为 `text-transform` 的
 *    初始值恰好也是 `none`，「不发」会让这一维的回读看不出自己在做事。
 *  - **不开放取色**。Swiss 只有那一个红，而它是功能信号色（SBB 的 brand/product 都等于 `red`）；
 *    留一个没人实现的 seed 开关就是下一个假绿。`SWISS_COLOR_POLICY` 把这句话写成数据，
 *    设置面板照实披露，而不是摆一个按下去什么都不变的控件。
 */

import {
  BRIDGED_COLOR_VARS,
  type DesignThemeConfig,
  type DesignThemeContext,
  type DesignThemeResolution,
} from "../contract"
import {
  SWISS_BRIDGED_COLORS,
  SWISS_BRIDGED_COLOR_SOURCES,
  SWISS_LABEL_ATTR,
  SWISS_RULE_ATTR,
  SWISS_RULE_WEIGHTS,
  SWISS_TOKENS,
  SWISS_TOKEN_COUNT_ATTR,
  type SwissRuleWeight,
  type SwissToken,
} from "./spec"

export const SW_VAR = "--sw-"

function ruleValue(weight: SwissRuleWeight): string {
  return SWISS_RULE_WEIGHTS[weight].value
}

export function resolveSwissTheme(config: DesignThemeConfig, context: DesignThemeContext): DesignThemeResolution {
  const { dimensions, swiss } = config
  const scheme = context.scheme
  const vars: Record<string, string> = {}
  const attributes: Record<string, string> = {
    [SWISS_RULE_ATTR]: ruleValue(swiss.ruleWeight),
    [SWISS_LABEL_ATTR]: swiss.uppercaseLabels ? "upper" : "plain",
  }

  for (const token of SWISS_TOKENS as readonly SwissToken[]) {
    if (token.dimension === "color") continue
    if (!dimensions[token.dimension]) continue
    const base = scheme === "dark" ? token.dark : token.light
    if (token.cssVar === "--sw-rule-structural") {
      // 结构线宽度是选项，不是表里的固定档：表里那格放的是默认档（1|2|4 都各自有出处）。
      vars[token.cssVar] = ruleValue(swiss.ruleWeight)
      continue
    }
    if (token.cssVar === "--sw-label-transform") {
      vars[token.cssVar] = swiss.uppercaseLabels ? base : "none"
      continue
    }
    vars[token.cssVar] = base
  }

  if (dimensions.color) {
    const palette = SWISS_BRIDGED_COLORS[scheme] as Record<string, string>
    const sources = SWISS_BRIDGED_COLOR_SOURCES[scheme] as Record<string, string>
    const missing = BRIDGED_COLOR_VARS.filter((name) => !(name in palette))
    if (missing.length > 0) {
      throw new Error(`swiss bridge: 色板缺 ${missing.join(", ")}——补进 spec.ts，不许发空变量`)
    }
    const unsource = BRIDGED_COLOR_VARS.filter((name) => !(name in sources))
    if (unsource.length > 0) {
      throw new Error(`swiss bridge: ${unsource.join(", ")} 没有出处记录——「每条值带出处」不是装饰`)
    }
    Object.assign(vars, palette)

    // 逐槽直接映射（与 MD3/武陵同一条规则）：配色主题自己声明了的槽，主题值原样赢。
    const themeVars = context.themeColorVars
    if (themeVars) {
      for (const name of BRIDGED_COLOR_VARS) {
        const value = themeVars[name]
        if (typeof value === "string" && value.length > 0) vars[name] = value
      }
    }
  }

  attributes[SWISS_TOKEN_COUNT_ATTR] = String(Object.keys(vars).filter((name) => name.startsWith(SW_VAR)).length)

  // 三条取色诊断字段一律 null：这条配方没有 seed 概念，`apply.ts` 因此不会写 `data-*-seed`。
  return { bundle: { vars, attributes }, seed: null, seedSource: null, seedFallback: null }
}

/** 供测试与诊断面板用：token → 出处。 */
export function swissTokenProvenance(): Record<string, SwissToken> {
  return Object.fromEntries(SWISS_TOKENS.map((token) => [token.cssVar, token]))
}
