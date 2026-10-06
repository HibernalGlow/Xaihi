#!/usr/bin/env node
/**
 * 活体判据：对着**正在跑**的 Xaihi 壳（`desktop/dsh` 里 `start:desktop` 起的那个）验 0001/0002 的运行时行为。
 *
 * 前置：壳必须已经起来，并且开着主进程 inspector（上游 dev 启动器默认给 9229）。
 *   cd desktop/dsh/apps/desktop && DSH_HOME=<隔离 home> pnpm exec tsx scripts/dev.ts --skip-build
 * 判据：node desktop/live-check.mjs [--port 9229]
 *
 * 为什么走主进程：renderer 的 CDP（9222）需要 `--remote-allow-origins`，上游启动器不给这个参数，
 * Node 的 WebSocket 连上去会挂住；主进程 inspector 没有那道闸，而且能直接数窗口——比数 target 硬。
 * 为什么用 createRequire：Electron 的主进程是 ESM 入口，inspector 的求值域里没有 require/module，
 * `import()` 又报 "A dynamic import callback was not specified"；`process.getBuiltinModule('module')`
 * 是唯一能拿到 electron API 的路子。
 */

const portArg = process.argv.indexOf('--port')
const PORT = portArg === -1 ? 9229 : Number(process.argv[portArg + 1])
const SYNTHETIC = 'dsh-app://app/xaihi/ui/0123456789ab/index.html'
const ELECTRON = `process.getBuiltinModule('module').createRequire(process.cwd() + '/probe.js')('electron')`

const targets = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json()
const target = targets.find((t) => typeof t.webSocketDebuggerUrl === 'string')
if (target === undefined) {
  console.error(`live-check: ${String(PORT)} 上没有可连的 target ⇒ 壳没起来，或 inspector 端口不是这个`)
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
async function evaluateMain (expression) {
  const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
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

// B 段：把主窗导到形状合法的自家文档 URL 上（Host 那边没装 Xaihi 时会回 404，但判策按 URL 形状判等），
// 再请求开窗 —— 放行分支必须真的多出一个原生窗。收摊时关掉它并把主窗导回产品文档。
const B = await evaluateMain(`(async () => {
  const { BrowserWindow } = ${ELECTRON}
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const app = wins.find((w) => w.webContents.getURL().startsWith('dsh-app://app/'))
  if (app === undefined) return { skipped: '没有 app 文档' }
  const before = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length
  const synthetic = ${JSON.stringify(SYNTHETIC)}
  try { await app.webContents.loadURL(synthetic) } catch (error) { console.log('loadURL 抛了：' + String(error)) }
  const openerUrl = app.webContents.getURL()
  const res = await app.webContents.executeJavaScript(
    'window.dshDesktop.xaihiWindow.open("findz").then((r) => "RESOLVED windowId=" + r.windowId, (e) => "REJECTED: " + String(e && e.message ? e.message : e))', true)
  await new Promise((r) => setTimeout(r, 900))
  const list = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const urls = list.map((w) => w.webContents.getURL())
  for (const w of list) if (w.webContents.getURL().startsWith(synthetic) && w !== app) w.close()
  await app.webContents.loadURL('dsh-app://app/')
  return { openerUrl, before, after: list.length, res, urls }
})()`)
console.log('B 段（放行分支）⇒ ' + JSON.stringify(B))

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
need('B: 发起者确实是自家文档形状', typeof b.openerUrl === 'string' && b.openerUrl.includes('/xaihi/ui/0123456789ab/index.html'))
need('B: open 被放行', typeof b.res === 'string' && b.res.startsWith('RESOLVED'))
need('B: 真的多出一个原生窗', b.after === b.before + 1)

ws.close()
if (failures > 0) {
  console.error(`live-check: ${String(failures)} 条不成立 ⇒ 别把这条写成"实机验过"`)
  process.exit(1)
}
console.log('live-check: 九条全绿（含对照）。注意 B 段用的是 URL 形状合法的**合成文档**（Host 未装 Xaihi 时回 404），')
console.log('            所以它证的是壳侧代码路径与原生窗创建，不证 Xaihi 真内容在第二窗里渲染——那一格仍挂在发布前置上。')
