/**
 * 第一方节点界面的 present-realm 挂载。
 *
 * 为什么不走 MF2 那条路：搬来的 `src/nodes/<id>/Component.tsx` 一边 import
 * `@/components/ui/*`、`@/nodes/shared/*`，一边 value-import 自己节点的 core
 * （`@xiranite/node-<id>/core` 由 `build-aliases.mjs:56-68` 指到 `plugins/<id>/src/core.ts`）。
 * 这些边在插件包里没有对应物，而 ADR-0002 又不许装进 profile 的包引用仓内包 ⇒
 * "每个插件各自重建一份自己的组件"不是一条走得通的通路。注册表此前在本包里没有消费者
 * （2026-10-07 实测 `rg 'PACKAGE_MODULES|packageModuleLoaders|NODE_MANIFESTS' src/client` 零命中），
 * 于是 12 份界面编译得过、登记得上，一块都不上屏。MF2 那条装载路保持不变，只服务第三方贡献。
 *
 * 异步边界由这棵树自己扛：DSH 的槽渲染没有 Suspense，也没有按条目懒加载
 * （packages/client/web-react/README.md:19，同 `workspace.tsx` 文件头），所以"还在装载"、
 * "这一份坏了"、"换了节点但那发还没回来"都必须变成读得回来的状态。换代用计数器不用旗子：
 * 旗子只能说"装载过没有"，计数器才能回答"这一次结果还该不该上屏"。
 *
 * `run` 只接宿主真给了的形状。本仓注册过的 `ctx.commands` 入口实测只有两条：
 * `/sleept`（`plugins/sleept/src/index.ts:221-238`，读 `parts[0]`=动作、`parts[1]`=minutes）与
 * `/findz`（`plugins/findz/src/index.ts:312-326`，语法在 `plugins/findz/src/command.ts:86-174`）。
 * 一条命令行只回一次终态文本，带不动 `NodeRunResult.data`，也没有 progress 事件流；
 * 能送出去的照送，送不出去的当场说出缺哪条缝，不静默 no-op，也不报假成功。
 *
 * @module xaihi-ui/node-mount
 */

import * as React from 'react'
import type { PanelContribution, PanelHost } from '@hibernalglow/xaihi-sdk'
import type { AppNodeEntry, PackageModuleDef } from '../components/modules/packageModules.generated.ts'
import { PACKAGE_MODULES, packageModuleLoaders } from '../components/modules/packageModules.generated.ts'
import type { PanelEntry, PanelSource } from './workspace.tsx'
import type { Translate } from './locales.ts'

/** 这些模块就在本包的产物里（`src/nodes/<id>/`），不是某个装进 profile 的插件包。 */
const IN_REALM_PACKAGE = '@hibernalglow/xaihi-ui'

/** in-realm 界面没有 remote 地址。空串是"没有地址"，不是编一个看起来像的 slug。 */
const NO_ADDRESS = ''

/** 注册表里的动态装载函数在本仓的键形状（`satisfies Partial<Record<string, …>>` 之后按字符串取不到）。 */
type EntryLoaders = Record<string, (() => Promise<{ default: AppNodeEntry }>) | undefined>

const loaders = packageModuleLoaders as EntryLoaders

/** 节点自己的双语标题；清单没写就退回注册表的 `name`，不编第三种说法。 */
const titleOf = (def: PackageModuleDef): { zh: string; en: string } => {
  const title = (def.manifest as { title?: { zh?: unknown; en?: unknown } } | undefined)?.title
  return {
    zh: typeof title?.zh === 'string' && title.zh !== '' ? title.zh : def.name,
    en: typeof title?.en === 'string' && title.en !== '' ? title.en : def.name,
  }
}

/**
 * 注册表 → 导航条目。
 * @returns 每个已登记节点一条面板贡献；`remote`/`export` 一律空串（这条边没有远端地址）。
 */
export function inRealmPanelEntries(): PanelEntry[] {
  return PACKAGE_MODULES.map((def) => ({
    source: 'in-realm' satisfies PanelSource,
    package: IN_REALM_PACKAGE,
    contribution: {
      id: def.id,
      title: titleOf(def),
      area: 'workspace' as const,
      remote: NO_ADDRESS,
      export: NO_ADDRESS,
    },
  }))
}

/** 两条来源并起来的结果：导航用的条目，加上必须被看见的 id 撞车。 */
export interface MergedPanels {
  entries: PanelEntry[]
  /** 撞车的面板 id；两条来源都不进导航。 */
  collisions: string[]
}

/**
 * 合并清单来的远程面板与注册表来的 in-realm 面板。
 *
 * 撞同一个 id 时**两条都不进导航**，并把撞的那个 id 交回给壳显示。这不是排序问题：
 * 一边是插件清单、一边是本包注册表，谁盖住谁都会让"屏幕上这格到底是哪个节点"读不回来，
 * 而 last-write-wins 正是一次没人报错的换脸。
 * @param remote - `flatten(document)` 出来的远程条目（顺序与排序规则归它）。
 * @returns 可以安全导航的条目与撞车的 id。
 */
export function mergePanelEntries(remote: PanelEntry[]): MergedPanels {
  const inRealm = inRealmPanelEntries()
  const remoteIds = new Set(remote.map((entry) => entry.contribution.id))
  const inRealmIds = new Set(inRealm.map((entry) => entry.contribution.id))
  const collisions = [...remoteIds].filter((id) => inRealmIds.has(id)).sort()
  const entries = [
    ...remote.filter((entry) => !inRealmIds.has(entry.contribution.id)),
    ...inRealm.filter((entry) => !remoteIds.has(entry.contribution.id)),
  ].sort((left, right) => (left.contribution.order ?? 0) - (right.contribution.order ?? 0))
  return { entries, collisions }
}

/**
 * 撞车那一行的文案。
 * 口径沿用本包既有的那条：标签进 locale 座位，原因本身是技术串（同 `workspace.tsx` 里的 `state.reason`）。
 * @param id - 撞车的面板 id。
 * @returns 说清"两条都不显示"的一句话。
 */
export const collisionNotice = (id: string): string =>
  `面板 id ${id} 同时由插件清单与 ${IN_REALM_PACKAGE} 的 in-realm 注册表贡献 ⇒ 两条都不显示，先改掉其中一侧的名字`

// --------------------------------------------------------------------------------------
// 装载事实的读回
// --------------------------------------------------------------------------------------

/** 当前那一格的装载事实（壳与实机都读这一个槽）。 */
export interface MountRecord {
  id: string
  status: 'loading' | 'ready' | 'failed'
  generation: number
  reason?: string
}

/**
 * 把装载事实挂进观测面。
 * @param record - 这一格现在是什么状态。
 */
function recordMount(record: MountRecord): void {
  // 就地改 `__XAIHI__`：换掉整个对象会让装载器那张表的写入失去活性（`loader/probe.ts:55-63` 记着这条）。
  const book = (globalThis as { __XAIHI__?: Record<string, unknown> }).__XAIHI__ ??= {}
  book.nodeMount = record
}

/** 读回当前那一格的装载事实；没挂过就是 `undefined`。 */
export function nodeMountRecord(): MountRecord | undefined {
  const book = (globalThis as { __XAIHI__?: Record<string, unknown> }).__XAIHI__
  return book?.nodeMount as MountRecord | undefined
}

// --------------------------------------------------------------------------------------
// 命令面：run 唯一接得住的那条缝
// --------------------------------------------------------------------------------------

/** 命令行上一个位置参数的形状。 */
interface CommandSlot {
  /** 输入里的字段 id，与 `package.json#xaihi.node` 的 `inputBindings` 同名。 */
  field: string
  /** 吃命令行剩下的全部词（findz 的库根目录与文本过滤就是这么读的）。 */
  toEnd?: boolean | undefined
  /** 尾部可选词：值缺席就不发这个词。 */
  optional?: boolean | undefined
  /** 布尔开关映射成一个词（`/findz analyze … deep`）。 */
  flag?: string | undefined
}

/** 一条命令能送出去的动作形状；表里没有的动作一律拒绝，不猜语法。 */
interface CommandSeam {
  /** `ctx.commands.register({ name })` 里的那个名字。 */
  name: string
  /** 出处：命令处理函数按位置读的那几个词。 */
  slots: Record<string, CommandSlot[]>
}

/**
 * 本仓真注册了的宿主命令入口（实测 `rg 'commands.register' plugins 下各包的 src/index.ts 与 packages/core/src`）。
 * `tests/node-mount.spec.tsx` 钉住这张表与仓内注册集合相等：加了命令没接这里，判据当场红。
 */
export const COMMAND_SEAMS: Record<string, CommandSeam> = {
  // `plugins/sleept/src/index.ts:225-228`：只读 `parts[0]` 与 `parts[1]`（block 的分钟数）。
  sleept: {
    name: 'sleept',
    slots: {
      status: [],
      unblock: [],
      block: [{ field: 'minutes' }],
      sleep: [],
      displayOff: [],
      screensaver: [],
    },
  },
  // `plugins/findz/src/command.ts:99-174`：每个动作的位置参数表（长名与短名等价，这里用动作 id）。
  findz: {
    name: 'findz',
    slots: {
      api_info: [],
      open_library: [{ field: 'libraryId' }, { field: 'libraryRoot', toEnd: true }],
      close_library: [{ field: 'libraryId' }],
      scan: [{ field: 'libraryId' }],
      query_archives: [{ field: 'libraryId' }, { field: 'text', toEnd: true, optional: true }],
      export_rows: [{ field: 'libraryId' }, { field: 'text', toEnd: true, optional: true }],
      query_members: [{ field: 'libraryId' }, { field: 'archiveId' }, { field: 'text', toEnd: true, optional: true }],
      treemap: [{ field: 'libraryId' }, { field: 'areaBy', optional: true }],
      analyze: [{ field: 'libraryId' }, { field: 'scopeKind', optional: true }, { field: 'deepRetry', flag: 'deep', optional: true }],
      task: [{ field: 'libraryId' }, { field: 'taskId' }],
      pause: [{ field: 'libraryId' }, { field: 'taskId' }],
      resume: [{ field: 'libraryId' }, { field: 'taskId' }],
      cancel: [{ field: 'libraryId' }, { field: 'taskId' }],
    },
  },
}

/** 上游组件调用 `run` 时拿到的结果形状（`NodeRunResultDTO` 的可兑现子集）。 */
export interface NodeRunOutcome {
  success: boolean
  message: string
}

/** 节点界面发出的事件形状（`nodeRunEventSchema`：progress | log）。 */
export interface NodeRunEventLike {
  type: 'progress' | 'log'
  message: string
  progress?: number
}

/** 命令通道只回一次终态，永远没有事件流——这句必须让节点界面自己说给使用者听。 */
const NO_EVENT_STREAM = (nodeId: string): string =>
  `命令通道只回一次终态：没有 progress 事件流（那条缝是 /nodes/${nodeId}/operations 的运行账本 SSE，本壳未接）`

const absent = (value: unknown): boolean => value === undefined || value === null || value === ''

/**
 * 把一次 `run(nodeId, input)` 拼成命令行。
 * @param entryId - 这一格挂的是哪个节点。
 * @param input - 界面组好的输入。
 * @returns 可以送出去的命令行，或者一句说清缺哪条缝的拒绝理由。
 */
export function planCommandLine(entryId: string, input: unknown): { ok: true; line: string } | { ok: false; reason: string } {
  const seam = COMMAND_SEAMS[entryId]
  if (seam === undefined) {
    const wired = Object.keys(COMMAND_SEAMS).map((id) => `/${id}`).join('、')
    return {
      ok: false,
      reason: `refused ${entryId}: 这条调用要的是节点运行（runNodeOperation → /nodes/${entryId}/operations，见 src/lib/nodeOperationTransport.ts），本壳只有 DSH 的命令通道；注册过的 ctx.commands 入口实测只有 ${wired || '无'}（出处见 src/client/node-mount.tsx 文件头）。`,
    }
  }
  const record = (input ?? {}) as Record<string, unknown>
  const action = typeof record.action === 'string' ? record.action : ''
  if (action === '') {
    return { ok: false, reason: `refused /${seam.name}: 输入里没有动作词（input.action），命令面无从分派——不猜要跑哪个动作。` }
  }
  const slots = seam.slots[action]
  if (slots === undefined) {
    return {
      ok: false,
      reason: `refused /${seam.name} ${action}: 这条命令行没登记该动作的参数形状（表在 src/client/node-mount.tsx，出处是插件自己的 handler）。`,
    }
  }

  const carryable = new Set<string>(['action', ...slots.map((slot) => slot.field)])
  const dropped = Object.keys(record).filter((key) => !carryable.has(key) && !absent(record[key]))
  if (dropped.length > 0) {
    return {
      ok: false,
      reason: `refused /${seam.name} ${action}: 命令行带不了这些字段 ${dropped.join('、')}；能带它们的那条缝是 runNodeOperation → /nodes/${entryId}/operations（src/lib/nodeOperationTransport.ts），本壳没接。把它们交给 agent 的工具路径或把缝接上，别按下去什么都不说。`,
    }
  }

  const tokens: string[] = [action]
  for (const slot of slots) {
    const value = record[slot.field]
    if (slot.flag !== undefined) {
      if (value === true) tokens.push(slot.flag)
      else if (value === false || absent(value)) continue
      else return { ok: false, reason: `refused /${seam.name} ${action}: ${slot.field} 得是开关，实际是 ${typeof value}。` }
      continue
    }
    if (absent(value)) {
      if (slot.optional === true) continue
      return { ok: false, reason: `refused /${seam.name} ${action}: 位置参数 ${slot.field} 是空的，命令面不接受空值。` }
    }
    const token = typeof value === 'string' ? value.trim() : String(value)
    // 非 `toEnd` 的位置参数必须是一个词：带空格的值会被解析成下一个参数，那是把一次调用悄悄拆成两条。
    if (slot.toEnd !== true && /\s/.test(token)) {
      return { ok: false, reason: `refused /${seam.name} ${action}: ${slot.field} 得压成一个词（实际带空白），命令面没有引号语法。` }
    }
    tokens.push(token)
  }
  return { ok: true, line: `/${seam.name} ${tokens.join(' ')}`.trim() }
}

/** 面板宿主 + 这一格的状态，够拼出上游组件真正会读的那几片。 */
interface AdapterParts {
  entryId: string
  panel: PanelHost
  getData: () => Record<string, unknown>
  patch: (patch: Record<string, unknown>) => void
}

/**
 * 上游组件的 `host`。只给这块壳真兑现得了的东西：
 * 状态（这一格自己的内存卡）、`run`（命令通道，见 `planCommandLine`）、剪贴板与下载（浏览器就有）。
 * 余下的（`config`、`localFiles`、`workspace`、`runner.cancelCurrent`）一律**不给**——
 * 上游读它们的那几处都带 `?.`，缺位会落回它们自己的可见退化；在这里编一个假实现在界面上读不回来。
 * @param parts - 面板宿主与这一格的卡状态。
 * @returns 交给 `entry.Component` 的 `host`。
 */
function makeNodeHostApi(parts: AdapterParts): Record<string, unknown> {
  const run = async <TInput,>(
    nodeId: string,
    input: TInput,
    onEvent?: (event: NodeRunEventLike) => void,
  ): Promise<NodeRunOutcome> => {
    if (nodeId !== parts.entryId) {
      throw new Error(`refused ${nodeId}: 这一格挂的是 ${parts.entryId}；跨节点派发归宿主运行账本（/nodes/<id>/operations），命令通道不替界面选节点。`)
    }
    const plan = planCommandLine(parts.entryId, input as unknown)
    if (plan.ok === false) throw new Error(plan.reason)
    const outcome = await parts.panel.runCommand(plan.line)
    // 节点自己说了不（危险闸门在命令侧）：那不是本壳接不了，照原话回成一次失败的运行。
    if (outcome.ok === false) return { success: false, message: outcome.reason }
    onEvent?.({ type: 'log', message: NO_EVENT_STREAM(parts.entryId) })
    // 命令通道回的是终态文本，不是结构化的 `NodeRunResult.data`：
    // message 原样交出去，data 缺席（宁缺毋假），界面自己的结果区因此显示"没有结果"而不是编一份。
    return { success: true, message: outcome.text }
  }

  const readText = async (): Promise<string> => {
    if (typeof navigator.clipboard?.readText !== 'function') throw new Error('当前运行环境不给剪贴板读取（navigator.clipboard.readText 缺席）。')
    return await navigator.clipboard.readText()
  }
  const writeText = async (text: string): Promise<void> => {
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('当前运行环境不给剪贴板写入（navigator.clipboard.writeText 缺席）。')
    await navigator.clipboard.writeText(text)
  }

  const state = { getData: () => parts.getData(), patchData: (patch: Record<string, unknown>) => parts.patch(patch) }

  return {
    state,
    runner: { run },
    // 未迁移的界面读的是这一条别名（`src/nodes/sleept/Component.tsx:111`、`src/nodes/linedup/Component.tsx:129`）。
    actions: { run },
    clipboard: { readText, writeText },
    downloads: {
      text: (filename: string, content: string): void => {
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
      },
    },
    // 已废弃的那批别名，上游卡片还在直接调（`src/nodes/shared/useNodeCardController.ts:59,99`）。
    getData: () => parts.getData(),
    patchData: (_compId: string, patch: Record<string, unknown>) => parts.patch(patch),
  }
}

// --------------------------------------------------------------------------------------
// 挂载
// --------------------------------------------------------------------------------------

/** 装载那一格的状态；`entry` 只在 ready 时存在，`generation` 是这一发结果属于哪一次选择的代号。 */
type MountState =
  | { status: 'loading'; generation: number }
  | { status: 'ready'; generation: number; entry: AppNodeEntry }
  | { status: 'failed'; generation: number; reason: string }

/** 装载入口的注入点；缺省是真注册表，测试给假的那份。 */
export type NodeEntryLoader = (id: string) => Promise<{ default: AppNodeEntry }>

const defaultLoader: NodeEntryLoader = (id) => {
  const load = loaders[id]
  if (load === undefined) {
    return Promise.reject(new Error(`packageModuleLoaders 里没有 "${id}"：注册表由 scripts/gen-node-registry.mjs 生成，界面侧没登记就没有可挂的组件`))
  }
  return load()
}

export interface NodeModuleSurfaceProps {
  id: string
  contribution: PanelContribution
  locale: 'zh' | 'en'
  host: PanelHost
  t: Translate
  /** 注入的装载入口，缺省走 `packageModuleLoaders`。 */
  loader?: NodeEntryLoader | undefined
}

/** 装载失败或渲染抛错那一格：原因 + 重新加载，和 `workspace.tsx` 的远程失败态同一形状。 */
function MountFailure(props: { title: string; reason: string; t: Translate; onRetry: () => void }): React.ReactElement {
  return (
    <div className="xaihi-error flex min-h-10 flex-col items-start gap-1 p-3" role="alert">
      <strong className="font-mono text-[10px] uppercase tracking-widest text-destructive">{props.t('panel.failed')}</strong>
      <span className="text-xs">{props.title}：{props.reason}</span>
      <button type="button" onClick={props.onRetry}>{props.t('panel.reload')}</button>
    </div>
  )
}

interface BoundaryState {
  error: Error | null
  key: number
}

/**
 * 一份坏界面不许把壳带走：渲染期抛出在这里落成可见失败，并把重新装载的出口留着。
 *
 * 不用上游那份 `NodeRenderBoundary`（`src/components/modules/NodeRenderBoundary.tsx`）：它自带
 * `@/lib/logger`（consola + `@xiranite/logging`，见 `src/lib/logger.ts:1-8`）与 `lucide-react`，
 * 把这三条边拉进浏览器半边不是这一刀该动的东西。形状与语义照它：捕获、显示原因、bump key 重挂。
 */
class NodeMountBoundary extends React.Component<{ children: React.ReactNode; fallback: (reason: string, retry: () => void) => React.ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null, key: 0 }

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error }
  }

  private readonly retry = (): void => {
    this.setState((previous) => ({ error: null, key: previous.key + 1 }))
  }

  override render(): React.ReactNode {
    const { error, key } = this.state
    if (error !== null) return this.props.fallback(error.message === '' ? String(error) : error.message, this.retry)
    return <React.Fragment key={key}>{this.props.children}</React.Fragment>
  }
}

/**
 * 把注册表里的那份组件挂到当前 realm。
 *
 * 入口组件一律**当元素挂**（`React.createElement(Component, …)`）而不是当函数调：
 * 当函数调会把它的 hooks 记到本组件身上，于是 ready→loading 那次重渲染少一整层 hook，
 * 宿主实测的症状是 `slot entry crashed in 'main': Minified React error #300`
 * （`docs/adr/0009-plugin-ui-react-ownership.md:144`、回归测 `tests/surface.spec.tsx:74-92`）。
 * @param props - 面板身份、语言、宿主面与文案座位。
 * @returns 这一格现在该显示的东西：装载中、可见失败、或节点界面本身。
 */
export function NodeModuleSurface(props: NodeModuleSurfaceProps): React.ReactElement {
  const { id, contribution, locale, host, t } = props
  const loader = props.loader ?? defaultLoader

  const [attempt, setAttempt] = React.useState(0)
  const [mount, setMount] = React.useState<MountState>({ status: 'loading', generation: 0 })
  // 这一格卡状态的真相在 ref 里（组件会在同一次调用里先 patch 再 getData），state 只负责让它重渲染。
  const cardRef = React.useRef<Record<string, unknown>>({})
  const [, bumpCard] = React.useState(0)

  // 换 id、重试、卸载都推进一代；回来的那一发只有代号还等于当前这一代时才允许上屏。
  const generation = React.useRef(0)

  React.useEffect(() => {
    generation.current += 1
    const current = generation.current
    cardRef.current = {}
    bumpCard((value) => value + 1)
    setMount({ status: 'loading', generation: current })
    recordMount({ id, status: 'loading', generation: current })
    void (async () => {
      let settled: { default: AppNodeEntry }
      try {
        settled = await loader(id)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (generation.current !== current) return
        setMount({ status: 'failed', generation: current, reason })
        recordMount({ id, status: 'failed', generation: current, reason })
        return
      }
      // 这一发属于哪一代已经过时 ⇒ 它画的是使用者早就换掉的那一格，不许上屏。
      if (generation.current !== current) return
      const entry = settled.default
      if (typeof entry?.Component !== 'function') {
        const reason = `${id} 的 entry 没带 Component（AppNodeEntry.Component 缺席），这一格没有可挂的东西`
        setMount({ status: 'failed', generation: current, reason })
        recordMount({ id, status: 'failed', generation: current, reason })
        return
      }
      setMount({ status: 'ready', generation: current, entry })
      recordMount({ id, status: 'ready', generation: current })
    })()
    // 卸载或换节点之后那一发在飞的落点必须失效：旗子做不到这件事，因为"装载过一次"与"这一次还该上屏"不是一回事。
    return () => {
      generation.current += 1
    }
  }, [id, attempt, loader])

  const patch = React.useCallback((next: Record<string, unknown>) => {
    cardRef.current = { ...cardRef.current, ...next }
    bumpCard((value) => value + 1)
  }, [])

  const adapter = React.useMemo(
    () => makeNodeHostApi({
      entryId: id,
      panel: host,
      getData: () => cardRef.current,
      patch,
    }),
    [id, host, patch],
  )

  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en
  const retry = (): void => setAttempt((value) => value + 1)

  const body = (() => {
    if (mount.status === 'loading') {
      return <div className="p-3 font-mono text-[10px] tracking-widest text-muted-foreground">{t('panel.loading')}</div>
    }
    if (mount.status === 'failed') {
      return <MountFailure title={title} reason={mount.reason} t={t} onRetry={retry} />
    }
    const Component = mount.entry.Component as React.ComponentType<{ compId: string; host: Record<string, unknown> }>
    return (
      <NodeMountBoundary
        key={`${id}:${String(mount.generation)}`}
        fallback={(reason, reset) => <MountFailure title={title} reason={reason} t={t} onRetry={reset} />}
      >
        <Component compId={contribution.id} host={adapter} />
      </NodeMountBoundary>
    )
  })()

  return (
    <div
      className="xaihi-node-mount flex min-h-0 flex-1 flex-col overflow-auto"
      data-panel-source="in-realm"
      data-node-id={id}
      data-node-status={mount.status}
      data-node-generation={mount.generation}
    >
      {body}
    </div>
  )
}
