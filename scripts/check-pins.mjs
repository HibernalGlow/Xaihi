/**
 * 版本闸门：所有 `@deepseek-ai/dsh*` 依赖必须精确等于 DSH_LINE。
 *
 * 为什么必须是脚本而不是注释：npm 上 `@deepseek-ai/dsh-client-ui-slots`、
 * `-modules`、`-tools`、`-theme` 的 `latest` 标签还停在 0.0.1-rc.1，
 * 任何一次裸 `pnpm add` 都会把整个生态悄悄降到一个不存在的 API 世代。
 * cordis 与 schemastery 有自己的发布线，用 EXEMPT 显式列出来而不是放宽规则。
 *
 * `--self-check` 是这条尺的阳性对照：一个错的版本必须被抓、豁免线必须被放过、
 * 非 `@deepseek-ai/` 的依赖不许被误报。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DSH_LINE = '0.2.0-rc.2'
const EXEMPT = new Set(['@deepseek-ai/cordis', '@deepseek-ai/schemastery'])
const GROUPS = ['packages', 'plugins']

/**
 * 按规则判一份依赖表。
 * @param label - 报告里显示的包名。
 * @param deps - 合并后的依赖表（dependencies + dev + peer）。
 * @returns 违规清单。
 */
export function depsViolations (label, deps) {
  const problems = []
  for (const [name, range] of Object.entries(deps)) {
    if (!name.startsWith('@deepseek-ai/')) continue
    if (EXEMPT.has(name)) continue
    if (range !== DSH_LINE) {
      problems.push(`${label}: ${name} is ${range}, expected exactly ${DSH_LINE}`)
    }
  }
  return problems
}

/** 阳性对照：尺必须能红，且不许误报。 */
function selfCheck () {
  const caught = depsViolations('a', {
    '@deepseek-ai/dsh': '0.1.5-rc.3',
    '@deepseek-ai/dsh-client-ui-slots': 'latest',
  })
  if (caught.length !== 2) {
    console.error(`check-pins: 尺是瞎的，两个错版本只抓到 ${String(caught.length)} 个`)
    return 1
  }
  const exempt = depsViolations('b', {
    '@deepseek-ai/cordis': '~4.0.4',
    '@deepseek-ai/schemastery': '~3.18.4',
    '@deepseek-ai/dsh': DSH_LINE,
    react: '^18.3.1',
  })
  if (exempt.length !== 0) {
    console.error(`check-pins: 豁免线或无关依赖被误报（${JSON.stringify(exempt)}）`)
    return 1
  }
  console.log('check-pins self-check OK（错版本被抓 2 个、豁免线与无关依赖被放过）')
  return 0
}

if (process.argv.includes('--self-check')) process.exit(selfCheck())

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
    }
    for (const [name, range] of Object.entries(deps)) {
      if (!name.startsWith('@deepseek-ai/')) continue
      checked.push(`${pkg.name} ${name}@${range}${EXEMPT.has(name) ? ' (exempt line)' : ''}`)
    }
    violations.push(...depsViolations(`${group}/${dir.name}`, deps))
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
