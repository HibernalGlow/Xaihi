#!/usr/bin/env node
/**
 * 尺：摘除 Elysia 之后，仓里原有的三道门禁必须照旧为绿。
 *
 * 只跑 `check:pins` / `check-skills` / `check-installable`（各带 `--self-check`），
 * 不跑根 `pnpm test`：别的 lane 正在改写搬运文件时，全仓结果不可归因（AGENTS.md）。
 * `check:brand` 故意不纳入断言——它尚未接线，红线不该画在别人重写的文件上。
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const CASES = [
  ['check-pins --self-check', ['scripts/check-pins.mjs', '--self-check']],
  ['check-pins', ['scripts/check-pins.mjs']],
  ['check-skills --self-check', ['scripts/check-skills.mjs', '--self-check']],
  ['check-skills', ['scripts/check-skills.mjs']],
  ['check-installable --self-check', ['scripts/check-installable.mjs', '--self-check']],
  ['check-installable', ['scripts/check-installable.mjs']],
]

const failed = []
for (const [label, argv] of CASES) {
  const run = spawnSync(process.execPath, [join(root, argv[0]), ...argv.slice(1)], {
    cwd: root,
    encoding: 'utf8',
  })
  const rc = run.status === null ? -1 : run.status
  console.log(`${label}: rc=${rc}`)
  if (rc !== 0) {
    const tail = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ')
    failed.push(`${label} → ${tail}`)
  }
}

if (failed.length > 0) {
  console.log('FAIL: 原有门禁变红，摘除动作有副作用')
  console.log(failed.map((f) => `  ${f}`).join('\n'))
  process.exit(1)
}
console.log('existing gates still green')
