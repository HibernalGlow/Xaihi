/**
 * 设置命名空间这一格**必须真的有落点**：桥广播的行 id 要能在某个包里找到一条声明过的
 * volatile 字段，否则文档侧每一条 `config.*` 都会稳定撞在 DSH 的第二道写闸上。
 *
 * 为什么钉在跨文件而不是单测一个函数：2026-10-06 真浏览器实测到的正是这种分叉——
 * 外壳广播 `settingsNs="8f3ca9e1"`（`ctx.fiber.entry?.options.id` 的散列样行名），
 * 而 `describe()` 的 20 行里没有它，因为 `xaihi-ui` 那一行刻意没声明 Config；
 * 单看桥的每一侧都是"自洽"的，合起来是一条永远读不回的 `config-namespace-missing`。
 * 尺按**剥掉注释之后**的源码算（同 `check:brand` 那条教训：说明文字不是消费者）。
 * @module xaihi-core/tests/settings-row
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATE_SETTINGS_NS } from '@hibernalglow/xaihi-sdk'

/** 剥块注释与整行行注释；返回按行可查的源码。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * 从一个插件入口里取出 `export const Config = Schema.object({ ... })` 里
 * **带 `.volatile()`** 的字段名。取不到的字段（比如只写 `Schema.string()`）不算落点。
 */
export function volatileConfigFields(src: string): string[] {
  const body = stripComments(src)
  // 收尾要吃到 `})`：`Schema.object({...})` 后面那个右花括号是这一行的一部分，
  // 只写 `\n)\n` 的话整块匹配不上，而匹配不上返回的是**空清单**——
  // 空清单配上 arrayContaining 就是一条永远红的断言，看着像"代码没声明"，其实是尺瞎了。
  const block = /export const Config = Schema\.object\(\{([\s\S]*?)\n\}\)\n/.exec(body)
  if (block === null) return []
  const inner = block[1] ?? ''
  const found: string[] = []
  for (const match of inner.matchAll(/^\s{2}(\w+):\s*([^,\n]+)/gm)) {
    const field = match[1] as string
    const value = match[2] ?? ''
    if (value.includes('.volatile()')) found.push(field)
  }
  return found
}

const CORE_ENTRY = new URL('../src/index.ts', import.meta.url).pathname
const UI_HOST_ENTRY = new URL('../../ui-host/src/index.ts', import.meta.url).pathname

describe('设置命名空间的落点', () => {
  it('桥广播的那一格 = core 的 loader 行 id（实测就在 describe() 的 20 行里）', () => {
    expect(STATE_SETTINGS_NS).toBe('xaihi-core')
  })

  it('core 那一行真声明了 volatile 落点：状态、界面设置、内存保护各一条', () => {
    const fields = volatileConfigFields(readFileSync(CORE_ENTRY, 'utf8'))
    // 第三条不是装饰：`NodeMemoryProtectionSettings` 那一格过桥之后落的就是它，
    // 少了 `.volatile()` 撞的是 DSH 第二道写闸（`Config field "…" is not volatile`）。
    expect(fields).toEqual(expect.arrayContaining(['nodeState', 'nodeUi', 'nodeMemoryProtection']))
  })

  it('阳性对照：摘掉 .volatile() 就该看不见那一格（尺看得见违规，不是恒真）', () => {
    const src = readFileSync(CORE_ENTRY, 'utf8')
    const sabotaged = src.replace('nodeUi: nodeUiSchema.volatile(),', 'nodeUi: nodeUiSchema,')
    expect(volatileConfigFields(sabotaged)).not.toContain('nodeUi')
    const sabotagedMemory = src.replace('nodeMemoryProtection: nodeMemoryProtectionSchema.volatile(),', 'nodeMemoryProtection: nodeMemoryProtectionSchema,')
    expect(volatileConfigFields(sabotagedMemory), '这一格变成不可写 = 界面上那次写会撞第二道写闸，尺必须看不见它').not.toContain('nodeMemoryProtection')
    // 另一头也要看得见：整块 Config 不存在时不是"空清单通过"，是零落点
    expect(volatileConfigFields('export const name = "x"')).toEqual([])
  })

  it('ui-host 那一行确实不可配置（所以它**不许**再被当成命名空间的出处）', () => {
    expect(volatileConfigFields(readFileSync(UI_HOST_ENTRY, 'utf8'))).toEqual([])
  })
})
