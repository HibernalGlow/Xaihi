/**
 * 两帧取证：一屏多框时，**谁的话归谁接**（真浏览器，不是 happy-dom）。
 *
 * 为什么单独一份而不是加进 `bridge-live.mjs`：那份证的是"一条桥能不能往返"，
 * 这一份证的是"两条桥同时存在时会不会互相接话"。ADR-0011 决定 3 说节点各自成窗用的是
 * 同一份文档 + 寻址参数 —— 那意味着外壳里会有**多个** iframe，每个都挂一座自己的桥。
 * 串框的症状不是"连不上"而是"A 节点的面板上出现了 B 节点的数据"，难查一个量级。
 *
 * 判据落在生产实现上：外壳侧两帧都用 SDK 的 `wireShellToFrame`（连同那条 `fromThisFrame` 闸），
 * 而不是在脚本里另写一份同款 —— 同款会跟着源码一起改坏，而脚本永远不会红。
 *
 * 跑法（Node 侧退出码由判决决定，见文件末尾）：
 *   node scripts/frame-isolation-live.mjs                       # 期望 RESULT: PASS
 *   node scripts/frame-isolation-live.mjs --sabotage=crosstalk  # 期望 RESULT: FAIL（这把尺看得见违规）
 *   node scripts/frame-isolation-live.mjs --print-pages          # 不落盘地把两份页面打到 stdout，查语法用
 *
 * @module xaihi-scripts/frame-isolation-live
 */

import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sdkDir = `${root}packages/node-sdk/lib`

/** `--sabotage=<名字>`；没给就是 'none'（正常档）。 */
const sabotage = (() => {
  const arg = process.argv.find((row) => row.startsWith('--sabotage='))
  return arg === undefined ? 'none' : arg.slice('--sabotage='.length)
})()

if (!existsSync(`${sdkDir}/index.js`)) {
  console.error(`缺 SDK 产物 ${sdkDir}/index.js —— 先跑 pnpm -r build 再跑这条脚本`)
  process.exit(2)
}

const importMap = /* html */ `<script type="importmap">
{ "imports": {
  "@hibernalglow/xaihi-sdk": "/sdk/index.js",
  "@deepseek-ai/dsh-tools": "/stub-dsh-tools.js"
} }
</script>`

const parentPage = /* html */ `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>Xaihi 两帧取证 — 外壳</title>
${importMap}</head>
<body>
<h3>Xaihi 桥 · 一屏两框</h3>
<div style="display:flex;gap:8px">
  <iframe id="alpha" src="/child.html?node=alpha" style="flex:1;height:200px;border:1px solid #888"></iframe>
  <iframe id="beta" src="/child.html?node=beta" style="flex:1;height:200px;border:1px solid #888"></iframe>
</div>
<pre id="counts">（还没收到桥消息）</pre>
<pre id="result">RESULT: 未开始</pre>
<script type="module">
import { wireShellToFrame } from '@hibernalglow/xaihi-sdk'

const BRIDGE_SCHEMA = 'xaihi.bridge/1'
// 服务端插进页面里的**字面量**：写错一次会让母页模块顶层就抛，症状是「未开始」而不是报错。
const SABOTAGE = ${JSON.stringify(sabotage)}

const lines = []
const note = (line) => { lines.push(line); document.getElementById('counts').textContent = lines.join('\\n') }

// 两条桥各接各的框，各带**互不相同**的能力面：串框时答案里的命名空间与 platform 会对不上。
const capsFor = (tag) => ({
  settings: {
    describe: () => ({ namespaces: [tag + '-ns'], revision: 1 }),
    update: async () => ({ revision: 2 }),
  },
  env: { theme: 'dark', platform: tag },
})

const frames = ['alpha', 'beta'].map((tag) => {
  const el = document.getElementById(tag)
  const wired = wireShellToFrame(capsFor(tag), window.location.origin, () => el)
  // 'crosstalk' 这一档把闸换成"永远说自己该接"。选它而不是当年那个 \`?? null\` 的洞：
  // 真浏览器里子帧发来的消息 source 永不为 null，那个洞在这一档下量不出来（它由
  // packages/ui-host/tests/document-frame.spec.ts 用假 event 钉住）。
  // 读数要说清楚：这一档下 strayReplies 仍是 0——每条桥各自往**自己那个框**回话，
  // 所以串框不表现为「A 收到 B 的应答」，而表现为**同一条消息被两条桥都接走**（双份处理、
  // 两次 settings 调用、两个 revision 互相追）。真正判红的是下面那条「恰被一条桥自认该接」。
  const claims = (event) => (SABOTAGE === 'crosstalk' ? true : wired.fromThisFrame(event))
  return { tag, el, wired, claims, claimed: 0 }
})

// 每条桥消息"被几条桥自认该接"：正常档必须恒为 1。0 = 静默丢弃，2 = 双份回答（串框）。
const claimCounts = []

window.addEventListener('message', (event) => {
  const data = event.data
  if (typeof data !== 'object' || data === null || data.schema !== BRIDGE_SCHEMA) return
  const hits = frames.filter((f) => f.claims(event))
  claimCounts.push(hits.length)
  hits.forEach((f) => { f.claimed += 1; void f.wired.bridge.receive(data, event.origin) })
  note('桥消息 kind=' + data.kind + '，自认该接的桥数=' + String(hits.length) + (hits.length === 1 ? '' : '  ← 不正常'))
})

const reports = {}
window.__reportFromDocument = (tag, text) => {
  reports[tag] = JSON.parse(text)
  if (Object.keys(reports).length === 2) {
    try { verdict() } catch (error) {
      document.getElementById('result').textContent = 'RESULT: FAIL\\n  判决自己抛了：' + (error && error.message ? error.message : String(error))
    }
  }
}

function verdict() {
  const checks = []
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail })
  const a = reports.alpha, b = reports.beta

  add('两框各自完成握手', a.readyGranted?.includes('config') === true && b.readyGranted?.includes('config') === true,
    'alpha=' + JSON.stringify(a.readyGranted) + ' beta=' + JSON.stringify(b.readyGranted))
  add('alpha 只会读到 alpha 那份设置面', JSON.stringify(a.namespaces) === JSON.stringify(['alpha-ns']), JSON.stringify(a.namespaces ?? a.configReason))
  add('beta 只会读到 beta 那份设置面', JSON.stringify(b.namespaces) === JSON.stringify(['beta-ns']), JSON.stringify(b.namespaces ?? b.configReason))
  add('env 按框分：beta 不会读到 alpha 的 platform', a.envPlatform === 'alpha' && b.envPlatform === 'beta', a.envPlatform + '/' + b.envPlatform)
  // 串框最直接的形状：一条应答落进没发过这条请求的框。
  add('alpha 没收到不属于它的应答', (a.strayReplies ?? -1) === 0, 'stray=' + String(a.strayReplies))
  add('beta 没收到不属于它的应答', (b.strayReplies ?? -1) === 0, 'stray=' + String(b.strayReplies))
  add('每条桥消息恰被一条桥自认该接', claimCounts.length >= 4 && claimCounts.every((n) => n === 1),
    '计数=' + JSON.stringify(claimCounts) + '（0=丢弃，2=双份）')
  add('两框的桥都真被调到（不是两边都静默）', a.repliesSeen >= 2 && b.repliesSeen >= 2, 'alpha=' + a.repliesSeen + ' beta=' + b.repliesSeen)
  // 阳性对照的自证：这条恒假，PASS 时必须以「1 条故意失败」出现。
  add('判据能失败（自证：故意塞一条假判据）', false, '这条应当在 PASS 结果里以 1 条失败出现——不出现说明 add() 没生效')

  const honest = checks.slice(0, -1)
  const failed = honest.filter((c) => !c.pass)
  const selfCheck = checks.at(-1)
  const head = failed.length === 0 && selfCheck.pass === false ? 'RESULT: PASS' : 'RESULT: FAIL'
  document.getElementById('result').textContent = [
    head,
    ...honest.map((c) => (c.pass ? '  ok   ' : '  FAIL ') + c.name + (c.detail ? '  ' + c.detail : '')),
    '  自证 ' + (selfCheck.pass === false ? 'ok（判据确实会红）' : 'FAIL（判据看不见违规，这条结果不算数）'),
    '  模式 sabotage=' + SABOTAGE,
  ].join('\\n')
  window.__verdictHead = head
}
</script>
</body></html>`

const childPage = /* html */ `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>Xaihi 两帧取证 — 文档</title>
${importMap}</head>
<body><pre id="doc-log">（等握手）</pre>
<script type="module">
import { NODE_CAPABILITY_IDS, createDocumentBridge } from '@hibernalglow/xaihi-sdk'

const node = new URLSearchParams(location.search).get('node') || 'anon'
const out = { node, repliesSeen: 0, strayReplies: 0 }
const issued = new Set()
const steps = []
const step = (name) => { steps.push(name); document.getElementById('doc-log').textContent = node + ': ' + steps.join(' → ') }

const bridge = createDocumentBridge((message) => {
  if (message.kind === 'request') issued.add(message.id)
  window.parent.postMessage(message, window.location.origin)
}, window.location.origin, [...NODE_CAPABILITY_IDS])

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return
  const data = event.data
  if (data && data.kind === 'response') {
    out.repliesSeen += 1
    // 没发过的 id 落进我这个框 = 串框。
    if (!issued.has(data.id)) out.strayReplies += 1
  }
  void bridge.receive(data, event.origin)
})

const settle = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, reason: error?.reason }))
const finish = () => {
  step('回报')
  window.parent.__reportFromDocument(node, JSON.stringify(out))
  document.getElementById('doc-log').textContent = node + ' 已回报：' + JSON.stringify(out)
}
// 半途出错也必须报：一条只会回答 PASS 或「什么都没发生」的尺不算尺。
window.addEventListener('error', (event) => {
  out.childError = String(event.message)
  try { finish() } catch { /* 连报告都坏了才留给外壳判未开始 */ }
})

step('hello')
bridge.hello(node)
await new Promise((resolve) => setTimeout(resolve, 250))
const ready = bridge.ready()
out.readyGranted = ready ? ready.granted : null
out.envPlatform = ready && ready.env ? ready.env.platform : null

const got = await settle(bridge.call('config.get'))
out.namespaces = got.ok ? got.value?.namespaces : undefined
out.configReason = got.ok ? undefined : got.reason

// 再打一条写，让"每条请求恰有一条应答"这条判据有两对可数。
const saved = await settle(bridge.call('config.save', node + '-ns', { probe: 1 }, undefined))
out.savedReason = saved.ok ? undefined : saved.reason

step('calls done')
finish()
</script></body></html>`

const stubTools = 'export const defineTool = (def) => def\nexport const T = {}\n'

const pages = {
  '/': parentPage,
  '/child.html': childPage,
  '/stub-dsh-tools.js': stubTools,
}

if (process.argv.includes('--print-pages')) {
  console.log('===== 母页 =====\n' + parentPage)
  console.log('===== 子页 =====\n' + childPage)
  process.exit(0)
}

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])
  if (path.startsWith('/sdk/')) {
    const rel = path.slice('/sdk/'.length)
    if (!/^[A-Za-z0-9._/-]+$/.test(rel) || rel.includes('..')) {
      res.writeHead(400).end('bad sdk path')
      return
    }
    const file = `${sdkDir}/${rel}`
    if (!existsSync(file)) {
      res.writeHead(404).end('no sdk artifact: ' + rel)
      return
    }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }).end(readFileSync(file))
    return
  }
  const body = pages[path]
  if (body === undefined) {
    res.writeHead(404).end('no such page')
    return
  }
  // 脚本替身也是 `.js`，按 HTML 发出去浏览器会以 strict MIME 拒绝执行整个模块图，
  // 症状是两个子框停在「等握手」——没有任何一条错误指向这里。（第一版就是这么坏的。）
  const type = path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8'
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body)
})

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${String(server.address().port)}/`
  console.log(`两帧取证已就位：${url}`)
  console.log(`模式：sabotage=${sabotage}（none 应判 PASS，crosstalk 应判 FAIL）`)
  console.log('判决落在 #result；两个子框都回报之后才会落。')
})
