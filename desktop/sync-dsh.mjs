#!/usr/bin/env node
/**
 * 把 desktop/dsh（DSH 上游的 submodule）对齐到 UPSTREAM_PIN，再把 patches/dsh/*.patch 重放上去。
 *
 * 职责边界（ADR-0011）：submodule 只负责"拿源码 + 锁 upstream commit"，**不负责** Desktop 运行时的
 * package closure —— 装机/打包仍然走上游自己的 package-set 与 runtime preparation。
 *
 * 用法：
 *   node desktop/sync-dsh.mjs                 对齐 pin + 打全部 patch
 *   node desktop/sync-dsh.mjs --check         不写：报 pin / HEAD / patch 数 / 脏文件
 *   node desktop/sync-dsh.mjs --reset         回到 pin（丢弃 patch 提交）；有手工改动要 --force
 *   node desktop/sync-dsh.mjs --size          报 .git 与工作树字节
 *   node desktop/sync-dsh.mjs --sparse        按 Desktop 的 workspace 闭包裁剪检出（非 cone 模式）
 *   node desktop/sync-dsh.mjs --sparse-off    恢复整棵工作树
 *   node desktop/sync-dsh.mjs --pin <sha>     覆盖 pin（阳性对照：错 sha 必须在落盘前被拒）
 *   node desktop/sync-dsh.mjs --proxy <url>   走代理（也读 XAIHI_DESKTOP_PROXY / HTTPS_PROXY）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cpus as osCpus, loadavg } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)))
const REPO_ROOT = resolve(DESKTOP, '..')
const REMOTE = 'https://github.com/deepseek-ai/deepseek-harness.git'
const VENDOR = join(DESKTOP, 'dsh')
const PATCH_DIR = join(DESKTOP, 'patches', 'dsh')
/** 上游构建必读、但不在闭包推导里的顶层目录：漏一个 tsc/pnpm 就看见缺文件。 */
const ALWAYS = ['apps', 'vendor', 'native', 'patches', 'scripts', 'python']

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const valueOf = (name) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 3)
  const i = argv.indexOf(`--${name}`)
  return i === -1 || i + 1 >= argv.length ? undefined : argv[i + 1]
}
const load1m = () => Math.round(loadavg()[0] * 100) / 100
const cpus = () => osCpus().length

function fail (message) {
  console.error(`sync-dsh: ${message}`)
  process.exit(1)
}

function git (args, { allowFail = false, env = {} } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      env: { ...process.env, ...env },
    }) ?? ''
  } catch (error) {
    const detail = `${String(error.stderr ?? '').trim() || String(error.message)}`
    if (allowFail) return { failed: true, output: detail }
    return fail(`git ${args.join(' ')} 失败：${detail.split('\n')[0]}`)
  }
}

function readPin () {
  const raw = readFileSync(join(DESKTOP, 'UPSTREAM_PIN'), 'utf8').trim()
  const [tag, sha] = raw.split(/\s+/u)
  if (typeof tag !== 'string' || tag.length === 0 || !/^[0-9a-f]{40}$/u.test(String(sha))) {
    fail(`UPSTREAM_PIN 必须是一行 "<tag> <40位sha>"，现读到 ${JSON.stringify(raw)}`)
  }
  return { tag, sha: String(sha) }
}

const headSha = () => String(git(['-C', VENDOR, 'rev-parse', 'HEAD'])).trim()
const dirtyCount = () => git(['-C', VENDOR, 'status', '--porcelain']).split('\n').filter((l) => l.length > 0).length

function patchesOnTop (pinSha) {
  const out = git(['-C', VENDOR, 'rev-list', '--count', `${pinSha}..HEAD`], { allowFail: true })
  return typeof out === 'object' && out.failed ? -1 : Number.parseInt(String(out).trim(), 10)
}

function patchFiles () {
  if (!existsSync(PATCH_DIR)) return []
  return readdirSync(PATCH_DIR).filter((f) => /^\d[0-9a-zA-Z-]*\.patch$/u.test(f)).sort().map((f) => join(PATCH_DIR, f))
}

function bytes (path) {
  if (!existsSync(path)) return 0
  let total = 0
  const stack = [path]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name)
      // node_modules 单独报：它是安装产物（今天实测 1.8 GiB），混进"工作树"里读数就没意义了。
      if (entry.isDirectory()) { if (entry.name === 'node_modules') continue; stack.push(child) }
      else if (entry.isFile()) { try { total += statSync(child).size } catch { /* 竞态：只报下界 */ } }
    }
  }
  return total
}
const mib = (n) => `${(n / 1048576).toFixed(1)}MiB`

function proxyArgs () {
  const proxy = valueOf('proxy') ?? process.env.XAIHI_DESKTOP_PROXY ?? process.env.HTTPS_PROXY ?? ''
  return proxy.length === 0 ? [] : ['-c', `http.proxy=${proxy}`, '-c', `https.proxy=${proxy}`]
}

/** Desktop 的 workspace 闭包：从三个种子沿 workspace:* 走一遍，返回需要检出的目录。 */
function closureDirs () {
  const roots = ['packages', 'vendor', 'native/system/packages', 'apps']
  const pkgs = {}
  const add = (dir) => {
    const manifest = join(VENDOR, dir, 'package.json')
    if (!existsSync(manifest)) return
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
      if (typeof parsed.name === 'string') pkgs[parsed.name] = { dir, parsed }
    } catch { /* 非 manifest，忽略 */ }
  }
  for (const group of roots) {
    const dir = join(VENDOR, group)
    if (!existsSync(dir)) continue
    for (const a of readdirSync(dir, { withFileTypes: true })) {
      if (!a.isDirectory()) continue
      add(`${group}/${a.name}`)
      if (group === 'packages') {
        for (const b of readdirSync(join(dir, a.name), { withFileTypes: true })) {
          if (b.isDirectory()) add(`${group}/${a.name}/${b.name}`)
        }
      }
    }
  }
  for (const extra of ['website', 'benchmarks', 'python/sdk-runtime', 'native/system']) add(extra)
  const seeds = ['@deepseek-ai/dsh-desktop', '@deepseek-ai/dsh-desktop-host', '@deepseek-ai/dsh'].filter((n) => pkgs[n] !== undefined)
  if (seeds.length < 3) fail(`闭包种子缺人（找到 ${String(seeds.length)}/3）：上游的包名或目录形状变了，先复核再裁剪`)
  const seen = new Set()
  const queue = seeds.slice()
  while (queue.length > 0) {
    const name = queue.pop()
    if (seen.has(name)) continue
    seen.add(name)
    const entry = pkgs[name]
    if (entry === undefined) continue
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dep, spec] of Object.entries(entry.parsed[group] ?? {})) {
        if (!/^workspace:/u.test(String(spec))) continue
        if (pkgs[dep] !== undefined) { if (!seen.has(dep)) queue.push(dep) }
        else fail(`workspace 依赖 ${dep}（来自 ${name}）在 vendor 里找不到包，闭包算不全`)
      }
    }
  }
  const dirs = new Set(ALWAYS)
  for (const name of seen) dirs.add(pkgs[name].dir)
  return { dirs: [...dirs].sort(), packageCount: seen.size, memberCount: Object.keys(pkgs).length }
}

function ensureAtPin ({ tag, sha }) {
  const net = proxyArgs().length === 0 ? 'direct' : 'proxy'
  if (!existsSync(join(VENDOR, '.git'))) {
    console.log(`sync-dsh: submodule 还没初始化 → git submodule update --init --depth=1（net=${net}）`)
    git([...proxyArgs(), 'submodule', 'update', '--init', '--depth', '1', 'desktop/dsh'])
  } else {
    const have = git(['-C', VENDOR, 'cat-file', '-e', `${sha}^{commit}`], { allowFail: true })
    if (typeof have === 'object' && have.failed) {
      console.log(`sync-dsh: fetch ${tag}（net=${net}）`)
      const fetched = git([...proxyArgs(), '-C', VENDOR, 'fetch', '--depth', '1', 'origin',
        `refs/tags/${tag}:refs/tags/${tag}`], { allowFail: true })
      if (typeof fetched === 'object' && fetched.failed) fail(`fetch tag ${tag} 失败：${fetched.output.split('\n')[0]}`)
    }
  }
  const actual = git(['-C', VENDOR, 'rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { allowFail: true })
  const peeled = typeof actual === 'object' && actual.failed ? '' : String(actual).trim()
  if (peeled.length === 0) fail(`本地解析不出 tag ${tag}，拒绝 checkout`)
  if (peeled !== sha) fail(`pin 不符：UPSTREAM_PIN 写着 ${sha}，tag ${tag} 实际是 ${peeled}。先修 pin 再 sync`)
  git(['-C', VENDOR, 'checkout', '--force', '--quiet', sha])
}

function applyPatches (pinSha) {
  const files = patchFiles()
  let applied = 0
  // 提交时间钉在 pin 自身：否则每次重放都换 commit sha，"跑两次看看"就会给出两个头，
  // 而可复现性只能靠哈希相同来证（tree 哈希本来就稳定，commit 哈希也必须稳定）。
  const pinDate = String(git(['-C', VENDOR, 'show', '--no-patch', '--format=%cI', pinSha])).trim()
  for (const file of files) {
    const name = file.split('/').pop()
    const result = git(['-C', VENDOR, 'am', file], { allowFail: true, env: { GIT_COMMITTER_DATE: pinDate } })
    if (typeof result === 'object' && result.failed) {
      git(['-C', VENDOR, 'am', '--abort'], { allowFail: true })
      fail(`patch ${name} 打不进 ${headSha().slice(0, 8)}（已 git am --abort）`
        + `\n  看被拒的段：git -C desktop/dsh apply --check desktop/patches/dsh/${name}`
        + '\n  规矩是"打不进就是红"，不许用 --3way 蒙掉别人的行（desktop/patches/dsh/README.md）')
    }
    applied += 1
    console.log(`sync-dsh: am ${name} -> ${headSha().slice(0, 8)}`)
  }
  return { total: files.length, applied }
}

const started = Date.now()
const pinned = readPin()
const pin = valueOf('pin') !== undefined ? { tag: pinned.tag, sha: valueOf('pin') } : pinned
if (!/^[0-9a-f]{40}$/u.test(String(pin.sha))) fail(`pin 需要 40 位 sha，收到 ${JSON.stringify(pin.sha)}`)

if (flag('verify')) {
  // 0001 的落地判据：patch 打上后，壳的 IPC 面必须真的多出那一条通道。
  // 之所以能直接跑：ipc.ts 的三条 import 全是 `import type`，剥掉类型后不依赖 node_modules。
  const probe = await import('./dsh/apps/desktop/src/ipc.ts')
  const want = 'dsh-desktop:xaihi-window-open'
  const satisfied = (table) => Object.keys(table).length === 26
    && table.xaihiWindowOpen === want
    && Object.keys(table).includes('browserAcquire')
  // 减法对照：把那条通道删掉，同一条判据必须说"不满足"，否则它不算尺。
  const mutated = { ...probe.DESKTOP_IPC }
  delete mutated.xaihiWindowOpen
  if (satisfied(mutated)) fail('verify 是瞎的：删掉 xaihiWindowOpen 之后它照样报绿')
  if (Object.keys(mutated).length !== 25) fail('verify 的减法对照没落地（删完还是 26 条？）')
  console.log(`verify: channels=${String(Object.keys(probe.DESKTOP_IPC).length)} want=${want} `
    + `satisfied=${String(satisfied(probe.DESKTOP_IPC))} control_after_delete=red`)
  if (!satisfied(probe.DESKTOP_IPC)) {
    fail('patch 0001 没落地到 IPC 面（通道数或通道名不对）⇒ 它被静默跳过，或上游改了 apps/desktop/src/ipc.ts')
  }
  // 0002 的判策是纯模块，所以能脱离 Electron 直接执行。拒绝分支才是这条判策的意义所在。
  const policy = await import('./dsh/apps/desktop/src/xaihi-window-policy.ts')
  const good = 'dsh-app://app/xaihi/ui/0123456789ab/index.html'
  const cases = [
    ['自家文档开自家节点', { url: `${good}?node=findz`, openerUrl: good }, true],
    ['不给 node 也允许', { url: good, openerUrl: good }, true],
    ['rev 不是 12 位十六进制', { url: 'dsh-app://app/xaihi/ui/zzzz/index.html?node=a', openerUrl: good }, false],
    ['路径穿越', { url: 'dsh-app://app/xaihi/ui/0123456789ab/../../etc/index.html', openerUrl: good }, false],
    ['https 外链', { url: 'https://example.com/xaihi/ui/0123456789ab/index.html', openerUrl: good }, false],
    ['同 scheme 别的 host', { url: 'dsh-app://shell/xaihi/ui/0123456789ab/index.html', openerUrl: good }, false],
    ['发起者不是 Xaihi 文档', { url: `${good}?node=a`, openerUrl: 'dsh-app://app/index.html' }, false],
    ['多带一个查询键', { url: `${good}?node=a&next=http://evil`, openerUrl: good }, false],
    ['node 含非法字符', { url: `${good}?node=a/../b`, openerUrl: good }, false],
    ['无法解析的串', { url: 'not a url', openerUrl: good }, false],
    ['超长串', { url: `${good}?node=${'a'.repeat(3000)}`, openerUrl: good }, false],
  ]
  const wrong = cases.filter(([name, req, want]) => (policy.resolveXaihiDocumentTarget(req) !== undefined) !== want)
  console.log(`verify: 0002 判策 ${String(cases.length)} 用例，判错 ${String(wrong.length)}（拒绝分支含路径穿越/跨 host/非自家发起者）`)
  if (wrong.length > 0) fail(`verify: 0002 判策与用例表不符 ⇒ ${wrong.map(([n]) => n).join(', ')}`)
  if (policy.resolveXaihiDocumentTarget({ url: 'https://example.com', openerUrl: good }) !== undefined) {
    fail('verify: 0002 的判策是瞎的（外链居然被放行）')
  }
  // 0003 的判策也是纯函数：给了名字走 profiles/<name>，缺省 desktop，坏形状要抛。
  const paths = await import('./dsh/apps/desktop/src/paths.ts')
  process.env.XAIHI_DESKTOP_PROFILE = 'xaihi-desktop-probe'
  const chosen = paths.resolveDesktopPaths('/tmp/home').profile
  process.env.XAIHI_DESKTOP_PROFILE = 'Bad Name!'
  let threw = ''
  try { paths.resolveDesktopPaths('/tmp/home') } catch (error) { threw = String(error.message) }
  delete process.env.XAIHI_DESKTOP_PROFILE
  const dflt = paths.resolveDesktopPaths('/tmp/home').profile
  console.log(`verify: 0003 chosen=${chosen} default=${dflt} bad_shape_rejected=${String(threw.includes('must match'))}`)
  if (chosen !== '/tmp/home/profiles/xaihi-desktop-probe') fail('verify: 0003 没让壳选 profile')
  if (dflt !== '/tmp/home/profiles/desktop') fail('verify: 0003 改坏了缺省值')
  if (!threw.includes('must match')) fail('verify: 0003 对坏形状太宽容（静默退回默认值算缺陷）')

  // 第二阶段：产物判据。lib/ 是上游 tsc 吐出来的，存在就说明这条通道真被编进了壳的
  // 主进程与 preload —— 源码里有定义 ≠ 落进了产物（这是构建绿却跑错代码那一类病的解药）。
  // 新文件要真进 program：tsc -b 的产物在 lib/types/，bundle 的在 lib/ —— 只查后者会漏掉新模块。
  const built = ['apps/desktop/lib/main.js', 'apps/desktop/lib/preload-app.cjs',
    'apps/desktop/lib/types/xaihi-window-policy.js']
    .map((f) => join(VENDOR, f))
  const missing = built.filter((f) => !existsSync(f))
  if (missing.length === built.length) {
    console.log('verify: 产物判据**未跑** —— apps/desktop/lib 不在（先 pnpm run build:lib:host 再 tsc -b apps/desktop）')
  } else if (missing.length > 0) {
    fail(`verify: 产物不齐，只缺 ${missing.map((f) => f.split('/').pop()).join(', ')} ⇒ 构建是半截的，别提"已编译验证"`)
  } else {
    const mainJs = readFileSync(built[0], 'utf8')
    const preload = readFileSync(built[1], 'utf8')
    const inMain = mainJs.includes(want)
    const policyWired = mainJs.includes('resolveXaihiDocumentTarget')
    const inPreload = preload.includes(want)
    // 减法对照：一个不存在的通道名必须两个产物都找不到，否则这判据是白名单式的假绿。
    const ghost = mainJs.includes('dsh-desktop:xaihi-window-DOES-NOT-EXIST') || preload.includes('dsh-desktop:xaihi-window-DOES-NOT-EXIST')
    console.log(`verify: 产物 main.js=${String(inMain)} preload-app.cjs=${String(inPreload)} ghost_absent=${String(!ghost)}`)
    const profileWired = mainJs.includes('XAIHI_DESKTOP_PROFILE')
    console.log(`verify: 0002 已接进 bundle=${String(policyWired)} 0003 已接进 bundle=${String(profileWired)}`)
    if (!profileWired) fail('verify: 0003 没进 lib/main.js ⇒ 又是只跑 tsc 没跑 bundle')
    if (!inMain || !inPreload) fail('verify: 通道没进产物 ⇒ 那条源码改动没被编译，或 patch 被静默跳过')
    if (!policyWired) fail('verify: 0002 的判策没进 lib/main.js ⇒ 只跑了 tsc 没跑 bundle，产物是半截的')
    if (ghost) fail('verify: 产物判据是瞎的（不存在的通道名也能搜到）')
  }
  console.log('verify: 绿（含减法对照）')
  process.exit(0)
}

if (flag('size')) {
  if (!existsSync(VENDOR)) fail('还没有 desktop/dsh')
  // submodule 的 .git 是一个 gitdir 文件，不是目录 —— 只能问 git 自己真身在哪儿。
  const gitDir = String(git(['-C', VENDOR, 'rev-parse', '--absolute-git-dir'])).trim()
  const nm = join(VENDOR, 'node_modules')
  console.log(`tree_bytes=${bytes(VENDOR)}（不含 node_modules；submodule 下 .git 是指针文件，不计） `
    + `git_dir=${gitDir} git_dir_bytes=${existsSync(gitDir) ? mib(bytes(gitDir)) : 'n/a'} `
    + `node_modules_lower_bound=${existsSync(nm) ? mib(bytes(nm)) : '未安装'}（pnpm 是 symlink 树，这个口径会少报，真值问 du）`)
  process.exit(0)
}

if (flag('check')) {
  if (!existsSync(join(VENDOR, '.git'))) fail('还没有 desktop/dsh：跑 node desktop/sync-dsh.mjs')
  const depth = patchesOnTop(pin.sha)
  console.log(`want_pin=${pin.sha} head=${headSha()} `
    + `tree=${String(git(['-C', VENDOR, 'rev-parse', 'HEAD^{tree}'])).trim()} `
    + `patches_on_top=${String(depth)} expected_patches=${String(patchFiles().length)} dirty=${String(dirtyCount())}`)
  // gitlink 必须停在 pin：记下 patch 后的提交，别人 clone 出来是一个取不到的对象。
  const committed = String(git(['ls-tree', 'HEAD', 'desktop/dsh'])).trim().split(/\s+/u)[2] ?? ''
  const staged = String(git(['ls-files', '-s', 'desktop/dsh'])).trim().split(/\s+/u)[1] ?? ''
  console.log(`gitlink_committed=${committed.slice(0, 8)} gitlink_staged=${staged.slice(0, 8)} want=${pin.sha.slice(0, 8)}`)
  if (committed.length > 0 && committed !== pin.sha) {
    fail(`gitlink 指到了 ${committed.slice(0, 8)} 而不是 pin ${pin.sha.slice(0, 8)} ⇒ 那条提交只活在本机（git am 造出来的），`
      + '别人 clone 取不到。先把 submodule 退回 pin（--reset）再重提 desktop/dsh')
  }
  if (headSha() !== pin.sha && depth === -1) fail('HEAD 不在 pin 之上：pin 漂移或 patch 丢失，跑 --reset')
  if (depth !== patchFiles().length) {
    fail(`patch 数不符：树上有 ${String(depth)} 个，patches/dsh 里有 ${String(patchFiles().length)} 个 ⇒ 跑一次 node desktop/sync-dsh.mjs`)
  }
  process.exit(0)
}

if (flag('reset')) {
  if (!existsSync(join(VENDOR, '.git'))) { console.log('sync-dsh: 没有 desktop/dsh，无需 reset'); process.exit(0) }
  if (dirtyCount() > 0 && !flag('force')) fail(`工作树有 ${String(dirtyCount())} 个脏文件（可能含手工实验），要丢弃就加 --force`)
  git(['-C', VENDOR, 'am', '--abort'], { allowFail: true })
  git(['-C', VENDOR, 'sparse-checkout', 'disable'], { allowFail: true })
  git(['-C', VENDOR, 'checkout', '--force', '--quiet', pin.sha])
  console.log(`sync-dsh: reset 到 ${pin.sha.slice(0, 8)}（sparse 已关）`)
  process.exit(0)
}

if (flag('sparse-off')) {
  git(['-C', VENDOR, 'sparse-checkout', 'disable'])
  console.log(`sync-dsh: sparse 已关，工作树 ${mib(bytes(VENDOR))}（不含 .git 的部分另计）`)
  process.exit(0)
}

if (flag('sparse')) {
  if (!existsSync(join(VENDOR, '.git'))) fail('先跑一次 sync 把 submodule 拉下来，再裁剪')
  const before = bytes(VENDOR)
  const { dirs, packageCount, memberCount } = closureDirs()
  // cone 模式：根文件（pnpm-workspace.yaml、tsconfig*、tsdown.config.ts…）自动在场，
  // 只按目录裁 —— 非 cone 得自己列根文件，漏一个上游就装不起来。
  git(['-C', VENDOR, 'sparse-checkout', 'init', '--cone'])
  git(['-C', VENDOR, 'sparse-checkout', 'set', ...dirs])
  const after = bytes(VENDOR)
  console.log(`sync-dsh: sparse 闭包 ${packageCount}/${memberCount} 包 ⇒ ${dirs.length} 个检出目录，`
    + `${mib(before)} → ${mib(after)}（省 ${mib(before - after)}）`)
  console.log('sync-dsh: 提醒 —— 裁剪过的树里 docs/ 与 .agents/ 不在场，上游的 readall/文档类校验会红；'
    + '要跑上游构建或 tsc 就先 --sparse-off')
  process.exit(0)
}

ensureAtPin(pin)
const { total, applied } = applyPatches(pin.sha)
const treeHash = String(git(['-C', VENDOR, 'rev-parse', 'HEAD^{tree}'])).trim()
console.log(`sync-dsh: OK pin=${pin.sha.slice(0, 8)} head=${headSha().slice(0, 8)} tree=${treeHash.slice(0, 12)} `
  + `patches=${applied}/${total} dirty=${dirtyCount()} tree=${mib(bytes(VENDOR))} `
  + `elapsed_ms=${Date.now() - started} load1m=${load1m()} cpu=${cpus()}`)
