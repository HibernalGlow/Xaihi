/**
 * 产物自包含断言：装进 DSH profile 的包不能引用仓内包名。
 *
 * DSH 的 profile 是独立的 pnpm 项目，`@hibernalglow/*` 与 `workspace:*` 在那里都解析
 * 不了；SDK 必须在构建期内联进宿主半边。这条断言只看产物，所以哪天有人把 sdk 挪回
 * dependencies（tsdown 会把它当外部依赖）就会立刻变红。
 *
 * @module xaihi-core/tests/bundle
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const libDir = fileURLToPath(new URL('../lib/', import.meta.url))

describe('宿主产物自包含', () => {
  it('lib/ 里没有任何 @hibernalglow/ 引用（先跑 pnpm -r run build）', () => {
    if (!existsSync(libDir)) throw new Error('lib/ 不存在：先跑 pnpm -r run build，再跑测试')
    const jsFiles = readdirSync(libDir).filter((name) => name.endsWith('.js'))
    expect(jsFiles.length).toBeGreaterThan(0)
    const offenders = jsFiles.flatMap((name) => {
      const text = readFileSync(`${libDir}${name}`, 'utf8')
      return [...text.matchAll(/(?:from|require\()\s*['"](@hibernalglow\/[^'"]+)['"]/g)]
        .map((match) => `${name}: ${match[1]}`)
    })
    expect(offenders).toEqual([])
  })

  it('阳性对照：外部引用会被抓到', () => {
    const sample = `import { validateManifest } from '@hibernalglow/xaihi-sdk'\nexport const x = validateManifest\n`
    const found = [...sample.matchAll(/(?:from|require\()\s*['"](@hibernalglow\/[^'"]+)['"]/g)].map((m) => m[1])
    expect(found).toEqual(['@hibernalglow/xaihi-sdk'])
  })
})
