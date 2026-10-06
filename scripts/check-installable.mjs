#!/usr/bin/env node
/**
 * 门禁：能作为 bundle 被 `file:` 安装的包，不许带 `workspace:*` 运行时依赖。
 *
 * 为什么要有这条：profile 目录本身是一个 pnpm 项目，但它**不在**本仓的 workspace 里。
 * 于是 `dependencies` 中的 `workspace:*` 在装机时无法解析，实测整条安装被拒：
 *   Failed to resolve dependency: In …/profiles/xaihi-bundle:
 *   "@hibernalglow/xaihi-core@workspace:*" is in the dependencies
 *   but no package named "@hibernalglow/xaihi-core" is present in the workspace
 * 症状是"入口包装不上"，而本地 `pnpm build` 一路全绿，所以只能在这里拦。
 *
 * `devDependencies` 不受影响：`file:` 安装不装依赖包的 devDeps，而 kit / sdk 正是靠
 * 这一点在打包期内联（ADR-0002「一个包就是一个 bundle」）。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

/**
 * 唯一被允许的例外，且**只在全量发布之后才成立**：入口 bundle 包的
 * `workspace:*` 会在 `pnpm publish` 时被改写成真实版本号，那时它的依赖能从 registry 解析，
 * "装一个包就得到工作台"这条路才通。在那之前它只能用 `file:` 装不了——这条事实由
 * `docs/adr/0005-entry-bundle-reachability.md` 记着，别把它当成本地可验证的装机路径。
 */
const PUBLISH_TIME_ONLY = ['@hibernalglow/xaihi']

/**
 * 按包判定。
 * @param packages - `{ name, patch, dependencies }` 的最小形状。
 * @returns 违规与失效例外清单。
 */
export function checkPackages (packages) {
  const problems = []
  const seen = new Set()
  for (const entry of packages) {
    if (!entry.patch) continue
    seen.add(entry.name)
    const workspaceDeps = Object.entries(entry.dependencies ?? {})
      .filter(([, spec]) => String(spec).startsWith('workspace:'))
      .map(([dep]) => dep)
    if (workspaceDeps.length === 0) continue
    if (PUBLISH_TIME_ONLY.includes(entry.name)) continue
    problems.push(`${entry.name}: bundle 却带 workspace:* 运行时依赖 [${workspaceDeps.join(', ')}] —— file: 安装会在解析依赖树时被拒`)
  }
  for (const name of PUBLISH_TIME_ONLY) {
    if (!seen.has(name)) problems.push(`例外名单失效：${name} 不再是带 bundle patch 的包，请把它从 PUBLISH_TIME_ONLY 里删掉`)
  }
  return problems
}

function selfCheck () {
  const cases = [
    { name: '@scope/a', patch: true, dependencies: { '@scope/b': 'workspace:*' } },
    { name: '@scope/c', patch: true, dependencies: { '@scope/d': '1.2.3' } },
    { name: '@scope/e', patch: false, dependencies: { '@scope/f': 'workspace:*' } },
    { name: '@hibernalglow/xaihi', patch: true, dependencies: { '@hibernalglow/xaihi-core': 'workspace:*' } },
  ]
  const problems = checkPackages(cases)
  if (problems.length !== 1 || !problems[0].startsWith('@scope/a')) {
    console.error(`check-installable: 尺是瞎的，报出 ${JSON.stringify(problems)}，应只有 @scope/a 一处`)
    return 1
  }
  const stale = checkPackages([{ name: '@hibernalglow/xaihi', patch: true, dependencies: {} }])
  if (stale.length !== 0) {
    console.error(`check-installable: 例外在名单内却被判失效（${JSON.stringify(stale)}）`)
    return 1
  }
  console.log('check-installable self-check OK（workspace 依赖被抓、registry 版本被放过、例外名单被认）')
  return 0
}

if (process.argv.includes('--self-check')) process.exit(selfCheck())

const roots = ['packages', 'plugins']
const collected = []
for (const root of roots) {
  const dir = join(ROOT, root)
  if (!existsSync(dir)) continue
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = join(dir, entry.name, 'package.json')
    if (!existsSync(file)) continue
    const data = JSON.parse(readFileSync(file, 'utf8'))
    collected.push({
      name: data.name ?? entry.name,
      patch: Boolean(data.dsh?.bundle?.patch),
      dependencies: data.dependencies ?? {},
    })
  }
}

const problems = checkPackages(collected)
if (problems.length > 0) {
  console.error(`check-installable: ${String(problems.length)} 处问题`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(`check-installable OK（${String(collected.filter((item) => item.patch).length)} 个 bundle 包都能被 file: 安装，例外 ${String(PUBLISH_TIME_ONLY.length)} 个）`)
