#!/usr/bin/env node
/**
 * 活体判据：对着**正在跑**的 Xaihi 壳验 0001/0002/0003 的运行时行为。
 *
 * 前置：壳已经起来并开着主进程 inspector（上游 dev 启动器默认 9229），并且那个 profile 里装了 Xaihi：
 *   DSH_HOME=<隔离 home> XAIHI_DESKTOP_PROFILE=<profile 名> \\
 *     pnpm --filter @deepseek-ai/dsh-desktop exec tsx scripts/dev.ts --skip-build
 * 判据：node desktop/live-check.mjs [--port 9229]
 *
 * 为什么走主进程：renderer 的 CDP（9222）要 `--remote-allow-origins`，上游启动器不给，WS 会挂；
 * 主进程 inspector 没有那道闸，而且能直接数窗口——比数 target 硬。
 * 为什么 createRequire：主进程是 ESM 入口，inspector 求值域里没有 require/module，
 * `import()` 报 "A dynamic import callback was not specified"；`process.getBuiltinModule('module')` 是唯一路子。
 */

const portArg = process.argv.indexOf('--port')
const PORT = portArg === -1 ? 9229 : Number(process.argv[portArg + 1])
const ELECTRON = `process.getBuiltinModule('module').createRequire(process.cwd() + '/probe.js')('electron')`

const targets = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json()
const target = targets.find((t) => typeof t.webSocketDebuggerUrl === 'string')
if (target === undefined) {
  console.error(`live-check: ${String(PORT)} 上没有可连的 target ⇒ 壳没起来，或 inspector 端口不对`)
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('inspector ws 连不上')) })
let seq = 0
const pending = new Map()
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  const settle = pending.get(msg.id)
  if (settle !== undefined) { pending.delete(msg.id); settle(msg) }
}
const send = (method, params) => new Promise((resolve) => {
  const id = ++seq
  pending.set(id, resolve)
  ws.send(JSON.stringify({ id, method, params }))
})
const EVAL_TIMEOUT_MS = 30_000
async function evaluateMain (expression) {
  // 宿主起不来的时候 executeJavaScript 会永远挂着；判据必须自己超时并报警，
  // 否则"没结论"会被读成"没失败"。
  const timer = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), EVAL_TIMEOUT_MS))
  const reply = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), timer])
  if (reply?.timeout === true) return { ok: false, text: `求值超时（${String(EVAL_TIMEOUT_MS / 1000)} 秒）⇒ 宿主或文档没到 ready` }
  const detail = reply.result?.exceptionDetails
  if (detail !== undefined) {
    return { ok: false, text: detail.exception?.description?.split('\n')[0] ?? detail.text ?? 'unknown' }
  }
  return { ok: true, value: reply.result?.result?.value }
}

// A 段：真产品文档上，0001 的面必须在场，0002 必须按原因拒绝（这里的发起者不是 Xaihi 文档）。
const A = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const app = wins.filter((w) => w.webContents.getURL().startsWith('dsh-app://app/'))
  if (app.length === 0) return { windows: wins.map((w) => w.webContents.getURL()), appCount: 0 }
  const wc = app[0].webContents
  return {
    windows: wins.map((w) => w.webContents.getURL()),
    appCount: app.length,
    protocolVersion: await wc.executeJavaScript('window.dshDesktop?.protocolVersion ?? null', true),
    browserMember: await wc.executeJavaScript('typeof window.dshDesktop?.browser', true),
    xaihiWindowMember: await wc.executeJavaScript('typeof window.dshDesktop?.xaihiWindow', true),
    openIsFunction: await wc.executeJavaScript('typeof window.dshDesktop?.xaihiWindow?.open', true),
    denyBranch: await wc.executeJavaScript('window.dshDesktop.xaihiWindow.open("findz").then(() => "RESOLVED", (e) => "REJECTED: " + String(e && e.message ? e.message : e))', true),
  }
})()`)
console.log('A 段（真产品文档）⇒ ' + JSON.stringify(A))

// B 段：Xaihi 的**真文档**。先读 manifest 拿真 rev（0003 选中的 profile 里有 xaihi-core 才有这条），
// 再导过去确认它真是 Xaihi 的文档壳，然后开第二窗并验那一个窗里跑的也是 Xaihi。
const B = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  const all = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const app = all().find((w) => w.webContents.getURL() === 'dsh-app://app/'
    || w.webContents.getURL().startsWith('dsh-app://app/xaihi/ui/'))
  if (app === undefined) return { skipped: '没有 app 文档' }
  const manifest = await app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => ({ status: r.status, body: r.status === 200 ? await r.json() : null }))", true)
  if (manifest.status !== 200) return { manifestStatus: manifest.status, reason: 'profile 里没有 xaihi-core 或路由没挂上' }
  // 必须用服务端自己给的 ui.documentUrl：manifest 顶层 rev 是插件/远端那一层，
  // UI 产物的 rev 是 computeRev(uiBundleDir)，两个不是一回事（踩过：拿错 rev 会得到 "rev mismatch"）。
  const uiRev = manifest.body.ui?.rev
  const documentPath = manifest.body.ui?.documentUrl
  const node = manifest.body.plugins[0].manifest.id
  const before = all().length
  const docUrl = 'dsh-app://app' + documentPath + '?node=' + node
  const loaded = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL(docUrl)
  await loaded
  const opener = {
    url: app.webContents.getURL(),
    xaihiGlobal: await app.webContents.executeJavaScript('typeof globalThis.__XAIHI__', true),
    entryScript: await app.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('script')).map((s) => s.getAttribute('src')).join(',')", true),
    text: await app.webContents.executeJavaScript("document.body ? document.body.innerText.replace(/\\s+/g, ' ').slice(0, 80) : ''", true),
  }
  const res = await app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(node) + ')'
    + '.then((r) => "RESOLVED windowId=" + r.windowId, (e) => "REJECTED: " + String(e && e.message ? e.message : e))', true)
  await new Promise((r) => setTimeout(r, 1500))
  const list = all()
  const child = list.find((w) => w !== app && w.webContents.getURL().includes('node=' + node))
  const childProbe = child === undefined ? null : {
    url: child.webContents.getURL(),
    xaihiGlobal: await child.webContents.executeJavaScript('typeof globalThis.__XAIHI__', true),
    entryScript: await child.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('script')).map((s) => s.getAttribute('src')).join(',')", true),
    text: await child.webContents.executeJavaScript("document.body ? document.body.innerText.slice(0, 60) : ''", true),
  }
  if (child !== undefined) child.close()
  await app.webContents.loadURL('dsh-app://app/')
  return { uiRev, documentPath, node, before, after: list.length, res, opener, childProbe, docUrl }
})()`)
console.log('B 段（Xaihi 真文档）⇒ ' + JSON.stringify(B))

// C 段：去重。同一个 node 点两次不许叠第二个窗；换一个 node 才该多开一窗。
const C = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  const all = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const app = all().find((w) => w.webContents.getURL().startsWith('dsh-app://app/'))
  if (app === undefined) return { skipped: '没有 app 文档' }
  const manifest = await app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true)
  if (manifest === null) return { skipped: 'manifest 读不到' }
  await app.webContents.loadURL('dsh-app://app' + manifest.ui.documentUrl)
  const call = (node) => app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(node) + ')', true)
  const nodes = manifest.plugins.slice(0, 2).map((p) => p.manifest.id)
  if (nodes.length < 2) return { skipped: '可用 node 不足两个，测不了去重' }
  const first = await call(nodes[0])
  const countAfterFirst = all().length
  const second = await call(nodes[0])
  const countAfterSecond = all().length
  const third = await call(nodes[1])
  const countAfterThird = all().length
  const titled = all().find((w) => w.id === first.windowId)
  const title = titled === undefined ? '' : titled.getTitle()
  for (const w of all()) if (w !== app && w.webContents.getURL().startsWith('dsh-app://app' + manifest.ui.documentUrl)) w.close()
  await app.webContents.loadURL('dsh-app://app/')
  return { nodes, first, second, third, countAfterFirst, countAfterSecond, countAfterThird, title }
})()`)
console.log('C 段（按 node 去重）⇒ ' + JSON.stringify(C))

let failures = 0
const need = (label, pass) => { console.log(`${pass ? 'OK  ' : 'FAIL'} ${label}`); if (!pass) failures += 1 }
const a = A.ok === true ? A.value : {}
const b = B.ok === true ? B.value : {}
need('A: 产品文档在场', a.appCount === 1)
need('A: protocolVersion=1（既有面没被改坏）', a.protocolVersion === 1)
need('A: 对照——既有 browser 成员仍在', a.browserMember === 'object')
need('A: 0001 的 xaihiWindow 在活体上存在', a.xaihiWindowMember === 'object')
need('A: open 是函数', a.openIsFunction === 'function')
need('A: 0002 的拒绝分支按原因被拒', typeof a.denyBranch === 'string' && a.denyBranch.includes('only the Xaihi UI document'))
need('B: manifest 200 且 ui.rev 是 12 位十六进制（0003 选中的 profile 里真有 Xaihi）', typeof b.uiRev === 'string' && /^[0-9a-f]{12}$/u.test(b.uiRev))
need('B: 导的是服务端给的规范文档 URL', typeof b.docUrl === 'string' && b.opener?.url === b.docUrl)
need('B: 文档引的是我们那份入口产物', typeof b.opener?.entryScript === 'string' && b.opener.entryScript.includes('main.js'))
need('B: 文档正文非空（不是 rev mismatch / 503 那种错误页）', typeof b.opener?.text === 'string' && b.opener.text.length > 0)
need('B: open 被放行', typeof b.res === 'string' && b.res.startsWith('RESOLVED'))
need('B: 窗口数 +1', typeof b.before === 'number' && b.after === b.before + 1)
need('B: 第二窗引的也是同一份入口产物', typeof b.childProbe?.entryScript === 'string' && b.childProbe.entryScript.includes('main.js') && b.childProbe?.url === b.docUrl)

const cc = C.ok === true ? C.value : {}
need('C: 第一次是真新建', cc.first?.alreadyOpen === false)
need('C: 同一个 node 第二次不叠窗（计数不变）', cc.countAfterSecond === cc.countAfterFirst)
need('C: 第二次回报 alreadyOpen 且指向同一个窗', cc.second?.alreadyOpen === true && cc.second?.windowId === cc.first?.windowId)
need('C: 换 node 才多开一窗', cc.third?.alreadyOpen === false && cc.countAfterThird === cc.countAfterSecond + 1)
need('C: 窗标题带得出去的 node 名', typeof cc.title === 'string' && cc.title.includes(String(cc.nodes?.[0] ?? '')))

ws.close()
if (failures > 0) {
  console.error(`live-check: ${String(failures)} 条不成立 ⇒ 别把这条写成"实机验过"`)
  if (b.reason !== undefined) console.error(`live-check: B 段没跑成的原因：${b.reason}`)
  process.exit(1)
}
console.log('live-check: 全部判据绿（含对照；B/C 段用的是 Xaihi 真文档，不是合成 URL）')
