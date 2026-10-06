/**
 * 实机尺：把已经装进 profile 的每个节点 UI 产物**真的取一遍**，判据全部来自跑着的宿主。
 *
 * 为什么需要它而不是几条 curl：curl 那次证的是 linedup 一个包，而生态现在有 27 个包，
 * "每条边都通"这件事只有现读 debug.json 里那张注册表才数得清；更要紧的是这条尺量的是
 * **宿主真在服务的目录**（`frontendDir` 是 profile 里那份），而不是仓库里我以为构建过的那份——
 * profile 的 `file:` 依赖是拷贝不是软链，仓库里的新产物可能根本没被读到（见记忆与 ADR-0002）。
 *
 * 判的是五件事：
 *  1. `/xaihi/manifest.json` 与 `/xaihi/debug.json` 都读得到，且插件数与注册数一致；
 *  2. 每个注册项的入口文件 200，且 Content-Type 是 JS；
 *  3. 每个注册项**同级 chunk**（从它自己那份 frontendDir 现读，不手抄文件名）也 200——
 *     ADR-0001 那条"rev 必须在路径里"就是为这个 chunk 才成立的；
 *  4. 把 rev 改成邻近的一个值必须 404（阳性对照：取陈旧产物必须是可见失败）；
 *  5. `..` 与 `%2e%2e%2f` 两种写法都不许把 frontendDir 之外的文件发出来，
 *     且**编码那一版**的拒绝必须来自我们自己的 handler（否则那条腿不再测解析器）；
 *  6. `/xaihi/ui/**` 要么 200 给真 HTML，要么 503 把原因写出来——退化必须读得回来（ADR-0011 决定 4）；
 *  7. `/xaihi/history.json` 必须是形态说得清的运行账本（schema、durable 是真布尔、records 是数组）。
 *
 * 用法：
 *   pnpm host                                  # 另开终端，把宿主起到 127.0.0.1:3199
 *   node scripts/check-remotes-live.mjs        # 判全部注册项
 *   node scripts/check-remotes-live.mjs --self-check  # 阳性对照：这把尺必须看得见违规
 *   node scripts/check-remotes-live.mjs --port 3199 --quiet
 *
 * @module scripts/check-remotes-live
 */

import { readFileSync, readdirSync } from 'node:fs'
import { request } from 'node:http'
import { dirname, join } from 'node:path'

/** 入口文件与同级 chunk 都必须是 JS MIME；样式与 sourcemap 另有形态，不进这条判据。 */
const JS_MIME = /javascript|ecmascript/

/** 一个取回的响应：状态、内容类型、正文。 */
export function judgeEntry(response) {
  if (response.status !== 200) return `入口 ${response.status}`
  if (!JS_MIME.test(response.contentType)) return `入口 Content-Type 不是 JS（${response.contentType}）`
  return ''
}
export function judgeChunk(name, response) {
  if (response.status !== 200) return `同级 chunk ${name} ${response.status}`
  if (!JS_MIME.test(response.contentType)) return `同级 chunk ${name} Content-Type 不是 JS（${response.contentType}）`
  return ''
}

/** rev 被改过之后必须**不是** 200：200 意味着陈旧产物会被静默服务。 */
export function judgeStaleRev(response) {
  if (response.status === 200) return `改了 rev 仍然 200 ⇒ 取陈旧产物是静默的，不是可见失败`
  if (response.status >= 500) return `改了 rev 得到 ${response.status} ⇒ 该 404 的分支崩了`
  return ''
}

/**
 * 穿越请求不许把 frontendDir 之外那份文件的内容发出来。
 *
 * 状态码单独判不够：一个把路径当查询用的实现会回 200 而内容是别处的文件，
 * 所以判据是"内容等于外面那份文件的字节"这件事必须不成立。
 */
export function judgeTraversal(label, response, outsideBytes) {
  if (response.status === 200 && response.body === outsideBytes) {
    return `${label} 穿出去了：拿回的内容与 frontendDir 之外那份文件逐字节相同`
  }
  if (response.status >= 500) return `${label} 得到 ${response.status} ⇒ 拒绝路径应该是 4xx`
  return ''
}

/** handler 自己给出的拒绝文案（`send(res, 404, …)` 那两处），逐字符取自 packages/core/src/routes.ts。 */
const HANDLER_REFUSALS = ['not found', 'unknown or unusable plugin']

/**
 * 编码那一版穿越是**唯一真的走到 `resolveServedFile`** 的写法（裸 `../` 在路由之前就被拒了，
 * 实测拿到的是一个不带 Content-Type 的空 404）。所以那条腿还要求拒绝来自我们自己的 handler：
 * 哪天它变成同样的空 404，这条腿就不再测解析器了 ⇒ 必须红，不能继续算过。
 */
export function judgeHandlerRefusal(response) {
  if (!HANDLER_REFUSALS.includes(response.body.trim())) {
    return `穿越腿的拒绝不是 /xaihi/remotes handler 给的（${response.status} 正文 ${JSON.stringify(response.body.slice(0, 40))}）⇒ 这条腿没在测解析器`
  }
  return ''
}

/**
 * `/xaihi/ui/<rev>/…` 这一族必须"读得回状态"（ADR-0011 决定 4：可以退化，不许崩、不许静默、不许伪造）。
 *
 * 判据故意不问配置值：产物目录配没配，答案应当从**响应本身**读回来——
 * 200 必须是真 HTML，503 必须带着原因，别的一律算红。实测未配时是
 * `503 xaihi ui bundle is not configured (config core.uiBundleDir is empty)`。
 */
export function judgeUiDocument(response) {
  if (response.status === 503) {
    return /not configured|unusable/i.test(response.body)
      ? ''
      : `文档腿 503 但正文没写原因（${JSON.stringify(response.body.slice(0, 60))}）⇒ 退化读不回来`
  }
  if (response.status === 200) {
    if (!/text\/html/.test(response.contentType)) return `文档腿 200 但不是 HTML（${response.contentType}）`
    if (response.body.trim() === '') return '文档腿 200 但正文是空的'
    return ''
  }
  return `文档腿 ${response.status} ⇒ 只接受 200（有产物）或 503（带原因说没产物）`
}

/** 运行账目那条面必须现读得到一个说得清自己形态的 JSON。 */
export function judgeHistory(response) {
  if (response.status !== 200) return `账本腿 ${response.status}`
  let body
  try {
    body = JSON.parse(response.body)
  } catch {
    return `账本腿 200 但正文不是 JSON（${JSON.stringify(response.body.slice(0, 40))}）`
  }
  if (body.schema !== 'xaihi.ledger/1') return `账本腿 schema 不是 xaihi.ledger/1（${String(body.schema)}）`
  if (typeof body.durable !== 'boolean') return '账本腿的 durable 不是布尔 ⇒ 读不出它是真落了还是内存里'
  if (!Array.isArray(body.records)) return '账本腿没有 records 数组'
  return ''
}

function flipRev(rev) {
  const last = rev.slice(-1)
  return rev.slice(0, -1) + (last === 'a' ? 'b' : 'a')
}

/**
 * 走 `node:http` 而不是 `fetch`：`fetch` 会按 WHATWG URL 规则把路径里的 `..` 先收起来
 * （实测 `/xaihi/remotes/<slug>/<rev>/../../../package.json` 变成 `/xaihi/package.json`），
 * 于是"我发了穿越"这句话是假的——客户端替服务器把请求吞了。`http.request({path})` 原样上线。
 */
function requestRaw(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        contentType: res.headers['content-type'] ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function grabJson(port, path) {
  const response = await requestRaw(port, path)
  if (response.status !== 200) throw new Error(`${path} 回 ${response.status}`)
  return JSON.parse(response.body)
}

/** 从注册项自己那份 frontendDir 里挑一个非入口的 .js；没有就报"这条没判"而不是当作通过。 */
function siblingChunk(dir) {
  try {
    const names = readdirSync(dir).filter((name) => name.endsWith('.js')).sort()
    const other = names.find((name) => name !== 'remoteEntry.js')
    return { name: other ?? '', total: names.length }
  } catch {
    return { name: '', total: -1 }
  }
}

if (process.argv.includes('--self-check')) {
  const ok = { status: 200, contentType: 'application/javascript', body: 'x' }
  const cases = [
    { name: '入口 200 且是 JS', got: judgeEntry(ok), expect: '' },
    { name: '入口 404', got: judgeEntry({ status: 404, contentType: '', body: '' }), expect: '入口 404' },
    { name: '入口回 HTML（假绿的一种）', got: judgeEntry({ status: 200, contentType: 'text/html', body: '' }), expect: '入口 Content-Type 不是 JS（text/html）' },
    { name: 'chunk 404', got: judgeChunk('main.js', { status: 404, contentType: '', body: '' }), expect: '同级 chunk main.js 404' },
    { name: '改 rev 仍 200 ⇒ 必须判红', got: judgeStaleRev({ status: 200, contentType: '', body: '' }), expect: '改了 rev 仍然 200 ⇒ 取陈旧产物是静默的，不是可见失败' },
    { name: '改 rev 得 404 ⇒ 放行', got: judgeStaleRev({ status: 404, contentType: 'text/plain', body: '' }), expect: '' },
    { name: '穿越拿回外面那份文件 ⇒ 必须判红', got: judgeTraversal('..%2f', { status: 200, contentType: '', body: 'SECRET' }, 'SECRET'), expect: '..%2f 穿出去了：拿回的内容与 frontendDir 之外那份文件逐字节相同' },
    { name: '穿越得 403 ⇒ 放行', got: judgeTraversal('..', { status: 403, contentType: '', body: '' }, 'SECRET'), expect: '' },
    { name: '穿越崩了 ⇒ 也判红', got: judgeTraversal('..', { status: 500, contentType: '', body: '' }, 'SECRET'), expect: '.. 得到 500 ⇒ 拒绝路径应该是 4xx' },
    { name: '编码腿被 handler 拒绝 ⇒ 放行', got: judgeHandlerRefusal({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'not found' }), expect: '' },
    { name: '编码腿的拒绝其实来自路由（这条腿不再测解析器）⇒ 必须判红', got: judgeHandlerRefusal({ status: 404, contentType: undefined, body: '' }), expect: '穿越腿的拒绝不是 /xaihi/remotes handler 给的（404 正文 ""）⇒ 这条腿没在测解析器' },
    { name: '编码腿被 handler 拒绝但换了文案 ⇒ 也判红（文案漂了要说）', got: judgeHandlerRefusal({ status: 404, contentType: 'text/plain', body: 'forbidden' }), expect: '穿越腿的拒绝不是 /xaihi/remotes handler 给的（404 正文 "forbidden"）⇒ 这条腿没在测解析器' },
    { name: '文档腿 503 带原因 ⇒ 放行（这就是眼下真实的退化）', got: judgeUiDocument({ status: 503, contentType: 'text/plain; charset=utf-8', body: 'xaihi ui bundle is not configured (config core.uiBundleDir is empty)' }), expect: '' },
    { name: '文档腿 503 不说原因 ⇒ 必须判红', got: judgeUiDocument({ status: 503, contentType: 'text/plain', body: '' }), expect: '文档腿 503 但正文没写原因（""）⇒ 退化读不回来' },
    { name: '文档腿 200 但回 JSON ⇒ 判红（拿 API 响应冒充界面）', got: judgeUiDocument({ status: 200, contentType: 'application/json', body: '{}' }), expect: '文档腿 200 但不是 HTML（application/json）' },
    { name: '文档腿 200 空正文 ⇒ 判红', got: judgeUiDocument({ status: 200, contentType: 'text/html', body: '  \n' }), expect: '文档腿 200 但正文是空的' },
    { name: '文档腿 500 ⇒ 判红', got: judgeUiDocument({ status: 500, contentType: 'text/plain', body: 'boom' }), expect: '文档腿 500 ⇒ 只接受 200（有产物）或 503（带原因说没产物）' },
    { name: '账本腿形态对 ⇒ 放行', got: judgeHistory({ status: 200, contentType: 'application/json', body: '{"schema":"xaihi.ledger/1","durable":true,"reason":null,"records":[]}' }), expect: '' },
    { name: '账本腿 durable 不是布尔 ⇒ 判红', got: judgeHistory({ status: 200, contentType: 'application/json', body: '{"schema":"xaihi.ledger/1","durable":"yes","records":[]}' }), expect: '账本腿的 durable 不是布尔 ⇒ 读不出它是真落了还是内存里' },
    { name: '账本腿 200 但正文不是 JSON ⇒ 判红', got: judgeHistory({ status: 200, contentType: 'text/plain', body: 'ok' }), expect: '账本腿 200 但正文不是 JSON（"ok"）' },
  ]
  const problems = []
  for (const c of cases) {
    if (c.got !== c.expect) problems.push(`夹具 "${c.name}" 判据不等：期望「${c.expect || '放行'}」，实际「${c.got || '放行'}」`)
  }
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-remotes-live --self-check OK（${cases.length} 条夹具，含"入口 404""改 rev 仍 200""穿越拿到外面那份文件""拒绝不是 handler 给的"四条必须红）`)
  process.exit(0)
}

const quiet = process.argv.includes('--quiet')
const portAt = process.argv.indexOf('--port')
const port = portAt >= 0 ? Number(process.argv[portAt + 1]) : 3199

let manifest
let debug
try {
  manifest = await grabJson(port, '/xaihi/manifest.json')
  debug = await grabJson(port, '/xaihi/debug.json')
} catch (error) {
  console.error(`  × 读不到 127.0.0.1:${port} 的 /xaihi/manifest.json 或 /xaihi/debug.json：${error.message}`)
  console.error('    这把尺只判跑着的宿主。先 `pnpm host`（3199，DSH_HOME 已烧进脚本）再来跑，不许拿"没跑"当绿。')
  process.exit(1)
}

const failures = []
const registrations = debug.registrations ?? []
if (manifest.plugins?.length !== registrations.length) {
  failures.push(`清单说 ${manifest.plugins?.length} 个插件，注册表说 ${registrations.length} 个 ⇒ 两边读的不是同一份状态`)
}

let chunksJudged = 0
const skipped = []
const refusalLayers = new Map()
for (const registration of registrations) {
  const label = registration.slug
  const path = (file, rev = registration.rev) => `/xaihi/remotes/${label}/${rev}/${file}`

  const entry = await requestRaw(port, path(registration.entryFile))
  const entryProblem = judgeEntry(entry)
  if (entryProblem) failures.push(`${registration.package}：${entryProblem}`)

  const sibling = siblingChunk(registration.frontendDir)
  if (sibling.total === -1) {
    skipped.push(`${registration.package}（frontendDir 读不到：${registration.frontendDir}）`)
  } else if (sibling.name === '') {
    skipped.push(`${registration.package}（那份产物里只有入口一个 .js，没有同级 chunk 可判）`)
  } else {
    chunksJudged += 1
    const chunk = await requestRaw(port, path(sibling.name))
    const chunkProblem = judgeChunk(sibling.name, chunk)
    if (chunkProblem) failures.push(`${registration.package}：${chunkProblem}`)
  }

  const stale = await requestRaw(port, path(registration.entryFile, flipRev(registration.rev)))
  const staleProblem = judgeStaleRev(stale)
  if (staleProblem) failures.push(`${registration.package}：${staleProblem}`)

  // 两个写法都要试，因为它们测的是两层：裸 `../` 到不了我们的解析器（实测拿到不带
  // Content-Type 的空 404 ⇒ 路由之前就收了），编码 `%2e%2e%2f` 才会被 decodeURIComponent
  // 打开成 `../../package.json`，那一版才是 `resolveServedFile` 的判据。
  // "外面那份文件"取 frontendDir 上一级的 package.json：dist/ 里没有任何产物含 `dsh` 键，
  // 所以逐字节相等就是真漏了，而不是判据太松。
  const outsideBytes = readFileSync(join(dirname(registration.frontendDir), 'package.json'), 'utf8')
  for (const [throughLabel, spec, mustBeHandler] of [
    ['裸 ../', '../../../package.json', false],
    ['编码 %2e%2e%2f', '%2e%2e%2f%2e%2e%2fpackage.json', true],
  ]) {
    const through = await requestRaw(port, `${path(spec)}`)
    const throughProblem = judgeTraversal(throughLabel, through, outsideBytes)
    if (throughProblem) failures.push(`${registration.package}：${throughProblem}`)
    if (mustBeHandler) {
      const layerProblem = judgeHandlerRefusal(through)
      if (layerProblem) failures.push(`${registration.package}：${layerProblem}`)
    }
    refusalLayers.set(throughLabel, `${through.status}${through.body.trim() === '' ? '（空正文，拒绝在路由那一层）' : ` ${through.body.trim()}`}`)
  }
}

if (!quiet) {
  for (const registration of registrations.slice(0, 3)) {
    console.log(`  · ${registration.package} rev ${registration.rev} → ${registration.frontendDir}`)
  }
}

// 两条不问认证、不靠 rev 猜的面：文档壳（可以没有产物，但退化必须读得回来）与运行账本。
const documentResponse = await requestRaw(port, '/xaihi/ui/000000000000/index.html')
const documentProblem = judgeUiDocument(documentResponse)
if (documentProblem) failures.push(`文档壳：${documentProblem}`)
const historyResponse = await requestRaw(port, '/xaihi/history.json')
const historyProblem = judgeHistory(historyResponse)
if (historyProblem) failures.push(`运行账本：${historyProblem}`)

console.log(
  `check-remotes-live: 宿主 127.0.0.1:${port} 注册 ${registrations.length} 项，判了 ${chunksJudged} 条同级 chunk，`
  + `跳过 ${skipped.length} 条（没有同级 chunk 可判）；负控每项 1 条改 rev + 2 条穿越。`,
)
console.log(
  `  · 另外两条面现读：文档壳 ${documentResponse.status}${documentProblem ? '（判红）' : '（判据通过）'} · `
  + `运行账本 ${historyResponse.status}${historyProblem ? '（判红）' : '（判据通过）'}`,
)
console.log(`  · 穿越两层的实际判决：${[...refusalLayers].map(([k, v]) => `${k} → ${v}`).join('；')}`)
for (const line of skipped) console.log(`  · 跳过：${line}`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`  × ${failure}`)
  process.exit(1)
}
console.log('产物全部经真的路由取得，陈旧 rev 与两种穿越写法都被拒')
