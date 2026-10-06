/**
 * 搬运树 → 一份可注入浏览器的 CSS 文本 + 三条构建期断言。
 *
 * 为什么必须有这一步：宿主只给插件两条 URL 形状（`client.js` 与 `client.<name>.js`），
 * 且响应体按 JS 拼进模块加载器握手，**没有官方通道取自己的静态资源**
 * （`dsh-client-modules/lib/index.js` 的 `CLIENT_CHUNK = /^client\.[\w.-]+\.js$/`）。
 * 所以 Tailwind v4 那套 CSS-first 的产物只能以字符串的形式活在 JS 里，运行期注 `<style>`。
 *
 * 三件事按顺序做，每件都落数字：
 *  1. 候选表（`tailwind-candidates.mjs`）：`tailwind.css` 第一行是
 *     `@import "tailwindcss" source(none)` ⇒ 自动内容探测关闭，类名只来自 `@source`。
 *  2. 装配：按上游 `main.tsx:13-25` 的**加载顺序**把入口树喂给 `@tailwindcss/postcss`
 *     （tailwind.css → index.css → themes/index.css → 六份 design 配方），
 *     再把 `xaihi-aliases.css` 叠在最后——`@theme inline` 只是引用，
 *     同特异性下"谁在后"决定裸名变量的值来自谁，所以顺序本身是被测对象之一（断言 C）。
 *  3. 泄露整形：无层规则里"能命中宿主任意 DOM"的形状（`*`、裸标签、`::selection`、
 *     `html/body/#root`、`:root[data-*]` 门）按策略表 SCOPE/DROP/REWRITE，
 *     `@layer` 里的规则整块不动（层序已经把优先级让给宿主的无层规则了）。
 *
 * 断言（都要阳性对照，`--self-check` 一次性跑全）：
 *  A 类名真的生成了：固定 canary（值来自搬运源码的字面量，独立读文件核对）必须在产物里有规则。
 *  B `@source` 扫到了整棵树：每个被点名的目录组必须贡献不少于下限的候选——
 *    ADR-0007 结论 5 要的那条"不能靠约定"就是这条。
 *  C 加载顺序没在装配里丢：四段产物里的标记必须按上游顺序出现。
 *
 * 产物：`src/client/generated/client.css`（给人看的落盘件）+
 * `client-css.ts`（`export const CLIENT_CSS`，被 `src/client/styles.ts` 注进 `<style>`）。
 * 名字沿用既有那份契约，不再另立 `design-css.ts`，否则同一棵样式树有两个真源。
 *
 * 依赖：`postcss` + `@tailwindcss/postcss` + `tailwindcss`（都已在本包 devDependencies，
 * 实测 4.3.2）；候选表另需 `@tailwindcss/oxide`（见 tailwind-candidates.mjs 的两条解析路）。
 * 不引 `@tailwindcss/cli`：它带 `@parcel/watcher`，而 `pnpm-workspace.yaml` 里那条
 * `allowBuilds` 还是占位串（"set this to true or false"）⇒ 装它会让每次 install 直接红。
 *
 * @module xaihi-scripts/build-css
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { collectCandidates, writeSnapshot, DEFAULT_SNAPSHOT, firstLiteralClass } from './tailwind-candidates.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(PKG, 'src')
const GEN = path.join(SRC, 'client', 'generated')
const ENTRY_FILE = path.join(GEN, 'design-entry.css')
const OUT_CSS = path.join(GEN, 'client.css')
const OUT_TS = path.join(GEN, 'client-css.ts')

/** 上游 `<Xiranite>/src/main.tsx:13-25` 的 import 顺序；`md3-components-selection.css`
 *  由 `md3-components.css:119` 自己 `@import`，不单独列（列了就是两份真源）。 */
const SHEETS = [
  'src/styles/tailwind.css',
  'src/index.css',
  'src/styles/themes/index.css',
  'src/styles/design/md3-components.css',
  'src/styles/design/md3-settings-nav.css',
  'src/styles/design/stijl-components.css',
  'src/styles/design/wuling-components.css',
  'src/styles/design/swiss-components.css',
  'src/styles/design/lonestar-components.css',
]
/** 我们的 DSH token 桥：叠在所有无层样式表之后，裸名变量才会解析到 `--xaihi-*` / `--dsw-*`。 */
const ALIASES = 'src/styles/xaihi-aliases.css'

/** 断言 C 的四段标记：值取自各表里"只有那里才有"的声明，改这些声明会同时让这条尺红——
 *  那是预期的耦合，不是巧合，因为标记本身就是那一段存在的证据。 */
const ORDER_MARKERS = [
  ['tailwind.css', 'tailwindcss v'],
  ['index.css', '.bn-shadcn .bn-root'],
  ['themes/base.css', '--badge-teal-subtle-foreground'],
  ['design/md3-components.css', '--md3-state-layer-color'],
  ['design/stijl-components.css', '--stijl-radius'],
  ['design/wuling-components.css', '--wl-corner-chip'],
  ['design/swiss-components.css', '--sw-corner-all'],
  ['design/lonestar-components.css', '--ls-cut-panel'],
  ['xaihi-aliases.css（最后）', '--background: var(--xaihi-surface'],
]

/** 断言 B 的目录组下限。2026-10-07 实测值（`node scripts/tailwind-candidates.mjs`）：
 *  nodes=2379 components=9520 client=708 lib=4160 plugins=1265 —— 下限取"这一半"，
 *  目的是把"某条 glob 不再扫到那棵树"变成红，而不是把数字钉死。 */
const MIN_CANDIDATES_PER_GROUP = [
  ['src/nodes', 1200],
  ['src/components', 4800],
  ['src/lib', 2000],
  ['src/client', 350],
  ['src/plugins', 630],
]

/** 断言 A 的 canary：`cls` 必须在 `file` 里以字面量出现（独立读文件），
 *  且产物里必须有命中它的规则。`port` 那批是旧快照没有、必须靠新生成的候选表才生成的类名
 *  ——2026-10-07 实测：src/components 有 105 条、src/client 有 28 条这类候选。 */
const CANARIES = [
  { cls: 'bg-background', file: 'src/client/workspace.tsx', group: 'staple' },
  { cls: 'text-muted-foreground', file: 'src/client/workspace.tsx', group: 'staple' },
  { cls: 'border-border', file: 'src/client/workspace.tsx', group: 'staple' },
  { cls: '@container/linedup', file: 'src/nodes/linedup/Component.tsx', group: 'l4' },
  { cls: '@3xl/linedup:grid-cols-5', file: 'src/nodes/linedup/ResultPanels.tsx', group: 'l4' },
  { cls: 'bg-background/85', file: 'src/nodes/timeu/Component.tsx', group: 'l4' },
  { cls: 'backdrop-blur-2xl', file: 'src/components/modules/musicPlayer/MusicPlayerSurface.tsx', group: 'port' },
  { cls: 'backdrop-saturate-150', file: 'src/components/modules/musicPlayer/MusicPlayerSurface.tsx', group: 'port' },
  { cls: 'shadow-inner', file: 'src/components/modules/musicPlayer/MusicPlayerSurface.tsx', group: 'port' },
  { cls: 'min-w-48', file: 'src/components/workspace/MelodeckIslandMoreMenu.tsx', group: 'port' },
  { cls: 'max-w-5xl', file: 'src/components/workspace/WorkspaceMelodeck.tsx', group: 'port' },
  { cls: 'sm:inline-flex', file: 'src/components/modules/musicPlayer/MusicPlayerSurface.tsx', group: 'port' },
  { cls: 'xl:col-span-1', file: 'src/components/modules/musicPlayer/MusicPlayerSurface.tsx', group: 'port' },
  { cls: 'focus:text-destructive', file: 'src/components/ui/context-menu.tsx', group: 'port' },
  { cls: 'bg-badge-gray-subtle', file: 'src/components/modules/DatabaseDataView.tsx', group: 'port' },
  { cls: 'text-badge-gray-subtle-foreground', file: 'src/components/modules/DatabaseDataView.tsx', group: 'port' },
  { cls: 'size-px', file: 'src/components/workspace/WorkspaceMelodeck.tsx', group: 'port' },
]

/** 断言 A 的负样本：产物里不该有它，也不该在任何源码里出现。 */
const NOT_A_CLASS = 'glow-no-such-utility-9x7'

/**
 * 无层规则的整形策略表。SCOPE_ROOT 命中面板根与运行期标了记的容器（含 portal，
 * 见 `src/client/styles-inject.ts`）；写成 `:is()` 是为了与 CSSOM 里的原样对照。
 */
const SCOPE_ROOT = ':is(.xaihi-workbench, [data-xaihi-ui])'
/** 留空 = 产物里一条"能命中宿主任意 DOM"的无层规则都不许留。加条目要写理由。 */
const GLOBAL_ALLOWLIST = new Set([])

export async function buildCss({ snapshotOut = DEFAULT_SNAPSHOT, skipScan = false, quiet = false } = {}) {
  const log = (...args) => { if (!quiet) console.log(...args) }

  // ── 1. 候选表 ────────────────────────────────────────────────────────────
  let scan = { candidates: null, meta: null }
  if (!skipScan) {
    scan = collectCandidates()
    const written = writeSnapshot(snapshotOut, scan.candidates)
    log(`candidates: ${written.candidates} 条 / ${written.bytes} 字节 -> ${path.relative(PKG, written.path)} (changed=${written.changed})`)
  }

  // ── 2. 装配：绝对路径 @import，顺序就是上游那份 ──────────────────────────
  const entry = [
    `/* 由 scripts/build-css.mjs 生成：搬运树那份 CSS 入口树按上游加载顺序装成一份。`,
    `   不要手改，也不要把它当样式源——要改样式改 src/styles/** 与 src/index.css。 */`,
    `@source ${JSON.stringify(snapshotOut)};`,
    ...SHEETS.map((s) => `@import ${JSON.stringify(path.join(PKG, s))};`),
    `@import ${JSON.stringify(path.join(PKG, ALIASES))};`].join('\n') + '\n'
  mkdirSync(GEN, { recursive: true })
  writeFileSync(ENTRY_FILE, entry)

  const compiled = await postcss([tailwindcss()]).process(entry, { from: ENTRY_FILE })
  for (const warning of compiled.warnings()) log(`  ! tailwind: ${warning.toString()}`)
  const rawBytes = compiled.css.length
  log(`tailwind: ${rawBytes} 字节（${SHEETS.length} 份表 + 别名层，一次编译）`)

  // ── 3. 整形 + 统计 ───────────────────────────────────────────────────────
  const root = postcss.parse(compiled.css, { from: ENTRY_FILE })
  const stats = shapeDocument(root)
  applyPolicy(root, stats)
  root.walkAtRules('import', (at) => {
    if (/^url\(/.test(at.params)) { at.remove(); stats.remoteImports++ }
  })
  const banner = `/* Xaihi 工作台样式：由 scripts/build-css.mjs 生成，勿手改。\n`
    + `   顺序：${SHEETS.join(' → ')} → ${ALIASES}\n`
    + `   整形：SCOPE ${stats.scoped} 条 / DROP ${stats.dropped} 条（含摘掉的非变量声明 ${stats.droppedDecls} 条）/ 设计门改写 ${stats.gateRewritten} 条\n`
    + `   仍在文档级生效：:root 变量块 ${stats.documentVarBlocks} 条（DSH 那侧对这些裸名的引用实测 0 处）\n   */\n`
  const css = banner + root.toString().trim() + '\n'

  writeFileSync(OUT_CSS, css)
  writeFileSync(
    OUT_TS,
    '/* 由 scripts/build-css.mjs 生成，不要手改：搬运树那套 Tailwind v4 样式装成一份字符串。\n'
    + '   改样式请改 src/styles/**（或 src/index.css）后重跑 `pnpm --filter @hibernalglow/xaihi-ui build`。\n'
    + '   为什么不是 .css：宿主的插件资源路由只发 client.js / client.<name>.js，CSS 只能走 JS 通道。 */\n'
    + `export const CLIENT_CSS = ${JSON.stringify(css)}\n`,
  )
  log(`artifact: ${css.length} 字符 / ${Buffer.byteLength(css)} 字节（编译产物 ${rawBytes} 字符，整形差 ${css.length - rawBytes >= 0 ? '+' : ''}${css.length - rawBytes}）-> ${path.relative(PKG, OUT_CSS)} + ${path.relative(PKG, OUT_TS)}`)
  logLeakTable(stats)

  return { css, stats, candidates: scan.candidates, meta: scan.meta }
}

// ── 选择器形状分析 ─────────────────────────────────────────────────────────

/** 深度 0 上切逗号 / 组合符，字符串与括号里的不算，反斜杠转义算字面量。 */
function splitTop(selector, separators) {
  const parts = []
  let depth = 0, quote = '', buf = ''
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (quote) {
      buf += ch
      if (ch === '\\') { buf += selector[++i] ?? ''; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue }
    if (ch === '\\') { buf += ch + (selector[++i] ?? ''); continue }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (depth === 0 && separators.includes(ch)) { parts.push(buf); buf = ''; continue }
    buf += ch
  }
  if (buf.trim()) parts.push(buf)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** 最左复合选择器：第一个深度 0 的组合符之前。 */
function leftmostCompound(selector) {
  return splitTop(selector, [' ', '>', '+', '~', '\n', '\t'])[0] ?? selector
}

/**
 * 分类只看最左复合选择器——"能不能命中宿主的任意 DOM"这件事是它决定的：
 * 后面挂多少个 `[data-*]`，`*` 仍然要先把每个元素过一遍筛选。
 */
function classifySelector(selector) {
  const head = (leftmostCompound(selector.trim()) || '').trim()
  if (!head) return 'anchored'
  if (/^#root\b/.test(head)) return 'idRoot'
  if (/^(:root|:host|html)(?![\w-])/.test(head)) return /\[[^\]]+\]/.test(head) ? 'rootGated' : 'root'
  if (/^body\b/.test(head)) return 'body'
  if (head.startsWith('::')) return 'globalPseudo'
  const tag = /^([a-zA-Z][\w-]*)/.exec(head)?.[1] ?? ''
  const rest = head.slice(tag.length)
  if (!tag) return head.startsWith('*') ? (rest.startsWith('[') ? 'anchored' : 'universal') : 'anchored'
  return /[[.#]/.test(rest) ? 'anchored' : 'type'
}

function isVarOnly(rule) {
  let vars = 0
  let other = 0
  rule.walkDecls((decl) => { if (decl.prop.startsWith('--')) vars++; else other++ })
  return vars > 0 && other === 0
}

function insideLayer(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'layer') return true
  }
  return false
}

/** 统计 + 整形共用一遍：返回逐形状的计数与被改动的条数。 */
function shapeDocument(root) {
  const stats = {
    rules: 0, layered: 0, unlayered: 0,
    byShape: { root: 0, rootGated: 0, body: 0, idRoot: 0, universal: 0, type: 0, globalPseudo: 0, anchored: 0 },
    globalNow: 0, globalAfter: 0, scoped: 0, dropped: 0, droppedDecls: 0, gateRewritten: 0,
    keepGlobal: 0, rootWithLeftovers: 0, remoteImports: 0,
    documentVarBlocks: 0, documentVarBlockSelectors: [],
    propertyAtRules: 0, mediaRules: 0, examples: {}, byShapeAfter: {},
  }
  root.walkAtRules((at) => {
    if (at.name === 'property') stats.propertyAtRules++
    if (at.name === 'media') stats.mediaRules++
  })
  root.walkRules((rule) => {
    stats.rules++
    if (rule.parent?.type === 'atrule' && rule.parent.name === 'keyframes') return
    if (insideLayer(rule)) { stats.layered++; return }
    stats.unlayered++
    for (const sel of splitTop(rule.selector, [','])) {
      const shape = classifySelector(sel)
      stats.byShape[shape] = (stats.byShape[shape] ?? 0) + 1
      if (['root', 'rootGated', 'body', 'idRoot', 'universal', 'type', 'globalPseudo'].includes(shape)) {
        stats.globalNow++
        stats.examples[shape] = stats.examples[shape] ?? sel
      }
    }
  })
  return stats
}

/** 把 `code, pre` 这种最左是裸标签的复合选择器挂到面板根下面。 */
function scopeSelector(selector) {
  return splitTop(selector, [',']).map((sel) => {
    const shape = classifySelector(sel)
    if (shape === 'root' || shape === 'idRoot' || shape === 'body') return SCOPE_ROOT
    if (shape === 'globalPseudo') return `${SCOPE_ROOT}${sel}`
    const head = leftmostCompound(sel)
    if (shape === 'universal') {
      const rest = sel.slice(head.length).trim()
      return rest ? `${SCOPE_ROOT} *, ${SCOPE_ROOT}${rest}` : `${SCOPE_ROOT}, ${SCOPE_ROOT} *`
    }
    return `${SCOPE_ROOT} ${sel}`
  }).join(', ')
}

/**
 * 策略落地；计数写进 `stats`。
 * `@layer` 里的规则一条不动：层序已经让宿主的无层声明压在它们上面，
 * 再动就是替搬运批改行为，而那件事得有凭据。
 */
function applyPolicy(root, stats) {
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && rule.parent.name === 'keyframes') return
    if (insideLayer(rule)) return
    const sels = splitTop(rule.selector, [','])
    const shapes = sels.map(classifySelector)
    const global = shapes.some((s) => ['root', 'rootGated', 'body', 'idRoot', 'universal', 'type', 'globalPseudo'].includes(s))
    if (!global) return

    // 设计语言的门：`:root[data-app-design="…"] …` 写的是宿主的 documentElement，
    // 而门内的选择器全是 `[data-slot=…]`（DSH 的 dist 里也有 14 处 data-slot）⇒ 打开配方就会
    // 把规则盖到宿主自己的组件上。改挂到我们的根上，运行期由 styles-inject 把门搬过去。
    if (shapes.every((s) => s === 'rootGated')) {
      rule.selector = sels.map((sel) => sel.replace(/^(?::root|:host|html)(?=\[)/, '[data-xaihi-ui]')).join(', ')
      stats.gateRewritten++
      return
    }
    // 文档壳尺寸/底色、`#root`：那条界面归宿主，注进来就是改宿主的脸。
    if (shapes.some((s) => s === 'body' || s === 'idRoot')) {
      rule.remove()
      stats.dropped++
      return
    }
    // `:root` / `html` 那类：只留自定义属性（portal 内容在 body 下面，只有挂文档根才继承得到），
    // 非属性声明（`color-scheme`、`font-family`…）一概摘掉——那正是宿主自己的领地。
    if (shapes.every((s) => s === 'root')) {
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) return
        decl.remove()
        stats.droppedDecls++
      })
      if (rule.nodes.length === 0) { rule.remove(); stats.dropped++; return }
      stats.documentVarBlocks++
      stats.documentVarBlockSelectors.push(`${rule.selector.replace(/\s+/g, ' ')} {${rule.nodes.length} 条声明}`)
      stats.keepGlobal++
      if (!isVarOnly(rule)) stats.rootWithLeftovers++
      return
    }
    const key = rule.selector.replace(/\s+/g, ' ').trim()
    if (GLOBAL_ALLOWLIST.has(key)) { stats.keepGlobal++; return }
    rule.selector = scopeSelector(rule.selector)
    rule.walkDecls('color-scheme', (decl) => { decl.remove(); stats.droppedDecls++ })
    stats.scoped++
  })
  // 整形完再量一遍：这条尺量的是"改完之后还剩什么"。
  const after = shapeDocument(root)
  stats.globalAfter = after.globalNow
  stats.byShapeAfter = after.byShape
  stats.propertyAtRules = after.propertyAtRules
}

// ── 断言 ───────────────────────────────────────────────────────────────────

/** 产物里真实存在的类名集合（从规则选择器里剥出来并反转义）。 */
export function generatedClassNames(css) {
  const found = new Set()
  for (const m of css.matchAll(/\.((?:\\.|[-\w])+)/g)) {
    found.add(m[1].replace(/\\(.)/g, '$1'))
  }
  return found
}

/** 断言 A：canary 必须"源码里真用"且"产物里有规则"。 */
export function checkCanaries(css, canaries = CANARIES) {
  const names = generatedClassNames(css)
  const misses = []
  for (const c of canaries) {
    const abs = path.join(PKG, c.file)
    let inSource = false
    try { inSource = firstLiteralClass(abs, c.cls) } catch { inSource = false }
    if (!inSource) { misses.push({ ...c, why: `源码里找不到字面量：${c.file}` }); continue }
    if (!names.has(c.cls)) misses.push({ ...c, why: '产物里没有命中它的规则' })
  }
  return { misses, checked: canaries.length, present: canaries.length - misses.length }
}

/** 断言 B：每个目录组的候选数下限（`@source` 没扫到那棵树时这里红，而不是页面白）。 */
export function checkGroupCoverage(candidateCounts, groups = MIN_CANDIDATES_PER_GROUP) {
  const misses = []
  for (const [group, min] of groups) {
    const got = candidateCounts[group] ?? 0
    if (got < min) misses.push({ group, min, got })
  }
  return { misses, groups }
}

/** 断言 C：上游那段加载顺序在产物里逐段可查。 */
export function checkOrder(css, markers = ORDER_MARKERS) {
  const positions = []
  const misses = []
  for (const [name, marker] of markers) {
    const at = css.indexOf(marker)
    if (at < 0) { misses.push({ name, why: '标记没出现（那张表没进产物或被整形掉了）' }); continue }
    positions.push({ name, at })
  }
  for (let i = 1; i < positions.length; i++) {
    if (positions[i].at <= positions[i - 1].at) {
      misses.push({ name: `${positions[i].name} 该排在 ${positions[i - 1].name} 之后`, why: `字节位置 ${positions[i].at} <= ${positions[i - 1].at}` })
    }
  }
  return { misses, positions }
}

/** 泄露预算：整形后仍"能命中宿主任意 DOM"的无层规则必须为 0（allowlist 除外）。
 *  `:root` 纯变量块不算在内——它是单独一档，按 `DOCUMENT_VAR_BLOCK_MAX` 单独钉。 */
/** 留在文档级的 `:root` 纯变量块上限。2026-10-07 实测 5 条（base.css 的明暗两块、
 *  design-axes、wuling、别名层）——它们必须留在文档级，因为 Radix portal 的内容挂在
 *  `document.body` 下，只有文档根的自定义属性才继承得到。要抬高这个数字得写理由。 */
const DOCUMENT_VAR_BLOCK_MAX = 8
const DANGEROUS_SHAPES = ['universal', 'type', 'globalPseudo', 'body', 'idRoot', 'rootGated']
const dangerousCount = (byShape) => DANGEROUS_SHAPES.reduce((sum, s) => sum + (byShape[s] ?? 0), 0)

export function checkLeakBudget(stats, allowlist = GLOBAL_ALLOWLIST) {
  const misses = []
  const dangerous = dangerousCount(stats.byShapeAfter)
  if (dangerous > allowlist.size) {
    misses.push({ why: `整形后仍有 ${dangerous} 条无层规则能命中宿主任意 DOM，allowlist 只有 ${allowlist.size} 条`, shapes: stats.byShapeAfter })
  }
  if (stats.rootWithLeftovers > 0) {
    misses.push({ why: `${stats.rootWithLeftovers} 条留在文档级的 :root 块里还有非自定义属性声明（那会直接改宿主的脸）` })
  }
  if (stats.documentVarBlocks > DOCUMENT_VAR_BLOCK_MAX) {
    misses.push({ why: `留在文档级的 :root 变量块 ${stats.documentVarBlocks} 条 > 上限 ${DOCUMENT_VAR_BLOCK_MAX}（新增一张文档级变量表要有理由）` })
  }
  return { misses, allowlisted: allowlist.size, dangerous }
}

function logLeakTable(stats) {
  const rows = Object.entries(stats.byShapeAfter)
  console.log('leak inventory（无层规则里"能命中宿主任意 DOM"的选择器形状；整形前 → 整形后）：')
  for (const [shape, after] of rows) {
    const before = stats.byShape[shape] ?? 0
    if (before === 0 && after === 0) continue
    console.log(`  ${shape.padEnd(13)} ${String(before).padStart(5)} → ${String(after).padStart(5)}   例：${String(stats.examples[shape] ?? '').slice(0, 64)}`)
  }
  console.log(`  @layer 内规则 ${stats.layered} 条原样留着（层序让宿主无层声明压在它上面）；无层规则共 ${stats.unlayered} 条`)
  console.log(`  @property ${stats.propertyAtRules} 条 / @media ${stats.mediaRules} 条 / 远程 @import 丢弃 ${stats.remoteImports} 条`)
  console.log(`  留在文档级的 :root 变量块 ${stats.documentVarBlocks} 条（portal 内容在 body 下，只有挂文档根才继承得到）：`)
  for (const line of stats.documentVarBlockSelectors) console.log(`    · ${line.slice(0, 90)}`)
}

// ── CLI ────────────────────────────────────────────────────────────────────

/**
 * 投递形状：这段文本最后是个字符串，住在 `client.js` 里，被 `<script src>` 引走。
 * `</script`、`<!--`、`-->` 会让脚本解析器改道，U+2028/2029 在旧引擎里是行终结符。
 * 2026-10-07 实测：这五样在产物里各 0 处，所以这里只做"以后别漂进来"的闸门。
 */
const DELIVERY_HAZARDS = ['</script', '<!--', '-->', '\u2028', '\u2029']
export function checkDeliverySafety(css) {
  const misses = []
  for (const hazard of DELIVERY_HAZARDS) {
    let count = 0
    let at = css.indexOf(hazard)
    while (at >= 0) { count++; at = css.indexOf(hazard, at + hazard.length) }
    if (count > 0) misses.push({ hazard: JSON.stringify(hazard), count })
  }
  return { misses, checked: DELIVERY_HAZARDS.length }
}

/**
 * 阳性对照：每条尺都要"关掉防御就变红"，且期望值不再调被测函数得到。
 * canary 的期望值取自搬运源码的字面量（`firstLiteralClass` 直接读文件），
 * 顺序标记取自各样式表里的专有声明，泄露预算取自整形后的再统计。
 */
function selfCheck() {
  const results = []
  const push = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`) }

  // A：负样本不该在产物里，也不该在源码里。
  const negative = checkCanaries('dummy .not-a-class {}', [{ cls: NOT_A_CLASS, file: 'src/client/workspace.tsx', group: 'control' }])
  push('canary 尺抓得到"源码里没有的类名"', negative.misses.length === 1 && /源码里找不到/.test(negative.misses[0].why), negative.misses[0]?.why)

  // A：把一条真 canary 的规则从产物里抹掉，尺必须变红并点名它。
  const cssPath = OUT_CSS
  let css = ''
  try { css = readFileSync(cssPath, 'utf8') } catch { push('产物存在（先跑一次 build）', false); return results }
  const victim = CANARIES.find((c) => c.cls === 'backdrop-blur-2xl')
  const doctored = css.replace(/\.backdrop-blur-2xl\s*\{[^}]*\}/, '/* 抹掉一条规则 */')
  push('doctored 产物必须让 canary 尺变红', doctored !== css && checkCanaries(doctored).misses.some((m) => m.cls === victim?.cls))
  push('未 doctored 的产物必须让 canary 尺变绿', checkCanaries(css).misses.length === 0)

  // B：把 nodes 那一组的下限抬到 999999，尺必须红。
  push('目录组尺抓得到"某组不再被扫到"', checkGroupCoverage({ 'src/nodes': 3 }, [['src/nodes', 999999]]).misses.length === 1)
  push('目录组尺放过实测数字', checkGroupCoverage(Object.fromEntries(MIN_CANDIDATES_PER_GROUP.map(([g, m]) => [g, m + 1]))).misses.length === 0)

  // C：故意把别名层排到 tailwind 之前。
  const swapped = `${'--background: var(--xaihi-surface'}\n${css}`
  push('顺序尺抓得到"别名层跑到最前"', checkOrder(swapped).misses.length > 0)
  push('顺序尺放过真产物', checkOrder(css).misses.length === 0)

  // 泄露：塞一条 `*{color:red}` 进整形前的统计，必须被数成"能命中宿主任意 DOM"。
  const probe = postcss.parse('a { color: red }\n* { color: red }\n::selection { color: red }\n[data-slot="x"] { color: red }', { from: ENTRY_FILE })
  const probed = shapeDocument(probe)
  push('泄露尺抓得到 * / ::selection / 裸标签', probed.globalNow === 3 && probed.byShape.anchored === 1, `globalNow=${probed.globalNow}`)
  const real = shapeDocument(postcss.parse(css, { from: OUT_CSS }))
  push('泄露尺放过真产物（危险形状为 0）', dangerousCount(real.byShape) <= GLOBAL_ALLOWLIST.size, `dangerous=${dangerousCount(real.byShape)}, allowlist=${GLOBAL_ALLOWLIST.size}`)
  // 减法跑测：把产物里一条已 SCOPE 的规则改回 `*`，同一把尺必须变红——
  // 否则这条尺只是"永远绿"，量不到整形有没有生效。
  const unscoped = css.replace(`${SCOPE_ROOT}, ${SCOPE_ROOT} *`, '*')
  const undone = shapeDocument(postcss.parse(unscoped, { from: OUT_CSS }))
  push('把一条 SCOPE 改回 * 之后泄露尺必须变红', unscoped !== css && dangerousCount(undone.byShape) > GLOBAL_ALLOWLIST.size, `dangerous=${dangerousCount(undone.byShape)}`)
  // 投递形状：真产物要绿，塞一个 `</script` 进去必须红。
  push('投递尺放过真产物', checkDeliverySafety(css).misses.length === 0)
  push('投递尺抓得到 </script', checkDeliverySafety(`${css}</script>`).misses.some((m) => m.count === 1))
  return results
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  try {
    if (argv.includes('--self-check')) {
      const results = selfCheck()
      const failed = results.filter((r) => !r.ok)
      console.log(`build-css self-check: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length}/${results.length})`}`)
      process.exit(failed.length === 0 ? 0 : 1)
    }
    const snapshotIndex = argv.indexOf('--snapshot-out')
    const { stats, candidates, css } = await buildCss({
      snapshotOut: snapshotIndex >= 0 ? path.resolve(argv[snapshotIndex + 1]) : DEFAULT_SNAPSHOT,
      skipScan: argv.includes('--skip-scan'),
    })

    const a = checkCanaries(css)
    const counts = {}
    for (const [group] of MIN_CANDIDATES_PER_GROUP) {
      const base = path.join(PKG, group)
      counts[group] = collectCandidates({
        sources: [
          { base, pattern: '**/*.{html,ts,tsx}', negated: false },
          { base, pattern: '**/__backup__/**', negated: true },
          { base, pattern: '**/*.{test,spec}.{ts,tsx}', negated: true },
          { base, pattern: '**/generated/**', negated: true },
        ],
      }).candidates.length
    }
    const b = checkGroupCoverage(counts)
    const c = checkOrder(css)
    const leak = checkLeakBudget(stats)
    const delivery = checkDeliverySafety(css)

    const problems = [
      ...a.misses.map((m) => `类名没生成: ${m.cls} (${m.group}) — ${m.why}`),
      ...b.misses.map((m) => `@source 没扫到 ${m.group}：候选 ${m.got} < 下限 ${m.min}`),
      ...c.misses.map((m) => `加载顺序断了：${m.name} — ${m.why}`),
      ...leak.misses.map((m) => `宿主泄露超预算：${m.why}`),
      ...delivery.misses.map((m) => `投递形状危险序列 ${m.hazard} 出现 ${m.count} 处（要转义或从样式源里去掉）`),
    ]
    console.log(`assertions: canary ${a.present}/${a.checked} · groups ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')} · order ${c.positions.length}/${ORDER_MARKERS.length} · 整形后能命中宿主的无层规则 ${leak.dangerous}（allowlist ${leak.allowlisted}）· 文档级变量块 ${stats.documentVarBlocks}/${DOCUMENT_VAR_BLOCK_MAX} · 投递危险序列 ${delivery.misses.length}/${delivery.checked}`)
    if (problems.length > 0) {
      console.error(`build-css: FAIL（${problems.length} 条）`)
      for (const p of problems) console.error(`  ✗ ${p}`)
      process.exit(1)
    }
    console.log('build-css: PASS')
  } catch (error) {
    console.error(`build-css: 失败 — ${error?.stack ?? error}`)
    process.exit(1)
  }
}
