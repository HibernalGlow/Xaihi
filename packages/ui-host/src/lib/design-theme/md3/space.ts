/**
 * Material 3 间距阶梯（`--md-sys-space-*`）。
 *
 * 为什么这份表单独存在，而 `tokens.generated.ts` 里没有它：
 * 稳定版字典 `@material/web/tokens/versions/v0_192/` **没有** spacing 组（M3 的间距
 * 是 Expressive 世代才作为 token 发布的），Google 把 CSS 形态的间距表放在同包的
 * `labs/gb/styles/space/md-space-tokens.scss` 里：一条 `--md-sys-space-unit: 8px`
 * 加 18 条 `calc(unit × 系数)`。本模块照抄那一份，不自己发明档位。
 *
 * 数值一律保持上游那两条表达式形态（unit + calc），这样「改 unit 就整档缩放」
 * 这个 M3 语义留在 CSS 里，而不是被我预先算成像素。
 */

/** 与 `labs/gb/styles/space/md-space-tokens.scss` 的系数一一对应。 */
export const MD3_SPACE_UNIT_VALUE = "8px"

/** 与 `labs/gb/styles/space/md-space-tokens.scss` 的系数一一对应。 */
export const MD3_SPACE_STEPS: Readonly<Record<string, string>> = {
  "0": "0",
  "25": "0.25",
  "50": "0.5",
  "75": "0.75",
  "100": "1",
  "125": "1.25",
  "150": "1.5",
  "175": "1.75",
  "200": "2",
  "250": "2.5",
  "300": "3",
  "400": "4",
  "450": "4.5",
  "500": "5",
  "600": "6",
  "700": "7",
  "800": "8",
  "900": "9",
}

/** 发成 CSS 变量：`--md-sys-space-unit` + 每个档位一条 calc()。 */
export function md3SpaceVars(): Record<string, string> {
  const vars: Record<string, string> = { "--md-sys-space-unit": MD3_SPACE_UNIT_VALUE }
  for (const [step, multiplier] of Object.entries(MD3_SPACE_STEPS)) {
    vars[`--md-sys-space-${step}`] = multiplier === "1"
      ? "var(--md-sys-space-unit)"
      : `calc(var(--md-sys-space-unit) * ${multiplier})`
  }
  return vars
}
