/**
 * 运行进度回显（**文档侧**）：把 xaihi-core 的运行账本变成"某个节点此刻在做什么"。
 *
 * 为什么必须有这一条，而不是让 `host.runner.run(nodeId, input, onEvent)` 把事件带回来：
 * 桥是**请求/应答**的（`bridge-shell.ts` 的 `createShellBridge` 只认 hello / request，
 * 没有外壳→文档的推送帧），而 HTTP 载体（`createHttpDocumentBridge`）本身就是一次
 * POST 换一条 JSON —— 两条载体上"同一次调用中途推东西"都无从表达。
 * 所以进度只能走一条**旁路**：`document-host.ts` 的 `runner.run` 从前把那第三参接住就丢掉
 * （注释写着"今天不静默丢事件，因为这条调用整组被拒"；ADR-0020 之后整组不再被拒，那句话就悬空了，
 * 症状是**面板的进度条永远停在 0**）。现在它经本模块的 `followNodeRun` 跟着同一份账本走，
 * 把每次读数变化翻成 `onEvent` 交回面板。
 *
 * 这条通路不是新造第二套存储：账本与它的 SSE 路由是 `ops.ts` / `core/src/index.ts:497-507`
 * 早就建好的那份（`@hibernalglow/xaihi-sdk/operations` 的词表），`client/run-feed.tsx` 已经在
 * **外壳那边**读过同一条流。这里只是把同一个读取方搬到**文档**里来 —— 文档与宿主同源
 * （`realm.ts:84` 的 `window.location.origin`），两条载体下这条 URL 都成立，界面因此不分叉。
 *
 * 退化照实说：没有 `EventSource`、连不上、或对端没挂这条路由时，`transport()` 报
 * `offline`，`latest()` 保留最后一次已知读数；**不编一个百分比**（ADR-0011 决定 4）。
 *
 * @module xaihi-ui/node-run-progress
 */

import {
  OPERATIONS_SCHEMA,
  OPERATIONS_SNAPSHOT_PATH,
  OPERATIONS_STREAM_PATH,
  type ActiveRun,
  type OperationsSnapshot,
} from '@hibernalglow/xaihi-sdk/operations'
import type { NodeRunEvent } from '@xiranite/contract'

/** 某个节点此刻那次运行的读数。没有读数时 `latest()` 返回 undefined（不是一份 0% 的空读数）。 */
export interface NodeRunProgress {
  nodeId: string
  runId: string
  actionId: string
  /** 0..100；账本只给了 `done` 而没给 `total` 时为 null（"不知道还剩多少" ≠ "0%"）。 */
  percent: number | null
  /** 最近一条可读文案（`preview.message` / `failed` 的原因）；没有就是空串。 */
  message: string
  phase: 'running' | 'finished' | 'failed'
}

/** 这条回显通路现在是什么状态。界面要如实说出来，不把"没连上"画成"没有进度"。 */
export type RunProgressTransport = 'connecting' | 'live' | 'polling' | 'offline'

export interface RunProgressFeed {
  transport: () => RunProgressTransport
  /** 读某个节点最近一次运行的读数。 */
  latest: (nodeId: string) => NodeRunProgress | undefined
  /** 订阅任何变化；返回取消订阅。 */
  subscribe: (listener: () => void) => () => void
  close: () => void
}

/** 一条事件最小面（SSE 的 `event` / 载荷；真浏览器与测试替身都满足）。 */
interface EventSourceLike {
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
  close: () => void
  onerror?: (() => void) | null
}

export interface RunProgressFeedOptions {
  /** 注入的 `EventSource` 构造器；缺省取 `globalThis.EventSource`（没有就整条走 `offline`）。 */
  createSource?: (url: string) => EventSourceLike
  /** 注入的 fetch（轮询兜底用）。 */
  fetchImpl?: typeof fetch
  /** 轮询兜底的周期。 */
  pollMs?: number
  /** 定时器工厂，测试用。 */
  setIntervalImpl?: (callback: () => void, ms: number) => ReturnType<typeof setInterval>
  clearIntervalImpl?: (handle: ReturnType<typeof setInterval>) => void
}

/** 事件载荷的形状闸：非对象、或名字对不上的（例如未来版本改了字段）整条拒收，不半读。 */
function asEvent(raw: unknown): { seq?: number; runId?: string; nodeId?: string; actionId?: string; kind?: string; progress?: { done?: number; total?: number }; payload?: unknown; message?: unknown } | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.runId !== 'string' || typeof record.nodeId !== 'string') return null
  return record as never
}

/**
 * 建一条文档侧的运行进度回显。
 * @param options - 注入点（测试给替身；生产全走缺省）。
 * @returns 一份可读可订阅的回显面。
 */
export function openRunProgressFeed(options: RunProgressFeedOptions = {}): RunProgressFeed {
  const pollMs = options.pollMs ?? 3000
  const latestByNode = new Map<string, NodeRunProgress>()
  const listeners = new Set<() => void>()
  let transport: RunProgressTransport = 'connecting'
  let source: EventSourceLike | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let closed = false

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // 一个坏订阅者不许把回显本身带走：这条通路是派生状态，不是真源。
      }
    }
  }

  const setTransport = (next: RunProgressTransport): void => {
    if (transport === next) return
    transport = next
    notify()
  }

  /** 记一条读数；返回是否真的变了（没变就不惊动订阅者）。 */
  const apply = (next: NodeRunProgress): boolean => {
    const previous = latestByNode.get(next.nodeId)
    if (
      previous !== undefined &&
      previous.percent === next.percent &&
      previous.message === next.message &&
      previous.phase === next.phase &&
      previous.runId === next.runId
    ) return false
    latestByNode.set(next.nodeId, next)
    return true
  }

  /**
   * 进度事件 → 百分比。
   *
   * `total` 缺席时**回 null**，不回落到 `done`：`done` 是绝对量（例如"已扫 300 个文件"），
   * 把它当百分数会画出一根看起来精确、其实没意义的进度条（`OperationProgress.total` 的
   * 注释写着同一条理由："total 未知时省略而不是写 0"）。
   */
  const percentOf = (progress: { done?: number; total?: number } | undefined): number | null => {
    if (progress === undefined) return null
    const done = typeof progress.done === 'number' ? progress.done : null
    const total = typeof progress.total === 'number' ? progress.total : null
    if (done === null || total === null || total <= 0) return null
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
  }

  const handleEvent = (kind: string, raw: unknown): void => {
    const event = asEvent(raw)
    if (event === null) return
    const nodeId = String(event.nodeId)
    const previous = latestByNode.get(nodeId)
    const base = {
      nodeId,
      runId: String(event.runId ?? previous?.runId ?? ''),
      actionId: String(event.actionId ?? previous?.actionId ?? ''),
    }
    if (kind === 'started') {
      apply({ ...base, percent: 0, message: '', phase: 'running' })
    } else if (kind === 'progress') {
      apply({ ...base, percent: percentOf(event.progress), message: previous?.message ?? '', phase: 'running' })
    } else if (kind === 'preview') {
      const message = typeof (event.payload as { message?: unknown } | null)?.message === 'string'
        ? String((event.payload as { message: string }).message)
        : previous?.message ?? ''
      apply({ ...base, percent: previous?.percent ?? null, message, phase: 'running' })
    } else if (kind === 'finished') {
      apply({ ...base, percent: 100, message: previous?.message ?? '', phase: 'finished' })
    } else if (kind === 'failed') {
      apply({ ...base, percent: previous?.percent ?? null, message: typeof event.message === 'string' ? event.message : '', phase: 'failed' })
    } else {
      return
    }
    notify()
  }

  /** 轮询兜底：快照只有运行概要（没有百分比），所以它只能回答"还在跑 / 跑完了"。 */
  const poll = async (): Promise<void> => {
    const doFetch = options.fetchImpl ?? globalThis.fetch
    if (typeof doFetch !== 'function') {
      setTransport('offline')
      return
    }
    try {
      const response = await doFetch(OPERATIONS_SNAPSHOT_PATH, { cache: 'no-store' })
      if (!response.ok) throw new Error(`snapshot responded ${String(response.status)}`)
      const body = (await response.json()) as OperationsSnapshot
      if (body.schema !== OPERATIONS_SCHEMA) throw new Error(`unexpected operations schema ${String(body.schema)}`)
      let changed = false
      for (const run of body.runs as ActiveRun[]) {
        changed = apply({
          nodeId: run.nodeId,
          runId: run.runId,
          actionId: run.actionId,
          percent: run.outcome === 'running' ? latestByNode.get(run.nodeId)?.percent ?? null : 100,
          message: typeof run.message === 'string' ? run.message : latestByNode.get(run.nodeId)?.message ?? '',
          phase: run.outcome === 'running' ? 'running' : run.outcome,
        }) || changed
      }
      setTransport('polling')
      if (changed) notify()
    } catch {
      setTransport('offline')
    }
  }

  const startPolling = (): void => {
    if (closed || timer !== undefined) return
    void poll()
    const schedule = options.setIntervalImpl ?? ((callback: () => void, ms: number) => setInterval(callback, ms))
    timer = schedule(() => { void poll() }, pollMs)
  }

  const createSource = options.createSource ?? ((url: string) => new EventSource(url) as unknown as EventSourceLike)
  try {
    source = createSource(`${OPERATIONS_STREAM_PATH}?since=0`)
    source.addEventListener('hello', (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as OperationsSnapshot
        // 版本不认识就整条退到轮询：静默接受一份不认识的帧会画出看起来对但错的东西
        // （同 `run-feed.tsx:44-48` 的口径）。
        if (frame.schema !== OPERATIONS_SCHEMA) throw new Error('unexpected schema')
        setTransport('live')
      } catch {
        source?.close()
        source = undefined
        startPolling()
      }
    })
    for (const kind of ['started', 'progress', 'preview', 'finished', 'failed'] as const) {
      source.addEventListener(kind, (event) => {
        try {
          handleEvent(kind, JSON.parse(String(event.data)))
        } catch {
          // 单条坏帧不拖垮整条流；下一帧照常处理。
        }
      })
    }
    source.onerror = () => {
      if (closed) return
      source?.close()
      source = undefined
      startPolling()
    }
  } catch {
    // 没有 EventSource（桌面宿主的 IPC fetch 不在长连接的语义里）或有别的原因起不来：
    // 换成读快照。两条路由是同一份账本的两个视图，读到的字段一致。
    startPolling()
  }

  return {
    transport: () => transport,
    latest: (nodeId) => latestByNode.get(nodeId),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    close: () => {
      closed = true
      source?.close()
      if (timer !== undefined) {
        const clear = options.clearIntervalImpl ?? ((handle: ReturnType<typeof setInterval>) => clearInterval(handle))
        clear(timer)
        timer = undefined
      }
      listeners.clear()
    },
  }
}

/** 一条跟读：`stop()` 之后不再往回调里送东西（幂等，重复调没有副作用）。 */
export interface RunProgressFollow {
  stop: () => void
}

/**
 * 把一条运行回显接到**一次调用**上：调用方在发起调用**之前**挂，拿到应答之后 `stop()`。
 *
 * 认领规则（这条判据的上限要一起读）：桥是请求／应答的，`runner.run` 只带 `nodeId` + `input`，
 * 所以"我这次调用是账本里的哪一条运行"**没有随调用一起过去**。这里把挂上那一刻该节点已有的
 * `runId` 当作基线，之后凡是 runId 变了就认作这一趟。于是同一个节点被两处同时点着时，
 * 两条会互相看见对方的进度 —— 这是已知上限，不是可以糊过去的事；要精确对齐，
 * 得让桥多一条"我这次运行叫什么"的动词（`BRIDGE_METHODS` 里今天没有）。
 *
 * 只转 `running` 的读数：收尾那一格由这次调用自己的返回值写（面板收到应答后写 `phase` /
 * `progress: 100` / `progressText`），账本那条 `finished` 再由这里转一次就是往同一格上写两遍。
 *
 * 两条**不转**的情形，都是刻意的：`percent` 为 null（账本只给了 `done` 没给 `total`）时不动进度条
 * —— 把绝对量当百分数会画出一根看起来精确、其实没意义的条（ADR-0011 决定 4）；刚开跑那一格
 * （0% 且还没有任何文案）也不转，面板在 `execute` 里已经写过 `phase: 'running', progress: 0`，
 * 再发一条空文案的进度只会往日志里多出一行 `[0%] `。
 *
 * @param feed - 读哪条回显（生产传 `documentRunProgressFeed()`）。
 * @param nodeId - 这次调用打的是哪个节点。
 * @param onEvent - 面板的回调；形状逐字是 `NodeRunEvent`，同 `defineNode` 在本地转发的那一份。
 * @returns 跟读句柄。
 */
export function followNodeRun(
  feed: RunProgressFeed,
  nodeId: string,
  onEvent: (event: NodeRunEvent) => void,
): RunProgressFollow {
  let claimed = feed.latest(nodeId)?.runId
  let lastPercent: number | null = null
  let lastMessage = ''

  const deliver = (): void => {
    const reading = feed.latest(nodeId)
    if (reading === undefined || reading.phase !== 'running') return
    if (reading.runId !== claimed) {
      // 换了运行就把基线重置：新那一趟从 0 起算，而不是继承上一次的高水位。
      claimed = reading.runId
      lastPercent = null
      lastMessage = ''
    }
    const percent = reading.percent
    const percentMoved = percent !== null && percent !== lastPercent
    const messageMoved = reading.message !== '' && reading.message !== lastMessage
    if (percentMoved && percent !== null) lastPercent = percent
    if (messageMoved) lastMessage = reading.message
    if (percentMoved && percent !== null) {
      if (percent === 0 && lastMessage === '') return
      onEvent({ type: 'progress', progress: percent, message: lastMessage })
      return
    }
    if (messageMoved) onEvent({ type: 'log', message: lastMessage })
  }

  // 挂上时**不**现读一次：那一刻的读数属于调用之前那一次运行（基线就是它），转出去是别人的进度。
  return { stop: feed.subscribe(deliver) }
}

/**
 * 这一条回显在**一份文档里只开一条**：一条连接配一份读数，多开只是重复（同 `realm.ts` 那条
 * "一份文档一条桥"）。
 *
 * 说清楚它和 `client/run-feed.tsx` 的关系，别把它读成"第二个真源"：那份 `useRuns()`
 * 读的是**同一条路由、同一份账本**，只是它住在 React 里、只留运行概要（没有百分比），
 * 而 `document-host` 是一条不在组件树里的调用点（`createDocumentHost` 在五个装配点被调，
 * 其中三个没有 React）。两条投影共用同一份词表（`@hibernalglow/xaihi-sdk/operations`），
 * 谁也不许另造事件名。代价是文档里今天有两条 SSE 连接 —— 这是已知的重复，
 * 要合就得把 `useRuns` 改成读这一条，那件事有自己的账，不在这里顺手做。
 */
let sharedFeed: RunProgressFeed | undefined

/**
 * 取这份文档共享的那条回显；没有就现建一条。
 * @param options - 只在**第一次**调用时生效（共享实例只建一次）。
 */
export function documentRunProgressFeed(options?: RunProgressFeedOptions): RunProgressFeed {
  sharedFeed ??= openRunProgressFeed(options)
  return sharedFeed
}

/** 清掉共享实例（文档卸载、或测试之间隔离用）。 */
export function resetDocumentRunProgressFeed(): void {
  sharedFeed?.close()
  sharedFeed = undefined
}
