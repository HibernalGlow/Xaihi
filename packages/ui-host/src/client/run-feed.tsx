/**
 * 运行回显：把 xaihi-core 的 `/xaihi/operations/stream` 变成壳里看得见的一条状态。
 *
 * 为什么这里要有轮询兜底：桌面宿主不用这台 HTTP 服务器（Electron 走 IPC 桥取 fetch，
 * 长连接不在它的语义里），所以 `EventSource` 可能一开始就失败。失败不是降级成"没有回显"，
 * 而是换成读快照路由——两条路由是同一份账本的两个视图，读到的字段完全一致。
 *
 * @module xaihi-ui/run-feed
 */

import * as React from 'react'
import {
  OPERATIONS_SCHEMA,
  OPERATIONS_SNAPSHOT_PATH,
  OPERATIONS_STREAM_PATH,
  type ActiveRun,
  type OperationsSnapshot,
} from '@hibernalglow/xaihi-sdk/operations'
import type { Translate } from './locales.ts'

/** 传输方式，界面要如实说出来：连上了说 live，退回轮询就说 polling。 */
export type FeedTransport = 'connecting' | 'live' | 'polling' | 'offline'

const MAX_VISIBLE = 6

/**
 * 订阅运行账本。
 * @returns 最近的运行（新→旧）与当前传输方式。
 */
export function useRuns(): { runs: ActiveRun[]; transport: FeedTransport } {
  const [runs, setRuns] = React.useState<ActiveRun[]>([])
  const [transport, setTransport] = React.useState<FeedTransport>('connecting')

  const applySnapshot = React.useCallback((body: OperationsSnapshot): void => {
    setRuns(body.runs.slice(0, MAX_VISIBLE))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    let source: EventSource | undefined
    let timer: ReturnType<typeof setInterval> | undefined

    const guard = (body: OperationsSnapshot): OperationsSnapshot => {
      // 版本不认识就整份拒收，和清单同一口径：静默降级会画出看起来对但错的东西。
      if (body.schema !== OPERATIONS_SCHEMA) throw new Error(`unexpected operations schema ${String(body.schema)}`)
      return body
    }

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(OPERATIONS_SNAPSHOT_PATH, { cache: 'no-store' })
        if (!response.ok) throw new Error(`snapshot responded ${String(response.status)}`)
        const body = guard((await response.json()) as OperationsSnapshot)
        if (!cancelled) {
          setTransport('polling')
          applySnapshot(body)
        }
      } catch {
        if (!cancelled) setTransport('offline')
      }
    }

    const fallBackToPolling = (): void => {
      void poll()
      timer = setInterval(() => void poll(), 3000)
    }

    try {
      source = new EventSource(`${OPERATIONS_STREAM_PATH}?since=0`)
      source.addEventListener('hello', (raw) => {
        try {
          const frame = guard(JSON.parse((raw as MessageEvent<string>).data) as OperationsSnapshot)
          if (!cancelled) {
            setTransport('live')
            applySnapshot(frame)
          }
        } catch {
          source?.close()
          setTransport('offline')
        }
      })
      const resync = (): void => {
        // 每条事件都回读一次快照：单条事件不含运行概要，宁可多读一次也不要壳里
        // 攒出一份和宿主不一致的第二真源。
        void poll()
      }
      for (const kind of ['started', 'progress', 'preview', 'result_view', 'finished', 'failed']) {
        source.addEventListener(kind, resync)
      }
      source.onerror = () => {
        if (cancelled) return
        source?.close()
        source = undefined
        fallBackToPolling()
      }
    } catch {
      fallBackToPolling()
    }

    return () => {
      cancelled = true
      source?.close()
      if (timer !== undefined) clearInterval(timer)
    }
  }, [applySnapshot])

  return { runs, transport }
}

const labelOf = (run: ActiveRun): string => {
  const base = `${run.nodeId} · ${run.actionId}`
  return run.outcome === 'running' ? `${base} …` : `${base} ${run.outcome}`
}

/** 状态栏里的运行回显。 */
export function RunFeed({ t }: { t: Translate }): React.ReactElement | null {
  const { runs, transport } = useRuns()
  if (runs.length === 0) return null
  return (
    <span className="xaihi-feed" aria-label={t('feed.title')} data-transport={transport}>
      {runs.slice(0, 3).map((run) => (
        <span key={run.runId} className="xaihi-feed-item" data-outcome={run.outcome}>{labelOf(run)}</span>
      ))}
      {transport === 'polling' && <span className="xaihi-feed-note">{t('feed.polling')}</span>}
    </span>
  )
}
