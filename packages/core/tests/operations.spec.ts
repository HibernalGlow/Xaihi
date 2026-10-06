/**
 * 运行账本与两条 `/xaihi/operations*` 路由的证伪测试。
 *
 * 这里要守住的三件事：seq 单调且缓冲区有界（有界就必须说得出来）、坏监听器不能反噬
 * 生产者、SSE 连接断开必须同时退订与停表。心跳用注入的假定时器，测的是"注册了也必须
 * 清掉"，不是等 15 秒。
 *
 * @module xaihi-core/tests/operations
 */

import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { OPERATIONS_SCHEMA, type OperationEvent } from '@hibernalglow/xaihi-sdk'
import { createJournal, operationsSnapshotHandler, operationsStreamHandler } from '../src/operations.ts'

const clock = () => {
  let now = 1000
  return { now: () => (now += 10) }
}

describe('createJournal', () => {
  it('事件 seq 单调递增，运行概要跟着最后一条走', () => {
    const journal = createJournal({ now: clock().now })
    const run = journal.open({ nodeId: 'demo', actionId: 'go' })
    run.progress({ done: 1, total: 4 })
    run.resultView({ kept: 3 })
    journal.finish(run.runId)
    const events = journal.since(0)
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4])
    expect(events.map((event) => event.kind)).toEqual(['started', 'progress', 'result_view', 'finished'])
    expect(journal.runs()[0]).toMatchObject({ outcome: 'finished', lastSeq: 4, runId: run.runId })
  })

  it('failed 带原因，且 finishedAt 有值', () => {
    const journal = createJournal({ now: clock().now })
    const run = journal.open({ nodeId: 'demo', actionId: 'go' })
    journal.fail(run.runId, 'disk gone')
    expect(journal.since(0).at(-1)).toMatchObject({ kind: 'failed', message: 'disk gone' })
    expect(journal.runs()[0]?.outcome).toBe('failed')
    expect(journal.runs()[0]?.finishedAt).toBeTypeOf('number')
  })

  it('收不到身份的 finish 必须喊出来，不能静默', () => {
    const warnings: string[] = []
    const journal = createJournal({ warn: (message) => warnings.push(message) })
    journal.finish('no/such#1')
    expect(warnings.join('\n')).toContain('no retained run')
  })

  it('缓冲区有界：丢过就要能读出来', () => {
    const journal = createJournal({ maxEvents: 3, maxRuns: 10, now: clock().now })
    for (let index = 0; index < 4; index += 1) {
      const run = journal.open({ nodeId: 'demo', actionId: `go${String(index)}` })
      journal.finish(run.runId)
    }
    // 4 次运行 × 2 条事件 = 8 条，上界 3 ⇒ 留下最后的 6、7、8。
    expect(journal.since(0).map((event) => event.seq)).toEqual([6, 7, 8])
    expect(journal.dropped()).toBe(5)
    expect(journal.oldestSeq()).toBe(6)
  })

  it('运行概要也有上界，超出的旧运行被淘汰', () => {
    const journal = createJournal({ maxRuns: 2, now: clock().now })
    for (let index = 0; index < 3; index += 1) journal.open({ nodeId: 'demo', actionId: `go${String(index)}` })
    expect(journal.runs().map((run) => run.actionId)).toEqual(['go2', 'go1'])
  })

  it('阳性对照：坏监听器不能让节点调用失败，但必须留下诊断', () => {
    const warnings: string[] = []
    const journal = createJournal({ warn: (message) => warnings.push(message) })
    journal.subscribe(() => { throw new Error('panel exploded') })
    const seen: OperationEvent[] = []
    journal.subscribe((event) => { seen.push(event) })
    expect(() => journal.open({ nodeId: 'demo', actionId: 'go' })).not.toThrow()
    expect(seen.length).toBe(1)
    expect(warnings.join('\n')).toContain('panel exploded')
  })

  it('退订之后不再收事件', () => {
    const journal = createJournal()
    const seen: OperationEvent[] = []
    const off = journal.subscribe((event) => { seen.push(event) })
    const run = journal.open({ nodeId: 'demo', actionId: 'go' })
    off()
    journal.finish(run.runId)
    expect(seen.map((event) => event.kind)).toEqual(['started'])
  })
})

class FakeStream {
  chunks = ''
  status = 0
  headers: Record<string, string> = {}
  ended = false
  private handlers = new Map<string, Array<() => void>>()

  writeHead(status: number, headers: Record<string, string>): void {
    this.status = status
    this.headers = headers
  }
  write(chunk: string): void {
    this.chunks += chunk
  }
  end(body?: string | Buffer): void {
    this.ended = true
    if (typeof body === 'string') this.chunks += body
  }
  on(event: string, listener: () => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener])
  }
  emit(event: string): void {
    for (const listener of this.handlers.get(event) ?? []) listener()
  }
  get frames(): string[] {
    return this.chunks.split('\n\n').filter((frame) => frame !== '')
  }
}

const dataOf = (frame: string): Record<string, unknown> =>
  JSON.parse(frame.split('\ndata: ')[1] ?? '{}') as Record<string, unknown>

describe('operations stream 路由', () => {
  const handlerOf = (journal: ReturnType<typeof createJournal>) => {
    const cleared: unknown[] = []
    const handler = operationsStreamHandler(journal, {
      heartbeatMs: 5,
      setInterval: (callback, ms) => {
        void callback
        void ms
        return { refresh() {}, unref() {} }
      },
      clearInterval: (handle) => { cleared.push(handle) },
    })
    return { handler, cleared }
  }

  it('握手帧带契约版本与高水位，随后补齐历史', () => {
    const journal = createJournal({ now: clock().now })
    const run = journal.open({ nodeId: 'demo', actionId: 'go' })
    journal.finish(run.runId)
    const { handler } = handlerOf(journal)
    const res = new FakeStream()
    handler({ url: '/xaihi/operations/stream', method: 'GET', on: () => {} } as unknown as IncomingMessage, res as unknown as ServerResponse)
    const frames = res.frames
    expect(frames[0]).toContain('event: hello')
    expect(dataOf(frames[0] as string)).toMatchObject({ schema: OPERATIONS_SCHEMA, seq: 2 })
    expect(frames.slice(1).map((frame) => /event: (\w+)/.exec(frame ?? '')?.[1])).toEqual(['started', 'finished'])
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(res.headers['x-accel-buffering']).toBe('no')
  })

  it('连接后的新事件实时转发', () => {
    const journal = createJournal({ now: clock().now })
    const { handler } = handlerOf(journal)
    const res = new FakeStream()
    handler({ url: '/xaihi/operations/stream', method: 'GET', on: () => {} } as unknown as IncomingMessage, res as unknown as ServerResponse)
    const before = res.frames.length
    const run = journal.open({ nodeId: 'demo', actionId: 'late' })
    expect(res.frames.length).toBe(before + 1)
    expect(dataOf(res.frames.at(-1) as string)).toMatchObject({ kind: 'started', actionId: 'late' })
    journal.finish(run.runId)
  })

  it('阳性对照：断开必须同时退订与停心跳', () => {
    const journal = createJournal({ now: clock().now })
    const { handler, cleared } = handlerOf(journal)
    const handlers: Array<() => void> = []
    const req = {
      url: '/xaihi/operations/stream',
      method: 'GET',
      on: (_event: string, listener: () => void) => { handlers.push(listener) },
    } as unknown as IncomingMessage
    const res = new FakeStream()
    handler(req, res as unknown as ServerResponse)
    const before = res.frames.length
    for (const listener of handlers) listener()
    expect(res.frames.length).toBe(before)
    expect(cleared.length).toBe(1)
    const run = journal.open({ nodeId: 'demo', actionId: 'after' })
    expect(res.frames.length).toBe(before)
    journal.finish(run.runId)
  })

  it('since 只影响补历史，不影响实时转发', () => {
    const journal = createJournal({ now: clock().now })
    const first = journal.open({ nodeId: 'demo', actionId: 'one' })
    journal.finish(first.runId)
    const { handler } = handlerOf(journal)
    const res = new FakeStream()
    handler({ url: '/xaihi/operations/stream?since=2', method: 'GET', on: () => {} } as unknown as IncomingMessage, res as unknown as ServerResponse)
    // seq 1..2 都不该重发，握手之后只有新事件。
    expect(res.frames.filter((frame) => /event: (started|finished)/.test(frame ?? ''))).toHaveLength(0)
    journal.open({ nodeId: 'demo', actionId: 'two' })
    expect(res.frames.at(-1)).toContain('event: started')
  })

  it('非 GET 拒绝，避免把长挂的连接当查询串探测面', () => {
    const { handler } = handlerOf(createJournal())
    const res = new FakeStream()
    handler({ url: '/xaihi/operations/stream', method: 'POST', on: () => {} } as unknown as IncomingMessage, res as unknown as ServerResponse)
    expect(res.status).toBe(405)
    expect(res.headers['allow']).toBe('GET')
    expect(res.chunks).toBe('method not allowed')
    expect(res.ended).toBe(true)
  })
})

describe('operations snapshot 路由', () => {
  it('GET 返回可判读的空态：schema、seq 与 truncated 都在', () => {
    const journal = createJournal()
    const res = new FakeStream()
    operationsSnapshotHandler(journal)({ url: '/xaihi/operations.json', method: 'GET' } as unknown as IncomingMessage, res as unknown as ServerResponse)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(res.chunks)).toMatchObject({ schema: OPERATIONS_SCHEMA, seq: 0, truncated: false, runs: [] })
  })

  it('连接过的事件在缓冲区溢出后，快照必须说 truncated 而不是假装完整', () => {
    const journal = createJournal({ maxEvents: 1, now: clock().now })
    const run = journal.open({ nodeId: 'demo', actionId: 'go' })
    journal.finish(run.runId)
    const res = new FakeStream()
    operationsSnapshotHandler(journal)({ url: '/xaihi/operations.json', method: 'GET' } as unknown as IncomingMessage, res as unknown as ServerResponse)
    const body = JSON.parse(res.chunks) as { truncated: boolean; oldestSeq: number; seq: number }
    expect(body).toMatchObject({ truncated: true, oldestSeq: 2, seq: 2 })
  })

  it('POST 405', () => {
    const res = new FakeStream()
    operationsSnapshotHandler(createJournal())({ url: '/xaihi/operations.json', method: 'POST' } as unknown as IncomingMessage, res as unknown as ServerResponse)
    expect(res.status).toBe(405)
  })
})
