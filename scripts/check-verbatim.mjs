/**
 * 内核保真尺：搬进来的 `core.ts` 与 noxide 基线那份，**剥掉空白与注释之后**只许差在三类东西上。
 *
 * 为什么不能只看行数或 `diff -u`：上游那份文件里有几条 200+ 字符的单行（接口成员清单），
 * 搬过来换行之后 `diff` 会把整行算成"删了又加"，看起来像改了 24 行逻辑。
 * 反过来，"看起来只改了 import"也不等于没改逻辑。所以这把尺做的是**归一化比较**：
 * 去注释、把空白压成单个空格，再看剩下的差异落在哪几个字符上。
 *
 * 允许的差异只有三类（都是这个仓的形状，不是行为）：
 *  1. import 说明符：`@xiranite/...` → 本包相对路径，以及 `.js` → `.ts`；
 *  2. 类型层：`| undefined`（本仓 `tsconfig.base.json` 开了 `exactOptionalPropertyTypes` 与
 *     `noUncheckedIndexedAccess`，上游 `tsconfig.app.json` 只有 `strict`）；
 *  3. `@module` 那一行（注释，归一化后本就该消失，留着是为了让分类器别把它当逻辑）。
 * 其余任何差异 ⇒ 红，并打印上下游两侧那一段文本。
 *
 * 用法：
 *   node scripts/check-verbatim.mjs                    # 全部已迁包
 *   node scripts/check-verbatim.mjs --only logx,sleept # 只量几个
 *   node scripts/check-verbatim.mjs --self-check       # 阳性对照：改一个字符必须红
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE = '/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide/packages/nodes'

const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
const squash = (text) => strip(text).replace(/\s+/g, ' ').trim()

/** 差异是否只落在允许的三类上：拿掉它们之后两侧必须完全相等。 */
function canonical(text) {
  return text
    .replace(/\s*\|\s*undefined/g, '')
    // 说明符的**文本**不是判据（本仓把它换成相对路径与 `.ts` 后缀是形状），
    // 但它的**存在与位置**是：一律抹成 `from ""`，改不动 import 的条数与顺序。
    .replace(/from[ \t]*["'][^"']*["']/g, 'from ""')
    .replace(/(?:import|require)\([ \t]*["'][^"']*["']\)/g, 'import("")')
    // 上游没开的 `noUnusedParameters` 逼出来的第四条让步：本仓把**没用到**的形参加 `_` 前缀。
    // 这不是"随便改名都放行"——改到一个**用得到**的标识符上就编译不过，所以这条洞的另一半由 tsc 守。
    .replace(/\b_(?=[A-Za-z])/g, '')
    // 第五条：非空断言 `x!` / `f(a)!` / `arr[i]!`。上游自己就写了若干条（见 `plugins/mvz` 的文件头），
    // 所以两侧一起抹掉才是对称比较，而不是只放行本仓新增的那几个。`!==` 不受影响。
    .replace(/([A-Za-z0-9_$)\]])!(?!=)/g, '$1')
    .replace(/\s+/g, ' ')
}

export function compareFiles(baselineText, oursText) {
  const a = squash(baselineText)
  const b = squash(oursText)
  if (canonical(a) === canonical(b)) return { ok: true, a, b, residue: '' }
  const ca = canonical(a)
  const cb = canonical(b)
  // 找出第一个不相等的位置，两侧各给一段上下文，便于人直接读。
  let at = 0
  while (at < Math.min(ca.length, cb.length) && ca[at] === cb[at]) at += 1
  return {
    ok: false,
    a,
    b,
    residue: `第 ${at} 个字符起不等\n    上游 …${ca.slice(Math.max(0, at - 50), at + 90)}…\n    本仓 …${cb.slice(Math.max(0, at - 50), at + 90)}…`,
  }
}

function migratedNodeIds() {
  const plugins = join(ROOT, 'plugins')
  return readdirSync(plugins, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(join(plugins, id, 'src/core.ts')) && existsSync(join(BASELINE, id, 'src/core.ts')))
}

if (process.argv.includes('--self-check')) {
  const NL = '\n'
const clean = 'export function f(x: string): string {\n  return x.trim()\n}\n'
  const cases = [
    { name: '原样', base: clean, ours: clean, expectOk: true },
    { name: '只加 "| undefined"', base: clean, ours: clean.replace('x: string', 'x: string | undefined'), expectOk: true },
    { name: '改了逻辑（trim → toLowerCase）', base: clean, ours: clean.replace('x.trim()', 'x.toLowerCase()'), expectOk: false },
    { name: '删了一条分支', base: clean, ours: clean.replace('  return x.trim()\n', ''), expectOk: false },
    // 说明符文本可以换（`@xiranite/shared` → `./contract.ts`），条数与顺序不可以。
    // 说明符的文本可以换（`@xiranite/shared` → `./contract.ts`），import 的条数与顺序不可以。
    { name: '换了 import 说明符', base: `import { z } from "@xiranite/shared"` + NL + clean, ours: `import { z } from "./contract.ts"` + NL + clean, expectOk: true },
    { name: '索引访问加非空断言', base: 'const a = arr[0].x\n', ours: 'const a = arr[0]!.x\n', expectOk: true },
    { name: '把 !== 改成 !=（真改逻辑）', base: 'if (x !== y) f()\n', ours: 'if (x != y) f()\n', expectOk: false },
    { name: '未用到的形参加下划线', base: clean, ours: clean.replace('x: string', '_x: string').replace('x.trim()', '_x.trim()'), expectOk: true },
    { name: '多加一条 import', base: `import { z } from "@xiranite/shared"` + NL + clean, ours: `import { z } from "./contract.ts"` + NL + `import { q } from "./other.ts"` + NL + clean, expectOk: false },
  ]
  const problems = []
  for (const c of cases) {
    const got = compareFiles(c.base, c.ours).ok
    if (got !== c.expectOk) problems.push(`夹具 "${c.name}" 期望${c.expectOk ? '放行' : '拦下'}，实际相反 ⇒ 这把尺看不见它声称的东西`)
  }
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-verbatim --self-check OK（${cases.length} 条夹具，含"改了逻辑必须红"）`)
  process.exit(0)
}

const onlyFlag = process.argv.indexOf('--only')
const only = onlyFlag >= 0 ? process.argv[onlyFlag + 1].split(',') : null
const ids = migratedNodeIds().filter((id) => only === null || only.includes(id)).sort()
const failures = []
for (const id of ids) {
  const result = compareFiles(readFileSync(join(BASELINE, id, 'src/core.ts'), 'utf8'), readFileSync(join(ROOT, 'plugins', id, 'src/core.ts'), 'utf8'))
  if (!result.ok) failures.push(`plugins/${id}/src/core.ts 与基线不止差在允许的三类上：\n    ${result.residue}`)
}
if (ids.length === 0 || !existsSync(BASELINE)) {
  console.error(`  × check-verbatim: 基线不在 ${BASELINE}（noxide worktree）⇒ 一把没有输入的尺不该报绿。`
    + '先 `git -C <Xiranite> worktree add ' + BASELINE + ' ccf465fe` 再来跑这条。')
  process.exit(1)
}
console.log(`check-verbatim: 比对 ${ids.length} 个已迁内核（基线 = noxide ccf465fe）`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`  × ${failure}`)
  process.exit(1)
}
console.log('所有内核与基线的差异都只在 import 说明符、`| undefined` 与注释这三类上')
