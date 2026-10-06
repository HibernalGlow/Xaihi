/**
 * Material You 桥的判据。
 *
 * 期望值一律不通过再调一次被测函数得到，而是钉 M3 的**性质**：格式、明暗翻转、
 * 亮度次序、seed 敏感性、以及"壳里用到的别名必须都有值"的跨文件覆盖率。
 * 覆盖率那条是唯一能抓住"有人加了 --xaihi-* 却忘了配值"的尺。
 *
 * @module xaihi-ui/tests/theme
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MaterialDynamicColors } from '@material/material-color-utilities'
import { describe, expect, it } from 'vitest'
import { ALIAS_ACCESSORS, xaihiMd3Layer, type AliasModes } from '../src/client/theme/material-you.ts'

const layer = xaihiMd3Layer()
const HEX = /^#[0-9a-f]{6}$/

/** 取某个别名的某一模式值；缺了就红，而不是把 undefined 喂给断言。 */
function mode(alias: string, which: keyof AliasModes): string {
  const value = (layer[alias] as AliasModes | undefined)?.[which]
  expect(value, `${alias}.${which} 没有值`).toBeTypeOf('string')
  return value as string
}

/** WCAG 相对亮度：只用来判"明暗有没有真的分开"，不当成颜色真源。 */
function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5]
    .map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** WCAG 2.1 对比度：(L1+0.05)/(L2+0.05)。这是 R2 的尺，不是设计真源。 */
function contrast(first: string, second: string): number {
  const a = luminance(first)
  const b = luminance(second)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/** kit 里实际并排出现的文字配对（面板正文 13px、说明 12px ⇒ 都按 AA 的 4.5 判）。 */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ['--xaihi-surface', '--xaihi-on-surface', '卡片正文'],
  ['--xaihi-surface', '--xaihi-on-surface-variant', '卡片里的说明文字'],
  ['--xaihi-surface', '--xaihi-error', '错误状态行'],
  ['--xaihi-surface', '--xaihi-primary', 'text 变体按钮的字'],
  ['--xaihi-primary', '--xaihi-on-primary', 'filled 按钮'],
  ['--xaihi-secondary-container', '--xaihi-on-secondary-container', 'tonal 按钮'],
]

describe('material you 桥', () => {
  it('每个别名都给齐明暗两值，且都是 #rrggbb', () => {    const aliases = Object.keys(layer)
    expect(aliases.length).toBeGreaterThan(5)
    for (const alias of aliases) {
      expect(HEX.test(mode(alias, 'light')), alias).toBe(true)
      expect(HEX.test(mode(alias, 'dark')), alias).toBe(true)
    }
  })

  it('覆盖率：styles.ts 里用到的每个 --xaihi-* 都必须有值', () => {
    // 见 purity.spec.ts：happy-dom 下 import.meta.url 不是 file: 形态，dirname 才是两种环境都对的基准。
    const css = readFileSync(join(import.meta.dirname, '../src/client/styles.ts'), 'utf8')
    const used = [...new Set([...css.matchAll(/--xaihi-[a-z-]+/g)].map((match) => match[0]))]
      .filter((name) => name !== '--xaihi-')
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) {
      expect(layer[name], `样式用了 ${name} 但桥没配值`).toBeDefined()
    }
  })

  it('明暗是真分支：surface 变暗、onSurface 变亮', () => {
    expect(luminance(mode('--xaihi-surface', 'light')))
      .toBeGreaterThan(luminance(mode('--xaihi-surface', 'dark')))
    expect(luminance(mode('--xaihi-on-surface', 'light')))
      .toBeLessThan(luminance(mode('--xaihi-on-surface', 'dark')))
    expect(mode('--xaihi-surface', 'light')).not.toBe(mode('--xaihi-surface', 'dark'))
  })

  it('primary 带彩度（在 seed 的色相家族里，不是灰）', () => {
    const primary = mode('--xaihi-primary', 'light')
    const channels = [1, 3, 5].map((at) => Number.parseInt(primary.slice(at, at + 2), 16))
    expect(new Set(channels).size).toBeGreaterThan(1)
  })

  it('阳性对照：换 seed 必须换值', () => {
    const other = xaihiMd3Layer('#00e676')
    expect((other['--xaihi-primary'] as AliasModes).light).not.toBe(mode('--xaihi-primary', 'light'))
  })

  it('依赖的访问器都必须还在（换 MCU 版本时这条先红）', () => {
    const table = MaterialDynamicColors as unknown as Record<string, unknown>
    for (const [alias, accessor] of Object.entries(ALIAS_ACCESSORS)) {
      expect(table[accessor], `${alias} 依赖的 ${accessor}`).toBeDefined()
    }
  })

  it('AA：kit 里每一对并排出现的文字，明暗两侧都要 ≥ 4.5', () => {
    // 先证配对表不是空的，否则下面的循环可以一趟都不跑还报绿。
    expect(TEXT_PAIRS.length).toBeGreaterThanOrEqual(6)
    for (const which of ['light', 'dark'] as const) {
      for (const [backgroundAlias, foregroundAlias, label] of TEXT_PAIRS) {
        const ratio = contrast(mode(backgroundAlias, which), mode(foregroundAlias, which))
        expect(ratio, `${which} ${label}（${foregroundAlias} on ${backgroundAlias} = ${ratio.toFixed(2)}）`)
          .toBeGreaterThanOrEqual(4.5)
      }
    }
    // 阳性对照：同一把尺必须判得出"不够"与"很够"，否则 4.5 那条是空转。
    expect(contrast('#777777', '#888888'), '灰对灰').toBeLessThan(4.5)
    expect(contrast('#000000', '#ffffff'), '黑对白').toBeGreaterThan(20)
  })
})
