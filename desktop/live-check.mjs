#!/usr/bin/env node
/**
 * 活体判据：对着**正在跑**的 Xaihi 壳验 0001/0002/0003/0004/0005 的运行时行为。
 *
 * 前置：壳已经起来并开着主进程 inspector（上游 dev 启动器默认 9229），并且那个 profile 里装了 Xaihi：
 *   node desktop/dev-shell.mjs launch --home ../.scratch/dsh-xaihi-desktop-home3
 * 判据：node desktop/live-check.mjs [--port 9229]
 *
 * 为什么走主进程：renderer 的 CDP（9222）要 `--remote-allow-origins`，上游启动器不给，WS 会挂；
 * 主进程 inspector 没有那道闸，而且能直接数窗口——比数 target 硬。
 * 为什么 createRequire：主进程是 ESM 入口，inspector 求值域里没有 require/module，
 * `import()` 报 "A dynamic import callback was not specified"；`process.getBuiltinModule('module')` 是唯一路子。
 *
 * 两条从实机踩回来的纪律，写在判据自己的形状上：
 * 1. 认"自家文档窗"不许只看 URL。0004 的 open 是 `void window.loadURL(target)` 后立即返回，
 *    刚建出来的窗这一刻 `getURL()` 还是空串；按 URL 前缀清场就会留下这种窗，
 *    下一段拿同一个 node 再问就被去重复用，把"这次真的多开了窗"读成"没多开"（实机：countBefore=countAfter=4）。
 *    标题是 `openXaihiDocumentWindow` 当场 setTitle 的，与导航无关 ⇒ 标题为主判据、URL 为副判据。
 * 2. 主窗导航只放在开头复位段做，不放收尾。上游对主框 `did-fail-load`（除 -3）一律
 *    `reportFatal → recovery`（main.ts:1170-1174），紧跟一串 close 之后导航真的会失败并整壳进恢复态
 *    （实机：ERR_FAILED (-2) 之后 BrowserWindow.getAllWindows() 为空）。收尾只做 show/close 自己开的窗。
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

// 每段共用的现场判据：谁是自家文档窗、谁是产品主窗。
// 主窗取 dsh-app 窗里 **id 最小**的那个（我们的窗永远是后建的，id 更大）。
// 不能按 `getAllWindows()` 的列表顺序取：实测那个顺序不等于创建顺序，
// 于是"刚关掉的那个正在销毁的窗"会被当成主窗 —— 对它的 `executeJavaScript`
// 的 promise 永不落地（A/B 实测：列表法 4 轮里 3 轮 15 s TIMEOUT、1 轮
// `TypeError: Object has been destroyed`；按 id 法 4 轮全 22–27 ms）。
const SCAN = `
  const all = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const isOwnedDocWindow = (w) => String(w.getTitle()).startsWith('Xaihi ')
    || w.webContents.getURL().includes('/xaihi/ui/')
  const appWindows = () => all().filter((w) => w.webContents.getURL().startsWith('dsh-app://app/')).sort((a, b) => a.id - b.id)
  const main = () => appWindows()[0]
  // "自家开出去的窗"要排除主窗：主窗自己就停在文档 URL 上（决定 2 的那一个 Xaihi 文档），
  // 把它算进残留就是把"应该在场"读成"没清干净"（实机 C 段 ownedLeft=1 就是这么来的）。
  const openedWins = () => all().filter((w) => w !== main() && isOwnedDocWindow(w))
`

// R 段：复位。关掉所有自家开出去的文档窗，把主窗带回产品文档根，并确认它真的回了。
// 导航放在这里而不是收尾：这一刻没有并发的 close，主框导航不会撞上游的恢复态。
const R = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  const app = main()
  if (app === undefined) return { windows: all().map((w) => w.webContents.getURL()), reopened: false }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 800))
  app.show()
  let navigated = 'not-needed'
  let threw = 'no'
  if (app.webContents.getURL() !== 'dsh-app://app/') {
    const settled = new Promise((r) => {
      app.webContents.once('did-finish-load', () => r('loaded'))
      app.webContents.once('did-fail-load', (_e, code, desc) => r('failed ' + String(code) + ' ' + desc))
    })
    try { await app.webContents.loadURL('dsh-app://app/') } catch (error) { threw = String(error) }
    navigated = await Promise.race([settled, new Promise((r) => setTimeout(() => r('timeout'), 6000))])
  }
  return {
    windows: all().map((w) => w.webContents.getURL()),
    reopened: true,
    navigated,
    threw,
    url: app.webContents.getURL(),
    ownedLeft: openedWins().length,
  }
})()`)
console.log('R 段（复位）⇒ ' + JSON.stringify(R))

// A 段：真产品文档上，0001 的面必须在场，0002 必须按原因拒绝（这里的发起者不是 Xaihi 文档）。
const A = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  const app = main()
  if (app === undefined) return { windows: all().map((w) => w.webContents.getURL()), appCount: 0 }
  const wc = app.webContents
  return {
    windows: all().map((w) => w.webContents.getURL()),
    appCount: appWindows().length,
    mainUrl: wc.getURL(),
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
  ${SCAN}
  const app = main()
  if (app === undefined) return { reopened: false, reason: '没有产品主窗 ⇒ 重新起壳' }
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
  const opened = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL(docUrl)
  await opened
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
  const childId = child === undefined ? -1 : child.id
  if (child !== undefined) child.close()
  return { uiRev, documentPath, node, before, after: list.length, res, opener, childProbe, docUrl, childId }
})()`)
console.log('B 段（Xaihi 真文档）⇒ ' + JSON.stringify(B))

// C 段：去重。同一个 node 点两次不许叠第二个窗；换一个 node 才该多开一窗。
// 拆成一次一个 evaluate，且每个可能不落地的 await 都在页内套超时：
// 整块跑时任何一步挂住只会得到"求值超时"，无法归因（实机连撞两次，第二次才逼出这个形状）。
const TIMED = `
  const timed = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => ({ __timeout: tag }), ms))])
`
const C_STEPS = []
const cStep = async (label, expression) => {
  const r = await evaluateMain(`(async () => {
    const { BrowserWindow } = ${ELECTRON}
    ${SCAN}
    ${TIMED}
    ${expression}
  })()`)
  C_STEPS.push({ label, ...r })
  if (r.ok !== true) console.log(`C 段卡在 ${label} ⇒ ${String(r.text)}`)
  return r
}
const cManifest = await cStep('manifest（在产品文档里 fetch）', `
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  const got = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : { __status: r.status })", true), 8000, 'fetch')
  return {
    url: app.webContents.getURL(),
    got: got && got.__timeout !== undefined ? 'TIMEOUT' : (got && got.__status !== undefined ? 'HTTP ' + String(got.__status) : 'ok'),
    documentUrl: got && got.ui ? got.ui.documentUrl : null,
    nodes: got && got.plugins ? got.plugins.slice(0, 2).map((p) => p.manifest.id) : null,
  }
`)
const cNav = cManifest.ok === true && typeof cManifest.value.documentUrl === 'string'
  ? await cStep('导航到文档（不带 node）', `
  const app = main()
  const docUrl = ${JSON.stringify(cManifest.value.documentUrl)}
  const urlBefore = app.webContents.getURL()
  const finished = timed(new Promise((r) => app.webContents.once('did-finish-load', () => r('did-finish-load'))), 8000, 'did-finish-load')
  const raw = urlBefore.endsWith(docUrl) ? 'already' : app.webContents.loadURL('dsh-app://app' + docUrl)
  const nav = raw === 'already' ? 'already' : await timed(raw, 8000, 'loadURL')
  return {
    urlBefore,
    nav: nav === undefined ? 'resolved' : (nav && nav.__timeout !== undefined ? 'TIMEOUT ' + String(nav.__timeout) : 'other'),
    settled: await finished,
    urlAfter: app.webContents.getURL(),
    count: all().length,
    owned: openedWins().length,
  }
`) : { ok: false, text: 'manifest 那步没拿到 documentUrl' }
const cCalls = cNav.ok === true
  ? await cStep('三次 open（同 node 两次 + 换 node 一次）', `
  const app = main()
  const nodes = ${JSON.stringify(cManifest.value.nodes)}
  if (nodes === null || nodes.length < 2) return { skipped: '可用 node 不足两个，测不了去重' }
  const call = (node) => timed(app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(node) + ')', true), 8000, 'open:' + node)
  const first = await call(nodes[0])
  const countAfterFirst = all().length
  const second = await call(nodes[0])
  const countAfterSecond = all().length
  const third = await call(nodes[1])
  const countAfterThird = all().length
  const titled = all().find((w) => w.id === (first && first.windowId))
  return { nodes, first, second, third, countAfterFirst, countAfterSecond, countAfterThird,
    title: titled === undefined ? '' : titled.getTitle() }
`) : { ok: false, text: '导航那步没回来' }
const cClean = cCalls.ok === true && cCalls.value.first !== undefined && cCalls.value.first.windowId !== undefined
  ? await cStep('清场（按 id + 标题认自家窗）', `
  const app = main()
  const openedIds = ${JSON.stringify([cCalls.value.first.windowId, cCalls.value.second && cCalls.value.second.windowId, cCalls.value.third && cCalls.value.third.windowId])}
  // 清场按标题认（0004/0006 建窗当场 setTitle），不按还没提交的 URL 认；
  // 上一版就是这里漏掉了 nodes[1] 那个窗，D 段才被去重复用。
  for (const w of all()) {
    if (w === app) continue
    if (openedIds.includes(w.id) || isOwnedDocWindow(w)) w.close()
  }
  await new Promise((r) => setTimeout(r, 800))
  return { ownedLeft: openedWins().length, count: all().length }
`) : { ok: false, text: 'open 那步没跑' }
const C = { ok: cCalls.ok === true, value: cCalls.ok === true
  ? { ...cCalls.value, nodes: cManifest.value.nodes, ownedLeft: cClean.ok === true ? cClean.value.ownedLeft : -1 }
  : {} }
console.log('C 段（按 node 去重）⇒ ' + JSON.stringify(C))
console.log('C 段分步读数 ⇒ ' + JSON.stringify(C_STEPS.map((s) => ({ label: s.label, ok: s.ok, value: s.value ?? null, text: s.text ?? null }))))

// D 段：主窗只是"隐藏"（上游 main.ts:1145-1153 的 hide-on-close），节点窗还在前台 ——
// 那时必须还能从节点窗继续开；并且把那个窗导到非自家路径后再问，仍要被形状守卫拒
// （0005 放宽的只有"谁可以问"，不是"问什么都行"）。
const D = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  const manifest = await app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true)
  if (manifest === null) return { skipped: 'manifest 读不到' }
  const docUrl = 'dsh-app://app' + manifest.ui.documentUrl
  const nodes = manifest.plugins.slice(0, 2).map((p) => p.manifest.id)
  if (nodes.length < 2) return { skipped: '可用 node 不足两个' }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 800))
  const opened = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL(docUrl)
  await opened
  const first = await app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(nodes[0]) + ')', true)
  const child = all().find((w) => w.id === first.windowId)
  if (child === undefined) return { skipped: '第一个节点窗没开出来' }
  app.hide()
  const mainHiddenWhileAsking = !app.isVisible()
  const idsBefore = all().map((w) => w.id)
  const fromChild = await child.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(nodes[1]) + ')'
    + '.then((r) => ({ kind: "opened", windowId: r.windowId, alreadyOpen: r.alreadyOpen }),'
    + ' (e) => ({ kind: "rejected", message: String(e && e.message ? e.message : e) }))', true)
  await new Promise((r) => setTimeout(r, 900))
  // 计数就在这里取：后面的 control 导航和收尾 close 都会动窗口数，
  // 到 return 时才 all().length 量到的就不是"那一次开没开出窗"了（实机读到过 4→2）。
  const live = all()
  const countAfter = live.length
  const created = live.filter((w) => !idsBefore.includes(w.id))
  const createdWindow = created.length === 1 ? created[0] : undefined
  const createdProbe = createdWindow === undefined ? null : {
    windowId: createdWindow.id,
    title: createdWindow.getTitle(),
    url: createdWindow.webContents.getURL(),
  }
  let control = 'no-second-window'
  if (createdWindow !== undefined) {
    const leave = new Promise((r) => createdWindow.webContents.once('did-finish-load', r))
    try { await createdWindow.webContents.loadURL('dsh-app://app/index.html') } catch { /* 导航被拒也要继续问一次 */ }
    await Promise.race([leave, new Promise((r) => setTimeout(r, 2500))])
    control = await createdWindow.webContents.executeJavaScript(
      'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(nodes[0]) + ')'
      + '.then(() => "RESOLVED-BAD", (e) => "REJECTED: " + String(e && e.message ? e.message : e))', true)
  }
  // 收尾只做两件事：关掉自己开的窗、把主窗 show 回来。不导航主窗（见文件头第 2 条）。
  for (const w of all()) {
    if (w === app) continue
    if ((createdWindow !== undefined && w.id === createdWindow.id) || isOwnedDocWindow(w)) w.close()
  }
  app.show()
  // close 是异步销毁：不等一下就地数，读到的"残留"其实是自己刚按下的那一下（实机 red 过一次）。
  await new Promise((r) => setTimeout(r, 800))
  return {
    nodes, first, mainHiddenWhileAsking, fromChild, control,
    countBefore: idsBefore.length, countAfter, createdProbe,
    ownedLeft: openedWins().length,
  }
})()`)
console.log('D 段（主窗隐藏后由节点窗继续开 + 形状守卫仍在）⇒ ' + JSON.stringify(D))

// E 段：0002 的真路 —— 页面自己 window.open。判据要同时证两件事：
// 原生窗真的出来了，而**弹出窗没有**（handler 返回 deny ⇒ window.open 必须给回 null）。
// 只证前者会漏掉"两条路各开一个窗"这种叠窗缺陷；只证后者会漏掉"deny 掉了但也没开原生窗"。
const E = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 500))
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const nodes = manifest.plugins.map((p) => p.manifest.id)
  const docPath = manifest.ui.documentUrl
  const target = 'dsh-app://app' + docPath + '?node=' + (nodes[1] ?? nodes[0])
  const urlOf = (u) => 'dsh-app://app' + docPath + '?node=' + u
  const opened = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL(urlOf(nodes[0]))
  await Promise.race([opened, new Promise((r) => setTimeout(r, 6000))])
  const idsBefore = all().map((w) => w.id)
  // 一次调用里同时拿回 window.open 的返回值和窗口数变化：分两次求值中间可能被别的销毁插进来。
  const res = await app.webContents.executeJavaScript(
    '(() => { const w = window.open(' + JSON.stringify(target) + '); return { popup: w === null ? "null" : (w ? "object" : String(w)) } })()', true)
  await new Promise((r) => setTimeout(r, 900))
  const created = all().filter((w) => !idsBefore.includes(w.id))
  const nativeProbe = created.length === 1 ? { windowId: created[0].id, title: created[0].getTitle(), url: created[0].webContents.getURL() } : null
  // 对照：自家但**不是文档**的路径不许长出窗。
  // 外链那条对照不在活体上跑——判策命中后走的是 shell.openExternal，会真打开使用者的浏览器；
  // 它的拒绝分支已经有单元用例（--verify 的 11 条），这里不重复取证。
  const innerIds = all().map((w) => w.id)
  const inner = await app.webContents.executeJavaScript(
    '(() => { const w = window.open("dsh-app://app/index.html"); return w === null ? "null" : "object" })()', true)
  await new Promise((r) => setTimeout(r, 700))
  const innerCreated = all().filter((w) => !innerIds.includes(w.id)).length
  for (const w of all()) {
    if (w === app) continue
    if (isOwnedDocWindow(w) || created.some((c) => c.id === w.id)) w.close()
  }
  await new Promise((r) => setTimeout(r, 800))
  return { target, res, nativeProbe, createdCount: created.length, inner, innerCreated, ownedLeft: openedWins().length }
})()`)
console.log('E 段（页面自己 window.open 走原生窗）⇒ ' + JSON.stringify(E))

// F 段：界面上的退化读回（ADR-0011 决定 4 要求"读得回来"，不是产物里有定义）。
// 反向对照走 iframe 那一格：同一份文档嵌进 `<iframe>` 后 `window.parent !== window`，
// 文案必须换分支 —— 否则 F 读到的那句可以是一条写死的字符串。
const F = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const node = manifest.plugins[0].manifest.id
  const docUrl = 'dsh-app://app' + manifest.ui.documentUrl + '?node=' + node
  const opened = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL(docUrl)
  await Promise.race([opened, new Promise((r) => setTimeout(r, 6000))])
  const READ = "(() => { const el = document.querySelector('[data-xaihi-window-capability]'); const box = document.querySelector('[data-xaihi-realm-probe]'); return { attr: el ? el.getAttribute('data-xaihi-window-capability') : null, text: el ? el.textContent : null, probe: box ? box.textContent.slice(0, 40) : null, surface: typeof (window.dshDesktop && window.dshDesktop.xaihiWindow) } })()"
  const top = await app.webContents.executeJavaScript(READ, true)
  // 这里不许用嵌套模板字符串：外层本身就是模板，反引号会把它截断（实机炸过一次，rc=1 且没跑判据）。
  const NESTED = "(() => new Promise((res) => {"
    + " const frame = document.createElement('iframe');"
    + " frame.style.cssText = 'position:fixed;left:-4000px;width:600px;height:400px';"
    + " frame.addEventListener('load', () => { setTimeout(() => {"
    + " try { const el = frame.contentDocument.querySelector('[data-xaihi-window-capability]');"
    + " res({ attr: el ? el.getAttribute('data-xaihi-window-capability') : null, text: el ? el.textContent : null });"
    + " } catch (error) { res({ error: String(error).slice(0, 80) }); } frame.remove(); }, 1800); }, { once: true });"
    + " frame.src = " + JSON.stringify(docUrl) + ";"
    + " document.body.appendChild(frame);"
    + " }))()"
  const nested = await app.webContents.executeJavaScript(NESTED, true)
  return { node, docUrl, top, nested }
})()`)
console.log('F 段（屏幕上的退化读回）⇒ ' + JSON.stringify(F))

// H 段：0007 的那一格 —— 被嵌在产品文档里的 Xaihi 帧自己没有 preload（实测子帧
// `typeof contentWindow.dshDesktop === 'undefined'`），所以那一层的"开独立窗"必须由产品文档转达。
// 判据同时钉住转达分支的三条边界：路径必须过自家路由形状、缺路径时旧拒绝仍在、去重照旧生效。
const H = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 500))
  const finished = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL('dsh-app://app/')
  await Promise.race([finished, new Promise((r) => setTimeout(r, 6000))])
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const nodes = manifest.plugins.map((p) => p.manifest.id)
  const docPath = manifest.ui.documentUrl
  // 0009 之后动词收的是 input 对象；这里把 path 包一层，调用点仍按"给不给路径"两格写。
  const ask = (node, path) => app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(node) + ', '
    + (path === undefined ? 'undefined' : JSON.stringify({ documentPath: path })) + ')'
    + '.then((r) => ({ kind: "opened", windowId: r.windowId, alreadyOpen: r.alreadyOpen }),'
    + ' (e) => ({ kind: "rejected", message: String(e && e.message ? e.message : e) }))', true)
  // 子帧那一格的现场读数（不当判据：那是 Electron 的 preload 归属，不是我们的缺陷）
  const frameProbe = await app.webContents.executeJavaScript(
    "(() => new Promise((res) => { const f = document.createElement('iframe');"
    + " f.style.cssText = 'position:fixed;left:-4000px;width:400px;height:300px';"
    + " f.addEventListener('load', () => setTimeout(() => {"
    + " res({ dshDesktop: typeof f.contentWindow.dshDesktop, url: f.contentWindow.location.href.slice(0, 60) });"
    + " f.remove(); }, 500), { once: true });"
    + " f.src = " + JSON.stringify('dsh-app://app' + docPath + '?node=' + nodes[0]) + "; document.body.appendChild(f); }))()", true)
  const idsBefore = all().map((w) => w.id)
  const opened = await ask(nodes[1], docPath)
  await new Promise((r) => setTimeout(r, 900))
  const created = all().filter((w) => !idsBefore.includes(w.id))
  const createdProbe = created.length === 1 ? { windowId: created[0].id, url: created[0].webContents.getURL(), title: created[0].getTitle() } : null
  const again = await ask(nodes[1], docPath)
  const badTraversal = await ask(nodes[0], '/xaihi/ui/../index.html')
  const absoluteUrl = await ask(nodes[0], 'https://example.com/xaihi/ui/0123456789ab/index.html')
  const withoutPath = await ask(nodes[0], undefined)
  for (const w of all()) {
    if (w === app) continue
    if (isOwnedDocWindow(w) || (createdProbe !== null && w.id === createdProbe.windowId)) w.close()
  }
  await new Promise((r) => setTimeout(r, 800))
  return {
    nodes, docPath, opened, createdCount: created.length, createdProbe, again,
    badTraversal, absoluteUrl, withoutPath, frameProbe, ownedLeft: openedWins().length,
  }
})()`)
console.log('H 段（产品文档替被嵌的 Xaihi 帧转达开窗）⇒ ' + JSON.stringify(H))

// I 段：这条钉的是"**官方档不能在这里冒充**"，不是"官方档已验"。
// 实测：CDP 的 addScriptToEvaluateOnNewDocument 先把 dshDesktop 重定义成官方那 6 个成员，
// 页面重新加载后读到的**仍然是壳的那一份**（preload 的 contextBridge 在注入之后才暴露）
// ⇒ 屏幕上的 stock-shell 那句只能由**真没打 0001 的那份构建**给出来；注入式读数一律算假证据。
// 真的那一档在 `desktop/README.md` 的"官方形状真构建"一节里量（改的是构建产物，不碰被跟踪的源码）。
const I = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 500))
  const ready = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL('dsh-app://app/')
  await Promise.race([ready, new Promise((r) => setTimeout(r, 6000))])
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const nodes = manifest.plugins.map((p) => p.manifest.id)
  const docUrl = 'dsh-app://app' + manifest.ui.documentUrl
  // 从产品文档这一侧开窗只能用 0007 的转达形状（带自家文档路径）；
  // 上一版这里漏了第二个参数，撞上的正是 0007 故意保留的那条拒绝（尺写错，不是产品缺陷）。
  const opening = await app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(nodes[0]) + ', '
    + JSON.stringify({ documentPath: manifest.ui.documentUrl }) + ')', true)
  await new Promise((r) => setTimeout(r, 1200))
  const win = all().find((w) => w.id === opening.windowId)
  if (win === undefined) return { skipped: '那个文档窗没开出来' }
  const READ = "(() => { const el = document.querySelector('[data-xaihi-window-capability]');"
    + " const board = document.querySelector('[data-xaihi-realm-probe]');"
    + " return { attr: el ? el.getAttribute('data-xaihi-window-capability') : null,"
    + " text: el ? el.textContent : null, board: !!board, bodyChars: document.body ? document.body.innerText.length : 0,"
    + " surface: typeof window.dshDesktop, verb: typeof (window.dshDesktop && window.dshDesktop.xaihiWindow) } })()"
  const before = await win.webContents.executeJavaScript(READ, true)
  let injected = 'not-attempted'
  try {
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Page.enable')
    // 官方桌面端那份面有 6 个成员、没有 xaihiWindow（现读见 desktop/README 的官方壳对照读数）。
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: 'Object.defineProperty(window, "dshDesktop", { configurable: true, value:'
        + ' { protocolVersion: 1, browser: {}, deviceInfo: {}, keyboard: {}, shortcuts: {}, updates: {} } });',
    })
    injected = 'attached'
  } catch (error) { injected = 'attach-failed: ' + String(error).slice(0, 80) }
  let after = null
  if (injected === 'attached') {
    const reloaded = new Promise((r) => win.webContents.once('did-finish-load', r))
    await win.webContents.loadURL(docUrl + '?node=' + nodes[1])
    await Promise.race([reloaded, new Promise((r) => setTimeout(r, 6000))])
    await new Promise((r) => setTimeout(r, 1200))
    after = await win.webContents.executeJavaScript(READ, true)
    try { win.webContents.debugger.detach() } catch { /* 已经掉了就不用管 */ }
  }
  win.close()
  await new Promise((r) => setTimeout(r, 600))
  return { nodes, injected, before, after, ownedLeft: openedWins().length }
})()`)
console.log('I 段（注入冒充不了官方形状）⇒ ' + JSON.stringify(I))

// J 段：0008 的那一格 —— **面板形态下那一下真能开窗**。
// 这条复现的正是 E/F 之前量到的"两条死路"里的一条：被嵌在产品文档里的 Xaihi 帧调
// `window.open(自家文档)` 时，`HandlerDetails` 只给得到窗的主帧 URL（= 产品文档），
// 0002 因此判 deny、实测一个新窗都没有（`createdCount: 0`）。0008 把 opener 放宽到
// "产品文档根或 index.html"，判据就按同一个形状重跑：新窗必须出来，且**只有自家文档目标**才行。
const J = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 600))
  const ready = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL('dsh-app://app/')
  await Promise.race([ready, new Promise((r) => setTimeout(r, 6000))])
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const nodes = manifest.plugins.map((p) => p.manifest.id)
  const docUrl = 'dsh-app://app' + manifest.ui.documentUrl
  const frameUrl = docUrl + '?node=' + nodes[0]
  const targetUrl = docUrl + '?node=' + (nodes[1] ?? nodes[0])
  const SETUP = "(() => new Promise((res) => { const f = document.createElement('iframe');"
    + " f.style.cssText = 'position:fixed;left:20px;top:20px;width:420px;height:260px;border:1px solid #888';"
    + " f.addEventListener('load', () => setTimeout(() => res({ url: f.contentWindow.location.href.slice(0, 70),"
    + " dshDesktop: typeof f.contentWindow.dshDesktop }), 500), { once: true });"
    + " f.src = " + JSON.stringify(frameUrl) + "; window.__panelFrame = f; document.body.appendChild(f); }))()"
  const frame = await app.webContents.executeJavaScript(SETUP, true)
  const idsBefore = all().map((w) => w.id)
  const OPEN = "(() => { try { const w = window.__panelFrame.contentWindow.open(" + JSON.stringify(targetUrl)
    + ", 'xaihi-panel-probe'); return { popup: w === null ? 'null' : (w ? 'object' : String(w)) } }"
    + " catch (e) { return { error: String(e).slice(0, 80) } } })()"
  const openRes = await app.webContents.executeJavaScript(OPEN, true)
  await new Promise((r) => setTimeout(r, 1200))
  const created = all().filter((w) => !idsBefore.includes(w.id))
  const createdProbe = created.length === 1 ? { windowId: created[0].id, url: created[0].webContents.getURL(), title: created[0].getTitle() } : null
  // 对照一：同一个目标再问一次 —— 0004 的去重在这条新路上也必须吃得住，不许叠第二个窗。
  const ids2 = all().map((w) => w.id)
  await app.webContents.executeJavaScript(OPEN, true)
  await new Promise((r) => setTimeout(r, 900))
  const repeatCreated = all().filter((w) => !ids2.includes(w.id)).length
  // 对照二：同一帧开**自家非文档路径**仍要被拒（放宽只放到目标形状，不是放到整个 app）。
  const ids3 = all().map((w) => w.id)
  const innerRes = await app.webContents.executeJavaScript(
    "(() => { const w = window.__panelFrame.contentWindow.open('dsh-app://app/index.html');"
    + " return w === null ? 'null' : 'object' })()", true)
  await new Promise((r) => setTimeout(r, 700))
  const innerCreated = all().filter((w) => !ids3.includes(w.id)).length
  await app.webContents.executeJavaScript('if (window.__panelFrame) window.__panelFrame.remove()', true)
  for (const w of all()) {
    if (w === app) continue
    if (isOwnedDocWindow(w) || (createdProbe !== null && w.id === createdProbe.windowId)) w.close()
  }
  await new Promise((r) => setTimeout(r, 800))
  return { nodes, frameUrl, targetUrl, frame, openRes, createdCount: created.length, createdProbe,
    repeatCreated, innerRes, innerCreated, ownedLeft: openedWins().length }
})()`)
console.log('J 段（面板形态下那一下真能开窗）⇒ ' + JSON.stringify(J))

// K 段：节点窗**自己**用 `window.open` 开另一个节点窗 —— 这是"窗里那一下"的实际形状。
// D 段量的是 IPC 动词（子窗调 `dshDesktop.xaihiWindow.open`），E 段量的是主窗停在文档上时的
// `window.open`；两者都没覆盖"子窗 → window.open"这一格。
const K = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 600))
  const ready = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL('dsh-app://app/')
  await Promise.race([ready, new Promise((r) => setTimeout(r, 6000))])
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const nodes = manifest.plugins.map((p) => p.manifest.id)
  const docUrl = 'dsh-app://app' + manifest.ui.documentUrl
  // 起第一个节点窗要从产品文档走 0007 的转达形状（带自家文档路径）——
  // 上一版这里又漏了第二个参数，撞的还是 0007 故意保留的那条拒绝（同一类尺写错，第二次）。
  const first = await app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(nodes[0]) + ', '
    + JSON.stringify({ documentPath: manifest.ui.documentUrl }) + ')', true)
  const child = all().find((w) => w.id === first.windowId)
  if (child === undefined) return { skipped: '第一个节点窗没开出来' }
  const targetUrl = docUrl + '?node=' + (nodes[2] ?? nodes[1] ?? nodes[0])
  const idsBefore = all().map((w) => w.id)
  const openRes = await child.webContents.executeJavaScript(
    '(() => { const w = window.open(' + JSON.stringify(targetUrl) + ', "xaihi-child-probe");'
    + ' return w === null ? "null" : (w ? "object" : String(w)) })()', true)
  await new Promise((r) => setTimeout(r, 1200))
  const created = all().filter((w) => !idsBefore.includes(w.id))
  const createdProbe = created.length === 1 ? { windowId: created[0].id, url: created[0].webContents.getURL(), title: created[0].getTitle() } : null
  for (const w of all()) {
    if (w === app) continue
    if (isOwnedDocWindow(w) || (createdProbe !== null && w.id === createdProbe.windowId) || w.id === first.windowId) w.close()
  }
  await new Promise((r) => setTimeout(r, 800))
  return { nodes, targetUrl, firstWindowId: first.windowId, openRes,
    createdCount: created.length, createdProbe, ownedLeft: openedWins().length }
})()`)
console.log('K 段（节点窗自己 window.open 开另一个节点窗）⇒ ' + JSON.stringify(K))

// L 段：0009 的尺寸 —— 调用方带的尺寸要真落到新建那一个窗上，且**只作用在新建那一次**
// （重复请求是聚焦，不许把使用者已经拖好的窗改了尺寸）。三条对照：半套尺寸、越界尺寸、去重后尺寸不变。
const L = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 600))
  const ready = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL('dsh-app://app/')
  await Promise.race([ready, new Promise((r) => setTimeout(r, 6000))])
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const nodes = manifest.plugins.map((p) => p.manifest.id)
  const docPath = manifest.ui.documentUrl
  const ask = (options) => app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open(' + JSON.stringify(nodes[2] ?? nodes[1]) + ', '
    + JSON.stringify(options) + ')'
    + '.then((r) => ({ kind: "opened", windowId: r.windowId, alreadyOpen: r.alreadyOpen }),'
    + ' (e) => ({ kind: "rejected", message: String(e && e.message ? e.message : e) }))', true)
  const sized = await ask({ documentPath: docPath, width: 900, height: 700 })
  await new Promise((r) => setTimeout(r, 1000))
  const win = all().find((w) => w.id === sized.windowId)
  const bounds = win === undefined ? null : win.getBounds()
  const repeat = await ask({ documentPath: docPath, width: 1500, height: 1100 })
  await new Promise((r) => setTimeout(r, 800))
  const boundsAfterRepeat = win === undefined || win.isDestroyed() ? null : win.getBounds()
  const partial = await ask({ documentPath: docPath, width: 900 })
  const tooSmall = await ask({ documentPath: docPath, width: 300, height: 300 })
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 800))
  return {
    sized, bounds, repeat, boundsAfterRepeat, partial, tooSmall,
    ownedLeft: openedWins().length,
  }
})()`)
console.log('L 段（调用方带的尺寸只作用在新建那一次）⇒ ' + JSON.stringify(L))

// M 段：0010 那四条寻址动词，外加两条边界对照 ——
// ① 拿**产品主窗的 id** 来问要被拒（`unknown window`）：这四条永远够不到 Xaihi 登记之外的窗；
// ② 关掉之后再问同一个 id 也要被拒：登记表真的跟着 `closed` 走，不是只查一次。
const M = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  ${SCAN}
  ${TIMED}
  const app = main()
  if (app === undefined) return { skipped: '没有产品主窗' }
  const mainId = app.id
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 600))
  const ready = new Promise((r) => app.webContents.once('did-finish-load', r))
  await app.webContents.loadURL('dsh-app://app/')
  await Promise.race([ready, new Promise((r) => setTimeout(r, 6000))])
  const manifest = await timed(app.webContents.executeJavaScript(
    "fetch('/xaihi/manifest.json').then(async (r) => r.status === 200 ? await r.json() : null)", true), 8000, 'fetch')
  if (manifest === null || manifest === undefined || manifest.__timeout !== undefined) return { skipped: 'manifest 读不到' }
  const nodes = manifest.plugins.map((p) => p.manifest.id)
  const docPath = manifest.ui.documentUrl
  const call = (verb, args) => app.webContents.executeJavaScript(
    'Promise.resolve(window.dshDesktop.xaihiWindow.' + verb + '(' + args + '))'
    + '.then((r) => ({ kind: "ok", value: r }), (e) => ({ kind: "rejected", message: String(e && e.message ? e.message : e) }))', true)
  const opened = await call('open', JSON.stringify(nodes[0]) + ', '
    + JSON.stringify({ documentPath: docPath, width: 900, height: 700 }))
  await new Promise((r) => setTimeout(r, 1000))
  const id = opened.value && opened.value.windowId
  const win = all().find((w) => w.id === id)
  const got = await call('getBounds', String(id))
  const set = await call('setBounds', String(id) + ', ' + JSON.stringify({ x: 120, y: 140, width: 1100, height: 850 }))
  const liveBounds = win === undefined ? null : win.getBounds()
  const badBounds = await call('setBounds', String(id) + ', ' + JSON.stringify({ x: 1.5, y: 140, width: 1100, height: 850 }))
  const focusSelf = win === undefined ? null : await (async () => win.webContents.executeJavaScript(
    'Promise.resolve(window.dshDesktop.xaihiWindow.focus(' + String(id) + '))'
    + '.then((r) => ({ kind: "ok", value: r }), (e) => ({ kind: "rejected", message: String(e && e.message ? e.message : e) }))', true))()
  const foreign = await call('getBounds', String(mainId))
  const idsBefore = all().map((w) => w.id)
  const closed = await call('close', String(id))
  await new Promise((r) => setTimeout(r, 900))
  const createdAfterClose = all().filter((w) => !idsBefore.includes(w.id)).length
  const goneWindow = all().some((w) => w.id === id)
  const afterClose = await call('getBounds', String(id))
  for (const w of all()) if (isOwnedDocWindow(w) && w !== app) w.close()
  await new Promise((r) => setTimeout(r, 600))
  return { nodes, mainId, opened, id, got, set, liveBounds, badBounds, focusSelf, foreign,
    closed, createdAfterClose, windowStillThere: goneWindow, afterClose, ownedLeft: openedWins().length }
})()`)
console.log('M 段（focus / close / getBounds / setBounds 与登记表边界）⇒ ' + JSON.stringify(M))

let failures = 0
const need = (label, pass) => { console.log(`${pass ? 'OK  ' : 'FAIL'} ${label}`); if (!pass) failures += 1 }
const a = A.ok === true ? A.value : {}
const b = B.ok === true ? B.value : {}
const cc = C.ok === true ? C.value : {}
const dd = D.ok === true ? D.value : {}
const rr = R.ok === true ? R.value : {}

need('R: 复位后有产品主窗，且自家文档窗全清干净', rr.reopened === true && rr.ownedLeft === 0)
need('R: 主窗带回产品文档根（A 段的发起者才不是 Xaihi 文档）', rr.url === 'dsh-app://app/')
need('R: 复位期主框导航没撞上游恢复态（did-fail-load 会 reportFatal）', rr.navigated === 'not-needed' || rr.navigated === 'loaded')
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

need('C: 第一次是真新建', cc.first?.alreadyOpen === false)
need('C: 同一个 node 第二次不叠窗（计数不变）', typeof cc.countAfterFirst === 'number' && cc.countAfterSecond === cc.countAfterFirst)
need('C: 第二次回报 alreadyOpen 且指向同一个窗', cc.second?.alreadyOpen === true && cc.second?.windowId === cc.first?.windowId)
need('C: 换 node 才多开一窗', cc.third?.alreadyOpen === false && cc.countAfterThird === cc.countAfterSecond + 1)
need('C: 窗标题带得出去的 node 名', typeof cc.title === 'string' && cc.title.includes(String(cc.nodes?.[0] ?? '')))
need('C: 清场把自家窗真的清干净（下一段的起点才叫已知）', cc.ownedLeft === 0)

need('D: 问的时候主窗确实是隐藏的', dd.mainHiddenWhileAsking === true)
need('D: 节点窗自己能继续开新窗', dd.fromChild?.kind === 'opened')
need('D: 那一次真的多出一个窗（按 id 差量，起点已清干净）',
  dd.fromChild?.kind === 'opened' && dd.fromChild.alreadyOpen === false
  && dd.createdProbe?.windowId === dd.fromChild.windowId && dd.countAfter === dd.countBefore + 1)
need('D: 新开那个窗寻址的就是被问的 node', typeof dd.createdProbe?.url === 'string'
  && dd.createdProbe.url.includes('node=' + String(dd.nodes?.[1] ?? '')) && String(dd.createdProbe?.title).includes(String(dd.nodes?.[1] ?? '')))
need('D: 守卫没跟着放宽（自家窗被导走后再问仍被拒）', typeof dd.control === 'string' && dd.control.startsWith('REJECTED') && (dd.control.includes('only the Xaihi UI document') || dd.control.includes('unowned renderer')))
need('D: 收尾把自家窗清干净（不把残留留给下一段）', dd.ownedLeft === 0)

const ee = E.ok === true ? E.value : {}
need('E: 页面 window.open 自家文档 ⇒ 弹出窗没长出来（原生路吃下了它）', ee.res?.popup === 'null')
need('E: 原生那一个窗真出来了，寻址到被点的 node，标题也带得上',
  ee.createdCount === 1 && typeof ee.nativeProbe?.url === 'string'
  && typeof ee.target === 'string' && ee.nativeProbe.url === ee.target
  && String(ee.nativeProbe?.title).includes(String(ee.target).split('node=')[1] ?? '~none~'))
need('E: 对照——自家非文档路径的 window.open 没长出窗', ee.inner === 'null' && ee.innerCreated === 0)
need('E: 收尾把自家窗清干净', ee.ownedLeft === 0)

const ffs = F.ok === true ? F.value : {}
need('F: 顶层窗在屏幕上读回"独立窗：可用"（决定 4 要的是看得见，不是产物里有定义）',
  ffs.top?.attr === 'supported' && typeof ffs.top?.text === 'string'
  && ffs.top.text.includes('桌面壳直接开出来的顶层窗') && ffs.top.text.includes('独立窗：可用'))
need('F: 那句能力与现场注入面对得上（不是写死的字符串）',
  ffs.top?.attr === 'supported' ? ffs.top?.surface === 'object' : ffs.top?.surface !== 'object')
need('F: 反向对照——同一份文档嵌进 iframe 后换了说法',
  typeof ffs.nested?.text === 'string' && ffs.nested.text.includes('外层 iframe') && ffs.nested.text !== ffs.top?.text)

const hh = H.ok === true ? H.value : {}
need('H: 产品文档带自家路径转达 ⇒ 真开出一个原生窗（面板那一格的通路）',
  hh.opened?.kind === 'opened' && hh.createdCount === 1
  && hh.createdProbe?.url === 'dsh-app://app' + hh.docPath + '?node=' + String(hh.nodes?.[1] ?? '~none~'))
need('H: 同一个 node 再问一次走去重，不叠第二个窗', hh.again?.alreadyOpen === true)
need('H: 路径穿越被自家路由形状拒掉', hh.badTraversal?.kind === 'rejected' && String(hh.badTraversal?.message).includes('document path must match'))
need('H: 外部绝对地址被拒（不许把任意 URL 喂给 loadURL）', hh.absoluteUrl?.kind === 'rejected' && String(hh.absoluteUrl?.message).includes('document path must match'))
need('H: 对照——不带路径时旧那条拒绝仍在（0007 没把动词整体放开给产品文档）',
  hh.withoutPath?.kind === 'rejected' && String(hh.withoutPath?.message).includes('only the Xaihi UI document'))
need('H: 现场复核被嵌那一帧确实拿不到动词（0007 的存在理由，不是判据）', hh.frameProbe?.dshDesktop === 'undefined')
need('H: 收尾把自家窗清干净', hh.ownedLeft === 0)

const ii = I.ok === true ? I.value : {}
need('I: 那个窗本来读到的确实是自家壳（before 半边）',
  ii.before?.attr === 'supported' && ii.before?.surface === 'object' && ii.before?.verb === 'object')
// 这一条**期望注入失败**：注入失败才说明页面上那份面来自 preload，改不动 ⇒ 想报 stock-shell
// 只能拿真没打 0001 的构建来（实测读数值见 desktop/README 的"官方形状真构建"一节）。
need('I: 注入冒充不了官方形状（after 仍是壳的那份，所以这里不许被写成"官方档已验"）',
  ii.injected === 'attached' && ii.after?.verb === 'object' && ii.after?.attr === 'supported')
need('I: 那一窗到点还是清干净的', ii.ownedLeft === 0)

const jj = J.ok === true ? J.value : {}
need('J: 被嵌那一帧确实没有壳的动词（0008 要绕的就是这一格）', jj.frame?.dshDesktop === 'undefined')
need('J: 帧里 window.open 自家文档 ⇒ 弹出窗没长出来，而原生窗出来一个',
  jj.openRes?.popup === 'null' && jj.createdCount === 1 && jj.createdProbe?.url === jj.targetUrl)
need('J: 那个新窗寻址与标题都跟着被点的 node',
  String(jj.createdProbe?.url).includes('node=' + String(jj.nodes?.[1] ?? '~none~'))
  && String(jj.createdProbe?.title).includes(String(jj.nodes?.[1] ?? '~none~')))
need('J: 对照——同一目标再问一次不叠第二个窗（去重覆盖这条新路）', jj.repeatCreated === 0)
need('J: 对照——同一帧开自家非文档路径仍不长窗', jj.innerRes === 'null' && jj.innerCreated === 0)
need('J: 收尾把自家窗清干净', jj.ownedLeft === 0)

const kk = K.ok === true ? K.value : {}
need('K: 节点窗自己 window.open 另一个 node ⇒ 弹出窗没长出来，原生窗出来一个',
  kk.openRes === 'null' && kk.createdCount === 1 && kk.createdProbe?.url === kk.targetUrl)
need('K: 那个窗寻址与标题都跟着新的 node（不是第一个窗的 node）',
  String(kk.createdProbe?.url).includes('node=' + String(kk.nodes?.[2] ?? kk.nodes?.[1] ?? '~none~'))
  && String(kk.createdProbe?.title).includes(String(kk.nodes?.[2] ?? kk.nodes?.[1] ?? '~none~')))
need('K: 收尾把自家窗清干净', kk.ownedLeft === 0)

const ll = L.ok === true ? L.value : {}
need('L: 调用方带的尺寸真落到新建的那一个窗（900x700 逐字读回）',
  ll.sized?.kind === 'opened' && ll.sized.alreadyOpen === false
  && ll.bounds?.width === 900 && ll.bounds?.height === 700)
need('L: 重复请求是聚焦，不许改掉使用者已经有的窗尺寸',
  ll.repeat?.alreadyOpen === true && ll.boundsAfterRepeat?.width === 900 && ll.boundsAfterRepeat?.height === 700)
need('L: 半套尺寸按形状错误拒（不许静默用缺省）',
  ll.partial?.kind === 'rejected' && String(ll.partial?.message).includes('width and height must both be integers'))
need('L: 越界尺寸被拒', ll.tooSmall?.kind === 'rejected' && String(ll.tooSmall?.message).includes('width and height must both be integers'))
need('L: 收尾把自家窗清干净', ll.ownedLeft === 0)

const mm = M.ok === true ? M.value : {}
need('M: getBounds 读回的就是新建时带的那份尺寸',
  mm.got?.kind === 'ok' && mm.got.value?.width === 900 && mm.got.value?.height === 700)
need('M: setBounds 回读的是生效后的矩形（与主进程自己量的那份逐字相同）',
  mm.set?.kind === 'ok' && mm.set.value?.width === 1100 && mm.set.value?.height === 850
  && mm.set.value?.x === mm.liveBounds?.x && mm.set.value?.y === mm.liveBounds?.y
  && mm.set.value?.width === mm.liveBounds?.width && mm.set.value?.height === mm.liveBounds?.height)
need('M: 小数坐标按形状拒（不许静默取整或半个坐标生效）',
  mm.badBounds?.kind === 'rejected' && String(mm.badBounds?.message).includes('bounds must be integer x, y'))
need('M: 窗自己也能 focus 自己（节点窗里的"到这来"）',
  mm.focusSelf?.kind === 'ok' && mm.focusSelf?.value?.windowId === mm.id)
need('M: 边界对照——拿产品主窗的 id 来问也被拒（这四条够不到登记表外的窗）',
  mm.foreign?.kind === 'rejected' && String(mm.foreign?.message).includes('unknown window'))
need('M: close 真的关掉那一个窗，且不多开别的',
  mm.closed?.kind === 'ok' && mm.windowStillThere === false && mm.createdAfterClose === 0)
need('M: 关掉之后同一个 id 读不回来（登记表跟着 closed 走）',
  mm.afterClose?.kind === 'rejected' && String(mm.afterClose?.message).includes('unknown window'))
need('M: 收尾把自家窗清干净', mm.ownedLeft === 0)

ws.close()
if (failures > 0) {
  console.error(`live-check: ${String(failures)} 条不成立 ⇒ 别把这条写成"实机验过"`)
  if (b.reason !== undefined) console.error(`live-check: B 段没跑成的原因：${b.reason}`)
  process.exit(1)
}
console.log('live-check: 全部判据绿（含对照；B/C/D 段用的是 Xaihi 真文档，不是合成 URL）')
