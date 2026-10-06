/**
 * 只有对比度数学，没有 DOM。
 *
 * 存在的理由是一条真实的接线：孤星配方允许用户指定主色，而那条律说「橙只留给机械交互」——
 * 换色之后主色上的字必须仍然读得出来，所以「配哪个前景」不能靠人记，要现算。
 * 顺手也用来把两条新配方的关键色对（文字/底、动作面/面前景）钉在 WCAG AA 上，
 * 而不是「看着挺清楚」。
 *
 * 公式就是 WCAG 2.1 的相对亮度与对比度比值（sRGB、D65、无线性化捷径）。
 */

function channelLinear(value8bit: number): number {
  const s = value8bit / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** `#rrggbb` → 相对亮度；解不出来直接抛，不静默当黑色算。 */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex)
  if (!match) throw new Error(`relativeLuminance: 不是 #rrggbb —— ${JSON.stringify(hex)}`)
  const [, r, g, b] = match
  return 0.2126 * channelLinear(Number.parseInt(r as string, 16))
    + 0.7152 * channelLinear(Number.parseInt(g as string, 16))
    + 0.0722 * channelLinear(Number.parseInt(b as string, 16))
}

/** 两个不透明色之间的对比度（1…21）。 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** 在候选里选与 `background` 对比更高的一支；平票取先出现的那支（确定性优先于好看）。 */
export function bestForeground(background: string, candidates: readonly string[]): string {
  let best = candidates[0]
  let bestRatio = -1
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background)
    if (ratio > bestRatio) {
      best = candidate
      bestRatio = ratio
    }
  }
  if (best === undefined) throw new Error("bestForeground: 候选是空的")
  return best
}
