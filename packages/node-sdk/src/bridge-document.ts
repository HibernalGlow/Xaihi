/**
 * 消息桥的文档那一半：给 React 19 那侧一个 `host` 形状的东西。
 *
 * 它存在的意义是**证明契约合得上**：文档侧拿到的 `host` 与上游
 * `NodeHostCapabilities` 同形（`contract` / `state` / `workspace` / `runner` /
 * `clipboard` / `downloads` / `localFiles` / `config` / `env`），所以搬过来的节点 UI
 * 不用为 DSH 改写调用形状；而每条跨界的调用都可能失败，失败必须是**读得回的原因**，
 * 不是 `undefined`（上游在同一个 realm 里时这些方法不会失败，移植过来就会，这是唯一的新失败面）。
 *
 * 一次 `call` 的失败分成四类，故意不合并：
 * - `not-ready`：还没握手成功就来问（界面应当显示"正在与宿主协商"，不是"节点坏了"）。
 * - `refused`：这一组在握手时没被授予（退化状态，界面上要读得回来，ADR-0011 决定 4）。
 * - `no-provider`：整组被授予但这条动词在 DSH 那侧没有对应物（例如 config 的版本历史，ADR-0013）。
 * - `timeout`：应答没来。跨文档没有背压，不设上界就等于一个卡死的面板拖着整个界面。
 *
 * @module xaihi-ui/bridge-document
 */

import {
  BRIDGE_CONTRACT_VERSION,
  BRIDGE_MAX_MESSAGE_BYTES,
  BRIDGE_REQUEST_TIMEOUT_MS,
  BRIDGE_SCHEMA,
  exceedsMessageBudget,
  groupOf,
  negotiateBridge,
  parseBridgeMessage,
  type BridgeHello,
  type BridgeMethod,
  type BridgeRequest,
  type BridgeReady,
  type NodeCapabilityId,
} from './host-bridge.ts'

/** 桥的错误：`reason` 是给界面读的键，`detail` 是人看的补充。 */
export class BridgeError extends Error {
  readonly reason: string
  readonly detail: string

  constructor(reason: string, detail: string) {
    super(`${reason}: ${detail}`)
    this.name = 'BridgeError'
    this.reason = reason
    this.detail = detail
  }
}

/** 往外壳那一侧投递消息。装配时包成 `parent.postMessage(msg, shellOrigin)`。 */
export type SendToShell = (message: BridgeHello | BridgeRequest) => void

export interface DocumentBridge {
  /** 握手应答；未完成时是 null（不是"空的 ready"）。 */
  ready(): BridgeReady | null
  /** 发出握手；应答由 `receive` 落地。 */
  hello(node: string): void
  /** 喂进一条来自外壳的消息。返回是否被当作桥消息处理。 */
  receive(raw: unknown, origin: string): boolean
  /** 跨界调用。失败一律抛 `BridgeError`。 */
  call(method: BridgeMethod, ...args: readonly unknown[]): Promise<unknown>
  /** 撤掉所有在飞的请求（文档卸载时用；留着会变成一堆 timeout）。 */
  abortAll(reason: string): void
}

/** HTTP 载体要的东西。`endpoint` 与 `sid` 由调用方（文档的 boot 信息）给，本模块不猜。 */
export interface HttpBridgeOptions {
  /** 消息投到哪，形如 `/xaihi/host`（不带 query）。 */
  endpoint: string
  /** 这一份文档的会话号；路由那侧按形状拒不合的。 */
  sid: string
  /** 这份界面要用到的能力组。 */
  requested: readonly NodeCapabilityId[]
  /** 传给内部会话的来源值。HTTP 没有"这条消息来自哪个 frame"，所以它只用来让那条来源判据自洽。 */
  selfOrigin: string
  /** 可注入的 fetch（取证与单测用）。缺省取 `globalThis.fetch`。 */
  fetchImpl?: typeof fetch
  /** 单条调用的上界。 */
  timeoutMs?: number
}

/**
 * 文档侧的**同源 HTTP 载体**：与 `createDocumentBridge` 同一套消息、同一套失败词，
 * 只是对面从"父帧"换成"Xaihi 自己的服务路由"。
 *
 * 存在的理由：桌面壳开出来的顶层窗里没有父帧（`window.parent === window`）、也没有 opener，
 * 而宿主凭证只发给主窗那一个 webContents（ADR-0011 的路线行有实测）。这条载体让节点界面
 * 在自家窗里也能问宿主，不需要在界面里分叉出"桌面版调用形状"。
 * @param options - 端点、会话号、能力组与可注入的 fetch。
 * @returns 与 postMessage 载体同形的桥会话（`hello`/`call`/`ready`/`receive`/`abortAll`）。
 */
export function createHttpDocumentBridge (options: HttpBridgeOptions): DocumentBridge {
  const call = options.fetchImpl ?? globalThis.fetch
  const url = `${options.endpoint}?sid=${encodeURIComponent(options.sid)}`
  let deliver: ((raw: unknown, origin: string) => boolean) | null = null
  let lastHello: BridgeHello | null = null

  /** 载体自己失败时的两种下文：请求回一条带原因的失败应答，握手回一份"什么都没给"的协商结果。 */
  const reportFailure = (message: BridgeHello | BridgeRequest, detail: string): void => {
    if (message.kind === 'hello') {
      const hello = lastHello ?? message
      const reasons: Partial<Record<NodeCapabilityId, string>> = {}
      for (const capability of hello.requested) reasons[capability] = `宿主路由不可达（${detail}）`
      deliver?.(negotiateBridge(hello, [], reasons), options.selfOrigin)
      return
    }
    deliver?.({
      schema: BRIDGE_SCHEMA,
      kind: 'response',
      id: message.id,
      ok: false,
      error: { reason: 'transport', detail },
    }, options.selfOrigin)
  }

  const send = (message: BridgeHello | BridgeRequest): void => {
    if (message.kind === 'hello') lastHello = message
    void (async () => {
      let payload: unknown
      try {
        const response = await call(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(message),
        })
        if (!response.ok) {
          reportFailure(message, `HTTP ${String(response.status)}`)
          return
        }
        payload = await response.json()
      } catch (error) {
        reportFailure(message, String(error))
        return
      }
      deliver?.(payload, options.selfOrigin)
    })()
  }

  const bridge = createDocumentBridge(send, options.selfOrigin, options.requested, options.timeoutMs)
  deliver = (raw: unknown, origin: string) => bridge.receive(raw, origin)
  return bridge
}

/**
 * 建立文档侧的桥会话。
 * @param send - 投给外壳。
 * @param selfOrigin - 文档自己的来源；外壳消息的来源必须等于它。
 * @param requested - 这份界面要用到的能力组。
 * @param timeoutMs - 单条调用的上界，缺省取契约里的常量。
 */
export function createDocumentBridge(
  send: SendToShell,
  selfOrigin: string,
  requested: readonly NodeCapabilityId[],
  timeoutMs: number = BRIDGE_REQUEST_TIMEOUT_MS,
): DocumentBridge {
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: BridgeError) => void; timer: ReturnType<typeof setTimeout>; method: BridgeMethod }>()
  let handshake: BridgeReady | null = null
  let seq = 0

  const failPending = (error: BridgeError) => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  return {
    ready: () => handshake,
    hello(node: string): void {
      const hello: BridgeHello = { schema: BRIDGE_SCHEMA, kind: 'hello', contractVersion: BRIDGE_CONTRACT_VERSION, node, requested: [...requested] }
      // 握手自己超限就没发出去的意义：直接以失败暴露，而不是发一条被外壳丢掉的消息。
      if (exceedsMessageBudget(hello, BRIDGE_MAX_MESSAGE_BYTES)) throw new BridgeError('too-large', '握手消息超过桥上界')
      send(hello)
    },
    receive(raw: unknown, origin: string): boolean {
      if (origin !== selfOrigin) return false
      const message = parseBridgeMessage(raw, 'from-shell')
      if (message === null) return false
      if (message.kind === 'ready') {
        handshake = message
        // 版本不一致时外壳会把所有组落到 refused；此时任何在飞请求都不可能再成功。
        if (message.granted.length === 0) failPending(new BridgeError('refused', '宿主没有授予任何能力组（看握手里的 degraded 列表）'))
        return true
      }
      if (message.kind !== 'response') return false
      const entry = pending.get(message.id)
      if (entry === undefined) return true
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.ok) entry.resolve(message.value)
      else entry.reject(new BridgeError(message.error?.reason ?? 'unknown', message.error?.detail ?? ''))
      return true
    },
    call(method: BridgeMethod, ...args: readonly unknown[]): Promise<unknown> {
      if (handshake === null) return Promise.reject(new BridgeError('not-ready', '还没拿到宿主握手应答'))
      if (!handshake.granted.includes(groupOf(method))) {
        const row = handshake.degraded.find((item) => item.capability === groupOf(method))
        return Promise.reject(new BridgeError('refused', row?.reason ?? `${groupOf(method)} 组未被授予`))
      }
      const request = { schema: BRIDGE_SCHEMA, kind: 'request' as const, id: `d${++seq}`, method, args }
      if (exceedsMessageBudget(request)) return Promise.reject(new BridgeError('too-large', `请求体超过桥上界（${method}）`))
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(request.id)
          reject(new BridgeError('timeout', `${method} 在 ${timeoutMs}ms 内没有应答`))
        }, timeoutMs)
        pending.set(request.id, { resolve, reject, timer, method })
        send(request)
      })
    },
    abortAll(reason: string): void {
      failPending(new BridgeError('aborted', reason))
      handshake = null
    },
  }
}
