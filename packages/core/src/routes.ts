/**
 * `/xaihi/*` 路由：聚合清单 + 插件 UI 产物文件。
 *
 * 为什么要自己开路由：DSH 只把 `/plugins/<id>/client.js` 与
 * `client.<chunk>.js` 发给插件，`/plugins` 前缀被 client-modules 独占，而一个
 * UI 模块产物是 `remoteEntry.js` + 同级 chunk + 资源的文件树。DSH 公开了
 * `ctx.webServer.register({ kind:'prefix' })`，所以这条缝隙是合法扩展点，不是 hack。
 *
 * 安全边界：只服务登记过的插件目录；请求路径 realpath 后必须仍落在该目录内；
 * `?rev=` 与当前修订不符一律 404（让"取到陈旧产物"变成可见失败而不是静默降级）。
 *
 * @module xaihi-core/routes
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, sep } from 'node:path'
import type { ServedRegistration } from './registry.ts'

/** 后缀到 Content-Type；不在表内的一律拒绝，避免把目录里任何文件当资源发出去。 */
export const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

/** 路由依赖的登记表来源。 */
export interface RouteSource {
  registrations: () => readonly ServedRegistration[]
  document: () => unknown
}

/**
 * 把请求路径解析成磁盘文件。
 * @param registration - 目标插件登记项。
 * @param relative - URL 里 `<slug>/` 之后的部分（已 decode）。
 * @returns 可服务的绝对路径，或 null 表示拒绝。
 */
export function resolveServedFile(registration: ServedRegistration, relative: string): string | null {
  if (relative === '' || relative.startsWith('/') || relative.includes('\0')) return null
  const segments = relative.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  const extensionIndex = relative.lastIndexOf('.')
  const extension = extensionIndex === -1 ? '' : relative.slice(extensionIndex)
  if (MIME[extension] === undefined) return null
  const candidate = join(registration.frontendDir, ...segments)
  if (!existsSync(candidate)) return null
  const realDir = realpathSync(registration.frontendDir)
  const realFile = realpathSync(candidate)
  if (realFile !== join(realDir, registration.entryFile) && !realFile.startsWith(realDir + sep)) return null
  if (!statSync(realFile).isFile()) return null
  return realFile
}

const send = (res: ServerResponse, status: number, body: string | Buffer, type: string, cache: string): void => {
  res.writeHead(status, { 'content-type': type, 'cache-control': cache, 'x-content-type-options': 'nosniff' })
  res.end(body)
}

/** `/xaihi/manifest.json`：exact 路由，禁止缓存，浏览器每次启动读最新的登记表。 */
export function manifestHandler(source: RouteSource) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'method not allowed', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    send(res, 200, JSON.stringify(source.document()), 'application/json; charset=utf-8', 'no-store')
  }
}

/** `/xaihi/remotes/<slug>/<rev>/<file>`：prefix 路由，rev 必须是路径的一段。 */
export function remoteHandler(source: RouteSource) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'method not allowed', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const prefix = '/xaihi/remotes/'
    if (!url.pathname.startsWith(prefix)) {
      send(res, 404, 'not found', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    // rev 必须在路径里而不是查询串：打包器用 remoteEntry 自身的目录当 publicPath 推导
    // 同级 chunk 的 URL，query 会在这一步被丢掉，于是 chunk 请求永远拿不到 rev。
    // 实测过的症状是 `Loading chunk 855 failed`，而入口本身 200 正常。
    const segments = url.pathname.slice(prefix.length).split('/')
    const slug = segments.shift() ?? ''
    const requested = segments.shift() ?? ''
    const relative = segments.join('/')
    const registration = source.registrations().find((entry) => entry.slug === slug)
    if (registration === undefined || registration.problems !== undefined || registration.entryFile === '') {
      send(res, 404, 'unknown or unusable plugin', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    if (requested !== registration.rev) {
      send(res, 404, `rev mismatch (current ${registration.rev})`, 'text/plain; charset=utf-8', 'no-store')
      return
    }
    const path = resolveServedFile(registration, decodeURIComponent(relative))
    if (path === null) {
      send(res, 404, 'not found', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    const extensionIndex = path.lastIndexOf('.')
    const type = MIME[path.slice(extensionIndex)] ?? 'application/octet-stream'
    send(res, 200, req.method === 'HEAD' ? '' : readFileSync(path), type, IMMUTABLE)
  }
}
