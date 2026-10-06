#!/usr/bin/env node
/**
 * 门禁：节点面板不许自带颜色，只许经 `@hibernalglow/xaihi-ui-kit` 上色。
 *
 * 为什么要有这条尺：主题属于 core 的 Material You 桥（它只叠 `--xaihi-*` 一层），
 * 面板里出现 hex、`rgb(...)` 或直接引用 `--dsw-*`，宿主换 seed / 换明暗时就会分成两套，
 * 而且**看不出坏了**——字色照样是字色。这类漂移只能靠机械检查挡在提交前。
 *
 * 尺本身要能红：`--self-check` 用一段合成违规代码跑同一份规则，测不到违规就报错退出。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

/** 一条规则：命中即违规，文案要能告诉人"该改成什么"。 */
const RULES = [
  { name: 'hex-color', pattern: /#[0-9a-fA-F]{3,8}\b/, hint: '颜色只能写在 ui-kit 的 ALIAS 兜底位' },
  { name: 'dsw-token', pattern: /--dsw-/, hint: '引用 --xaihi-* 别名，不要直接吃宿主的 --dsw-*' },
  { name: 'css-color-fn', pattern: /\b(?:rgb|rgba|hsl|hwb)\(/, hint: '不要在面板里构造颜色函数' },
  { name: 'own-react-root', pattern: /\b(?:createRoot|hydrateRoot)\s*\(/, hint: '面板不建自己的 React root，渲染归宿主 slots' },
]

/**
 * 剥掉注释，避免"文件头写着不写 hex"被当成违规。
 * @param source - 源文件文本。
 * @returns 只剩代码的行数组（行号与原文件一致，注释行为空串）。
 */
export function stripComments (source) {
  const lines = source.split('\n')
  let inBlock = false
  return lines.map((line) => {
    let out = ''
    for (let index = 0; index < line.length; index += 1) {
      const two = line.slice(index, index + 2)
      if (inBlock) {
        if (two === '*/') { inBlock = false; index += 1 }
        continue
      }
      if (two === '/*') { inBlock = true; index += 1; continue }
      if (two === '//') break
      out += line[index]
    }
    return out
  })
}

/**
 * 按规则表检查一份源码。
 * @param lines - 已剥注释的行。
 * @param label - 报告里显示的文件名。
 * @param requireKitImport - 是否要求该文件从 ui-kit 取组件。
 * @returns 违规清单（`label:line rule — hint`）。
 */
export function findViolations (lines, label, requireKitImport) {
  const problems = []
  if (requireKitImport && !lines.some((line) => line.includes('@hibernalglow/xaihi-ui-kit'))) {
    problems.push(`${label}: 没有从 @hibernalglow/xaihi-ui-kit 取组件（上色只能经 kit）`)
  }
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        problems.push(`${label}:${String(index + 1)} ${rule.name} — ${rule.hint}`)
      }
    }
  })
  return problems
}

/** 阳性对照：合成一段必须被抓到的代码。 */
function selfCheck () {
  const bad = stripComments([
    'export const Panel = () => <div style={{ color: "#b3261e", background: "rgba(0,0,0,.2)" }} className="--dsw-alias-text" />',
    'root.render(createRoot(document.body))',
  ].join('\n'))
  const caught = findViolations(bad, 'self-check', true)
  const kinds = new Set(caught.map((line) => line.split(' ').slice(1).join(' ').split(' — ')[0]))
  const missing = RULES.filter((rule) => !kinds.has(rule.name)).map((rule) => rule.name)
  if (missing.length > 0) {
    console.error(`check-panels: 尺是瞎的，这些规则没被抓到：${missing.join(', ')}`)
    return 1
  }
  console.log(`check-panels self-check OK（4 条规则各被抓到一次，命中 ${String(caught.length)} 处）`)
  return 0
}

/** 找出所有该检查的面板文件。 */
function panelFiles () {
  const pluginsDir = join(ROOT, 'plugins')
  if (!existsSync(pluginsDir)) return []
  const found = []
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = join(pluginsDir, entry.name, 'frontend', 'Panel.tsx')
    if (existsSync(file)) found.push(file)
  }
  return found.sort()
}

if (process.argv.includes('--self-check')) process.exit(selfCheck())

const problems = []
for (const file of panelFiles()) {
  const relative = file.slice(ROOT.length)
  problems.push(...findViolations(stripComments(readFileSync(file, 'utf8')), relative, true))
}

if (problems.length > 0) {
  console.error(`check-panels: ${String(problems.length)} 处违规`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`check-panels OK（${String(panelFiles().length)} 个面板都只经 kit 上色）`)
