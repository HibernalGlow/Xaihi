#!/usr/bin/env node
/**
 * 全局安装节点终端面的 dev 工具：把插件 CLI/TUI 以"冻结快照"装进 pnpm 全局。
 *
 * 方案：使用 `pnpm add -g` 走全局 CAS 硬链接 Store 去重。
 * - 本地临时启动一个单机轻量级匿名 registry（verdaccio），将 monorepo 内的运行时底座
 *   （cli-runtime / api / contract / shared）与选中的节点包临时发布；
 * - 每次临时发布附带唯一的快照构建标签（snap.<timestamp>），彻底杜绝全局 Store 的旧版本哈希冲突；
 * - 若插件产物引用了 @hibernalglow/xaihi-cli-runtime，在临时打包清单中动态补齐依赖，
 *   既保证源码不带 workspace:* 使得 check:installable 门禁全绿，又保证全局独立运行时依赖完整；
 * - 执行 `pnpm add -g --shamefully-hoist --registry ... <pkgs>` 进行全局安装；
 * - 优势：
 *   1. 彻底硬链接 Store 去重：所有公共依赖（React、OpenTUI 等）由 pnpm CAS 机制统一复用，
 *      全量 25 个插件仅占约 150MB~200MB，彻底告别 npm 全局解包的 4GB 膨胀；
 *   2. 物理快照隔离：安装产物来自本地发布 registry，内部没有任何指向当前仓库源码的软链接，
 *      本地不管怎么修改开发，全局命令始终为独立稳定的快照版本；
 *   3. 进程退出后临时 registry 与存储目录自动销毁，零系统污染。
 *
 * 用法：
 *   pnpm global:install [id ...]      # 缺省 = 所有带 bin 的插件
 *   PNPM_HOME=... pnpm global:install [id ...] # 指定全局 bin 目录
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import http from 'node:http'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const RUNTIME_PKGS = ['shared', 'contract', 'api', 'cli-runtime']
const SCOPE = '@hibernalglow'
const LOCAL_REG_PORT = 4873
const LOCAL_REG_URL = `http://127.0.0.1:${LOCAL_REG_PORT}`
const SNAPSHOT_TAG = `snap.${Date.now()}`

function run (cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts })
  if (r.status !== 0) {
    process.stderr.write(`${r.stderr || r.stdout || ''}\n`)
    throw new Error(`${cmd} ${args.join(' ')} 失败（rc=${r.status}）`)
  }
  return r.stdout
}

function collectPlugins () {
  const out = []
  for (const dir of readdirSync(join(repoRoot, 'plugins'))) {
    const manifest = join(repoRoot, 'plugins', dir, 'package.json')
    if (!existsSync(manifest)) continue
    const m = JSON.parse(readFileSync(manifest, 'utf8'))
    if (m.bin && Object.keys(m.bin).length > 0) out.push({ id: dir, name: m.name, bin: Object.keys(m.bin)[0] })
  }
  return out
}

function assertBuilt (plugins) {
  const missing = []
  for (const dir of ['packages/cli-runtime/dist', ...plugins.map((p) => `plugins/${p.id}/lib`)]) {
    if (!existsSync(join(repoRoot, dir))) missing.push(dir)
  }
  if (missing.length > 0) {
    process.stderr.write(`以下产物还没构建：\n  ${missing.join('\n  ')}\n先跑 pnpm build（或对应包的 pnpm --filter … build）再装。\n`)
    process.exit(1)
  }
}

function waitRegistryReady (maxWaitMs = 15000) {
  return new Promise((resolvePromise, reject) => {
    const start = Date.now()
    function poll () {
      http.get(`${LOCAL_REG_URL}/-/ping`, (res) => {
        if (res.statusCode === 200) resolvePromise(true)
        else retry()
      }).on('error', retry)
    }
    function retry () {
      if (Date.now() - start > maxWaitMs) {
        reject(new Error(`本地临时 Registry 启动超时（${maxWaitMs}ms）`))
      } else {
        setTimeout(poll, 200)
      }
    }
    poll()
  })
}

/** 软链审计：全局目录内任何软链都不许指到仓库目录（确保快照绝对物理隔离）。 */
function auditSymlinks (checkDir) {
  const bad = []
  if (!existsSync(checkDir)) return bad
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isSymbolicLink()) {
        try {
          const target = resolve(dir, readlinkSync(full))
          if (target.startsWith(repoRoot)) bad.push(`${full} -> ${target}`)
        } catch {}
      } else if (e.isDirectory() && e.name !== '.bin') {
        try { walk(full) } catch {}
      }
    }
  }
  walk(checkDir)
  return bad
}

/**
 * 扫插件产物 `lib/**` 里的**运行期外部信号**。
 *
 * 为什么要扫产品而不是读 `package.json`：终端面（CLI/TUI）这套依赖在插件包清单里
 * 是空着的（`@opentui/*` 与 `react` 按 ADR-0002 用 registry 版补），所以"这个包运行时
 * 到底还要谁"只能从产物里读回来。
 *
 * 两个信号都是**子串级**的，不是 import 语句级——今测两种拼法都出现过：
 * - `@hibernalglow/xaihi-cli-runtime`：没内联 cli-runtime 的那批（今测只有 sleept）。
 * - `@opentui/`：覆盖面大得多。有的插件内联了 `@opentui/react`，却仍要在运行时按平台
 *   动态 import 原生包 `@opentui/core-<platform>-<arch>`（classf 的 `index.node-*.js`
 *   里那个包名是**模板串拼出来的**，正则扫 import 语句扫不到）；cleanf 更直白，
 *   逐条 `import("react")` / `import("@opentui/core")` / `import("@opentui/react")`。
 * ⇒ **任一信号命中就给整套 TUI 运行期依赖**：少给一个，命令就是启动即崩
 *   （实测 `Cannot find package 'react'`、`'@opentui/core-darwin-arm64'`）。
 */
function scanLibSignals (libDir) {
  const out = { cliRuntime: false, opentui: false }
  if (!existsSync(libDir)) return out
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        walk(full)
      } else if (e.name.endsWith('.js')) {
        const src = readFileSync(full, 'utf8')
        if (src.includes('@hibernalglow/xaihi-cli-runtime')) out.cliRuntime = true
        if (src.includes('@opentui/')) out.opentui = true
      }
    }
  }
  walk(libDir)
  return out
}

/**
 * 给装出来的 `react-reconciler` 补 `exports` 映射。
 *
 * 上游 `react-reconciler` 的 tarball **没有 `exports` 字段**（0.33.0 与 0.34.0 都实测过），
 * 而 `@opentui/react` 的 ESM 产物里写着**无扩展名**的 `react-reconciler/constants`；
 * 裸 Node 的 ESM 解析器没有 `exports` 表就要求带扩展名，于是只要运行时**没内联**
 * `@opentui/react`（sleept 走 cli-runtime 那条就是这样，cleanf 同理）就会撞
 * `Cannot find module 'react-reconciler/constants'`。本仓 `node_modules` 里那份是
 * **手工补过的**（`package.json` 的 mtime 比同目录其它文件晚 5 分钟），且没记进任何
 * patch / pnpmfile —— 所以全局安装拿不到这笔账，这里按同样的映射补一遍（幂等）。
 */
const REACT_RECONCILER_EXPORTS = { '.': './index.js', './constants': './constants.js', './*': './*.js' }

function patchReactReconcilerExports (globalRoot) {
  if (!existsSync(globalRoot)) return 0
  /*
   * 布局：`pnpm root -g` 给的是 `<pnpmHome>/global/v11`，**不是** store 的 `node_modules`；
   * 真正的虚拟 store 在 `<pnpmHome>/global/v11/<hash>/node_modules/.pnpm/` 下，
   * 而且**每次安装都会新开一组 `<hash>` 目录**（实测一次安装铺出 19 个），所以要下钻一层全扫。
   * 补丁本身要先 unlink 再写：虚拟 store 里的文件是 pnpm CAS 的**硬链接**，
   * 直接 truncate 会顺带改掉内容寻址仓里那条共享 inode。
   */
  const candidates = []
  for (const top of readdirSync(globalRoot, { withFileTypes: true })) {
    if (top.isDirectory()) candidates.push(join(globalRoot, top.name, 'node_modules', '.pnpm'))
  }
  candidates.push(join(globalRoot, '.pnpm')) // 兜底：万一哪天布局变回平铺
  let patched = 0
  for (const pnpmDir of candidates) {
    if (!existsSync(pnpmDir)) continue
    for (const e of readdirSync(pnpmDir, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith('react-reconciler@')) continue
      const pkgPath = join(pnpmDir, e.name, 'node_modules', 'react-reconciler', 'package.json')
      if (!existsSync(pkgPath)) continue
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.exports) continue
      pkg.exports = REACT_RECONCILER_EXPORTS
      const next = JSON.stringify(pkg, null, 2) + '\n'
      rmSync(pkgPath, { force: true }) // 断硬链接，别动 CAS 里那条共享 inode
      writeFileSync(pkgPath, next, 'utf8')
      patched += 1
    }
  }
  return patched
}

const plugins = collectPlugins()
const argIds = process.argv.slice(2)
let selected = plugins
if (argIds.length > 0) {
  selected = argIds.map((id) => {
    const p = plugins.find((x) => x.id === id)
    if (!p) {
      process.stderr.write(`没有叫 ${id} 的插件（或它没有 bin）。可选：${plugins.map((x) => x.id).join(' ')}\n`)
      process.exit(1)
    }
    return p
  })
}
assertBuilt(selected)

// 解析 PNPM_HOME 路径：如果用户没显式给，且 ~/.local/bin 在 PATH 中，则默认指向 ~/.local
let pnpmHome = process.env.PNPM_HOME
if (!pnpmHome) {
  const pathEnv = process.env.PATH || ''
  const localBin = join(homedir(), '.local', 'bin')
  if (pathEnv.includes(localBin)) {
    pnpmHome = join(homedir(), '.local')
  } else {
    try {
      pnpmHome = run('pnpm', ['bin', '-g']).trim().replace(/\/bin\/?$/, '')
    } catch {
      pnpmHome = join(homedir(), '.local')
    }
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'xaihi-pnpm-reg-'))
let verdaccioProcess = null

try {
  // 1. 配置并启动本地单机临时 registry
  const configPath = join(tmp, 'config.yaml')
  const storageDir = join(tmp, 'storage')
  const verdaccioConfig = `
storage: ${storageDir}
uplinks:
  npmmirror:
    url: https://registry.npmmirror.com/
packages:
  "@hibernalglow/*":
    access: $all
    publish: $all
  "**":
    access: $all
    publish: $all
    proxy: npmmirror
`
  writeFileSync(configPath, verdaccioConfig, 'utf8')
  console.log(`[1/4] 启动本地微型 Registry（${LOCAL_REG_URL}）…`)
  verdaccioProcess = spawn('npx', ['verdaccio', '--config', configPath, '--listen', `127.0.0.1:${LOCAL_REG_PORT}`], {
    stdio: 'ignore',
  })

  await waitRegistryReady()

  // 2. 打包并发布底座包与选定插件
  console.log(`[2/4] 打包并发布稳定包（快照标识: ${SNAPSHOT_TAG}）…`)
  const packDir = join(tmp, 'tarballs')
  run('mkdir', ['-p', packDir])

  const runtimeVersionMap = {}
  for (const dir of RUNTIME_PKGS) {
    const origPkg = JSON.parse(readFileSync(join(repoRoot, 'packages', dir, 'package.json'), 'utf8'))
    const snapVer = `${origPkg.version || '0.1.0'}-${SNAPSHOT_TAG}`
    runtimeVersionMap[`${SCOPE}/xaihi-${dir}`] = snapVer

    const pkgDir = join(tmp, 'pkg-runtime-' + dir)
    run('mkdir', ['-p', pkgDir])
    if (existsSync(join(repoRoot, 'packages', dir, 'dist'))) {
      run('cp', ['-R', join(repoRoot, 'packages', dir, 'dist'), pkgDir])
    }

    const modifiedPkg = { ...origPkg, version: snapVer }
    for (const [dep, spec] of Object.entries(modifiedPkg.dependencies || {})) {
      if (String(spec).startsWith('workspace:') && runtimeVersionMap[dep]) {
        modifiedPkg.dependencies[dep] = runtimeVersionMap[dep]
      }
    }
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(modifiedPkg, null, 2), 'utf8')
    run('npm', ['pack', pkgDir, '--pack-destination', packDir])
  }

  const pluginVersionMap = {}
  for (const p of selected) {
    const origPkgPath = join(repoRoot, 'plugins', p.id, 'package.json')
    const origPkg = JSON.parse(readFileSync(origPkgPath, 'utf8'))
    const snapVer = `${origPkg.version || '0.0.0'}-${SNAPSHOT_TAG}`
    pluginVersionMap[origPkg.name] = snapVer

    // 从产物里读回"这个包运行时还要谁"（判据见 scanLibSignals）。
    const signals = scanLibSignals(join(repoRoot, 'plugins', p.id, 'lib'))

    const pluginPackDir = join(tmp, 'pkg-' + p.id)
    run('mkdir', ['-p', pluginPackDir])

    for (const item of (origPkg.files || ['lib', 'dist', 'locale', 'README.md', 'cordis.patch.yml'])) {
      if (item === 'package.json') continue
      const src = join(repoRoot, 'plugins', p.id, item.replace(/\/\*\*?$/, ''))
      if (existsSync(src)) {
        run('cp', ['-R', src, pluginPackDir])
      }
    }

    const modifiedPkg = { ...origPkg, version: snapVer }
    if (signals.cliRuntime || signals.opentui) {
      modifiedPkg.dependencies = {
        ...modifiedPkg.dependencies,
        '@opentui/core': '0.4.5',
        '@opentui/react': '0.4.5',
        // 钉死 19.2.4：仓库侧靠 `pnpm-workspace.yaml` 的 `overrides: react 19.2.4`
        // 把它压住，全局安装没有那层 overrides，写 `^19.2.4` 会浮到 19.3.0，
        // 把 `@opentui/react` 的 peer 组合推到没验过的一档（实测那份组合就是崩的）。
        'react': '19.2.4',
      }
      if (signals.cliRuntime) {
        modifiedPkg.dependencies['@hibernalglow/xaihi-cli-runtime'] = runtimeVersionMap[`${SCOPE}/xaihi-cli-runtime`]
      }
    }
    writeFileSync(join(pluginPackDir, 'package.json'), JSON.stringify(modifiedPkg, null, 2), 'utf8')
    run('npm', ['pack', pluginPackDir, '--pack-destination', packDir])
  }

  // 使用 pnpm publish 发布所有 tarball 到临时本地源
  const tarballs = readdirSync(packDir).filter((f) => f.endsWith('.tgz'))
  for (const t of tarballs) {
    run('pnpm', ['publish', join(packDir, t), '--registry', LOCAL_REG_URL, '--no-git-checks', '--force'])
  }

  // 3. 运行 pnpm add -g，自动享受 CAS 硬链接 Store 去重与扁平化提升
  const packagesToInstall = selected.map((p) => `${p.name}@${pluginVersionMap[p.name]}`)
  console.log(`[3/4] 执行 pnpm add -g 安装 ${selected.length} 个快照命令…`)
  const pnpmEnv = {
    ...process.env,
    PNPM_HOME: pnpmHome,
    PATH: `${join(pnpmHome, 'bin')}:${process.env.PATH || ''}`,
  }

  run('pnpm', ['add', '-g', '--shamefully-hoist', '--registry', LOCAL_REG_URL, ...packagesToInstall], {
    cwd: repoRoot,
    env: pnpmEnv,
  })

  // 4. 软链审计与点亮检查
  console.log(`[4/4] 验证全局快照独立性与命令可用性…`)
  let globalRoot = ''
  try {
    globalRoot = run('pnpm', ['root', '-g'], { env: pnpmEnv }).trim()
  } catch {}

  if (globalRoot) {
    const bad = auditSymlinks(globalRoot)
    if (bad.length > 0) {
      process.stderr.write(`⚠ 全局快照里发现外指本地开发树的软链（不应发生）：\n  ${bad.join('\n  ')}\n`)
      process.exit(1)
    }
    const patched = patchReactReconcilerExports(globalRoot)
    if (patched > 0) {
      console.log(`  ↳ react-reconciler 补 exports 映射：${patched} 份（上游 tarball 缺该字段，见函数注释）`)
    }
  }

  const binDir = join(pnpmHome, 'bin')
  const failures = []
  for (const p of selected) {
    const binFile = join(binDir, p.bin)
    if (!existsSync(binFile)) {
      failures.push(`${p.bin}（未在 ${binDir} 生成）`)
      continue
    }
    const r = spawnSync(binFile, ['--help'], { env: pnpmEnv, encoding: 'utf8', timeout: 30_000 })
    const ok = r.status === 0 || (r.stdout || '').length > 0
    console.log(`  ${ok ? '✓' : '✗'} ${p.bin} (${binFile})`)
    if (!ok) failures.push(p.bin)
  }

  if (failures.length > 0) {
    process.stderr.write(`以下 bin 点亮异常：${failures.join(' ')}\n`)
    process.exit(1)
  }

  console.log(`\n🎉 全局稳定快照安装完成！`)
  console.log(`- Bin 目录: ${binDir}`)
  console.log(`- 依赖模式: pnpm CAS 全局硬链接去重（零多余副本，总占用约 150MB~200MB）`)
  console.log(`- 隔离状态: 与本地开发仓库 100% 物理脱钩，本地开发代码变动不会影响全局稳定版`)
  console.log(`- 已生效命令: ${selected.map((p) => p.bin).join(' ')}`)
} finally {
  if (verdaccioProcess) {
    try { verdaccioProcess.kill() } catch {}
  }
  rmSync(tmp, { recursive: true, force: true })
}
