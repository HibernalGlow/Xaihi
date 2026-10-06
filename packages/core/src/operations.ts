/**
 * 运行账本与它的路由面：一次节点运行的 `progress` / `preview` / `result_view` 三态。
 *
 * 为什么这件事归 Xaihi 而不是 DSH：DSH 的工具有"一次调用的输出"，`ctx.emit` 是通用事件缝，
 * 而主机→浏览器那条转发通道（`ctx.remote.$on`）的合法事件集是主机装配侧写死的白名单，
 * 第三方事件进不去。DSH 留下的合法缝隙是 `ctx.webServer` 的命名路由——它的
 * `WebRoute.handler` 文档原文就是"may hold the response open, e.g. SSE"。所以这里
 * 是"用宿主要求的方式搬运自己的词表"，不是绕开宿主。
 *
 * 边界：内存有界。事件按 `maxEvents` 环形截断，截断过就在快照里明说 `truncated` 与
 * `oldestSeq`——读取方必须能区分"这段历史没有"与"我没拿到"。持久化（检查点/回滚账本）
 * 是 history 那一步的事，不在这里偷偷写文件。
 *
 * @module xaihi-core/operations
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  OPERATION_EVENT_KINDS,
  OPERATIONS_SCHEMA,
  type ActiveRun,
  type OperationEvent,
  type OperationEventInput,
  type OperationEventKind,
  type OperationJournal,
  type OperationProgress,
  type OperationRun,
  type OperationSeq,
  type OperationsSnapshot,
} from '@hibernalglow/xaihi-sdk'

/** 账本的有界性参数。 */
export interface JournalOptions {
  /** 全局长度上限，超出后丢最旧的事件。 */
  maxEvents?: number
  /** 保留多少条运行概要。 */
  maxRuns?: number
  /** 时间源，测试用。 */
  now?: () => number
  /** 诊断输出，测试用；默认 console.warn。 */
  warn?: (message: string) => void
}

/** 心跳/截断这类内部决定的默认值。 */
const DEFAULTS = { maxEvents: 500, maxRuns: 50 } as const

/** 监听器异常不得反噬生产者：一个坏的面板不能让节点调用失败。 */
type Listener = (event: OperationEvent) => void

/** core 侧的账本：契约面 + 两个只有实现方才知道的截断事实。 */
export type HostJournal = OperationJournal & {
  oldestSeq(): OperationSeq
  dropped(): number
}

/**
 * 建立一台运行账本。
 * @param options - 上界与时间源。
 * @returns 契约要求的全部方法，外加 `oldestSeq` / `dropped` 这两个可读回事实。
 */
export function createJournal(options: JournalOptions = {}): HostJournal {
  const maxEvents = options.maxEvents ?? DEFAULTS.maxEvents
  const maxRuns = options.maxRuns ?? DEFAULTS.maxRuns
  const now = options.now ?? (() => Date.now())
  const warn = options.warn ?? ((message: string) => console.warn(message))

  let seq: OperationSeq = 0
  let runCounter = 0
  let droppedEvents = 0
  const events: OperationEvent[] = []
  const runs = new Map<string, ActiveRun>()
  const runOrder: string[] = []
  const listeners = new Set<Listener>()

  const notify = (event: OperationEvent): void => {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch (error) {
        warn(`xaihi-operations: listener failed on seq ${event.seq}: ${String(error instanceof Error ? error.message : error)}`)
      }
    }
  }

  const append = (input: OperationEventInput): OperationEvent => {
    seq += 1
    const event: OperationEvent = { ...input, seq, at: now() }
    events.push(event)
    if (events.length > maxEvents) {
      events.shift()
      droppedEvents += 1
    }
    const run = runs.get(input.runId)
    if (run !== undefined) run.lastSeq = event.seq
    notify(event)
    return event
  }

  const touch = (runId: string): ActiveRun | undefined => runs.get(runId)

  return {
    open(identity) {
      runCounter += 1
      const runId = `${identity.nodeId}/${identity.actionId}#${runCounter}`
      const run: ActiveRun = {
        runId,
        nodeId: identity.nodeId,
        actionId: identity.actionId,
        startedAt: now(),
        outcome: 'running',
        lastSeq: 0,
      }
      runs.set(runId, run)
      runOrder.unshift(runId)
      while (runOrder.length > maxRuns) {
        const evicted = runOrder.pop()
        if (evicted !== undefined) runs.delete(evicted)
      }
      append({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind: 'started' })
      const emit = (kind: OperationEventKind, extra: Partial<Pick<OperationEvent, 'progress' | 'payload'>>): void => {
        append({ runId, nodeId: identity.nodeId, actionId: identity.actionId, kind, ...extra })
      }
      const handle: OperationRun = {
        runId,
        progress: (progress: OperationProgress) => emit('progress', { progress }),
        preview: (payload: unknown) => emit('preview', { payload }),
        resultView: (payload: unknown) => emit('result_view', { payload }),
        checkpoint: (payload: unknown) => emit('checkpoint', { payload }),
      }
      return handle
    },

    finish(runId) {
      const run = touch(runId)
      if (run === undefined) {
        warn(`xaihi-operations: finish("${runId}") names no retained run`)
        return
      }
      run.outcome = 'finished'
      run.finishedAt = now()
      append({ runId, nodeId: run.nodeId, actionId: run.actionId, kind: 'finished' })
    },

    fail(runId, message) {
      const run = touch(runId)
      if (run === undefined) {
        warn(`xaihi-operations: fail("${runId}") names no retained run`)
        return
      }
      run.outcome = 'failed'
      run.finishedAt = now()
      run.message = message
      append({ runId, nodeId: run.nodeId, actionId: run.actionId, kind: 'failed', message })
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    since(from) {
      // 缓冲区按追加顺序即时间顺序，不需要再排。
      return events.filter((event) => event.seq > from)
    },

    runs() {
      return runOrder.map((runId) => runs.get(runId)).filter((run): run is ActiveRun => run !== undefined)
    },

    seq() {
      return seq
    },

    oldestSeq() {
      return events.length === 0 ? seq : (events[0] as OperationEvent).seq
    },

    dropped() {
      return droppedEvents
    },
  }
}

/** 快照体的词表见 `@hibernalglow/xaihi-sdk` 的 `OperationsSnapshot`：两条路由与握手帧共用它。 */
const sendJson = (res: ServerResponse, status: number, body: string): void => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

const writeHead405 = (res: ServerResponse): void => {
  res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', allow: 'GET' })
  res.end('method not allowed')
}

/**
 * `/xaihi/operations.json`：exact 路由，一次读全部运行概要。
 * @param journal - 账本。
 */
export function operationsSnapshotHandler(journal: HostJournal) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET') {
      writeHead405(res)
      return
    }
    const snapshot: OperationsSnapshot = {
      schema: OPERATIONS_SCHEMA,
      seq: journal.seq(),
      oldestSeq: journal.oldestSeq(),
      truncated: journal.dropped() > 0,
      kinds: OPERATION_EVENT_KINDS,
      runs: journal.runs(),
    }
    sendJson(res, 200, JSON.stringify(snapshot))
  }
}

/** SSE 路由的可调项。 */
export interface StreamOptions {
  /** 心跳周期，防代理与空闲超时把连接掐掉。 */
  heartbeatMs?: number
  /** 握手时最多带多少条最近事件；历史全量走快照路由。 */
  replayLimit?: number
  /** 定时器工厂，测试用。 */
  setInterval?: (callback: () => void, ms: number) => { refresh(): void; unref(): void }
  clearInterval?: (handle: unknown) => void
}

const sseFrame = (event: string, data: unknown, id?: OperationSeq): string =>
  `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * `/xaihi/operations/stream`：exact 路由，`text/event-stream`。
 *
 * 连上先发 `hello`（带当前 seq 与运行概要），再按 `?since=` 补历史事件，之后实时转发。
 * 断开必须同时退订与停心跳，否则每次页面刷新都会漏一个定时器与一个监听器。
 *
 * @param journal - 账本。
 * @param options - 心跳与补历史参数。
 */
export function operationsStreamHandler(journal: HostJournal, options: StreamOptions = {}) {
  const heartbeatMs = options.heartbeatMs ?? 15_000
  const replayLimit = options.replayLimit ?? 100
  const intervalFactory = options.setInterval ?? ((callback: () => void, ms: number) => {
    const handle = setInterval(callback, ms)
    // 心跳不许把进程留在世上。
    ;(handle as unknown as { unref?: () => void }).unref?.()
    return handle as unknown as { refresh(): void; unref(): void }
  })
  const clear = options.clearInterval ?? ((handle: unknown) => clearInterval(handle as Parameters<typeof clearInterval>[0]))

  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET') {
      writeHead405(res)
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const raw = url.searchParams.get('since')
    const since = raw === null ? 0 : Number.parseInt(raw, 10)
    const from = Number.isFinite(since) && since >= 0 ? since : 0

    const startSeq = journal.seq()
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // nginx 一类反向代理默认缓冲响应，不显式关掉就看不到"实时"。
      'x-accel-buffering': 'no',
    })
    const backlog = journal.since(from)
    const replayed = backlog.length > replayLimit ? backlog.slice(backlog.length - replayLimit) : backlog
    res.write(sseFrame('hello', {
      schema: OPERATIONS_SCHEMA,
      seq: startSeq,
      oldestSeq: journal.oldestSeq(),
      truncated: journal.dropped() > 0,
      // 补了多少、从哪一条起：客户端据此判断"我拿到的是全量还是最近一段"。
      replayed: { count: replayed.length, firstSeq: replayed.length === 0 ? startSeq : (replayed[0] as OperationEvent).seq },
      runs: journal.runs(),
    }))
    for (const event of replayed) {
      res.write(sseFrame(event.kind, event, event.seq))
    }

    let closed = false
    const unsubscribe = journal.subscribe((event) => {
      // 补历史与订阅之间会漏进新事件，所以按连接当时的高水位去重，而不是按 `since`。
      if (closed || event.seq <= startSeq) return
      res.write(sseFrame(event.kind, event, event.seq))
    })
    const heartbeat = intervalFactory(() => {
      if (closed) return
      res.write(': hb\n\n')
    }, heartbeatMs)

    const close = (): void => {
      if (closed) return
      closed = true
      unsubscribe()
      clear(heartbeat)
    }
    req.on('close', close)
    res.on('close', close)
  }
}
