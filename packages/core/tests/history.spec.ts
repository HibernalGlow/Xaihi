/**
 * 运行账本与 `/xaihi/history.json` 的证伪测试。
 *
 * 关键的一条是"退化必须可见"：没有 storage domain 时账本落在内存里，但 `durable=false`
 * 与原因必须出现在响应里——否则"重启后历史没了"会被当成正常行为。
 *
 * @module xaihi-core/tests/history
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { HISTORY_SCHEMA, type RunRecord } from '@hibernalglow/xaihi-sdk'
import { historyHandler, historyDomain, openLedger, type DomainFacilityLike, type RunLedger } from '../src/history.ts'

const record = (runId: string, finishedAt: number, overrides: Partial<RunRecord> = {}): RunRecord => ({
  runId,
  nodeId: 'demo',
  actionId: 'go',
  startedAt: finishedAt - 5,
  finishedAt,
  outcome: 'finished',
  message: '',
  events: 2,
  checkpoint: '',
  ...overrides,
})

class FakeResponse {
  status = 0
  headers: Record<string, string> = {}
  body = ''
  writeHead(status: number, headers: Record<string, string>): void {
    this.status = status
    this.headers = headers
  }
  end(body?: string | Buffer): void {
    if (typeof body === 'string') this.body += body
  }
}

/** 一台假 domain：只实现我们用到的那一小片面。 */
function fakeFacility(options: { failWith?: string } = {}): { facility: DomainFacilityLike; stored: Map<string, RunRecord> } {
  const stored = new Map<string, RunRecord>()
  return {
    stored,
    facility: {
      async open() {
        if (options.failWith !== undefined) throw new Error(options.failWith)
        return {
          table: () => ({
            get: (key: string) => stored.get(key),
            entries: () => stored.entries(),
            async put(key: string, value: RunRecord) {
              stored.set(key, value)
            },
          }),
          async close() {},
        }
      },
    },
  }
}

describe('openLedger', () => {
  it('有 storage domain 时账本是耐久的，写入落到表里', async () => {
    const { facility, stored } = fakeFacility()
    const ledger = await openLedger(facility)
    expect(ledger.durable).toBe(true)
    expect(ledger.reason).toBeNull()
    await ledger.append(record('demo/go#1', 100))
    expect(stored.get('demo/go#1')?.finishedAt).toBe(100)
    expect((await ledger.list()).map((entry) => entry.runId)).toEqual(['demo/go#1'])
  })

  it('列表按新→旧，limit 生效', async () => {
    const { facility } = fakeFacility()
    const ledger = await openLedger(facility)
    await ledger.append(record('a', 10))
    await ledger.append(record('b', 30))
    await ledger.append(record('c', 20))
    expect((await ledger.list()).map((entry) => entry.runId)).toEqual(['b', 'c', 'a'])
    expect((await ledger.list(2)).map((entry) => entry.runId)).toEqual(['b', 'c'])
  })

  it('没有 storage domain 时退化成内存，且原因写在账本上', async () => {
    const ledger = await openLedger(undefined)
    expect(ledger.durable).toBe(false)
    expect(ledger.reason).toContain('absent')
    await ledger.append(record('demo/go#1', 5))
    expect((await ledger.list(1))[0]?.runId).toBe('demo/go#1')
  })

  it('open 抛错也必须退化并喊出来，而不是让路由 500', async () => {
    const warnings: string[] = []
    const { facility } = fakeFacility({ failWith: 'backend root unset' })
    const ledger = await openLedger(facility, (message) => warnings.push(message))
    expect(ledger.durable).toBe(false)
    expect(ledger.reason).toContain('backend root unset')
    expect(warnings.join('\n')).toContain('fell back to memory')
  })

  it('内存账本有上界，淘汰旧的不淘汰新的', async () => {
    const ledger = await openLedger(undefined)
    for (let index = 0; index < 250; index += 1) {
      await ledger.append(record(`run-${String(index)}`, index))
    }
    const listed = await ledger.list()
    expect(listed.length).toBeLessThanOrEqual(200)
    expect(listed[0]?.runId).toBe('run-249')
  })

  it('交给 DSH 的域声明带着身份与版本', () => {
    expect(historyDomain.name).toBe('xaihi_runs')
    expect(historyDomain.version).toBe(1)
    expect(Object.keys(historyDomain.tables)).toEqual(['runs'])
  })
})

describe('history 路由', () => {
  const ledgerOf = async (records: RunRecord[]): Promise<RunLedger> => ({
    durable: true,
    reason: null,
    async append() {},
    async list() {
      return records
    },
    async close() {},
  })

  const call = async (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, method = 'GET') => {
    const res = new FakeResponse()
    await handler({ url: '/xaihi/history.json', method } as unknown as IncomingMessage, res as unknown as ServerResponse)
    return res
  }

  it('GET 回契约版本、耐久性与记录', async () => {
    const handler = historyHandler(async () => ledgerOf([record('a', 1)]))
    const res = await call(handler)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(res.body)).toMatchObject({ schema: HISTORY_SCHEMA, durable: true, reason: null })
    expect((JSON.parse(res.body) as { records: RunRecord[] }).records).toHaveLength(1)
  })

  it('退化时 durable=false 且原因照说', async () => {
    const handler = historyHandler(async () => ({
      durable: false,
      reason: 'storageDomain service is absent',
      async append() {},
      async list() {
        return []
      },
      async close() {},
    }))
    const body = JSON.parse((await call(handler)).body) as { durable: boolean; reason: string }
    expect(body).toMatchObject({ durable: false, reason: 'storageDomain service is absent' })
  })

  it('POST 405', async () => {
    const res = await call(historyHandler(async () => ledgerOf([])), 'POST')
    expect(res.status).toBe(405)
  })

  it('阳性对照：账本打不开时是 500 带原因，绝不是 200 空清单', async () => {
    const res = await call(historyHandler(async () => {
      throw new Error('disk gone')
    }))
    expect(res.status).toBe(500)
    expect(res.body).toContain('disk gone')
  })
})
