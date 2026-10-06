#!/usr/bin/env node
/**
 * 尺：摘除之后的"静态状态"三件事，一条命令判完。
 *
 * 1) 被改过的源文件必须**没有解析级错误**（TS1xxx）。这是唯一可信的语法证据——
 *    "数花括号"和肉眼看不算。用 `--noResolve` 跑，未解析的导入是预期的语义噪声，只判解析。
 * 2) 两份 locale 必须仍可 `JSON.parse`，点名的键必须已消失，新加的 `topbar.devTools` 必须在，
 *    且两份语言的键集形状一致（顶层键数相等）。
 * 3) 快照台账必须逐条对得回磁盘（这次动的是别人未提交的文件，`but undo` 救不回来）。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const TOUCHED = [
  'packages/api/src/client.ts',
  'packages/shared/src/index.ts',
  'packages/ui-host/src/components/views/settings/RuntimeSection.tsx',
  'packages/ui-host/src/components/views/settings/settingsNavigation.ts',
  'packages/ui-host/src/components/views/settings/types.ts',
  'packages/ui-host/src/components/views/settings/themeMeta.ts',
  'packages/ui-host/src/components/views/settings/settingsNavigation.test.ts',
  'packages/ui-host/src/components/views/settings/ThemeSettings.test.tsx',
  'packages/ui-host/src/backend/configRpcClient.ts',
  'packages/ui-host/src/components/workspace/TopBar.tsx',
]
const SCRATCH = '/Users/glow/Base/Code/Freya/_scratch/xaihi-elysia-removal-2026-10-06'
const DELETED_KEYS = [
  'settings.webview2',
  'settings.memoryProtection',
  'settings.timeline.nodeHotReload',
  'settings.developerRuntime.restartBackend',
  'settings.developerRuntime.hotSwitchHint',
]

const problems = []

/** 1) 解析级检查 */
const tsc = join(ROOT, 'node_modules', '.bin', 'tsc')
const run = spawnSync(tsc, ['--noEmit', '--noResolve', '--skipLibCheck', '--target', 'esnext', '--module', 'esnext', '--jsx', 'preserve', ...TOUCHED], {
  cwd: ROOT,
  encoding: 'utf8',
})
const out = `${run.stdout ?? ''}${run.stderr ?? ''}`
if (run.error) problems.push(`tsc 启动失败: ${run.error.message}`)
const mentioned = new Set(out.split('\n').map((l) => (l.match(/^(.+?\.(?:ts|tsx))\(\d+,\d+\)/)?.[1] ?? '')).filter(Boolean))
for (const file of TOUCHED) {
  if (!mentioned.has(file)) problems.push(`解析检查没读到 ${file}（这条断言对它没有证据）`)
}
const parseErrors = out.split('\n').filter((l) => /error TS1[0-9]{3}/.test(l))
if (parseErrors.length > 0) problems.push(`解析级错误 ${parseErrors.length} 条：${parseErrors.slice(0, 3).join(' | ')}`)

/** 2) locale 状态 */
for (const f of ['zh', 'en']) {
  const path = join(ROOT, 'packages/ui-host/src/i18n/locales', `${f}.json`)
  let tree
  try {
    tree = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    problems.push(`${f}.json 解析失败: ${e.message}`)
    continue
  }
  for (const dotted of DELETED_KEYS) {
    const parts = dotted.split('.')
    let cursor = tree
    let found = true
    for (const part of parts) {
      if (cursor === null || typeof cursor !== 'object' || !(part in cursor)) {
        found = false
        break
      }
      cursor = cursor[part]
    }
    if (found) problems.push(`${f}.json 仍含 ${dotted}`)
  }
  if (!tree.topbar || typeof tree.topbar.devTools !== 'string' || tree.topbar.devTools === '') {
    problems.push(`${f}.json 缺少可用的 topbar.devTools（开发者工具那行菜单需要它）`)
  }
}
try {
  const zhKeys = Object.keys(JSON.parse(readFileSync(join(ROOT, 'packages/ui-host/src/i18n/locales/zh.json'), 'utf8'))).length
  const enKeys = Object.keys(JSON.parse(readFileSync(join(ROOT, 'packages/ui-host/src/i18n/locales/en.json'), 'utf8'))).length
  if (zhKeys !== enKeys) problems.push(`两份 locale 顶层键数不一致：zh=${zhKeys} en=${enKeys}`)
} catch { /* 已在上面报过 */ }

/** 3) 快照台账 */
const ledgerPath = join(SCRATCH, 'sha256-affordance.txt')
const treeDir = join(SCRATCH, 'affordance-removal')
if (!existsSync(ledgerPath) || !existsSync(treeDir)) {
  problems.push('快照目录或台账不存在')
} else {
  const expected = new Map()
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    const m = line.match(/^([0-9a-f]{64})\s+\.(\/.+)$/)
    if (m) expected.set(m[2], m[1])
  }
  function* walk(dir, base = dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) yield* walk(full, base)
      else yield { abs: full, rel: `/${full.slice(`${base}/`.length)}` }
    }
  }
  let checked = 0
  for (const { abs, rel } of walk(treeDir)) {
    const want = expected.get(rel)
    if (want === undefined) { problems.push(`快照 ${rel.slice(1)} 不在台账里`); continue }
    const got = createHash('sha256').update(readFileSync(abs)).digest('hex')
    checked += 1
    if (got !== want) problems.push(`快照 ${rel.slice(1)} sha 不符`)
  }
  if (checked !== expected.size) problems.push(`台账 ${expected.size} 条里只对回 ${checked} 条`)
}

if (problems.length > 0) {
  if (process.argv.includes('--expect-violation')) {
    console.log(`植入违规 ${problems.length} 条被捕获，示例：`)
    console.log(problems.slice(0, 4).map((p) => `  ${p}`).join('\n'))
    console.log('positive control verified')
    process.exit(0)
  }
  console.log(`FAIL: ${problems.length} 条`)
  console.log(problems.map((p) => `  ${p}`).join('\n'))
  process.exit(1)
}
if (process.argv.includes('--expect-violation')) {
  console.log('CONTROL FAILED: 植入的内容没有被这把尺看见')
  process.exit(1)
}
console.log(`affordance state verified (${TOUCHED.length} 个文件解析级无错，两份 locale 一致，快照 ${existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).length : 0} 条对回)`)
