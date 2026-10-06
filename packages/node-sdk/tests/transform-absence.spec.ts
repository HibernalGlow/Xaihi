/**
 * `transformValue` 的"没给"语义。
 *
 * 这一族断言钉的是一件会删文件的事：省略一个可选字段时，绑定层不许把它折成一个**看起来像用户主动清空**的值。
 * 判据不是"我觉得应该传 undefined"，而是本仓自己的两处后果（都写在下面的用例里）：
 * - `trim` 折成 `''` ⇒ bitv 的 `core.ts` 把 `transferMode === 'copy'` 判假 ⇒ 走 `move` 那条 link+unlink，
 *   少给一个字段就删源文件。
 * - `asBoolean` 折成 `false` ⇒ 包侧 `typeof inputs.x === 'boolean' ? inputs.x : config.x.get()`
 *   的兜底分支永远走不到 ⇒ 使用者在 DSH 设置面里改的那个键形同装饰（ADR-0013 说值就住在那儿）。
 *
 * @module xaihi-sdk/tests/transform-absence
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { transformValue } from '../src/define-node.ts'

describe('transformValue：省略 ≠ 给了空值', () => {
  it('没给的字段一律原样传 undefined，让内核与 settings 兜底', () => {
    // 阳性对照的一半：这几条在"asText 先折成 '' 再 transform"的实现下会分别拿到 '' / false / []。
    expect(transformValue(undefined, 'trim')).toBeUndefined()
    expect(transformValue(null, 'trim')).toBeUndefined()
    expect(transformValue(undefined, 'asBoolean')).toBeUndefined()
    expect(transformValue(null, 'asBoolean')).toBeUndefined()
    expect(transformValue(undefined, 'trimOrOmit')).toBeUndefined()
    expect(transformValue(undefined, 'asInteger')).toBeUndefined()
  })

  it('显式给了空串仍然算"给了"，不许被当成省略', () => {
    // 这一条与上一条是一对：只测"省略传下去"而不测"空串仍然是空串"，
    // 就等于允许实现把两者一起丢掉，那样清空一个字段会变成"没填"，语义反过来错。
    expect(transformValue('', 'trim')).toBe('')
    expect(transformValue('   ', 'trim')).toBe('')
    expect(transformValue('false', 'asBoolean')).toBe(false)
    expect(transformValue('0', 'asBoolean')).toBe(false)
  })

  it('给了值就按 transform 的本意折算（省略那条分支不许顺手改掉正常路径）', () => {
    expect(transformValue('  abc  ', 'trim')).toBe('abc')
    expect(transformValue(true, 'asBoolean')).toBe(true)
    expect(transformValue('true', 'asBoolean')).toBe(true)
    expect(transformValue('1', 'asBoolean')).toBe(true)
    expect(transformValue(' 12 ', 'asInteger')).toBe(12)
    expect(transformValue('a, b,, c', 'delimited')).toEqual(['a', 'b', 'c'])
    expect(transformValue('a\nb', 'lines')).toEqual(['a', 'b'])
  })

  it('bitv 那条真实后果：模型没给 transferMode 时，整条绑定链交出 undefined，内核落回 copy', async () => {
    // 这条量的不是 transformValue 一个函数，而是**真实组合**：
    // bitv 清单里 transferMode 的 transform 是 `trim`，绑定层若把它折成 ''，
    // core.ts:376 的 `input.transferMode ?? BITV_DEFAULTS.transferMode` 就救不回来
    // （'' 不是 nullish），于是走 move 那条 link+unlink —— 少给一个字段就删源文件。
    const { bindInputs } = await import('../src/define-node.ts')
    const { BITV_DEFAULTS } = await import('../../../plugins/bitv/src/core.ts')
    const pkg = JSON.parse(readFileSync(new URL('../../../plugins/bitv/package.json', import.meta.url), 'utf8')) as {
      xaihi: { node: Parameters<typeof bindInputs>[0] }
    }
    const inputs = bindInputs(pkg.xaihi.node, {})
    expect(inputs.transferMode).toBeUndefined()
    // 内核那一侧的兜底因此真的可达，而不是被空串抢掉。
    expect(inputs.transferMode ?? BITV_DEFAULTS.transferMode).toBe('copy')
  })
})
