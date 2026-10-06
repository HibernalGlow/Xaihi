/**
 * 颜色出口的守门测试。
 *
 * 规则：组件里出现 `--xaihi-*` / `--dsw-alias-*` 以外的自定义属性，或者裸 hex 出现在
 * var() 兜底以外的位置，都会在宿主换 seed 时变成第二套颜色。这两条都用字符串手术守住，
 * 不靠人 review。
 *
 * @module xaihi-ui-kit/tests/tokens
 */

import { describe, expect, it } from 'vitest'
import { ALIAS, KIT_CSS } from '../src/tokens.ts'

/** 剥掉所有 `var(...)` 表达式（含一层嵌套），剩下的内容里不该再有颜色值。 */
function stripVars(css: string): string {
  let out = css
  for (let pass = 0; pass < 4; pass += 1) {
    out = out.replace(/var\(([^()]|\([^)]*\))*\)/g, 'VAR')
  }
  return out
}

describe('颜色出口纪律', () => {
  it('每个语义槽都先读 --xaihi-*，再回落 --dsw-alias-*', () => {
    for (const [slot, value] of Object.entries(ALIAS)) {
      expect(value, slot).toMatch(/^var\(--xaihi-[a-z-]+, var\(--dsw-(?:alias|text)[a-z-]*, /)
    }
  })

  it('KIT_CSS 里除了 var() 没有别处的颜色字面量', () => {
    expect(KIT_CSS).toContain('var(')
    const stripped = stripVars(KIT_CSS)
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(stripped).not.toMatch(/\brgba?\(/)
    // 阳性对照：剥壳前确实有兜底色，否则上面的断言是空转。
    expect(KIT_CSS).toMatch(/#[0-9a-fA-F]{6}/)
  })

  it('不许出现第三方命名空间的自定义属性', () => {
    const custom = [...KIT_CSS.matchAll(/--[a-z][a-z0-9-]*/g)].map((match) => match[0])
    for (const name of new Set(custom)) {
      expect(name.startsWith('--xaihi-') || name.startsWith('--dsw-'), name).toBe(true)
    }
  })
})
