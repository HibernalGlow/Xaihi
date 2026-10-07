/**
 * 把"这条 host 面到底通不通"折成一份**纯数据**的读数，给界面与判据一起用。
 *
 * 为什么要单独一格：装载器（`realm-entry.tsx`）里如果直接写这几步，判据就只能靠屏上的字来看，
 * 而"字对不对"这件事没法在不起浏览器的情况下复验。这里只算数、不碰 DOM，
 * 装载器负责把同一份读数画出去，测试负责在**桥的两半都是生产代码**的前提下复算它。
 *
 * 三条读数的分工（决定 4 要的是"退化读得回来"，不是"能跑就行"）：
 * - `capabilities` / `refused`：协商当场给了哪几组、没给的每一组是什么话；
 * - `ui`：`config.getUi()` 真走到设置面没有——拿到的是**对面**那格的 ns 与 revision，
 *   命名空间由握手带来（`settingsNs`），这一格不猜也不允许界面自己拼；
 * - `state`：本地同步写一条标记、`flush()` 推出去，然后**从对面读回同一条**才算 `crossed`；
 *   写侧的失败留在 `syncError`、读侧的失败留在 `readError`，两者不合并——
 *   "没写成"与"写成了但读不回"是两种不同的现场，合成一格就再也分不出该查哪一边。
 *
 * @module xaihi-ui/document/host-probe
 */

import type { DocumentBridge, NodeCapabilityId } from '@hibernalglow/xaihi-sdk/bridge'
import { isDocumentFulfilled, type PersistedState, type XaihiNodeHost } from '../client/document-host.ts'

/** 一次往返的读数。全部是纯数据：判据与界面读的是同一份。 */
export interface HostRoundTrip {
  /** 桥两侧一致才算得出的合同版本；还没握手时是 null（不是空串，那读起来像"版本是空的"）。 */
  version: string | null
  /** 握手被授予的能力组（界面拿它决定哪些入口能点亮）。 */
  capabilities: readonly NodeCapabilityId[]
  /** `config.getUi()` 的落点：拿到就是对面的 ns + revision，拿不到是读得回的原因。 */
  ui: { ns: string, revision: number | null } | { error: string, detail: string }
  /** 节点状态那一条：本地写了、对面读回什么、写与读各自的失败原因。 */
  state: {
    marker: string
    /** 标记真的出现在对面回来的那份 JSON 里。 */
    crossed: boolean
    readBack: string | null
    readError: string | null
    syncError: string | null
  }
  /** 没被授予的每一组与它的原因（屏上原样念，不改写）。 */
  refused: readonly { capability: NodeCapabilityId, reason: string }[]
  /**
   * `refused` 里**由文档自己兑现**的那几组（今天只有 downloads）。
   * 单列出来是因为协商说"对面不给"与这一格能不能用是两件事：
   * 2026-10-07 在真顶层窗里量到 `hasCapability('downloads')=false` 而 `downloads.text()` 调用成功，
   * 混在 refused 里念就等于让使用者去追一条不存在的能力缺口。
   */
  documentFulfilled: readonly NodeCapabilityId[]
  /**
   * 文档自己有没有接到工作台那一格。
   *
   * 为什么板子上要有这一行：`workspace` 按 `host-bridge.ts:163` 的 `DOCUMENT_OWNED_GROUPS` **归文档自己**，
   * 外壳永远不会 grant 它，所以"这一格没接线"与"宿主缺勤"是两件事。前者只能由装配侧回答，
   * 而装配侧不回答时界面就会把"没人兑现"念成"没有组件"（2026-10-07 在顶层窗里量到的那一处）。
   */
  workspace: { wired: boolean, count: number | null, reason: string | null }
}

/** 一次往返的入参：`host` 是给界面的形状，`bridge` 是它背后那条会话，`state` 是同一份持久面。 */
export interface HostRoundTripDeps {
  host: XaihiNodeHost
  bridge: DocumentBridge
  state: PersistedState
  /** 要写哪个节点的状态。 */
  node: string
  /** 这一轮独一无二的标记，判据与现场都靠它认"回来的是对面那一份"。 */
  marker: string
}

/** 把桥那侧抛出来的东西折成两个字段，别在界面上留一条"红了但没说为什么"。 */
function failureOf (error: unknown): { error: string, detail: string } {
  const thrown = error as { reason?: unknown, detail?: unknown }
  return {
    error: typeof thrown?.reason === 'string' ? thrown.reason : 'unknown',
    detail: typeof thrown?.detail === 'string' ? thrown.detail : '',
  }
}

/**
 * 跑一次往返。任何一步失败都不抛出去——它返回的是**读得回的失败**，
 * 因为调用这一格的地方是界面，界面不该因为宿主给不了某组能力就整片空白。
 * @param deps - 会话、持久状态、节点 id 与本轮标记。
 * @returns 同一份读数，纯数据。
 */
export async function runHostRoundTrip (deps: HostRoundTripDeps): Promise<HostRoundTrip> {
  const { host, bridge, state, node, marker } = deps
  const ready = bridge.ready()
  const capabilities = ready === null ? [] : ready.granted
  const refused = ready === null
    ? [{ capability: 'contract' as NodeCapabilityId, reason: '桥还没握手，没有任何一组能力可报' }]
    : ready.refused.map((capability) => ({
        capability,
        reason: ready.degraded.find((row) => row.capability === capability)?.reason ?? '外壳没有提供这一组',
      }))

  let ui: HostRoundTrip['ui']
  try {
    const view = await host.config.getUi() as { ns?: unknown, revision?: unknown }
    ui = typeof view?.ns === 'string'
      ? { ns: view.ns, revision: typeof view.revision === 'number' ? view.revision : null }
      : { error: 'bad-shape', detail: '对面回了东西但没有 ns 字段（这一格不猜值）' }
  } catch (error) {
    ui = failureOf(error)
  }

  state.patchData({ marks: [marker] })
  await state.flush()
  let readBack: string | null = null
  let readError: string | null = null
  try {
    const value = await bridge.call('state.getData', node) as { json?: unknown }
    readBack = typeof value?.json === 'string' ? value.json : null
    if (readBack === null) readError = '对面回了一份没有 json 的读数'
  } catch (error) {
    readError = `${failureOf(error).error}${failureOf(error).detail === '' ? '' : ` · ${failureOf(error).detail}`}`
  }

  // 这一格不问对面：按装配有没有接线判。
  let workspace: HostRoundTrip['workspace']
  try {
    workspace = { wired: true, count: host.workspace.listComponents().length, reason: null }
  } catch (error) {
    const failure = failureOf(error)
    workspace = { wired: false, count: null, reason: `${failure.error}${failure.detail === '' ? '' : ` · ${failure.detail}`}` }
  }

  return {
    // 从不带副作用的 getter 上读：`host.contract.version` 在未握手时会抛，而这一格的全部意义
    // 就是"任何一步失败都返回读得回的失败"。握手结果此刻已经在手上。
    version: ready?.contractVersion ?? null,
    capabilities,
    ui,
    state: {
      marker,
      crossed: readBack !== null && readBack.includes(marker),
      readBack,
      readError,
      syncError: state.syncError(),
    },
    refused,
    documentFulfilled: refused.filter((row) => isDocumentFulfilled(row.capability)).map((row) => row.capability),
    workspace,
  }
}
