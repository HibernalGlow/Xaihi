#!/usr/bin/env node
/**
 * 原生产物的 sha256 清单校验（ADR-0015 决定 3 要求平台包带「`.node` + 装载入口 + sha256 清单」，
 * 这条把后半句补上：仓里那两份预编 `.node` 之前**没有任何清单**，`scripts/check-vendored.mjs`
 * 也不看 kisaki（现读：那文件里零处提 `czkawka|kisaki|artifacts`）。
 *
 * 判据三条，缺一条这尺就是装饰品：
 * ① 清单里每一条都得在盘上、字节数与 sha256 都对得上（记错或货被换 ⇒ 红）；
 * ② 盘上 `native/artifacts/**` 里出现清单没写的文件 ⇒ 红（多出来的一份没人记账）；
 * ③ 符号链接按 `link → target` 记，不比哈希，但 target 必须在场且被单独列进清单
 *    （那份 21 MB 的真货因此不会躲过对账）。
 *
 * 用法：
 *   node scripts/check-native-manifest.mjs
 *   node scripts/check-native-manifest.mjs --self-check     # 三条对照，全在 /tmp 合成夹具上跑
 *   node scripts/check-native-manifest.mjs --manifest <p> --dir <d>   # 夹具用
 *
 * @module xaihi-scripts/check-native-manifest
 */

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const flags = parseArgsLite(process.argv.slice(2))

function parseArgsLite (argv) {
  const values = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--self-check') values['self-check'] = true
    else if (argv[i] === '--manifest') values.manifest = argv[++i]
    else if (argv[i] === '--dir') values.dir = argv[++i]
  }
  return values
}

const SKIP_NAMES = new Set(['.DS_Store'])

/**
 * 产物目录里的文件。
 * `.DS_Store` 那类系统垃圾**不记账**：判据②是“盘上多一份没记账就红”，
 * 而 Finder 路过一次就会造一条红——那条红不是漂移，是噪声。
 */
export function* walkFiles (dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'builds') continue // 重编的暂存产物另有账（见 build-kisaki-native.mjs）
      yield * walkFiles(path)
    } else yield path
  }
}

/** 一个盘上文件的身份：字节数、sha256，或符号链接指向谁。 */
/** 读数进文案一律截断：那条 21 MB 的货整串打印过一次，输出冲到 272 MB。 */
function short (value) { const text = String(value); return text.length > 60 ? `${text.slice(0, 60)}…` : text }

export function describe (path) {
  const stat = lstatSync(path) // statSync 不认 followSymlinks：那份选项只有 readdir 的 Dirent 与 lstat 才不跟随
  if (stat.isSymbolicLink()) { const target = readlinkSync(path); return { kind: 'link', size: Buffer.byteLength(target), bytes: Buffer.byteLength(target), sha256: null, link: target } }
  const buffer = readFileSync(path)
  return { kind: 'file', size: buffer.length, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), link: null }
}

/**
 * 对账。
 * @param manifest - 清单对象（`entries: [{path, kind, size, sha256, link?}]`）。
 * @param dir - 被对账的目录。
 * @returns 每条判据一行。
 */
export function judge (manifest, dir) {
  const problems = []
  const listed = new Set()
  for (const entry of manifest.entries ?? []) {
    listed.add(entry.path)
    const path = join(dir, entry.path)
    if (!existsSync(path)) {
      problems.push(`${entry.path} 清单记了但盘上没有`)
      continue
    }
    const actual = describe(path)
    if (entry.kind === 'link') {
      if (actual.kind !== 'link') problems.push(`${entry.path} 清单记的是符号链接，盘上却是 ${actual.kind}`)
      else if (actual.link !== entry.link) problems.push(`${entry.path} 链接指向变了：记 ${short(entry.link)}／实读 ${short(actual.link)}`)
      else if (!existsSync(join(dirname(path), actual.link))) problems.push(`${entry.path} 指向的 ${short(actual.link)} 不在场`)
    } else {
      if (actual.kind !== 'file') problems.push(`${entry.path} 清单记的是文件，盘上是符号链接`)
      else {
        if (actual.size !== entry.size) problems.push(`${entry.path} 字节数对不上：记 ${String(entry.size)}／实读 ${String(actual.size)}`)
        if (actual.sha256 !== entry.sha256) problems.push(`${entry.path} sha256 对不上：记 ${String(entry.sha256).slice(0, 12)}…／实读 ${actual.sha256.slice(0, 12)}…`)
      }
    }
  }
  for (const path of walkFiles(dir)) {
    const rel = relative(dir, path)
    if (rel === 'manifest.json') continue
    if (!listed.has(rel)) problems.push(`${rel} 在盘上但清单没记 ⇒ 多出来的一份没人记账`)
  }
  return problems
}

/** 合成夹具：三个小文件 + 一条链接，够把三条判据各破一次。 */
function fixture () {
  const dir = join('/tmp', `xaihi-manifest-fixture-${String(process.pid)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'darwin-arm64'), { recursive: true })
  writeFileSync(join(dir, 'darwin-arm64/engine.node'), 'AAAA\n')
  writeFileSync(join(dir, 'darwin-arm64/codec.dylib'), 'BBBBB\n')
  symlinkSync('engine.node', join(dir, 'darwin-arm64/xaihi-fake.darwin-arm64.node'))
  return dir
}

function buildManifest (dir) {
  const entries = []
  for (const path of walkFiles(dir)) {
    if (relative(dir, path) === 'manifest.json') continue
    const d = describe(path)
    entries.push({ path: relative(dir, path), kind: d.kind, size: d.bytes, sha256: d.sha256, ...(d.link ? { link: d.link } : {}) })
  }
  return { schema: 'xaihi.native-manifest/1', entries }
}

function selfCheck () {
  const dir = fixture()
  const base = buildManifest(dir)
  const problems = []
  if (judge(base, dir).length !== 0) problems.push(`好夹具本该 0 条，实读 ${String(judge(base, dir).length)} 条 ⇒ 尺看错了合规输入`)
  // ① 货被换：动一个字节，必须红在 sha256
  writeFileSync(join(dir, 'darwin-arm64/engine.node'), 'AAAB\n')
  const tampered = judge(base, dir)
  if (tampered.length !== 1 || !tampered[0].includes('sha256')) problems.push(`改一字节必须红在 sha256，实读 ${JSON.stringify(tampered)}`)
  writeFileSync(join(dir, 'darwin-arm64/engine.node'), 'AAAA\n')
  // ② 记错尺寸（同内容、假账）也必须红
  const wrongSize = { ...base, entries: base.entries.map((e) => (e.path.endsWith('engine.node') ? { ...e, size: e.size + 1 } : e)) }
  const sizeRed = judge(wrongSize, dir)
  if (sizeRed.length !== 1 || !sizeRed[0].includes('字节数')) problems.push(`尺寸记错必须红，实读 ${JSON.stringify(sizeRed)}`)
  // ③ 盘上多一份没记账的文件 ⇒ 必须点名它
  writeFileSync(join(dir, 'darwin-arm64/stray.bin'), 'X\n')
  const stray = judge(base, dir)
  if (stray.length !== 1 || !stray[0].includes('stray.bin')) problems.push(`多出来的文件必须被点名，实读 ${JSON.stringify(stray)}`)
  rmSync(join(dir, 'darwin-arm64/stray.bin'), { force: true })
  // ④ 清单记了但货没了 ⇒ 红（不许当成"没这条"）
  const missing = { ...base, entries: [...base.entries, { path: 'darwin-arm64/absent.node', kind: 'file', size: 1, sha256: 'z'.repeat(64) }] }
  const missRed = judge(missing, dir)
  if (missRed.length !== 1 || !missRed[0].includes('盘上没有')) problems.push(`记了却没有货必须红，实读 ${JSON.stringify(missRed)}`)
  // ⑤ 链接被换成实体文件 ⇒ 红（真货不许躲过对账）
  rmSync(join(dir, 'darwin-arm64/xaihi-fake.darwin-arm64.node'))
  writeFileSync(join(dir, 'darwin-arm64/xaihi-fake.darwin-arm64.node'), 'not-a-link\n')
  const linkRed = judge(base, dir)
  if (linkRed.length !== 1 || !linkRed[0].includes('符号链接')) problems.push(`链接变实体必须红，实读 ${JSON.stringify(linkRed)}`)
  rmSync(dir, { recursive: true, force: true })

  if (problems.length > 0) {
    for (const problem of problems) console.error(`  × ${problem}`)
    return 1
  }
  console.log('check-native-manifest --self-check OK（换货／记错尺寸／多文件／缺货／链接变实体 五种扰动都各红一条）')
  return 0
}

function main () {
if (flags['self-check']) process.exit(selfCheck())

const dir = resolve(flags.dir ?? join(ROOT, 'native', 'artifacts'))
const manifestPath = resolve(flags.manifest ?? join(dir, 'manifest.json'))
if (!existsSync(manifestPath)) {
  console.error(`× 没有清单：${manifestPath} ⇒ 先跑 node scripts/gen-native-manifest.mjs（或 --self-check 只看尺）`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const found = judge(manifest, dir)
console.log(`check-native-manifest 对了 ${String((manifest.entries ?? []).length)} 条（目录 ${dir}）`)
for (const problem of found) console.error(`  × ${problem}`)
if (found.length > 0) process.exit(1)
console.log('OK：盘上产物与清单逐条一致，没有未记账的文件')

}
if (process.argv[1] === fileURLToPath(import.meta.url)) main()
