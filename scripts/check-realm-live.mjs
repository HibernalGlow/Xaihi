/**
 * 工作台文档那一侧的活体判据：协商板念出来的"工作台清单"这一行，必须是**接线读数**而不是拒绝。
 *
 * 为什么单独一份而不是加进 `check-nodeface-live.mjs`：那份读的是顶层单节点窗（`dist-nodeface`），
 * 那里的正确答案就是"没接线 ⇒ 有名字的 refused"；这一份读的是装载探针板的那份文档
 * （`dist-realm`），那里的正确答案相反 —— 装配注入了那份组件清单，所以它必须读到那一份。
 * 两个方向都要有读数，否则"按接线判"这一条只证了一半（2026-10-07 的另一半只停在单元测试里）。
 *
 * 判据读的是**页面上的那行字**，不是 `globalThis` 上挂的对象：这一格要证的正是"退化/没退化在界面上读得回来"
 * （ADR-0011 决定 4），控制台里读得到而界面上没有，等于没做。
 *
 * 用法：
 *   pnpm host                     # 隔离宿主（DSH_HOME=../.scratch/dsh-xaihi-home，端口 3199），core.uiBundleDir 指 dist-realm
 *   chrome-headless-shell --no-sandbox --user-data-dir=$(mktemp -d) --remote-debugging-port=9339 about:blank
 *   node scripts/check-realm-live.mjs
 *   node scripts/check-realm-live.mjs --self-check
 *
 * @module xaihi-scripts/check-realm-live
 */

import { parseArgs } from 'node:util'

const { values: flags } = parseArgs({
  options: {
    port: { type: 'string', default: '3199' },
    cdp: { type: 'string', default: '9339' },
    'self-check': { type: 'boolean', default: false },
  },
})
const PORT = Number(flags.port)
const CDP = Number(flags.cdp)

const WORKSPACE_PREFIX = '工作台清单 →'

/**
 * 一份读数判四条。
 * @param r - `{ roundtrip, lines }`：板子那条属性与按行拆开的面板文本。
 * @returns 每条判据一行，红的那条带上下文。
 */
export function judge (r) {
  const checks = []
  const need = (label, ok, detail) => { checks.push({ ok, label, detail }) }
  const line = (prefix) => (r.lines ?? []).find((row) => row.startsWith(prefix)) ?? ''
  const carrier = (r.lines ?? []).find((row) => row.includes('载体=')) ?? ''
  const workspaceLine = (r.lines ?? []).find((row) => row.startsWith(WORKSPACE_PREFIX)) ?? ''

  need('① 板子跑过一轮往返（离开 pending）',
    r.roundtrip === 'crossed' || r.roundtrip === 'not-crossed',
    `roundtrip=${String(r.roundtrip ?? '(没读到)')}`)
  need('② 载体是 host-http（顶层文档经 Xaihi 自己的路由）',
    carrier.includes('载体=host-http'),
    carrier === '' ? '(板上没有载体那一行)' : carrier.slice(0, 90))
  // ③ 这条是本刀的正题：这份文档的装配注入了组件清单，所以它必须读到那一份。
  //    读成"没接线"就是回归——上一版按握手 granted 闸，红的正是这里（外壳永不 grant workspace）。
  need('③ 工作台清单这行是接线读数（已接线），不是 refused',
    workspaceLine.startsWith(`${WORKSPACE_PREFIX} 已接线`) && /已接线（\d+ 个）/u.test(workspaceLine),
    workspaceLine === '' ? `(没有以 "${WORKSPACE_PREFIX}" 开头的那一行)` : workspaceLine.slice(0, 110))
  const uiLine = line('config.getUi →')
  need('④ config.getUi 那行说得出下落（对面回来的 ns/revision，或一句拒绝）',
    uiLine.length > 'config.getUi → '.length && /ns=|拒/u.test(uiLine),
    uiLine === '' ? '(没有那一行)' : uiLine.slice(0, 90))
  return checks
}

/** 取一次现场读数：装载那份文档，等板子离开 pending，把面板文本按行拿回来。 */
async function gather () {
  const manifest = await (await fetch(`http://127.0.0.1:${PORT}/xaihi/manifest.json`)).json()
  const rev = manifest?.ui?.rev
  if (typeof rev !== 'string' || !/^[0-9a-f]{12}$/u.test(rev)) {
    throw new Error(`清单里没有可用的 ui.rev（读到 ${JSON.stringify(manifest?.ui)}）⇒ 先起 pnpm host 并把 core.uiBundleDir 指向 dist-realm`)
  }
  const docUrl = `http://127.0.0.1:${PORT}/xaihi/ui/${rev}/index.html`
  console.log(`文档 URL ${docUrl}`)

  const targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  if (page?.webSocketDebuggerUrl === undefined) {
    throw new Error(`${CDP} 上没有可连的页面 ⇒ 先起无窗口浏览器：chrome-headless-shell --no-sandbox --user-data-dir=$(mktemp -d) --remote-debugging-port=${CDP} about:blank`)
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('CDP ws 连不上')) })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    pending.get(msg.id)?.(msg)
    pending.delete(msg.id)
  }
  const send = (method, params) => new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (reply.result?.exceptionDetails !== undefined) {
      return { threw: String(reply.result.exceptionDetails.exception?.description ?? '').slice(0, 200) }
    }
    return reply.result?.result?.value
  }

  await send('Page.enable', {})
  await send('Page.navigate', { url: docUrl })
  let board = null
  for (let tries = 0; tries < 90; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const raw = await evaluate("(() => { const el = document.querySelector('[data-xaihi-host-roundtrip]'); if (!el) return null; return JSON.stringify({ roundtrip: el.getAttribute('data-xaihi-host-roundtrip'), text: document.body.innerText }) })()")
    if (raw === null || typeof raw !== 'string') continue
    const value = JSON.parse(raw)
    if (value.roundtrip === 'pending') continue
    board = value
    break
  }
  ws.close()
  if (board === null) throw new Error('等不到板子离开 pending（90 轮 × 200ms 用完）')
  return { roundtrip: board.roundtrip, lines: String(board.text).split('\n').map((row) => row.trim()).filter((row) => row !== '') }
}

/** 阳性对照：每份坏读数只破一条，其余仍要过 ⇒ 这把尺看得见违规。期望值全是手写的。 */
function selfCheck () {
  const good = {
    roundtrip: 'crossed',
    lines: [
      'Xaihi 文档 realm 探针（不是工作台）',
      'xaihi realm: rev=abcdef012345 React=19.2.4 载体=host-http · 已握手',
      '能力：contract, state, config',
      'config.getUi → 对面那格 ns=xaihi-core revision=7',
      'state 往返 → crossed=true 写侧=ok 读侧=ok',
      '没给：runner=命令要跑在一个 Agent 上 ｜ clipboard=剪贴板是宿主/系统侧能力',
      '文档自己兑现（不过桥）：downloads',
      '工作台清单 → 已接线（0 个）',
    ],
  }
  const cases = [
    { name: '板子停在 pending = ① 红', reading: { ...good, roundtrip: 'pending' }, expectFail: 1 },
    { name: '载体不是 host-http = ② 红', reading: { ...good, lines: good.lines.map((row) => row.replace('载体=host-http', '载体=postMessage')) }, expectFail: 1 },
    { name: '工作台那行念成没接线 = ③ 红（上一版按 granted 闸就是红在这里）', reading: { ...good, lines: good.lines.map((row) => row.startsWith(WORKSPACE_PREFIX) ? `${WORKSPACE_PREFIX} 没接线：refused · 这份界面没有工作台可问` : row) }, expectFail: 1 },
    { name: '工作台那一行整行不在 = ③ 红', reading: { ...good, lines: good.lines.filter((row) => !row.startsWith(WORKSPACE_PREFIX)) }, expectFail: 1 },
    { name: 'config.getUi 那行空 = ④ 红', reading: { ...good, lines: good.lines.map((row) => row.startsWith('config.getUi') ? 'config.getUi → ' : row) }, expectFail: 1 },
  ]
  const problems = []
  const base = judge(good)
  if (base.some((row) => !row.ok)) problems.push(`好读数本该全绿，实际红在：${base.filter((row) => !row.ok).map((row) => row.label).join(', ')}`)
  for (const bad of cases) {
    const rows = judge(bad.reading)
    const failed = rows.filter((row) => !row.ok)
    if (failed.length !== bad.expectFail) {
      problems.push(`${bad.name} ⇒ 红 ${failed.length} 条（期望 ${bad.expectFail}）：${failed.map((row) => row.label).join(', ') || '一条都没红 ⇒ 这把尺看不见违规'}`)
    } else {
      console.log(`✓ 对照 ${bad.name} ⇒ 红 ${failed.length} 条，期望 ${bad.expectFail}（${failed[0]?.label.slice(0, 24) ?? ''}）`)
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  × ${problem}`)
    return 1
  }
  console.log('check-realm-live --self-check OK（尺看得见违规）')
  return 0
}

if (flags['self-check']) process.exit(selfCheck())

let rc = 1
try {
  const reading = await gather()
  console.log('现场读数 ⇒ ' + JSON.stringify({ roundtrip: reading.roundtrip, workspaceLine: reading.lines.find((row) => row.startsWith(WORKSPACE_PREFIX)) ?? '(没有那一行)' }))
  for (const row of judge(reading)) {
    console.log(`${row.ok ? 'OK  ' : '×   '}${row.label}｜${row.detail}`)
  }
  rc = judge(reading).every((row) => row.ok) ? 0 : 1
} catch (error) {
  console.error(`× 取不到读数：${String(error instanceof Error ? error.message : error)}`)
  rc = 1
}
process.exit(rc)
