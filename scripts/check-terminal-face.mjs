#!/usr/bin/env node
/**
 * 逐节点「终端面」对照表。
 *
 * 目的：把「26 个节点缺终端面」这句话变成文件级、可复核的读数，而不是一个印象。
 * 两个根：
 *   上游 = <Xiranite>/packages/nodes/<id>/src   （终端面在这里，**不在** src/nodes/<id>/）
 *   本仓 = <Xaihi>/plugins/<id>/src
 *
 * 只读。不装依赖、不改文件。缺的目录按「未移植」记，不报错。
 *
 * 用法：
 *   node scripts/check-terminal-face.mjs
 *   node scripts/check-terminal-face.mjs --json
 */
import fs from 'node:fs'
import path from 'node:path'

const UP_ROOT = process.env.XIRANITE_NODES_ROOT
  ?? '/Users/glow/Base/Code/Freya/Xiranite/packages/nodes'
const OWN_ROOT = process.env.XAIHI_PLUGINS_ROOT
  ?? path.resolve(import.meta.dirname, '..', 'plugins')

// 上游终端面被逐字搬过来的那几件（linedup 只用到前两件；presets/ordering 是 cleanf 档独有）
const FACE_FILES = ['Tui.tsx', 'interaction.ts', 'presets.ts', 'ordering.ts', 'definition.ts']

const isTest = (f) => /\.test\.tsx?$/.test(f)

function listDirs(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

/** src 目录里的文件盘点：每件存在与否 + 行数 + 测试份数 */
function scanSrc(dir) {
  const out = {
    exists: fs.existsSync(dir),
    files: {},
    lines: {},
    tests: [],
    homemadeOpentui: false,
  }
  if (!out.exists) return out
  const names = fs.readdirSync(dir)
  for (const f of FACE_FILES) {
    if (names.includes(f)) {
      out.files[f] = true
      const buf = fs.readFileSync(path.join(dir, f), 'utf8')
      // 「行」= 换行符计数 + 1（与 wc -l 的差别在无尾换行的最后一行；这里取文本行数）
      out.lines[f] = buf.split('\n').length - (buf.endsWith('\n') ? 1 : 0)
    } else {
      out.files[f] = false
      out.lines[f] = 0
    }
  }
  for (const n of names) if (isTest(n)) out.tests.push(n)
  // 自制 Deck 探针：cli.ts 里出现 opentui 的**运行时**入口（不是注释）
  const cli = path.join(dir, 'cli.ts')
  if (fs.existsSync(cli)) {
    const src = fs.readFileSync(cli, 'utf8')
    out.homemadeOpentui = /from\s*['"]@opentui\/core['"]|createCliRenderer/.test(src)
  }
  return out
}

const upIds = new Set(listDirs(UP_ROOT))
const ownIds = new Set(listDirs(OWN_ROOT))
const all = [...new Set([...upIds, ...ownIds])].sort()

const rows = all.map((id) => {
  const up = scanSrc(path.join(UP_ROOT, id, 'src'))
  const own = scanSrc(path.join(OWN_ROOT, id, 'src'))
  return { id, up, own, inUpstream: upIds.has(id), inOwn: ownIds.has(id) }
})

const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)
const cells = (r, side) => FACE_FILES
  .map((f) => {
    const s = r[side]
    if (!s.exists) return '-'
    return s.files[f] ? String(s.lines[f]) : '.'
  })

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  const W = 11
  console.log('')
  console.log('上游根: ' + UP_ROOT)
  console.log('本仓根: ' + OWN_ROOT)
  console.log('列语义: 数字=存在且行数 / "."=缺 / "-"=该节点的 src 目录不存在')
  console.log('列顺序: ' + FACE_FILES.join(' '))
  console.log('')
  console.log(
    pad('node', 13) +
    pad('| 上游 ' + FACE_FILES.map((f) => pad(f.replace(/\.tsx?$/, ''), 10)).join(''), 0) +
    ' | T# ' +
    pad('|| 本仓 ' + FACE_FILES.map((f) => pad(f.replace(/\.tsx?$/, ''), 10)).join(''), 0) +
    '| T# | Deck',
  )
  console.log('-'.repeat(140))
  for (const r of rows) {
    const up = cells(r, 'up')
    const own = cells(r, 'own')
    const flag = r.own.homemadeOpentui ? 'self' : r.own.exists ? '' : '--'
    console.log(
      pad(r.id, 13) +
      '| ' + up.map((c) => pad(c, 10)).join('') +
      ' | ' + padL(r.up.tests.length, 2) + ' ' +
      '|| ' + own.map((c) => pad(c, 10)).join('') +
      ' | ' + padL(r.own.tests.length, 2) + ' | ' + flag,
    )
  }

  // ---- 汇总 ----
  const shared = rows.filter((r) => r.inUpstream && r.inOwn)
  const miss = (f) => shared.filter((r) => r.up.files[f] && !r.own.files[f]).length
  const have = (f) => shared.filter((r) => r.up.files[f] && r.own.files[f]).length
  const upCount = (f) => rows.filter((r) => r.up.files[f]).length

  console.log('')
  console.log('== 双边都有的节点 = ' + shared.length + ' 个 ==')
  for (const f of FACE_FILES) {
    console.log(
      '  ' + pad(f, 16) +
      '上游有 ' + padL(upCount(f), 2) + ' 个节点 / 本仓已搬 ' + padL(have(f), 2) +
      ' / 缺 ' + padL(miss(f), 2),
    )
  }
  const onlyUp = rows.filter((r) => r.inUpstream && !r.inOwn).map((r) => r.id)
  const onlyOwn = rows.filter((r) => !r.inUpstream && r.inOwn).map((r) => r.id)
  console.log('')
  console.log('只在上游（本仓未建包）: ' + (onlyUp.join(', ') || '（无）'))
  console.log('只在本仓（上游没有）  : ' + (onlyOwn.join(', ') || '（无）'))
  const upTests = rows.reduce((a, r) => a + r.up.tests.length, 0)
  const ownTests = rows.reduce((a, r) => a + r.own.tests.length, 0)
  console.log('')
  console.log('测试份数合计: 上游 ' + upTests + ' / 本仓 ' + ownTests)
  console.log('自制 OpenTUI（不是搬上游 Tui.tsx）的节点: ' +
    (rows.filter((r) => r.own.homemadeOpentui).map((r) => r.id).join(', ') || '（无）'))
  console.log('')
}
