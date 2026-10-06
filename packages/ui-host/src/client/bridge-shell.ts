/**
 * 消息桥的外壳那一半：待在 DSH 的客户端 realm 里，替 Xaihi 文档执行它问宿主的事。
 *
 * 为什么必须有这一半：ADR-0009 实测 19 的元素穿不过 DSH 的槽契约（`ReactNode` 由宿主的 18 解释），
 * 所以文档与外壳之间只剩 `postMessage` 这一条通路；而文档里**不许直接打 DSH 的 API**
 * （同 origin 的 iframe 会自动带上 `dsh-auth-*` 会话 Cookie，`SameSite=Strict` 不挡同源嵌套，
 * 见 ADR-0009 后果 3b）。所以"有资格以操作者身份说话"的只有这一半。
 *
 * 这一半**不直接引 `ctx.remote.settings`**：那五个动词在 `SettingsController` 上是确认过的
 * （`@deepseek-ai/dsh-api-settings-controller` 的 `lib/types/index.d.ts:49-85`：
 * `describe` / `update` / `replace` / `mutate` / `openSettingsDocument`），但客户端那一侧的
 * typert 包装名还没在实机上读回来（本仓现有代码只用到 `ctx.remote.commands.execute` 与
 * `ctx.remote.invokeSelected`）。因此这里收一个注入的面，装配侧把真面递进来；
 * 名字读不准就当没给，而不是猜一个签名然后假装能跑（AGENTS.md：不许伪造它没给的数据）。
 *
 * @module xaihi-ui/bridge-shell
 */

import {
  BRIDGE_SCHEMA,
  exceedsMessageBudget,
  negotiateBridge,
  parseBridgeMessage,
  providerOf,
  type BridgeHello,
  type BridgeMessage,
  type BridgeMethod,
  type BridgeReady,
  type BridgeResponse,
  type NodeCapabilityId,
} from '@hibernalglow/xaihi-sdk'

/** 注入的设置面：只列 DSH 那侧确认存在的动词。 */
export interface SettingsFace {
  describe(): unknown
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
  openDocument?(signal: AbortSignal): Promise<unknown>
}

/** 注入的运行面：节点动作的执行通路（装配侧经 `ctx.remote.commands` 或工具分发接上）。 */
export interface RunFace {
  run(nodeId: string, input: unknown): Promise<{ runId: string }>
  cancel?(runId: string): Promise<boolean>
}

/** 外壳此刻真能兑现的东西。缺失的组不要塞占位实现——缺失会以退化形式显示到界面上。 */
export interface ShellCapabilities {
  settings?: SettingsFace
  runner?: RunFace
  /** 额外可给的能力组；用于把"实测确实有对应物"的组加进 offered 而不改代码形状。 */
  extra?: readonly NodeCapabilityId[]
  /** 每组没给的原因，落进 `ready.degraded`。 */
  reasons?: Partial<Record<NodeCapabilityId, string>>
}

/** 一条请求的求值结果。 */
type Outcome = { ok: true; value?: unknown } | { ok: false; reason: string; detail?: string }

const unavailable = (method: BridgeMethod): Outcome => ({
  ok: false,
  reason: 'no-provider',
  detail: `${method} 在 DSH 0.2.0-rc.2 这一侧没有对应物（按 ADR-0013，标准面给不了的走提案，不走假实现）`,
})

/** 把一条已授权的请求打到注入的面上。 */
async function evaluate(method: BridgeMethod, args: readonly unknown[], caps: ShellCapabilities): Promise<Outcome> {
  if (providerOf(method) === 'document') return { ok: false, reason: 'document-owned', detail: `${method} 归文档自己实现，不该过桥` }
  if (method === 'config.get') return caps.settings === undefined ? unavailable(method) : { ok: true, value: caps.settings.describe() }
  if (method === 'config.save' || method === 'config.saveUi') {
    if (caps.settings === undefined) return unavailable(method)
    const [ns, patch, revision] = args as [string, Record<string, unknown>, number | undefined]
    if (typeof ns !== 'string' || ns === '' || patch === null || typeof patch !== 'object') {
      return { ok: false, reason: 'bad-args', detail: 'config.save 收 (namespace, patch, expectedRevision?)' }
    }
    return { ok: true, value: await caps.settings.update(ns, patch, revision) }
  }
  if (method === 'config.openFile') {
    if (caps.settings?.openDocument === undefined) return unavailable(method)
    return { ok: true, value: await caps.settings.openDocument(new AbortController().signal) }
  }
  if (method === 'runner.run') {
    if (caps.runner === undefined) return unavailable(method)
    const [nodeId, input] = args as [string, unknown]
    if (typeof nodeId !== 'string' || nodeId === '') return { ok: false, reason: 'bad-args', detail: 'runner.run 第一段要是节点 id' }
    return { ok: true, value: await caps.runner.run(nodeId, input) }
  }
  if (method === 'runner.cancelCurrent') {
    if (caps.runner?.cancel === undefined) return unavailable(method)
    const [runId] = args as [string]
    return { ok: true, value: await caps.runner.cancel(runId) }
  }
  if (method === 'runner.getInfo') return unavailable(method)
  if (method.startsWith('config.')) return unavailable(method)
  return unavailable(method)
}

const respond = (id: string, outcome: Outcome): BridgeResponse =>
  outcome.ok
    ? { schema: BRIDGE_SCHEMA, kind: 'response', id, ok: true, value: outcome.value }
    : { schema: BRIDGE_SCHEMA, kind: 'response', id, ok: false, error: { reason: outcome.reason, ...(outcome.detail === undefined ? {} : { detail: outcome.detail }) } }

/**
 * 一条桥会话的外壳侧。
 * @param caps - 外壳此刻真能给的东西。
 * @param send - 往文档那一侧投递消息（装配侧包 `frame.contentWindow.postMessage`）。
 * @param selfOrigin - 文档那一侧的来源；同源是这条桥唯一的信任边界。
 * @param onHello - 收到握手后的额外副作用（记账、日志），可缺省。
 * @returns 交给 `window.addEventListener('message')` 的处理器与握手应答。
 */
export function createShellBridge(
  caps: ShellCapabilities,
  send: (message: BridgeMessage) => void,
  /** 文档那一侧的来源；`event.origin` 不等于它就不当作桥消息处理（同源是这条桥的唯一信任边界）。 */
  selfOrigin: string,
  onHello?: (ready: BridgeReady) => void,
) {
  let ready: BridgeReady | undefined
  const offered = new Set<NodeCapabilityId>()
  if (caps.settings !== undefined) offered.add('config')
  if (caps.runner !== undefined) offered.add('runner')
  for (const extra of caps.extra ?? []) offered.add(extra)
  // 这两组是桥自己就能答的：版本与协商本身，以及界面环境（主题/平台）由外壳这一侧转发。
  offered.add('contract')
  offered.add('env')

  return {
    /** 最近一次握手结果；未握手时是 undefined（不是"空的 ready"，那会让退化状态读不回来）。 */
    ready: () => ready,
    /** 喂进一条外来消息；返回是否被当作桥消息处理了。 */
    async receive(raw: unknown, origin: string): Promise<boolean> {
      if (origin !== selfOrigin) return false
      const message = parseBridgeMessage(raw, 'from-document')
      if (message === null) return false
      if (message.kind === 'hello') {
        const hello = message as BridgeHello
        ready = negotiateBridge(hello, [...offered], caps.reasons ?? {})
        if (!exceedsMessageBudget(ready)) send(ready)
        onHello?.(ready)
        return true
      }
      if (message.kind === 'request') {
        // 没握手就来的请求一律拒：授权集还没定，此时答应任何一条都等于绕过协商。
        if (ready === undefined) {
          const denied = respond(message.id, { ok: false, reason: 'not-negotiated', detail: '外壳还没给出握手应答' })
          if (!exceedsMessageBudget(denied)) send(denied)
          return true
        }
        const group = message.method.slice(0, message.method.indexOf('.')) as NodeCapabilityId
        if (!ready.granted.includes(group)) {
          const denied = respond(message.id, { ok: false, reason: 'capability-refused', detail: `${group} 组在握手时没被授予` })
          if (!exceedsMessageBudget(denied)) send(denied)
          return true
        }
        const outcome = await evaluate(message.method, message.args, caps)
        const reply = respond(message.id, outcome)
        if (exceedsMessageBudget(reply)) {
          send(respond(message.id, { ok: false, reason: 'too-large', detail: `应答超过桥上界` }))
        } else send(reply)
        return true
      }
      return false
    },
  }
}
