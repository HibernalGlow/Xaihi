/**
 * 设计语言 → 宿主 token 那一层的判据。
 *
 * 这一层上一次犯的错是"把 `--xaihi-*` 当名字喂给只认 `--dsw-alias-*` 的 API"，
 * 于是那一层从未到过屏幕上（`docs/stages/step-4.md` §21 实测同族症状：拼出来的名字全 `(unset)`）。
 * 所以这里的重点不是"值长什么样"，而是**三件事**：
 *   ① 名字不在现读目录里 ⇒ 不应用，并且要能在 `absent` 里读出来；
 *   ② `native` ⇒ 整层不存在（不替使用者挑一份候选）；
 *   ③ 值只出自搬进来的那台引擎，且明暗两值必须成对给（`ThemeTokenModes` 是强制的）。
 *
 * 每条尺都配阳性对照；期望值一律不再调一次被测函数得到。
 *
 * @module xaihi-ui/tests/design-layer
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { contrastRatio, relativeLuminance } from '../src/lib/design-theme/contrast'
import { cssColorToHex } from '../src/lib/design-theme/domColor'
import { DEFAULT_DESIGN_THEME, normalizeDesignThemeConfig } from '../src/lib/design-theme/contract'
import { DESIGN_LAYER_SOURCE, HOST_ROLES, designHostLayer } from '../src/client/theme/design-language.ts'

/**
 * 名字取自实测（`docs/stages/step-4.md` §21 那张表，遍历真宿主 CSSOM 得到的 107 个真名里的 7 个）。
 * `description` 文本**不是**宿主原文——宿主那份只能在真装配里 `exportInspectTokens()` 读——
 * 这里写它是为了驱动 `roleWords` 那条交叉核对，不冒充测量结果。
 */
const DIRECTORY = HOST_ROLES.map((role) => ({
  name: role.dswName,
  description: `sample ${role.roleWords[0]} token`,
}))

/** 引擎实际发出的颜色形状。`#rrggbb` 只是其中一种：武陵发 `oklch(...)`（本轮实测）。 */
const HEX = /^#[0-9a-f]{6}$/
// 引擎实际发出的形状：hex（md3/mondrian）、oklch（武陵）、`color-mix(in oklab, …)`（孤星的半透明面）。
// `[^)]*` 那种写法在嵌套括号（`color-mix(in oklab, #0B6E75 16%, transparent)`）上会断，所以这里按平衡括号匹配。
const CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-z][a-z-]*\((?:[^()]|\([^()]*\))*\))$/

function isHex(value: string): boolean {
  return HEX.test(value)
}

function layerFor(id: string, seed?: string) {
  const config = normalizeDesignThemeConfig(
    id === 'md3' && seed !== undefined ? { ...DEFAULT_DESIGN_THEME, id, md3: { ...DEFAULT_DESIGN_THEME.md3, seed } } : { ...DEFAULT_DESIGN_THEME, id },
  )
  return designHostLayer(config, DIRECTORY)
}

describe('设计语言到宿主 token 的那一层', () => {
  it('native 什么都不叠：这一层缺席是可读状态，不是故障', () => {
    const layer = designHostLayer(DEFAULT_DESIGN_THEME, DIRECTORY)
    expect(layer.recipe).toBe('native')
    expect(layer.tokens).toEqual({})
    expect(layer.applied).toEqual([])
    // 缺席时外壳靠 styles.ts 里的 `var(--xaihi-*, var(--dsw-…))` 链回落到宿主原样。
    expect(layer.absent).toEqual([])
  })

  it('每份接管的配方都给齐明暗两个非空颜色值', () => {
    // 不钉成 #rrggbb：那正是我上一版的错——以为颜色的形状由接缝决定。
    // 形状由配方决定（md3 发 hex，武陵发 oklch），接缝只保证"两值成对、是颜色"。
    for (const id of ['md3', 'mondrian', 'wuling', 'swiss', 'lonestar']) {
      const layer = layerFor(id)
      expect(Object.keys(layer.tokens).length, `${id} 一个槽都没发`).toBeGreaterThan(0)
      for (const [name, modes] of Object.entries(layer.tokens)) {
        expect(modes.light.length, `${id} ${name}.light 是空的`).toBeGreaterThan(0)
        expect(modes.dark.length, `${id} ${name}.dark 是空的`).toBeGreaterThan(0)
        expect(modes.light, `${id} ${name}.light 不像颜色`).toMatch(CSS_COLOR)
        expect(modes.dark, `${id} ${name}.dark 不像颜色`).toMatch(CSS_COLOR)
      }
      expect(layer.source).toBe(DESIGN_LAYER_SOURCE)
    }
  })

  it('明暗是真分支：发 hex 的那几份，底必须真的变暗', () => {
    let checked = 0
    for (const id of ['md3', 'mondrian', 'wuling', 'swiss', 'lonestar']) {
      const layer = layerFor(id)
      const surface = layer.tokens['--dsw-alias-bg-layer-1']
      if (surface === undefined || !isHex(surface.light) || !isHex(surface.dark)) continue
      checked += 1
      expect(relativeLuminance(surface.light), `${id} 亮色底应该比暗色底亮`)
        .toBeGreaterThan(relativeLuminance(surface.dark))
    }
    // 假绿防线：一条都没比到就等于这条尺没跑。
    expect(checked, '没有任何一份配方发 hex 底色——上面那个 continue 把判据吃掉了').toBeGreaterThan(0)
  })

  it('AA：文字与底这一对，量得到的必须在明暗两侧都 ≥ 4.5', () => {
    // `contrastRatio` 的口径是 `#rrggbb`（它故意不猜别的形状，见 contrast.ts 开头
    // "解不出来直接抛，不静默当黑色算"）。非 hex 的那几份**不在这里换算**：
    // 引擎自带的 `cssColorToHex` 靠 canvas 像素回读，而本机 happy-dom 没有 canvas 后端
    // （实测 `cssColorToHex('#ff0000')` 返回 null），拿它当尺会把"量不到"洗成"通过"。
    // 所以这里只量 hex，其余逐条记进 unmeasurable，由下面的断言把下限钉住。
    const pairs = [['--dsw-alias-label-primary', '--dsw-alias-bg-layer-1'], ['--dsw-alias-label-secondary', '--dsw-alias-bg-layer-1']] as const
    let checked = 0
    const unmeasurable: string[] = []
    for (const id of ['md3', 'mondrian', 'wuling', 'swiss', 'lonestar']) {
      const layer = layerFor(id)
      for (const [fg, bg] of pairs) {
        const pair = layer.tokens[fg]
        const base = layer.tokens[bg]
        if (pair === undefined || base === undefined) {
          unmeasurable.push(`${id} ${fg} 未发值`)
          continue
        }
        const values = [pair.light, pair.dark, base.light, base.dark]
        if (!values.every((value) => isHex(value))) {
          unmeasurable.push(`${id} ${fg}/${bg} 非 hex（${values[0]}）`)
          continue
        }
        checked += 1
        for (const mode of ['light', 'dark'] as const) {
          const ink = mode === 'light' ? pair.light : pair.dark
          const ground = mode === 'light' ? base.light : base.dark
          expect(contrastRatio(ink, ground), `${id} ${mode} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
    // 下限：md3 与 mondrian 至少各贡献一对，否则这条尺其实是空的。
    expect(checked, `量到的把数为 0，全落在未量清单：${unmeasurable.join('; ')}`).toBeGreaterThanOrEqual(2)
    // 未量的那些必须**说得出口**，不许静默消失（这就是"没拿到"与"没有这回事"的区别）。
    expect(unmeasurable.length + checked).toBe(pairs.length * 5 - 0)
    // 阳性对照：低对比的一对必须被同一把尺拒绝，否则"全绿"没有意义。
    expect(contrastRatio('#777777', '#888888')).toBeLessThan(4.5)
  })

  it('本机没有 canvas 后端这件事本身是可读的（决定了上面那把尺的量程）', () => {
    expect(cssColorToHex('#ff0000'), '这台机器的 happy-dom 能不能解析 CSS 颜色，是上面那条尺的边界条件').toBeTypeOf('object')
    // 上一版材料：真浏览器里它必须回读出 hex；在 happy-dom 里它回 null。两者都是"如实"，
    // 但**不能 both-pass**，所以这里只断言"它给出了一个可判定的答案"，具体形状由环境决定。
  })

  it('阳性对照：目录里没有的名字一律不应用（上一版就是把 --xaihi-* 喂了进去）', () => {
    const invented = designHostLayer(
      normalizeDesignThemeConfig({ ...DEFAULT_DESIGN_THEME, id: 'md3' }),
      [{ name: '--xaihi-surface', description: 'the old mistake' }],
    )
    expect(invented.applied).toEqual([])
    expect(invented.absent.length).toBe(HOST_ROLES.length)
    expect(Object.keys(invented.tokens)).toEqual([])
    // 同一条尺反过来也要能红：真名进来就必须应用，否则上面那片空是假绿。
    expect(designHostLayer(normalizeDesignThemeConfig({ ...DEFAULT_DESIGN_THEME, id: 'md3' }), DIRECTORY).applied.length)
      .toBe(HOST_ROLES.length)
  })

  it('阳性对照：名字撞对但描述不含角色词 ⇒ 应用了，同时记在 unconfirmed', () => {
    const mismatched = DIRECTORY.map((token) => ({ ...token, description: 'totally unrelated thing' }))
    const layer = designHostLayer(normalizeDesignThemeConfig({ ...DEFAULT_DESIGN_THEME, id: 'md3' }), mismatched)
    expect(layer.applied.length).toBe(HOST_ROLES.length)
    expect(layer.unconfirmed.sort()).toEqual([...HOST_ROLES].map((role) => role.dswName).sort())
    // 描述为空（宿主没给）时不该被当成不匹配——那是"没信息"，不是"信息对不上"。
    const silent = designHostLayer(
      normalizeDesignThemeConfig({ ...DEFAULT_DESIGN_THEME, id: 'md3' }),
      HOST_ROLES.map((role) => ({ name: role.dswName })),
    )
    expect(silent.unconfirmed).toEqual([])
  })

  it('阳性对照：换 seed 必须换值，换配方也必须换值', () => {
    const a = layerFor('md3')
    const b = layerFor('md3', '#00e676')
    expect(b.tokens['--dsw-alias-label-primary']!.light).not.toBe(a.tokens['--dsw-alias-label-primary']!.light)
    const swiss = layerFor('swiss')
    expect(swiss.tokens['--dsw-alias-bg-layer-1']!.light).not.toBe(a.tokens['--dsw-alias-bg-layer-1']!.light)
  })

  it('覆盖率：外壳 CSS 里每个 --xaihi-* 都必须带宿主兜底，缺席才不至于画成透明', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/client/styles.ts'), 'utf8')
    const uses = [...css.matchAll(/var\(\s*(--xaihi-[a-z0-9-]+)\s*(,([^)]*))?\)/g)]
    expect(uses.length).toBeGreaterThan(0)
    const bare = uses.filter((match) => !/--dsw-/.test(match[3] ?? '')).map((match) => match[1])
    expect(bare, `这些 --xaihi-* 没有 --dsw-* 兜底：${bare.join(', ')}`).toEqual([])
    // 阳性对照：把兜底去掉一条，这把尺必须看得见。
    const broken = css.replace('var(--xaihi-surface, var(--dsw-alias-bg-layer-1, transparent))', 'var(--xaihi-surface)')
    const brokenBare = [...broken.matchAll(/var\(\s*(--xaihi-[a-z0-9-]+)\s*(,([^)]*))?\)/g)]
      .filter((match) => !/--dsw-/.test(match[3] ?? ''))
      .map((match) => match[1])
    expect(brokenBare).toContain('--xaihi-surface')
  })
})
