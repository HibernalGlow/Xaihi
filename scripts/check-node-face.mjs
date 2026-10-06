/**
 * 节点界面上屏的判据尺：`packages/ui-host/dist-ui/` 里那份文档产物，**是不是真的把每个节点的组件编进去了**。
 *
 * 为什么要有这把尺：ADR-0014 定了"第一方节点界面在 Xaihi 自己的文档 realm 里同realm渲染"，
 * 载体是 `pnpm run build:document` 出来的 `dist-ui/main.js`。这条路的验收判据一开始写错过——
 * 早先是在 `lib/client.js`（DSH 插件的客户端半边）里搜节点串，那个判据从根上就不成立：
 * 节点界面根本不进那份产物（见 ADR-0014 §后果）。判据放错地方比没有判据更糟，
 * 因为它会给出"绿的"和"红了"两种都不属于事实的信号。
 *
 * 判据的形状：**源码里的字面串在产物里还在**。为什么这是可证的而不是玄学：
 * rspack 把 `src/nodes/<id>/Component.tsx` 编进图里时，JSX 里的使用者可见文案（中文串）
 * 会原样留在产物；一个没进图的模块，它的文案不可能出现。所以"搜得到"= 进了产物。
 * 反过来"搜不到"只在**该串对本节点是唯一**时才是缺面证据——同一个短语被三个节点共用时，
 * 搜到不代表那个节点在，所以这类串标 `ambiguous` 并**另找一个唯一串**，找不到就报"无法判定"而不是报绿。
 *
 * 用法：
 *   node scripts/check-node-face.mjs                     # 量 dist-ui（缺目录 ⇒ 红，不静默跳过）
 *   node scripts/check-node-face.mjs --self-check        # 阳性对照：夹具里"在的判在、不在的判不在"
 *   node scripts/check-node-face.mjs --dist <dir> --nodes <dir>
 *
 * 这条尺**故意还没接进 `pnpm test`**：文档产物目前还编不出来（`build:document` 的红由并发 lane 在收），
 * 接进去等于把"还没有产物"这件事变成全仓的红。接线时机是 `dist-ui/main.js` 第一次落地并且逐节点判得出。
 */

import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_NODES = join(ROOT, 'packages/ui-host/src/nodes')
const DEFAULT_DIST = join(ROOT, 'packages/ui-host/dist-ui')

/** 组件源文件名的候选：搬运树里两种命名都存在。 */
const COMPONENT_NAMES = ['Component.tsx', 'component.tsx']

/**
 * 组件源码里的中文串候选。**量词必须贪婪**：`{2,}?` 是"至少 2 但尽量少吃"，
 * 每条都只截到 3 字，再被下面的长度闸门全部拒掉 ⇒ 夹具里三个节点都判"判不了"，
 * 而这把尺自己的阳性对照正好当场把这件事报成红（这就是它存在的理由）。
 */
const chineseRuns = (text) => text.match(/[一-龥][^"'`<>{}\n\\=]{2,}/g) ?? []

/**
 * 从一份组件源码里挑"只属于这个节点"的字面串。
 * `others` 是其余节点全部源码拼起来的文本——出现在别处过的串一律不算唯一证据。
 */
export function pickProbes(componentText, othersText, wanted = 3) {
  const seen = new Set()
  const picks = []
  for (const run of chineseRuns(componentText)) {
    if (run.length < 4 || seen.has(run)) continue
    seen.add(run)
    if (othersText.includes(run)) continue
    picks.push(run)
    if (picks.length >= wanted) break
  }
  return picks
}

/**
 * 一个节点面的判决：present / missing / undecidable（挑不出唯一串）/ noEntry（这个节点还没有面）。
 * `othersText` 是**其余节点**的源码拼起来的文本：出现在别人那里的串不算这个节点的唯一证据。
 */
export function judgeNode({ id, ownText, hasEntry, distText }) {
  if (!hasEntry) return { id, state: 'noEntry', probes: [], note: '没有 entry.ts ⇒ 这个节点还没有面' }
  if (ownText === null) {
    return { id, state: 'undecidable', probes: [], note: '有 entry.ts 但找不到组件源文件 ⇒ 判不了，不当它是绿' }
  }
  const probes = pickProbes(ownText, othersPlaceholder.get(id) ?? '', 3)
  if (probes.length === 0) {
    return { id, state: 'undecidable', probes, note: '组件里挑不出"只属于本节点"的中文串 ⇒ 这把尺看不见它，不许报绿' }
  }
  const hit = probes.filter((probe) => distText.includes(probe))
  return {
    id,
    state: hit.length === probes.length ? 'present' : 'missing',
    probes,
    note: hit.length === probes.length ? '' : `产物里搜不到：${probes.filter((p) => !hit.includes(p)).join(' / ')}`,
  }
}

/** 跨节点唯一性要的"其余节点源码"，按节点 id 现填（judgeNode 因此能单独测，也能成批测）。 */
const othersPlaceholder = new Map()

/** 全量判决：读目录、拼其余源码、逐节点判。 */
export function judgeAll({ nodesDir, distFiles }) {
  const ids = readdirSync(nodesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .map((entry) => entry.name)
    .sort()
  const texts = new Map()
  const entries = new Set()
  for (const id of ids) {
    if (existsSync(join(nodesDir, id, 'entry.ts'))) entries.add(id)
    for (const name of COMPONENT_NAMES) {
      const path = join(nodesDir, id, name)
      if (existsSync(path)) texts.set(id, readFileSync(path, 'utf8'))
    }
  }
  const distText = distFiles.map((path) => readFileSync(path, 'utf8')).join('\n')
  othersPlaceholder.clear()
  for (const id of ids) {
    othersPlaceholder.set(id, [...texts.entries()].filter(([otherId]) => otherId !== id).map(([, text]) => text).join('\n'))
  }
  return ids.map((id) => judgeNode({
    id,
    ownText: texts.has(id) ? texts.get(id) : null,
    hasEntry: entries.has(id),
    distText,
  }))
}

/** 只有被当命令跑时才走 CLI；被 import（测试、别的尺）不许有副作用。 */
const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

const SELF_CHECK_DIR = join(ROOT, '.scratch', 'node-face-selfcheck')

/** 夹具落盘：两个"节点"（一个在产物里、一个不在）+ 一份共用串的对照组 + 一个哨兵串。 */
function buildFixtures() {
  rmSync(SELF_CHECK_DIR, { recursive: true, force: true })
  const nodes = join(SELF_CHECK_DIR, 'nodes')
  const dist = join(SELF_CHECK_DIR, 'dist')
  for (const id of ['alpha', 'bravo', 'sharedword']) {
    mkdirSync(join(nodes, id), { recursive: true })
    writeFileSync(join(nodes, id, 'entry.ts'), `export default { def: {}, Component: () => null }\n`)
  }
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(nodes, 'alpha', 'Component.tsx'), `const t = { title: "独一份的阿尔法标题" }\nexport const Component = () => null\n`)
  writeFileSync(join(nodes, 'bravo', 'Component.tsx'), `const t = { title: "独一份的布拉沃标题" }\nexport const Component = () => null\n`)
  // 两个节点共用同一个短语 ⇒ 这一档必须走"跨节点唯一性"重挑，不能靠那句判在。
  writeFileSync(join(nodes, 'sharedword', 'Component.tsx'), `const t = { a: "都一样", b: "独一份的共享词节点" }\nexport const Component = () => null\n`)
  writeFileSync(join(dist, 'main.js'), `// 产物里有阿尔法那句，没有布拉沃那句\nconst s = "独一份的阿尔法标题 都一样 独一份的共享词节点"\n`)
  return { nodes, dist }
}

if (isMain && process.argv.includes('--self-check')) {
  const { nodes, dist } = buildFixtures()
  const distFiles = readdirSync(dist).map((name) => join(dist, name))
  const rows = judgeAll({ nodesDir: nodes, distFiles })
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.state]))
  const problems = []
  // 三条判据：在的判在、不在的判不在、共用串那条不能因为"产物里有那句"就直接算证据（要另挑唯一串）。
  if (byId.alpha !== 'present') problems.push(`夹具 alpha 期望 present，实际 ${byId.alpha} ⇒ 这把尺看不见真在图里的节点`)
  if (byId.bravo !== 'missing') problems.push(`夹具 bravo 期望 missing，实际 ${byId.bravo} ⇒ 阴性对照失败，这把尺看不见真缺的节点`)
  if (byId.sharedword !== 'present') problems.push(`夹具 sharedword 期望 present（靠它自己那句唯一串），实际 ${byId.sharedword}`)
  const alphaRow = rows.find((row) => row.id === 'alpha')
  if (alphaRow && alphaRow.probes.includes('都一样')) problems.push('夹具 alpha 把跨节点共用串当唯一证据了 ⇒ 阳性对照不成立')
  // 空产物必须全红，而不是"什么都没搜到所以不算数"。
  const empty = judgeAll({ nodesDir: nodes, distFiles: [] })
  if (!empty.every((row) => row.state === 'missing' || row.state === 'undecidable')) {
    problems.push('没有产物时这把尺仍报了 present ⇒ 空输入被判绿')
  }
  rmSync(SELF_CHECK_DIR, { recursive: true, force: true })
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-node-face --self-check OK（${rows.length} 个夹具节点：真在的判在、真缺的判缺、共用串不当证据、空产物不判绿）`)
  process.exit(0)
}

if (!isMain) {
  // import 进来的调用方只拿导出函数。
} else {
const argOf = (flag) => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}
const nodesDir = argOf('--nodes') ?? DEFAULT_NODES
const distDir = argOf('--dist') ?? DEFAULT_DIST

if (!existsSync(nodesDir)) {
  console.error(`  × 节点目录不在 ${nodesDir} ⇒ 没有输入的尺不该报绿`)
  process.exit(1)
}
if (!existsSync(distDir)) {
  console.error(`  × 文档产物不在 ${distDir}（先 \`pnpm --filter @hibernalglow/xaihi-ui-host run build:document\`）`
    + '⇒ "节点界面上屏"这句在没有产物的时候不成立，也不许被报成成立')
  process.exit(1)
}
const distFiles = readdirSync(distDir).filter((name) => /\.(js|mjs)$/.test(name)).map((name) => join(distDir, name))
if (distFiles.length === 0) {
  console.error(`  × ${distDir} 里没有 js/mjs 产物 ⇒ 同上，判红不判绿`)
  process.exit(1)
}

const rows = judgeAll({ nodesDir, distFiles })
const counts = { present: 0, missing: 0, undecidable: 0, noEntry: 0 }
for (const row of rows) counts[row.state] += 1
console.log(`check-node-face: ${rows.length} 个节点目录，产物 ${distFiles.length} 份（${distDir.replace(`${ROOT}/`, '')}）`)
for (const row of rows) {
  const mark = row.state === 'present' ? '✓' : row.state === 'noEntry' ? '·' : '×'
  console.log(`  ${mark} ${row.id.padEnd(10)} ${row.state}${row.note ? ` — ${row.note}` : ''}`)
}
console.log(`小计：present ${counts.present} · missing ${counts.missing} · 判不了 ${counts.undecidable} · 无面 ${counts.noEntry}`)
if (counts.missing > 0 || counts.undecidable > 0) {
  console.error(`check-node-face: FAIL（缺面 ${counts.missing}、判不了 ${counts.undecidable}）`)
  process.exit(1)
}
console.log('每个有 entry.ts 的节点，其唯一文案都能在文档产物里搜到')
}
