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
import { fileURLToPath } from 'node:url'
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

describe('material you 桥', () => {
  it('每个别名都给齐明暗两值，且都是 #rrggbb', () => {
    const aliases = Object.keys(layer)
    expect(aliases.length).toBeGreaterThan(5)
    for (const alias of aliases) {
      expect(HEX.test(mode(alias, 'light')), alias).toBe(true)
      expect(HEX.test(mode(alias, 'dark')), alias).toBe(true)
    }
  })

  it('覆盖率：styles.ts 里用到的每个 --xaihi-* 都必须有值', () => {
    const css = readFileSync(fileURLToPath(new URL('../src/client/styles.ts', import.meta.url)), 'utf8')
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
})
