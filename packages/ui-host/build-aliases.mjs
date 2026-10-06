/**
 * `@xiranite/*` 的解析表：搬来的树里那些**上游包名**，在本仓各自落在哪里。
 *
 * 为什么保留上游的 specifier 而不是全仓改名：ADR-0007 事实 1 —— 上游 482 个文件、
 * 2219 条 `@/…` 与这批 `@xiranite/*` 是"与上游可 diff"的载体。搬运这一轮改名，
 * 下一次同步就再也对不上行为了。所以改名发生在**解析层**：
 * tsconfig 的 `paths`（类型检查）、vitest 的 `resolve.alias`（测试）、
 * tsdown 的 `alias`（浏览器产物，配合 `noExternal` 全部内联）三处都吃这张表。
 *
 * 三条边界的账（都在 `docs/port/debt-*.txt` / 本文件下方 `UNRESOLVED_BY_DESIGN` 里点名）：
 * - `packages/{api,cli,cli-runtime,contract,shared,logging}` 暂不入 pnpm workspace
 *   （它们的 `workspace:*` 依赖会让全仓 pnpm 解不出树），但**类型检查与构建不需要包管理器**，
 *   指到源码就能解析。
 * - `@xiranite/file-operations` / `@xiranite/services` 本仓**没有对应物**：
 *   ADR-0013 定了上游"配置住在后端 toml + HTTP/RPC 读写 + 版本历史"那条通路整块不接。
 *   这里给它一个明确报错的解析，而不是编一个假 stub 让构建绿。
 * - `@xiranite/node-<id>/*` 只有四个已迁节点，且本仓的连接点根本不走这条边
 *   （`entry.ts` 从注册表取清单，见 `scripts/gen-node-registry.mjs`）。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const HERE = import.meta.dirname
const PKGS = resolve(HERE, '..')
const UI_HOST_REL = '..'
const ROOT_PLUGINS = resolve(PKGS, '..', 'plugins')

/** specifier → 仓内绝对路径（不带扩展名，交给解析器补）。 */
export const XIRANITE_ALIASES = {
  '@xiranite/contract': join(PKGS, 'contract/src/index.ts'),
  '@xiranite/shared': join(PKGS, 'shared/src/index.ts'),
  '@xiranite/shared/rules': join(PKGS, 'shared/src/rules.ts'),
  '@xiranite/api/client': join(PKGS, 'api/src/client.ts'),
  '@xiranite/logging': join(PKGS, 'logging/src/index.ts'),
  '@xiranite/cli-runtime': join(PKGS, 'cli-runtime/src/index.ts'),
  '@xiranite/cli-runtime/terminal': join(PKGS, 'cli-runtime/src/tui/index.ts'),
}

// `@xiranite/api`（裸包名）在本仓**没有 index.ts**：`packages/api/src/` 只有
// `client.ts` 与 `source-thumbnail-client.ts`，上游那个 barrel 没随搬。
// 表里曾经写过一条指到不存在的 `api/src/index.ts` —— 被本文件的自检当场抓住，
// 这条注释就是它留下的账：解析表必须"每一条都指得到东西"。

/**
 * 节点界面里 value-import 自己节点 core 的那一族（`@xiranite/node-<id>/core`）。
 *
 * ADR-0007 决定 4 禁的是 **`entry.ts` 把执行器挂成 `AppNodeEntry.core`**（"面里能跑节点逻辑，
 * 就是协议之外的第二个执行宿主"），不是"组件不许用纯函数"。上游 noxide 的 `Component.tsx`
 * 直接用了 core 里的纯函数（`splitLines` / `filterLines` / `createDiffRows` 这类），
 * 保真搬运就要保留那条 import；解析上它指到**本仓同一个节点的 `src/core.ts`**，
 * 由 `noExternal` 在构建期内联进产物（ADR-0002 说的是装进 profile 的包不许引仓内包，
 * 而这里进的是工作台产物，不是那个包的运行时依赖）。
 * 只解析真的存在的那几份；缺的进下面的清单，别编。
 */
function nodeCoreAliases() {
  const out = {}
  for (const dir of existsSync(join(ROOT_PLUGINS, '')) ? readdirSync(ROOT_PLUGINS, { withFileTypes: true }) : []) {
    if (!dir.isDirectory()) continue
    for (const sub of ['core.ts', 'interaction.ts']) {
      const target = join(ROOT_PLUGINS, dir.name, 'src', sub)
      if (!existsSync(target)) continue
      const specifier = `@xiranite/node-${dir.name}/${sub.replace(/\.ts$/, '')}`
      out[specifier] = target
    }
  }
  return out
}

/** 表里补上派生出来的 node core 边（不可手抄：新迁一个节点就自动多一条）。 */
Object.assign(XIRANITE_ALIASES, nodeCoreAliases())

/**
 * 有意**不给**解析的边：命中就该在构建里响，而不是被一个假 stub 糊过去。
 * 键是子串匹配（这些 specifier 出现在哪些文件由 `scripts/port-debt.mjs` 逐条列）。
 */
export const UNRESOLVED_BY_DESIGN = [
  // 上游"配置住在后端 toml + HTTP/RPC + 版本历史"那条通路，ADR-0013 整块不接。
  '@xiranite/file-operations',
  '@xiranite/services',
  // 这两条是**没搬的内核**，不是解析表漏了：sleept 在本仓是电源节点，
  // 那份定时器内核（duration / interaction）属于"未迁批次"的账，见 docs/roadmap.md。
  '@xiranite/node-sleept/duration',
  '@xiranite/node-sleept/interaction',
  // melodeck 节点整个没迁（retain-rewrite 名单里的后面几个）。
  '@xiranite/node-melodeck/lyrics',
  // Go 内核宿主：按 ADR-0004 走 `@hibernalglow/xaihi-findz-<platform>-<arch>` 平台包，
  // 那条线还没发包 ⇒ 这条边现在必须响。
  '@xiranite/findz-native',
  // packages/shared 里没有 swimlane 那份（搬运只带了终端面用到的部分）。
  '@xiranite/shared/swimlane',
]

/** 自检：表里指向的文件必须真的存在（漂了就是构建红，而不是"某些文件解析不到"这种远因）。 */
export function assertAliasTargets() {
  const missing = Object.entries(XIRANITE_ALIASES)
    .filter(([, target]) => !existsSync(target))
    .map(([specifier, target]) => `${specifier} → ${target.replace(`${PKGS}/`, 'packages/')}`)
  if (missing.length > 0) {
    throw new Error(`ui-host/aliases: 解析表指向的源码不存在：\n  ${missing.join('\n  ')}`)
  }
  return Object.keys(XIRANITE_ALIASES).length
}

/** 给 tsconfig `paths` 用的形状（`extends` 不了 JS，所以由 `scripts/check-alias-sync.mjs` 保证两处一致）。 */
export function tsconfigPaths() {
  return Object.fromEntries(
    Object.entries(XIRANITE_ALIASES).map(([key, target]) => [key, [target.replace(`${PKGS}/`, '../')]]),
  )
}

/**
 * 把这张表写进 `tsconfig.ported.json` 的 `paths`（tsconfig 不能 import JS，所以"同一张表"
 * 只能靠生成来保证，不靠人抄两遍）。`@/*` 与 react 那几条是固定的，原样留着。
 */
export function writeTsconfigPaths() {
  const path = join(HERE, 'tsconfig.ported.json')
  const json = JSON.parse(readFileSync(path, 'utf8'))
  const keep = Object.fromEntries(
    Object.entries(json.compilerOptions.paths).filter(([key]) => !key.startsWith('@xiranite/')),
  )
  json.compilerOptions.paths = {
    ...keep,
    ...Object.fromEntries(Object.entries(XIRANITE_ALIASES).map(([key, target]) => [key, [target.replace(`${PKGS}/`, '../')]])),
  }
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
  return Object.keys(XIRANITE_ALIASES).length
}

if (process.argv[1] && process.argv[1].endsWith('build-aliases.mjs')) {
  if (process.argv.includes('--write')) {
    const written = writeTsconfigPaths()
    console.log(`build-aliases --write: 把 ${written} 条解析写进 tsconfig.ported.json 的 paths`)
    process.exit(0)
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-aliases.mjs')) {
  const count = assertAliasTargets()
  const json = JSON.parse(readFileSync(join(PKGS, 'ui-host/tsconfig.ported.json'), 'utf8'))
  const inTsconfig = Object.keys(json.compilerOptions.paths ?? {}).filter((k) => k.startsWith('@xiranite/'))
  const missing = Object.keys(XIRANITE_ALIASES).filter((k) => !inTsconfig.includes(k))
  const extra = inTsconfig.filter((k) => !(k in XIRANITE_ALIASES))
  console.log(`aliases: ${count} 条指向存在的源码；tsconfig 里 @xiranite/* 有 ${inTsconfig.length} 条`)
  if (missing.length > 0 || extra.length > 0) {
    if (missing.length > 0) console.error(`  × tsconfig 少这些：${missing.join(', ')}`)
    if (extra.length > 0) console.error(`  × tsconfig 多这些（表里没有）：${extra.join(', ')}`)
    process.exit(1)
  }
  console.log('alias 同步 OK（构建/测试/类型检查三处吃同一张表）')
}
