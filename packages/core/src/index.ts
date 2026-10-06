/**
 * Xaihi 宿主半边：发现已装节点、聚合清单、把它们与 UI 产物经宿主 web server 发出去。
 *
 * 与 DSH API 的关系：
 * - 插件行来自 cordis loader（`ctx.loader.entries()`，行的 `name` 是包 specifier）。
 *   插件自带自己的 patch 行，所以"装了且开着"就是 loader 里的真状态，不需要另外
 *   扫 node_modules 猜。
 * - 路由用公开的 `ctx.webServer.register({kind,path,handler})`；`/plugins` 前缀被
 *   client-modules 独占，所以 Xaihi 用 `/xaihi` 自己的前缀，不碰它的命名空间。
 *
 * 每次请求现算登记表：装/卸/开关节点后立即生效，代价是一次目录 stat 走查。
 * 这是有意的取舍——陈旧缓存会让症状变成"面板空白"而不是可见失败。
 *
 * @module xaihi-core
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { buildRegistrations, buildWorkspaceDocument, type ServedRegistration } from './registry.ts'
import { manifestHandler, remoteHandler } from './routes.ts'
import { createJournal, operationsSnapshotHandler, operationsStreamHandler } from './operations.ts'
import { OPERATIONS_SERVICE, OPERATIONS_SNAPSHOT_PATH, OPERATIONS_STREAM_PATH } from '@hibernalglow/xaihi-sdk'

export const name = '@hibernalglow/xaihi-core'

export const inject = ['webServer', 'loader', 'tools']

/** 本插件对宿主提供的服务名（节点侧经 `ctx.get(OPERATIONS_SERVICE)` 可选取用）。 */
export const provide = [OPERATIONS_SERVICE]

export interface Config {
  /** 每次清单请求打一行诊断日志。 */
  verbose: Volatile<boolean>
}

export const Config = Schema.object({
  verbose: Schema.boolean().default(false).volatile(),
})

/** loader 行的最小结构面（cordis-plugin-loader 的 Entry.options 子集）。 */
interface LoaderEntryLike {
  options: { id: string; name: string; disabled?: boolean | null }
}
interface LoaderLike {
  entries(): IterableIterator<LoaderEntryLike>
}

/**
 * `ctx.webServer` 的结构面，对应 @deepseek-ai/dsh-host-webserver 的 `register(route)`。
 * 不引包类型：宿主半边只需 kind/path/handler 三项，重复注册会抛错、最长前缀胜。
 */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** 发现流程只用到 loader 与 baseUrl。 */
export type DiscoverContext = Context & { loader: LoaderLike }

/** 本插件用到的服务面（发现 + 路由）。 */
type HostContext = DiscoverContext & { webServer: WebServerLike }

/** 发现过程的可读快照，供 `/xaihi/debug.json` 与诊断使用。 */
export interface Discovery {
  baseUrl: string
  /** loader 里的全部行（含 disabled），原样报出。 */
  rows: Array<{ id: string; name: string; disabled: boolean }>
  /** 参与 xaihi 扫描的 specifier。 */
  candidates: string[]
  /** 每个候选的定位结果：有没有定位到 package.json、有没有 xaihi 键、被拒原因。 */
  located: LocatedSummary[]
  registrations: ServedRegistration[]
}

/** 单个候选的定位结果。 */
interface LocatedSummary {
  specifier: string
  pkgPath?: string
  hasXaihi: boolean
  /** 清单校验失败的原因。 */
  problems?: string[]
  /** 定位失败的原因；诊断面要求每个候选都有下文，不允许静默消失。 */
  error?: string
}

/**
 * 从 loader 行发现 Xaihi 包并留下可读证据。
 * @param ctx - 宿主上下文（需要 `loader` 与 `baseUrl`）。
 * @returns 行、候选、定位结果与登记表。
 */
export function discover(ctx: DiscoverContext): Discovery {
  const baseUrl = ctx.baseUrl
  if (typeof baseUrl !== 'string' || baseUrl === '') {
    // 没有 baseUrl 就无法按 specifier 定位包；静默返回空表会让工作台显示"没有节点"，
    // 那是假信号，所以按 DSH 的 fail-loud 惯例直接抛。
    throw new Error('xaihi-core: ctx.baseUrl is unset, cannot resolve plugin packages')
  }
  const requireFrom = createRequire(baseUrl)
  const rows: Discovery['rows'] = []
  const specifiers: string[] = []
  for (const entry of ctx.loader.entries()) {
    const { id, name, disabled } = entry.options
    rows.push({ id, name, disabled: disabled === true })
    if (disabled === true) continue
    // 本地文件与 cordis 内建行没有 package.json#xaihi 语义，跳过但不隐藏。
    if (name.startsWith('cordis:') || name.startsWith('file:')) continue
    specifiers.push(name)
  }
  const located: LocatedSummary[] = []
  const registrations: ServedRegistration[] = []
  for (const specifier of specifiers) {
    let pkgPath: string
    let pkg: Record<string, unknown>
    try {
      // resolve 而不是直接 require：require 一个 .json 会返回解析后的对象，路径拿不到，
      // 后续 dirname 定位产物目录就成了 undefined。
      pkgPath = requireFrom.resolve(join(specifier, 'package.json'))
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    } catch (error) {
      located.push({
        specifier,
        hasXaihi: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
      continue
    }
    if (pkg.xaihi === undefined) continue
    const built = buildRegistrations([specifier], () => ({ pkgPath, pkg }))
    registrations.push(...built)
    const problems = built.flatMap((registration) => registration.problems ?? [])
    located.push(problems.length > 0
      ? { specifier, pkgPath, hasXaihi: true, problems }
      : { specifier, pkgPath, hasXaihi: true })
  }
  return { baseUrl, rows, candidates: specifiers, located, registrations }
}

/**
 * 从 loader 行构造登记表。
 * @param ctx - 宿主上下文。
 * @returns 每个声明了 `xaihi` 的包一条登记项。
 */
export function collect(ctx: DiscoverContext): ServedRegistration[] {
  return discover(ctx).registrations
}

export function apply(ctx: HostContext, config: Config): void {
  const journal = createJournal()
  // 服务必须在 fiber 活着的期间可见、卸载时自动收回，所以挂在 effect 里而不是模块作用域。
  ctx.effect(() => ctx.provide(OPERATIONS_SERVICE, journal), 'xaihi-core: operations journal')
  const snapshot = () => {
    const registrations = collect(ctx)
    if (config.verbose.get()) {
      const summary = registrations.map((entry) => `${entry.package}:${entry.rev}`).join(', ')
      console.log(`[${name}] ${registrations.length} plugin(s) ${summary || '(none)'}`)
    }
    return registrations
  }
  const source = {
    registrations: snapshot,
    document: () => buildWorkspaceDocument(snapshot()),
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/xaihi/manifest.json',
    handler: manifestHandler(source),
  }), 'xaihi-core: manifest route')

  // 发现过程本身要可读：节点没出现时，症状是空面板而不是"loader 里到底有哪些行、
  // 哪个包没定位到、哪份清单被拒"。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/xaihi/debug.json',
    handler: (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(discover(ctx), undefined, 2))
    },
  }), 'xaihi-core: discovery debug route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/xaihi/remotes',
    handler: remoteHandler(source),
  }), 'xaihi-core: remote files route')

  // 事件流的合法性来自宿主文档对 WebRoute.handler 的原话："may hold the response open,
  // e.g. SSE"。快照路由是它的兜底：不是所有宿主形态都允许长连接（桌面壳走 IPC 桥）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPERATIONS_STREAM_PATH,
    handler: operationsStreamHandler(journal),
  }), 'xaihi-core: operations stream route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPERATIONS_SNAPSHOT_PATH,
    handler: operationsSnapshotHandler(journal),
  }), 'xaihi-core: operations snapshot route')

  ctx.tools.register(defineTool({
    name: 'xaihi_nodes',
    description: 'List Xaihi nodes the harness currently loads: package, panel ids, UI revision, and manifest problems if any.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      const registrations = snapshot()
      const document = buildWorkspaceDocument(registrations)
      if (document.plugins.length === 0) return 'no xaihi nodes are installed and enabled'
      return document.plugins.map((plugin) => {
        const panels = (plugin.manifest.panels ?? []).map((panel) => panel.id).join(', ') || 'no panels'
        const problems = plugin.problems ? ` PROBLEMS: ${plugin.problems.join('; ')}` : ''
        return `${plugin.manifest.id} (${plugin.package}) panels: ${panels}${problems}`
      }).join('\n')
    },
  }))
}
