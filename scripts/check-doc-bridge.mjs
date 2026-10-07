/**
 * 文档产物上屏之前的一把尺：`/xaihi/ui/<rev>/main.js` 里**到底有没有问宿主的装载点**。
 *
 * 为什么要有它（不是"再加一条构建检查"）：路线 (A) 的服务路由 `packages/core/src/host-routes.ts`
 * 与文档侧载体 `createHttpDocumentBridge` 都在仓里，但它们**只有被入口调用才会进产物**。
 * 2026-10-07 连着掉了两次，两次都是绿的构建：
 * - `src/document/main.tsx` 在一次装配点拆分里丢了 `mountSettingsFace()` 那两行，
 *   `build:document` 照旧 rc=0，产物从 1,413,786 B 变成 1,385,029 B——**少的那 28 KB 就是整座桥**。
 *   当时界面照样渲染（工作台照画、56 KB 的 DOM），只是页面上没有任何 host 面，
 *   节点界面问宿主无处可问。
 * - 同一轮里 `dist-realm/`（realm 探针产物）被整份拷成了 `dist-ui/` 的副本，两条 sha256 逐字节相同
 *   （两边都是 `d395978c…`），于是"探针还在"这件事也读不回来了。
 * 这两件的共同点：**症状不在构建期，也不在界面上**，所以判据只能落在产物字节上。
 *
 * 判据的形状（与 `scripts/check-node-face.mjs` 同一条理由）：**源码里的字面串在产物里还在**。
 * 挑的是压缩器改不动的那一类——字符串字面量，不是标识符（`mountSettingsFace` 这类函数名会被改名，
 * 拿它搜等于"搜不到就说没有"，那是假红）：
 * - `xaihi.bridge/1`：桥的契约号（`packages/node-sdk/src/host-bridge.ts` 的 `BRIDGE_SCHEMA`），
 *   文档侧两种载体都带它；没进图就不会出现。
 * - `host-http`：顶层窗那条载体的名字，只出现在 `packages/ui-host/src/document/realm.ts` 选载体的那一行。
 * 两个都要在。只中一个判红：只有契约号可能是别的桥代码进来了而没人选载体，只有 `host-http` 则是探针
 * 那一份（`dist-realm`）——所以量 `dist-realm` 时把 `--require` 放宽是错的，该量的是这一份的两个串都在。
 *
 * 用法：
 *   node scripts/check-doc-bridge.mjs                       # 量 dist-ui（缺目录 ⇒ 红，不静默跳过）
 *   node scripts/check-doc-bridge.mjs --dist <dir>          # 量别那份（探针用 dist-realm）
 *   node scripts/check-doc-bridge.mjs --self-check          # 阳性对照：在的判在、剥掉的判不在
 *
 * 这条尺**故意还没接进 `pnpm test`**：它读的是搬运 lane 正在重写的入口与它的产物，
 * 接进去等于把别人在飞的那一刀变成全仓的红（与 `check:brand`、`check-node-face` 同一档决定，
 * 接线时机也相同：入口那两行稳定之后）。
 *
 * @module scripts/check-doc-bridge
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_DIST = join(ROOT, 'packages/ui-host', 'dist-ui')

/** 产物字节里必须留着的字面串，以及各自的出处与理由。 */
const MARKERS = [
  { id: 'bridge-schema', needle: 'xaihi.bridge/1', source: 'packages/node-sdk/src/host-bridge.ts 的 BRIDGE_SCHEMA' },
  { id: 'carrier-http', needle: 'host-http', source: 'packages/ui-host/src/document/realm.ts 选顶层窗载体那一行' },
]

/** 只扫 .js：.map 与资源里的串不算"编进了图"（实测这里连 .map 都没有 sourcesContent）。 */
function collectBundleFiles(dir) {
  const out = []
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const absolute = join(current, name)
      if (statSync(absolute).isDirectory()) walk(absolute)
      else if (name.endsWith('.js')) out.push(absolute)
    }
  }
  walk(dir)
  return out
}

/**
 * 判断一份产物目录里有没有"问宿主的装载点"。
 * @param dir - 文档产物根目录（`dist-ui` 或 `dist-realm`）。
 * @returns 逐串命中数、缺失清单与可判性；看不见任何东西时（目录缺、没有 .js）`decidable=false` ⇒ 按红处理。
 */
export function judge(dir) {
  const verdict = { dir, decidable: true, jsCount: 0, hits: {}, missing: [], note: '' }
  if (!existsSync(dir)) {
    verdict.decidable = false
    verdict.note = '产物目录不存在（先跑 pnpm --filter @hibernalglow/xaihi-ui build:document）'
    verdict.missing = MARKERS.map((marker) => marker.id)
    return verdict
  }
  const files = collectBundleFiles(dir)
  verdict.jsCount = files.length
  if (files.length === 0) {
    verdict.decidable = false
    verdict.note = '目录里一份 .js 都没有 ⇒ 这把尺看不见任何东西，不许报绿'
    verdict.missing = MARKERS.map((marker) => marker.id)
    return verdict
  }
  for (const marker of MARKERS) {
    let count = 0
    for (const file of files) count += readFileSync(file, 'utf8').split(marker.needle).length - 1
    verdict.hits[marker.id] = count
    if (count === 0) verdict.missing.push(marker.id)
  }
  return verdict
}

/** 打成人能照做的读数；返回是不是绿。 */
function printVerdict(verdict) {
  console.log(`check-doc-bridge: ${verdict.dir}（${String(verdict.jsCount)} 份 .js）`)
  for (const marker of MARKERS) {
    const count = verdict.hits[marker.id] ?? 0
    console.log(`  ${count > 0 ? '✓' : '×'} ${marker.id}="${marker.needle}" 命中 ${String(count)} · 出处 ${marker.source}`)
  }
  if (verdict.note !== '') console.log(`  说明：${verdict.note}`)
  if (verdict.missing.length === 0) return true
  console.log('  ⇒ 红：这份产物里没有问宿主的装载点。入口要调用 realm 装载'
    + '（packages/ui-host/src/document/main.tsx 里的 mountSettingsFace()，或直接 startRealm()）；'
    + '只改 core 那条路由不会让桥进产物。')
  return false
}

/** 阳性对照：夹具是"字面串在/不在"两种字节形态，期望值不是再调一次 judge() 得到的。 */
function selfCheck() {
  const fixtureRoot = join(ROOT, '.scratch', 'check-doc-bridge-selfcheck')
  rmSync(fixtureRoot, { recursive: true, force: true })
  const cases = [
    { name: '两个串都在 = 绿', file: 'with/main.js', body: 'const a="xaihi.bridge/1";const b="host-http";', expect: '' },
    { name: '剥掉 host-http = 红（契约号在但没人选载体）', file: 'without/main.js', body: 'const a="xaihi.bridge/1";const b="postMessage";', expect: 'carrier-http' },
    { name: '目录里只有 .css = 红（看不见不许报绿）', file: 'empty/main.css', body: '.x{}', expect: 'bridge-schema,carrier-http' },
  ]
  let failures = 0
  for (const testCase of cases) {
    const absolute = join(fixtureRoot, testCase.file)
    mkdirSync(join(absolute, '..'), { recursive: true })
    writeFileSync(absolute, testCase.body)
    const verdict = judge(join(fixtureRoot, testCase.file.split('/')[0]))
    const got = verdict.missing.join(',')
    const ok = got === testCase.expect
    if (!ok) failures += 1
    console.log(`${ok ? '✓' : '×'} 对照 ${testCase.name} ⇒ missing=[${got}]，期望 [${testCase.expect}]`)
  }
  rmSync(fixtureRoot, { recursive: true, force: true })
  console.log(`check-doc-bridge --self-check: ${failures === 0 ? '尺看得见违规' : `${String(failures)} 条对照不符`}`)
  return failures === 0
}

const args = process.argv.slice(2)
if (args.includes('--self-check')) process.exit(selfCheck() ? 0 : 1)
const distIndex = args.indexOf('--dist')
const target = distIndex === -1 ? DEFAULT_DIST : resolve(args[distIndex + 1] ?? DEFAULT_DIST)
process.exit(printVerdict(judge(target)) ? 0 : 1)
