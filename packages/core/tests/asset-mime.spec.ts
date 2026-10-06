/**
 * 产物资源与路由 Content-Type 那张表的交叉判据。
 *
 * 为什么这条尺住在 core 而不是 ui-host：被判据牵着的那份真源是**这里的** `MIME`
 * （不在表里的扩展名路由一律拒绝，这是"别把目录里任何文件当资源发出去"那道闸），
 * 而对面那份是构建配置。ui-host 不依赖 core（也不该为了这条测去加一条依赖），
 * 所以由**握有真源的那一侧**去读对面——和 `check-installable` 读别人的清单是同一条理由。
 *
 * 症状有多间接：构建能把 `foo.jpeg?url` 落成一个文件，路由没有对应条目就是 404，
 * 界面上表现为"少一张图 / 字体不加载"，控制台只有一行状态码。
 * @module xaihi-core/tests/asset-mime
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIME } from '../src/routes.ts'

/**
 * 文档构建那份配置在仓里的位置。按本文件的目录算而不是按 cwd 算：
 * cwd 会随跑测试的入口变（`pnpm -w exec vitest` 与工作目录各跑一次就两种答案），
 * 那时"文件不存在"会被读成"对面没有资源规则"，判据就悄悄恒真了。
 */
const DOCUMENT_CONFIG = join(import.meta.dirname, '../../ui-host/rspack.document.mjs')

/**
 * 从 rspack 配置文本里取出"会被落成文件的资源扩展名"。
 * 只认带 `resourceQuery: /url/` 的那条规则——没有 `?url` 的走 `type: 'asset'`，
 * 那种是内联成 data URI，不产生文件，也就不需要路由配合。
 * @param source - rspack 配置的源码文本。
 * @returns 不带点号的扩展名列表。
 */
function assetExtensions(source: string): string[] {
  const line = source.split('\n').find((row) => row.includes('resourceQuery') && row.includes('asset/resource'))
  if (line === undefined) return []
  const group = /\/\\\.?\(([^)]*)\)\$/.exec(line)?.[1]
  if (group === undefined) return []
  // `woff2?` 这种可选尾写法的展开：`?` 只让它**前一个字符**可选，
  // 所以 'woff2?' 的两支是 'woff'（去掉那个可选字符）与 'woff2'（留着）。
  return group.split('|').flatMap((token) => {
    if (!token.endsWith('?')) return [token]
    const withOptional = token.slice(0, -1)
    return [withOptional.slice(0, -1), withOptional]
  })
}

describe('产物资源与 MIME 表', () => {
  it('构建会落成的每一种资源扩展名，路由都答得出 Content-Type', () => {
    expect(existsSync(DOCUMENT_CONFIG)).toBe(true)
    const exts = assetExtensions(readFileSync(DOCUMENT_CONFIG, 'utf8'))
    // 阳性对照的第一半：解析本身要真抓到东西，空清单会让上面那条断言恒真。
    expect(exts.length).toBeGreaterThanOrEqual(4)
    const missing = exts.filter((ext) => !Object.hasOwn(MIME, `.${ext}`))
    expect(missing).toEqual([])
  })

  it('这把尺看得见违规：同一个解析器遇到表里没有的扩展名要报出来', () => {
    const fixture = `      { test: /\\.(json|gif|svg)$/, resourceQuery: /url/, type: 'asset/resource' },`
    const exts = assetExtensions(fixture)
    expect(exts).toEqual(['json', 'gif', 'svg'])
    expect(exts.filter((ext) => !Object.hasOwn(MIME, `.${ext}`))).toEqual(['gif'])
  })

  it('可选尾写法要展开对（woff2? 同时给到 woff 与 woff2）', () => {
    const fixture = `      { test: /\\.(png|woff2?)$/, resourceQuery: /url/, type: 'asset/resource' },`
    expect(assetExtensions(fixture)).toEqual(['png', 'woff', 'woff2'])
  })

  it('`.jpeg` 与 `.jpg` 两支都要在表里（构建那侧两条都收）', () => {
    // 这条是 2026-10-06 真找到那条的回归：缺 `.jpeg` 时界面上是一张图不显示，
    // 而控制台上只有一条 404 —— 差一条表项，症状离成因很远。
    expect(MIME['.jpeg']).toBe('image/jpeg')
    expect(MIME['.jpg']).toBe('image/jpeg')
  })
})
