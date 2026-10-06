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
// 主窗取 dsh-app 窗里创建最早的那个（getAllWindows 按创建顺序；我们的窗永远是后建的那个）。
const SCAN = `
  const all = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const isOwnedDocWindow = (w) => String(w.getTitle()).startsWith('Xaihi ')
    || w.webContents.getURL().includes('/xaihi/ui/')
  const appWindows = () => all().filter((w) => w.webContents.getURL().startsWith('dsh-app://app/'))
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
// 基础设施步（读 manifest、导航）允许再读一次：实机读到过同一段 fetch 在一次运行里 30 s 不落地、
// 下一次运行 10 ms 就回（安静状态连跑三次 10/16/28 ms）。行为步（三次 open）不重试 ——
// 重试会把"open 自己不落地"这类真缺陷盖掉，两次读数也一律留档。
const cStepTwice = async (label, expression) => {
  const first = await cStep(label + '（第 1 次）', expression)
  if (first.ok === true) return first
  await new Promise((r) => setTimeout(r, 1500))
  const second = await cStep(label + '（第 2 次）', expression)
  console.log(`C 段 ${label}：第 1 次不落地（${String(first.text)}），第 2 次 ${second.ok === true ? '读到了' : '仍不落地'}`)
  return second
}
const cManifest = await cStepTwice('manifest（在产品文档里 fetch）', `
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
  ? await cStepTwice('导航到文档（不带 node）', `
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

ws.close()
if (failures > 0) {
  console.error(`live-check: ${String(failures)} 条不成立 ⇒ 别把这条写成"实机验过"`)
  if (b.reason !== undefined) console.error(`live-check: B 段没跑成的原因：${b.reason}`)
  process.exit(1)
}
console.log('live-check: 全部判据绿（含对照；B/C/D 段用的是 Xaihi 真文档，不是合成 URL）')
