/**
 * 移植搬运器：把 Xiranite 的 UI 树原样搬进 packages/ui-host，并记下来源指纹。
 *
 * 为什么需要「来源指纹」这一件：设计语言最新的那批配方（swiss / lonestar 的标签与
 * 校准表）**只存在于用户的工作树里**，`git archive HEAD` 拿不到 —— 实测 HEAD 的
 * `i18n/locales/en.json` 缺 swiss/lonestar 两条 label，noxide 基线连配方都没有，
 * 于是上游自己那条「每份配方必须有中英标签」的尺（`registry.test.ts`）在混基线时必红。
 * 真源只能是「移植时点的工作树快照」，而快照要可 diff，就得留下每个文件的 sha256。
 *
 * 这个脚本是幂等的：重复跑只会按同一张表覆盖，不做任何改写（别名、格式、注释全原样）。
 *
 * **判"删了"只认工作树那一列。** `git status --porcelain` 的 `D ` 是"index 里没有"
 * （GitButler 的虚拟分支经常这样，文件还在盘上），` D` 才是"人删了"。
 * 本轮先按 `includes('D')` 写错过一次，把设计语言引擎整棵 41 个文件从目标里删掉了——
 * 是 157 条尺里的 4 条当场红掉才拦住的（`Cannot find module "../lib/design-theme/contract.ts"`）。
 * 每个文件的来源状态一并记进 manifest（`state`: `head` / `modified` / `untracked`），
 * 将来与上游同步时才知道哪些是"他改过、要融合"、哪些是"原样搬来的"。
 *
 * 用法：node scripts/port-ui.mjs [--check]
 *   无参数 = 搬运 + 写 manifest；--check = 只比对不写，红在未同步。
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE = '/Users/glow/Base/Code/Freya/Xiranite/src'
const DEST = join(ROOT, 'packages/ui-host/src')
const MANIFEST = join(ROOT, 'docs/port/xiranite-ui.json')
const DELTAS = join(ROOT, 'docs/port/xaihi-deltas.json')

const SOURCE_REPO = '/Users/glow/Base/Code/Freya/Xiranite'

/**
 * 源仓工作树的脏状态表：`src/` 相对路径 → `head` / `modified` / `untracked` / `deleted`。
 * 读不到 git 状态（例如源目录不是仓库）时全部按 `head` 处理，但会把"没读到"如实记下来。
 */
function upstreamStates() {
  let out
  try {
    out = execFileSync('git', ['-C', SOURCE_REPO, 'status', '--porcelain', 'src'], { encoding: 'utf8' })
  } catch (error) {
    console.warn(`port-ui: 读不到上游 git 状态（${error.message.split('\n')[0]}），本轮不剔除标删文件`)
    return { states: new Map(), available: false }
  }
  // 一个路径可能出现多行（实测：`D  src/...` 与 `?? src/...` 同时出现——那是"从 index 里挪走
  // 但文件还在盘上"，GitButler 的虚拟分支经常这样）。所以先收齐每个路径的全部状态再裁决。
  const perPath = new Map()
  for (const line of out.split('\n').filter(Boolean)) {
    const xy = line.slice(0, 2)
    let rel = line.slice(3).trim()
    // rename/copy 行的形状是 `old -> new`，要的是新路径。
    const arrow = rel.indexOf(' -> ')
    if (arrow >= 0) rel = rel.slice(arrow + 4)
    rel = rel.replace(/^src\//, '')
    if (!rel) continue
    const seen = perPath.get(rel) ?? new Set()
    seen.add(xy)
    perPath.set(rel, seen)
  }
  const states = new Map()
  for (const [rel, seen] of perPath) {
    // **只有工作树那一列（xy[1]）说 D 才是"人把它删了"**；第一列的 D 只表示 index 里没有，
    // 文件常常还在盘上——本轮实测 41 个文件（含设计语言引擎整棵）就是这么被误判的，
    // 判据错在一次 `xy.includes('D')`。文件在不在盘上由目录遍历说了算，这里只负责分类。
    const worktreeDeleted = [...seen].some((xy) => xy[1] === 'D')
    const untracked = [...seen].some((xy) => xy === '??')
    const touched = [...seen].some((xy) => /[MA]/.test(xy))
    states.set(rel, worktreeDeleted && !untracked ? 'deleted' : untracked ? 'untracked' : touched ? 'modified' : 'head')
  }
  return { states, available: true }
}

/**
 * 上游 `src/` 下要搬的子树（相对 `src/`）。
 *
 * 只有**一个基线**：移植时点的 Xiranite 工作树。曾按 tag `noxide` 搬过第一轮，
 * 那批文件现在整棵被覆盖 —— 因为混基线会被上游自己的尺抓到：`registry.test.ts` 要求
 * 「每份被注册的配方在中英两份 i18n 里都有 label」，而 swiss/lonestar 的标签**只在
 * 工作树里**（noxide 没有这两份配方，HEAD 2694975 也只有 native/md3/mondrian/wuling）。
 * 换基线不是口味，是让一条真判据能红。
 *
 * `nodes/` 只点到已迁宿主半边的那四个 + `shared/`（L3）：其余 36 个节点的界面是后面的批次。
 */
const INCLUDE_DIRS = [
  // 外壳自己那三棵子树：搬运第一轮漏了，症状是 30 条 `@/` 边解析不到
  // （`@/actions/wheelPreferences` x5、`@/plugins/*` x8、`@/desktop/tray/*` x3）。
  // 判据不是"看着不像 UI"，是"消费者的 import 落不落地"。
  'actions',
  'plugins',
  'desktop',
  'components/ui',
  'components/data-table',
  'components/niko-table',
  'components/context-menu',
  'components/help',
  'components/workspace',
  'components/views',
  'components/modules',
  'nodes/shared',
  'nodes/linedup',
  'nodes/sleept',
  'nodes/dissolvef',
  'nodes/findz',
  // 批次 E：宿主半边正在并行迁移的四个节点，界面按同一张表一起搬（L4）。
  'nodes/logx',
  'nodes/recycleu',
  'nodes/timeu',
  'nodes/samea',
  'lib',
  'hooks',
  'store',
  'config',
  'types',
  'i18n',
  'assets',
  'styles',
  'vendor',
  // 上游 UI 半边与宿主之间的那道接缝，14 个 RPC 客户端模块 / 48 处引用。
  // 原样搬，不在搬运这一轮改写：把它换成 DSH 的形状是接线那一步的活儿（docs/service-mapping.md）。
  'backend',
]
const INCLUDE_FILES = ['App.tsx', 'components/use-theme.ts']

/** 浏览器夹具类测试要 Playwright/真 DOM 接线，这一层还没定，先不带过来。 */
const SKIP = /(\.browser\.test\.tsx?|\.e2e\.test\.tsx?|__screenshots__)/

const walk = (dir) => {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

const wanted = () => {
  const files = []
  for (const dir of INCLUDE_DIRS) {
    const abs = join(SOURCE, dir)
    if (!existsSync(abs)) {
      console.error(`missing upstream subtree: ${dir}`)
      process.exit(1)
    }
    for (const path of walk(abs)) {
      const rel = relative(SOURCE, path).split('/').join('/')
      if (SKIP.test(rel)) continue
      files.push(rel)
    }
  }
  for (const rel of INCLUDE_FILES) {
    if (!existsSync(join(SOURCE, rel))) {
      console.error(`missing upstream file: ${rel}`)
      process.exit(1)
    }
    files.push(rel)
  }
  return files.sort()
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const check = process.argv.includes('--check')
const { states, available } = upstreamStates()
const allWanted = wanted()
const skipped = allWanted.filter((rel) => states.get(rel) === 'deleted')
const files = allWanted.filter((rel) => states.get(rel) !== 'deleted')
if (skipped.length > 0) console.log(`port-ui: 跳过上游已标删的 ${skipped.length} 个文件（不搬进 Xaihi）`)
if (!available) console.log('port-ui: 上游 git 状态不可用 ⇒ manifest 的 state 一律记 head（不代表已核对）')
const recorded = {}
let copied = 0
let drifted = 0
let missing = 0
/**
 * 被显式申报过的本地改动：`{ 上游相对路径: {reason, ours: sha256} }`。
 * 命中它才算同步，而且**必须连我们这一版的 sha 一起对上**——
 * 只在名单里出现就放行，等于把这条尺变成一张"谁改了没人知道"的白名单。
 * 有这个机制是因为并发是常态：本轮实测另一条 lane 在 23:15 改了
 * `components/views/settings/RuntimeSection.tsx`（比上游少了几条 import），
 * 那时"目标必须与上游逐字节相等"这条判据会把它当漂移，而搬运器再跑一次就会**覆盖掉他的改动**。
 */
const declaredDeltas = existsSync(DELTAS) ? JSON.parse(readFileSync(DELTAS, 'utf8')).deltas ?? {} : {}

for (const rel of files) {
  const src = join(SOURCE, rel)
  const dst = join(DEST, rel)
  const digest = sha256(src)
  const ours = existsSync(dst) ? sha256(dst) : null
  const delta = declaredDeltas[rel]
  // `removed: true` 表示"这一条被显式裁掉"（不是漏搬）：目标必须**不存在**才算同步。
  // 为什么允许：ADR-0013 定了上游那套"配置住在后端 toml、带版本历史"的通路整块不接，
  // 于是有几个上游文件是**故意不要**的；搬运器硬把它们拉回来等于违反一条已接受的 ADR。
  const acceptedDelta = delta !== undefined && (
    delta.removed === true ? ours === null
      // 生成物不钉 sha：它每次重生成都会变，钉住就变成"记得就改账本"的仪式。
      // 它的尺是生成器自己的 --check（见 gen-node-registry.mjs），这里只承认"由生成器负责"。
      : delta.computed === true ? ours !== null
      : ours !== null && ours === delta.ours)
  const inSync = ours === digest || acceptedDelta
  if (!check && !inSync) {
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(src, dst)
    copied += 1
  }
  if (check && !inSync) {
    console.error(`  × out of sync: ${rel}${existsSync(dst) ? '' : ' (not copied yet)'}${delta !== undefined ? '（申报过的 delta 也对不上了：' + delta.reason + '）' : ''}`)
    drifted += 1
  }

  if (!existsSync(src)) missing += 1
  if (acceptedDelta) {
    recorded[rel] = { sha256: digest, bytes: statSync(src).size, dest: relative(ROOT, dst), state: states.get(rel) ?? 'head', localDelta: delta.reason, removed: delta.removed === true }
  } else {
    recorded[rel] = { sha256: digest, bytes: statSync(src).size, dest: relative(ROOT, dst), state: states.get(rel) ?? 'head' }
  }
}

if (!check) {
  mkdirSync(dirname(MANIFEST), { recursive: true })
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null
  writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        schemaVersion: 1,
        // 工作树快照，不是某个 commit：设计语言的最新配方还没提交，HEAD 与 noxide 都没有它。
        kind: 'xiranite-working-tree-snapshot',
        sourceRoot: SOURCE,
        capturedAt: previous?.capturedAt ?? new Date().toISOString(),
        note: 'docs/adr/0006.md 的 UI 真源；每个文件带 sha256 以便将来与上游 diff（融合不丢，见 ADR-0007）。',
        files: recorded,
      },
      null,
      2,
    ) + '\n',
  )
}

const accepted = Object.keys(declaredDeltas).length
console.log(`${check ? 'check' : 'port'}: ${files.length} tracked file(s), ${copied} copied, ${drifted} out of sync, ${missing} missing${accepted > 0 ? `, ${accepted} 条申报过的本地改动` : ''}`)
if (check && drifted > 0) process.exit(1)
