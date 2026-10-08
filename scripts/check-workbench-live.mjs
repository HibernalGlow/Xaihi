/**
 * 生产工作台文档（`dist-ui`）的活体往返取证。
 *
 * 为什么单独一份、而不并进 `check-realm-live.mjs`：那份量的是**探针文档**（`dist-realm`，
 * `realm-entry.tsx` 画的 `[data-xaihi-host-roundtrip]` 板），正题是"这份文档的装配注入了
 * 工作台清单"。这一份量的是**真产物**（`dist-ui` = `document/main.tsx` + 整棵搬运树，
 * 809 个文件），正题就是使用者那句话：**打开这个工作台以后，工作台与插件之间真的通上了**。
 *
 * 判据源有两处，缺一不可：
 * - `globalThis.__XAIHI_REALM__.lines`——realm 协商读数的账本。2026-10-07 起这块读数不再画在
 *   页面左下角（使用者拍板：黑框日志撤掉，读数走日志模块 `xiranite:realm`），取证从这里读回。
 * - `globalThis.__XAIHI_REALM__.bridge.ready()`——结构化那一份。账本只留最后 12 行，握手那行
 *   可能被后面的往返读数顶掉，所以"granted 里到底有哪几组"要以这份为准。
 *
 * 服务器是现拼的，但拼的是**真实现**：`uiBundleHandler`（`packages/core` 路由本体，
 * 宿主那份 `/xaihi/ui/<rev>/…` 就是它）+ `hostBridgeHandler`（同一条 `/xaihi/host`）。
 * 为什么不 `pnpm host` 起真宿主：真宿主那条路走的是**槽内**（`postMessage` 载体，宿主文档嵌
 * 在 DSH 的 slot 里），而这份文档当顶层窗打开时走的是 `host-http` 载体（`window.parent===window`）。
 * 两条载体共用同一套消息与失败词，但只有这条能在一个进程里起完收完（后台起的宿主会随 Bash
 * 调用返回被杀）。真宿主那条由 `check-realm-live.mjs` 与 `pnpm host` 覆盖。
 *
 * 用法：
 *   chrome-headless-shell --no-sandbox --user-data-dir=$(mktemp -d) --remote-debugging-port=9339 about:blank &
 *   node scripts/check-workbench-live.mjs
 *   node scripts/check-workbench-live.mjs --no-settings      # 减法跑测：摘掉设置面，③④⑤ 必须变红
 *   node scripts/check-workbench-live.mjs --empty-host       # 减法跑测：不预置快照，⑥ 必须变红
 *   node scripts/check-workbench-live.mjs --self-check        # 只跑尺，不要现场
 *
 * @module xaihi-scripts/check-workbench-live
 */

import { createServer } from 'node:http'
import { realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { hostBridgeHandler, HOST_PATH } from '../packages/core/lib/host-routes.js'
import { computeRev } from '../packages/core/lib/registry.js'
import { uiBundleHandler, UI_PATH_PREFIX } from '../packages/core/lib/routes.js'

const { values: flags } = parseArgs({
  options: {
    cdp: { type: 'string', default: '9339' },
    dir: { type: 'string', default: 'packages/ui-host/dist-ui' },
    'no-settings': { type: 'boolean', default: false },
    'empty-host': { type: 'boolean', default: false },
    'self-check': { type: 'boolean', default: false },
  },
})
const CDP = Number(flags.cdp)
const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * 预置给宿主的那一份工作区快照。
 *
 * 为什么要预置而不是"让工作台自己长一个"：⑥ 要证的是**工作台从宿主读到了自己的数据**，
 * 不是在文档里凭空多出一份。形状按 `packages/shared/src/index.ts` 的 `workspaceSnapshotSchema`：
 * `workspaces[].{id,label,createdAt,updatedAt}` 是必填那四格（`label` 会被画在界面上，
 * 所以它是这条判据的抓手）。
 */
const PRESET_LABEL = '活体探针工作区'
const PRESET_SNAPSHOT = {
  workspaces: [{ id: 'ws-live-probe', label: PRESET_LABEL, createdAt: 1, updatedAt: 1 }],
  lanes: [],
  components: [],
}

/**
 * 假的宿主设置面。
 *
 * 形状按 `@deepseek-ai/dsh-settings` 的 `SettingsServiceLike`（`describe` / `update` / `mutate`）。
 * **`describe()` 回的是行数组，不是 `{namespaces:[…]}`** —— 这条分两层，第一版在这里写错过一次：
 * `SettingsServiceLike.describe()` → `readonly unknown[]`（DSH 的 `SettingsForms` 形状），
 * 而 `fenceSettings()` 把它 filter 成 `{namespaces:[…]}` 之后才成为 `SettingsFace`；
 * `bridge-shell.ts` 的 `readNamespace` / `readNodeSnapshot` 读的是**后者**。写成对象会在
 * `fenceSettings` 里当场炸成 `service.describe(...).filter is not a function`，
 * 而那条错走桥回来只剩一句 `reason=threw`，看着像产品缺陷。
 *
 * 每行的形状只需 `{ ns, value, revision }`：那三个字段就是 `readNamespace` 与
 * `readNodeSnapshot` 真读的三格（`value.nodeState` 是状态那一段）。
 *
 * 为什么是假的而不是接真宿主：这条量的是"桥通不通"，不是"DSH 存得对不对"（后者有宿主的
 * 判据）。真宿主那条见 `check-realm-live.mjs`。
 */
function fakeSettings (preset) {
  let revision = 1
  let core = preset === null ? { nodeState: {} } : { nodeState: { 'xaihi-workspace': JSON.stringify(preset) } }
  return {
    describe: () => [
      { ns: 'xaihi-core', value: core, revision },
      { ns: 'xaihi-ui', value: { theme: 'md3' }, revision },
    ],
    update: async (ns, values) => {
      revision += 1
      if (ns === 'xaihi-core') core = { ...core, ...values }
      return { ns, value: values, revision }
    },
    mutate: async (ns, ops) => {
      revision += 1
      if (ns === 'xaihi-core') {
        for (const op of ops) {
          // 只实现判据要用的那一条 `set`；路径形状是 `[STATE_SETTINGS_FIELD, nodeId]`。
          if (op.op === 'set' && Array.isArray(op.path) && op.path[0] === 'nodeState') {
            core = { ...core, nodeState: { ...core.nodeState, [String(op.path[1])]: op.value } }
          }
        }
      }
      return { ns, revision }
    },
  }
}

/** 起一次现场：真路由 + 真题面 + 真浏览器。 */
async function gather () {
  const dir = realpathSync(`${root}${flags.dir}`)
  const rev = computeRev(dir)
  const uiHandler = uiBundleHandler({ dir: () => dir, rev: () => rev })
  const service = flags['no-settings'] ? undefined : fakeSettings(flags['empty-host'] ? null : PRESET_SNAPSHOT)
  const hostBridge = hostBridgeHandler({
    settings: () => service,
    allowedNamespaces: () => new Set(['xaihi-core', 'xaihi-ui']),
  })

  const server = createServer((req, res) => {
    if ((req.url ?? '').startsWith(HOST_PATH)) {
      void hostBridge(req, res).catch(() => {
        // 处理器自己会写应答；这里只兜住"写了两遍"这类框架级错误，不让它掀掉服务器。
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"handler-threw"}')
      })
      return
    }
    uiHandler(req, res)
  })
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address()
  const docUrl = `http://127.0.0.1:${port}${UI_PATH_PREFIX}/${rev}/index.html`
  console.log(`产物目录 ${dir}`)
  console.log(`算出的 rev ${rev}`)
  console.log(`文档 URL ${docUrl}`)
  console.log(`设置面 ${flags['no-settings'] ? '（减法跑测：摘掉）' : '（假面：xaihi-core + xaihi-ui）'}`)

  const close = () => { server.close() }
  try {
    const reading = await readThroughCdp(docUrl)
    // 工作台的持久写有 500ms 防抖（`workspaceContext.tsx` 的 persist effect），所以这里再等一趟
    // 才读得到它有没有把快照写进 `xaihi-core.nodeState`。假面就在本进程里，直接读它比再穿一次 CDP 便宜。
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const core = service === undefined ? undefined : service.describe().find((row) => row.ns === 'xaihi-core')
    const nodeState = core?.value?.nodeState
    return {
      ...reading,
      nodeStateKeys: nodeState === undefined || nodeState === null ? null : Object.keys(nodeState),
      docUrl,
    }
  } finally {
    close()
  }
}

/** 连 CDP，把生产文档打开，等它离开"等握手"，把板文本与结构化 ready 一起读回来。 */
async function readThroughCdp (docUrl) {
  const targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  if (page?.webSocketDebuggerUrl === undefined) {
    throw new Error(`${CDP} 上没有可连的页面 ⇒ 先起无窗口浏览器：chrome-headless-shell --no-sandbox --user-data-dir=$(mktemp -d) --remote-debugging-port=${CDP} about:blank`)
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('CDP ws 连不上')) })

  let seq = 0
  const pending = new Map()
  const exceptions = []
  const consoleErrors = []
  const infoLines = []
  const networkFailed = []
  const networkBad = []
  /** 文档打出去的 `/xaihi/host` 请求（② 的硬证据：不是"板上写着 host-http"，是真发过）。 */
  const hostPosts = []
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== undefined) {
      pending.get(msg.id)?.(msg)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const details = msg.params?.exceptionDetails ?? {}
      exceptions.push(String(details.exception?.description ?? details.text ?? '').split('\n')[0].slice(0, 220))
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params?.args ?? []).map((a) => String(a.value ?? a.description ?? '')).join(' ')
      if (msg.params?.type === 'error' || msg.params?.type === 'warning') consoleErrors.push(`[${String(msg.params.type)}] ${text.slice(0, 220)}`)
      if (text.includes('[Xaihi]')) infoLines.push(text.slice(0, 220))
    }
    // 产物分块取不回来时，`lazy()` 会**永远**停在 Suspense fallback（那是个空 div），
    // 而 404 不走 console、也不抛异常 —— 只抓 console 与 exception 会把"白屏"读成"没问题"。
    if (msg.method === 'Network.loadingFailed') {
      networkFailed.push(`${String(msg.params?.type)} ${String(msg.params?.errorText)}`.slice(0, 200))
    }
    if (msg.method === 'Network.responseReceived' && Number(msg.params?.response?.status) >= 400) {
      networkBad.push(`${String(msg.params?.response?.status)} ${String(msg.params?.response?.url).slice(-90)}`)
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const url = String(msg.params?.request?.url ?? '')
      if (url.includes('/xaihi/host')) hostPosts.push(`${String(msg.params?.request?.method)} ${new URL(url).pathname}${new URL(url).search}`)
    }
  }
  const send = (method, params) => new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (reply.result?.exceptionDetails !== undefined) {
      return { threw: String(reply.result.exceptionDetails.exception?.description ?? '').slice(0, 220) }
    }
    return reply.result?.result?.value
  }

  await send('Runtime.enable', {})
  await send('Page.enable', {})
  // ② 要的证据在网络里：`Network.enable` 必须在 `Page.navigate` **之前**，否则文件刚开始加载的
  // 那几发请求（其中就有第一发 `/xaihi/host` 的 hello）不会被报上来。
  await send('Network.enable', {})
  await send('Page.navigate', { url: docUrl })

  // 握手是异步的（`hello` 出去、ready 回来，中间还可能有几轮 200ms 轮询），
  // 而 `probeRoundTrip` / `probeStatePersistence` 又排在握手之后 —— 所以要等的是**那两条读数**，
  // 不是"账本出现了"。它们都没出现也照常返回，交给判据去红。
  //
  // **但桥通了不等于工作台画出来了**：`WorkspaceLayout` 走 `lazy()`，它的分块下来 + 渲染一轮
  // 比握手晚得多。只在桥 settled 时就取快照，会读到 `App.tsx` 那行 `<Suspense fallback={<div
  // className="h-screen bg-background" />}>` 的空 div，而那个 fallback 与"真工作台"在字节上
  // 差 40 倍、在判据①上却都能过（2026-10-07 实测过一次，`innerHTML=595B` 被读成了"非白屏"）。
  // 所以两个条件都要：桥 settled **且** 顶栏画出来了。
  let realmReading = null
  for (let tries = 0; tries < 150; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const raw = await evaluate(`(() => {
      const realm = globalThis.__XAIHI_REALM__
      const root = document.getElementById('xaihi-ui-root')
      return JSON.stringify({
        realmLog: realm ? (realm.lines ?? []).join('\n') : null,
        rootHtml: root ? root.innerHTML.length : -1,
        mounted: document.querySelector('.xiranite-topbar') !== null,
      })
    })()`)
    if (raw === null || typeof raw !== 'string') continue
    const value = JSON.parse(raw)
    realmReading = value
    const text = String(value.realmLog ?? '')
    const bridgeSettled = text.includes('granted=') && (text.includes('config.get') || text.includes('刷后=') || text.includes('state 半边'))
    if (bridgeSettled && value.mounted) break
  }
  // 顶栏画出来 ≠ 快照灌进 store 了：`loadWorkspaceSnapshotFromHost` 那一次往返挂在 `useQuery` 上，
  // `hydrate` 又是它后面另一个 effect。留一趟再取快照，否则 ⑥ 会在"数据还在路上"时读成红。
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const snapshot = await evaluate(`(() => {
    const realm = globalThis.__XAIHI_REALM__
    const root = document.getElementById('xaihi-ui-root')
    const ready = realm ? realm.bridge.ready() : null
    return JSON.stringify({
      realmLog: realm ? (realm.lines ?? []).join('\n') : null,
      ready: ready === null ? null : {
        granted: ready.granted, refused: ready.refused, settingsNs: ready.settingsNs ?? null,
        env: ready.env === undefined ? null : ready.env,
      },
      rootChildren: root ? root.childElementCount : -1,
      rootHtml: root ? root.innerHTML.length : -1,
      mounted: document.querySelector('.xiranite-topbar') !== null,
      // ⑥ 的抓手在**可见文本**里搜，不在 HTML 片段里搜：工作区名可能画在很深的地方，
      // 截 3000 字的片段会漏，而 innerText 是整页的。
      hasPresetLabel: document.body.innerText.includes('活体探针工作区'),
      // ⑦ 要搜的是**可见文本**，不是 HTML：那条报错是渲染出来的，而 __XIRANITE_BACKEND__
      // 这个字面串在打包后的 JS 里本来就还有几处（注释/常量名），搜 HTML 会一律报红。
      visibleText: document.body.innerText.slice(0, 4000),
      rootHtmlText: root ? root.innerHTML.slice(0, 3000) : null,
      rootOuter: root ? root.outerHTML : null,
      title: document.title,
      topLevel: window.parent === window,
      boot: realm ? realm.boot : null,
      // 分块被 lazy() 拉取的地址就在这份清单里。publicPath 配错时它们会打在产物目录之外
      // （比如 /2015.js 而不是 /xaihi/ui/<rev>/2015.js），而那种 404 在页面上只表现为
      // "Suspense fallback 一直挂着" —— 一个空 div，看不出是网络问题。
      resources: performance.getEntriesByType('resource')
        .map((entry) => entry.initiatorType + ' ' + entry.name)
        .filter((row) => row.includes('.js') || row.includes('.css'))
        .slice(-24),
    })
  })()`)
  ws.close()
  if (snapshot === null || typeof snapshot !== 'string') throw new Error('读不回来现场（页面可能没起来）')
  const reading = JSON.parse(snapshot)
  // 工作台那一份 DOM 落一份到盘上：判据红的时候要能看出"缺口到底在哪一格"，
  // 而不是只能看到 3000 字的片段。路径写出来，别让人猜。
  if (typeof reading.rootOuter === 'string' && reading.rootOuter !== '') {
    try {
      writeFileSync('/tmp/xaihi-workbench-dom.html', reading.rootOuter)
    } catch { /* 落不了盘不影响判据 */ }
  }
  return {
    ...reading,
    realmLog: realmReading?.realmLog ?? reading.realmLog,
    lines: String(reading.realmLog ?? '').split('\n').map((row) => row.trim()).filter((row) => row !== ''),
    exceptions,
    consoleErrors,
    infoLines,
    networkFailed,
    networkBad,
    hostPosts,
  }
}

/**
 * 一份读数判五条。
 *
 * ①② 是"打开这个工作台"这一步本身；③④⑤ 是"工作台与插件之间互相通信"这一步。
 * @param r - `readThroughCdp` 的返回。
 * @returns 每条判据一行，红的那条带上下文。
 */
export function judge (r) {
  const checks = []
  const need = (label, ok, detail) => { checks.push({ ok, label, detail }) }
  const realmLog = String(r.realmLog ?? '')
  const ready = r.ready ?? null
  const granted = Array.isArray(ready?.granted) ? ready.granted : []
  const refused = Array.isArray(ready?.refused) ? ready.refused : []

  // ① 白屏是这条最贵的失败模式：桥通不通都还看得见，工作台画不出来就什么都谈不上。
  //    判据取"顶栏画出来了 + DOM 有量"，**不是** `innerHTML.length > 0`：`App.tsx` 的
  //    Suspense fallback 就是一个 `<div class="h-screen bg-background">`，它在 DOM 里也非空。
  need('① 工作台真挂起来了（顶栏画出来了，不是 Suspense 的空 fallback）',
    r.mounted === true && r.rootHtml > 3000,
    `顶栏=${String(r.mounted)} innerHTML=${String(r.rootHtml)}B title=${JSON.stringify(String(r.title ?? ''))}`)

  // ② 载体必须是 host-http。两个源合起来证：`window.parent === window` 是 `realm.ts` 选载体的
  //    **真源**（`realm.ts` 那条三目就是按它算的），而网络里必须有真的 `POST /xaihi/host`。
  //    **不去读**账本里那行"载体=host-http"：账本只留最后 12 行（`realm.ts` 的 `MAX_REPORT_LINES`），
  //    握手之后那行会被三行往返读数顶掉 —— 2026-10-07 实测红过一次，
  //    而它红的时候链路是好的。判据读一个会被覆盖的展示位，红绿就只反映时序而不反映对错。
  const hostPosts = r.hostPosts ?? []
  need('② 载体是 host-http（顶层文档真的在打 Xaihi 自己的 /xaihi/host）',
    r.topLevel === true && hostPosts.length > 0,
    `window.parent===window: ${String(r.topLevel)}；POST /xaihi/host 发出 ${String(hostPosts.length)} 次${hostPosts.length > 0 ? `（首次 ${hostPosts[0]}）` : '（一次都没打 ⇒ 载体没接上）'}`)

  // ③ 握手是 granted 而不是 refused。期望的三组**按这条载体能给什么**定，不是照抄契约里的
  //    `REQUIRED_CAPABILITIES`：这里量的是**顶层窗**路径（`host-http`），而 `env` 在这条路上被拒
  //    是 `HOST_REFUSAL_REASONS.env` 写死的裁定——"顶层窗的宿主主题要由壳报给窗（那是壳侧的一条
  //    新动词，不是这条路由该猜的东西）；此刻按退化显示"。硬要它 granted，就是把一条**已裁定
  //    的退化**读成回归（`realm.ts` 自己也把它单列成"必给却没兑现"，那是可见的读数，不是沉默）。
  //    env 真正带上是在**槽内**（`postMessage`）那条：`shellCapsFrom` 由 `preference` + `prefersDark`
  //    解出来，而那条要起真宿主 —— 见 `check-realm-live.mjs` 与 `pnpm host`。
  need('③ 握手拿到了顶层窗路径能给的三组（contract / state / config）',
    ready !== null && ['contract', 'state', 'config'].every((id) => granted.includes(id)),
    ready === null ? '(__XAIHI_REALM__.bridge.ready() 还是 null ⇒ 桥没协商成)' : `granted=[${granted.join(', ')}] refused=[${refused.join(', ')}]${refused.includes('env') ? '（env 被拒是顶层窗路径的设计：主题要由壳侧新动词报进来）' : ''}`)

  // ④ 正题：真动词穿过桥落到设置面。只看 granted=[…] 证的是"外壳接了这条桥"，
  //    这一条证的是"外壳能用设置面服务这个文档"（realm.ts 的 probeRoundTrip 就是为此存在）。
  need('④ config.get 真动词往返成功（工作台问到了插件的配置）',
    realmLog.includes('config.get 往返成功'),
    r.lines.find((row) => row.includes('config.get')) ?? '(realm 读数里没有 config.get 那一行)')

  // ⑤ state 那半边的持久路径走的是**生产代码**（createPersistedState），落点是 xaihi-core.nodeState。
  //    刷后必须是 ok：settings 面给了却刷不上去，就是"保存静默不落盘"那条老毛病。
  need('⑤ state 半边刷后 ok（持久那份真落了盘，落点 xaihi-core.nodeState）',
    /刷后=ok/u.test(realmLog),
    r.lines.find((row) => row.includes('state 半边')) ?? '(realm 读数里没有 state 半边那一行)')

  // ⑥ 正题的另一半：桥通了、工作台也画出来了，那**数据是从哪来的**？这条证的是工作台真的
  //    向宿主要了自己的快照。假面里预置了一份 `xaihi-workspace`（`workspaceContext.tsx:53`
  //    那个键），它只可能从桥的 `state.getData` 那一次调用回来（`loadWorkspaceSnapshotFromHost`）——
  //    这一份文档里已经没有第二个端点可以问（③ 那三组之外没有别的通路）。
  need('⑥ 工作台从宿主读到了自己的快照（预置的工作区名画在了界面上）',
    r.hasPresetLabel === true,
    r.hasPresetLabel === true
      ? `界面上有预置的 "${PRESET_LABEL}"`
      : `界面上没有预置的 "${PRESET_LABEL}" ⇒ 快照没从宿主要回来，或没灌进 store`)

  // ⑦ 界面上不得出现那条**在本仓已作废**的报错。`BackendStatusBanner` 读的是 Xiranite 的
  //    Go 本地后端（REST 健康检查），在本仓永远报 `missing-config`，于是每打开一次工作台就
  //    常驻一条"去设 `window.__XIRANITE_BACKEND__`"——而那个全局量恰恰是 2026-10-07 拍板撤掉的
  //    东西（`document/main.tsx` 里那段兜底已删）。一条要求使用者去配本仓不存在的东西的报错，
  //    比没有报错更坏：它把"已经改成走 DSH 标准面"这件事在界面上说反了。
  const visible = String(r.visibleText ?? '')
  const doomedHint = /__XIRANITE_BACKEND__|Local Backend could not start/u.test(visible)
  need('⑦ 界面上没有那条已作废的"本地后端"报错',
    !doomedHint,
    doomedHint
      ? `界面上还在要求使用者去配已作废的全局量：${(visible.match(/.{0,50}(?:__XIRANITE_BACKEND__|Local Backend could not start).{0,70}/u)?.[0] ?? '').trim()}`
      : '界面上没有那条报错')

  return checks
}

/** 阳性对照：每份坏读数只破一条，其余仍要过 ⇒ 这把尺看得见违规。期望值全是手写的。 */
function selfCheck () {
  const good = {
    rootChildren: 2,
    rootHtml: 25177,
    mounted: true,
    hasPresetLabel: true,
    topLevel: true,
    hostPosts: ['POST /xaihi/host?sid=0123456789abcdef0123456789abcdef'],
    visibleText: 'Xaihi 主工作区 活体探针工作区 canvas is empty Deploy modules from the registry',
    title: 'Xaihi',
    ready: { granted: ['contract', 'state', 'config', 'workspace'], refused: ['runner', 'clipboard', 'localFiles', 'downloads', 'env'], settingsNs: 'xaihi-core', env: null },
    realmLog: [
      'xaihi realm: rev=abcdef012345 node= React=19.2.4 载体=host-http · 等宿主握手',
      'xaihi realm: rev=abcdef012345 React=19.2.4 granted=[contract, state, config, workspace] refused=[runner, clipboard, localFiles, downloads, env] env 快照：没带',
      '必给却没兑现：env: 顶层窗的宿主主题要由壳报给窗（那是壳侧的一条新动词，不是这条路由该猜的东西）；此刻按退化显示',
      'xaihi realm: config.get 往返成功 12ms · {"namespaces":[{"ns":"xaihi-core","revision":1}]}',
      'state 半边（node=workbench）：预取到=false 改前=null 本地即时={"marks":["run@1"]} 刷后=ok',
    ].join('\n'),
  }
  good.lines = good.realmLog.split('\n')
  const cases = [
    { name: '停在 Suspense 的空 fallback（顶栏没画出来）= ① 红', reading: { ...good, mounted: false, rootHtml: 595 }, expectFail: 1 },
    { name: '载体选成 postMessage（顶层文档却去问父帧）= ② 红', reading: { ...good, topLevel: false, hostPosts: [] }, expectFail: 1 },
    { name: '顶层但一次都没打过 /xaihi/host（载体没接上）= ② 红', reading: { ...good, hostPosts: [] }, expectFail: 1 },
    { name: '握手还没成（ready 是 null）= ③ 红', reading: { ...good, ready: null }, expectFail: 1 },
    { name: 'state 被拒（顶层窗该给的三组缺二）= ③ 红', reading: { ...good, ready: { ...good.ready, granted: ['contract'] } }, expectFail: 1 },
    { name: 'config.get 没走通 = ④ 红', reading: { ...good, realmLog: good.realmLog.replace(/config\.get 往返成功[^\n]*/u, 'xaihi realm: config.get 没走通 reason=no-provider') }, expectFail: 1 },
    { name: 'state 刷失败 = ⑤ 红', reading: { ...good, realmLog: good.realmLog.replace('刷后=ok', '刷后=失败 SETTINGS_CONFLICT') }, expectFail: 1 },
    { name: '预置快照没画出来（工作台没向宿主要数据）= ⑥ 红', reading: { ...good, hasPresetLabel: false }, expectFail: 1 },
    { name: '界面还在要 __XIRANITE_BACKEND__ = ⑦ 红', reading: { ...good, visibleText: 'Local Backend could not start: Xiranite local backend is not configured. Set window.__XIRANITE_BACKEND__ or VITE_XIRANITE_BACKEND_URL.' }, expectFail: 1 },
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
      console.log(`✓ 对照 ${bad.name} ⇒ 红 ${failed.length} 条，期望 ${bad.expectFail}（${failed[0]?.label.slice(0, 26) ?? ''}）`)
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  × ${problem}`)
    return 1
  }
  console.log('check-workbench-live --self-check OK（尺看得见违规）')
  return 0
}

if (flags['self-check']) process.exit(selfCheck())

let rc = 1
try {
  const reading = await gather()
  console.log(`\nrealm 读数（__XAIHI_REALM__.lines）⇒\n${String(reading.realmLog ?? '(空)').split('\n').map((row) => `  | ${row}`).join('\n')}`)
  console.log(`\n装配自述 ⇒ ${reading.infoLines.length === 0 ? '(没有 [Xaihi] 那行)' : reading.infoLines.join(' ｜ ')}`)
  console.log(`未捕获异常 ⇒ ${reading.exceptions.length === 0 ? '无' : reading.exceptions.join(' ｜ ')}`)
  console.log(`控制台 error/warning ⇒ ${reading.consoleErrors.length === 0 ? '无' : reading.consoleErrors.slice(0, 5).join(' ｜ ')}`)
  console.log(`xaihi-core.nodeState 的键 ⇒ ${reading.nodeStateKeys === null ? '(没有设置面)' : JSON.stringify(reading.nodeStateKeys)}`)
  console.log(`预置快照画进界面 ⇒ ${String(reading.hasPresetLabel)}（工作台 DOM 全文落在 /tmp/xaihi-workbench-dom.html）`)
  console.log(`打过的 /xaihi/host ⇒ ${reading.hostPosts.length === 0 ? '(一次都没打)' : reading.hostPosts.slice(0, 3).join(' ｜ ')}${reading.hostPosts.length > 3 ? ` …共 ${String(reading.hostPosts.length)} 次` : ''}`)
  console.log(`网络失败 ⇒ ${reading.networkFailed.length === 0 ? '无' : reading.networkFailed.slice(0, 6).join(' ｜ ')}`)
  console.log(`HTTP >=400 ⇒ ${reading.networkBad.length === 0 ? '无' : reading.networkBad.slice(0, 6).join(' ｜ ')}`)
  console.log(`加载过的 js/css ⇒ ${(reading.resources ?? []).map((row) => row.replace(/^[a-z]+ /u, '').replace(/^http:\/\/127\.0\.0\.1:\d+\/xaihi\/ui\/[0-9a-f]+\//u, './')).join(' ')}`)
  console.log(`工作台 DOM（前 900 字）⇒ ${String(reading.rootHtmlText ?? '(读不到)').replace(/\s+/gu, ' ').slice(0, 900)}`)
  console.log('')
  const rows = judge(reading)
  for (const row of rows) console.log(`${row.ok ? 'OK  ' : '×   '}${row.label}｜${row.detail}`)
  rc = rows.every((row) => row.ok) ? 0 : 1
} catch (error) {
  console.error(`× 取不到读数：${String(error instanceof Error ? error.message : error)}`)
}
process.exit(rc)
