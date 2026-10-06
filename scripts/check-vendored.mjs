/**
 * 搬运树里"同一份 vendored 代码抄了几个包"的漂移尺。
 *
 * 背景：`plugins/<id>/src/cli-support.ts` 是上游 `@xiranite/cli-runtime` 的必要子集，
 * 三个已迁插件**各带一份**——这不是懒，是打包形状逼的：ADR-0002 规定装进 profile 的包
 * 不许引用 `@hibernalglow/*` 之外的仓内包（profile 解析不了 `workspace:*`），
 * 而 `@xiranite/*` 一写进依赖就让全仓 pnpm 解不出树（`pnpm-workspace.yaml` 顶部注释）。
 *
 * 复制份数的代价是漂：改一处忘两处，症状是"某个节点的 CLI 行为不一样"，
 * 而没人会想到去比对三份 20 KB 的文件。所以这里逐字节比（只放过文件头那行
 * `@module xaihi-<id>/cli-support` 的包名），并要求名单与实际存在的份数一致——
 * 少一份（有人偷偷删了 vendored 文件）与多一份（新节点复制时改了名字）都算红。
 *
 * 用法：
 *   node scripts/check-vendored.mjs            # 比对
 *   node scripts/check-vendored.mjs --self-check  # 阳性对照：制造一处漂移必须红
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
/** 哪些文件名算"跨包复制的 vendored 件"。加新的 vendored 文件就从这里登记。 */
const VENDORED = ['src/cli-support.ts']
const PLUGINS = readdirSync(join(ROOT, 'plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

/** 只留"内容本身"：抹掉带包名的 @module 行，其余一个字节都不许差。 */
const normalized = (text) => text
  .split('\n')
  .filter((line) => !/^\s*\*\s*@module\s/.test(line))
  .join('\n')

function compare() {
  const problems = []
  for (const file of VENDORED) {
    const present = PLUGINS.filter((plugin) => existsSync(join(ROOT, 'plugins', plugin, file)))
    if (present.length === 0) {
      problems.push(`${file}: 一份都没有（vendored 件被删了？名单还指着它）`)
      continue
    }
    const [first, ...rest] = present
    const baseline = normalized(readFileSync(join(ROOT, 'plugins', first, file), 'utf8'))
    for (const other of rest) {
      const text = normalized(readFileSync(join(ROOT, 'plugins', other, file), 'utf8'))
      if (text !== baseline) {
        problems.push(`${file}: ${other} 与 ${first} 不一致（${baseline.length} vs ${text.length} 字节）——改一处就要改全部，或者把它变成真正不同的东西并登记`)
      }
    }
    console.log(`  ${file}: ${present.length} 份一致（${present.join(', ')}）`)
  }
  return problems
}

if (process.argv.includes('--self-check')) {
  // 阳性对照：动一个字符就必须红。这把尺若看不见单字符漂移，它就等于不存在。
  const holder = PLUGINS.find((plugin) => existsSync(join(ROOT, 'plugins', plugin, VENDORED[0])))
  const target = holder === undefined ? '' : join(ROOT, 'plugins', holder, VENDORED[0])
  if (!existsSync(target)) {
    console.error('check-vendored --self-check: 找不到任何 vendored 文件，正控无从做起')
    process.exit(1)
  }
  const original = readFileSync(target, 'utf8')
  const mutated = `${original}\n// 正控：这一行制造一次不一致\n`
  try {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(target, mutated)
    const found = compare()
    if (found.length === 0) {
      console.error('  × 阳性对照失败：制造了不一致，尺却报一致')
      process.exit(1)
    }
    console.log(`check-vendored --self-check OK（单文件改动被查到：${found[0]?.slice(0, 60)}…）`)
  } finally {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(target, original)
  }
  process.exit(0)
}

console.log(`check-vendored: 比对 ${PLUGINS.length} 个插件里的 vendored 件`)
const problems = compare()
if (problems.length > 0) {
  for (const problem of problems) console.error(`  × ${problem}`)
  process.exit(1)
}
console.log('vendored 件一致 OK')
