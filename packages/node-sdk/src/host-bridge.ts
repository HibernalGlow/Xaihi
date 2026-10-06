/**
 * Xaihi 文档（React 19）与 DSH 外壳（React 18）之间那条消息桥的线上形状。
 *
 * 为什么要有这一层：DSH 的槽契约只让 `ReactNode` 穿过（`@deepseek-ai/dsh-client-ui-slots`
 * 的 `lib/types/renderer.d.ts:244-252`），而那份 ReactNode 由宿主的 18 解释，
 * 19 创建的元素穿不过去（实机症状是 `Minified React error #31`）。
 * 所以能穿的只有 DOM：外壳放一个 `<iframe>`，整个 Xaihi 活在文档里（ADR-0009 / ADR-0011 决定 3）。
 * 一跨过界就只剩 `postMessage`，于是"面板能问宿主什么"必须成为**有版本的契约**，
 * 而不是两边各写一套字段名。
 *
 * **动词表不是本仓发明的**：九组能力名与每组的成员名逐字搬自上游合同
 * `@xiranite/contract` 的 `NodeHostCapabilities`（`:431-444`）与 `NodeHostApi`（`:507-540`）。
 * 搬它而不是造它，是 ADR-0006 决定 3 的直接要求（UI 层契约以上游 `AppNodeEntry` 为准）。
 * 上游那 11 条 `@deprecated` 的平铺方法（`getData` / `patchData` / `listComponents` / …）
 * **不进桥**：它们是迁移期的兼容面，而本仓的文档一侧从一开始就只有 `host.state` 这一条形状。
 *
 * 一条与上游不同的地方要明说：上游的工作台与节点 UI 在**同一个 realm**，`host` 是进程内的对象；
 * 这里 `host` 是**跨文档代理**，所以任何返回函数参数的方法都只能传可序列化的值。
 * `runner.run(nodeId, input, onEvent)` 的第三个参数因此**不能过桥**——
 * 事件改由文档自己订阅 `/xaihi/operations/stream`（本仓的 SSE，同源、不经 DSH 鉴权面），
 * 见 `xaihi-sdk/operations`。这不是省事的绕法，而是那条桥上唯一合法的形状（ADR-0009 后果 3b：
 * 文档内不许直接打 DSH 的 API，但它自己的路由是它自己的）。
 *
 * @module xaihi-sdk/host-bridge
 */

import type { OperationEventKind } from './operations.ts'

/** 桥的判别式 schema 名。 */
export const BRIDGE_SCHEMA = 'xaihi.bridge/1' as const

/**
 * 桥承载的宿主合同版本。值逐字取自上游 `NODE_HOST_CONTRACT_VERSION`（`packages/contract/src/index.ts:8`）；
 * 不一致就**拒绝**而不是静默降级——与本仓对契约版本的一贯做法一致。
 */
export const BRIDGE_CONTRACT_VERSION = '1.0.0' as const

/** 单条桥消息的字节上界：跨文档的消息没有背压，不设上界等于把外壳让给一个失控的面板。 */
export const BRIDGE_MAX_MESSAGE_BYTES = 256 * 1024

/** 一次 `request` 等待 `response` 的上界（毫秒）。没有上界时，桥丢一条消息会变成"面板永远转圈"。 */
export const BRIDGE_REQUEST_TIMEOUT_MS = 30_000

/** 九组能力的名字，逐字搬自上游。 */
export const NODE_CAPABILITY_IDS = [
  'contract',
  'state',
  'workspace',
  'runner',
  'clipboard',
  'downloads',
  'localFiles',
  'config',
  'env',
] as const

export type NodeCapabilityId = (typeof NODE_CAPABILITY_IDS)[number]

/** 必给的三组：缺任何一条，文档里的节点表面根本跑不起来。 */
export const REQUIRED_CAPABILITIES = ['contract', 'state', 'env'] as const satisfies readonly NodeCapabilityId[]

/**
 * 桥上的方法名 = `<组>.<成员>`，成员名逐字取自上游那九个接口。
 * 只列**可序列化**的那些：`runner.run` 的 `onEvent` 回调不在桥上走（见模块注释），
 * `localFiles.stageFiles(File[])` 收的是浏览器 File 对象，只能在文档侧就地处理，
 * `localFiles.subscribeDrops` 交回的是取消函数——这两处的实现因此属于文档内部，不属于桥。
 */
export const BRIDGE_METHODS = [
  'state.getData',
  'state.patchData',
  'state.replaceData',
  'workspace.listComponents',
  'workspace.updateComponent',
  'runner.run',
  'runner.getInfo',
  'runner.cancelCurrent',
  'clipboard.readText',
  'clipboard.writeText',
  'clipboard.readFiles',
  'clipboard.writeFiles',
  'clipboard.clearFiles',
  'clipboard.readImage',
  'clipboard.writeImage',
  'downloads.text',
  'localFiles.getUrl',
  'localFiles.openPath',
  'localFiles.revealPath',
  'localFiles.pickFiles',
  'localFiles.pickDirectory',
  'localFiles.pickDirectories',
  'localFiles.list',
  'config.get',
  'config.save',
  'config.getPresets',
  'config.createPreset',
  'config.updatePreset',
  'config.deletePreset',
  'config.getVersions',
  'config.inspectVersion',
  'config.restoreVersion',
  'config.exportConfig',
  'config.importConfig',
  'config.createBackup',
  'config.getHistoryRepository',
  'config.setHistoryRemote',
  'config.syncHistory',
  'config.getUi',
  'config.saveUi',
  'config.openFile',
] as const satisfies readonly `${NodeCapabilityId}.${string}`[]

export type BridgeMethod = (typeof BRIDGE_METHODS)[number]

/** 方法名属于哪一组：授权判断按组做，不按单个方法做（与上游的声明粒度一致）。 */
export function groupOf(method: BridgeMethod): NodeCapabilityId {
  return method.slice(0, method.indexOf('.')) as NodeCapabilityId
}

/**
 * 外壳**今天真能兑现**的那部分动词。这张表是"谁能实现这条"的唯一记录处，
 * 因为不写下来时，剩下那 13 条 `config.*` 看起来就像"照着名字实现就行"——
 * 而那条路通向的是伪造一份 DSH 没给的东西（AGENTS.md「不碰 DSH 的三样东西」）。
 *
 * 出处：DSH 0.2.0-rc.2 的 `@deepseek-ai/dsh-api-settings-controller` 只有
 * `describe` / `update` / `replace` / `mutate` / `openSettingsDocument` 五个动词
 * （实测自 `lib/types/index.d.ts:49-85`）。presets、版本历史、备份、远程同步、导出导入
 * 在那一侧**没有任何对应物**，所以 `SHELL_UNSERVED` 里那批只能提 proposal（见 P1 的同一条纪律），
 * 或者由界面明确显示"这一格没有提供者"。
 */
export const SHELL_SERVED_METHODS = [
  'config.get',
  'config.save',
  'config.getUi',
  'config.saveUi',
  'config.openFile',
  'state.getData',
  'state.patchData',
  'state.replaceData',
] as const satisfies readonly BridgeMethod[]

/** 在动词表里、但外壳今天给不了的：握手时这些必须以退化形式露出来，不许静默。 */
export const SHELL_UNSERVED_METHODS = BRIDGE_METHODS.filter(
  (method) => !(SHELL_SERVED_METHODS as readonly string[]).includes(method),
) as readonly BridgeMethod[]

/**
 * 一条动词的归属：`document` 表示文档自己实现（状态与工作台几何都在文档里），
 * `shell` 表示必须过桥，`unprovided` 表示今天没人能提供。
 */
export type BridgeProvider = 'document' | 'shell' | 'unprovided'

/**
 * 按组登记的归属。`workspace` 与 `env`/`contract` 归文档：上游那套工作台几何本来就在 UI 侧，
 * 过桥等于把同一份状态放两个 realm，而 hooks 绑定具体那一份 React（ADR-0009 的实测）。
 *
 * `state` **不在这里**——它被拆成了两半，这也是节点 UI 仍能一行不改的原因：
 * 同步的那一份（`getData()` 返回值、`patchData()` 立即生效）永远留在文档里，
 * 过桥的只是它那份**持久快照**（预取来 hydrate、写后刷出去）。
 * 落点是本包声明的一个 volatile 字段（见 `STATE_SETTINGS_NS` / `STATE_SETTINGS_FIELD`）：
 * 实测 DSH 的 remote 设置面只收 schema 里声明过的 volatile 路径，
 * 任意 JSON 一律 `Config field "…" is not volatile`，所以值的形状是"节点 id → JSON 文本"。
 */
export const DOCUMENT_OWNED_GROUPS = ['workspace', 'env', 'contract'] as const satisfies readonly NodeCapabilityId[]

/** `state.*` 持久快照所在的设置命名空间（= 宿主侧那行 loader 的 id）。 */
export const STATE_SETTINGS_NS = 'xaihi-core' as const

/**
 * 节点 id 唯一的那道形状闸。
 *
 * 为什么要有真源而不是两处各写一份：同一件事在本仓有**两道门**——
 * `/xaihi/ui/<rev>/index.html?node=…`（ADR-0011 决定 3 的寻址）与桥上的 `state.<verb>(node)`。
 * 2026-10-06 在真宿主上实测到两处不一致的后果：路由那侧按这个形状拒，桥上却把
 * `../etc` 当成一个合法的设置键收下了（写进 `nodeState["../etc"]`，虽然落不到文件系统路径上，
 * 但那份数据的归属就再也读不回来了）。两道门读同一份判据，词汇表也只有一份。
 */
export const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** 那个 volatile 字段的字段名，形状是 `Record<nodeId, JSON 文本>`。 */
export const STATE_SETTINGS_FIELD = 'nodeState' as const

/** 这条动词今天由谁提供。 */
export function providerOf(method: BridgeMethod): BridgeProvider {
  if ((DOCUMENT_OWNED_GROUPS as readonly string[]).includes(groupOf(method))) return 'document'
  if ((SHELL_SERVED_METHODS as readonly string[]).includes(method)) return 'shell'
  return 'unprovided'
}

/** 文档→外壳的请求。 */
export interface BridgeRequest {
  schema: typeof BRIDGE_SCHEMA
  kind: 'request'
  id: string
  method: BridgeMethod
  args: readonly unknown[]
}

/** 外壳→文档的应答。`unavailable` 是"这组能力此刻给不了"，与"这次调用失败"要分开。 */
export interface BridgeResponse {
  schema: typeof BRIDGE_SCHEMA
  kind: 'response'
  id: string
  ok: boolean
  value?: unknown
  error?: { reason: string; detail?: string }
}

/**
 * 握手。文档报它要什么，外壳答它给什么。
 *
 * `granted` 只列外壳**此刻真能兑现**的组：给不了的不进 granted，而是带一条 `degraded` 说明。
 * 这条区分是 ADR-0011 决定 4（降级铁律）的落点——界面必须能读回"这条能力是退化状态"，
 * 不许静默、更不许伪造一个能调但什么都没做的实现。
 */
export interface BridgeHello {
  schema: typeof BRIDGE_SCHEMA
  kind: 'hello'
  contractVersion: string
  /** 打开的是哪个节点的表面；空串 = 整个工作台（ADR-0011 决定 3：同一份文档 + 寻址参数）。 */
  node: string
  requested: readonly NodeCapabilityId[]
}

export interface BridgeDegradation {
  capability: NodeCapabilityId
  /** 退化原因，必须是使用者读得懂的一句话，不是内部枚举名。 */
  reason: string
}

export interface BridgeReady {
  schema: typeof BRIDGE_SCHEMA
  kind: 'ready'
  contractVersion: string
  granted: readonly NodeCapabilityId[]
  refused: readonly NodeCapabilityId[]
  degraded: readonly BridgeDegradation[]
  /** 外壳没答这一格时是 undefined（不是猜一个亮色）；文档侧读到 undefined 必须显示退化。 */
  env?: BridgeEnv
}

export type BridgeMessage = BridgeHello | BridgeReady | BridgeRequest | BridgeResponse

/**
 * 界面环境快照。上游 `NodeEnvCapability` 是数据不是方法（`theme` / `platform`），
 * 所以它**没有对应的桥动词**——没有 `env.getX` 这种东西可搬。
 * 挂在握手上带过来是本仓的决定，理由：文档那一侧要立刻用它决定暗/亮与主题变量往哪写
 * （ADR-0008 的"两边都写"），等一次额外的往返只会把首屏分成两次跳变。
 */
export interface BridgeEnv {
  theme: 'light' | 'dark'
  platform: string
}

/** 一条 `ready` 里每条被拒/退化的原因，按组拼成一行的读数（面板与 `/xaihi/debug.json` 都用它）。 */
export function describeNegotiation(ready: BridgeReady): string {
  const parts = [`granted=[${ready.granted.join(', ') || '（无）'}]`]
  if (ready.refused.length > 0) parts.push(`refused=[${ready.refused.join(', ')}]`)
  if (ready.degraded.length > 0) {
    parts.push(`degraded=${ready.degraded.map((row) => `${row.capability}:${row.reason}`).join('，')}`)
  }
  return parts.join(' · ')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCapability = (value: unknown): value is NodeCapabilityId =>
  typeof value === 'string' && (NODE_CAPABILITY_IDS as readonly string[]).includes(value)

const isMethod = (value: unknown): value is BridgeMethod =>
  typeof value === 'string' && (BRIDGE_METHODS as readonly string[]).includes(value)

/**
 * 校验一条外来消息。
 *
 * 硬失败而不是宽容解析：这条桥的另一端可能是一个来源不明的文档框，
 * "能读出字段就当作合法"会让拼错的 method 变成运行时才发现的 undefined。
 * @param raw - 待校验的未知值（通常是 `postMessage` 的 `data`）。
 * @param direction - `'inbound'` 表示外壳收到的（只许 hello/request 之外的两种之一，见下）。
 * @returns 校验通过的消息，或 null。
 */
export function parseBridgeMessage(raw: unknown, direction: 'from-document' | 'from-shell'): BridgeMessage | null {
  if (!isRecord(raw) || raw.schema !== BRIDGE_SCHEMA) return null
  const kind = raw.kind
  if (kind === 'hello') {
    if (direction !== 'from-document') return null
    if (typeof raw.contractVersion !== 'string' || typeof raw.node !== 'string') return null
    if (!Array.isArray(raw.requested) || !raw.requested.every(isCapability)) return null
    return {
      schema: BRIDGE_SCHEMA,
      kind: 'hello',
      contractVersion: raw.contractVersion,
      node: raw.node,
      requested: [...raw.requested] as NodeCapabilityId[],
    }
  }
  if (kind === 'request') {
    if (direction !== 'from-document') return null
    if (typeof raw.id !== 'string' || raw.id === '') return null
    if (!isMethod(raw.method)) return null
    if (!Array.isArray(raw.args)) return null
    return { schema: BRIDGE_SCHEMA, kind: 'request', id: raw.id, method: raw.method, args: [...raw.args] }
  }
  if (kind === 'ready') {
    if (direction !== 'from-shell') return null
    if (typeof raw.contractVersion !== 'string') return null
    if (!Array.isArray(raw.granted) || !raw.granted.every(isCapability)) return null
    if (!Array.isArray(raw.refused) || !raw.refused.every(isCapability)) return null
    if (!Array.isArray(raw.degraded)) return null
    let env: BridgeEnv | undefined
    if (raw.env !== undefined) {
      if (!isRecord(raw.env) || (raw.env.theme !== 'light' && raw.env.theme !== 'dark') || typeof raw.env.platform !== 'string') return null
      env = { theme: raw.env.theme, platform: raw.env.platform }
    }
    const rows: BridgeDegradation[] = []
    for (const item of raw.degraded) {
      if (!isRecord(item) || !isCapability(item.capability) || typeof item.reason !== 'string') return null
      rows.push({ capability: item.capability, reason: item.reason })
    }
    return {
      schema: BRIDGE_SCHEMA,
      kind: 'ready',
      contractVersion: raw.contractVersion,
      granted: [...raw.granted] as NodeCapabilityId[],
      refused: [...raw.refused] as NodeCapabilityId[],
      degraded: rows,
      ...(env === undefined ? {} : { env }),
    }
  }
  if (kind === 'response') {
    if (direction !== 'from-shell') return null
    if (typeof raw.id !== 'string') return null
    if (typeof raw.ok !== 'boolean') return null
    if (raw.error !== undefined) {
      if (!isRecord(raw.error) || typeof raw.error.reason !== 'string' || raw.error.reason === '') return null
      if (typeof raw.error.detail !== 'string' && raw.error.detail !== undefined) return null
      // detail 缺失时**不写这个键**而不是写成 undefined：exactOptionalPropertyTypes 下
      // `{ detail: undefined }` 与"没有 detail"是两件事，后者才是"这条错误没有补充说明"。
      const error = raw.error.detail === undefined
        ? { reason: raw.error.reason }
        : { reason: raw.error.reason, detail: raw.error.detail }
      return { schema: BRIDGE_SCHEMA, kind: 'response', id: raw.id, ok: raw.ok, error }
    }
    // 失败而不带原因的应答必须拒：否则界面收到的是一条"红了但没说为什么"的记录，
    // 而这条桥上最贵的错误恰恰是那种读不回原因的。
    if (raw.ok === false) return null
    return { schema: BRIDGE_SCHEMA, kind: 'response', id: raw.id, ok: true, value: raw.value }
  }
  return null
}

/** 消息字节数（UTF-8），供上界判断；序列化失败视为超限而不是放行。 */
export function messageBytes(message: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(message)).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/** 是否超过单条消息上界。 */
export function exceedsMessageBudget(message: unknown, limit = BRIDGE_MAX_MESSAGE_BYTES): boolean {
  return messageBytes(message) > limit
}

/**
 * 握手求值：把"文档要什么"与"外壳能给什么"折成一份 `ready`。
 *
 * 合同版本不一致时**整桥拒绝**（`granted` 为空、全部落到 `refused`），并给一条退化说明；
 * 不做"按较低版本行事"，因为那正是最难发现的那类错。
 * @param hello - 文档侧的握手。
 * @param offered - 外壳此刻真能兑现的组。
 * @param reasons - 每条没给的组的原因（缺省给一条通用文案，但装配侧应当逐条填）。
 * @returns 握手应答。
 */
export function negotiateBridge(
  hello: BridgeHello,
  offered: readonly NodeCapabilityId[],
  reasons: Partial<Record<NodeCapabilityId, string>> = {},
  env?: BridgeEnv,
): BridgeReady {
  const versionOk = hello.contractVersion === BRIDGE_CONTRACT_VERSION
  const offeredSet = new Set(versionOk ? offered : [])
  const granted: NodeCapabilityId[] = []
  const refused: NodeCapabilityId[] = []
  const degraded: BridgeDegradation[] = []
  for (const capability of hello.requested) {
    if (offeredSet.has(capability)) granted.push(capability)
    else {
      refused.push(capability)
      degraded.push({
        capability,
        reason: !versionOk
          ? `宿主合同版本不匹配（文档 ${hello.contractVersion} / 外壳 ${BRIDGE_CONTRACT_VERSION}）`
          : reasons[capability] ?? '外壳没有提供这一组',
      })
    }
  }
  for (const required of REQUIRED_CAPABILITIES) {
    if (!granted.includes(required) && !refused.includes(required)) {
      refused.push(required)
      degraded.push({ capability: required, reason: reasons[required] ?? '外壳没有提供这一组（而它是必给的）' })
    }
  }
  return {
    schema: BRIDGE_SCHEMA,
    kind: 'ready',
    contractVersion: BRIDGE_CONTRACT_VERSION,
    granted,
    refused,
    degraded,
    ...(env === undefined ? {} : { env }),
  }
}

/** 上游 `OperationEventKind` 在本桥语境下的别名：事件本身不过桥，只有名字对得上。 */
export type BridgeEventKind = OperationEventKind
