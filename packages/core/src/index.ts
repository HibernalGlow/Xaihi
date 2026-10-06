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
import { buildRegistrations, buildWorkspaceDocument, computeRev, type ServedRegistration } from './registry.ts'
import { manifestHandler, remoteHandler, uiBundleHandler, UI_PATH_PREFIX, type UiBundleSource } from './routes.ts'
import type { UiBundleFace } from '@hibernalglow/xaihi-sdk'
import { createJournal, operationsSnapshotHandler, operationsStreamHandler } from './operations.ts'
import { historyHandler, openLedger, type DomainFacilityLike, type RunLedger } from './history.ts'
import {
  HISTORY_SNAPSHOT_PATH,
  OPERATIONS_SERVICE,
  OPERATIONS_SNAPSHOT_PATH,
  OPERATIONS_STREAM_PATH,
  type OperationEvent,
  type RunRecord,
} from '@hibernalglow/xaihi-sdk'

export const name = '@hibernalglow/xaihi-core'

export const inject = ['webServer', 'loader', 'tools']

/** 本插件对宿主提供的服务名（节点侧经 `ctx.get(OPERATIONS_SERVICE)` 可选取用）。 */
export const provide = [OPERATIONS_SERVICE]

export interface Config {
  /** 每次清单请求打一行诊断日志。 */
  verbose: Volatile<boolean>
  /**
   * Xaihi 自己那份 UI 文档的产物根目录（绝对路径）。
   * 空串是合法值，含义是"还没有第二个构建目标"，此时 `/xaihi/ui/**` 一律 503 并把
   * 这条原因说出来，而不是装出一个空壳（ADR-0009 的边界这一侧）。
   */
  uiBundleDir: string
}

export const Config = Schema.object({
  verbose: Schema.boolean().default(false).volatile(),
  uiBundleDir: Schema.string().default(''),
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

/**
 * Xaihi 会**可选**使用的宿主服务。
 *
 * 为什么单独列出来：`inject` 是硬要求，缺席就不装载；这几件缺席时我们只是少个能力
 * （没 storage domain 就只在内存里记账），但"少了吗"必须有一个地方能读到，
 * 否则症状会是"检查点没存"而没人知道是装配问题还是代码问题。
 */
export const OPTIONAL_SERVICES = ['storageDomain', 'approval', 'commands', OPERATIONS_SERVICE] as const

/**
 * 现读一次可选服务的可用性。
 * @param ctx - 宿主上下文。
 * @returns 服务名 → 是否解析到了实现。
 */
export function probeOptionalServices(ctx: DiscoverContext): Record<string, boolean> {
  const availability: Record<string, boolean> = {}
  for (const service of OPTIONAL_SERVICES) availability[service] = ctx.get(service as never) !== undefined
  return availability
}

/** 发现过程的可读快照，供 `/xaihi/debug.json` 与诊断使用。 */
export interface Discovery {
  baseUrl: string
  /** loader 里的全部行（含 disabled），原样报出。 */
  rows: Array<{ id: string; name: string; disabled: boolean }>
  /** 参与 xaihi 扫描的 specifier。 */
  candidates: string[]
  /** 被子路径规则跳过的行（它们不可能带 `package.json#xaihi`）。 */
  subpaths: string[]
  /** 每个候选的定位结果：有没有定位到 package.json、有没有 xaihi 键、被拒原因。 */
  located: LocatedSummary[]
  registrations: ServedRegistration[]
  /** 可选服务的可用性，现读。 */
  services: Record<string, boolean>
  /** 宿主认识的命令名（用来看插件的宿主半边到底跑没跑起来）。 */
  commands: ReturnType<typeof probeCommands>
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
  const subpaths: string[] = []
  for (const entry of ctx.loader.entries()) {
    const { id, name, disabled } = entry.options
    rows.push({ id, name, disabled: disabled === true })
    if (disabled === true) continue
    // 本地文件与 cordis 内建行没有 package.json#xaihi 语义，跳过但不隐藏。
    if (name.startsWith('cordis:') || name.startsWith('file:')) continue
    // 子路径行（`@scope/pkg/whatever`）没有 package.json#xaihi 语义：exports 通常不允许
    // 读它的 package.json。把它报成"定位失败"等于把宿主的正常排布说成故障，所以单独归类。
    if (isSubpathSpecifier(name)) {
      subpaths.push(name)
      continue
    }
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
  return {
    baseUrl,
    rows,
    candidates: specifiers,
    subpaths,
    located,
    registrations,
    services: probeOptionalServices(ctx),
    commands: probeCommands(ctx),
  }
}

/**
 * loader 行的 name 是不是子路径 specifier（`@scope/pkg/sub` 或 `pkg/sub`）。
 * @param name - 行里的包 specifier。
 */
export function isSubpathSpecifier(name: string): boolean {
  const segments = name.split('/')
  return name.startsWith('@') ? segments.length > 2 : segments.length > 1
}

/**
 * 读回宿主认识的命令名。
 *
 * 存在的理由：一个插件行的 `apply` 跑了没有，外面是看不见的（manifest 只证明包装好了、
 * loader 行只证明了声明）。命令注册是 apply 的最后一步，所以"命令在不在列表里"就是
 * "半边宿主跑没跑起来"的可读回路径。读不到就说读不到，不猜。
 * @param ctx - 宿主上下文。
 */
export function probeCommands(ctx: DiscoverContext): { ok: boolean; names: string[]; reason: string | null } {
  const commands = ctx.get('commands') as { list?: (...args: never[]) => unknown } | undefined
  if (commands === undefined) return { ok: false, names: [], reason: 'no commands service' }
  if (typeof commands.list !== 'function') return { ok: false, names: [], reason: 'commands.list is not callable' }
  try {
    const listed = commands.list() as Array<{ name?: string }> | Iterable<{ name?: string }>
    const names = [...(listed as Iterable<{ name?: string }>)].map((entry) => entry.name ?? '?')
    return { ok: true, names, reason: null }
  } catch (error) {
    return { ok: false, names: [], reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}

/**
 * 一个服务对象**实际**能调什么：自有属性加一层原型上的方法名。
 * @param value - 服务实例。
 * @returns 排序后的成员名，构造器与 `Object.prototype` 除外。
 */
export function surfaceOf(value: object): string[] {
  const names = new Set<string>(Object.keys(value))
  const proto = Object.getPrototypeOf(value) as object | null
  if (proto !== null && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== 'constructor') names.add(key)
    }
  }
  return [...names].sort()
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
  if (config.verbose.get()) {
    // 文档与发布物会漂（`SubprocessHandle.pid` 就是例子），所以 verbose 时把可选服务
    // 真实暴露的成员打出来，让"我以为 API 长这样"能被当场核对。
    // 不含 xaihiOperations：那是本 fiber 自己稍后才提供的，此刻必然读不到，列出来只会误导。
    const shapes = OPTIONAL_SERVICES.filter((service) => service !== OPERATIONS_SERVICE).map((service) => {
      const value = ctx.get(service as never) as object | undefined
      return `${service}=${value === undefined ? 'absent' : surfaceOf(value).join(',') || '(empty)'}`
    })
    console.log(`[${name}] optional services: ${shapes.join(' | ')}`)
  }
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
  // Xaihi 那份 UI 文档（React 19 住在里面，ADR-0009）此刻装不装得出来，要作为字段
  // 出现在清单里，而不是等面板去试：空产物与产物读不了是两种不同的症状。
  const uiSource: UiBundleSource = {
    dir: () => config.uiBundleDir,
    rev: () => {
      if (config.uiBundleDir === '') return 'missing'
      try {
        return computeRev(config.uiBundleDir)
      } catch {
        return 'unreadable'
      }
    },
  }
  const uiFace = (): UiBundleFace => {
    const rev = uiSource.rev()
    if (rev === 'missing') {
      return { documentUrl: '', rev, problems: ['xaihi ui bundle is not configured (config core.uiBundleDir is empty)'] }
    }
    if (rev === 'unreadable') {
      return { documentUrl: '', rev, problems: [`xaihi ui bundle directory is not readable: ${config.uiBundleDir}`] }
    }
    return { documentUrl: `${UI_PATH_PREFIX}/${rev}/index.html`, rev }
  }
  const source = {
    registrations: snapshot,
    document: () => buildWorkspaceDocument(snapshot(), uiFace()),
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

  // 边界只切在这一刀：DSH 的 slot 里只放一个 <iframe>，它的 src 就是这条路由（ADR-0009）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: UI_PATH_PREFIX,
    handler: uiBundleHandler(uiSource),
  }), 'xaihi-core: ui document route')

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

  // 账本订阅事件流：事件是易逝的，结算记录才落盘。计数在这里做，因为"这次运行发了几条事件"
  // 只有订阅方看得见，而 journal 自己有上界。
  const ledger = openLedger(ctx.get('storageDomain') as DomainFacilityLike | undefined)
  const perRun = new Map<string, number>()
  // 一个运行的检查点只留最后一条：节点通常是"先规划、再落盘最终那份撤销所需"。
  const checkpoints = new Map<string, string>()
  ctx.effect(() => journal.subscribe((event: OperationEvent) => {
    perRun.set(event.runId, (perRun.get(event.runId) ?? 0) + 1)
    if (event.kind === 'checkpoint') {
      checkpoints.set(event.runId, JSON.stringify(event.payload ?? null))
      return
    }
    if (event.kind !== 'finished' && event.kind !== 'failed') return
    const run = journal.runs().find((entry) => entry.runId === event.runId)
    if (run === undefined) return
    const record: RunRecord = {
      runId: run.runId,
      nodeId: run.nodeId,
      actionId: run.actionId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? event.at,
      outcome: event.kind === 'failed' ? 'failed' : 'finished',
      message: event.message ?? '',
      events: perRun.get(event.runId) ?? 0,
      checkpoint: checkpoints.get(event.runId) ?? '',
    }
    checkpoints.delete(event.runId)
    perRun.delete(event.runId)
    void ledger.then((opened: RunLedger) => opened.append(record), (error: unknown) => {
      console.warn(`xaihi-core: run ledger append failed for ${record.runId}: ${String(error instanceof Error ? error.message : error)}`)
    })
  }), 'xaihi-core: run ledger sink')

  ctx.effect(() => () => {
    void ledger.then((opened: RunLedger) => opened.close())
  }, 'xaihi-core: close run ledger')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: HISTORY_SNAPSHOT_PATH,
    handler: historyHandler(() => ledger),
  }), 'xaihi-core: run history route')

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
      const document = buildWorkspaceDocument(registrations, uiFace())
      if (document.plugins.length === 0) return 'no xaihi nodes are installed and enabled'
      const header = document.ui.documentUrl === ''
        ? `ui document: unavailable (${document.ui.problems?.[0] ?? 'unknown'})`
        : `ui document: ${document.ui.documentUrl}`
      return [header, ...document.plugins.map((plugin) => {
        const panels = (plugin.manifest.panels ?? []).map((panel) => panel.id).join(', ') || 'no panels'
        const problems = plugin.problems ? ` PROBLEMS: ${plugin.problems.join('; ')}` : ''
        return `${plugin.manifest.id} (${plugin.package}) panels: ${panels}${problems}`
      })].join('\n')
    },
  }))
}
