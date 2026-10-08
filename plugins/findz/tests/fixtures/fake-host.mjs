/**
 * 一个会说话的假内核宿主：只为把 `gateway.ts` 的握手、FIFO 与失败面钉住。
 *
 * 它不是内核的替代品，也没有实现任何 findz 语义 —— 真内核的实机对齐由
 * `native/findz-go/probe/probe-host.py`（17 项判据）承担，因为那需要 Go 工具链，
 * 不该进 `pnpm test`。这里测的是**我们这一侧**的进程边界代码。
 *
 * 模式由 argv[2] 给：
 *   ok        —— 正常握手，之后回显 `{echo: method}`
 *   badabi    —— ABI 报 2（版本不认识必须被拒）
 *   missingcap—— 能力集缺 query.archives
 *   oldreq    —— requestVersions 不含 1
 *   silent    —— 不握手（握手超时路径）
 *   junk      —— 第一行不是 JSON（协议错位路径）
 *   exit      —— 握手后立刻退出（宿主没了）
 *   crash     —— 握手后把诊断写进 stderr 再非 0 退出（真内核 panic 那条路的形状）
 *   fail      —— 每个请求都回结构化错误
 */
const mode = process.argv[2] ?? 'ok'

const CAPABILITIES = [
  'library.open', 'library.close', 'scan.start', 'scan.reconcile',
  'watcher.apply_changes', 'watcher.set_health', 'query.archives', 'query.members',
  'export.rows', 'projection.treemap', 'analysis.start',
  'task.get', 'task.pause', 'task.resume', 'task.cancel',
]

const greeting = {
  ok: true,
  result: {
    abiVersion: mode === 'badabi' ? 2 : 1,
    coreVersion: 'fake-0.0.0',
    requestVersions: mode === 'oldreq' ? [7] : [1],
    capabilities: mode === 'missingcap' ? CAPABILITIES.filter((name) => name !== 'query.archives') : CAPABILITIES,
    supportedFormats: ['png', 'jpeg', 'gif'],
  },
}

if (mode === 'junk') process.stdout.write('this is not json\n')
else if (mode !== 'silent') process.stdout.write(`${JSON.stringify(greeting)}\n`)

if (mode === 'exit') {
  process.exit(3)
}

if (mode === 'crash') {
  // 真内核的形状：`diagnose` 把原因写 stderr，然后非 0 退出。stdout 上什么都没有。
  process.stderr.write('fake core: index database is locked\n')
  process.exit(4)
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index >= 0) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    index = buffer.indexOf('\n')
    if (line.trim() === '') continue
    const request = JSON.parse(line)
    const response = mode === 'fail'
      ? { ok: false, requestId: request.requestId, error: { code: 'fake_refusal', message: `refused ${request.method}`, retryable: false } }
      : { ok: true, requestId: request.requestId, result: { echo: request.method, requestId: request.requestId, requestVersion: request.requestVersion } }
    process.stdout.write(`${JSON.stringify(response)}\n`)
  }
})
