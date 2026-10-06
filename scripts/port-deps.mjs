/**
 * 依赖声明同步器：搬运树里每一个裸 (third-party) import 都必须在本包 `package.json` 里有条目。
 *
 * 为什么需要它：上游 Xiranite 跑在 **bun** 上，bun 会把传递依赖提升到 `node_modules` 顶层，
 * 所以那份 `package.json` 本身就漏报（实测连 `@xiranite/contract` 都没写进
 * `packages/cli/package.json#dependencies`，见 `docs/stages/step-4-terminal-port.md` 第四节）。
 * 换 pnpm 的严格解析之后，漏报的症状是"构建绿、运行时 ERR_MODULE_NOT_FOUND"或者
 * "typecheck 一片红但说不出少哪个包"。这条脚本把"少哪些包"变成一个可判的清单。
 *
 * 版本只有一个来源：**上游那台装配里真正存在的版本**（`<Xiranite>/package.json`）。
 * 这里不猜版本、不写 `latest`——`latest` 在这条依赖线上是会撒谎的（同 `check:pins` 的理由）。
 * 上游没有的条目一律报 `unpinned`，由人决定，不由脚本编。
 *
 * React 例外：网页面受 DSH 的 **18.3.1** 单例约束（`dsh-client-modules` 的 seed 表），
 * 所以 `react` / `react-dom` 保留本包现有的 `^18` 钉法，绝不跟上游的 19。
 *
 * 用法：
 *   node scripts/port-deps.mjs            # 打印缺什么
 *   node scripts/port-deps.mjs --write    # 把缺的写进 packages/ui-host 的 devDependencies
 *   node scripts/port-deps.mjs --check    # 有缺就 rc=1（门禁形态）
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PKG_DIR = join(ROOT, 'packages/ui-host')
const MANIFEST_PATH = join(PKG_DIR, 'package.json')
const UPSTREAM_MANIFEST = '/Users/glow/Base/Code/Freya/Xiranite/package.json'

/** 这些不算 third-party：基线模块表会回答，或者是本仓自己的包。 */
const ALLOWED_UNDECLARED = new Set(['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'vitest'])

const args = new Set(process.argv.slice(2))
const write = args.has('--write')
const check = args.has('--check')

const upstream = JSON.parse(readFileSync(UPSTREAM_MANIFEST, 'utf8'))
const upstreamVersions = { ...upstream.dependencies, ...upstream.devDependencies }

const UPSTREAM_INSTALL = '/Users/glow/Base/Code/Freya/Xiranite/node_modules'

/**
 * 第二档版本来源：**上游那台装配里真正装着的版本**。
 * 需要它是因为上游漏报得很厉害——实测 18+ 个 `@radix-ui/react-*` 只有一个写在
 * `package.json` 里，其余全靠 bun 把传递依赖提升到顶层；`@lumino/disposable` 同理
 * （它是 `@lumino/commands` 的传递依赖，上游没声明）。换 pnpm 的严格解析之后
 * 这些"幽灵依赖"必须逐个显式化，版本不能猜，所以直接读上游装出来的那一份。
 */
function installedVersion(pkg) {
  try {
    const manifest = JSON.parse(readFileSync(join(UPSTREAM_INSTALL, pkg, 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : null
  } catch {
    return null
  }
}

/**
 * 明确**不声明**的包：写进 `package.json` 就等于让全仓 `pnpm install` 去解一个
 * 现在解不动的东西（症状是每条 pnpm 命令都红，见 pnpm-workspace.yaml 那条注释）。
 * 每一条都要有理由与被堵的文件，而不是"先注掉"。
 */
const BLOCKED = {
  '@hibernalglow/ocean-dataview': '使用者的私有组件包，peer 要 React ^19（实测其 package.json：'
    + '"react": "^19.0.0"），而网页面受 DSH 的 18.3.1 单例约束。'
    + '要么它出一个 18 兼容线，要么这个数据面模块不进 v1（`components/modules/DatabaseDataView.tsx`）。',
}

const tsFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })

const bare = new Map()
for (const file of tsFiles(join(PKG_DIR, 'src'))) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const offsets = [0]
  for (const line of lines.slice(0, -1)) offsets.push(offsets[offsets.length - 1] + line.length + 1)
  const lineAt = (offset) => {
    let at = 0
    while (at + 1 < offsets.length && offsets[at + 1] <= offset) at += 1
    return lines[at] ?? ''
  }
  for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w.])(?:import|require)\(\s*['"]([^'"]+)['"]/g)) {
    if (!match[1] && !match[2]) continue
    const spec = match[1] ?? match[2] ?? ''
    if (/^\s*(?:import|export)\s+type\b/.test(lineAt(match.index))) continue
    if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('node:')) continue
    if (spec.startsWith('@xiranite/')) continue // 换成本仓包名属于接线那一步，不在这里偷偷改名
    if (spec.startsWith('@deepseek-ai/')) continue // 归 check:pins 与纯度尺管
    if (ALLOWED_UNDECLARED.has(spec)) continue
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    if (!bare.has(pkg)) bare.set(pkg, [])
    bare.get(pkg).push(file.slice(ROOT.length + 1))
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }

const measured = (pkg) => installedVersion(pkg) ?? (pkg in upstreamVersions ? upstreamVersions[pkg] : null)

/**
 * 两种红法一起管：**没声明**，以及**声明了但不是上游实装的那一份**。
 * 后者不修就等于把"看起来能装"留给下次 install 去炸（`@diceui/tags-input@^0.7.2` 就是
 * 一个已经写进 `package.json` 却解不动的例子）。
 */
const missing = [...bare.entries()]
  // 本仓自己的包走 `workspace:*`，那是对的协议，不许被"归一化成上游实装版本"这条规则碰。
  .filter(([pkg]) => !(pkg in declared) || (declared[pkg] !== measured(pkg) && !String(declared[pkg]).startsWith('workspace:')))
  .sort((a, b) => a[0].localeCompare(b[0]))
const blocked = missing.filter(([pkg]) => pkg in BLOCKED)
const pool = missing.filter(([pkg]) => !(pkg in BLOCKED))
const unpinned = pool.filter(([pkg]) => measured(pkg) === null)
// **版本取"上游那台装配里真正装着的"精确值，不取声明的 caret 区间。**
// 这条不是洁癖，是实测逼的：上游 `package.json` 写 `@diceui/tags-input@^0.7.2`，
// 它自己装出来的是 0.7.2（依赖 `@diceui/shared@0.12.0`，存在），
// 而 `^0.7.2` 在 2026-10-06 会解到更新的 0.7.x，那份要 `@diceui/shared@0.12.1` —— 注册表里根本没这个版本，
// 于是 `pnpm install` 直接 rc=1（`No matching version found for @diceui/shared@0.12.1`）。
// 搬过来的界面"长那样"是由那一整套精确构建决定的，所以这里逐条钉精确版本；
// 上游没装到的（极少数）才退回它声明的区间。
const fromUpstreamManifest = pool.filter(([pkg]) => installedVersion(pkg) === null && pkg in upstreamVersions)
const fromInstall = pool.filter(([pkg]) => installedVersion(pkg) !== null).map(([pkg, users]) => [pkg, installedVersion(pkg), users])
const pinned = Object.fromEntries(pool.map(([pkg]) => [pkg, measured(pkg)]).filter(([, version]) => version !== null))

console.log(`port-deps: ${bare.size} 类 third-party value 依赖；本包已声明 ${Object.keys(declared).length} 条`)
console.log(`  缺声明 ${missing.length} 条：上游 package.json 可抄 ${fromUpstreamManifest.length} 条、`
  + `上游装着的可量 ${fromInstall.length} 条、堵住的 ${blocked.length} 条、两档都没有的 ${unpinned.length} 条`)
for (const [pkg, version] of Object.entries(pinned)) console.log(`  + ${pkg}@${version}  (${new Set(bare.get(pkg)).size} 个文件在用，${installedVersion(pkg) ? '上游实装' : '上游声明区间'})`)
for (const [pkg, users] of blocked) console.log(`  × ${pkg} 不声明：${BLOCKED[pkg]}  被堵入口：${[...new Set(users)].length} 个文件`)
for (const [pkg, users] of unpinned) console.log(`  ? ${pkg}  上游 package.json 与已装产物里都没有 ⇒ 要人拍，例如 ${users[0]}`)

if (write) {
  const dev = manifest.devDependencies ?? {}
  for (const [pkg, version] of Object.entries(pinned)) dev[pkg] = version
  manifest.devDependencies = Object.fromEntries(Object.entries(dev).sort((a, b) => a[0].localeCompare(b[0])))
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`  写入了 ${Object.keys(pinned).length} 条 devDependencies（${blocked.length} 条 blocked、${unpinned.length} 条 unpinned 未写）`)
}
if (check && missing.length > 0) process.exit(1)
if (!existsSync(MANIFEST_PATH)) process.exit(1)
