/**
 * `/xaihi/host`：把「问宿主」这件事搬到 Xaihi 自己的路由上，让**桌面壳开出来的顶层窗**也能问。
 *
 * 为什么要有这条：ADR-0011 那三条候选路里，两条已被实测关掉——
 * `postMessage` 的对面在顶层窗里不存在（`window.parent === window` 且 `window.opener === null`，
 * 窗是壳自己 `new BrowserWindow` 出来的，不是 Chromium 的 popup），
 * 而"同源 fetch 到 DSH 网关"在桌面端从来不是通路（`desktop/dsh/apps/desktop/src/main.ts:1008`
 * 只把宿主凭证发给主窗那一个 webContents；`/api` 在两只窗里都 404）。
 * 本路由用**同一份桥的线上形状**（`host-bridge.ts` 的消息表 + `parseBridgeMessage` +
 * `createShellBridge`），只把载体从 postMessage 换成同源 HTTP：不另立第二套动词表，
 * 也不在界面里分叉出"桌面版调用形状"。
 *
 * 安全边界（这条 webServer 上的路由**不需要 DSH 令牌**，所以边界只能在本文件里划）：
 * ① 只碰 Xaihi 自己的那批设置命名空间（装配侧从登记表算出来的那份 + `xaihi-core`），
 * 越界的读只回空、越界的写整条拒并给原因；② 读一律 `redactSecrets`；
 * ③ 单条消息仍受桥上界；④ 只收 POST。剩下的暴露面与"本机进程能改 profile 补丁里
 * Xaihi 自己那几段"是同一件事，不多给一分。
 *
 * `sid` 是会话记账，不是安全控制：任何本机进程自己发一次 hello 也能拿到一个会话，
 * 真正兜住的是上面那圈命名空间闸。这条写在判据里（越界必须红），不靠注释自觉。
 *
 * @module xaihi-core/host-routes
 */

import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import {
  BRIDGE_MAX_MESSAGE_BYTES,
  BRIDGE_REQUEST_TIMEOUT_MS,
  STATE_SETTINGS_NS,
  createShellBridge,
  parseBridgeMessage,
  type BridgeMessage,
  type HostMountState,
  type NodeCapabilityId,
  type SettingsFace,
  type SettingsPathOp,
  type ShellCapabilities,
} from '@hibernalglow/xaihi-sdk/bridge'

/** 这条路由的路径（文档侧 `boot.apiBase + '/host'` 必须与它逐字一致）。 */
export const HOST_PATH = '/xaihi/host'

/**
 * 判"这份 UI 产物里有没有问宿主的装载点"要搜的字面串。
 *
 * 为什么搜字符串而不是函数名：产物是 `mode: 'production'` 出来的，标识符会被改名，
 * `mountSettingsFace` / `startRealm` 这类名字在字节里根本不存在（实测搜不到≠没接线）。
 * 留得下来的是字符串字面量：`xaihi.bridge/1` 是桥的契约号（两种载体都带），
 * `host-http` 是顶层窗那条载体的名字（只在 `realm.ts` 选载体那一行出现）。
 * 两个都要在——只有契约号可能是别的桥代码进来了而没人选载体。
 */
export const HOST_MOUNT_MARKERS = ['xaihi.bridge/1', 'host-http'] as const

/** 被检的那份入口产物文件名（`rspack.document.mjs` 与 `rspack.realm.mjs` 都出这个名字）。 */
export const HOST_MOUNT_ENTRY = 'main.js'

/**
 * 读一份 UI 产物目录，判它有没有 host 装载点。
 *
 * 只看入口那一份：装载点必须由入口引到图里才会跑，别的 chunk 里有那些串而入口没引它，
 * 等于没接（这条与 `scripts/check-doc-bridge.mjs` 同一条判据，两边共用上面那对字面串）。
 * @param dir - `core.uiBundleDir` 指的那份产物目录。
 * @returns `present` / `absent` / `unreadable`（目录没配、文件读不到都算 `unreadable`）。
 */
export function detectHostMount(dir: string): HostMountState {
  if (dir === '') return 'unreadable'
  let text: string
  try {
    text = readFileSync(join(dir, HOST_MOUNT_ENTRY), 'utf8')
  } catch {
    return 'unreadable'
  }
  return HOST_MOUNT_MARKERS.every((marker) => text.includes(marker)) ? 'present' : 'absent'
}

/** 会话号形状：文档侧用 `crypto.getRandomValues` 造的十六进制串。形状不合就整条拒。 */
export const HOST_SID_PATTERN = /^[0-9a-f]{16,64}$/

/** 同时在册的会话数上限：超了按最久没用的一次踢掉，避免一屏多窗反复重连把表撑大。 */
const MAX_SESSIONS = 64

/** 会话闲置多久后被踢（毫秒）。踢掉之后文档再问会得到 `not-negotiated`，那是可见失败而不是静默。 */
const SESSION_IDLE_MS = 10 * 60 * 1000

/** 注入给 `createShellBridge` 的"对面是谁"。HTTP 载体没有 frame，这一格只用来让那条 origin 判据自洽。 */
const SESSION_ORIGIN = 'xaihi-host-session'

/** 宿主的服务端设置面用到的三片（`@deepseek-ai/dsh-settings` 的 `SettingsForms` 子集）。 */
export interface SettingsServiceLike {
  describe(options?: { redactSecrets?: boolean }): readonly unknown[]
  update(ns: string, values: Record<string, unknown>, expectedRevision?: number): unknown | Promise<unknown>
  mutate?(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): unknown | Promise<unknown>
}

/** 路由依赖。全部取函数形式：可选服务要**现读**，登记表会变，所以不能在装配时烘一次。 */
export interface HostBridgeDeps {
  /** 宿主的服务端设置面；没挂载时返回 undefined（那时整条路由只答协商，动词一律 no-provider）。 */
  settings: () => SettingsServiceLike | undefined
  /** 本路由可以碰的设置命名空间 = Xaihi 自己的那批 loader 行 + `xaihi-core`。 */
  allowedNamespaces: () => ReadonlySet<string>
}

/** 越界的写：抛一条带 `reason` 的错，桥那半边把它原样转成读得回的失败。 */
function denyNamespace(ns: string): never {
  const error = new Error(`设置命名空间 ${JSON.stringify(ns)} 不在本路由被允许的那一批里（只允许 Xaihi 自己的行 + ${STATE_SETTINGS_NS}）`)
  throw Object.assign(error, { reason: 'namespace-not-allowed' })
}

/** 行的 ns 取不出来时按"不认识"处理：宁可少给，不可多给。 */
function namespaceOf(row: unknown): string {
  return String((row as { ns?: unknown }).ns ?? '')
}

/**
 * 把宿主的服务端设置面包成桥要的 `SettingsFace`，并在这一层装上命名空间闸。
 * 闸只装在这里而不是每条动词各写一遍，是因为越界面只有一个：`describe` 的读数与两次写。
 * @param service - 宿主的服务面。
 * @param allowed - 被允许的命名空间集。
 * @returns 桥那半边可以直接吃的面。
 */
export function fenceSettings(service: SettingsServiceLike, allowed: ReadonlySet<string>): SettingsFace {
  return {
    describe: () => ({
      namespaces: service.describe({ redactSecrets: true }).filter((row) => allowed.has(namespaceOf(row))),
    }),
    update: async (ns, patch, expectedRevision) => {
      if (!allowed.has(ns)) denyNamespace(ns)
      return await service.update(ns, patch as Record<string, unknown>, expectedRevision)
    },
    mutate: async (ns, ops, expectedRevision) => {
      if (!allowed.has(ns)) denyNamespace(ns)
      if (service.mutate === undefined) {
        throw Object.assign(new Error('宿主的服务面没有 mutate 这一条'), { reason: 'no-provider' })
      }
      return await service.mutate(ns, ops, expectedRevision)
    },
  }
}

/** 这条载体今天给不了的组，逐条给一句使用者读得懂的话（`ready.degraded` 就靠它）。 */
export const HOST_REFUSAL_REASONS: Partial<Record<NodeCapabilityId, string>> = {
  // 这一句是**量出来的**，不是"还没来得及接"：宿主的执行面是
  // `commands.execute(agent, line, attachments, signal)`（0.2.0-rc.2 的 `dsh-commands/lib/types/index.d.ts`），
  // 第一参数就是 Agent；程序化那侧只有 `agents.create(...)`，而它的 `CreateAgentOptions.meta`
  // 自己写着"This is durable session data"⇒ 每按一次钮就在使用者的会话库里落一条真会话。
  // 缺的是上游那个口子（提案 P1：在"当前 Agent"上执行），不是我们少写了几行。
  runner: '命令要跑在一个 Agent 上：宿主只给了"程序化造一个 Agent"这条路，而那会在你的会话库里留下真会话。这一格等上游那个在现有 Agent 上执行的口子（提案 P1），不自开。',
  clipboard: '剪贴板是宿主/系统侧能力，顶层窗里没有外层可问（提案账上）',
  downloads: '下载走宿主那侧，这条路由不代发（提案账上）',
  localFiles: '文件选择与拖放是原生侧能力，顶层窗里没有外层可问（提案账上）',
  // env 不能由服务端编：宿主主题只有客户端那侧知道，而"注入一个亮/暗"正是决定 4 禁止的伪造。
  env: '顶层窗的宿主主题要由壳报给窗（那是壳侧的一条新动词，不是这条路由该猜的东西）；此刻按退化显示',
}

/** 设置面缺席时补上的两条原因——不补的话界面只读得到"外壳没有提供这一组"，归因不到哪一层。 */
export const HOST_MISSING_SETTINGS_REASONS: Partial<Record<NodeCapabilityId, string>> = {
  config: '宿主的服务端设置面（settings）没挂载在这个 profile 里，这条路由就没东西可答',
  state: '宿主的服务端设置面（settings）没挂载在这个 profile 里，节点状态的持久那一份也就没落点',
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

/** 把请求体读成文本；超过 `limit` 就回 null（并停止读，不把整条失控的体留在内存里）。 */
function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        // 只**停止累积**，不能 destroy：把请求流掐掉会连响应一起掐了——
        // 实机 curl 那侧读到的是"连接被关"（http_code=000），413 根本没送出去。
        // 剩下的字节照常排空但不进内存，然后把 413 回给对面。
        req.removeAllListeners('data')
        req.resume()
        finish(null)
        return
      }
      chunks.push(chunk)
    })
    req.on('error', () => { finish(null) })
    req.on('end', () => { finish(Buffer.concat(chunks).toString('utf8')) })
  })
}

/** 一次在途调用：按请求 id 等应答；握手那一条没有 id，单独一格。 */
/** 一条 loader 行里本模块要看的两片。 */
export interface LoaderRowLike {
  options: { id: string, name: string, disabled?: boolean | null }
}

/**
 * 本路由被允许碰的设置命名空间 = **我们自己的那个 scope 下的所有 loader 行** + 状态行。
 *
 * 按 `options.name` 的 scope 判而不是抄一份节点名单，理由有两层实测：
 * ① 2026-10-07 现读这台开发宿主的行表，Xaihi 的行 id 与清单里声明的 id 逐字相同
 * （`xaihi-core` / `xaihi-linedup` / …），而 `xaihi-ui` 那样没有清单行的行也真在表里；
 * ② 同一个包被装配成第二个实例时行 id 会变成实例名（本仓 2026-10-06 实测到 `8f3ca9e1`），
 * 抄名单会把那种行挡在外面——按 scope 判读的是**当下真在表里的那一行**。
 * `disabled` 的行不算：那一行今天不存在，给它开后门等于给没装载的东西留写口。
 * @param rows - `ctx.loader.entries()` 的读数。
 * @returns 命名空间集合（含状态行本身，即使那一行此刻没出现）。
 */
export function xaihiNamespaces (rows: readonly LoaderRowLike[]): Set<string> {
  const namespaces = new Set<string>([STATE_SETTINGS_NS])
  for (const row of rows) {
    if (row.options.disabled === true) continue
    if (row.options.name.startsWith('@hibernalglow/')) namespaces.add(row.options.id)
  }
  return namespaces
}

interface HostSession {
  bridge: { receive: (raw: unknown, origin: string) => Promise<boolean> }
  lastUsed: number
  pending: Map<string, (message: BridgeMessage) => void>
  readySettle: ((message: BridgeMessage) => void) | null
}

/**
 * `/xaihi/host` 的处理器。
 * @param deps - 现读的设置面与被允许的命名空间集。
 * @returns 交给 `ctx.webServer.register({ kind: 'exact', path: HOST_PATH })` 的 handler。
 */
export function hostBridgeHandler(deps: HostBridgeDeps) {
  const sessions = new Map<string, HostSession>()

  /** 表只长不收就是泄漏：一屏多窗反复重载会一直发新 sid。按闲置与条数两档踢。 */
  const evict = (): void => {
    const now = Date.now()
    for (const [sid, session] of sessions) {
      if (now - session.lastUsed > SESSION_IDLE_MS) sessions.delete(sid)
    }
    while (sessions.size >= MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
      if (oldest === undefined) break
      sessions.delete(oldest[0])
    }
  }

  /** 把外壳半边发出来的东西交回给在途的那一次调用。 */
  const publish = (session: HostSession, outbound: BridgeMessage): void => {
    if (outbound.kind === 'response') {
      const settle = session.pending.get(outbound.id)
      session.pending.delete(outbound.id)
      settle?.(outbound)
      return
    }
    if (outbound.kind === 'ready') {
      const settle = session.readySettle
      session.readySettle = null
      settle?.(outbound)
    }
  }

  const openSession = (caps: ShellCapabilities): HostSession => {
    // 会话对象要先存在、bridge 的 send 再闭包到它上面：send 在 receive 之内被同步调用，
    // 写成引用一个"之后才赋值的局部量"会在那一刻还是 undefined，应答就永远落不到人。
    const session: HostSession = {
      bridge: { receive: async () => false },
      lastUsed: Date.now(),
      pending: new Map(),
      readySettle: null,
    }
    session.bridge = createShellBridge(caps, (outbound) => { publish(session, outbound) }, SESSION_ORIGIN)
    return session
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed', detail: '这条路由只收 POST' })
      return
    }
    const sid = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('sid') ?? ''
    if (!HOST_SID_PATTERN.test(sid)) {
      sendJson(res, 400, { error: 'bad-session-id', detail: `sid 要合 ${String(HOST_SID_PATTERN)}` })
      return
    }
    const text = await readBody(req, BRIDGE_MAX_MESSAGE_BYTES)
    if (text === null) {
      sendJson(res, 413, { error: 'too-large', detail: `请求体超过桥上界（${String(BRIDGE_MAX_MESSAGE_BYTES)} B）` })
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      sendJson(res, 400, { error: 'bad-json', detail: '请求体不是 JSON' })
      return
    }
    const message = parseBridgeMessage(raw, 'from-document')
    if (message === null) {
      sendJson(res, 400, { error: 'not-a-bridge-message', detail: '请求体不是这份桥认得的 hello/request' })
      return
    }

    const service = deps.settings()
    const allowed = deps.allowedNamespaces()
    const reasons = service === undefined
      ? { ...HOST_REFUSAL_REASONS, ...HOST_MISSING_SETTINGS_REASONS }
      : HOST_REFUSAL_REASONS
    const caps: ShellCapabilities = {
      ...(service === undefined ? {} : { settings: fenceSettings(service, allowed) }),
      reasons,
      settingsNs: STATE_SETTINGS_NS,
    }

    // hello 之后才有的会话；hello 再来一次就重谈（会话内容只由这次 hello 决定）。
    let session = sessions.get(sid)
    if (message.kind === 'hello' || session === undefined) {
      evict()
      session = openSession(caps)
      sessions.set(sid, session)
    }
    session.lastUsed = Date.now()
    const active = session

    // 应答的落点按这条消息自己的身份挂：request 挂 id，hello 挂 readySettle。
    const reply = new Promise<BridgeMessage | null>((resolve) => {
      if (message.kind === 'hello') active.readySettle = resolve
      else active.pending.set(message.id, resolve)
    })
    const handled = await active.bridge.receive(message, SESSION_ORIGIN)
    if (!handled) {
      sessions.delete(sid)
      sendJson(res, 400, { error: 'unhandled-message', detail: `这条消息没被会话接住（kind=${message.kind}）` })
      return
    }
    // 上界定时器要在拿到应答后撤掉：留着就是每个请求挂 30 秒的尾巴，测试进程跟着不肯退。
    let timerHandle: ReturnType<typeof setTimeout> | undefined
    const settleTimer = new Promise<BridgeMessage | null>((resolve) => {
      timerHandle = setTimeout(() => { resolve(null) }, BRIDGE_REQUEST_TIMEOUT_MS)
    })
    const outbound = await Promise.race([reply, settleTimer])
    if (timerHandle !== undefined) clearTimeout(timerHandle)
    if (message.kind === 'hello') active.readySettle = null
    else active.pending.delete(message.id)
    if (outbound === null) {
      // 桥没答（应答超上界被丢、或内部没发东西）——必须是可见失败，不能让文档侧只剩 timeout。
      sendJson(res, 502, { error: 'no-reply', detail: '外壳半边没给出应答（多半是那条消息超过桥上界）' })
      return
    }
    sendJson(res, 200, outbound)
  }
}
