/**
 * 跨文档那条桥的**真浏览器**往返取证。
 *
 * 为什么还要这一份：单测跑在 happy-dom 里，那里的 `postMessage` 不是真跨文档语义
 * （同源判定、`event.source` 的身份、消息结构化克隆的边界都是糊过去的）。
 * 这条脚本起一个真 http 服务，用两个真文档（外壳页 + iframe 里的文档页）跑一遍握手与四类调用，
 * 判据由页面自己算成 `RESULT: PASS/FAIL`，读回来的是一个可核对的清单而不是一句"看着对"。
 *
 * 被替身顶掉的东西只有一样，也印在结果里：`@deepseek-ai/dsh-tools`
 * ——`@hibernalglow/xaihi-sdk` 的 barrel 会 import 它（`defineNode` 用），而它是宿主侧包，
 * 浏览器解析不了。桥这条路一行都不碰它，所以替身不影响这条判据。
 *
 * 用法：`node scripts/bridge-live.mjs` 然后打开它打印的地址读 `#result`。
 * `--sabotage` 是减法跑测的入口：把设置面摘掉再跑一遍，结果必须从 PASS 变 FAIL。
 * 页面里那条「自证」判据守的是 add() 生效，这条守的是整条管路真能红 —— 只会绿的尺不算尺。
 *
 * @module scripts/bridge-live
 */

import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** 减法跑测开关：真把设置面摘掉，让判据必须变红。 */
const sabotage = process.argv.includes('--sabotage')
const sdkDir = `${root}packages/node-sdk/lib`

const parentPage = /* html */ `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>Xaihi bridge live — shell</title>
<script type="importmap">
{ "imports": {
  "@hibernalglow/xaihi-sdk": "/sdk/index.js",
  "@deepseek-ai/dsh-tools": "/stub-dsh-tools.js"
} }
</script></head>
<body>
<h3>Xaihi 桥 · 外壳这一面</h3>
<pre id="shell-log">（等 iframe）</pre>
<iframe id="doc" src="/child.html" style="width:100%;height:220px;border:1px solid #888"></iframe>
<pre id="result">RESULT: 未开始</pre>
<script type="module">
import { createShellBridge } from '@hibernalglow/xaihi-sdk'

const frame = document.getElementById('doc')
const shellLog = []
const note = (line) => { shellLog.push(line); document.getElementById('shell-log').textContent = shellLog.join('\\n') }

const calls = []
// SABOTAGE 是服务端插进来的**字面量**：直接把 Node 侧的 sabotage 写进页面脚本会 ReferenceError，
// 而那条错发生在母页模块顶层，后果是 __reportFromDocument 从没定义、子页回报静默失败 —— 症状是「未开始」而不是报错。
const SABOTAGE = ${sabotage}
const caps = {
  settings: SABOTAGE ? undefined : {
    describe: () => { calls.push('describe'); return { namespaces: ['xaihi'], revision: 7 } },
    update: async (ns, patch, revision) => { calls.push(['update', ns, patch, revision]); return { revision: (revision ?? 0) + 1 } },
  },
  // runner 故意不给：文档侧应当读到一条看得懂的 refused，而不是一个假的 run。
  reasons: { runner: '宿主没接运行面（面板拿不到 agentId，提案 P1）' },
  env: { theme: 'dark', platform: 'linux' },
}

const bridge = createShellBridge(caps, (message) => frame.contentWindow.postMessage(message, '*'), window.location.origin)
let swallowed = 0
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return
  // 故意吞掉带这条标记的请求：桥的 30 秒超时是契约的一部分，而它**只能**在真浏览器里量——
  // 在 happy-dom 里量到的是「我的假件按时报了错」，不是「这条桥真的会等到放弃」。
  // 只吞带 __swallow__ 标记那一条，同一个方法另外那一条照常回答，两侧互为对照。
  // （这一串注释不能写反引号：整页是一个模板字符串，反引号会提前把它关掉。这个坑我今天踩了第二次。）
  const data = event.data
  if (data?.kind === 'request' && data.method === 'config.get' && Array.isArray(data.args) && data.args.includes('__swallow__')) {
    swallowed += 1
    return
  }
  void bridge.receive(event.data, event.origin)
})

window.__reportFromDocument = (text) => {
  // 报告这一段自己也不能静默死掉，否则外壳只会停在「未开始」。
  try { report(text) } catch (error) {
    document.getElementById('result').textContent = 'RESULT: FAIL\\n  外壳侧报告自己抛了：' + (error && error.message ? error.message : String(error))
  }
}

function report(text) {
  const checks = []
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail })
  const doc = JSON.parse(text)

  add('外壳收到握手', doc.ready !== undefined, JSON.stringify(doc.ready?.granted))
  add('config 被授予', !!doc.ready?.granted?.includes('config'))
  add('runner 被拒且带原因', !!doc.ready?.refused?.includes('runner')
    && (doc.ready?.degraded ?? []).some((row) => row.capability === 'runner' && row.reason.length > 0))
  add('env 走握手带到文档', doc.env?.theme === 'dark' && doc.env?.platform === 'linux', JSON.stringify(doc.env))
  add('config.get 回到原值', JSON.stringify(doc.got) === JSON.stringify({ namespaces: ['xaihi'], revision: 7 }), JSON.stringify(doc.got ?? doc.gotReason))
  add('config.save 三段没走样', JSON.stringify(doc.savedTo) === JSON.stringify(['sleept', { blockSleep: true }, 3]), JSON.stringify(doc.savedTo ?? doc.savedReason))
  add('没授予的组报 refused', doc.refusedReason === 'refused', String(doc.refusedReason))
  add('授予了但没提供者报 no-provider', doc.noProviderReason === 'no-provider', String(doc.noProviderReason))
  add('畸形 method 整条不理', doc.badMethodIgnored === true, String(doc.badMethodIgnored))
  // 超时这条要连"用了多久"一起断：只断 reason 的话，一个立刻拒绝的实现也能过，
  // 而那量的就不是上界了。同一方法的另一条（不带标记）在前面正常答到，互为对照。
  add('无应答的请求按上界报 timeout', doc.timeoutReason === 'timeout' && doc.timeoutMs >= 29000,
    'reason=' + String(doc.timeoutReason) + ' 等了=' + String(doc.timeoutMs) + 'ms 外壳吞掉=' + String(swallowed) + ' 条')
  add('外壳真的被调到了两次 settings', calls.filter((c) => c === 'describe').length === 1
    && calls.filter((c) => Array.isArray(c)).length === 1, JSON.stringify(calls.map(String)))
  // 阳性对照：上面任何一条判据失败时，这里必须是 FAIL。全绿时这一条本身是"能失败"的自证。
  add('判据能失败（自证：故意塞一条假判据）', false, '这条应当在 PASS 结果里以 1 条失败出现——不出现说明 add() 没生效')

  const honest = checks.slice(0, -1)
  const failed = honest.filter((c) => !c.pass)
  const selfCheck = checks.at(-1)
  document.getElementById('result').textContent = [
    failed.length === 0 && selfCheck.pass === false ? 'RESULT: PASS' : 'RESULT: FAIL',
    ...honest.map((c) => (c.pass ? '  ok   ' : '  FAIL ') + c.name + (c.detail ? '  ' + c.detail : '')),
    '  自证 ' + (selfCheck.pass === false ? 'ok（判据确实会红）' : 'FAIL（判据看不见违规，这条结果不算数）'),
    '  替身：@deepseek-ai/dsh-tools（桥这条路不碰它）',
  ].join('\\n')
}
</script>
</body></html>`

const childPage = /* html */ `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>Xaihi bridge live — document</title>
<script type="importmap">
{ "imports": {
  "@hibernalglow/xaihi-sdk": "/sdk/index.js",
  "@deepseek-ai/dsh-tools": "/stub-dsh-tools.js"
} }
</script></head>
<body><pre id="doc-log">（等握手）</pre>
<script type="module">
import { NODE_CAPABILITY_IDS, createDocumentBridge } from '@hibernalglow/xaihi-sdk'

const out = { ready: undefined, env: undefined, got: undefined, savedTo: undefined }
// 每一步都留记号：挂住与抛错在页面上长得一样，没有记号就只能猜。
const steps = []
const step = (name) => { steps.push(name); document.getElementById('doc-log').textContent = steps.join(' → ') }
const bridge = createDocumentBridge((message) => window.parent.postMessage(message, window.location.origin), window.location.origin, [...NODE_CAPABILITY_IDS])
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return
  void bridge.receive(event.data, event.origin)
})

const reason = async (promise) => promise.then(() => undefined, (error) => error?.reason)
// 每条跨界调用都可能拒，而这份取证页**必须每次都走到报告那一步**：
// 半途抛错的话外壳只会停在「未开始」，一条只会回答 PASS 或"什么都没发生"的尺不算尺。
const settle = async (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, reason: error?.reason }))

const finish = () => {
  step('parent 有函数=' + (typeof window.parent.__reportFromDocument))
  window.parent.__reportFromDocument(JSON.stringify(out))
  document.getElementById('doc-log').textContent = '已回报：' + JSON.stringify(out)
}
// 半途出错也必须报：一条只会回答 PASS 或「什么都没发生」的尺不算尺。
window.addEventListener('error', (event) => {
  out.childError = String(event.message)
  try { finish() } catch { /* 报告本身也坏了才留给外壳判未开始 */ }
})

step('hello')
bridge.hello('sleept')
step('等 ready')
await new Promise((resolve) => setTimeout(resolve, 250))
step('ready 到手=' + (bridge.ready() !== null))
out.ready = bridge.ready() ?? undefined
out.env = out.ready?.env
step('调 config.get')
const got = await settle(bridge.call('config.get', 'sleept'))
step('config.get 回来')
out.got = got.ok ? got.value : undefined
out.gotReason = got.ok ? undefined : got.reason
const saved = await settle(bridge.call('config.save', 'sleept', { blockSleep: true }, 3))
out.savedTo = saved.ok ? ['sleept', { blockSleep: true }, 3] : undefined
out.savedReason = saved.ok ? undefined : saved.reason
out.refusedReason = await reason(bridge.call('downloads.text', 'a', 'b'))
out.noProviderReason = await reason(bridge.call('config.getVersions'))
// 畸形 method：SDK 的解析器应当整条拒掉，桥的另一侧不会应答。
const before = bridge.ready()?.granted?.length
window.parent.postMessage({ schema: 'xaihi.bridge/1', kind: 'request', id: 'bad', method: 'config.ge', args: [] }, window.location.origin)
await new Promise((resolve) => setTimeout(resolve, 120))
out.badMethodIgnored = bridge.ready()?.granted?.length === before
// 被吞掉的那一条：等真超时。这一段会占用约 30 秒，而那正是这条判据的内容——
// 快起来的"失败"说明量的不是上界，是别的东西。
step('等 timeout（约 30s）')
const timeoutAt = Date.now()
out.timeoutReason = await reason(bridge.call('config.get', 'sleept', '__swallow__'))
out.timeoutMs = Date.now() - timeoutAt
step('timeout 回来了=' + String(out.timeoutReason))
step('准备回报')

// 报告要交给**外壳那一份文档**的函数：两个文档同源，但全局对象不是同一个。
finish()
</script></body></html>`

const stub = 'export const defineTool = () => { throw new Error("stub: 浏览器侧不该调用宿主工具注册") }\nexport default { defineTool }\n'

const MIME = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8' }

const routes = {
  '/': parentPage,
  '/child.html': childPage,
  '/stub-dsh-tools.js': stub,
}

const server = createServer((req, res) => {
  let path
  try {
    path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  } catch {
    // 一个畸形请求打不死取证服务：它一死，页面只会停在「未开始」，那就又是"看着像没违规"。
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('bad request path')
    return
  }
  // SDK 的产物会有分片（rolldown 会拆出 bridge-shell-<hash>.js 这类文件），
  // 所以整条 /sdk/ 前缀按目录发，而不是列两个固定名 —— 固定名会在**下一次重新构建**之后静默 404，
  // 症状是子页停在「等握手」而 nobody 想到是取件路径写窄了（今天就是这么坏的）。
  if (path.startsWith('/sdk/')) {
    const rel = path.slice('/sdk/'.length)
    const file = `${sdkDir}/${rel}`
    if (!/^[A-Za-z0-9._-]+(\.[A-Za-z0-9]+)?$/.test(rel) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('no sdk file: ' + rel)
      return
    }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    res.end(readFileSync(file, 'utf8'))
    return
  }
  const entry = routes[path]
  if (entry === undefined) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const body = typeof entry === 'function' ? entry() : entry
  res.writeHead(200, { 'content-type': MIME[path.endsWith('.js') ? '.js' : '.html'], 'cache-control': 'no-store' })
  res.end(body)
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  console.log(`bridge-live${sabotage ? ' [SABOTAGE：设置面已摘掉，结果应当 FAIL]' : ''}: http://127.0.0.1:${port}/`)
  console.log('看 #result 那一段：全部判据成立时会写 RESULT: PASS')
})
