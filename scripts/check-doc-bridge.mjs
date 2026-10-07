/**
 * 文档产物上屏之前的一把尺：`/xaihi/ui/<rev>/main.js` 里**到底有没有问宿主的装载点**。
 *
 * 判据本身不住在这里——它住在生产代码里（`packages/core/src/host-routes.ts` 的 `detectHostMount`，
 * 那份实现同时给 `/xaihi/manifest.json` 的 `ui.hostMount` 用）。这把尺只是一个 CLI 外壳：
 * 服务端判据与线下判据必须是同一份判断，否则会出现"清单说 present 而脚本说没有"这种无法归因的分叉。
 * 因此这里 import 的是构建产物 `packages/core/lib/host-routes.js` 本体（与 `scripts/ui-realm-live.mjs` 同一条做法），
 * 而 `--self-check` 里有一条**漂移对照**：那份字面串表必须与源码里写的逐字相同，lib 落后就当场红。
 *
 * 为什么要有它（不是"再加一条构建检查"）：路线 (A) 的服务路由与文档侧载体都在仓里，
 * 但它们**只有被入口调用才会进产物**。2026-10-07 连着掉了两次，两次都是绿的构建：
 * - `src/document/main.tsx` 在一次装配点拆分里丢了 realm 装载那两行，`build:document` 照旧 rc=0，
 *   产物从 1,413,786 B 变成 1,385,029 B——**少的那 28 KB 就是整座桥**。当时界面照样渲染
 *   （工作台照画、56 KB 的 DOM），只是页面上没有任何 host 面，节点界面问宿主无处可问。
 * - 同一轮里 `dist-realm/`（realm 探针产物）被整份拷成了 `dist-ui/` 的副本，两条 sha256 逐字节相同
 *   （两边都是 `d395978c…`），于是"探针还在"这件事也读不回来了。
 * 这两件的共同点：**症状不在构建期，也不在界面上**，所以判据只能落在产物字节上。
 *
 * 用法：
 *   node scripts/check-doc-bridge.mjs                       # 量 dist-ui（缺目录 ⇒ 红，不静默跳过）
 *   node scripts/check-doc-bridge.mjs --dist <dir>          # 量别那份（探针用 dist-realm）
 *   node scripts/check-doc-bridge.mjs --self-check          # 阳性对照 + 那份字面串表的漂移对照
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HOST_MOUNT_ENTRY, HOST_MOUNT_MARKERS, detectHostMount } from '../packages/core/lib/host-routes.js'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_DIST = join(ROOT, 'packages/ui-host', 'dist-ui')

/** 红的时候要点名该改哪儿，而不是只说"没搜到"。 */
function explain(verdict, dir) {
  console.log(`check-doc-bridge: ${dir} ⇒ ${verdict}`)
  console.log(`  判据串（来自 packages/core/src/host-routes.ts 的 HOST_MOUNT_MARKERS）：${JSON.stringify([...HOST_MOUNT_MARKERS])}`)
  console.log(`  被检的那份：${HOST_MOUNT_ENTRY}`)
  if (verdict === 'absent') {
    console.log('  ⇒ 红：这份产物里没有问宿主的装载点。入口要调用 realm 装载'
      + '（packages/ui-host/src/document/main.tsx 里的 mountSettingsFace()，或直接 startRealm()）；'
      + '只改 core 那条路由不会让桥进产物。')
  }
  if (verdict === 'unreadable') {
    console.log('  ⇒ 红：读不到入口产物。先跑 pnpm --filter @hibernalglow/xaihi-ui build:document；'
      + '目录不存在与入口文件缺失都算这一档，不许与 absent 混成一句。')
  }
}

/**
 * 阳性对照：夹具是"字面串在/不在"三种字节形态，期望值不是再调一次 detectHostMount 得到的。
 * 第四条对照钉的是 lib 与 src 不许漂移（构建产物落后于源码时，这把尺会拿旧串判新代码）。
 */
function selfCheck() {
  const fixtureRoot = join(ROOT, '.scratch', 'check-doc-bridge-selfcheck')
  rmSync(fixtureRoot, { recursive: true, force: true })
  const both = [...HOST_MOUNT_MARKERS]
  const cases = [
    { name: '两个串都在 = present', dir: 'with', body: `const a="${both[0]}";const b="${both[1]}";`, expect: 'present' },
    { name: '剥掉最后一个串 = absent（契约号在但没人选载体）', dir: 'without', body: `const a="${both[0]}";const b="postMessage";`, expect: 'absent' },
    { name: '目录里没有入口产物 = unreadable（看不见不许报绿）', dir: 'empty', body: null, expect: 'unreadable' },
  ]
  let failures = 0
  for (const testCase of cases) {
    const absolute = join(fixtureRoot, testCase.dir)
    mkdirSync(absolute, { recursive: true })
    if (testCase.body !== null) writeFileSync(join(absolute, HOST_MOUNT_ENTRY), testCase.body)
    const got = detectHostMount(absolute)
    const ok = got === testCase.expect
    if (!ok) failures += 1
    console.log(`${ok ? '✓' : '×'} 对照 ${testCase.name} ⇒ ${got}，期望 ${testCase.expect}`)
  }
  const srcText = readFileSync(join(ROOT, 'packages/core/src/host-routes.ts'), 'utf8')
  const declared = (srcText.match(/HOST_MOUNT_MARKERS\s*=\s*\[([^\]]*)\]/u)?.[1] ?? '').split(',').map((row) => row.trim().replace(/^'|'$/gu, '')).filter((row) => row !== '')
  const drift = JSON.stringify(declared) === JSON.stringify(both)
  if (!drift) failures += 1
  console.log(`${drift ? '✓' : '×'} 对照 构建产物与源码那份字面串表逐字相同 ⇒ lib=${JSON.stringify(both)} src=${JSON.stringify(declared)}`)
  if (!drift) console.log('  ⇒ 红：packages/core/lib 落后于 src（跑 pnpm --filter @hibernalglow/xaihi-core build）')
  rmSync(fixtureRoot, { recursive: true, force: true })
  console.log(`check-doc-bridge --self-check: ${failures === 0 ? '尺看得见违规' : `${failures} 条对照不符`}`)
  return failures === 0
}

const args = process.argv.slice(2)
if (args.includes('--self-check')) process.exit(selfCheck() ? 0 : 1)
const distIndex = args.indexOf('--dist')
const target = distIndex === -1 ? DEFAULT_DIST : resolve(args[distIndex + 1] ?? DEFAULT_DIST)
if (!existsSync(target)) {
  explain('unreadable', target)
  process.exit(1)
}
const verdict = detectHostMount(target)
explain(verdict, target)
process.exit(verdict === 'present' ? 0 : 1)
