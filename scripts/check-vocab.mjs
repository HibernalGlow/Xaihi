/**
 * 词表尺：`xaihi.node/v1` 能不能说上游节点真正说的话。
 *
 * 真源不是我们的类型，是那 27 份数据（`<Xiranite>/node-definitions/*.json`）
 * 加上 `<Xiranite>/packages/contract/src/index.ts`（用户 2026-10-06 定的口径）。
 * 判据因此不是"我觉得字段够了"，而是**把上游每份定义喂进我们自己的校验器，看它过不过**。
 *
 * 为什么要基线 + 棘轮而不是"全绿"：还有整块上游形状我们故意不接
 * （`dashboard` 那一族、`custom` 规则等，接了就等于在 Xaihi 里再造一条上游执行模型），
 * 所以读数必然不是 27/27。没有基线的话，"还剩多少"这件事没人知道有没有变坏。
 *
 * 用法：
 *   node scripts/check-vocab.mjs                # 读数 + 与基线比
 *   node scripts/check-vocab.mjs --rebaseline   # 把当前读数写成新基线（要人主动做，不自动）
 *   node scripts/check-vocab.mjs --self-check   # 阳性对照：这把尺必须能拒绝坏定义，也必须能放过好定义
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const UPSTREAM_DEFINITIONS = '/Users/glow/Base/Code/Freya/Xiranite/node-definitions'
const BASELINE = join(ROOT, 'docs/port/vocab-baseline.json')

const sdkUrl = new URL('../packages/node-sdk/lib/index.js', import.meta.url).href
const sdk = await import(sdkUrl)

/** 把 `field kind "url" 不认识` 这类信息里的具体名字抹掉，得到可比的错误类。 */
const shape = (message) => message
  .replace(/["'`][^"'`]*["'`]/g, '<v>')
  .replace(/\s+\d+(\.\d+)?/g, ' <n>')
  .trim()

function audit() {
  if (!existsSync(UPSTREAM_DEFINITIONS)) {
    console.error(`check-vocab: 读不到上游定义目录 ${UPSTREAM_DEFINITIONS}（尺失效，不是"没问题"）`)
    process.exit(1)
  }
  const files = readdirSync(UPSTREAM_DEFINITIONS).filter((f) => f.endsWith('.json')).sort()
  const failures = []
  let passed = 0
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(UPSTREAM_DEFINITIONS, file), 'utf8'))
    const result = sdk.validateNodeDefinition(raw)
    if (result.ok) {
      passed += 1
      continue
    }
    for (const error of result.errors) failures.push({ node: file.replace(/\.json$/, ''), error, shape: shape(error) })
  }
  const classes = new Map()
  for (const item of failures) classes.set(item.shape, (classes.get(item.shape) ?? 0) + 1)
  return { total: files.length, passed, failures, classes: [...classes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) }
}

/** 一把尺如果连"明显的坏定义"都拒不掉，它就不是尺。 */
function selfCheck() {
  const problems = []
  // "好定义"必须拿真定义当夹具，不能自己编：上一版我编的那份连自己的校验器都不过，
  // 于是这条正控变成"永远红"，而永远红的尺和没有尺等价。真源就用本仓已经落地的节点清单。
  const real = JSON.parse(readFileSync(join(ROOT, 'plugins/linedup/package.json'), 'utf8')).xaihi.node
  const good = structuredClone(real)
  if (!sdk.validateNodeDefinition(good).ok) {
    problems.push('好定义被拒了 ⇒ 这把尺只会一律报红，读数没有意义')
  }
  const mutations = [
    ['未知字段 kind', (d) => {
      d.fields[0].kind = 'url-or-whatever'
    }],
    ['扁平规则（少一层 guard）', (d) => {
      d.fields[0].rules = [{ type: 'required' }]
    }],
    ['select 不给选项', (d) => {
      d.fields[0].kind = 'select'
      d.fields[0].options = []
    }],
    ['未知规则 type', (d) => {
      d.fields[0].rules = [{ rule: { type: 'isPrime' } }]
    }],
    ['未知 danger type', (d) => {
      d.danger = { type: 'vibes' }
    }],
    ['动作 id 重复', (d) => {
      // 必须复用一个真实存在的 id：上一版写死 'run'，而 linedup 没有叫 run 的动作，
      // 于是这条"变异"其实造出了合法定义 —— 正控自己错了，红的是夹具不是校验器。
      d.actions.push(structuredClone(d.actions[0]))
    }],
    ['字段 id 重复', (d) => {
      d.fields.push(structuredClone(d.fields[0]))
    }],
    ['缺 nodeId', (d) => {
      delete d.nodeId
    }],
  ]
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(good)
    mutate(candidate)
    const result = sdk.validateNodeDefinition(candidate)
    if (result.ok) problems.push(`${label} 被放过了 ⇒ 校验器在这一维是瞎的`)
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  × ${problem}`)
    process.exit(1)
  }
  console.log(`check-vocab --self-check OK（${mutations.length} 类坏定义全被拒，好定义被放过）`)
  process.exit(0)
}

if (process.argv.includes('--self-check')) selfCheck()

const now = audit()
console.log(`check-vocab: 上游定义 ${now.total} 份，我们的校验器放过 ${now.passed} 份，被拒 ${now.failures.length} 条错误 / ${new Set(now.failures.map((f) => f.node)).size} 个节点`)
for (const [class_, count] of now.classes.slice(0, 12)) console.log(`  ${String(count).padStart(3)}  ${class_}`)

if (process.argv.includes('--rebaseline')) {
  writeFileSync(BASELINE, JSON.stringify({
    schemaVersion: 1,
    note: '词表棘轮：pass 不许降，classes 只许减不许增。上游定义目录是只读真源，改它不在本仓权限内。',
    upstream: UPSTREAM_DEFINITIONS,
    total: now.total,
    passed: now.passed,
    classes: now.classes,
  }, null, 2) + '\n')
  console.log(`  已写基线 ${BASELINE.replace(`${ROOT}/`, '')}`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error('  × 没有基线（docs/port/vocab-baseline.json）：先 `--rebaseline` 并由人看过读数')
  process.exit(1)
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const before = new Map(baseline.classes)
const gone = [...before.keys()].filter((key) => !now.classes.some(([k]) => k === key))
const added = now.classes.filter(([key]) => !before.has(key))
console.log(`  基线 pass=${baseline.passed}/${baseline.total} → 现在 ${now.passed}/${now.total}；消失的错误类 ${gone.length}，新增 ${added.length}`)
if (now.passed < baseline.passed) {
  console.error('  × 过的份数下降了 ⇒ 我们的词表在退化')
  process.exit(1)
}
if (added.length > 0) {
  for (const [key, count] of added) console.error(`  × 新增错误类 (${count})：${key}`)
  process.exit(1)
}
console.log('check-vocab OK')
