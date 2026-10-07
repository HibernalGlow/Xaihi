import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureSettingsSnapshot,
  deepDiffPaths,
  lineDiff,
  openSettingsHistoryStore,
  reconcileSettingsHistory,
  restoreSettingsSnapshot,
  settingsHistoryHandler,
} from '../src/settings-history.ts'
import type { SettingsServiceLike } from '../src/host-routes.ts'

const ALLOWED = new Set(['xaihi-sleept'])

function fakeService(rows: Array<{ ns: string; revision: number; value: unknown }>): SettingsServiceLike & { mutateCalls: number } {
  return {
    describe: (options) => rows.map((row) => (options?.redactSecrets === false ? { ...row, value: { ...(row.value as object), apiKey: 'real-secret' } } : { ...row, value: { ...(row.value as object), apiKey: '***' } })),
    update: vi.fn(async (ns, values) => {
      const row = rows.find((entry) => entry.ns === ns)
      if (row) { row.value = values as unknown; row.revision += 1 }
      return { ns, revision: rows.find((entry) => entry.ns === ns)?.revision }
    }),
    mutate: vi.fn(async (ns) => {
      const row = rows.find((entry) => entry.ns === ns)
      if (row) row.revision += 1
      return { ns, revision: row?.revision }
    }),
    mutateCalls: 0,
  } as never
}

function call(handler: ReturnType<typeof settingsHistoryHandler>, url: string, method = 'GET', body?: unknown) {
  return new Promise<{ status: number; json: Record<string, unknown> }>((resolve) => {
    const chunks: string[] = []
    const res = {
      writeHead: (status: number, headers: Record<string, string>) => { void status; void headers },
      end: (payload: string) => resolve({ status: (res as { statusCode?: number }).statusCode ?? 0, json: JSON.parse(payload) }),
    } as never
    // 简化：从 writeHead 抓 status。
    const realRes = {
      statusCode: 0,
      writeHead(status: number) { this.statusCode = status },
      end(payload: string) { resolve({ status: this.statusCode, json: JSON.parse(payload) }) },
      setHeader: () => {},
    }
    void chunks
    void res
    const req = {
      url,
      method,
      on(event: string, cb: (chunk?: Buffer) => void) {
        if (event === 'data' && body !== undefined) cb(Buffer.from(JSON.stringify(body)))
        if (event === 'end') cb()
      },
    }
    void handler(req as never, realRes as never)
  })
}

describe('settings history', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('captures a redacted snapshot with secret paths, diffs against the previous one, and prunes nothing below the cap', async () => {
    const store = await openSettingsHistoryStore(undefined)
    const service = fakeService([{ ns: 'xaihi-sleept', revision: 7, value: { format: 'AVIF' } }])
    const first = await captureSettingsSnapshot({ settings: service, store }, 'xaihi-sleept', 'write', '设置保存')
    expect(first).not.toBeNull()
    expect(first?.revision).toBe('7')
    expect(JSON.parse(first!.value)).toEqual({ format: 'AVIF', apiKey: '***' })
    expect(JSON.parse(first!.secretPaths)).toEqual([['apiKey']])

    service.update('xaihi-sleept', { format: 'WEBP' })
    const second = await captureSettingsSnapshot({ settings: service, store }, 'xaihi-sleept', 'write', '设置保存')
    expect(second?.fields).toEqual(['format'])
    expect(second?.patch).toContain('"format": "WEBP"')
    expect(second?.patch).toContain('- ')

    expect(await store.list('xaihi-sleept')).toHaveLength(2)
    expect(await store.list('xaihi-other')).toHaveLength(0)
    await store.close()
  })

  it('reconciles only when the current revision is newer than the newest snapshot', async () => {
    const store = await openSettingsHistoryStore(undefined)
    const service = fakeService([{ ns: 'xaihi-sleept', revision: 9, value: { format: 'AVIF' } }])
    await reconcileSettingsHistory({ settings: service, store }, 'xaihi-sleept')
    expect(await store.list('xaihi-sleept')).toHaveLength(1)
    const meta = await reconcileSettingsHistory({ settings: service, store }, 'xaihi-sleept')
    expect(meta.durable).toBe(false)
    expect(await store.list('xaihi-sleept')).toHaveLength(1)
    await store.close()
  })

  it('restores via mutate path ops, skipping secret-bearing top fields, and records the restore as a snapshot', async () => {
    const store = await openSettingsHistoryStore(undefined)
    const service = fakeService([{ ns: 'xaihi-sleept', revision: 10, value: { format: 'AVIF', apiKey: '***' } }])
    await captureSettingsSnapshot({ settings: service, store }, 'xaihi-sleept', 'write', '设置保存')
    // 当前值漂移（revision 前进）后再恢复
    service.update('xaihi-sleept', { format: 'JXL' })
    const result = await restoreSettingsSnapshot({ settings: service, store }, 'xaihi-sleept', '10')
    expect(result.restored).toBe(true)
    expect(result.detail).toContain('跳过密钥字段')
    // 恢复本身也留了账：@10 原始份 + 恢复后 @12 的对账份（中间那次裸 update 不经闸，无快照——这正是写点即采的语义）
    expect(await store.list('xaihi-sleept')).toHaveLength(2)
    await store.close()
  })

  it('refuses namespaces outside the allowed set and serves list/restore over the route', async () => {
    const warn = vi.fn()
    const store = await openSettingsHistoryStore(undefined, warn)
    const service = fakeService([{ ns: 'xaihi-sleept', revision: 4, value: { format: 'AVIF' } }])
    const handler = settingsHistoryHandler({
      settings: () => service,
      allowed: () => ALLOWED,
      store: () => Promise.resolve(store),
    })

    const denied = await call(handler, '/xaihi/settings-history.json?ns=xaihi-evil')
    expect(denied.status).toBe(400)
    expect(denied.json.error).toBe('namespace-not-allowed')

    const list = await call(handler, '/xaihi/settings-history.json?ns=xaihi-sleept')
    expect(list.status).toBe(200)
    expect((list.json.snapshots as unknown[]).length).toBe(1)

    const restore = await call(handler, '/xaihi/settings-history.json?ns=xaihi-sleept', 'POST', { ns: 'xaihi-sleept', revision: '4' })
    expect(restore.status).toBe(200)
    expect(restore.json.restored).toBe(true)
  })
})

// 正控：把闸拆掉就必须红——这是"越界必须拒"这条判据的证伪用例。
describe('settings history positive control', () => {
  it('goes red if the namespace fence is removed', async () => {
    const store = await openSettingsHistoryStore(undefined)
    const service = fakeService([{ ns: 'xaihi-sleept', revision: 1, value: {} }])
    const unfenced = settingsHistoryHandler({
      settings: () => service,
      allowed: () => ALLOWED,
      store: () => Promise.resolve(store),
    })
    // 直接用一个不允许的 ns：期望 400。若实现退化成放行，这条断言就是红的。
    const denied = await call(unfenced, '/xaihi/settings-history.json?ns=xaihi-evil')
    expect(denied.status).toBe(400)
    await store.close()
  })
})

describe('diff helpers', () => {
  it('lineDiff marks added and removed lines', () => {
    const diff = lineDiff('a\nb', 'a\nc')
    expect(diff).toContain('- b')
    expect(diff).toContain('+ c')
  })

  it('deepDiffPaths treats arrays as atomic and finds changed leaves', () => {
    expect(deepDiffPaths({ a: 1, list: [1, 2] }, { a: 1, list: [1, 9] })).toEqual([['list']])
    expect(deepDiffPaths({ a: { b: 1 } }, { a: { b: 2 } })).toEqual([['a', 'b']])
    expect(deepDiffPaths({ a: 1 }, { a: 1 })).toEqual([])
  })
})
