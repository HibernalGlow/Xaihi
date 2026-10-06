/**
 * 节点包产物尺：每个 `plugins/<id>/lib` 下的 JS 里不许出现**本包没声明**的裸名 import。
 *
 * 为什么要有这条：`marku` 实测踩到过一整类假绿——内核引了 `diff` 与 `remark` 而 `package.json`
 * 没声明，`tsdown` 只打一条 `UNRESOLVED_IMPORT` 警告然后 **rc=0**，产物 `lib` 里的 JS 原样留着
 * `import ... from "diff"`，装进 profile 后第一次调用就 `ERR_MODULE_NOT_FOUND`。
 * 构建的门不会红，测试在仓内也绿不了（当时靠仓外别名硬跑通才算绿）。
 * 浏览器那半边已经有 `packages/ui-host/scripts/check-client-bundle.mjs` 管住产物形状，
 * 节点包这半边此前没有对应尺。
 *
 * 允许的裸名只有三类，逐条给得出理由：
 * - `node:*` 与旧式内置名（Node 侧半边本来就跑在 Node 里）；
 * - 本包 `dependencies` + `peerDependencies` + `optionalDependencies` 里声明过的；
 * - `@hibernalglow/xaihi-sdk`：它在构建期被 `noExternal` 内联进产物（ADR-0002），
 *   真出现在产物里就是内联没做成，所以**不**列为允许项——列进去这条尺就废了。
 *
 * 用法：
 *   node scripts/check-node-bundle.mjs              # 判全部已构建的节点包
 *   node scripts/check-node-bundle.mjs --self-check # 阳性对照：这把尺必须能看见违规
 *   node scripts/check-node-bundle.mjs --dir <路径>  # 只量一个包（自检的夹具走这条）
 *   node scripts/check-node-bundle.mjs --only gifu  # 按包名筛（可逗号接多个）
 *
 * `--only` 这条是给并发用的：全仓跑会把别人正在重编的包算成"没有产物"，
 * 那种红不是本包的事。早先这面旗**根本没接**（写了也当没看见），
 * 于是两条代理各自报过一次"`--only smartzip` rc=0"，实际量的是 27 个包——
 * 一把会忽略旗子的尺比一把红的尺更危险，所以它现在既筛，也在筛不到任何包时报话。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PLUGINS = join(ROOT, 'plugins')

/** Node 内置名（两种写法都要认：`fs` 与 `node:fs`）。 */
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

/** 从一份 JS 文本里取所有裸名说明符（静态 import / 再导出、动态 import、require）。 */
export function bareSpecifiers(source) {
  const out = new Set()
  const patterns = [
    /(?:^|[\n;])[ \t]*(?:import|export)((?:[\w\s,*{}]|\bas\b)*)from[ \t]*['"]([^'"]+)['"]/g,
    /(?:^|[^\w.])(?:import|require)\([ \t]*['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      // 第一条模式的组 1 是中间段、组 2 是说明符；第二条只有组 1 = 说明符。
      const isStatic = match[2] !== undefined
      const spec = isStatic ? match[2] : (match[1] ?? '')
      if (spec.length === 0) continue
      if (isStatic && /^\s*type\b/.test(match[1] ?? '')) continue
      if (spec.startsWith('.') || spec.startsWith('/') || BUILTINS.has(spec.split('/')[0]) || spec.startsWith('node:')) continue
      out.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
    }
  }
  return out
}

function jsFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...jsFiles(path))
    else if (/\.[cm]?js$/.test(entry)) out.push(path)
  }
  return out
}

/** 一个包的读数：缺 `lib/` 与缺 `package.json` 都算违规，不是"跳过"。 */
export function checkPackage(dir) {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return [`${dir.replace(`${ROOT}/`, '')}: 没有 package.json`]
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const allowed = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ])
  const libDir = join(dir, 'lib')
  if (!existsSync(libDir)) return [`${dir.replace(`${ROOT}/`, '')}: 没有 lib/ 产物（尺不看源码，看的是装进 profile 的那份文件）`]
  const problems = []
  for (const file of jsFiles(libDir)) {
    for (const spec of bareSpecifiers(readFileSync(file, 'utf8'))) {
      if (allowed.has(spec)) continue
      problems.push(`${file.replace(`${ROOT}/`, '')}: 产物引了未声明的裸名 "${spec}"（跑起来就是 ERR_MODULE_NOT_FOUND）`)
    }
  }
  return problems
}

const FIXTURES = [
  { name: 'undeclared', files: { 'lib/index.js': 'import { diffLines } from "diff"\nexport const x = 1\n' }, expectProblem: true },
  { name: 'declared', files: { 'package.json': '{"dependencies":{"diff":"9.0.0"}}', 'lib/index.js': 'import { diffLines } from "diff"\n' }, expectProblem: false },
  { name: 'builtins', files: { 'package.json': '{"dependencies":{}}', 'lib/index.js': 'import { readFile } from "node:fs/promises"\nimport os from "os"\n' }, expectProblem: false },
  { name: 'sdk-inlined', files: { 'package.json': '{"dependencies":{}}', 'lib/index.js': 'import { defineNode } from "@hibernalglow/xaihi-sdk"\n' }, expectProblem: true },
  { name: 'dynamic', files: { 'package.json': '{"dependencies":{}}', 'lib/index.js': 'const m = await import("some-thing")\n' }, expectProblem: true },
]

if (process.argv.includes('--self-check')) {
  const tmp = join(ROOT, '.scratch', 'node-bundle-selfcheck')
  const problems = []
  for (const fixture of FIXTURES) {
    const dir = join(tmp, fixture.name)
    // 夹具落在 .scratch/（仓内、gitignore），每个名字自己一个目录，写完立刻按同一把尺量。
    for (const [relative, content] of Object.entries(fixture.files)) {
      const path = join(dir, relative)
      mkdirSync(resolve(path, '..'), { recursive: true })
      writeFileSync(path, content)
    }
    if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{"dependencies":{}}')
    const found = checkPackage(dir).length > 0
    if (found !== fixture.expectProblem) {
      problems.push(`夹具 "${fixture.name}" 期望${fixture.expectProblem ? '有' : '没有'}违规，实际${found ? '有' : '没有'} ⇒ 这把尺看不见它声称的那种情况`)
    }
  }
  if (bareSpecifiers('import type { X } from "types-only"\n').size !== 0) problems.push('`import type` 被算成 value 依赖（类型说明符不该进产物）')
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-node-bundle --self-check OK（${FIXTURES.length} 条夹具与 import type 那条都能被证伪）`)
  process.exit(0)
}

const dirFlag = process.argv.indexOf('--dir')
const onlyFlag = process.argv.indexOf('--only')
if (dirFlag >= 0 && onlyFlag >= 0) {
  console.error('  × `--dir` 与 `--only` 二选一：同时给就不知道以哪个为准（这条尺不猜）。')
  process.exit(1)
}
const allPackages = () =>
  readdirSync(PLUGINS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(PLUGINS, entry.name))
const targets = dirFlag >= 0
  ? [resolve(process.argv[dirFlag + 1])]
  : onlyFlag >= 0
    ? (() => {
      const wanted = process.argv[onlyFlag + 1].split(',').map((name) => name.trim()).filter((name) => name !== '')
      const picked = allPackages().filter((dir) => wanted.includes(dir.split('/').pop()))
      const missed = wanted.filter((name) => !picked.some((dir) => dir.endsWith(`/${name}`)))
      if (picked.length === 0) {
        console.error(`  × --only ${wanted.join(',')}：plugins/ 下没有这些包目录 ⇒ 一把筛空了的尺不该报绿`)
        process.exit(1)
      }
      if (missed.length > 0) console.log(`  · --only 里没找到的包名：${missed.join(' ')}（其余 ${picked.length} 个照常量）`)
      return picked
    })()
    : allPackages()

const all = targets.flatMap(checkPackage)
console.log(`check-node-bundle: 比对 ${targets.length} 个节点包的产物`)
if (all.length > 0) {
  for (const problem of all) console.error(`  × ${problem}`)
  process.exit(1)
}
console.log('节点包产物里没有未声明的裸名 import')
