/**
 * 节点注册表生成器：`packages/ui-host/src/components/modules/packageModules.generated.ts`
 * 的唯一作者。**这是构建期的事，不是运行时装出来的**（ADR-0007 决定 6 第 2 条）。
 *
 * 为什么必须有第二个生成器：搬过来的那份注册表是上游 28 个节点的全集，
 * 里面每一条 `() => import("@/nodes/<id>/entry")` 与 `@xiranite/node-<id>/help`
 * 都是**构建期的静态边**——没搬的节点不是"运行时 404"，而是整个 bundle 直接编不出来
 * （实测探针构建 29 条 `RESOLVE_ERROR: Could not resolve '@/nodes/bandia/entry'`）。
 * 注册表必须与实际存在的界面交集，而交集这件事不能靠人记得同步。
 *
 * 三条与上游不同的地方，都是本仓的纪律：
 * 1. **帮助不再按包名动态引**：`plugins/*` 不是本包的依赖，`@hibernalglow/xaihi-<id>/help`
 *    在浏览器产物里解析不到。清单是数据，所以生成器把 `package.json#xaihi.node` **嵌进产物**，
 *    帮助载荷在客户端用 `nodeHelpFromManifest` 现推（同一个推导器，不是第二真源）。
 * 2. **类型不再从 `@xiranite/contract` 拿**：那是 `workspace:*` + 未入 workspace 的包，
 *    类型 import 虽被 bundler 擦掉，却让 typecheck 永远挂一条叫不出名字的边。这里就地声明最小形状。
 * 3. 每条节点都带 `manifest`，`def` 由界面侧的 `entry.ts` 从这里取 —— ADR-0007 决定 4
 *    要的就是"连接点是纯数据叶子"，而 Xaihi 的纯数据叶子正是 `package.json#xaihi`。
 *
 * 用法：
 *   node scripts/gen-node-registry.mjs            # 生成
 *   node scripts/gen-node-registry.mjs --check    # 门禁：不一致即红
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const NODES = join(ROOT, 'packages/ui-host/src/nodes')
const OUT = join(ROOT, 'packages/ui-host/src/components/modules/packageModules.generated.ts')

/** 界面与宿主清单**两边都有**才算一条节点；缺任何一边就报出来，不静默漏。 */
function collect() {
  const dirs = readdirSync(NODES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .map((entry) => entry.name)
    .sort()

  const usable = []
  const skipped = []
  for (const id of dirs) {
    const hasEntry = existsSync(join(NODES, id, 'entry.ts'))
    const manifestPath = join(ROOT, 'plugins', id, 'package.json')
    if (!hasEntry) {
      skipped.push(`${id}: 有界面目录但没有 entry.ts`)
      continue
    }
    if (!existsSync(manifestPath)) {
      // 宿主半边还没迁（或还没提交）：先不进注册表，否则又造出一条编不出来的静态边。
      skipped.push(`${id}: 有 entry.ts 但 plugins/${id}/package.json 不存在`)
      continue
    }
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const node = pkg.xaihi?.node
    if (node === undefined) {
      skipped.push(`${id}: plugins/${id} 没有 xaihi.node 清单`)
      continue
    }
    usable.push({ id, manifest: node, version: pkg.version ?? '0.0.0' })
  }
  return { usable, skipped, all: dirs }
}

function emit(usable) {
  const rows = usable.map((entry) => {
    const node = entry.manifest
    const title = node.title?.en ?? entry.id
    const description = node.description?.en ?? ''
    const keywords = [entry.id, ...(node.actions ?? []).map((action) => action.id)]
    return `  {\n    id: ${JSON.stringify(entry.id)},\n    name: ${JSON.stringify(title)},\n    version: ${JSON.stringify(entry.version)},\n    description: ${JSON.stringify(description)},\n    keywords: ${JSON.stringify(keypoints(keywords))},\n    manifest: ${JSON.stringify(node)},\n  },`
  })

  const loaders = usable.map((entry) =>
    `  ${entry.id}: () => import('@/nodes/${entry.id}/entry') as Promise<{ default: AppNodeEntry }>,`)

  const helpLoaders = usable.map((entry) =>
    `  ${entry.id}: async () => ({ help: nodeHelpFromManifest(NODE_MANIFESTS[${JSON.stringify(entry.id)}] as never) }),`)

  const manifests = usable.map((entry) => `  ${entry.id}: NODE_DEFS.find((def) => def.id === ${JSON.stringify(entry.id)})?.manifest as never,`)

  return `// 由 scripts/gen-node-registry.mjs 生成。不要手改：手改会被下一次生成抹掉，
// 而且这条链上有门禁（--check）会红。
//
// 三条本仓的规矩（理由在生成器顶部注释里）：
//   1. 只登记"界面与宿主清单两边都在"的节点；
//   2. 帮助载荷用 nodeHelpFromManifest 从嵌进来的清单现推，不按包名动态 import；
//   3. 类型就地声明，不从 @xiranite/contract 拿（那个包没进 workspace）。

import { nodeHelpFromManifest } from '@hibernalglow/xaihi-sdk'

/** 上游 contract 的 \`NodeDef\` 在本仓的最小可用形状（加了一份纯数据清单）。 */
export interface PackageModuleDef {
  id: string
  name: string
  version: string
  description: string
  keywords: string[]
  /** \`package.json#xaihi.node\` 的原样内容 —— 界面侧 \`def\` 的唯一来源（ADR-0007 决定 4）。 */
  manifest: unknown
}

/** 上游 \`AppNodeEntry\` 的形状：一份纯数据定义 + 一个组件。 */
export interface AppNodeEntry {
  def: unknown
  Component: unknown
}

export const PACKAGE_MODULES = [
${rows.join('\n')}
] satisfies PackageModuleDef[]

const NODE_DEFS = PACKAGE_MODULES

/** 清单的索引；节点的 \`entry.ts\` 从这里取 \`def\`，不 value-import 宿主运行时。 */
export const NODE_MANIFESTS = {
${manifests.join('\n')}
} as const

export type PackageModuleId = keyof typeof NODE_MANIFESTS

export const packageModuleLoaders = {
${loaders.join('\n')}
} satisfies Partial<Record<string, () => Promise<{ default: AppNodeEntry }>>>

export const nodeHelpLoaders = {
${helpLoaders.join('\n')}
} satisfies Partial<Record<string, () => Promise<{ help: unknown }>>>
`
}

const keypoints = (list) => [...new Set(list.filter((word) => typeof word === 'string' && word.length > 0))].slice(0, 8)

const check = process.argv.includes('--check')
const { usable, skipped, all } = collect()
const generated = emit(usable)
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''

if (skipped.length > 0) console.log(`gen-node-registry: 跳过 ${skipped.length} 条（界面/清单不齐）`)
for (const line of skipped) console.log(`  - ${line}`)
console.log(`gen-node-registry: ${all.length} 个界面目录 → ${usable.length} 条注册 [${usable.map((entry) => entry.id).join(', ')}]`)

if (check) {
  if (generated !== current) {
    console.error('  × 注册表与实际存在的节点不一致：跑 `node scripts/gen-node-registry.mjs` 再提交')
    process.exit(1)
  }
  console.log('gen-node-registry --check OK')
  process.exit(0)
}

writeFileSync(OUT, generated)
console.log(`  已写 ${OUT.replace(`${ROOT}/`, '')}（${generated.split('\n').length} 行）`)
