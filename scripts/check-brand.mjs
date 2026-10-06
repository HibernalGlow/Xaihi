#!/usr/bin/env node
/**
 * 品牌门禁：代码里不许出现旧项目名 `xiranite`。
 *
 * 为什么只量代码不量文档：仓里大量 **prose** 是刻意写着 `Xiranite` 的——那是"这一条是从哪搬来"
 * 的出处（ADR、技能、阶段报告、对照表）。要禁的是**活标识符**：import 说明符、CSS 类名、
 * bin 名、临时目录前缀这类会随代码活下去的名字。它们留着旧品牌，症状是"搬过来的东西还在
 * 自称上一个项目"，而且会顺着 npm 包名、注册表 key 一路漏到使用者面前。
 * 判据：剥掉注释之后再找。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.css']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'examples', '.git', '.pnpm'])
// 这把尺自己必须字面写着旧品牌（模式与三条正控的夹具），所以只放过这一个文件；`--self-check` 是它防瞎的对照。
const SELF = 'scripts/check-brand.mjs'
const BRAND = /xiranite/i

/**
 * 剥注释（与上色门禁同思路：注释是给人看出处用的，不算违规）。
 * @param source - 源码文本。
 * @returns 只剩代码的行数组，行号与原文件一致。
 */
export function stripComments (source) {
  let inBlock = false
  return source.split('\n').map((line) => {
    let out = ''
    for (let index = 0; index < line.length; index += 1) {
      const two = line.slice(index, index + 2)
      if (inBlock) {
        if (two === '*/') { inBlock = false; index += 1 }
        continue
      }
      if (two === '/*') { inBlock = true; index += 1; continue }
      if (two === '//') break
      out += line[index]
    }
    return out
  })
}

/**
 * 找代码里的旧品牌活标识符。
 * @param relative - 报告里显示的路径。
 * @param source - 文件内容。
 * @returns 违规清单（带行号与命中片段）。
 */
export function findBrandHits (relative, source) {
  const problems = []
  stripComments(source).forEach((line, index) => {
    if (!BRAND.test(line)) return
    const snippet = line.trim().slice(0, 80)
    problems.push(`${relative}:${String(index + 1)} 代码里出现旧品牌 ⇒ ${snippet}`)
  })
  return problems
}

function* walk (dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield * walk(join(dir, entry.name))
      continue
    }
    if (!CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue
    yield join(dir, entry.name)
  }
}

function selfCheck () {
  const caught = findBrandHits('a.ts', 'import { cn } from "@xiranite/ui"\n')
  const commentOnly = findBrandHits('b.ts', '/** 词表照抄 Xiranite 的 contract.ts */\nexport const x = 1\n')
  const stringHit = findBrandHits('c.ts', 'const prefix = "xiranite-node-"\n')
  if (caught.length !== 1 || commentOnly.length !== 0 || stringHit.length !== 1) {
    console.error(`check-brand: 尺是瞎的（import 抓到 ${String(caught.length)}、注释误报 ${String(commentOnly.length)}、字符串抓到 ${String(stringHit.length)}；应为 1/0/1）`)
    return 1
  }
  console.log('check-brand self-check OK（活标识符被抓、注释里的出处被放过）')
  return 0
}

if (process.argv.includes('--self-check')) process.exit(selfCheck())

const problems = []
let scanned = 0
for (const group of ['packages', 'plugins', 'scripts']) {
  const dir = join(ROOT, group)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
  for (const file of walk(dir)) {
    const relative = file.slice(ROOT.length)
    if (relative === SELF) continue
    scanned += 1
    problems.push(...findBrandHits(relative, readFileSync(file, 'utf8')))
  }
}

if (problems.length > 0) {
  console.error(`check-brand: ${String(problems.length)} 处旧品牌活标识符`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('  ⇒ 改名字，不要加白名单：品牌统一就是这条规则的全部内容（见 docs/adr/0010-brand-is-xaihi.md）')
  process.exit(1)
}
console.log(`check-brand OK（${String(scanned)} 个代码文件里没有旧品牌活标识符；文档里的出处不计）`)
