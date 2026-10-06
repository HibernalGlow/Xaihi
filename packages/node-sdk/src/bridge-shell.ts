/**
 * 消息桥的外壳那一半：待在 DSH 的客户端 realm 里，替 Xaihi 文档执行它问宿主的事。
 *
 * 为什么必须有这一半：ADR-0009 实测 19 的元素穿不过 DSH 的槽契约（`ReactNode` 由宿主的 18 解释），
 * 所以文档与外壳之间只剩 `postMessage` 这一条通路；而文档里**不许直接打 DSH 的 API**
 * （同 origin 的 iframe 会自动带上 `dsh-auth-*` 会话 Cookie，`SameSite=Strict` 不挡同源嵌套，
 * 见 ADR-0009 后果 3b）。所以"有资格以操作者身份说话"的只有这一半。
 *
 * 这一半**不直接引 `ctx.remote.settings`**：装配侧把真面递进来，这里只收注入的面。
 * 客户端那侧的名字已经实机读回来了（2026-10-06，真 DSH 父页 + 端口 3399）：
 * `describe` 与 `update` 走通了整条往返（`config.get` 拿回设置文档、`config.save` 写进去且
 * revision 递增），`mutate` / `replace` 在 `typert.remote-client.d.ts:28-32` 里与它们并列。
 * 仍然按"没给就当没有"处理：名字读准不等于每台宿主都给，缺面时要读到退化而不是抛在桥中间。
 *
 * @module xaihi-ui/bridge-shell
 */

import {
  BRIDGE_SCHEMA,
  exceedsMessageBudget,
  negotiateBridge,
  parseBridgeMessage,
  providerOf,
  NODE_ID_PATTERN,
  STATE_SETTINGS_FIELD,
  STATE_SETTINGS_NS,
  type BridgeHello,
  type BridgeMessage,
  type BridgeMethod,
  type BridgeEnv,
  type BridgeReady,
  type BridgeResponse,
  type NodeCapabilityId,
} from './host-bridge.ts'

/** 注入的设置面：只列 DSH 那侧确认存在的动词。 */
export interface SettingsFace {
  /** 允许异步（远程面都返回 Promise）；求值处 await，绝不把 Promise 丢进 postMessage。 */
  describe(): unknown | Promise<unknown>
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
  /**
   * 路径级写入（实测自 `dsh-api-settings-controller`：`settings/mutate` 收
   * `{op:'set'|'unset', path: string[], value}`）。节点状态**优先走这一条**：
   * 两个节点窗口各写自己那一段，就不会互相覆盖整个 `nodeState`；只有面没有这条时
   * 才退回整段 `update`（那种写法会被并发窗口盖掉，所以退回来时要带一条可见的说明）。
   */
  mutate?(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<unknown>
  openDocument?(signal: AbortSignal): Promise<unknown>
}

/** 一条路径级编辑，形状取自 DSH 的 `SettingsPathOpView`（只用到 set）。 */
export interface SettingsPathOp {
  op: 'set' | 'unset'
  path: readonly string[]
  value?: unknown
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
  /**
   * 界面环境快照，随握手带过去。没给就**不带**（不猜一个亮色）：
   * 文档侧读到 undefined 时要把这一格显示成退化，而不是按默认值画一遍。
   */
  env?: BridgeEnv
}

/** 节点 id 的闸：形状读 `NODE_ID_PATTERN` 那份真源，原型键单独点名下。 */
function checkNodeKey(node: unknown): string | null {
  if (typeof node !== 'string' || node === '') return 'state 的第一段要是节点 id（非空字符串）'
  if (!NODE_ID_PATTERN.test(node)) {
    return `节点 id ${JSON.stringify(node)} 不合形状（^[a-z0-9][a-z0-9_-]{0,63}$，与 /xaihi/ui 那条寻址用同一份判据）`
  }
  // 这三个能过形状闸，但会写进对象的原型位上——形状闸管不到这一层，所以留一条明写的。
  if (node === '__proto__' || node === 'constructor' || node === 'prototype') return `节点 id ${node} 不能当设置里的键`
  return null
}

/** 设置文档里我们那一段的形状。 */
interface NodeSnapshot {
  /** 这个节点此刻存的 JSON 文本；没存过是 undefined。 */
  json?: string
  /** 整个节点段（只在外壳内部用来做整段回写，绝不过桥——过桥等于把别人的节点也发过去）。 */
  all: Record<string, unknown>
  /** 这一段的修订号，写回去时当 `expectedRevision` 用。 */
  revision?: number
}

/**
 * 从 `describe()` 的返回里读我们那一格。
 * @param settings - 注入的设置面。
 * @param node - 要哪个节点；空串 = 只要整段（整段回写前读一次现状用）。
 * @returns 读到的一段；设置里根本没有这一格时是 null。
 */
async function readNodeSnapshot(settings: SettingsFace, node: string): Promise<NodeSnapshot | null> {
  const described = await settings.describe()
  const rows = (described as { namespaces?: unknown }).namespaces
  if (!Array.isArray(rows)) return null
  const row = rows.find((entry) => (entry as { ns?: unknown }).ns === STATE_SETTINGS_NS) as
    | { value?: unknown; revision?: unknown }
    | undefined
  if (row === undefined) return null
  const section = (row.value as { nodeState?: unknown } | undefined)?.[STATE_SETTINGS_FIELD]
  if (section === null || typeof section !== 'object') return null
  const all: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
    if (typeof value === 'string') all[key] = value
  }
  const found = node === '' ? undefined : all[node]
  return {
    ...(typeof found === 'string' ? { json: found } : {}),
    all,
    ...(typeof row.revision === 'number' ? { revision: row.revision } : {}),
  }
}

/**
 * 把设置面的写应答**缩成一条** `{revision}`。
 *
 * 不是省流量的小事：DSH 的 `mutate` / `update` 回的是整份 `SettingsNamespaceView`
 * （schema + base + user + value 全带上，2026-10-06 在 3399 那台宿主上实测到 200 KiB 的节点状态
 * 写**已经落盘**，可应答体积超了桥的 256 KiB 上界，于是调用方读到的是 `too-large` ——
 * "写成了但看起来失败"是比失败更难查的一种分歧）。
 * 而 `expectedRevision` 本来就是这条写唯一需要送回的东西，整份文档留在外壳那侧。
 * @param value - 注入的面回来的原始应答（形状按 DSH 的 view，但我们不假设它有哪几块）。
 * @returns 只带 revision 的一条应答；读不到 revision 时回空对象（不编一个数）。
 */
function projectWriteAck(value: unknown): { revision?: number } {
  const revision = (value as { revision?: unknown } | undefined)?.revision
  return typeof revision === 'number' ? { revision } : {}
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
  if (method === 'config.get') {
    if (caps.settings === undefined) return unavailable(method)
    // await 是必须的：远程面返回的是 RemoteResult 的 Promise，
    // 直接把 Promise 交给 postMessage 会在那侧炸成"结构化克隆失败"。
    return { ok: true, value: await caps.settings.describe() }
  }
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
  if (method === 'state.getData') {
    const node = args[0]
    const checked = checkNodeKey(node)
    if (checked !== null) return { ok: false, reason: 'bad-args', detail: checked }
    if (caps.settings === undefined) return unavailable(method)
    const snapshot = await readNodeSnapshot(caps.settings, node as string)
    if (snapshot === null) return { ok: false, reason: 'state-namespace-missing', detail: `设置里没有 ${STATE_SETTINGS_NS}.${STATE_SETTINGS_FIELD} 这一段（本包的 config schema 声明了它才有）` }
    // 只把这个节点那一条发过去：整段发等于旁听别的节点的数据，也白占 256 KiB 的消息上界。
    return { ok: true, value: { ...(snapshot.json === undefined ? {} : { json: snapshot.json }), ...(snapshot.revision === undefined ? {} : { revision: snapshot.revision }) } }
  }
  if (method === 'state.patchData' || method === 'state.replaceData') {
    const [node, json, revision] = args as [unknown, unknown, number | undefined]
    const checked = checkNodeKey(node)
    if (checked !== null) return { ok: false, reason: 'bad-args', detail: checked }
    if (typeof json !== 'string') {
      return { ok: false, reason: 'bad-args', detail: 'state 的两条写都收 (节点 id, 已序列化的 JSON 文本, expectedRevision?)——序列化在文档那一侧' }
    }
    if (caps.settings === undefined) return unavailable(method)
    // 优先路径级写：各节点各写自己那一段，两个节点窗口不会互相盖掉整个字段。
    if (caps.settings.mutate !== undefined) {
      return {
        ok: true,
        value: projectWriteAck(await caps.settings.mutate(
          STATE_SETTINGS_NS,
          [{ op: 'set', path: [STATE_SETTINGS_FIELD, node as string], value: json }],
          revision,
        )),
      }
    }
    // 面没给 mutate 时才整段回写——这条路会连别人的段落一起覆盖，所以说明里点明代价。
    const current = await readNodeSnapshot(caps.settings, '')
    if (current === null) return { ok: false, reason: 'state-namespace-missing', detail: `设置里没有 ${STATE_SETTINGS_NS}.${STATE_SETTINGS_FIELD} 这一段（本包的 config schema 声明了它才有）` }
    const merged: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(current.all)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      merged[key] = value
    }
    merged[node as string] = json
    return { ok: true, value: projectWriteAck(await caps.settings.update(STATE_SETTINGS_NS, { [STATE_SETTINGS_FIELD]: merged }, revision)) }
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
  if (caps.settings !== undefined) {
    offered.add('config')
    // 同一面也提供 state 的**持久那一份**：文档里同步的 store 不动，过桥的只是快照读写，
    // 落点是 `xaihi-core` 那个 volatile 字段（2026-10-06 实测：写成功、revision 递增、
    // 值按节点 id 分格落在 profile 的设置层里）。
    offered.add('state')
  }
  if (caps.runner !== undefined) offered.add('runner')
  for (const extra of caps.extra ?? []) offered.add(extra)
  // 这两组是桥自己就能答的：版本与协商本身。
  offered.add('contract')
  // `env` 不能无条件宣告授予：握手里的 `granted` 一旦写了 env，文档那边
  // `host.env.theme` 就必须读得到，否则症状是"面板读环境时抛 refused，而协商说它给了"
  // （2026-10-06 在 3399 那台宿主上实测就是这个形状：granted 里有 env，ready 里根本没有这一格）。
  if (caps.env !== undefined) offered.add('env')

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
        ready = negotiateBridge(hello, [...offered], caps.reasons ?? {}, caps.env)
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
        let outcome: Outcome
        try {
          outcome = await evaluate(message.method, message.args, caps)
        } catch (error) {
          // 注入的面**就是会抛**（DSH 的远程面把失败装在 RemoteResult 里，拆开就抛）。
          // 不接住的话这条请求没有任何应答，文档那一侧只能等到 timeout，
          // 症状从"设置冲突"变成"面板转圈"，原因离现场很远。
          const thrown = error as { reason?: unknown, message?: unknown }
          outcome = {
            ok: false,
            reason: typeof thrown.reason === 'string' ? thrown.reason : 'threw',
            detail: typeof thrown.message === 'string' ? thrown.message : String(error),
          }
        }
        const reply = respond(message.id, outcome)
        if (exceedsMessageBudget(reply)) {
          send(respond(message.id, { ok: false, reason: 'too-large', detail: '应答超过桥上界' }))
        } else send(reply)
        return true
      }
      return false
    },
  }
}

/** 某个 frame 窗口的最小面（真浏览器与 jsdom 都满足）。 */
export interface FrameWindowLike {
  postMessage(message: unknown, targetOrigin: string): void
}

/** 桥要投给它的那个 frame 的最小面。 */
export interface FrameLike {
  contentWindow?: FrameWindowLike | null
}

/** 浏览器 `MessageEvent` 里这条桥真正用到的三片。 */
export interface IncomingMessage {
  data: unknown
  origin: string
  source: unknown
}

/**
 * 把一座外壳侧的桥接到某个 frame 上。
 *
 * 住在 SDK 而不是界面层的原因：这条闸是**桥的契约**的一部分（一屏多框时谁的话归谁接），
 * 而取证脚本要在真浏览器里打在它身上（`scripts/frame-isolation-live.mjs`）——
 * 判据必须落在生产实现上，不能在脚本里另写一份同款的。
 * @param caps - 外壳真能兑现的东西。
 * @param selfOrigin - 文档那一侧的来源（同源是这条桥唯一的信任边界）。
 * @param frame - 取 frame 元素自己的口子（挂载前后都可能拿到 null，所以要成函数）。
 * @returns 交给 `message` 监听器的桥，与一条"这话是不是从我这个框来的"的判据。
 */
export function wireShellToFrame(caps: ShellCapabilities, selfOrigin: string, frame: () => FrameLike | null) {
  const bridge = createShellBridge(caps, (message) => {
    frame()?.contentWindow?.postMessage(message, selfOrigin)
  }, selfOrigin)
  return {
    bridge,
    /** 只有真正发给自己这个 frame 的消息才交给桥；别的 frame/窗口的一律不理。 */
    fromThisFrame(event: IncomingMessage): boolean {
      // 没挂上的 frame 什么都不能匹配。写成 `event.source === (… ?? null)` 时
      // `source: null` 的外来消息会被当成自己人（这条测试真抓到了，改的是这里不是测试）。
      const target = frame()?.contentWindow
      if (target === undefined || target === null) return false
      return event.source === target
    },
  }
}
