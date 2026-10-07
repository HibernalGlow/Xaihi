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

function git (args, { allowFail = false, env = {}, muteStderr = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      env: { ...process.env, ...env },
      // exec* 默认把子进程的 stderr 直接接到父进程，于是"本来就没在 am"这类
      // 预期内的失败会把 git 的 致命错误 打进用户看到的输出里。
      ...(muteStderr ? { stdio: ['ignore', 'pipe', 'pipe'] } : {}),
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

/** 把 (值, 期望) 表跑一遍，返回判错的条目（0004 去重键的对照用）。 */
function tableFilter (fn, table) {
  return table.filter(([value, want]) => fn(value) !== want).map(([value, want]) => `${value}⇒${String(fn(value))}≠${want}`)
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
      git(['-C', VENDOR, 'am', '--abort'], { allowFail: true, muteStderr: true })
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
  const EXPECTED_CHANNELS = 36
  // 0010 那四条通道名要点得出名字：只数条数会漏掉"少一条功能、多一条别的"这种漂移。
  const commandChannels = ['xaihiWindowFocus', 'xaihiWindowClose', 'xaihiWindowGetBounds', 'xaihiWindowSetBounds', 'xaihiWindowCapabilities', 'xaihiWindowFrameChanged',
    'xaihiWindowControlMain', 'xaihiWindowControlComponent', 'xaihiWindowDevTools', 'xaihiWindowStartDragging']
  const missingChannels = commandChannels.filter((name) => probe.DESKTOP_IPC[name] === undefined)
  const gotChannels = Object.keys(probe.DESKTOP_IPC).length
  // 先报现场，再报结论：这条尺红过一次是因为**话术**把"表里少四条"说成"减法对照没落地"，
  // 把人往错方向带 ⇒ 顺序是"现场读数 → 缺哪几条 → 条数对不对 → 最后才做减法对照"。
  console.log(`verify: channels=${String(gotChannels)} want=${want} `
    + `missing_0010=${missingChannels.length === 0 ? 'none' : missingChannels.join(',')} `
    + `has_open=${probe.DESKTOP_IPC.xaihiWindowOpen === want}`)
  if (missingChannels.length > 0) {
    fail(`verify: 0010/0011 的通道缺 ⇒ ${missingChannels.join(', ')}（现读 ${String(gotChannels)} 条，期望 ${String(EXPECTED_CHANNELS)} 条）`)
  }
  if (gotChannels !== EXPECTED_CHANNELS) {
    fail(`verify: IPC 面是 ${String(gotChannels)} 条，期望 ${String(EXPECTED_CHANNELS)} 条 ⇒ 某条 patch 被静默跳过，或上游改了 apps/desktop/src/ipc.ts`)
  }
  if (probe.DESKTOP_IPC.xaihiWindowOpen !== want) {
    fail(`verify: patch 0001 的通道名不是 ${want} ⇒ 它被静默跳过，或上游占了同一个键`)
  }
  // 上游那侧的面不能被我们的 patch 挤掉：`browserAcquire` 是别人在用的键，缺了就是改坏了表。
  if (probe.DESKTOP_IPC.browserAcquire === undefined) {
    fail('verify: IPC 面里少了上游的 browserAcquire ⇒ 我们的 patch 改坏了别人的键')
  }
  // 减法对照（现场完整之后才做）：把那条通道删掉，判据必须说"不满足"，否则它不算尺。
  const mutated = { ...probe.DESKTOP_IPC }
  delete mutated.xaihiWindowOpen
  if (mutated.xaihiWindowOpen !== undefined) fail('verify 是瞎的：删掉 xaihiWindowOpen 之后它还在')
  if (Object.keys(mutated).length !== EXPECTED_CHANNELS - 1) {
    fail(`verify 的减法对照没落地（删一条之后是 ${String(Object.keys(mutated).length)} 条，期望 ${String(EXPECTED_CHANNELS - 1)}）`)
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
    // 0008 把发起者放宽到"产品文档"这一格（被嵌在它里面的 Xaihi 帧只能以它的身份出现）：
    // 这条用例从"拒"改判成"放行"，配套的三条反向用例保证放宽有边界，不是把 opener 判据整条删掉。
    ['产品文档 opener 开自家节点（0008）', { url: `${good}?node=a`, openerUrl: 'dsh-app://app/index.html' }, true],
    ['产品文档根 opener 开自家节点（0008）', { url: `${good}?node=a`, openerUrl: 'dsh-app://app/' }, true],
    ['别的 host 冒充产品文档', { url: `${good}?node=a`, openerUrl: 'dsh-app://shell/index.html' }, false],
    ['产品文档的自家资源路径', { url: `${good}?node=a`, openerUrl: 'dsh-app://app/assets/x.js' }, false],
    ['https 页面冒充产品文档', { url: `${good}?node=a`, openerUrl: 'https://app/index.html' }, false],
    ['多带一个查询键', { url: `${good}?node=a&next=http://evil`, openerUrl: good }, false],
    ['node 含非法字符', { url: `${good}?node=a/../b`, openerUrl: good }, false],
    ['无法解析的串', { url: 'not a url', openerUrl: good }, false],
    ['超长串', { url: `${good}?node=${'a'.repeat(3000)}`, openerUrl: good }, false],
  ]
  const wrong = cases.filter(([name, req, want]) => (policy.resolveXaihiDocumentTarget(req) !== undefined) !== want)
  console.log(`verify: 0002 判策 ${String(cases.length)} 用例，判错 ${String(wrong.length)}（拒绝分支含路径穿越/跨 host/冒充产品文档；0008 的豁免只到产品文档根与 index.html）`)
  if (wrong.length > 0) fail(`verify: 0002 判策与用例表不符 ⇒ ${wrong.map(([n]) => n).join(', ')}`)
  if (policy.resolveXaihiDocumentTarget({ url: 'https://example.com', openerUrl: good }) !== undefined) {
    fail('verify: 0002 的判策是瞎的（外链居然被放行）')
  }
  // 0008 的第二条减法对照：产品文档 opener 也**开不出**非自家文档的目标。
  if (policy.resolveXaihiDocumentTarget({ url: 'dsh-app://app/settings', openerUrl: 'dsh-app://app/' }) !== undefined) {
    fail('verify: 0008 的豁免过头了（产品文档 opener 居然能开自家非文档路径）')
  }
  // 0003 的判策也是纯函数：给了名字走 profiles/<name>，缺省 desktop，坏形状要抛。
  // paths.ts 要 import @deepseek-ai/dsh-home-paths（workspace 包的构建产物），
  // 所以这一段在**没装依赖的干净 clone** 上必然取不到模块 —— 那要报成"未跑"，不许抛栈冒充判据。
  let paths = null
  try {
    paths = await import('./dsh/apps/desktop/src/paths.ts')
  } catch (error) {
    console.log(`verify: 0003 判据**未跑** —— 取不到 apps/desktop/src/paths.ts 的依赖（${String(error).slice(0, 60)}）`
      + ' ⇒ 先在 desktop/dsh 里 pnpm install 并跑 pnpm run build:lib:host'
      + '（workspace 包的 lib/ 是构建产物，deinit 之后不会自己回来）')
  }
  if (paths !== null) {
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
  }

  // 0004 的去重键也是纯函数：node 段决定是不是同一个窗，取不到就退回工作台本身。
  const keyTable = [
    ['dsh-app://app/xaihi/ui/0123456789ab/index.html?node=findz', 'findz'],
    ['dsh-app://app/xaihi/ui/0123456789ab/index.html', 'workspace'],
    ['不合法串', 'workspace'],
  ]
  const keyWrong = tableFilter(policy.xaihiWindowKey, keyTable)
  console.log(`verify: 0004 去重键 ${String(keyTable.length)} 用例，判错 ${String(keyWrong.length)}`)
  if (keyWrong.length > 0) fail(`verify: 0004 的键与用例不符 ⇒ ${String(keyWrong)}`)

  // 0009 的尺寸校验也是纯函数：正控（合法尺寸必须放行，且逐字保留）与反控（半套/小数/字符串/越界一律拒）。
  if (typeof policy.normalizeXaihiWindowSize !== 'function') {
    fail('verify: 0009 的尺寸校验函数不在 apps/desktop/src/xaihi-window-policy.ts 里 ⇒ 那条 patch 被静默跳过或上游改了这模块')
  }
  const sizeTable = [
    [{ width: 1280, height: 820 }, { width: 1280, height: 820 }],
    [{ width: 520, height: 600 }, { width: 520, height: 600 }],
    [{ width: 519, height: 600 }, undefined],
    [{ width: 520, height: 599 }, undefined],
    [{ width: 12001, height: 700 }, undefined],
    [{ width: 900 }, undefined],
    [{ height: 700 }, undefined],
    [{ width: 900.5, height: 700 }, undefined],
    [{ width: '900', height: 700 }, undefined],
    [{}, undefined],
    [undefined, undefined],
    ['a string', undefined],
  ]
  const sizeWrong = sizeTable.filter(([input, want]) => {
    const got = policy.normalizeXaihiWindowSize(input)
    if (want === undefined) return got !== undefined
    return JSON.stringify(got) !== JSON.stringify(want)
  })
  console.log(`verify: 0009 尺寸校验 ${String(sizeTable.length)} 用例，判错 ${String(sizeWrong.length)}`)
  if (sizeWrong.length > 0) {
    fail(`verify: 0009 的尺寸校验与用例不符 ⇒ ${String(sizeWrong.map(([i]) => JSON.stringify(i)).join(', '))}`)
  }
  // 减法对照：合法尺寸被吞（返回 undefined）必须看得见，否则这条尺只会说"不合法"。
  if (policy.normalizeXaihiWindowSize({ width: 1000, height: 900 }) === undefined) {
    fail('verify: 0009 的尺寸校验把合法尺寸也拒了（尺是瞎的）')
  }

  // 0014 的两条纯函数：动作词表（只认基线那五个）与状态归并的**优先级**。
  const actionTable = [
    ['minimize', true], ['maximize', true], ['toggle-fullscreen', true], ['restore', true], ['close', true],
    ['Close', false], ['fullscreen', false], ['hide', false], ['', false], ['minimaze', false],
  ]
  const actionWrong = actionTable.filter(([name, allowed]) => (policy.normalizeXaihiWindowAction(name) !== undefined) !== allowed)
  const stateTable = [
    [{ minimized: true, maximized: true, fullscreen: false }, 'minimized'],
    [{ minimized: true, maximized: false, fullscreen: false }, 'minimized'],
    [{ minimized: false, maximized: true, fullscreen: true }, 'fullscreen'],
    [{ minimized: false, maximized: true, fullscreen: false }, 'maximized'],
    [{ minimized: false, maximized: false, fullscreen: false }, 'normal'],
  ]
  const stateWrong = stateTable.filter(([flags, want]) => policy.xaihiWindowState(flags) !== want)
  console.log(`verify: 0014 动作词 ${String(actionTable.length)} 用例判错 ${String(actionWrong.length)}；状态归并 ${String(stateTable.length)} 用例判错 ${String(stateWrong.length)}`)
  if (actionWrong.length > 0) fail(`verify: 0014 的动作词表与用例不符 ⇒ ${String(actionWrong.map(([n]) => n).join(', '))}`)
  if (stateWrong.length > 0) fail(`verify: 0014 的状态优先级与用例不符 ⇒ ${String(stateWrong.map(([f]) => JSON.stringify(f)).join(', '))}`)

  // 0011 的协商形状：逐字段照基线，且**没给位置就不许造一个位置出来**。
  const capsInset = policy.xaihiWindowCapabilities('inset', { x: 16, y: 18 })
  const capsOverlay = policy.xaihiWindowCapabilities('overlay')
  const capsNoInset = policy.xaihiWindowCapabilities('inset')
  console.log(`verify: 0011 协商 inset=${capsInset.captionOwner}/${capsInset.captionInset ? '有位置' : '无位置'}`
    + ` overlay=${capsOverlay.captionOwner}/${capsOverlay.captionInset === undefined ? '无位置(对)' : '有位置(错)'}`
    + ` 缺位置时=${capsNoInset.captionInset === undefined ? '不编造(对)' : '编造了(错)'}`
    + ` 寻址条数消息=${JSON.stringify(capsInset.message)}`)
  if (capsInset.captionOwner !== 'system') fail('verify: 0011 mac 的 hiddenInset 该报 captionOwner=system（否则界面会再画一套窗控）')
  if (capsInset.captionInset?.x !== 16 || capsInset.captionInset?.y !== 18) fail('verify: 0011 的 captionInset 没跟着 insets 形状走')
  if (capsOverlay.captionOwner !== 'renderer') fail('verify: 0011 Windows 的 titleBarOverlay 该报 renderer')
  if (capsOverlay.captionInset !== undefined) fail('verify: 0011 给 overlay 窗编了一个红绿灯位置')
  if (capsNoInset.captionInset !== undefined) fail('verify: 0011 位置没给也照样报了一个（编数据）')
  if (capsInset.componentWindows !== 'native' || capsInset.supported !== true) fail('verify: 0011 的基本能力位不对')
  if (!capsInset.message.includes('focus, close, getBounds, setBounds')) fail('verify: 0011 的消息里没写出那四条寻址动词')

  // 0010 的矩形校验：坐标与尺寸都得是整数，尺寸那一半复用 0009 的上下界（别在两处各写一遍数）。
  const boundsTable = [
    [{ x: 40, y: 60, width: 1000, height: 800 }, { x: 40, y: 60, width: 1000, height: 800 }],
    [{ x: -1200, y: 0, width: 1000, height: 800 }, { x: -1200, y: 0, width: 1000, height: 800 }],
    [{ x: 40.5, y: 60, width: 1000, height: 800 }, undefined],
    [{ y: 60, width: 1000, height: 800 }, undefined],
    [{ x: '40', y: 60, width: 1000, height: 800 }, undefined],
    [{ x: 200000, y: 60, width: 1000, height: 800 }, undefined],
    [{ x: 40, y: 60, width: 400, height: 800 }, undefined],
    [undefined, undefined],
  ]
  const boundsWrong = boundsTable.filter(([input, want]) => {
    const got = policy.normalizeXaihiWindowBounds(input)
    if (want === undefined) return got !== undefined
    return JSON.stringify(got) !== JSON.stringify(want)
  })
  console.log(`verify: 0010 矩形校验 ${String(boundsTable.length)} 用例，判错 ${String(boundsWrong.length)}`)
  if (boundsWrong.length > 0) {
    fail(`verify: 0010 的矩形校验与用例不符 ⇒ ${String(boundsWrong.map(([i]) => JSON.stringify(i)).join(', '))}`)
  }

  // 产物判据之前的一条源码尺：客户端面（tsconfig.client.json）把 apps/desktop/src 的文件**逐个**
  // 登记在 include 里，所以一条新的相对 import 会带来一个未登记的文件 —— 实测就是冷重放里
  // `pnpm run build` 报 TS6307 的那一条（0011 让 ipc.ts import type 这份纯模块，却没登记它）。
  // 判据写成一般形式：登记清单里每个 desktop/src 种子文件，其相对 import 的目标也必须在清单里。
  // 上游五个种子文件实测违规 0 条，所以这条尺不是我给自己加的额外红线，是上游的规矩。
  const clientProject = join(VENDOR, 'tsconfig.client.json')
  if (!existsSync(clientProject)) fail('verify: 读不到 tsconfig.client.json ⇒ 上游改了这个面，判据要跟着重写')
  const listed = JSON.parse(readFileSync(clientProject, 'utf8').replace(/^\s*\/\/.*$/gm, ''))
    .include.filter((entry) => !entry.includes('*'))
  // 目标存在才算数（清单里的 glob 与 d.ts 例外）；只比 desktop/src 的种子，别的面的文件由通配覆盖。
  const unlistedImports = (list) => {
    const known = new Set(list.map((entry) => resolve(VENDOR, entry)))
    const seeds = list.filter((entry) => entry.startsWith('apps/desktop/src/'))
    const offenders = []
    for (const seed of seeds) {
      const source = existsSync(resolve(VENDOR, seed)) ? readFileSync(resolve(VENDOR, seed), 'utf8') : ''
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/gu)) {
        const target = resolve(VENDOR, dirname(seed), match[1])
        if (!existsSync(target) || known.has(target)) continue
        offenders.push(`${seed.split('/').pop()} -> ${target.split('/').pop()}`)
      }
    }
    return offenders
  }
  const offenders = unlistedImports(listed)
  // 减法对照：把那份纯模块的登记摘掉，同一条扫描必须点得出它的名字，否则这把尺看不见违规。
  const control = unlistedImports(listed.filter((entry) => !entry.endsWith('xaihi-window-policy.ts')))
  if (!control.some((o) => o.includes('xaihi-window-policy.ts'))) fail('verify: 文件登记尺是瞎的（摘掉 xaihi-window-policy.ts 的登记后点不出它）')
  console.log(`verify: 客户端面文件登记 种子=${String(listed.filter((e) => e.startsWith('apps/desktop/src/')).length)}`
    + ` 未登记=${String(offenders.length)}${offenders.length > 0 ? `（${offenders.join(', ')}）` : ''}`
    + ` control_after_unlist=${String(control.length)}`)
  if (offenders.length > 0) {
    fail(`verify: 有 desktop/src 文件被 import 却没进 tsconfig.client.json ⇒ pnpm run build 会 TS6307：${offenders.join(', ')}`)
  }

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
    const policyWired = mainJs.includes('resolveXaihiDocumentTarget') && mainJs.includes('xaihiWindowKey')
    const inPreload = preload.includes(want)
    // 减法对照：一个不存在的通道名必须两个产物都找不到，否则这判据是白名单式的假绿。
    const ghost = mainJs.includes('dsh-desktop:xaihi-window-DOES-NOT-EXIST') || preload.includes('dsh-desktop:xaihi-window-DOES-NOT-EXIST')
    console.log(`verify: 产物 main.js=${String(inMain)} preload-app.cjs=${String(inPreload)} ghost_absent=${String(!ghost)}`)
    const profileWired = mainJs.includes('XAIHI_DESKTOP_PROFILE')
    // 0005 放宽的是"谁可以问"，0006 保住的是"窗标题带 node"：两条都必须在产物里点得到名，
    // 不然 patch .series 绿而壳里跑的是旧的那份（实机栽过一次：系列重放成功但 lib/ 是旧的）。
    const senderWired = mainJs.includes('function xaihiOwnedSender') && mainJs.includes('unowned renderer')
    // 0007 那条分支的判据必须点名"路径自己校验"，否则产品文档转达的那一路悄悄退回旧形状。
    const panelWired = mainJs.includes('document path must match') && mainJs.includes('isMainDocument')
    const commandWired = mainJs.includes('xaihiWindowSetBounds') && mainJs.includes('unknown window')
    const capsWired = mainJs.includes('nativeWindowControls') && mainJs.includes('xaihiCaptionKinds')
    // 0012 的推送:发信口与两个挂点都得在产物里,少一个就是"订阅了但永远不响"。
    const frameWired = mainJs.includes('xaihiFrameSink') && mainJs.includes('publishFrame')
      && mainJs.includes('xaihiWindowFrameChanged')
    // 0014：三条能做的 + 一条老实回 unsupported 的，都要在产物里点得到名。
    const controlWired = mainJs.includes('applyXaihiWindowAction') && mainJs.includes('hide-on-close')
      && mainJs.includes('system-framed here') && mainJs.includes('fullscreen did not engage')
    // 0006 只在这个函数体里查：整个 bundle 里 "page-title-updated" 是上游自己也用的词，
    // 全局搜会得到一个与我的改动无关的绿 —— 减法对照实测就抓到了这一点（摘掉 0006 重建产物，
    // main.js 里仍有 1 处 page-title-updated，来自别的上游模块被打包进来）。
    // 词的形状也不可靠：打包器把单引号规范成双引号，所以只搜词本身。
    const docStart = mainJs.indexOf('function openXaihiDocumentWindow')
    const docRelEnd = docStart === -1 ? -1 : mainJs.slice(docStart).search(/\n\}/u)
    const docFn = docStart !== -1 && docRelEnd > 0 ? mainJs.slice(docStart, docStart + docRelEnd) : ''
    const titleWired = docFn.includes('page-title-updated') && docFn.includes('preventDefault')
    const titleControl = docFn.replace('page-title-updated', 'page-title-removed-for-control').includes('page-title-updated')
    console.log(`verify: 0002 已接进 bundle=${String(policyWired)} 0003 已接进 bundle=${String(profileWired)}`
      + ` 0005 已接进 bundle=${String(senderWired)} 0006 已接进 bundle=${String(titleWired)}`
      + ` 0007 已接进 bundle=${String(panelWired)} 0010 已接进 bundle=${String(commandWired)}`)
    if (!profileWired) fail('verify: 0003 没进 lib/main.js ⇒ 又是只跑 tsc 没跑 bundle')
    if (!senderWired) fail('verify: 0005 的发起者判据没进 lib/main.js ⇒ 产物比系列旧')
    if (!panelWired) fail('verify: 0007 的产品文档转达分支没进 lib/main.js ⇒ 产物比系列旧')
    if (!commandWired) fail('verify: 0010 的寻址四条没进 lib/main.js ⇒ 产物比系列旧')
    if (!capsWired) fail('verify: 0011 的协商那条没进 lib/main.js ⇒ 产物比系列旧')
    if (!frameWired) fail('verify: 0012 的尺寸推送没进 lib/main.js ⇒ 订阅了也不会响')
    if (!controlWired) fail('verify: 0014 的窗控四条没进 lib/main.js ⇒ 产物比系列旧')
    if (titleControl) fail('verify: 0006 的判据是瞎的（抹掉那一行还读得到）')
    if (!titleWired) fail('verify: 0006 的标题保护没进 lib/main.js 的 openXaihiDocumentWindow ⇒ 产物比系列旧')
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
  git(['-C', VENDOR, 'am', '--abort'], { allowFail: true, muteStderr: true })
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
