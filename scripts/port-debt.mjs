/**
 * 搬运债台账：搬过来的树里，还有哪些 import 边在本仓落不了地。
 *
 * 为什么要有这张表而不是"等 tsc 报出来"：移植这一轮刻意**不改任何 import**
 * （别名 `@/` 与 `@xiranite/*` 都按上游原样保留，见 ADR-0007 事实 1 那 2219 条），
 * 所以类型检查必然全红，而"全红"里没有信息。这条脚本把红的东西**按边归类**并计数，
 * 于是"接线还剩几类"变成可比较的数：下次跑，某一类必须掉到 0，否则就是没推进。
 *
 * 用法：`node scripts/port-debt.mjs`（无参数、只读、不改文件）
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'packages/ui-host/src')

const EXTENSIONS = ['', '.ts', '.tsx', '.json', '.css', '/index.ts', '/index.tsx']

const tsFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })

/** 只有测试文件才许碰 `node:*`：浏览器半边里没有这个运行时。 */
const isTestFile = (path) => /\.(test|spec)\.(ts|tsx)$/.test(path)

const bump = (table, key) => table.set(key, (table.get(key) ?? 0) + 1)

const aliased = new Map()
const harness = new Map()
const xiranite = new Map()
const thirdParty = new Map()
const nodeBuiltins = new Map()

for (const file of tsFiles(SRC)) {
  const rel = file.slice(ROOT.length + 1)
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const lineOffsets = [0]
  for (const line of lines.slice(0, -1)) lineOffsets.push(lineOffsets[lineOffsets.length - 1] + line.length + 1)
  const lineAt = (offset) => {
    let at = 0
    while (at + 1 < lineOffsets.length && lineOffsets[at + 1] <= offset) at += 1
    return lines[at] ?? ''
  }
  for (const match of source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
    const spec = match[1]
    // `import type { … } from '…'` 不算依赖：它在产物里根本不存在，purity 纪律也只管 value 边。
    if (/^\s*(?:import|export)\s+type\b/.test(lineAt(match.index))) continue
    // `[, ]` 出现在捕获里说明那是 `import(a, b)` 这种二参动态导入被吃进来了，不是模块名。
    if (spec === 'vitest' || /[, ]/.test(spec)) continue
    if (spec.startsWith('@/')) {
      const target = join(SRC, spec.slice(2))
      if (!EXTENSIONS.some((ext) => existsSync(target + ext))) bump(aliased, `${spec} ← ${rel}`)
      continue
    }
    if (spec.startsWith('@xiranite/')) {
      bump(xiranite, spec.split('/').slice(0, 2).join('/'))
      continue
    }
    if (spec.startsWith('node:')) {
      if (!isTestFile(file)) bump(nodeBuiltins, `${spec} ← ${rel}`)
      continue
    }
    if (spec.startsWith('.')) continue
    if (spec.startsWith('@deepseek-ai/')) {
      if (!isTestFile(file)) bump(harness, `${spec} ← ${rel}`)
      continue
    }
    bump(thirdParty, spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/'))
  }
}

const show = (title, table, limit = 40) => {
  const entries = [...table.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  console.log(`\n${title}: ${entries.length} 类 / ${total} 条边`)
  for (const [key, n] of entries.slice(0, limit)) console.log(`  ${String(n).padStart(4)}  ${key}`)
  if (entries.length > limit) console.log(`  …还有 ${entries.length - limit} 类`)
}

show('未解析的 @/ 边（搬运没覆盖到的子树，或指向未迁节点）', aliased)
show('@xiranite/* 边（要换成本仓包名或构建期内联）', xiranite)
show('第三方裸依赖（要逐条声明，别靠提升）', thirdParty, 25)
show('非测试文件里的 node: 导入（浏览器半边跑不了）', nodeBuiltins)
show('非测试文件里 value-import harness 包（purity 纪律）', harness)
