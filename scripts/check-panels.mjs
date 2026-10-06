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

/** 有 frontend/ 却没有 Panel.tsx 的包：枚举式门禁会被它静默变窄，所以要单独报。 */
export function findMissingPanels (pluginDirs, hasFile) {
  const problems = []
  for (const dir of pluginDirs) {
    if (hasFile(`${dir}/frontend`) && !hasFile(`${dir}/frontend/Panel.tsx`)) {
      problems.push(`${dir}: 有 frontend/ 却没有 Panel.tsx（面板缺失或改名，门禁就会漏掉它）`)
    }
  }
  return problems
}

/** 外壳与 kit 自己的样式表：颜色的第一层必须是 `--xaihi-*`，否则那一处就不跟 seed。 */
const STYLE_SOURCES = ['packages/ui-host/src/client/styles.ts', 'packages/ui-kit/src/tokens.ts']

/**
 * 找"直接以 `--dsw-*` 起头"的颜色引用。
 *
 * 逐次出现地判，不按整行判：一行里同时有分层与裸引用时（`.xaihi-nav { color:
 * var(--dsw-…); border: var(--xaihi-outline, …) }`），按行判会**放过那个裸的**——
 * 这条减法跑测真的抓出过一次假绿。
 * @param lines - 已剥注释的行。
 * @param label - 报告里显示的文件名。
 * @returns 违规清单。
 */
export function findUnlayeredDsw (lines, label) {
  const problems = []
  const layeredBefore = /var\(--xaihi-[a-z0-9-]+,\s*$/
  lines.forEach((line, index) => {
    for (let cursor = 0; cursor < line.length;) {
      const at = line.indexOf('var(--dsw-', cursor)
      if (at === -1) break
      if (!layeredBefore.test(line.slice(0, at))) {
        problems.push(`${label}:${String(index + 1)} unlayered-dsw — 先写 var(--xaihi-*，再兜底 --dsw-alias-*)，否则这一处不跟 seed`)
      }
      cursor = at + 1
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
  const holes = findMissingPanels(['plugins/x', 'plugins/y'], (path) => path === 'plugins/x/frontend')
  if (holes.length !== 1) {
    console.error(`check-panels: 枚举漏口的尺没抓到那个洞（报出 ${String(holes.length)} 处，应为 1）`)
    return 1
  }
  // 分层尺要同时验三种形状：裸的要抓、带 --xaihi- 层的要放过、同一行两种混着的要抓到那一次。
  const layered = findUnlayeredDsw(stripComments([
    'color: var(--dsw-alias-text-danger, #f00)',
    'color: var(--xaihi-error, var(--dsw-alias-text-danger, #f00))',
    '.a { color: var(--dsw-alias-text-primary); border-color: var(--xaihi-outline, var(--dsw-alias-border-default, #808080)); }',
  ].join('\n')), 'self-check')
  if (layered.length !== 2) {
    console.error(`check-panels: 分层尺是瞎的（报出 ${String(layered.length)} 处，应为 2：裸的与同行混着的各一次，带层的必须放过）`)
    return 1
  }
  console.log('check-panels self-check OK（4 条面板规则 + 枚举漏口 + 分层尺三种形状各按预期）')
  return 0
}

/** 仓里现有的插件目录名。 */
function pluginDirs () {
  const pluginsDir = join(ROOT, 'plugins')
  if (!existsSync(pluginsDir)) return []
  return readdirSync(pluginsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `plugins/${entry.name}`).sort()
}

/** 找出所有该检查的面板文件。 */
function panelFiles () {
  const found = []
  for (const dir of pluginDirs()) {
    const file = join(ROOT, dir, 'frontend', 'Panel.tsx')
    if (existsSync(file)) found.push(file)
  }
  return found.sort()
}

if (process.argv.includes('--self-check')) process.exit(selfCheck())

const hasFile = (relative) => existsSync(join(ROOT, relative))
const problems = findMissingPanels(pluginDirs(), hasFile)
for (const source of STYLE_SOURCES) {
  if (!hasFile(source)) continue
  problems.push(...findUnlayeredDsw(stripComments(readFileSync(join(ROOT, source), 'utf8')), source))
}
for (const file of panelFiles()) {
  const relative = file.slice(ROOT.length)
  problems.push(...findViolations(stripComments(readFileSync(file, 'utf8')), relative, true))
}

if (problems.length > 0) {
  console.error(`check-panels: ${String(problems.length)} 处违规`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`check-panels OK（${String(panelFiles().length)} 个面板只经 kit 上色；${String(STYLE_SOURCES.length)} 份样式表的分层引用合格）`)
