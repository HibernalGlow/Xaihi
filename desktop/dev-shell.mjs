#!/usr/bin/env node
/**
 * 一条命令重建并跑通"自家壳 + 本地 Xaihi"的开发环境。
 *
 *   node desktop/dev-shell.mjs profile   [--home <目录>] [--profile <名字>]   # 从零装配隔离 home 的 profile
 *   node desktop/dev-shell.mjs check     [...]                                # 只报就绪状态，不写任何东西
 *   node desktop/dev-shell.mjs launch    [...]                                # 起壳（前台，Ctrl-C 退出）
 *   node desktop/dev-shell.mjs verify    [...]                                # sync --verify + 活体 live-check
 *
 * 存在的理由：今天为了把壳跑起来踩了六处坑（拷 profile 会崩锁、`allowBuilds` 占位串、
 * `dsh plugin` 没有 enable 动词、`dsh-web-app` 的 latest 撒谎、`uiBundleDir` 必须显式配、
 * 少跑 `pnpm run build` 会得到空 `lib/`）。这些顺序一旦记错，症状都是"宿主起来了但东西不在"，
 * 所以它必须是代码，不能是 README 上的一段散文。
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)))
const REPO = resolve(DESKTOP, '..')
const VENDOR = join(DESKTOP, 'dsh')
const DEFAULT_HOME = join(REPO, '..', '.scratch', 'dsh-xaihi-desktop-home')
const PINNED = '0.2.0-rc.2'
/** 装配清单：顺序有讲究（core 第一个建 profile，其余跟上）。 */
const SOURCES = [
  { spec: './packages/core', label: 'xaihi-core' },
  { spec: `@deepseek-ai/dsh-web-app@${PINNED}`, label: 'web-app（网关与宿主装配；点名版本，latest 标签撒谎）' },
  { spec: './plugins/linedup', label: 'linedup' },
  { spec: './plugins/sleept', label: 'sleept' },
  { spec: './plugins/dissolvef', label: 'dissolvef' },
]
const UI_BUNDLE_DIR = join(REPO, 'packages', 'ui-host', 'dist-realm')

const argv = process.argv.slice(3)
const valueOf = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}
const HOME = resolve(valueOf('home') ?? DEFAULT_HOME)
const PROFILE = valueOf('profile') ?? 'xaihi'
const profileDir = () => join(HOME, 'profiles', PROFILE)
const profileManifest = () => join(profileDir(), 'package.json')

function fail (message) {
  console.error(`dev-shell: ${message}`)
  process.exit(1)
}

function dsh (args, { allowFail = false } = {}) {
  const result = spawnSync('pnpm', ['exec', 'dsh', ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 << 20,
    env: { ...process.env, DSH_HOME: HOME },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0 && !allowFail) fail(`dsh ${args.join(' ')} 失败：\n${out.split('\n').slice(-6).join('\n')}`)
  return { ok: result.status === 0, out }
}

function readJson (path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson (path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** pnpm 12 的待填名单：占位串不填会整次安装判失败（今天撞过）。 */
function fixAllowBuilds () {
  const ws = join(profileDir(), 'pnpm-workspace.yaml')
  if (!existsSync(ws)) return '没有 pnpm-workspace.yaml（还没 add 过）'
  const text = readFileSync(ws, 'utf8')
  const patched = text.replace(/^(allowBuilds:\n(?:.*\n)*?)([ \t]+)(\S+): set this to true or false[ \t]*$/mu, '$1$2$3: true')
  if (patched !== text) {
    writeFileSync(ws, patched)
    return '已把 allowBuilds 占位串填成 true'
  }
  return text.includes('set this to true or false') ? '仍有占位串没填（正则没命中，去看文件）' : '已是填好的状态'
}

/** 启用集在 `dsh.profile.bundles` 里；`dsh plugin` 只转发 pnpm，没有 enable 动词（今天撞过）。 */
function ensureBundles (needed) {
  const manifest = readJson(profileManifest())
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const missing = needed.filter((name) => !bundles.includes(name))
  if (missing.length === 0) return { added: [], bundles }
  manifest.dsh = { ...(manifest.dsh ?? {}), profile: { ...(manifest.dsh?.profile ?? {}), bundles: [...bundles, ...missing] } }
  writeJson(profileManifest(), manifest)
  return { added: missing, bundles: manifest.dsh.profile.bundles }
}

const PATCH_ENTRY = '# dev-shell 装配：工作台文档的产物目录必须显式给 core（默认空串 ⇒ 503）。\n'
  + '- id: xaihi-core\n  config:\n    verbose: false\n'
  + `    uiBundleDir: ${UI_BUNDLE_DIR}\n`

/**
 * 写 profile 的补丁层。注意 `[]` 与块序列不能并存：新建的 profile 里那一行就是 `[]`，
 * 直接往后追加会得到 `YAMLException: end of the stream or a document separator`
 * ——这条今天撞过两次，所以这里按"替换空序列"处理而不是追加。
 */
function ensureProfilePatch () {
  const patch = join(profileDir(), 'cordis.patch.yml')
  const current = existsSync(patch) ? readFileSync(patch, 'utf8') : ''
  if (current.includes('uiBundleDir')) return 'uiBundleDir 已配'
  const trimmed = current.trimEnd()
  const written = /^\[\s*\]\s*$/mu.test(trimmed)
    ? `${trimmed.replace(/^\[\s*\]\s*$/mu, PATCH_ENTRY)}`
    : trimmed.length === 0 ? PATCH_ENTRY : `${trimmed}\n\n${PATCH_ENTRY}`
  writeFileSync(patch, written.endsWith('\n') ? written : `${written}\n`)
  return '已写入 uiBundleDir'
}

/** 让宿主自己判这份 YAML：`--dump-config` 会走装载层的解析，比我自己看着像 YAML 权威。 */
function validateProfile () {
  // `--dump-config` 不接受其他应用参数（带上 --no-open 会被拒），且判据只看有没有解析报错：
  // 别的失败原因（宿主起不来）不能冒充"配置被拒"。
  const dump = dsh(['--profile', PROFILE, '--dump-config'], { allowFail: true })
  const complaint = `${dump.out}`.split('\n').find((line) => /failed to parse overlay|YAMLException/iu.test(line))
  if (complaint !== undefined) return `宿主拒绝这份配置：${complaint}`
  return `宿主 --dump-config 解析通过（rc=${String(dump.ok ? 0 : 1)}；非零是别的原因，不是 YAML）`
}

function prerequisites () {
  const vendorNodeModules = existsSync(join(VENDOR, 'node_modules'))
  const gatewayJs = existsSync(join(VENDOR, 'packages', 'api', 'gateway', 'lib', 'index.js'))
  const shellBundle = existsSync(join(VENDOR, 'apps', 'desktop', 'lib', 'main.js'))
  const uiBundle = existsSync(join(UI_BUNDLE_DIR, 'main.js'))
  const pin = existsSync(join(DESKTOP, 'UPSTREAM_PIN'))
    ? readFileSync(join(DESKTOP, 'UPSTREAM_PIN'), 'utf8').trim().split(/\s+/u)[1]
    : undefined
  const head = spawnSync('git', ['-C', VENDOR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim()
  return { vendorNodeModules, gatewayJs, shellBundle, uiBundle, head, pin }
}

function portBusy (port) {
  const probe = spawnSync('lsof', ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
  const pids = `${probe.stdout ?? ''}`.trim().split('\n').filter((line) => line.length > 0)
  return pids
}

/** 只杀我们自己那棵壳（路径里带 desktop/dsh 的 .desktop-build），绝不碰别人机器上的 Electron 应用。 */
function killOwnShell () {
  const probe = spawnSync('pgrep', ['-f', 'desktop/dsh/apps/desktop/.desktop-build'], { encoding: 'utf8' })
  const pids = `${probe.stdout ?? ''}`.trim().split('\n').filter((line) => line.length > 0)
  for (const pid of pids) spawnSync('kill', ['-9', pid])
  return pids.length
}

/** dev.ts 的 `--skip-build` 路用不到它，但缺了会在那条 build 路上炸，所以能解析就带上。 */
function whichPnpm () {
  const probe = spawnSync('/usr/bin/env', ['bash', '-lc', 'command -v pnpm'], { encoding: 'utf8' })
  const found = typeof probe.stdout === 'string' ? probe.stdout.trim() : ''
  return found.length > 0 ? found : 'pnpm'
}

function reportPrerequisites () {
  const p = prerequisites()
  const lines = [
    `vendor 在 HEAD=${String(p.head)?.slice(0, 8)}（pin=${String(p.pin)?.slice(0, 8)}）`,
    `node_modules ${p.vendorNodeModules ? '在场' : '缺失 ⇒ cd desktop/dsh && pnpm install --ignore-scripts'}`,
    `网关 lib/index.js ${p.gatewayJs ? '在场' : '缺失 ⇒ cd desktop/dsh && pnpm run build（少这步 /api 会 404）'}`,
    `壳产物 lib/main.js ${p.shellBundle ? '在场' : '缺失 ⇒ pnpm --filter @deepseek-ai/dsh-desktop run build'}`,
    `UI 产物 ${p.uiBundle ? '在场' : `缺失 ⇒ ${UI_BUNDLE_DIR} 里没有 main.js（搬运 lane 的构建）`}`,
  ]
  return { ready: p.vendorNodeModules && p.gatewayJs && p.shellBundle && p.uiBundle, lines }
}

const mode = process.argv[2]

if (mode === 'check') {
  const { ready, lines } = reportPrerequisites()
  const manifest = existsSync(profileManifest()) ? readJson(profileManifest()) : undefined
  console.log(`dev-shell check: home=${HOME} profile=${PROFILE} ⇒ ${ready ? '就绪' : '未就绪'}`)
  for (const line of lines) console.log(`  - ${line}`)
  console.log(`  - bundles=${manifest === undefined ? 'profile 不存在' : String(manifest.dsh?.profile?.bundles?.length ?? 0)}`)
  const verdict = manifest === undefined ? 'profile 不存在，无法验配置' : validateProfile()
  // 解析没报错就算过（rc 另说），否则会拿宿主其他问题当 YAML 问题。
  console.log(`  - ${verdict}`)
  process.exit(ready && manifest !== undefined && verdict.includes('解析通过') ? 0 : 1)
}

if (mode === 'launch') {
  const { ready, lines } = reportPrerequisites()
  if (!ready) {
    console.error('dev-shell launch: 前置不齐，先跑 profile/构建：')
    for (const line of lines) console.error(`  - ${line}`)
    process.exit(1)
  }
  const stuck = [...portBusy(9229), ...portBusy(9222)]
  if (stuck.length > 0) {
    console.error(`dev-shell launch: 调试端口已被占（${[...new Set(stuck)].join(', ')}）⇒ 上一个壳还活着。`
      + '\n  连到旧的会得到假结论（今天真发生过：live-check 连到没配好的那一个）。'
      + '\n  先跑：node desktop/dev-shell.mjs stop')
    process.exit(1)
  }
  const app = join(VENDOR, 'apps', 'desktop')
  const child = spawn('pnpm', ['exec', 'tsx', 'scripts/dev.ts', '--skip-build'], {
    cwd: app,
    stdio: 'inherit',
    env: {
      ...process.env,
      DSH_HOME: HOME,
      XAIHI_DESKTOP_PROFILE: PROFILE,
      DSH_DESKTOP_OPEN_DEVTOOLS: process.env.DSH_DESKTOP_OPEN_DEVTOOLS ?? '0',
      npm_execpath: process.env.npm_execpath ?? whichPnpm(),
    },
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}

if (mode === 'stop') {
  const killed = killOwnShell()
  spawnSync('sleep', ['2'])
  console.log(`dev-shell stop: 杀掉自己那棵壳 ${String(killed)} 个进程；剩余监听 9229=${String(portBusy(9229).length)} 9222=${String(portBusy(9222).length)}`)
  process.exit(0)
}

if (mode === 'verify') {
  const a = spawnSync('node', [join(DESKTOP, 'sync-dsh.mjs'), '--verify'], { cwd: REPO, stdio: 'inherit' })
  if (a.status !== 0) fail('sync-dsh --verify 红')
  const b = spawnSync('node', [join(DESKTOP, 'live-check.mjs')], { cwd: REPO, stdio: 'inherit' })
  process.exit(b.status ?? 1)
}

if (mode === 'profile') {
  mkdirSync(join(HOME, 'profiles'), { recursive: true })
  for (const source of SOURCES) {
    const target = source.spec.startsWith('.') ? resolve(REPO, source.spec) : source.spec
    const added = dsh(['plugin', '--profile', PROFILE, 'add', target], { allowFail: true })
    console.log(`dev-shell: add ${source.label} ⇒ ${added.ok ? 'ok' : '失败（记下来，不静默跳过）'}`)
    if (!added.ok) console.log(added.out.split('\n').slice(-4).map((l) => `    ${l}`).join('\n'))
    // 第一次 add 之后 profile 的 pnpm-workspace.yaml 才存在，占位串必须在后续 add 之前填掉。
    console.log(`dev-shell: ${fixAllowBuilds()}`)
  }
  const enabled = ensureBundles(['@deepseek-ai/dsh-web-app'])
  console.log(`dev-shell: 启用集补了 ${enabled.added.join(', ') || '（无，已在列）'}`)
  console.log(`dev-shell: ${ensureProfilePatch()}`)
  console.log(`dev-shell: ${validateProfile()}`)
  const manifest = readJson(profileManifest())
  console.log(`dev-shell: profile=${PROFILE} bundles=${manifest.dsh.profile.bundles.length} 个 ⇒ ${manifest.dsh.profile.bundles.join(' ')}`)
  const { ready, lines } = reportPrerequisites()
  console.log(`dev-shell: 环境${ready ? '就绪' : '还差东西'}；缺的看下面（缺就 launch 会被拒）`)
  for (const line of lines) console.log(`  - ${line}`)
  process.exit(0)
}

console.log('用法：node desktop/dev-shell.mjs <profile|check|launch|stop|verify> [--home <目录>] [--profile <名字>]')
