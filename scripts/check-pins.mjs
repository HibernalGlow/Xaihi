/**
 * 版本闸门：所有 `@deepseek-ai/dsh*` 依赖必须精确等于 DSH_LINE。
 *
 * 为什么必须是脚本而不是注释：npm 上 `@deepseek-ai/dsh-client-ui-slots`、
 * `-modules`、`-tools`、`-theme` 的 `latest` 标签还停在 0.0.1-rc.1，
 * 任何一次裸 `pnpm add` 都会把整个生态悄悄降到一个不存在的 API 世代。
 * cordis 与 schemastery 有自己的发布线，用 EXEMPT 显式列出来而不是放宽规则。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DSH_LINE = '0.2.0-rc.2'
const EXEMPT = new Set(['@deepseek-ai/cordis', '@deepseek-ai/schemastery'])
const GROUPS = ['packages', 'plugins']

const violations = []
const checked = []

for (const group of GROUPS) {
  const root = join(process.cwd(), group)
  if (!existsSync(root)) continue
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const manifestPath = join(root, dir.name, 'package.json')
    if (!existsSync(manifestPath)) continue
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...(pkg.peerDependenciesMeta ? {} : {}),
    }
    for (const [name, range] of Object.entries(deps)) {
      if (!name.startsWith('@deepseek-ai/')) continue
      if (EXEMPT.has(name)) {
        checked.push(`${pkg.name} ${name}@${range} (exempt line)`)
        continue
      }
      checked.push(`${pkg.name} ${name}@${range}`)
      if (range !== DSH_LINE) {
        violations.push(`${group}/${dir.name}: ${name} is ${range}, expected exactly ${DSH_LINE}`)
      }
    }
  }
}

console.log(`check-pins: ${checked.length} @deepseek-ai deps against line ${DSH_LINE}`)
for (const line of checked) console.log(`  ${line}`)

if (violations.length > 0) {
  console.error(`\ncheck-pins FAILED (${violations.length}):`)
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}
console.log('check-pins OK')
