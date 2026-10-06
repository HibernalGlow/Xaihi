/**
 * 发现流程的集成测试：走真的 createRequire + 真的目录。
 *
 * 存在的理由是一条真踩过的坑：把 `require()` 当 `require.resolve()` 用时，单测里
 * 注入的假 locator 察觉不到，症状却是"工作台显示没有节点"这种假信号。这里用
 * profile 形状的 node_modules 夹具，把 specifier → 路径 → 清单 → 产物 URL 整条链
 * 一次跑通；把 `.resolve` 改回直接 require 就会红。
 *
 * @module xaihi-core/tests/discover
 */

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collect, discover, type DiscoverContext } from '../src/index.ts'

const profileRoot = fileURLToPath(new URL('./fixtures/profile/', import.meta.url))

interface EntryLike { options: { id: string; name: string; disabled?: boolean } }

/** 构造只带 loader 与 baseUrl 的最小宿主上下文。 */
function fakeContext(rows: EntryLike[]): DiscoverContext {
  return {
    baseUrl: profileRoot,
    loader: {
      entries: () => rows[Symbol.iterator](),
    },
  } as unknown as DiscoverContext
}

const row = (name: string, disabled = false): EntryLike => ({ options: { id: name.split('/').pop() ?? name, name, disabled } })

describe('discover', () => {
  it('从 profile 的 node_modules 定位到 xaihi 包并给出产物 URL', () => {
    const result = discover(fakeContext([row('@fixture/xaihi-demo'), row('@fixture/plain-dep')]))
    const demo = result.located.find((entry) => entry.specifier === '@fixture/xaihi-demo')
    expect(demo?.hasXaihi).toBe(true)
    expect(demo?.pkgPath).toBe(`${profileRoot}node_modules/@fixture/xaihi-demo/package.json`)
    expect(result.registrations).toHaveLength(1)
    const [registration] = result.registrations
    expect(registration?.entryFile).toBe('remoteEntry.js')
    expect(registration?.rev).toMatch(/^[0-9a-f]{12}$/)
  })

  it('定位不到的候选带着原因出现，不静默消失', () => {
    const result = discover(fakeContext([row('@fixture/does-not-exist')]))
    const missing = result.located[0]
    expect(missing?.hasXaihi).toBe(false)
    expect(missing?.error).toContain('Cannot find module')
  })

  it('disabled 行不参与扫描，但仍原样报出', () => {
    const result = discover(fakeContext([row('@fixture/xaihi-demo', true)]))
    expect(result.candidates).toEqual([])
    expect(result.rows.map((entry) => entry.name)).toContain('@fixture/xaihi-demo')
  })

  it('collect 是 discover 的登记表投影', () => {
    expect(collect(fakeContext([row('@fixture/xaihi-demo')]))).toHaveLength(1)
  })
})
