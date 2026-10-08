/**
 * linedup 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 * @module linedup/tests/core
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import {
  analyzeReadLines,
  createDiffRows,
  explainRemovals,
  filterLines,
  findDuplicateLines,
  normalizeLine,
  splitLines,
  uniqueNonEmptyLines,
} from '../src/core.ts'

describe('linedup core', () => {
  it('normalizeLine 只裁两端空白，不动内部', () => {
    expect(normalizeLine('  a b  ')).toBe('a b')
  })

  it('uniqueNonEmptyLines 去空行并保序去重', () => {
    expect(uniqueNonEmptyLines([' b ', 'a', 'b', '', '  ', 'a'])).toEqual(['b', 'a'])
  })

  it('splitLines 统一 CRLF 与 CR', () => {
    expect(splitLines('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('filterLines 按子串移除，并给出可核对的计数', () => {
    const result = filterLines({ sourceLines: ['keep me', 'drop this one', 'other'], filterLines: ['this'] })
    expect(result.filteredLines).toEqual(['keep me', 'other'])
    expect(result.removedLines).toEqual(['drop this one'])
    expect(result.keptCount).toBe(2)
    expect(result.removedCount).toBe(1)
  })

  it('默认排序，sort:false 保留原顺序', () => {
    const input = { sourceLines: ['b2', 'a10', 'a9'], filterLines: [] }
    expect(filterLines(input).filteredLines).toEqual(['a9', 'a10', 'b2'])
    expect(filterLines({ ...input, sort: false }).filteredLines).toEqual(['b2', 'a10', 'a9'])
  })

  it('caseSensitive:false 才做大小写折叠', () => {
    const input = { sourceLines: ['Drop THIS'], filterLines: ['this'] }
    expect(filterLines(input).removedCount).toBe(0)
    expect(filterLines({ ...input, caseSensitive: false }).removedCount).toBe(1)
  })

  it('explainRemovals 说的是命中的那条过滤行', () => {
    expect(explainRemovals(['keep', 'drop me'], ['drop'])).toEqual([{ line: 'drop me', matchedFilter: 'drop' }])
  })

  // 以下三条断言的期望值逐条手抄自基线 noxide 的 packages/nodes/linedup/src/core.test.ts，
  // 覆盖这次保真修复还原回来的三个内核函数（它们曾在搬漏的版本里缺失）。
  it('createDiffRows 按 filtered 集把源行标成 kept/removed', () => {
    expect(createDiffRows(splitLines('keep\nremove'), ['keep'])).toEqual([
      { line: 'keep', status: 'kept' },
      { line: 'remove', status: 'removed' },
    ])
  })

  it('findDuplicateLines 只数出现两次以上的行，空行不计', () => {
    const duplicates = findDuplicateLines(['a', 'b', 'a', 'c', 'b', 'a', ''])
    expect([...duplicates.entries()].sort()).toEqual([['a', 3], ['b', 2]])
  })

  it('analyzeReadLines 给出 total/unique/duplicates', () => {
    const stats = analyzeReadLines(['alpha', 'beta', 'alpha', '', 'gamma'])
    expect(stats.totalLines).toBe(4)
    expect(stats.uniqueLines).toBe(3)
    expect([...stats.duplicates.entries()]).toEqual([['alpha', 2]])
  })

  it('空过滤器不移除任何东西（阳性对照：非空时必须移除）', () => {
    expect(filterLines({ sourceLines: ['a', 'b'], filterLines: ['', '  '] }).removedCount).toBe(0)
    expect(filterLines({ sourceLines: ['a', 'b'], filterLines: ['a'] }).removedCount).toBe(1)
  })

  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }
    const result = validateNodeDefinition(pkg.xaihi?.node)
    expect(result.ok ? true : result.errors).toBe(true)
  })
})
