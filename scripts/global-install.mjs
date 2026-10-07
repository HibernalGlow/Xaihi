#!/usr/bin/env node
/**
 * 全局安装节点终端面的 dev 工具：把插件 CLI/TUI 以"冻结快照"装进 npm 全局。
 *
 * 背景（2026-10-07 实测）：`npm i -g file:plugins/<id>` 在当前 npm 下装的是指向
 * 仓库工作树的**软链**——本地一改，全局那份当场跟着变，起不到"本地改坏了还能用
 * 全局那份"的保险作用。本脚本改走 tarball：`pnpm pack` 四个运行时底座
 * （cli-runtime / api / contract / shared，pnpm pack 会把 `workspace:*` 改写成真
 * 版本）+ `npm pack` 各插件（`files` 白名单只带 lib/dist/locale），然后一条
 * `npm i -g` 全装上。装进去的都是解包实体，与仓库零关联；更新 = 重跑本命令。
 *
 * 注意：
 * - 全局跑 `ui`/`gd` 的机器要 Node ≥ 26（OpenTUI 走 node:ffi；Node 22 会可读
 *   降级 rc=3，这是 ADR-0011 意义上的可见退化，不是本脚本的问题）。
 * - 每个插件在全局各带一份依赖（npm 全局没有 store 去重），单个 ~170MB；全量
 *   25 个 ≈ 4GB+。当保险用就只装常用的那几个。
 * - cli-runtime 的 dependencies 里有 xaihi-api / xaihi-contract，bin 的运行闭链
 *   真的会碰到（dist/help.js 引 contract），所以四个底座随闭链一起装，不做删改。
 * - 卸载：
 *   npm rm -g @hibernalglow/xaihi-<id> @hibernalglow/xaihi-cli-runtime \
 *     @hibernalglow/xaihi-api @hibernalglow/xaihi-contract @hibernalglow/xaihi-shared
 *
 * 用法：
 *   pnpm global:install [id ...]      # 缺省 = 所有带 bin 的插件
 *   XAIHI_GLOBAL_PREFIX=… pnpm global:install [id …]   # 覆盖安装前缀（测试用）
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const RUNTIME_PKGS = ['cli-runtime', 'api', 'contract', 'shared']
const SCOPE = '@hibernalglow'

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

/** 软链审计：prefix 内任何软链都不许指到 prefix 外（那是快照失效的信号）。 */
function auditSymlinks (prefix) {
  const bad = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isSymbolicLink()) {
        const target = resolve(dir, readlinkSync(full))
        if (!target.startsWith(prefix)) bad.push(`${full} -> ${target}`)
      } else if (e.isDirectory()) {
        walk(full)
      }
    }
  }
  walk(join(prefix, 'lib', 'node_modules'))
  return bad
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

const prefix = process.env.XAIHI_GLOBAL_PREFIX || run('npm', ['prefix', '-g']).trim()
const tmp = mkdtempSync(join(tmpdir(), 'xaihi-global-'))

try {
  for (const dir of RUNTIME_PKGS) {
    const name = `${SCOPE}/xaihi-${dir}`
    run('pnpm', ['--filter', name, 'pack', '--pack-destination', tmp], { cwd: repoRoot })
  }
  for (const p of selected) {
    run('npm', ['pack', `./plugins/${p.id}`, '--pack-destination', tmp], { cwd: repoRoot })
  }
  const tarballs = readdirSync(tmp).filter((f) => f.endsWith('.tgz')).map((f) => join(tmp, f))
  console.log(`安装 ${tarballs.length} 个 tarball 到 ${prefix} …`)
  run('npm', ['i', '-g', '--prefix', prefix, ...tarballs])

  const bad = auditSymlinks(prefix)
  if (bad.length > 0) {
    process.stderr.write(`⚠ 全局快照里发现外指软链（不应发生）：\n  ${bad.join('\n  ')}\n`)
    process.exit(1)
  }

  const failures = []
  for (const p of selected) {
    const bin = join(prefix, 'bin', p.bin)
    const r = spawnSync(bin, ['--help'], { encoding: 'utf8', timeout: 30_000 })
    const ok = r.status === 0 && (r.stdout || '').length > 0
    console.log(`  ${ok ? '✓' : '✗'} ${p.bin} (--help rc=${r.status})`)
    if (!ok) failures.push(p.id)
  }
  if (failures.length > 0) {
    process.stderr.write(`以下 bin 装完点不亮：${failures.join(' ')}\n`)
    process.exit(1)
  }
  console.log(`完成：${selected.map((p) => p.bin).join(' ')}（快照，与仓库无关联；更新重跑本命令）`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
