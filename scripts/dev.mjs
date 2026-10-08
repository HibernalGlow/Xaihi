/**
 * 一条命令拉起整套开发链（`pnpm dev`）：
 *
 *   [host]  `pnpm host`   —— DSH 隔离宿主，127.0.0.1:3199（桥、插件、settings 的真源）
 *   [ui]    `pnpm dev:ui` —— Vite dev server，http://127.0.0.1:5188/（HMR）
 *
 * 浏览器请开 5188（vite 的 `/xaihi` 代理会把桥请求转给 3199）。宿主起得慢（约 5-7s），
 * 5188 先就绪时桥握手会等宿主，属正常时序，不用重开页面。
 *
 * 行为约定：
 * - 两条腿的输出按行加 `[host]` / `[ui]` 前缀转发到本进程，哪边死了就收掉另一边，
 *   退出码取先死那边的 rc——"半套 dev 链挂着"不是合法状态。
 * - 子进程用 detached 起自己的进程组，收摊按 **负 pid 杀整组**：`pnpm` 下面还包着
 *   `dsh` / `vite` 两层孙进程，只杀 pnpm 会留孤儿占着 3199/5188。
 * - Ctrl+C 由本进程接（SIGINT），转发给两个子进程组后整体退出。
 *
 * @module xaihi-dev-orchestrator
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const JOBS = [
  { name: 'host', args: ['run', 'host'] },
  { name: 'ui', args: ['run', 'dev:ui'] },
]

/** @type {Array<{ name: string, child: import('node:child_process').ChildProcess }>} */
const children = []
let shuttingDown = false

/** 按行加前缀转发；缓冲到 \n 才写，避免两条腿的输出在同一行里绞在一起。 */
function forward(stream, tag, out) {
  let buf = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buf += chunk
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      out.write(`${tag} ${buf.slice(0, idx)}\n`)
      buf = buf.slice(idx + 1)
    }
  })
  stream.on('end', () => {
    if (buf) out.write(`${tag} ${buf}\n`)
  })
}

/** 杀整个进程组（负 pid）；组里已无人时 ESRCH，吞掉即可。 */
function teardown(sig = 'SIGTERM') {
  for (const { child } of children) {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, sig)
      } catch {
        /* 组已不存在 */
      }
    }
  }
}

for (const job of JOBS) {
  const child = spawn('pnpm', job.args, {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  children.push({ name: job.name, child })
  const tag = `[${job.name}]`
  forward(child.stdout, tag, process.stdout)
  forward(child.stderr, tag, process.stderr)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    shuttingDown = true
    const why = signal ?? `rc=${code}`
    console.error(`[dev] ${job.name} 先退了（${why}），收掉另一条腿…`)
    teardown(signal ? 'SIGKILL' : 'SIGTERM')
    process.exitCode = code ?? 1
  })
}

process.on('SIGINT', () => {
  if (!shuttingDown) {
    shuttingDown = true
    console.error('\n[dev] Ctrl+C，两条腿一起收摊…')
    teardown('SIGINT')
  }
  process.exit(130)
})

process.on('SIGTERM', () => {
  if (!shuttingDown) {
    shuttingDown = true
    teardown()
  }
  process.exit(143)
})

console.log('[dev] Xaihi 开发链已拉起：host → 127.0.0.1:3199 · ui → http://127.0.0.1:5188/')
console.log('[dev] 浏览器开 http://127.0.0.1:5188/（别开 3199 那条，那是 rev 形态的宿主页）。Ctrl+C 一并收摊。')
