#!/usr/bin/env node
/**
 * 品牌门禁：代码里不许出现旧项目名 `xiranite`。
 *
 * 为什么只量代码不量文档：仓里大量 **prose** 是刻意写着 `Xiranite` 的——那是"这一条是从哪搬来"
 * 的出处（ADR、技能、阶段报告、对照表）。要禁的是**活标识符**：import 说明符、CSS 类名、
 * bin 名、临时目录前缀这类会随代码活下去的名字。它们留着旧品牌，症状是"搬过来的东西还在
 * 自称上一个项目"，而且会顺着 npm 包名、注册表 key 一路漏到使用者面前。
 * 判据：剥掉注释之后再找。
 *
 * 2026-10-08 追加：扫描面收到 Rust 那一层（`.rs` / `.toml`，含仓根 `Cargo.toml`）。
 * 理由是搬进来的那份引擎（`plugins/kisaki/native/{core,node}`，基线 4963 行）里
 * `xiranite` 出现在**会进二进制的地方**：crate 名、依赖键、`temp_dir()` 前缀、
 * `set_config_cache_path()` 的落盘目录名——正好是这条尺的内容，而 `.rs` 不在扩展名表时
 * 尺对它完全没声音（实测：搬进来之后 `check-brand` 照旧 OK，22 个文件带旧品牌字串）。
 * ADR-0015 决定 6 要的那批改名因此第一次有了尺盯着。
 *
 * 不许加白名单，但 AGENTS.md 留了一条正当出口：确实必须保留的旧标识符要成为
 * ADR-0010 里**被逐地点名的决定**。所以这里读那份账（机器行 `BRAND-EXCEPTION:`），
 * 三条规矩：在场且已点名 ⇒ 放行**且在输出里点名**；账上写了而代码里没了 ⇒ 红（过期）；
 * 命中而未点名 ⇒ 红。放行不是永久的，这一点由 `--self-check` 的夹具证明它会红。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.css', '.rs', '.toml']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'examples', '.git', '.pnpm', 'target'])
// 这把尺自己必须字面写着旧品牌（模式与三条正控的夹具），所以只放过这一个文件；`--self-check` 是它防瞎的对照。
const SELF = 'scripts/check-brand.mjs'
const LEDGER = 'docs/adr/0010-brand-is-xaihi.md'
const BRAND = /xiranite/i
/** 账上那一行的机器形状：`BRAND-EXCEPTION: <相对路径>:<行号> reason=<…> unlock=<…>`。 */
const LEDGER_LINE = /^BRAND-EXCEPTION:\s*(\S+):(\d+)\s+reason=(.+?)(?:\s+unlock=(.+))?$/gm

/**
 * 读 ADR-0010 里被逐地点名的旧标识符。
 * @param source - 那份 ADR 的正文。
 * @returns 申报清单（路径 + 行号 + 理由 + 解除条件）。
 */
export function readBrandExceptions (source) {
  const declared = []
  for (const match of source.matchAll(LEDGER_LINE)) {
    const [, path, line, reason, unlock] = match
    declared.push({ path, line: Number(line), reason: reason ?? '', unlock: unlock ?? '' })
  }
  return declared
}

/**
 * 剥注释（与上色门禁同思路：注释是给人看出处用的，不算违规）。
 * @param source - 源码文本。
 * @returns 只剩代码的行数组，行号与原文件一致。
 */
export function stripComments (source) {
  let inBlock = false
  return source.split('\n').map((line) => {
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
 * 找代码里的旧品牌活标识符。
 * @param relative - 报告里显示的路径。
 * @param source - 文件内容。
 * @returns 违规清单（带行号与命中片段）。
 */
export function findBrandHits (relative, source) {
  const problems = []
  stripComments(source).forEach((line, index) => {
    if (!BRAND.test(line)) return
    const snippet = line.trim().slice(0, 80)
    problems.push(`${relative}:${String(index + 1)} 代码里出现旧品牌 ⇒ ${snippet}`)
  })
  return problems
}

function* walk (dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield * walk(join(dir, entry.name))
      continue
    }
    if (!CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue
    yield join(dir, entry.name)
  }
}

/**
 * 命中集与申报账对一遍，三个方向都判。
 * @param hits - 扫出来的违规（`path:line 片段`）。
 * @param declared - `readBrandExceptions` 的申报清单。
 * @returns 红项清单与放行清单（放行要**点名**印出来，不许静默）。
 */
export function judgeBrandHits (hits, declared) {
  const key = (path, line) => `${path}:${line}`
  const hitKeys = new Set(hits.map((h) => h.key))
  const problems = []
  const allowed = []
  for (const hit of hits) {
    const entry = declared.find((d) => key(d.path, d.line) === hit.key)
    if (entry === undefined) problems.push(`${hit.key} 未点名的旧品牌 ⇒ ${hit.snippet}`)
    else allowed.push(`${hit.key} 已点名（${entry.reason}）${entry.unlock ? `｜解除条件：${entry.unlock}` : ''}`)
  }
  for (const d of declared) {
    if (!hitKeys.has(key(d.path, d.line))) {
      problems.push(`${d.path}:${String(d.line)} 账上点名的旧品牌**不在场** ⇒ 申报过期，删掉那行或把代码改回去`)
    }
  }
  return { problems, allowed }
}

function selfCheck () {
  const problems = []
  // ① 三类语言形状：TS import / Rust 字面串 / Cargo 的 crate 名，各自都必须被抓到。
  const caught = findBrandHits('a.ts', 'import { cn } from "@xiranite/ui"\n')
  const commentOnly = findBrandHits('b.ts', '/** 词表照抄 Xiranite 的 contract.ts */\nexport const x = 1\n')
  const stringHit = findBrandHits('c.ts', 'const prefix = "xiranite-node-"\n')
  const rustString = findBrandHits('d.rs', 'let root = std::env::temp_dir().join("xiranite-czkawka-exif");\n')
  const rustComment = findBrandHits('e.rs', '// 基线 Xiranite 的 czkawka-node 搬来\npub fn ok() {}\n')
  const cargoName = findBrandHits('f.toml', '[package]\nname = "xiranite-czkawka-node"\n')
  const shapes = [
    ['TS import 必须抓到', caught.length === 1],
    ['注释里的出处必须放过', commentOnly.length === 0],
    ['TS 字符串必须抓到', stringHit.length === 1],
    ['.rs 字面串必须抓到', rustString.length === 1],
    ['.rs 注释必须放过', rustComment.length === 0],
    ['Cargo.toml 的 crate 名必须抓到', cargoName.length === 1],
  ]
  for (const [name, ok] of shapes) if (!ok) problems.push(`形状判据红：${name}`)

  // ② 申报账三条路：在场放行（且点名）、不在场判过期、未点名的命中判违规。
  const hits = [{ key: 'plugins/x/native/core/src/lib.rs:12', snippet: 'let _ = f("xiranite", "xiranite");' }]
  const onLedger = judgeBrandHits(hits, [{ path: 'plugins/x/native/core/src/lib.rs', line: 12, reason: '落盘缓存目录名', unlock: '配迁移再改' }])
  if (!(onLedger.problems.length === 0 && onLedger.allowed.length === 1)) problems.push('申报在场应放行且点名，实读 ' + JSON.stringify(onLedger))
  const stale = judgeBrandHits(hits, [{ path: 'plugins/x/native/core/src/lib.rs', line: 99, reason: '已经不在了', unlock: '' }])
  if (stale.problems.length !== 2) problems.push(`账上一条不在场的申报必须红（过期）+ 那条命中未点名也红 ⇒ 期望 2，实读 ${String(stale.problems.length)}`)
  // ③ 空命中 + 空账不能冒充"量过了"：分母要由调用方打印（扫描条数在下面主流程印）。
  const nothing = judgeBrandHits([], [])
  if (nothing.problems.length !== 0) problems.push('空命中空账不该红')

  if (problems.length > 0) {
    for (const problem of problems) console.error(`  × ${problem}`)
    return 1
  }
  console.log('check-brand self-check OK（六种语言形状各按期望、申报在场放行且点名、过期申报会红）')
  return 0
}

if (process.argv.includes('--self-check')) process.exit(selfCheck())

const hits = []
let scanned = 0
for (const group of ['packages', 'plugins', 'scripts', 'native']) {
  const dir = join(ROOT, group)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
  for (const file of walk(dir)) {
    const relative = file.slice(ROOT.length)
    if (relative === SELF) continue
    scanned += 1
    for (const hit of findBrandHits(relative, readFileSync(file, 'utf8'))) {
      const line = Number(hit.slice(relative.length + 1).match(/^\d+/)?.[0] ?? '0')
      hits.push({ key: `${relative}:${String(line)}`, snippet: hit.slice(hit.indexOf('⇒') + 1).trim() })
    }
  }
}
// 仓根那份 Rust 编排清单也要扫：它是 workspace 成员表的真源，成员名写错品牌会一路漏进产物名。
const rootManifest = join(ROOT, 'Cargo.toml')
if (existsSync(rootManifest)) {
  scanned += 1
  for (const hit of findBrandHits('Cargo.toml', readFileSync(rootManifest, 'utf8'))) {
    const line = Number(hit.slice('Cargo.toml'.length + 1).match(/^\d+/)?.[0] ?? '0')
    hits.push({ key: `Cargo.toml:${String(line)}`, snippet: hit.slice(hit.indexOf('⇒') + 1).trim() })
  }
}

const ledgerPath = join(ROOT, LEDGER)
const declared = existsSync(ledgerPath) ? readBrandExceptions(readFileSync(ledgerPath, 'utf8')) : []
const { problems, allowed } = judgeBrandHits(hits, declared)

console.log(`check-brand 扫了 ${String(scanned)} 个代码文件（含 .rs/.toml），命中 ${String(hits.length)} 条、账上申报 ${String(declared.length)} 条`)
for (const line of allowed) console.log(`  放行（已点名）${line}`)
if (problems.length > 0) {
  console.error(`check-brand: ${String(problems.length)} 处旧品牌活标识符`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('  ⇒ 改名字；确实要保留的，去 docs/adr/0010-brand-is-xaihi.md 逐地点名（带 reason/unlock），不要在这一行加例外')
  process.exit(1)
}
console.log('check-brand OK（活标识符里没有旧品牌；文档与注释里的出处不计）')
