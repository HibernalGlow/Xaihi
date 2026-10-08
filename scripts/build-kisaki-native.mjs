#!/usr/bin/env node
/**
 * Kisaki 原生引擎的重编入口（ADR-0015 决定 4：不许是 bun，本仓等价物就是 cargo + node）。
 *
 * 它做四件事，且**默认不动宿主正在装载的那份货**：
 * ① `cargo build --release -p xaihi-kisaki-node`（仓根 workspace，见 Cargo.toml）；
 * ② 把 cdylib 产物按平台命名暂存到 `native/artifacts/<triple>/builds/<sha12>/`；
 * ③ dlopen 探针：现读 apiVersion/sourceVersion/capabilities，并与仓里那份预编货的读数**逐条比**
 *    —— 只在两边都有读数的情况下才叫“编出来的这份能用”；
 * ④ 把两份读数与 sha 印出来，供清单与阶段报告记账。
 * `--install` 才会把 `xaihi-kisaki.<triple>.node` 那条**符号链接**翻指向新货（可逆：旧 target 不删）。
 *
 * 为什么暂存而不直接覆盖：`native-asset.ts` 的候选名里 `xaihi-kisaki.*.node` 排在旧名之前，
 * 就地覆盖等于替使用者换掉运行时正在吃的那一发二进制；那是一次显式决定，不是构建的副作用。
 *
 * 用法：node scripts/build-kisaki-native.mjs [--install] [--check]
 *   --check 只跑①②③不写 artifacts，也不翻链接（默认就是不写）。
 *
 * @module xaihi-scripts/build-kisaki-native
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const install = argv.includes('--install')
const checkOnly = argv.includes('--check')

const triple = `${process.platform}-${process.arch}`
const dir = join(ROOT, 'native', 'artifacts', triple)

console.log(`① cargo build --release -p xaihi-kisaki-node（workspace 在 ${ROOT}）`)
const started = Date.now()
let buildOutput = ''
try {
  buildOutput = execFileSync('cargo', ['build', '--release', '-p', 'xaihi-kisaki-node'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (error) {
  console.error(`× cargo 构建失败 rc=${String(error.status ?? '?')}`)
  console.error(String(error.stdout ?? '').slice(-4000))
  console.error(String(error.stderr ?? '').slice(-2000))
  process.exit(1)
}
const seconds = Math.round((Date.now() - started) / 100) / 10
console.log(`   rc=0 用了 ${String(seconds)} s（基线那发实测 309 s）`)

const candidates = [`lib${'xaihi_kisaki_node'}.dylib`, 'xaihi_kisaki_node.dll', `${'xaihi_kisaki_node'}.node`]
const produced = candidates.map((name) => join(ROOT, 'target', 'release', name)).find(existsSync)
if (produced === undefined) {
  console.error(`× 没找到 cdylib 产物，找过：${candidates.join(', ')}`)
  console.error(`   target/release 里现读：${readdirSync(join(ROOT, 'target', 'release')).filter((n) => !statSync(join(ROOT, 'target', 'release', n)).isDirectory()).slice(0, 12).join(' ')}`)
  process.exit(1)
}
const bytes = readFileSync(produced)
const sha = createHash('sha256').update(bytes).digest('hex')
const stagedDir = join(dir, 'builds', sha.slice(0, 12))
const staged = join(stagedDir, `xaihi-kisaki.${triple}.node`)
console.log(`② 产物 ${produced.slice(ROOT.length + 1)} → ${bytes.length} 字节 sha256 ${sha.slice(0, 16)}…`)
if (!checkOnly) {
  rmSync(stagedDir, { recursive: true, force: true })
  mkdirSync(stagedDir, { recursive: true })
  copyFileSync(produced, staged)
  writeFileSync(join(stagedDir, 'BUILD-INFO.json'), `${JSON.stringify({ schema: 'xaihi.native-build/1', triple, sha256: sha, bytes: bytes.length, source: produced.slice(ROOT.length + 1), seconds, cargo: safeVersion('cargo'), rustc: safeVersion('rustc'), crateVersion: readCrateVersion(join(ROOT, 'plugins', 'kisaki', 'native', 'core', 'Cargo.toml')) }, null, 2)}\n`)
  console.log(`   暂存到 ${staged.slice(ROOT.length + 1)}（不覆盖在用的那份；要换请加 --install）`)
}

function probe (path) {
  const require = createRequire(import.meta.url)
  const binding = require(path)
  const info = binding.getCzkawkaInfo()
  return { apiVersion: info.apiVersion, sourceVersion: info.sourceVersion, capabilities: [...(info.capabilities ?? [])], exports: Object.keys(binding).length }
}
console.log('③ dlopen 探针')
let mine = null
let vendored = null
try { mine = probe(staged) } catch (error) { console.error(`   × 新这份装载失败：${String(error.message).slice(0, 200)}`) }
const vendoredPath = join(dir, `xiranite-czkawka.${triple}.node`)
try { vendored = existsSync(vendoredPath) ? probe(vendoredPath) : null } catch (error) { console.error(`   × 预编那份读不出：${String(error.message).slice(0, 160)}`) }
for (const [label, r] of [['新编', mine], ['仓里预编', vendored]]) {
  if (r === null) { console.log(`   ${label}：没读到`); continue }
  console.log(`   ${label}：api=${String(r.apiVersion)} source=${String(r.sourceVersion)} exports=${String(r.exports)} capabilities=${String(r.capabilities.length)} 条`)
}
if (mine !== null && vendored !== null) {
  const missing = vendored.capabilities.filter((c) => !mine.capabilities.includes(c))
  const extra = mine.capabilities.filter((c) => !vendored.capabilities.includes(c))
  console.log(`   与预编那份比：缺 ${String(missing.length)} 条${missing.length ? `（${missing.join(',')}）` : ''}／多 ${String(extra.length)} 条${extra.length ? `（${extra.join(',')}）` : ''}`)
  if (missing.length > 0) { console.error('× 能力集缩水：这份不能顶替在用的货'); process.exit(1) }
}
if (install && mine !== null) {
  const linkPath = join(dir, `xaihi-kisaki.${triple}.node`)
  renameSync(linkPath, `${linkPath}.bak-${sha.slice(0, 8)}`)
  writeFileSync(linkPath, `builds/${sha.slice(0, 12)}/xaihi-kisaki.${triple}.node\n`)
  console.log(`④ --install：${linkPath.slice(ROOT.length + 1)} 已翻指新货（旧链接备份为 ${`xaihi-kisaki.${triple}.node.bak-${sha.slice(0, 8)}`}）`)
} else {
  console.log('④ 没加 --install：在用的那份货与那条符号链接都没动')
}
console.log(`   构建日志尾（截断）：${buildOutput.split('\n').filter((l) => l.includes('warning') || l.includes('Finished')).slice(-3).join(' ⏎ ').slice(0, 300)}`)

/** Cargo.toml 是 TOML 不是 JSON：只取 [package] 里那一行 version。 */
function readCrateVersion (path) {
  const m = readFileSync(path, 'utf8').match(/^version\s*=\s*"([^"]+)"/m)
  return m?.[1] ?? 'unknown'
}

function safeVersion (cmd) {
  try { return execFileSync(cmd, ['--version'], { encoding: 'utf8' }).trim() } catch { return 'unknown' }
}
