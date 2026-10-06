/**
 * TUI 这一腿的诚实尺：**跑一次 `ui`，看它说到哪一层**。
 *
 * 为什么要有这条：仓里已经有一份很好的运行时探测
 * （`packages/cli-runtime/src/tui/runtime-capability.ts`，探"能不能把 OpenTUI 起来"，
 * 失败就给可读退化，绝不偷偷换运行时）。但我现读它是**一条没人走的死路**——
 * `rg probeTerminalRuntime` 在所有节点包里零命中，26 个节点的 `ui` / `gd` 各自手写拒绝文案。
 * 手写本身不是错（拒绝得响亮 + 点名缺的缝就是本仓要求的形状），
 * 错的是"这件事是否仍然成立"没人管：哪天某条 `ui` 变成 rc=1 崩掉、
 * 或者退化成只说"未接"两个字，不会有任何东西变红。
 *
 * 判据按**真跑**的结果分四档（不是 grep 出来的）：
 * - `refused-named`：rc=2 且文案点名至少一条具体的缝（OpenTUI / @clack / ctx.fs / subprocess / node:ffi / storage）
 *   ⇒ 现状应该全部落这一档；
 * - `works`：rc=0 ⇒ 那条腿真的接上了（将来该往这档走，同时 `probeTerminalRuntime` 就该有人引用）；
 * - `refused-vague`：rc=2 但没点名任何缝 ⇒ 红（使用者读到的是"未接"，不是"缺什么、怎么补"）；
 * - `crashed`：其它退码或没有输出 ⇒ 红（未接的能力不该以崩收场，ADR-0011 决定 4）。
 *
 * 另记一条不判红只报数的：几个包真去走了那份共享探测（现在 0）。
 *
 * 用法：
 *   node scripts/check-tui-face.mjs                 # 量全部有 bin 的节点包
 *   node scripts/check-tui-face.mjs --only logx      # 按包名筛（逗号接多个）
 *   node scripts/check-tui-face.mjs --self-check     # 阳性对照：四档各自必须落对
 *
 * 这条**故意还没接进 `pnpm test`**：它现在全绿，接进去没有代价——
 * 但 spawn 26 个 CLI 要几秒，且 `check:cliface` 已经在跑同一批 bin；
 * 等哪天真有包从 `refused-named` 转成 `works`，这条才成为"退化是否还诚实"的门禁。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PLUGINS = join(ROOT, 'plugins')
const LEGS = ['ui', 'gd']

/** 点名的缝：这些词出现才算"说了缺什么"，而不是只说"未接"。 */
const NAMED_SEAMS = /OpenTUI|@clack|ctx\.fs|subprocess|node:ffi|storage domain|宿主进程/i

export function classifyRun(rc, output) {
  const text = `${output ?? ''}`.trim()
  if (rc === 0) return { state: 'works', note: text.split('\n')[0]?.slice(0, 70) ?? '' }
  if (rc === 2) {
    if (text === '') return { state: 'refused-vague', note: 'rc=2 但没有任何输出' }
    return NAMED_SEAMS.test(text)
      ? { state: 'refused-named', note: text.split('\n')[0]?.slice(0, 70) ?? '' }
      : { state: 'refused-vague', note: `文案没点名任何缝：${text.split('\n')[0]?.slice(0, 60) ?? ''}` }
  }
  return { state: 'crashed', note: `rc=${rc}；首行 ${text.split('\n')[0]?.slice(0, 60) ?? '(空)'}` }
}

/** 一个节点包的判决：跑它每条交互腿。 */
export function judgePackage({ pluginsDir, id, legs = LEGS }) {
  const pkgDir = join(pluginsDir, id)
  const pkgPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgPath)) return { id, rows: [], skipped: 'no package.json' }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const binEntry = Object.values(pkg.bin ?? {})[0]
  if (typeof binEntry !== 'string') return { id, rows: [], skipped: '没有 bin（这个节点还没有终端面）' }
  const binPath = join(pkgDir, binEntry)
  if (!existsSync(binPath)) return { id, rows: [], skipped: null, broken: `bin 指向 ${binEntry}，文件不在` }
  const rows = legs.map((leg) => {
    const run = spawnSync(process.execPath, [binPath, leg], { cwd: pkgDir, encoding: 'utf8', timeout: 20_000 })
    const verdict = classifyRun(run.status, `${run.stdout ?? ''}${run.stderr ?? ''}`)
    return { leg, bin: Object.keys(pkg.bin)[0], ...verdict }
  })
  return { id, rows, skipped: null }
}

/** 有多少包真去走那份共享探测（只报数，不判红：接线要等依赖装得上）。 */
export function probeAdoption(pluginsDir = PLUGINS) {
  const users = []
  for (const id of readdirSync(pluginsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const srcDir = join(pluginsDir, id, 'src')
    if (!existsSync(srcDir)) continue
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.ts')) continue
      if (/probeTerminalRuntime/.test(readFileSync(join(srcDir, name), 'utf8'))) users.push(id)
    }
  }
  return users
}

export function judgeAll({ pluginsDir = PLUGINS, only = null, legs = LEGS }) {
  const ids = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => only === null || only.includes(id))
    .sort()
  return ids.map((id) => judgePackage({ pluginsDir, id, legs }))
}

if (process.argv.includes('--self-check')) {
  // 四档各造一个假 bin：这把尺必须分得开"诚实拒绝 / 空话拒绝 / 真接上 / 崩"。
  const dir = mkdtempSync(join(tmpdir(), 'xaihi-tui-face-'))
  const mk = (id, body) => {
    const at = join(dir, id)
    mkdirSync(join(at, 'src'), { recursive: true })
    writeFileSync(join(at, 'src', 'cli.js'), body)
    writeFileSync(join(at, 'package.json'), JSON.stringify({ name: `@fixture/${id}`, bin: { [`x${id}`]: './src/cli.js' } }))
  }
  mk('named', 'console.error("`x named ui` 未接：全屏 TUI（OpenTUI 的 Tui.tsx）不随本包发布，执行只活在宿主进程里（ctx.fs）"); process.exit(2)\n')
  mk('vague', 'console.error("未接"); process.exit(2)\n')
  mk('works', 'console.log("TUI frame painted"); process.exit(0)\n')
  mk('crash', 'throw new Error("boom")\n')
  mk('nobin', 'console.log(1)\n')
  writeFileSync(join(dir, 'nobin', 'package.json'), JSON.stringify({ name: '@fixture/nobin' }))
  const byId = Object.fromEntries(judgeAll({ pluginsDir: dir }).map((r) => [r.id, r]))
  const state = (id, leg = 'ui') => byId[id]?.rows?.find((r) => r.leg === leg)?.state ?? byId[id]?.skipped ?? '?'
  const problems = []
  if (state('named') !== 'refused-named') problems.push(`点名缝的拒绝被判 ${state('named')} ⇒ 好的那一半认不出来`)
  if (state('vague') !== 'refused-vague') problems.push(`只说"未接"的被判 ${state('vague')} ⇒ 这条尺对空话放行`)
  if (state('works') !== 'works') problems.push(`真跑起来的被判 ${state('works')} ⇒ 将来接上以后这条会认不出进步`)
  if (state('crash') !== 'crashed') problems.push(`抛异常的被判 ${state('crash')} ⇒ 崩了也不会红`)
  if (state('nobin') !== '没有 bin（这个节点还没有终端面）') problems.push(`没有 bin 的被判 ${state('nobin')} ⇒ "这个节点还没有终端面"这一档看不见`)
  if (probeAdoption(dir).length !== 0) problems.push('夹具里没有引用探测的包，probeAdoption 却数出了东西')
  rmSync(dir, { recursive: true, force: true })
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log('check-tui-face --self-check OK（5 个夹具：诚实拒绝 / 空话拒绝 / 真接上 / 崩 / 没有终端面，各判各的）')
  process.exit(0)
}

const argOf = (flag) => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}
const onlyArg = argOf('--only')
const only = onlyArg === undefined ? null : onlyArg.split(',').map((s) => s.trim()).filter(Boolean)

const results = judgeAll({ only })
if (only !== null && results.length === 0) {
  console.error(`  × --only ${onlyArg} 一个包都没筛到 ⇒ 筛空了不该报绿`)
  process.exit(1)
}
const counts = { 'refused-named': 0, works: 0, 'refused-vague': 0, crashed: 0 }
let noBin = 0
let broken = 0
for (const result of results) {
  if (result.broken) {
    broken += 1
    console.error(`  × ${result.id}：${result.broken}`)
    continue
  }
  if (result.skipped) {
    noBin += 1
    continue
  }
  for (const row of result.rows) {
    counts[row.state] = (counts[row.state] ?? 0) + 1
    if (row.state !== 'refused-named') console.log(`  ${row.state === 'works' ? '✓' : '×'} ${result.id} ${row.leg} · ${row.state} — ${row.note}`)
  }
}
const users = probeAdoption()
console.log(`check-tui-face: ${results.length} 个包，其中 ${noBin} 个还没有终端面（没 bin）；`
  + `腿的判决 works ${counts.works} / 诚实拒绝 ${counts['refused-named']} / 空话拒绝 ${counts['refused-vague']} / 崩 ${counts.crashed}`)
console.log(`  · 真走共享探测（probeTerminalRuntime）的包：${users.length} 个${users.length === 0 ? ' ⇒ 那份探测目前是没人走的死路，等 @opentui 装得上再接' : ` — ${users.join(' ')}`}`)
const bad = counts['refused-vague'] + counts.crashed + broken
if (bad > 0) {
  console.error(`check-tui-face: FAIL（空话拒绝 ${counts['refused-vague']}、崩 ${counts.crashed}、bin 坏 ${broken}）`)
  process.exit(1)
}
console.log('每条交互腿要么真跑得起来，要么响亮拒绝并点名缺的那条缝')
