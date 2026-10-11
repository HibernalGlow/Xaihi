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
 * 平台：默认编本机那一份（Mac）。别的平台用 `--platform/--arch` 指名，落在**同机≠目标**时
 * 装载探针跑不了，就明写「compile-verified only」，不冒充“编出来就能用”。
 *
 * 用法：
 *   node scripts/build-kisaki-native.mjs                                  # 本机 triple
 *   node scripts/build-kisaki-native.mjs --platform win32 --arch x64      # 交叉指定
 *   node scripts/build-kisaki-native.mjs --check                          # 只①②③，不写 artifacts
 *   node scripts/build-kisaki-native.mjs --install                        # 翻在用的那条链接
 *   node scripts/build-kisaki-native.mjs --publish --dav1d <path>         # 落真货给 CI/发布用
 *   node scripts/build-kisaki-native.mjs --publish --no-dav1d             # dav1d 静态链进来的那份
 *
 * `--publish` 与 `--install` 互斥：前者把**真字节**写成 `xaihi-kisaki.<triple>.node`
 * （CI 不建符号链接——Windows 上建链接要特权，链出来的那份在别的机器上就是坏的），
 * 后者只翻本机在用的链接。发布完必须重记清单：`node scripts/gen-native-manifest.mjs`。
 *
 * @module xaihi-scripts/build-kisaki-native
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CRATE = 'xaihi_kisaki_node'

/** triple → cargo 的 --target；没在这张表里的组合一律响亮拒绝，不猜。 */
const TARGETS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
}
/** 各平台的 cdylib 落盘名与运行时依赖库名（dav1d 是唯一一条外部动态依赖）。 */
const LIBRARY_NAMES = {
  darwin: { produced: `lib${CRATE}.dylib`, runtime: 'libdav1d.7.dylib', runtimeDirs: ['/opt/homebrew/opt/dav1d/lib', '/usr/local/opt/dav1d/lib'] },
  win32: { produced: `${CRATE}.dll`, runtime: 'dav1d.dll', runtimeDirs: [] },
  linux: { produced: `lib${CRATE}.so`, runtime: 'libdav1d.so.7', runtimeDirs: ['/usr/lib/x86_64-linux-gnu', '/usr/lib64', '/usr/lib'] },
}

const argv = process.argv.slice(2)
const install = argv.includes('--install')
const publish = argv.includes('--publish')
const checkOnly = argv.includes('--check')
const flagValue = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
if (install && publish) {
  console.error('× --install（翻本机在用的链接）与 --publish（落真货发布）互斥：一次只做一个决定')
  process.exit(1)
}
const platform = flagValue('--platform') ?? process.platform
const arch = flagValue('--arch') ?? process.arch
const triple = `${platform}-${arch}`
const rustTarget = TARGETS[triple]
if (rustTarget === undefined) {
  console.error(`× 不认识的 triple ${triple}；已知：${Object.keys(TARGETS).join(' / ')}`)
  process.exit(1)
}
const names = LIBRARY_NAMES[platform]
const dir = join(ROOT, 'native', 'artifacts', triple)
const hostTriple = `${process.platform}-${process.arch}`
const isHost = triple === hostTriple

/**
 * 同机编别的 triple 时装载探针必失败，所以只有 triple===host 才跑③。
 * 交叉腿一律打「compile-verified only」，与仓里那条证据分级口径一致。
 */
const cargoTargetArgs = isHost ? [] : ['--target', rustTarget]
const releaseDir = isHost
  ? join(ROOT, 'target', 'release')
  : join(ROOT, 'target', rustTarget, 'release')

console.log(`① cargo build --release -p xaihi-kisaki-node（workspace 在 ${ROOT}）`)
console.log(`   triple=${triple} rust-target=${rustTarget}${isHost ? '（本机）' : '（交叉：装载探针跑不了）'}`)
const toolchain = pickToolchain(rustTarget)
console.log(`   用 ${toolchain.label}`)
const buildEnv = toolchain.rustc === undefined ? process.env : { ...process.env, RUSTC: toolchain.rustc }
let buildOutput = ''
const started = Date.now()
try {
  buildOutput = execFileSync(toolchain.cargo, ['build', '--release', '-p', 'xaihi-kisaki-node', ...cargoTargetArgs], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: buildEnv })
} catch (error) {
  console.error(`× cargo 构建失败 rc=${String(error.status ?? '?')}`)
  console.error(String(error.stdout ?? '').slice(-4000))
  console.error(String(error.stderr ?? '').slice(-2000))
  process.exit(1)
}
const seconds = Math.round((Date.now() - started) / 100) / 10
console.log(`   rc=0 用了 ${String(seconds)} s（基线那发实测 309 s）`)

const candidates = [names.produced, `${CRATE}.node`]
if (!existsSync(releaseDir)) {
  console.error(`× 没有构建输出目录 ${releaseDir.slice(ROOT.length + 1)}（cargo 说成功，落点却不对）`)
  process.exit(1)
}
const produced = candidates.map((name) => join(releaseDir, name)).find(existsSync)
if (produced === undefined) {
  console.error(`× 没找到 cdylib 产物，在 ${releaseDir.slice(ROOT.length + 1)} 里找过：${candidates.join(', ')}`)
  console.error(`   该目录里的文件：${readdirSync(releaseDir).filter((n) => !statSync(join(releaseDir, n)).isDirectory()).slice(0, 12).join(' ')}`)
  process.exit(1)
}
if (isHost && !matchesHostArch(produced)) {
  console.error(`× 产物架构与本机不符：${produced.slice(ROOT.length + 1)}`)
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
  writeFileSync(join(stagedDir, 'BUILD-INFO.json'), `${JSON.stringify({ schema: 'xaihi.native-build/1', triple, rustTarget, sha256: sha, bytes: bytes.length, source: produced.slice(ROOT.length + 1), seconds, cargo: safeVersion([...toolchain.cargo, '--version']), rustc: safeVersion([toolchain.rustc ?? 'rustc', '--version']), toolchain: toolchain.label, crateVersion: readCrateVersion(join(ROOT, 'plugins', 'kisaki', 'native', 'core', 'Cargo.toml')) }, null, 2)}\n`)
  console.log(`   暂存到 ${staged.slice(ROOT.length + 1)}（不覆盖在用的那份；要换请加 --install，要发布请加 --publish）`)
}

function probe (path) {
  const require = createRequire(import.meta.url)
  const binding = require(path)
  const info = binding.getCzkawkaInfo()
  return { apiVersion: info.apiVersion, sourceVersion: info.sourceVersion, capabilities: [...(info.capabilities ?? [])], exports: Object.keys(binding).length }
}
console.log('③ dlopen 探针')
if (!isHost) {
  console.log(`   × 跳过：${triple} 不是本机 ${hostTriple}，装载不了 ⇒ 这一腿的证据等级是 compile-verified only`)
} else {
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
}

if (install && isHost) {
  const linkPath = join(dir, `xaihi-kisaki.${triple}.node`)
  renameSync(linkPath, `${linkPath}.bak-${sha.slice(0, 8)}`)
  writeFileSync(linkPath, `builds/${sha.slice(0, 12)}/xaihi-kisaki.${triple}.node\n`)
  console.log(`④ --install：${linkPath.slice(ROOT.length + 1)} 已翻指新货（旧链接备份为 ${`xaihi-kisaki.${triple}.node.bak-${sha.slice(0, 8)}`}）`)
} else if (publish && !checkOnly) {
  // 真字节落在 triple 目录里：CI 的上传腿与 desktop/standalone/native-resources.mjs 都按这份名找。
  const bindingPath = join(dir, `xaihi-kisaki.${triple}.node`)
  // 编出来 rc=0 不代表装得上：交叉时 pkg-config 会把**宿主架构**的 dav1d 递给链接器，它认出来不对就悄悄跳过，
  // 于是一份引用 8 个 dav1d 符号、otool -L 里却没有 dav1d 的坏货照样产出（实测 2026-10-11 的 darwin-x64，rc=0）。
  // 判据是 nm -u 的计数与装载项对账；读不回的一律当"未知"，不拿"读不到"当"没有"。
  const refs = undefinedDav1dSymbols(produced)
  const loaded = loadedRuntime(produced)
  const noRuntime = argv.includes('--no-dav1d')
  // 先全部校验再落盘：半套资源被当成可发布产物，比不落盘更难查（native-resources.mjs 同一条纪律）。
  if (noRuntime) {
    if (loaded !== undefined || (refs !== null && refs > 0)) {
      console.error(`× 加了 --no-dav1d 但这份要 dav1d（未定义符号 ${String(refs ?? '?')} 个，装载项 ${String(loaded ?? '没有')}）：没有库它装不上`)
      process.exit(1)
    }
  } else if (platform === 'darwin' && refs !== null && refs > 0 && loaded === undefined) {
    console.error(`× 这份引用 ${String(refs)} 个 dav1d 符号，却没有链上任何 dav1d 库（otool -L 里没有）：这是坏货。`)
    console.error('   交叉腿要把 pkg-config 的搜索目录**换成**目标那份（PKG_CONFIG_LIBDIR）；')
    console.error('   实测 PKG_CONFIG_PATH 对构建脚本没用（system-deps 仍拿宿主 brew 的那份），LIBDIR 才把 link-search 改成目标前缀。')
    process.exit(1)
  }
  const runtime = noRuntime ? undefined : resolveRuntimeLib()
  mkdirSync(dir, { recursive: true })
  // 那名字在仓里是条兼容符号链接（真货叫 xiranite-czkawka.*）：照原样写会**穿过链接**覆盖预编那份货
  // （实测 copyFileSync 写穿符号链接、改的是链接指向的那份），而换掉在用的货是 --install 的显式决定
  // ⇒ 先把链接本身挪开备份，再落真字节。
  if (lstatSync(bindingPath, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
    renameSync(bindingPath, `${bindingPath}.link-${sha.slice(0, 8)}`)
    console.log(`   注：原先是条符号链接，已备份为 ${basename(`${bindingPath}.link-${sha.slice(0, 8)}`)}（真货没动）`)
  }
  copyFileSync(produced, bindingPath)
  if (noRuntime) {
    console.log(`④ --publish：${bindingPath.slice(ROOT.length + 1)}（真字节 ${bytes.length}）；--no-dav1d：这份没有动态依赖`)
    if (refs === null && loaded === undefined) {
      // Windows 上 nm/dumpbin 常常都不在，这两个读数取不到；那句话就只是照抄调用方的声明，不是证据。
      console.log('   注：这台机读不回装载项（nm/dumpbin 都没有）——「没有动态依赖」是 --no-dav1d 的声明，不是实测。')
    }
  } else {
    const runtimeDest = join(dir, basename(runtime))
    // realpathSync 不认 throwIfNoEntry（那是 lstatSync 的选项），文件不在位时它会直接 ENOENT 抛出来
    // ——夹具实测踩过；CI 上目录本来就是空的，所以这条必须先 existsSync。
    if (!(existsSync(runtimeDest) && realpathSync(runtime) === realpathSync(runtimeDest))) copyFileSync(runtime, runtimeDest)
    if (platform === 'darwin') relocateDarwinRuntime(bindingPath, loaded)
    console.log(`④ --publish：${bindingPath.slice(ROOT.length + 1)}（真字节 ${bytes.length}）+ ${basename(runtime)}`)
  }
  console.log('   清单要重记：node scripts/gen-native-manifest.mjs && node scripts/check-native-manifest.mjs')
} else {
  console.log('④ 没加 --install/--publish：在用的那份货与那条符号链接都没动')
}
console.log(`   构建日志尾（截断）：${buildOutput.split('\n').filter((l) => l.includes('warning') || l.includes('Finished')).slice(-3).join(' ⏎ ').slice(0, 300)}`)

/**
 * 选一份真能编 targetName 的 cargo。实测 2026-10-11（同一台 Mac，同一个仓根 workspace）：
 * · PATH 上的 cargo 是 Homebrew 那份，sysroot 里只有 aarch64-apple-darwin 的 std ⇒ 加 `--target` 就
 *   `E0463 can't find crate for 'core'`，rc=101；
 * · 只换成 rustup toolchain 的 cargo **还不够**：它仍从 PATH 取 rustc（还是 brew 那份），照样 E0463
 *   （在 /tmp 的 scratch crate 上复现：命中 2 条）；
 * · 把 RUSTC 显式钉到**同一个 toolchain** 的 rustc 才过（编译推进到 dav1d-sys 的 build.rs）。
 * 所以这里成对返回 cargo 与 rustc；本机不交叉时保持原样，用 PATH 上的 cargo。
 */
function pickToolchain (targetName) {
  const sysroot = safeVersion(['rustc', '--print', 'sysroot'])
  if (sysroot !== 'unknown' && stdPresent(join(sysroot.trim(), 'lib', 'rustlib', targetName, 'lib'))) {
    return { cargo: 'cargo', rustc: undefined, label: 'PATH 上的 cargo' }
  }
  const dirs = rustupToolchainDirs()
  for (const d of dirs) {
    if (stdPresent(join(d, 'lib', 'rustlib', targetName, 'lib'))) {
      return { cargo: join(d, 'bin', 'cargo'), rustc: join(d, 'bin', 'rustc'), label: `${basename(d)} 的 cargo（RUSTC 钉同一 toolchain）` }
    }
  }
  console.error(`× 没有能编 ${targetName} 的 toolchain：先 rustup target add ${targetName}`)
  console.error(`   查过 ${String(dirs.length)} 个 rustup toolchain${dirs.length === 0 ? '（RUSTUP_HOME 下没有 toolchains 目录）' : `：${dirs.map((d) => basename(d)).join(' / ')}`}`)
  process.exit(1)
}

/** std 在不在要看 libstd-*.rlib：lib/rustlib/<target>/ 可以是空壳目录。 */
function stdPresent (libDir) {
  if (!existsSync(libDir)) return false
  try { return readdirSync(libDir).some((name) => name.startsWith('libstd-')) } catch { return false }
}

/** rustup 管的 toolchain 目录，active 那个排最前。 */
function rustupToolchainDirs () {
  const root = join(process.env.RUSTUP_HOME?.trim() || join(homedir(), '.rustup'), 'toolchains')
  if (!existsSync(root)) return []
  const dirs = readdirSync(root).map((name) => join(root, name)).filter((d) => statSync(d).isDirectory())
  const active = safeVersion(['rustup', 'show', 'active-toolchain']).split(/\s+/)[0]
  return dirs.sort((a, b) => (basename(a) === active ? -1 : 0) - (basename(b) === active ? -1 : 0) || a.localeCompare(b))
}

/** dav1d 那条动态依赖要跟 `.node` 同目录才装得上；找不到就拒绝，不半套发布。 */
function resolveRuntimeLib () {
  const explicit = flagValue('--dav1d')
  if (explicit !== undefined) {
    if (!existsSync(resolve(ROOT, explicit))) {
      console.error(`× --dav1d 指的文件不存在：${explicit}`)
      process.exit(1)
    }
    return resolve(ROOT, explicit)
  }
  // 要哪个 soname 从**刚编出来的那份**读，不靠表：Ubuntu 给的是 libdav1d.so.6，本机 brew 是 libdav1d.7.dylib，
  // 照固定名找会把发布腿卡在一个它本来不该找的库上（或装错一份没人发现）。
  const wanted = linkedRuntimeName(produced) ?? names.runtime
  const searched = [join(dir, wanted), ...names.runtimeDirs.map((d) => join(d, wanted))]
  const found = searched.find(existsSync)
  if (found === undefined) {
    console.error(`× 找不到 ${wanted}（这份产物声明要它，${platform} 的运行时依赖）：装 dav1d 或用 --dav1d <path> 指名`)
    console.error(`   找过：${searched.join(' / ')}`)
    process.exit(1)
  }
  if (platform === 'darwin' && !hasArch(found, arch)) {
    console.error(`× ${found.slice(ROOT.length + 1)} 里没有 ${arch} 架构：拿它发布会装不上，交叉腿要另一份 dav1d`)
    process.exit(1)
  }
  return found
}

/**
 * 读产物链接的动态库名：macOS 问 otool -L，Linux 问 objdump -p 的 NEEDED。
 * Windows 上 dumpbin 只在 VS Developer Prompt 里能跑，读不出来就退回表名（那条腿该显式给 --dav1d 或 --no-dav1d）。
 */
function linkedRuntimeName (file) {
  if (platform === 'darwin') {
    const out = safeVersion(['otool', '-L', file])
    if (out === 'unknown') return undefined
    const line = out.split('\n').find((l) => l.includes('dav1d'))
    return line === undefined ? undefined : basename(line.trim().split(/\s+/)[0])
  }
  if (platform === 'linux') {
    const out = safeVersion(['objdump', '-p', file])
    if (out === 'unknown') return undefined
    const line = out.split('\n').map((l) => l.match(/NEEDED\s+(\S*dav1d\S*)/)).find(Boolean)
    return line?.[1]
  }
  return undefined
}

function matchesHostArch (file) {
  if (platform !== 'darwin') return true
  return hasArch(file, arch)
}

/** 未定义的 dav1d 符号数（= 这份要不要外部库）。nm 读不到回 null，不拿"读不到"当"没有"。 */
function undefinedDav1dSymbols (file) {
  const out = safeVersion(['nm', '-u', file])
  if (out === 'unknown') return null
  return out.split('\n').filter((line) => line.includes('dav1d')).length
}

/** 产物记的那条 dav1d 装载项：mac 问 otool -L，Linux 问 objdump -p 的 NEEDED；读不到回 undefined。 */
function loadedRuntime (file) {
  if (platform === 'darwin') {
    const out = safeVersion(['otool', '-L', file])
    if (out === 'unknown') return undefined
    return out.split('\n').slice(1).map((line) => line.trim().split(/\s+/)[0]).find((line) => line.includes('dav1d'))
  }
  if (platform === 'linux') {
    const out = safeVersion(['objdump', '-p', file])
    if (out === 'unknown') return undefined
    return out.split('\n').map((line) => line.match(/NEEDED\s+(\S*dav1d\S*)/)).find(Boolean)?.[1]
  }
  return undefined
}

/**
 * mac 那份要在**别的机器**上也装得上：链接器记的可能是构建机的绝对路径
 * （实测我们自己那份 arm64 记 `/opt/homebrew/Cellar/dav1d/1.5.4/lib/libdav1d.7.dylib`，
 * 而仓里那份预编货记 `@rpath/libdav1d.7.dylib` + `LC_RPATH @loader_path`）——
 * 绝对路径那份离开这台机就装载失败，而 `stageNativeResources` 是把库**同目录**放过去的，
 * 所以这里改成 @rpath 并补一条 @loader_path。动过 Mach-O 就废了原签名，
 * Apple Silicon 装载要求签名有效 ⇒ 重新 ad-hoc 签。
 */
function relocateDarwinRuntime (file, loaded) {
  if (loaded === undefined) return
  if (loaded.startsWith('@rpath/')) {
    if (!hasLoaderRpath(file)) {
      runTool('install_name_tool', ['-add_rpath', '@loader_path', file])
      runTool('codesign', ['--force', '--sign', '-', file])
    }
    console.log('   dav1d 装载项已是 @rpath')
    return
  }
  const name = basename(loaded)
  console.log(`   改写装载项：${loaded} → @rpath/${name}`)
  runTool('install_name_tool', ['-change', loaded, `@rpath/${name}`, file])
  if (!hasLoaderRpath(file)) runTool('install_name_tool', ['-add_rpath', '@loader_path', file])
  runTool('codesign', ['--force', '--sign', '-', file])
  const after = loadedRuntime(file)
  if (after !== `@rpath/${name}`) {
    console.error(`× 改写后读回不是 @rpath/${name}：${String(after)}（这条不放过，半改的货比不改更坏）`)
    process.exit(1)
  }
}

function hasLoaderRpath (file) {
  const out = safeVersion(['otool', '-l', file])
  return out !== 'unknown' && /path @loader_path \(offset/.test(out)
}

function runTool (cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' })
  } catch (error) {
    console.error(`× ${cmd} 失败 rc=${String(error.status ?? '?')}：${String(error.stderr ?? error.message).slice(0, 400)}`)
    process.exit(1)
  }
}

function hasArch (file, wantArch) {
  const info = safeVersion(['lipo', '-archs', file])
  if (info === 'unknown') return true // 没有 lipo（非 mac 腿）就别拦
  return info.split(/\s+/).includes(wantArch)
}

/** Cargo.toml 是 TOML 不是 JSON：只取 [package] 里那一行 version。 */
function readCrateVersion (path) {
  const m = readFileSync(path, 'utf8').match(/^version\s*=\s*"([^"]+)"/m)
  return m?.[1] ?? 'unknown'
}

function safeVersion (cmd) {
  try { return execFileSync(cmd[0], cmd.slice(1), { encoding: 'utf8' }).trim() } catch { return 'unknown' }
}
