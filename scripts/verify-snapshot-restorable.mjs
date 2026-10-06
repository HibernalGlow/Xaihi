#!/usr/bin/env node
/**
 * 尺：被删的东西必须真的还能拿回来。
 *
 * `packages/api` 从未被任何分支提交过（`git log --all -- packages/api` 零命中），
 * 所以删除在本仓不可由 `but undo` 恢复——唯一退路是仓库同级的快照目录。
 * 这条闸逐个文件重算 sha256 并与台账比对，不只看目录存在。
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SNAPSHOT = '/Users/glow/Base/Code/Freya/_scratch/xaihi-elysia-removal-2026-10-06'
const LEDGER = join(SNAPSHOT, 'sha256.txt')
const TREE = join(SNAPSHOT, 'packages-api.snapshot')

if (!existsSync(LEDGER) || !existsSync(TREE)) {
  console.log('FAIL: 快照目录或台账不存在')
  process.exit(1)
}

function* walk(dir, base = dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full, base)
    else yield { abs: full, rel: full.slice(`${base}/`.length) }
  }
}

const expected = new Map()
for (const line of readFileSync(LEDGER, 'utf8').split('\n')) {
  const m = line.match(/^([0-9a-f]{64})\s+\.(\/.+)$/)
  if (m) expected.set(m[2], m[1])
}

if (expected.size === 0) {
  console.log('FAIL: 台账里没有可比对的条目')
  process.exit(1)
}

const problems = []
let checked = 0
for (const { abs, rel } of walk(TREE)) {
  const want = expected.get(`/${rel}`)
  if (want === undefined) {
    problems.push(`${rel}: 磁盘上有、台账里没有`)
    continue
  }
  const got = createHash('sha256').update(readFileSync(abs)).digest('hex')
  checked += 1
  if (got !== want) problems.push(`${rel}: sha 不符（台账 ${want.slice(0, 12)}… 实测 ${got.slice(0, 12)}…）`)
}
for (const rel of expected.keys()) {
  if (!existsSync(join(TREE, rel.slice(1)))) problems.push(`${rel}: 台账里有、磁盘上没了`)
}

if (problems.length > 0) {
  console.log(`FAIL: 快照不可恢复（比对 ${checked} 条）`)
  console.log(problems.map((p) => `  ${p}`).join('\n'))
  process.exit(1)
}
console.log(`snapshot ledger verified (${checked} files, sha256 逐条对回)`);
