#!/usr/bin/env node
/**
 * 尺：被判定"明确不做"的三件（后端重启 / 节点源码热更开关 / WebView2 专配，外加同属那条通路的
 * 节点内存保护）必须在源码、manifest、i18n 与测试里都不再出现。
 *
 * 阳性对照由 `--expect-violation` + `--root <植入树>` 提供：有违规时必须捕获，否则这把尺不存在。
 *
 * 用法：node scripts/verify-affordance-removal.mjs [--root <dir>] [--expect-violation] [--allow <子串>]
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const root = flag('root', process.cwd())
const expectViolation = args.includes('--expect-violation')
const allow = (flag('allow', '') || '').split(',').filter(Boolean)

/** 每条 = 名字 + 判据正则（大小写不敏感）。 */
const SYMBOLS = [
  ['后端重启', /restartBackend|restartLocalBackend|LocalBackendRestart|restartingBackend|localBackendControl/],
  ['节点源码热更', /node-source-hot-reload|NodeSourceHotReload|nodeHotReload|NODE_SOURCE_HOT_RELOAD/],
  ['WebView2 专配', /webview2/i],
  ['节点内存保护', /NodeMemoryProtectionSettings|node-memory-protection|memoryProtection\.fields|timeline\.steps\.memoryProtection|NodeMemoryProtectionSettings\.tsx/],
]

const ABSENT_FILES = [
  'packages/ui-host/src/backend/localBackendControl.ts',
  'packages/ui-host/src/components/views/settings/NodeMemoryProtectionSettings.tsx',
  'packages/ui-host/src/components/views/Webview2ExperimentsPanel.tsx',
  'packages/ui-host/src/config/webview2.ts',
]

const SCAN = ['packages', 'plugins']
const SKIP = new Set(['node_modules', 'dist', 'lib', '.git', 'artifacts'])
const EXT = new Set(['.ts', '.tsx', '.json', '.md', '.yml', '.yaml'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      if (!SKIP.has(entry)) yield* walk(full)
    } else if (EXT.has(`.${entry.split('.').pop()}`)) {
      yield full
    }
  }
}

const hits = []
for (const scan of SCAN) {
  const base = join(root, scan)
  if (!existsSync(base)) continue
  for (const file of walk(base)) {
    const rel = relative(root, file)
    if (allow.some((a) => rel.includes(a))) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const [name, re] of SYMBOLS) {
        if (re.test(line)) hits.push({ name, where: `${rel}:${i + 1}`, text: line.trim().slice(0, 90) })
      }
    })
  }
}

for (const rel of ABSENT_FILES) {
  if (existsSync(join(root, rel))) hits.push({ name: '整文件应已删除', where: rel, text: '文件仍存在' })
}

if (expectViolation) {
  if (hits.length === 0) {
    console.log('CONTROL FAILED: 植入的三件没有被这把尺看见')
    process.exit(1)
  }
  const kinds = new Set(hits.map((h) => h.name))
  console.log(`捕获 ${hits.length} 处，覆盖类别 ${[...kinds].join('、')}`)
  console.log(hits.slice(0, 4).map((h) => `  [${h.name}] ${h.where}: ${h.text}`).join('\n'))
  console.log('positive control verified')
  process.exit(0)
}

if (hits.length > 0) {
  console.log(`FAIL: 仍有 ${hits.length} 处引用`)
  console.log(hits.slice(0, 25).map((h) => `  [${h.name}] ${h.where}: ${h.text}`).join('\n'))
  process.exit(1)
}
console.log('affordance removal verified (四类符号 + 四个整文件全无残留)')
