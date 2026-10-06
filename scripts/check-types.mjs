/**
 * 类型检查的门禁：按**归属**分桶，而不是把所有红混成一个数字。
 *
 * 为什么必须有归属这一层：搬运树是按上游那台装配的尺写的
 * （`<Xiranite>/tsconfig.app.json` 有 `strict`，但**没有** `noUncheckedIndexedAccess`、
 * 没有 `exactOptionalPropertyTypes`；Xaihi 的 `tsconfig.base.json` 两条都加）。
 * 用一把更严的尺去量 613 个搬运文件，实测出 1074 条红，其中 502 条只是这两面旗子的口味差。
 * 那"修"它的正确做法不是在他界面里塞 500 个 `!`（那是重写，违反 ADR-0006），
 * 而是**两把尺分别跑**：`tsconfig.json` 量我们自己写的，`tsconfig.ported.json` 按上游的口味量搬来的。
 *
 * 这不是把红藏起来：两个项目的错误全部打印，桶里有多少条一目了然，
 * `--fail-on-all` 就是给"搬运接线做完"那天的口径（届时 ported 桶必须为 0）。
 * 默认判据是 **Xaihi 自己的代码必须为 0** —— 别的包的账记在别的包身上。
 *
 * 用法：
 *   node scripts/check-types.mjs                 # 跑两个项目，own 桶非空即 rc=1
 *   node scripts/check-types.mjs --fail-on-all    # 任何桶非空都 rc=1（接线完成后的口径）
 *   node scripts/check-types.mjs --self-check     # 阳性对照：分桶与判据本身必须能被证伪
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PKG = join(ROOT, 'packages/ui-host')

/** 一行的归属。路径是 tsc 打出来的原样（相对各自项目目录）。 */
function bucketOf(line) {
  const file = line.split('(')[0] ?? line
  if (file.startsWith('../')) return 'otherPackages'
  if (file.startsWith('src/client/') || file.startsWith('tests/')) return 'own'
  if (file.startsWith('src/')) return 'ported'
  return 'otherPackages'
}

const EMPTY = { own: 0, ported: 0, otherPackages: 0 }

function classify(lines) {
  const counts = { ...EMPTY }
  for (const line of lines) {
    if (!/\berror TS\d+/.test(line)) continue
    counts[bucketOf(line)] += 1
  }
  return counts
}

function runProject(project) {
  const result = spawnSync('pnpm', ['exec', 'tsc', '-p', project, '--noEmit'], {
    cwd: PKG,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const lines = `${result.stdout ?? ''}${result.stderr ?? ''}`.split('\n')
  return { project, rc: result.status ?? 1, lines, counts: classify(lines) }
}

const POSITIVE_CONTROL = `src/client/broken.ts(1,1): error TS2322: own code is wrong
src/components/ui/button.tsx(2,2): error TS7006: ported code is looser on purpose
src/lib/design-theme/contract.ts(3,3): error TS18048: boundary file pulled in by our code
../api/src/client.ts(4,4): error TS2307: another package's own debt
no error here at all`

if (process.argv.includes('--self-check')) {
  const got = classify(POSITIVE_CONTROL.split('\n'))
  const problems = []
  if (got.own !== 1) problems.push(`own 桶应当抓到 1 条，实际 ${got.own} ⇒ 这把尺看不见我们自己的红`)
  if (got.ported !== 2) problems.push(`ported 桶应当是 2 条，实际 ${got.ported}（边界文件必须落在 ported，不是 own）`)
  if (got.otherPackages !== 1) problems.push(`otherPackages 应当是 1 条，实际 ${got.otherPackages}`)
  // 判据本身也要能红：own=0 而 ported>0 时默认放行、加 --fail-on-all 时必须拦。
  if (classify(POSITIVE_CONTROL.replace(/^src\/client.*$/m, 'clean').split('\n')).own !== 0) {
    problems.push('把 own 那行去掉之后 own 桶还非空 ⇒ 上面那条正控是假的')
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  × ${problem}`)
    process.exit(1)
  }
  console.log('check-types --self-check OK（四个归属与默认放行条件都能被证伪）')
  process.exit(0)
}

const failOnAll = process.argv.includes('--fail-on-all')
const projects = [runProject('tsconfig.json'), runProject('tsconfig.ported.json')]
const totals = { ...EMPTY }
for (const project of projects) {
  for (const key of Object.keys(totals)) totals[key] += project.counts[key]
  const label = project.project === 'tsconfig.json' ? 'Xaihi 自己的代码（仓级严格度）' : '搬运树（上游的严格度）'
  console.log(`${project.project}  ${label}: tsc rc=${project.rc}  own=${project.counts.own} ported=${project.counts.ported} 别的包=${project.counts.otherPackages}`)
  const first = project.lines.filter((line) => /\berror TS\d+/.test(line)).slice(0, 5)
  for (const line of first) console.log(`    ${line}`)
  const hidden = project.lines.filter((line) => /\berror TS\d+/.test(line)).length - first.length
  if (hidden > 0) console.log(`    …还有 ${hidden} 条（完整输出：pnpm exec tsc -p ${project.project} --noEmit）`)
}

console.log(`归属合计：own(必须为 0)=${totals.own}  ported=${totals.ported}  别的包=${totals.otherPackages}`)
const failing = failOnAll ? Object.values(totals).some((n) => n > 0) : totals.own > 0
if (failing) {
  console.error(failOnAll ? 'check-types FAILED：任一归属都不许有红' : 'check-types FAILED：Xaihi 自己的代码有红')
  process.exit(1)
}
console.log(`check-types OK（own=0）${totals.ported + totals.otherPackages > 0 ? `——注意：搬运树还欠 ${totals.ported} 条、别的包 ${totals.otherPackages} 条，用 --fail-on-all 收紧` : ''}`)
