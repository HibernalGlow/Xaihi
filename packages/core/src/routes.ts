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
import { NODE_ID_PATTERN } from '@hibernalglow/xaihi-sdk'
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
  // 构建那侧的 `?url` 规则同时收 `.jpg` 与 `.jpeg`（`rspack.document.mjs` 的资源规则），
  // 表里少一条的后果是"图落在产物目录里但路由不肯发"——症状是界面上少一张图，
  // 而控制台上只有一条 404。这条由 `tests/asset-mime.spec.ts` 钉住，不靠人记得住。
  '.jpeg': 'image/jpeg',
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
 * URL 相对路径的形状闸：段数、穿越、后缀白名单。
 * 两个服务面（插件 remote 产物、Xaihi 自己的 UI 产物）共用这一条，否则会出现
 * "同一类穿越在一边被拒、在另一边被放行"。
 * @param relative - URL 前缀之后的部分（已 decode）。
 * @returns 拆好的段，或 null 表示拒绝。
 */
function guardRelative(relative: string): string[] | null {
  if (relative === '' || relative.startsWith('/') || relative.includes('\0')) return null
  const segments = relative.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  const extensionIndex = relative.lastIndexOf('.')
  if (extensionIndex === -1 || MIME[relative.slice(extensionIndex)] === undefined) return null
  return segments
}

/**
 * 把请求路径解析成磁盘文件。
 * @param registration - 目标插件登记项。
 * @param relative - URL 里 `<slug>/` 之后的部分（已 decode）。
 * @returns 可服务的绝对路径，或 null 表示拒绝。
 */
export function resolveServedFile(registration: ServedRegistration, relative: string): string | null {
  const segments = guardRelative(relative)
  if (segments === null) return null
  const candidate = join(registration.frontendDir, ...segments)
  if (!existsSync(candidate)) return null
  const realDir = realpathSync(registration.frontendDir)
  const realFile = realpathSync(candidate)
  if (realFile !== join(realDir, registration.entryFile) && !realFile.startsWith(realDir + sep)) return null
  if (!statSync(realFile).isFile()) return null
  return realFile
}

/**
 * 把请求路径解析成 Xaihi 自己产物目录里的文件（没有 entryFile 那条例外）。
 * @param dir - 产物根目录的绝对路径。
 * @param relative - URL 里 `<rev>/` 之后的部分（已 decode）。
 * @returns 可服务的绝对路径，或 null 表示拒绝。
 */
export function resolveUiFile(dir: string, relative: string): string | null {
  const segments = guardRelative(relative)
  if (segments === null) return null
  const candidate = join(dir, ...segments)
  if (!existsSync(candidate)) return null
  const realFile = realpathSync(candidate)
  if (!realFile.startsWith(realpathSync(dir) + sep)) return null
  if (!statSync(realFile).isFile()) return null
  return realFile
}

const send = (res: ServerResponse, status: number, body: string | Buffer, type: string, cache: string): void => {
  res.writeHead(status, { 'content-type': type, 'cache-control': cache, 'x-content-type-options': 'nosniff' })
  res.end(body)
}

/** Xaihi 自己那份 UI 文档的前缀（ADR-0009：边界切在 DSH↔Xaihi 这一刀）。 */
export const UI_PATH_PREFIX = '/xaihi/ui'

/** 文档壳里引用的产物名；构建那侧要按这两个名字出。 */
export const UI_ENTRY_SCRIPT = 'main.js'
export const UI_ENTRY_STYLE = 'main.css'

/** rev 只接受 computeRev 那种 12 位十六进制：它会被写进内联脚本，不接受任意字符串。 */
const REV_PATTERN = /^[0-9a-f]{12}$/

/**
 * 节点寻址段的形状（ADR-0011 决定 3：节点各自成窗用的是**同一份文档 + 寻址参数**，
 * 不是每个节点一份产物）。清单 id 就是这个小写段，所以闸也按它收。
 * 判据本身住在 SDK：桥上的 `state.<verb>(node)` 读的是同一份（那里的注释记着为什么必须同源）。
 */
const NODE_PATTERN = NODE_ID_PATTERN

/** UI 产物目录与其修订号的来源。 */
export interface UiBundleSource {
  /** 产物根目录的绝对路径；空串代表没配。 */
  dir: () => string
  /** 当前产物修订号（每次请求现算，ADR-0018：冻在启动时就没有热重载了）。 */
  rev: () => string
}

/**
 * 已经发出的 rev 的宽限窗（ADR-0018 的正题）。
 *
 * rev 必须每次现算——"改完产物、刷新页面就吃到"这条开发回路靠的就是它。
 * 但一次页面加载是**一串**请求：HTML 先按 A 出门，浏览器回头要 A 的 chunk 时目录
 * 可能已经重建到 B，于是整批 404，而 Chrome 对 404 的 `text/plain` 报成
 * 「Refused to apply style … (text/plain)」，看着像 MIME 坏了
 * （2026-10-07 实测：`ui.rev` 在两次清单请求之间从 `8d4ed81e8393` 变成 `687d583bc830`）。
 * 所以这里不冻哈希，只保证**发出去过的地址不腐烂**：被超过之后仍然解析得出来，
 * 但降级成 `no-store`（内容已经不是当年那一份，再按 `immutable` 发就是让浏览器
 * 永久留着混合代次），并在文档壳的 boot 里念一句 `revState:"superseded"`。
 */
const REV_GRACE_WINDOW_MS = 10 * 60 * 1000
const REV_GRACE_CAP = 16

/**
 * 生成文档壳。
 *
 * 这是整个 Xaihi 界面唯一一份 HTML：React 19 与工作台、L2 原子层、每节点的 remote
 * 都活在它里面，跨 realm 的桥只在这一层外面（DSH 的 slot 里只放一个 `<iframe>`）。
 * 形状照搬运源仓那份装载器：URL 决定装载什么、读不到的东西显示成可见失败。
 * @param rev - 写进 boot 对象的修订号，必须是 12 位十六进制。
 * @param node - 要打开哪个节点的表面；空串表示"整个工作台"。
 * @param revState - `superseded` 表示这个地址已经被新一次构建超过了（ADR-0018）；
 *   它跟着 boot 对象出门，界面因此能说"你看到的这批文件不是最新那一次构建"。
 * @returns 文档正文。
 */
export function renderUiDocument(rev: string, node = '', revState: 'current' | 'superseded' = 'current'): string {
  if (!REV_PATTERN.test(rev)) return '<!doctype html><html><body>xaihi ui rev is unusable</body></html>'
  const base = `${UI_PATH_PREFIX}/${rev}/`
  const shared = { rev, apiBase: '/xaihi', bundleBase: base, ...(revState === 'superseded' ? { revState } : {}) }
  const boot = JSON.stringify(node === '' ? shared : { ...shared, node })
  return [
    '<!doctype html>',
    '<html lang="zh">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>Xaihi</title>',
    `<link rel="stylesheet" href="./${UI_ENTRY_STYLE}" />`,
    `<script>window.__XAIHI_UI__=${boot}</script>`,
    `<script type="module" src="./${UI_ENTRY_SCRIPT}"></script>`,
    '</head>',
    '<body><div id="xaihi-ui-root"></div></body>',
    '</html>',
  ].join('\n')
}

/**
 * `/xaihi/ui/<rev>/<file>`：文档壳 + 它的产物。
 *
 * 与 `/xaihi/remotes` 的区别只有两点，都是被形状逼出来的：
 * 1. 这里要多发一份 `text/html`，而 HTML 不在 `MIME` 白名单里（把 `.html` 放进去
 *    等于允许目录里任何一份 HTML 出门），所以文档壳由代码现生成，其余文件仍走白名单。
 * 2. 产物目录没配时必须**先**报这条，不能掉进 rev 不匹配的 404——后者会让人以为
 *    是缓存问题，而真正的原因是 `core.uiBundleDir` 是空串。
 */
export function uiBundleHandler(source: UiBundleSource, options?: { now?: () => number }) {
  const now = options?.now ?? ((): number => Date.now())
  const issued = new Map<string, number>()
  const remember = (rev: string): void => {
    issued.set(rev, now())
    for (const [key, at] of issued) if (now() - at > REV_GRACE_WINDOW_MS) issued.delete(key)
    while (issued.size > REV_GRACE_CAP) {
      const oldest = issued.keys().next().value
      if (oldest === undefined) break
      issued.delete(oldest)
    }
  }
  const withinGrace = (rev: string): boolean => {
    const at = issued.get(rev)
    if (at === undefined) return false
    if (now() - at > REV_GRACE_WINDOW_MS) {
      issued.delete(rev)
      return false
    }
    return true
  }
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'method not allowed', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== UI_PATH_PREFIX && !url.pathname.startsWith(`${UI_PATH_PREFIX}/`)) {
      send(res, 404, 'not found', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    const dir = source.dir()
    if (dir === '') {
      send(res, 503, 'xaihi ui bundle is not configured (config core.uiBundleDir is empty)', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    const rev = source.rev()
    /**
     * 裸路径（`/xaihi/ui`、`/xaihi/ui/`、`/xaihi/ui/index.html`）302 到当前 rev 的文档壳。
     *
     * 理由：`rev` 是按产物目录**现算**的，重建一次就换一个，而人手里只有手打的裸路径；
     * 让它 404 的实测后果就是"打开一次得回清单里抄一次哈希"（2026-10-07 使用者的原话：
     * “3199 不会自动跳转啊”——同一轮里 `ui.rev` 在两次请求之间从 `8d4ed81e8393` 变成
     * `687d583bc830`，因为那侧正在重建产物目录）。
     * 三条边界：rev 不可用时**不跳**（跳向一个不存在的哈希比读得回的 404 更难读）；`?node=` 要带过去
     * （不然跳完丢掉"开哪个节点"，而不合形状的 node 直接丢掉、由目标页自己报 400）；
     * 响应必须 `no-store`（一份被缓存的 302 会把这条修复变成"下一次还是旧哈希"）。
     * 写到 rev 但没写文件名的（`/xaihi/ui/<rev>`）**不跳**——那是缺段，同穿越那条闸一起留在 404。
     */
    const rest = url.pathname.slice(UI_PATH_PREFIX.length)
    if (REV_PATTERN.test(rev) && (rest === '' || rest === '/' || rest === '/index.html')) {
      const node = url.searchParams.get('node') ?? ''
      const query = node !== '' && NODE_PATTERN.test(node) ? `?node=${encodeURIComponent(node)}` : ''
      res.writeHead(302, {
        location: `${UI_PATH_PREFIX}/${rev}/index.html${query}`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      res.end(req.method === 'HEAD' ? '' : `see ${UI_PATH_PREFIX}/${rev}/index.html`)
      return
    }
    const segments = url.pathname.slice(UI_PATH_PREFIX.length + 1).split('/')
    const requested = segments.shift() ?? ''
    const relative = segments.join('/')
    if (requested === '' || relative === '') {
      send(res, 404, 'not found', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    // 当前 rev 自己不合形状时先到这里为止：只比 `requested !== rev` 不够，
    // 两边可以相等，然后 200 一份什么都装不出来的 HTML。
    if (!REV_PATTERN.test(rev)) {
      send(res, 404, 'rev mismatch (current unreadable)', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    // 当前 rev：正常出，并记下"这个地址发出去过"。
    let state: 'current' | 'superseded' = 'current'
    if (requested !== rev) {
      const superseded = REV_PATTERN.test(requested) && withinGrace(requested)
      if (!superseded) {
        send(res, 404, `rev mismatch (current ${REV_PATTERN.test(rev) ? rev : 'unreadable'})`, 'text/plain; charset=utf-8', 'no-store')
        return
      }
      state = 'superseded'
    } else {
      remember(rev)
    }
    if (relative === 'index.html') {
      const node = url.searchParams.get('node') ?? ''
      if (node !== '' && !NODE_PATTERN.test(node)) {
        // 不回显收到的值：这一格的形状规则说清楚就够了，而把未净化的输入写进响应体
        // 正是这条路由接下来要防的那类事。
        send(res, 400, 'node must be a manifest id matching [a-z0-9][a-z0-9_-]{0,63}', 'text/plain; charset=utf-8', 'no-store')
        return
      }
      send(res, 200, req.method === 'HEAD' ? '' : renderUiDocument(requested, node, state), 'text/html; charset=utf-8', 'no-store')
      return
    }
    const served = resolveUiFile(dir, decodeURIComponent(relative))
    if (served === null) {
      send(res, 404, 'not found', 'text/plain; charset=utf-8', 'no-store')
      return
    }
    const extensionIndex = served.lastIndexOf('.')
    send(res, 200, req.method === 'HEAD' ? '' : readFileSync(served), MIME[served.slice(extensionIndex)] ?? 'application/octet-stream', state === 'superseded' ? 'no-store' : IMMUTABLE)
  }
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
