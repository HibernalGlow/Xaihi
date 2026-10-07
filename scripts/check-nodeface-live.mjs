/**
 * 活体判据：`dist-nodeface/` 那份产物在**真浏览器**里过一遍路线 (A)，判的是五件事，
 * 全部读自界面与对面，不读我自己造的对象。
 *
 * 为什么要有这个脚本（而不是留在一次性探针里）：这一格今天的答案是手跑出来的，下一个人只能信我。
 * 判据落进仓库之后，"节点界面经我们自己的路由问宿主"这条链谁都能重取；它也是桌面那一格
 * （`desktop/live-check.mjs` 的 Q 段，要 GUI 工位）之外唯一一条不带 GUI 就能跑到真组件的路。
 *
 * 五条判据（缺一条就红，红要点名是哪一条）：
 * ① 协商板说这份文档走的是 `host-http` 载体（顶层窗没有父帧 ⇒ 只能问 Xaihi 自己的路由）；
 * ② 真节点组件画出来了：有自己的控件与输入区，不是空白也不是装载失败；
 * ③ `host.clipboard.readText()` 抛的是 `refused` 并带一句原因（对面没给就不做，不猜一个）；
 * ④ `host.downloads.text()` **成功**——这一组由文档自己兑现，不过桥；③④ 一起钉的是
 *    "协商面与真实行为不许互相矛盾"（2026-10-07 量到 downloads 被念成缺勤）；
 * ⑤ 一条会话写进对面，**另一条新会话**读得回来（每次装载都是新的 `sid` ⇒ 证的是落到底下，
 *    不是窗内缓存）。
 *
 * 前置：隔离的开发宿主在跑（`pnpm host`，端口 3199，`core.uiBundleDir` 指到会启动桥的那份产物），
 * 以及一个开了调试端口的无窗口浏览器：
 *   chrome-headless-shell --no-sandbox --user-data-dir=$(mktemp -d) --remote-debugging-port=9339 about:blank
 *
 * 用法：
 *   node scripts/check-nodeface-live.mjs [--port 3199] [--cdp 9339] [--node xaihi-linedup]
 *   node scripts/check-nodeface-live.mjs --self-check    # 阳性对照：坏读数必须一条条红出来
 *
 * 这条尺**故意还没接进 `pnpm test`**：它要一个在跑的宿主与一个浏览器，属于现场取证，
 * 与 `check-node-face.mjs`、`check-doc-bridge.mjs` 同一档接线时机。
 *
 * @module scripts/check-nodeface-live
 */

import { setTimeout as delay } from 'node:timers/promises'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const PORT = flag('port', '3199')
const CDP = flag('cdp', '9339')
const NODE = flag('node', 'xaihi-linedup')

/**
 * 判一份活体读数。抽成纯函数是为了 `--self-check` 能拿坏读数喂它——
 * 期望值不许由再跑一次被测现场得到。
 * @param r - 现场读回来的快照。
 * @returns 每条判据的通过情况与那句读数。
 */
export function judge (r) {
  const checks = []
  const need = (label, pass, detail) => checks.push({ label, pass, detail })
  need('① 载体是 host-http（顶层文档经 Xaihi 自己的路由）',
    typeof r.carrierLine === 'string' && r.carrierLine.includes('载体=host-http'),
    String(r.carrierLine ?? '(板上没读到那一行)').slice(0, 120))
  need('② 真节点组件画出来了（有自己的控件，不是空壳）',
    r.componentButtons.length >= 2 && r.bodyLen > 8000 && r.hasTextarea === true,
    `按钮 ${String(r.componentButtons.length)} 个 · DOM ${String(r.bodyLen)} B · textarea=${String(r.hasTextarea)}`)
  need('③ clipboard 没被授予时如实 refused（带一句原因，不猜一个）',
    r.clipboard?.ok === false && r.clipboard.reason === 'refused' && String(r.clipboard.detail).length > 4,
    JSON.stringify(r.clipboard ?? null).slice(0, 140))
  need('④ downloads 由文档自己兑现：调用成功（协商不给≠做不了）',
    r.downloads?.ok === true,
    JSON.stringify(r.downloads ?? null).slice(0, 100))
  need('⑤ 另一条新会话读得到这一条写进去的标记（落到底下，不是窗内缓存）',
    r.secondPageHasMarker === true,
    String(r.secondPageData ?? '(第二趟没读到东西)').slice(0, 140))
  // ⑥ 覆盖表不许有第三种答案：每条要么是**真回东西**，要么是**带原因的 refused**。
  // 挂住（timeout）或抛出一个没有 reason 的错，症状都会是"点了没反应"，那正是决定 4 禁止的形态。
  const odd = (r.coverage ?? []).filter((row) => row.outcome !== 'resolved' && (row.outcome !== 'refused' || row.reason === ''))
  need('⑥ 节点界面会调的每一个成员都有个说得出的答案（不许静默/挂住）',
    Array.isArray(r.coverage) && r.coverage.length > 0 && odd.length === 0,
    odd.length === 0 ? `${String((r.coverage ?? []).length)} 条逐个有下落` : odd.map((row) => `${row.name}=${row.outcome}`).join(', '))
  // ⑦ `config.openFile` 今天是被 21 个节点用在"打开配置文件"那个按钮上的；答不了就必须**点名答不了**，
  // 因为这条路由只给了 describe/update/mutate 三片，壳那半边的 openDocument 分支拿不到提供者。
  // ⑧ 覆盖表里**没有人兑现得了的那一组不许回成 resolved**。这条防的是一种看起来很像真话的错答案：
  // `workspace` 那一格原本由装配侧注入一份空壳，`listComponents()` 因此回了 `[]`，
  // 界面念出来是"工作台里没有组件"，实际发生的是"这份文档里根本没有工作台"。
  // 判的是"这一组有没有下落"（对面授予的 + 文档自己接线兑现的），不是"协商里给了谁"：
  // `workspace`/`env`/`contract` 按 `host-bridge.ts:163` 本来就归文档，外壳永远不 grant 它们。
  const groupOf = (name) => name === 'env' ? 'env' : name === 'actions.run' || name === 'actions.cancelCurrent' ? 'runner' : name.split('.')[0]
  const grantedSet = Array.isArray(r.granted) ? new Set(r.granted) : new Set()
  const lying = (r.coverage ?? []).filter((row) => row.outcome === 'resolved' && !grantedSet.has(groupOf(row.name)) && row.name !== 'localFiles.getUrl')
  need('⑧ 没人兑现的那一组不许在覆盖表里回成 resolved（注入面不替缺勤作答）',
    Array.isArray(r.granted) && lying.length === 0,
    Array.isArray(r.granted) ? (lying.length === 0 ? `granted=[${[...grantedSet].join(',')}]，没有一条越权回答` : lying.map((row) => row.name).join(', ')) : '(没读到 granted)')
  const openFile = (r.coverage ?? []).find((row) => row.name === 'config.openFile')
  need('⑦ config.openFile 的现状是有名字的失败（no-provider 一类），不是成功也不是静默',
    openFile?.outcome === 'refused' && openFile.reason.length > 3,
    `${String(openFile?.outcome ?? '(没探到)')} ${String(openFile?.reason ?? '')} ${String(openFile?.detail ?? '').slice(0, 60)}`)
  return checks
}

/**
 * 取一次现场读数：同一只标签页装载两次文档——每次装载都是一条**新的桥会话**（新 `sid`），
 * 所以"第一趟写、第二趟读"证的就是落到了对面。
 */
async function gather () {
  const manifest = await (await fetch(`http://127.0.0.1:${PORT}/xaihi/manifest.json`)).json()
  const rev = manifest?.ui?.rev
  if (typeof rev !== 'string' || !/^[0-9a-f]{12}$/u.test(rev)) {
    throw new Error(`清单里没有可用的 ui.rev（读到 ${JSON.stringify(manifest?.ui)}）⇒ 先起 pnpm host 并配 core.uiBundleDir`)
  }
  if (manifest?.ui?.hostMount !== 'present') {
    throw new Error(`清单说这份产物没有装载点（hostMount=${JSON.stringify(manifest?.ui?.hostMount)}）⇒ uiBundleDir 要指到会启动桥的那份（dist-nodeface / dist-realm）`)
  }
  const docUrl = `http://127.0.0.1:${PORT}/xaihi/ui/${rev}/index.html?node=${encodeURIComponent(NODE)}`
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

  const granted = await evaluate("(() => { const pack = globalThis.__XAIHI_NODEFACE__; return pack ? pack.bridge.ready().granted.slice() : null })()")

  const marker = `nodeface-gate-${String(Date.now())}`
  /**
   * 装载一趟，并等到**预取落地**为止。
   * 为什么预取算装载的一部分：`createPersistedState` 的 revision 是 `hydrate()` 从对面取回的，
   * 没等到就写会把一个 undefined 版本号送过去 ⇒ 对面回 `changed since it was read (expected revision null, now N)`。
   * 这条判据第一次跑就是这么红的（红得对：围栏没错，是脚本抢在预取前面）。
   * 预取的结果写在 `[data-xaihi-nodeface-state]` 上，`pending` 变成别的值就是落完了。
   */
  const load = async () => {
    await send('Page.enable', {})
    await send('Page.navigate', { url: docUrl })
    let booted = false
    let hydrated = false
    for (let i = 0; i < 90 && !(booted && hydrated); i += 1) {
      await delay(500)
      const state = await evaluate(`(() => {
        const el = document.querySelector('[data-xaihi-nodeface-state]');
        return {
          booted: !!document.querySelector('[data-xaihi-nodeface]') && !!globalThis.__XAIHI_NODEFACE__,
          stateAttr: el ? String(el.getAttribute('data-xaihi-nodeface-state')) : null,
        }
      })()`)
      if (state?.booted === true) booted = true
      if (state?.stateAttr !== undefined && state.stateAttr !== null && state.stateAttr !== 'pending') hydrated = true
    }
    return { booted, hydrated }
  }

  const firstLoad = await load()
  if (!firstLoad.booted) {
    const why = await evaluate("(() => { const el = document.querySelector('[data-xaihi-nodeface]'); return el ? String(el.getAttribute('data-xaihi-nodeface')) : '(页面上没有那一格)' })()")
    throw new Error(`文档装载不上（等 45 秒没等到 __XAIHI_NODEFACE__）；板上读到的是 ${String(why)}`)
  }
  if (!firstLoad.hydrated) throw new Error('预取没落地（[data-xaihi-nodeface-state] 一直停在 pending）⇒ 这时写过去必撞版本号围栏，判据不测这一格')

  const face = await evaluate(`(() => ({
    carrierLine: (document.querySelector('[data-xaihi-bridge]')||{textContent:''}).textContent.split('\\n')[0],
    bodyLen: document.body.innerHTML.length,
    hasTextarea: !!document.querySelector('textarea'),
    componentButtons: [...document.querySelectorAll('button')].map((b) => String(b.textContent).trim()).filter((t) => t !== '').slice(0, 10),
    nodefaceAttr: (document.querySelector('[data-xaihi-nodeface]')||{getAttribute:()=>null}).getAttribute('data-xaihi-nodeface'),
  }))()`)

  const verbs = await evaluate(`(async () => {
    const pack = globalThis.__XAIHI_NODEFACE__;
    const probe = async (fn) => { try { const v = await fn(); return { ok: true, value: JSON.stringify(v).slice(0, 40) } } catch (error) { return { ok: false, reason: String((error && error.reason) || ''), detail: String((error && error.detail) || error.message || error).slice(0, 90) } } };
    const clipboard = await probe(() => pack.host.clipboard.readText());
    const downloads = await probe(async () => { pack.host.downloads.text('gate.txt', ${JSON.stringify(marker)}); return 'called' });
    pack.host.patchData(pack.node, { gateMarker: ${JSON.stringify(marker)} });
    const flushed = await pack.state.flush().then(() => pack.state.syncError(), (e) => 'THREW ' + String(e));
    return { clipboard, downloads, flushed, stateKey: pack.node, localRead: JSON.stringify(pack.host.getData(pack.node)) };
  })()`)

  const secondLoad = await load()
  if (!secondLoad.booted || !secondLoad.hydrated) {
    throw new Error(`第二趟没到位（booted=${String(secondLoad.booted)} hydrated=${String(secondLoad.hydrated)}）⇒ ⑤ 无从判起`)
  }
  const secondPageData = await evaluate(`(() => {
    const pack = globalThis.__XAIHI_NODEFACE__;
    if (!pack) return null;
    const v = pack.host.getData(pack.node);
    return v === undefined || v === null ? null : JSON.stringify(v);
  })()`)

  // 覆盖表：节点界面实际会调的那些成员，逐个**照组件的调用形状**问一遍，看对面到底怎么答。
  // 为什么要表而不是推断：21 个节点在用 `host.openConfigFile()`、25 个在用 `host.actions.run`，
  // 而"这条路由答不答得了"是三份不同的答案（真回东西 / 带原因的 refused / 根本没这条方法），
  // 数出来的才是接线依据。这里只读不写（唯一的写是 ⑤ 那一发 state 标记）。
  const coverage = await evaluate(`(async () => {
    const pack = globalThis.__XAIHI_NODEFACE__;
    const probes = [
      ['config.get', () => pack.host.config.get()],
      ['config.getUi', () => pack.host.config.getUi()],
      ['config.openFile', () => pack.host.config.openFile()],
      ['actions.run', () => pack.host.actions.run('xaihi-linedup', {})],
      ['runner.getInfo', () => pack.host.runner.getInfo('xaihi-linedup')],
      ['runner.cancelCurrent', () => pack.host.runner.cancelCurrent()],
      ['clipboard.readText', () => pack.host.clipboard.readText()],
      ['localFiles.pickFiles', () => pack.host.localFiles.pickFiles({})],
      ['localFiles.getUrl', () => pack.host.localFiles.getUrl('/tmp/x.png')],
      ['workspace.listComponents', () => pack.host.workspace.listComponents()],
      ['env', () => pack.host.env],
    ];
    const out = [];
    for (const [name, fn] of probes) {
      const one = await Promise.race([
        Promise.resolve().then(fn).then((v) => ({ outcome: 'resolved', value: JSON.stringify(v).slice(0, 60) }),
          (e) => ({ outcome: 'refused', reason: String((e && e.reason) || ''), detail: String((e && e.detail) || e && e.message || e).slice(0, 70) })),
        new Promise((r) => setTimeout(() => r({ outcome: 'timeout', reason: '', detail: '' }), 5000)),
      ]);
      out.push({ name, ...one });
    }
    return out;
  })()`)

  ws.close()

  return {
    coverage,
    granted,
    carrierLine: face?.carrierLine,
    nodefaceAttr: face?.nodefaceAttr,
    bodyLen: face?.bodyLen ?? 0,
    hasTextarea: face?.hasTextarea ?? false,
    componentButtons: face?.componentButtons ?? [],
    clipboard: verbs?.clipboard,
    downloads: verbs?.downloads,
    stateKey: verbs?.stateKey,
    flushError: verbs?.flushed,
    localRead: verbs?.localRead,
    secondPageData,
    secondPageHasMarker: typeof secondPageData === 'string' && secondPageData.includes(marker),
  }
}

/** 阳性对照：六份坏读数各破一条，且其余仍算通过。期望值是手写的，不是跑出来的。 */
function selfCheck () {
  const good = {
    carrierLine: `xaihi realm: rev=abcdef012345 node=${NODE} React=19.2.4 载体=host-http · 等宿主握手`,
    componentButtons: ['复制保留结果', '运行过滤', '粘贴源文本'],
    bodyLen: 36908,
    hasTextarea: true,
    clipboard: { ok: false, reason: 'refused', detail: '剪贴板是宿主/系统侧能力，顶层窗里没有外层可问（提案账上）' },
    downloads: { ok: true, value: '"called"' },
    secondPageHasMarker: true,
    secondPageData: '{"gateMarker":"nodeface-gate-1"}',
    granted: ['contract', 'state', 'config'],
    coverage: [
      { name: 'config.get', outcome: 'resolved', value: '{"namespaces":[]}' },
      { name: 'localFiles.getUrl', outcome: 'resolved', value: '"/xaihi/files/x"' },
      { name: 'config.openFile', outcome: 'refused', reason: 'no-provider', detail: '外壳那半边没有 openDocument' },
      { name: 'actions.run', outcome: 'refused', reason: 'capability-refused', detail: '命令执行面等提案 P1' },
    ],
  }
  const cases = [
    { name: '现场全对 = 全绿', reading: good, expectFail: 0 },
    { name: '载体念成 postMessage = ① 红', reading: { ...good, carrierLine: 'xaihi realm: … 载体=postMessage · 等宿主握手' }, expectFail: 1 },
    { name: '组件没画出来 = ② 红', reading: { ...good, componentButtons: [], bodyLen: 1134, hasTextarea: false }, expectFail: 1 },
    { name: 'clipboard 悄悄成功（那就是在猜） = ③ 红', reading: { ...good, clipboard: { ok: true, value: '"x"' } }, expectFail: 1 },
    { name: 'downloads 失败 = ④ 红（自兑现那一格不能凭空消失）', reading: { ...good, downloads: { ok: false, reason: 'refused', detail: 'x' } }, expectFail: 1 },
    { name: '新会话读不到标记 = ⑤ 红（写在窗内而不是对面）', reading: { ...good, secondPageHasMarker: false, secondPageData: '{"marks":["旧"]}' }, expectFail: 1 },
    { name: '没人兑现的一组回成 resolved = ⑧ 红（注入面替缺勤作答）', reading: { ...good, coverage: [...good.coverage, { name: 'workspace.listComponents', outcome: 'resolved', value: '[]' }] }, expectFail: 1 },
    { name: '覆盖表里冒出一条挂住的 = ⑥ 红', reading: { ...good, coverage: [...good.coverage, { name: 'runner.getInfo', outcome: 'timeout', reason: '', detail: '' }] }, expectFail: 1 },
    { name: 'config.openFile 静默成功（那是假绿）= ⑦ 红', reading: { ...good, coverage: good.coverage.map((c) => c.name === 'config.openFile' ? { ...c, outcome: 'resolved', value: 'null' } : c) }, expectFail: 1 },
  ]
  let failures = 0
  for (const testCase of cases) {
    const red = judge(testCase.reading).filter((row) => !row.pass)
    const ok = red.length === testCase.expectFail
    if (!ok) failures += 1
    console.log(`${ok ? '✓' : '×'} 对照 ${testCase.name} ⇒ 红 ${String(red.length)} 条，期望 ${String(testCase.expectFail)}${red.length > 0 ? `（${red[0].label.slice(0, 26)}）` : ''}`)
  }
  console.log(`check-nodeface-live --self-check: ${failures === 0 ? '尺看得见违规' : `${String(failures)} 条对照不符`}`)
  return failures === 0
}

if (args.includes('--self-check')) process.exit(selfCheck() ? 0 : 1)

let reading
try {
  reading = await gather()
} catch (error) {
  console.error(`check-nodeface-live: 取不到现场 ⇒ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
console.log('现场读数 ⇒ ' + JSON.stringify({ stateKey: reading.stateKey, nodeface: reading.nodefaceAttr, flushError: reading.flushError, buttons: reading.componentButtons.length, secondPageData: reading.secondPageData }, null, 1))
console.log('覆盖表（节点界面实际会调的成员，逐个照组件的调用形状问一遍）：')
const describeRow = (row) => {
  const bits = [row.outcome]
  if (typeof row.reason === 'string' && row.reason !== '') bits.push(row.reason)
  if (typeof row.detail === 'string' && row.detail !== '') bits.push(row.detail.slice(0, 76))
  if (typeof row.value === 'string' && row.value !== '') bits.push(row.value.slice(0, 50))
  return `  ${row.name.padEnd(24)} ${bits.join(' · ')}`
}
for (const row of reading.coverage ?? []) console.log(describeRow(row))
let failed = 0
for (const row of judge(reading)) {
  console.log(`${row.pass ? 'OK  ' : 'FAIL'} ${row.label}｜${row.detail}`)
  if (!row.pass) failed += 1
}
process.exit(failed === 0 ? 0 : 1)
