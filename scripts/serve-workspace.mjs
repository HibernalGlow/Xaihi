import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { uiBundleHandler, UI_PATH_PREFIX } from '../packages/core/lib/routes.js'
import { computeRev } from '../packages/core/lib/registry.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dir = join(root, 'packages/ui-host/dist-ui')
const source = { dir: () => dir, rev: () => computeRev(dir) }
const handler = uiBundleHandler(source)

const PORT = 3344

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')

  // 覆盖缓存头，防止浏览器强缓存任何旧产物
  const originalSetHeader = res.setHeader.bind(res)
  res.setHeader = (name, value) => {
    if (String(name).toLowerCase() === 'cache-control') {
      return originalSetHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    }
    return originalSetHeader(name, value)
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  const currentRev = computeRev(dir)

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204)
    res.end()
    return
  }

  if (url.pathname.startsWith('/xaihi/host')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ schema: 'xaihi.bridge/1', kind: 'ready', granted: [], refused: {} }))
    return
  }

  if (url.pathname.startsWith('/api')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ status: 'offline', version: '0.0.0', config: {} }))
    return
  }

  // 根路径重定向到最新的工作台 URL
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(302, {
      Location: `${UI_PATH_PREFIX}/${currentRev}/index.html`,
      'Cache-Control': 'no-store',
    })
    res.end()
    return
  }

  // 如果请求带了旧的 rev，重定向到最新 rev
  const matchOldRev = url.pathname.match(new RegExp(`^${UI_PATH_PREFIX}/([^/]+)(/.*)?$`))
  if (matchOldRev && matchOldRev[1] !== currentRev) {
    const subpath = matchOldRev[2] ?? '/index.html'
    res.writeHead(302, {
      Location: `${UI_PATH_PREFIX}/${currentRev}${subpath}${url.search}`,
      'Cache-Control': 'no-store',
    })
    res.end()
    return
  }

  // /xaihi/ui/<currentRev>/... 走 core 的真路由
  if (url.pathname.startsWith(`${UI_PATH_PREFIX}/`)) {
    handler(req, res)
    return
  }

  // 其它相对路径直接从 dist-ui 中寻找静态文件
  const filePath = join(dir, url.pathname.replace(/^\//, ''))
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    })
    res.end(readFileSync(filePath))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
  res.end('Not Found')
})

server.listen(PORT, '127.0.0.1', () => {
  const currentRev = computeRev(dir)
  const targetUrl = `http://127.0.0.1:${PORT}${UI_PATH_PREFIX}/${currentRev}/index.html`
  console.log(`[Xaihi 工作台服务已启动]`)
  console.log(`- 访问地址: ${targetUrl}`)
  console.log(`- 快捷地址: http://127.0.0.1:${PORT}/`)

  try {
    spawn('open', [targetUrl], { detached: true, stdio: 'ignore' }).unref()
  } catch {}
})
