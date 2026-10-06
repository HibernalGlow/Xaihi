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
 * - 还有一张**只给浏览器产物**的窄表 `BROWSER_GRAPH_ALIASES`（在下面）：它挡的是
 *   `@hibernalglow/xaihi-sdk` 裸名 → Node 侧工具管线那条边，故意不进 tsconfig，
 *   所以它的判据是"这条边只在浏览器图里被切"，不是"这张表又漏了三处"。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const HERE = import.meta.dirname
const PKGS = resolve(HERE, '..')
const UI_HOST_REL = '..'
const ROOT_PLUGINS = resolve(PKGS, '..', 'plugins')

/**
 * 上游 specifier 的短名 → 仓内源码路径。名字前缀由下面那一层派生，不在这儿抄两遍。
 */
const PORTED_TARGETS = {
  contract: 'contract/src/index.ts',
  shared: 'shared/src/index.ts',
  'shared/rules': 'shared/src/rules.ts',
  // 这条曾经挂在下面的"有意不给解析"里，理由是"packages/shared 里没有 swimlane 那份"。
  // 那句是**没量就写的错话**：`diff -q packages/shared/src/swimlane.ts <Xiranite>/packages/shared/src/swimlane.ts`
  // 逐字节相同（162 行、17 条导出），文件一直在仓里，缺的只是这张表的一行。
  // 症状很间接：`@/components/workspace/swimlane/model` 因此"module has no exports"，
  // 把 `LaneView.tsx` 炸出 5 条 ESModulesLinkingError（文档构建 25 条错里的 5 条是它的下游）。
  'shared/swimlane': 'shared/src/swimlane.ts',
  'api/client': 'api/src/client.ts',
  logging: 'logging/src/index.ts',
  'cli-runtime': 'cli-runtime/src/index.ts',
  'cli-runtime/terminal': 'cli-runtime/src/tui/index.ts',
}

/**
 * specifier → 仓内绝对路径（不带扩展名，交给解析器补）。
 *
 * 同一个目标要挂**两个名字**：搬运树里的 `@xiranite/*` 按 ADR-0007 留在源里不改（那是与上游
 * 可 diff 的载体），而 `packages/{api,cli,cli-runtime,contract,logging,shared}` 这六个包自己
 * 已经换成 `@hibernalglow/xaihi-*`（`docs/stages/step-4-terminal-port.md` §十 第 3 步）。
 * 少了后一半，ui-host 只要经由 `@xiranite/api/client` 拉进那份源码，就会在它的
 * `import '@hibernalglow/xaihi-shared'` 上解析不到 —— 类型检查与浏览器产物两头一起红，
 * 而症状写在 `packages/api` 里、根因在这张表。
 */
export const XIRANITE_ALIASES = Object.fromEntries(
  Object.entries(PORTED_TARGETS).flatMap(([sub, rel]) => [
    [`@xiranite/${sub}`, join(PKGS, rel)],
    [`@hibernalglow/xaihi-${sub}`, join(PKGS, rel)],
  ]),
)

/**
 * 这张表管的两个前缀。`--write` 与 `--check` 都必须吃这一个判据：
 * 两处各写一份筛选条件，就会出现"生成器写了、判据说不存在"那种自相矛盾的尺。
 */
const MANAGED_BY_THIS_TABLE = (key) => key.startsWith('@xiranite/') || key.startsWith('@hibernalglow/xaihi-')

// `@xiranite/api`（裸包名）在本仓**没有 index.ts**：`packages/api/src/` 只有
// `client.ts` 与 `source-thumbnail-client.ts`，上游那个 barrel 没随搬。
// 表里曾经写过一条指到不存在的 `api/src/index.ts` —— 被本文件的自检当场抓住，
// 这条注释就是它留下的账：解析表必须"每一条都指得到东西"。

/**
 * 节点界面里 value-import 自己节点纯逻辑叶子的那一族（`@xiranite/node-<id>/<子路径>`）。
 *
 * ADR-0007 决定 4 禁的是 **`entry.ts` 把执行器挂成 `AppNodeEntry.core`**（"面里能跑节点逻辑，
 * 就是协议之外的第二个执行宿主"），不是"组件不许用纯函数"。上游 noxide 的 `Component.tsx`
 * 直接用了 core 里的纯函数（`splitLines` / `filterLines` / `createDiffRows` 这类），
 * 保真搬运就要保留那条 import；解析上它指到**本仓同一个节点的 `src/<那片>.ts`**，
 * 由 `noExternal` 在构建期内联进产物（ADR-0002 说的是装进 profile 的包不许引仓内包，
 * 而这里进的是工作台产物，不是那个包的运行时依赖）。
 *
 * 名单**不靠手抄，也不靠固定几个文件名**：早先只认 `core.ts` 与 `interaction.ts` 两个名字，
 * 于是每搬一片新的纯逻辑叶子（`classf/blacklist`、`enginev/defaults`、`cleanf/paths` 这一类）
 * 都要人记得回来加一行——记不得就是"构建红在一个没人想到要去查的地方"。
 *
 * 但"文件存在就给边"也是错的：那样 `platform.ts` / `exec.ts` / `cli.ts` 这些**只该住在宿主进程里**
 * 的文件会一起拿到一条浏览器可解析的边，界面 import 到它们就把 `node:child_process`、`node:fs`
 * 整只拖进工作台产物——正是 ADR-0007 决定 4 要挡的那个形状，也是本仓花力气清掉的 `node:*` 那批构建错。
 * 所以判据是**这片文件自己干不干净**：读它的文本，只要 value-import 里出现任何 Node 内建
 * （`node:*` 与裸名 `fs`/`path`/`os`/`child_process`/`module`/`worker_threads`），就不给它边。
 * 这条是机器判的，不靠人记；纯函数叶子照常自动多一条边，新搬一片就自动可解析。
 * 缺的仍然进下面那份"按设计不给"的清单，别编。
 */
function isNodeOnly(source) {
  for (const match of source.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
    const spec = match[1]
    if (spec.startsWith('node:')) return true
    if (/^(fs|path|os|child_process|module|worker_threads|crypto|stream|url|util|events|http|https|net|dns|zlib|readline|assert|buffer|constants|tty|dgram|cluster|v8|vm|perf_hooks|async_hooks)$/.test(spec)) return true
  }
  return false
}

export function nodeCoreAliases() {
  const out = {}
  const dirs = existsSync(ROOT_PLUGINS) ? readdirSync(ROOT_PLUGINS, { withFileTypes: true }) : []
  for (const dir of dirs) {
    const srcDir = join(ROOT_PLUGINS, dir.name, 'src')
    if (!dir.isDirectory() || !existsSync(srcDir)) continue
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.ts') || name === 'index.ts') continue
      const target = join(srcDir, name)
      // `import type` 从 Node-only 文件里取类型是允许的（那一半在构建期就消失了），
      // 所以这里问的不是"这文件像不像 Node 侧"，而是"界面 value-import 它会不会把执行宿主拖进产物"。
      if (isNodeOnly(readFileSync(target, 'utf8'))) continue
      out[`@xiranite/node-${dir.name}/${name.replace(/\.ts$/, '')}`] = target
    }
  }
  return out
}

/** 表里补上派生出来的 node 纯逻辑边（不可手抄：新迁一个节点或补一片叶子就自动多一条）。 */
Object.assign(XIRANITE_ALIASES, nodeCoreAliases())

/**
 * 有意**不给**解析的边：命中就该在构建里响，而不是被一个假 stub 糊过去。
 * 键是子串匹配（这些 specifier 出现在哪些文件由 `scripts/port-debt.mjs` 逐条列）。
 */
export const UNRESOLVED_BY_DESIGN = [
  // 上游"配置住在后端 toml + HTTP/RPC + 版本历史"那条通路，ADR-0013 整块不接。
  '@xiranite/file-operations',
  '@xiranite/services',
  // melodeck 节点整个没迁（retain-rewrite 名单里的后面几个）。
  '@xiranite/node-melodeck/lyrics',
  // Go 内核宿主：按 ADR-0004 走 `@hibernalglow/xaihi-findz-<platform>-<arch>` 平台包，
  // 那条线还没发包 ⇒ 这条边现在必须响。
  '@xiranite/findz-native',
]

/**
 * **只给浏览器产物**的收窄别名：把 Node 专用那一半挡在图外，而不是给它写一份假垫片。
 *
 * 为什么不并进上面那张表（`XIRANITE_ALIASES` 一张表喂 tsconfig paths / vitest / tsdown 三处）：
 * `@hibernalglow/xaihi-sdk` 的**裸名**在类型检查那边必须是整只 barrel ——
 * 上面那五条 `import type` 从裸名取的 `PanelContribution`、`CommandOutcome`、`UIModuleLoader`、
 * `ModuleRef`、`LoadResult`、`PanelHost`、`WorkspaceDocument` 只从 `src/index.ts` 那一族出，
 * `src/help.ts` 一个都不提供（`rg -n "^export " packages/node-sdk/src/help.ts` 只有 `Terminal*` 那一族
 * 加 `nodeHelpFromManifest`），把它写进 `paths` 就是让类型检查读不到那些名字。
 * 而浏览器图里对这个裸名的 value-import 只有一个
 * （实测 2026-10-07：`rg -n "from '@hibernalglow/xaihi-sdk'" packages/ui-host/src` 六条命中，
 * 其中 `src/client/{index.ts:24,loader/probe.ts:11,loader/remote-modules.ts:15,workspace.tsx:21,node-mount.tsx:27}`
 * 五条是 `import type`（swc 擦掉，不产生运行时请求），
 * 只剩 `src/components/modules/packageModules.generated.ts:9` 取 `nodeHelpFromManifest`）。
 *
 * 那条边为什么要挡：barrel 里有 `./define-node.ts`，它
 * `import { defineTool } from '@deepseek-ai/dsh-tools'`（`packages/node-sdk/src/define-node.ts:18`），
 * dsh-tools 再拉 dsh-sandbox 与 dsh-llm ⇒ 三条 `Reading from "node:*" is not handled`。
 * 出处不是猜的，是从 stats 里读回来的：`pnpm run build:document` 之外另跑一次
 * `rspack build -c <同这份配置> --json /tmp/probe-stats.json`，取 `modules[]` 里 `name === "node:fs"` 那一项的
 * `issuer` 与 `issuerPath`：`node:fs` 与 `node:os` 的 issuer 是 `@deepseek-ai/dsh-sandbox/lib/index.js`、
 * `node:module` 的 issuer 是 `@deepseek-ai/dsh-llm/lib/index.js`，
 * 三条的 `issuerPath` 末段都是 `./src/components/modules/packageModules.generated.ts + 13 modules`。
 * 原先怀疑的两处**不是**这条边：同一份 stats 里 logging 只进了 `src/index.ts → schema|jsonl|query`、
 * shared 只进了 `index|http-url|rules|swimlane`，`packages/logging/src/node.ts` 与
 * `packages/shared/src/efu-stream.ts` 一个都不在图上（同一份 `modules[].identifier` 里搜 `logging/src/node`
 * 与 `efu-stream`，命中 0）。
 *
 * 目标为什么是 `src/help.ts`：它是 `nodeHelpFromManifest` 的产地，而且**零 import**
 * （实测 `rg -n "^\s*(import|export \*|export \{)" packages/node-sdk/src/help.ts` 命中 0），
 * 所以把它搬进图不会带进任何 Node 依赖 —— 这是"少装一点"，不是"装个假的"：
 * 键在消费侧加 `$` 做整名匹配，`@hibernalglow/xaihi-sdk/bridge` 与 `/operations`
 * 那两条子路径不受影响，仍走包自己那两份浏览器安全的入口。
 * 若将来有人给 `packages/node-sdk` 补一条 `./help` 导出并让生成器改成子路径取，
 * 这条别名就自然脱用（裸名不再出现在浏览器图里），删它即可，不会留下静默的第二份实现。
 */
export const BROWSER_GRAPH_ALIASES = {
  '@hibernalglow/xaihi-sdk': join(PKGS, 'node-sdk/src/help.ts'),
}

/** 自检：表里指向的文件必须真的存在（漂了就是构建红，而不是"某些文件解析不到"这种远因）。 */
export function assertAliasTargets() {
  // 名单过期也是一种错：那条边本来"必须响"，现在文件真的存在了，就该把它从名单里删掉，
  // 而不是让一个已经能解析的继续被记成缺口（下一批人会继续照名单去找一个不存在的问题）。
  const stale = Object.keys(XIRANITE_ALIASES).filter((specifier) =>
    UNRESOLVED_BY_DESIGN.some((needle) => specifier.includes(needle)))
  if (stale.length > 0) {
    throw new Error(`ui-host/aliases: 这些边已经有真文件了，仍挂在"按设计不给解析"名单里：${stale.join(', ')}`)
  }
  const missing = Object.entries({ ...XIRANITE_ALIASES, ...BROWSER_GRAPH_ALIASES })
    .filter(([, target]) => !existsSync(target))
    .map(([specifier, target]) => `${specifier} → ${target.replace(`${PKGS}/`, 'packages/')}`)
  if (missing.length > 0) {
    throw new Error(`ui-host/aliases: 解析表指向的源码不存在：\n  ${missing.join('\n  ')}`)
  }
  // 这面"只给纯逻辑叶子边"的旗必须有活干：如果一份 Node-only 的叶子被派生成浏览器边，
  // 上面那个 filter 就是装饰品；如果一份 Node-only 的文件压根不存在，那就是名单空转。
  const derived = nodeCoreAliases()
  const leaked = Object.entries(derived).filter(([, target]) => isNodeOnly(readFileSync(target, 'utf8')))
  if (leaked.length > 0) {
    throw new Error(`ui-host/aliases: 这些边指向 Node 专用文件，界面 value-import 它们会把执行宿主拖进产物：\n  ${leaked.map(([s]) => s).join('\n  ')}`)
  }
  const skipped = countNodeOnlyLeaves()
  if (skipped === 0) {
    throw new Error('ui-host/aliases: 一个 Node 专用叶子都没筛掉 ⇒ 那条过滤是在空转，别把它当防御')
  }
  return Object.keys(XIRANITE_ALIASES).length
}

/** 自检用：有几个 src/*.ts 因为是 Node 专用而被拒给边。 */
function countNodeOnlyLeaves() {
  if (!existsSync(ROOT_PLUGINS)) return 0
  let n = 0
  for (const dir of readdirSync(ROOT_PLUGINS, { withFileTypes: true })) {
    const srcDir = join(ROOT_PLUGINS, dir.name, 'src')
    if (!dir.isDirectory() || !existsSync(srcDir)) continue
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.ts') || name === 'index.ts') continue
      if (isNodeOnly(readFileSync(join(srcDir, name), 'utf8'))) n += 1
    }
  }
  return n
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
    Object.entries(json.compilerOptions.paths).filter(([key]) => !MANAGED_BY_THIS_TABLE(key)),
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
  // 这张表管**两个前缀**：搬运树里保留的 `@xiranite/*`，与六个包自己的 `@hibernalglow/xaihi-*`。
  // 筛键只能按"这张表管不管"筛。按前缀筛过一次，判据就永远是红的：它把表里 8 条
  // `@hibernalglow/xaihi-*` 当成 tsconfig 的缺失，而那 8 条实测就在文件里（48 = 35 + 8 + 5）。
  const inTsconfig = Object.keys(json.compilerOptions.paths ?? {}).filter(MANAGED_BY_THIS_TABLE)
  const missing = Object.keys(XIRANITE_ALIASES).filter((k) => !inTsconfig.includes(k))
  const extra = inTsconfig.filter((k) => !(k in XIRANITE_ALIASES))
  // 浏览器那张窄表**故意不进** tsconfig：裸名在类型检查那边必须是整只 barrel
  // （理由见 `BROWSER_GRAPH_ALIASES` 的注释），所以它只被 `rspack.document.mjs` 消费。
  console.log(
    `aliases: ${count} 条指向存在的源码；tsconfig 里这张表的键有 ${inTsconfig.length} 条；` +
      `另 ${Object.keys(BROWSER_GRAPH_ALIASES).length} 条只给浏览器产物`,
  )
  if (missing.length > 0 || extra.length > 0) {
    if (missing.length > 0) console.error(`  × tsconfig 少这些：${missing.join(', ')}`)
    if (extra.length > 0) console.error(`  × tsconfig 多这些（表里没有）：${extra.join(', ')}`)
    process.exit(1)
  }
  console.log('alias 同步 OK（构建/测试/类型检查三处吃同一张表）')
}
