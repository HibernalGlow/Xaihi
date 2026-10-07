/**
 * 壳的转发那一层能不能承载路线 (A)：**不开 Electron** 直接把上游的 `forwardWebRequest`
 * 拿来对着本地假 Host 跑一遍，判"顶层原生窗里的 `/xaihi/host` 这条路"的四个必要条件。
 *
 * 为什么这条值得独立成尺：`live-check` 的 Q 段要等一个 GUI 工位（使用者要求别在他的日常桌面里起壳），
 * 而那一格真正的风险从来不是"窗开不出来"，是"POST 会不会在壳的 scheme 转发里被吃掉"。
 * 那件事不需要 GUI 就能定：`desktop/dsh/apps/desktop/src/web-document.ts` 只 import
 * `node:fs/promises` 与 `node:path`（现读那份文件的 import 段），所以 Node 的类型剥离能直接载入它，
 * 拿一个 `dsh-app://app/...` 的 `Request` 喂进去，看对面收到什么。
 *
 * 四条判据（缺一条就红）：
 * ① 方法、请求体、`?sid=` 原样到对面（`/xaihi/host` 就是 POST + 查询串带会话号）；
 * ② 窗侧那套 `host` / `origin` / `sec-fetch-site` 被删掉、`cookie` 换成宿主那份（转发层不冒充窗的来源）；
 * ③ 对面的状态码不被改写（我们那条路由对 GET 回 405，窗里读到的也得是 405）；
 * ④ 阳性对照：来源不是 `dsh-app://app` 的请求必须 403，而且**一条都不发给对面**——
 *    这一条保证①②③不是因为"管路无条件放行"才绿的。
 *
 * 用法：
 *   node desktop/forward-check.mjs                    # 量上游那份
 *   node desktop/forward-check.mjs --self-check       # 三份"坏转发器"必须各红一条
 *   node desktop/forward-check.mjs --vendor <路径>     # 换 pin 之后指别的 web-document.ts
 *
 * 这条尺读的是 vendor 源码，**不以任何门禁的扫描根为输入**（`desktop/` 不进扫描根的规则照旧），
 * 也不接进 `pnpm test`：它要能起本地端口，且它的结论关于上游实现，上游一漂就该由 `sync-dsh` 那条链去说。
 *
 * @module desktop/forward-check
 */

import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const flagValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const VENDOR_WEB_DOCUMENT = resolve(flagValue('vendor', join_default()))

/** 默认那份：submodule 里的上游桌面端源文件。 */
function join_default() {
  return resolve(REPO, 'desktop', 'dsh', 'apps', 'desktop', 'src', 'web-document.ts')
}

const SID = '0123456789abcdef0123456789abcdef'
const HOST_COOKIE = 'dsh-host-cookie=opaque'

/**
 * 判一次转发。纯函数：`--self-check` 用它喂"坏转发器"的读数，期望值不是再跑一次现场得到的。
 * @param seen - 假 Host 收到的请求（按顺序）。
 * @param statuses - 三次调用各自拿到的状态码（POST / GET / 外来源 POST）。
 * @param touched - 外来源那一次之后对面多收到几条。
 * @returns 四条判据。
 */
export function judge(seen, statuses, foreignTouched) {
  const checks = []
  const need = (label, pass, detail) => checks.push({ label, pass, detail })
  const post = seen[0] ?? {}
  need('① 方法 / 请求体 / ?sid= 原样到对面',
    post.method === 'POST' && Number(post.bodyLen) > 10 && post.url === `/xaihi/host?sid=${SID}`,
    `method=${String(post.method)} bodyLen=${String(post.bodyLen)} url=${String(post.url)}`)
  need('② 窗侧的 host/origin/sec-fetch-site 被删，cookie 换成宿主那份',
    post.cookie === HOST_COOKIE && post.origin === '(none)' && post.secFetchSite === '(none)',
    `cookie=${String(post.cookie)} origin=${String(post.origin)} sec-fetch-site=${String(post.secFetchSite)}`)
  need('③ 对面的状态码不被改写（GET 仍 405）', statuses[1] === 405, `status=${String(statuses[1])}`)
  need('④ 外来源按 origin 拒掉且不打到对面（阳性对照）',
    statuses[2] === 403 && foreignTouched === 0,
    `status=${String(statuses[2])} 对面多收到 ${String(foreignTouched)} 条`)
  return checks
}

/** 起假 Host + 发那三次调用，返回判据要的东西。 */
async function run(forwarder) {
  const seen = []
  const host = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      seen.push({
        method: req.method,
        url: req.url,
        cookie: req.headers.cookie ?? '(none)',
        origin: req.headers.origin ?? '(none)',
        secFetchSite: req.headers['sec-fetch-site'] ?? '(none)',
        bodyLen: body.length,
      })
      if (req.method !== 'POST') { res.writeHead(405, { 'content-type': 'text/plain' }); res.end('method not allowed'); return }
      if (req.url !== `/xaihi/host?sid=${SID}`) { res.writeHead(400); res.end('bad sid'); return }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true }))
    })
  })
  await new Promise((r) => host.listen(0, '127.0.0.1', r))
  const { port } = host.address()
  const hostUrl = `http://127.0.0.1:${String(port)}`
  const url = `dsh-app://app/xaihi/host?sid=${SID}`
  const windowHeaders = { origin: 'dsh-app://app', cookie: 'window-side=stale', host: 'dsh-app:80', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }

  const statuses = []
  statuses.push((await forwarder(new Request(url, { method: 'POST', body: '{"kind":"hello"}', headers: windowHeaders }), hostUrl, HOST_COOKIE)).status)
  statuses.push((await forwarder(new Request(url, { method: 'GET', headers: windowHeaders }), hostUrl, HOST_COOKIE)).status)
  const beforeForeign = seen.length
  statuses.push((await forwarder(new Request(url, { method: 'POST', body: '{}', headers: { origin: 'https://evil.example' } }), hostUrl, HOST_COOKIE)).status)
  const foreignTouched = seen.length - beforeForeign

  host.close()
  return { seen, statuses, foreignTouched }
}

/**
 * 三份"坏转发器"：每份只坏一件事，用来验这把尺自己看得见违规。
 * `want` 是那份坏法应该点到的判据编号。
 */
const mutants = [
  { name: '改成 GET 并丢掉请求体', want: '①', forward: async (request, hostUrl) => await fetch(new URL(request.url.replace('dsh-app://app', hostUrl)), { method: 'GET', headers: request.headers }) },
  { name: '不删窗侧的头也不换 cookie', want: '②', forward: async (request, hostUrl) => {
    const target = new URL(request.url.replace('dsh-app://app', hostUrl))
    return await fetch(target, { method: request.method, headers: request.headers, body: request.body, duplex: 'half' })
  } },
  { name: '外来源也放行', want: '④', forward: async (request, hostUrl, cookie) => {
    const target = new URL(request.url.replace('dsh-app://app', hostUrl))
    const headers = new Headers(request.headers)
    for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site']) headers.delete(name)
    headers.set('cookie', cookie)
    return await fetch(target, { method: request.method, headers, body: request.body, duplex: 'half' })
  } },
]

async function selfCheck(upstreamForwarder) {
  const good = judge(...Object.values(await run(upstreamForwarder)))
  const goodGreen = good.filter((row) => !row.pass).length
  console.log(`${goodGreen === 0 ? '✓' : '×'} 对照 上游那份转发器 = 四条全过 ⇒ 红 ${String(goodGreen)} 条，期望 0`)
  let failures = goodGreen === 0 ? 0 : 1
  for (const mutant of mutants) {
    const rows = judge(...Object.values(await run(mutant.forward)))
    const red = rows.filter((row) => !row.pass)
    const ok = red.length > 0 && red[0].label.startsWith(mutant.want)
    if (!ok) failures += 1
    console.log(`${ok ? '✓' : '×'} 对照 ${mutant.name} ⇒ 第一红应该是 ${mutant.want}，实际 ${red.length > 0 ? red[0].label.slice(0, 3) : '(全绿——尺看不见违规)'}`)
  }
  console.log(`forward-check --self-check: ${failures === 0 ? '尺看得见违规' : `${String(failures)} 条对照不符`}`)
  return failures === 0
}

let forwarder
try {
  forwarder = (await import(pathToFileURL(VENDOR_WEB_DOCUMENT).href)).forwardWebRequest
} catch (error) {
  console.error(`forward-check: 载入上游转发器失败 ⇒ ${error instanceof Error ? error.message : String(error)}`)
  console.error(`  路径 ${VENDOR_WEB_DOCUMENT}`)
  console.error('  两种可能：submodule 没 sync（先 node desktop/sync-dsh.mjs --verify）；或这台 Node 不认类型剥离（要 Node ≥ 23.6）')
  process.exit(1)
}

if (args.includes('--self-check')) process.exit(await selfCheck(forwarder) ? 0 : 1)

const reading = await run(forwarder)
console.log(`上游转发器 ${VENDOR_WEB_DOCUMENT.replace(REPO, '<仓>')}`)
let failed = 0
for (const row of judge(reading.seen, reading.statuses, reading.foreignTouched)) {
  console.log(`${row.pass ? 'OK  ' : 'FAIL'} ${row.label}｜${row.detail}`)
  if (!row.pass) failed += 1
}
process.exit(failed === 0 ? 0 : 1)
