/**
 * 节点内存保护设置的读写面（客户端半边）。
 *
 * 上游那份同名文件走的是 Xiranite 自己的 HTTP 后端。那条通路 ADR-0013 整块不接：
 * 值只有一个出口 = DSH 的 settings 面，声明在 `packages/core` 的
 * `Config.nodeMemoryProtection`（volatile），写必须带 `expectedRevision`，
 * 冲突是**读得回的状态**而不是 toast 里的"失败"。
 *
 * 所以这里不自己存东西，只做三件事：读整份 Config、只换自己那一格、写回去。
 * "只换自己那一格"是刻意的：`save` 交的是整份对象，先读后写才能保证
 * `verbose` / `uiBundleDir` / `nodeState` / `nodeUi` 不被这一格写抹掉
 * （判据在 tests/local-backend-control.spec.ts，那条"整份表不先 load 会抹掉别人条目"的亏记过）。
 *
 * 返回形状与上游一致（`{ supported, settings }`，失败靠抛），因此搬来的组件
 * 和搬来的那份测试 mock 都不用改调用面；只多了一条 `reason`，因为这里有两类
 * "不支持"是上游没有的：面还没装配、以及服务端没声明这一格。
 *
 * 设置面是**装配点注入**的（`setNodeMemoryProtectionFace`）：文档侧的 host 装配还没落地
 * （`src/document/main.tsx` 里没有 createDocumentHost），这里不猜一个单例出来。
 * 没注入时读回来的是 `supported: false` + 原因，界面据此显示退化，不装数值（ADR-0011）。
 */

/**
 * 类型与默认值写在**本包**，不引 `@hibernalglow/xaihi-shared`：那份是 zod 写的，而
 * `packages/shared` 有意不入 pnpm workspace（它的 `workspace:*` 依赖会让全仓解不出树），
 * 于是 ui-host 只要 import 它就会被拖去解析 `zod` —— 实测 vitest 收集期直接红：
 * `Failed to resolve import "zod" from "../shared/src/index.ts"`。
 * 也不引 `@hibernalglow/xaihi-core`：那一包要 cordis/schemastery，进不了浏览器产物。
 * 所以默认数字这里是**镜像**，真源是 core 那一行；漂移由 tests/core-defaults-parity.spec.ts 钉住。
 */
export interface NodeMemoryProtectionPolicySettingsDTO {
  maxRssGrowthMiB: number
  maxHeapGrowthMiB: number
  maxRetainedEvents: number
  sampleIntervalMs: number
}

export interface NodeMemoryProtectionSettingsDTO {
  defaultPolicy: NodeMemoryProtectionPolicySettingsDTO
  nodePolicies: Record<string, NodeMemoryProtectionPolicySettingsDTO>
}

/** core 的 `DEFAULT_NODE_MEMORY_PROTECTION` 的镜像；判据盯着这两份数字不许漂。 */
export const DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS: NodeMemoryProtectionSettingsDTO = {
  defaultPolicy: { maxRssGrowthMiB: 8192, maxHeapGrowthMiB: 4096, maxRetainedEvents: 1000, sampleIntervalMs: 250 },
  nodePolicies: {},
}

/** 只用得到的那两片设置面（文档侧 host 的 config 面的子集，取窄不取宽）。 */
export interface ConfigFace {
  /** 读整份 Config；`revision` 是 DSH 给的版本号，写的时候要带回去。 */
  get(): Promise<{ config: unknown, revision?: number }>
  /**
   * 写整份 Config。回包**只保证有版本号**：DSH 那条桥的写应答是特意投影过的
   * （`packages/node-sdk/src/bridge-shell.ts` 的 `config.save` 分支只回 `projectWriteAck(...)`，
   * 因为写 `xaihi-core` 时整份命名空间视图会带着 `nodeState`，实测 200 KiB 的写"落盘成功却回 too-large"）。
   * 所以这一格写完必须**再读一次**确认，不许把"回包里没有值"当成写失败。
   */
  save(config: unknown, expectedRevision?: number): Promise<{ revision?: number }>
}

/** 一次读的结果：形状与上游那份一致（`supported` + `settings | null`），多的那条是原因。 */
export interface NodeMemoryProtectionState {
  supported: boolean
  settings: NodeMemoryProtectionSettingsDTO | null
  /** `supported: false` 时那句读得回的原因（面没装配 / 没声明这一格 / 形状不合）。 */
  reason?: string
  /** 服务端回包里的版本号，"这是第几版"因此在界面上读得回来。 */
  revision?: number
}

const FIELD = 'nodeMemoryProtection'

const POLICY_KEYS: readonly (keyof NodeMemoryProtectionPolicySettingsDTO)[] = [
  'maxRssGrowthMiB',
  'maxHeapGrowthMiB',
  'maxRetainedEvents',
  'sampleIntervalMs',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

let injectedFace: ConfigFace | undefined

/** 装配点：文档侧把 `host.config` 递进来；递 undefined 是撤回（退化路径与测试都用这条路）。 */
export function setNodeMemoryProtectionFace(face: ConfigFace | undefined): void {
  injectedFace = face
}

/** 文档侧 host 的 config 面里，这一格真正用到的两条动词（`createDocumentHost(...).config` 的子集）。 */
export interface DocumentConfigSurface {
  getUi(): Promise<unknown>
  saveUi(config: unknown, expectedRevision?: number): Promise<unknown>
}

/**
 * 把 host 的 `config.getUi()` / `config.saveUi()` 折成这一格要的 `ConfigFace`。
 *
 * 两边的包法不一样，照实拆开，别一一对应地糊过去：
 * - `getUi()` 回 `{ ns, value, revision? }`（`packages/node-sdk/src/bridge-shell.ts` 的
 *   `readNamespace`：只把**问的那一格**发回去，整份 `describe()` 会带上所有插件的 schema 与值）；
 * - `saveUi()` 回投影过的 `{ revision }`（同一条桥的 `config.save` 分支，理由是那侧记过的
 *   "200 KiB 的写落盘成功却回 too-large"）。
 * 认不出这个包法时把 `config` 报成 null，让读那一侧明说"读不到这一格"，
 * 而不是把一份形状不明的东西当 Config 用（那等于伪造）。
 * @param surface - 装配点手里那份 host 的 config 面。
 * @returns 可以直接交给 `setNodeMemoryProtectionFace()` 的面。
 */
export function configFaceFromDocumentConfig(surface: DocumentConfigSurface): ConfigFace {
  return {
    get: async () => {
      const view = await surface.getUi()
      if (!isRecord(view)) return { config: null }
      const revision = typeof view.revision === 'number' ? view.revision : undefined
      return { config: view.value ?? null, ...(revision === undefined ? {} : { revision }) }
    },
    save: async (config, expectedRevision) => {
      const ack = await surface.saveUi(config, expectedRevision)
      const revision = isRecord(ack) && typeof ack.revision === 'number' ? ack.revision : undefined
      return revision === undefined ? {} : { revision }
    },
  }
}

/**
 * 只查形状：字段齐、是整数。**区间不在这里**——区间住在搬来的组件那份
 * `POLICY_FIELDS`（原样保留，一处一份），而 core 那一格是
 * `Schema.number().default(…)`，schemastery 的这条链上没有区间，服务端因此也不挡越界值。
 * 这条缺口记在这儿，不假装这里挡住了。
 */
function checkSettings(value: unknown): { ok: true, settings: NodeMemoryProtectionSettingsDTO } | { ok: false, message: string } {
  if (!isRecord(value)) return { ok: false, message: '这一格不是对象' }
  const head = checkPolicy(value.defaultPolicy, 'defaultPolicy')
  if (head !== undefined) return { ok: false, message: head }
  if (!isRecord(value.nodePolicies)) return { ok: false, message: 'nodePolicies 不是对象' }
  for (const [node, policy] of Object.entries(value.nodePolicies)) {
    const bad = checkPolicy(policy, `nodePolicies.${node}`)
    if (bad !== undefined) return { ok: false, message: bad }
  }
  return { ok: true, settings: value as unknown as NodeMemoryProtectionSettingsDTO }
}

function checkPolicy(value: unknown, where: string): string | undefined {
  if (!isRecord(value)) return `${where} 不是对象`
  for (const key of POLICY_KEYS) {
    const read = value[key]
    if (typeof read !== 'number' || !Number.isInteger(read)) return `${where}.${String(key)} 不是整数（读到 ${String(read)}）`
  }
  return undefined
}

/** 从整份 Config 里取这一格；形状不合一律按"没读到"处理，不猜也不半成品地合并。 */
function pick(value: unknown): { settings?: NodeMemoryProtectionSettingsDTO, reason?: string } {
  if (!isRecord(value)) return { reason: '宿主给回来的不是一份对象形的 Config' }
  const raw = value[FIELD]
  if (raw === undefined) return { reason: `这份 Config 没声明 ${FIELD}（core 那一行没落，或读到了别的命名空间）` }
  const checked = checkSettings(raw)
  return checked.ok ? { settings: checked.settings } : { reason: `${FIELD} 的形状不合：${checked.message}` }
}

/**
 * 读这一格。没有面 / 没有这一格 / 形状不合都回 `supported: false` 并带上原因，
 * 由界面显示成一条读得回的话；不抛——这不是使用者的错。
 */
export async function getNodeMemoryProtection(): Promise<NodeMemoryProtectionState> {
  const face = injectedFace
  if (face === undefined) {
    return { supported: false, settings: null, reason: '设置面还没装配（文档侧的 host.config 没递进来），这一格今天读不到' }
  }
  const whole = await face.get()
  const { settings, reason } = pick(whole.config)
  if (settings === undefined) return { supported: false, settings: null, reason: reason ?? `读不到 ${FIELD}` }
  return { supported: true, settings, ...(whole.revision === undefined ? {} : { revision: whole.revision }) }
}

/**
 * 写这一格：整份读回来、只换自己那一格、带上刚读到的 `revision` 写回去。
 *
 * 冲突和被拒都**抛出**（上游那份也是抛，组件的 catch 把它显示成一句），消息原样留住
 * 服务端那句 `SETTINGS_CONFLICT`，这样"别人先改了第 N 版"读得回来。
 * @param expectedRevision - 显式给定的版本号；不给就用刚读回来那份（默认走乐观锁，不静默覆盖）。
 */
export async function setNodeMemoryProtection(
  next: NodeMemoryProtectionSettingsDTO,
  expectedRevision?: number,
): Promise<NodeMemoryProtectionState> {
  const face = injectedFace
  if (face === undefined) throw new Error('设置面还没装配（文档侧的 host.config 没递进来），写不出去')

  const checked = checkSettings(next)
  if (!checked.ok) throw new Error(`这一格的形状不合：${checked.message}`)

  const whole = await face.get()
  if (!isRecord(whole.config)) {
    throw new Error('写之前读不回整份 Config，拒绝只写自己那一格（否则会抹掉别的字段）')
  }

  let ack: { revision?: number }
  try {
    ack = await face.save({ ...whole.config, [FIELD]: checked.settings }, expectedRevision ?? whole.revision)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reason = error instanceof Error ? (error as Error & { reason?: string }).reason : undefined
    throw Object.assign(new Error(message), { reason: reason ?? (/conflict/i.test(message) ? 'settings_conflict' : 'rejected') })
  }

  // 回包只带版本号（见 `ConfigFace.save` 那条注释），所以"写进去了没有"只能再读一次问。
  const reread = await face.get()
  const after = pick(reread.config)
  if (after.settings === undefined) {
    throw new Error(`写之后读不回这一格：${after.reason ?? '未知'}`)
  }
  const revision = ack.revision ?? reread.revision
  return { supported: true, settings: after.settings, ...(revision === undefined ? {} : { revision }) }
}

export type LocalBackendRestartSource = "http" | "none"

export interface LocalBackendControlRestartResult {
  restarted: boolean
  supported: boolean
  source?: LocalBackendRestartSource
  message?: string
  config?: { baseUrl?: string; token?: string }
}

export interface NodeSourceHotReloadState {
  supported: boolean
  enabled: boolean
}

export async function getNodeSourceHotReload(): Promise<NodeSourceHotReloadState> {
  return { supported: false, enabled: false }
}

export async function setNodeSourceHotReload(_enabled: boolean): Promise<NodeSourceHotReloadState> {
  return { supported: false, enabled: false }
}

export async function restartLocalBackend(): Promise<LocalBackendControlRestartResult> {
  return {
    restarted: false,
    supported: false,
    source: "none",
    message: "Xaihi 宿主环境由 DeepSeek Harness 管理",
  }
}
