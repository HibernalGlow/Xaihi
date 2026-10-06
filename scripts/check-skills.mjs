/**
 * 技能层门禁：`.dsh/skills/` 必须能被 DSH 的本地 provider 扫到。
 *
 * 扫描规则（`docs/subsystems/skills.md`）：`<projectRoot>/.dsh/skills` 优先于 `.agents/skills`；
 * 条目是 `<name>/SKILL.md` 或扁平 `<name>.md`；kebab-case；**不支持嵌套 SKILL.md**。
 * 这些约束光靠人眼检阅会漂，所以钉成一条命令。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SKILLS_DIR = join(ROOT, '.dsh/skills')
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

const problems = []
const checked = []

if (!existsSync(SKILLS_DIR)) {
  console.error(`missing ${relative(ROOT, SKILLS_DIR)} — Xaihi 的技能层不该是空的`)
  process.exit(1)
}

const frontmatter = (text) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (match === null) return null
  const fields = {}
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':')
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return fields
}

for (const entry of readdirSync(SKILLS_DIR).sort()) {
  const path = join(SKILLS_DIR, entry)
  const isDirectory = statSync(path).isDirectory()
  if (!isDirectory) {
    if (entry === 'VENDOR.md' || entry.endsWith('.md')) {
      // 扁平 `<name>.md` 是一种受支持形状，但本仓只用目录形；VENDOR.md 是署名说明。
      if (entry !== 'VENDOR.md') problems.push(`${entry}: 扁平技能必须是 <name>.md 且 name 为 kebab-case（本仓统一用目录形）`)
      continue
    }
    problems.push(`${entry}: .dsh/skills 下只允许技能目录与 VENDOR.md`)
    continue
  }
  if (!KEBAB.test(entry)) problems.push(`${entry}: 目录名必须是 kebab-case`)

  const nested = readdirSync(path, { recursive: true }).filter(
    (child) => typeof child === 'string' && child.endsWith('SKILL.md') && child !== 'SKILL.md',
  )
  if (nested.length > 0) problems.push(`${entry}: 嵌套 SKILL.md 不被扫描 (${nested.join(', ')})`)

  const skillPath = join(path, 'SKILL.md')
  if (!existsSync(skillPath)) {
    problems.push(`${entry}: 缺 SKILL.md`)
    continue
  }
  const meta = frontmatter(readFileSync(skillPath, 'utf8'))
  if (meta === null) {
    problems.push(`${entry}: SKILL.md 缺 frontmatter`)
    continue
  }
  if (meta.name !== entry) problems.push(`${entry}: frontmatter name 是 "${meta.name ?? '(缺)'}"，必须与目录名一致`)
  if (!meta.description || meta.description.length < 40) problems.push(`${entry}: description 缺失或过短，模型选不中它`)
  checked.push(entry)
}

console.log(`checked ${checked.length} skill(s): ${checked.join(', ')}`)
if (problems.length > 0) {
  for (const problem of problems) console.error(`  × ${problem}`)
  process.exit(1)
}
console.log('skills layout OK (.dsh/skills, kebab-case, no nested SKILL.md, frontmatter matches)')
