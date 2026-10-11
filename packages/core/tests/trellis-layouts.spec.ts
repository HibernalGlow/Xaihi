import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { openTrellisStore, trellisDomain, trellisLayoutsHandler, type TrellisDomainFacility, type TrellisRecord } from '../src/trellis-layouts.ts'
const input = { writer: 'Xaihi window A', navigation: 'free' as const, document: { schema: 1 as const, root: null, floating: [], hidden: [], views: {} } }
function facility() {
  const table = new Map<string, TrellisRecord>()
  const f: TrellisDomainFacility = { async open() { return { table: () => ({ get: (id) => table.get(id), async put(id, value) { await Promise.resolve(); table.set(id, value) } }), async close() {} } } }
  return { f, table }
}
async function call(method: string, body?: unknown, id = 'workspace-a', givenStore?: Awaited<ReturnType<typeof openTrellisStore>>) {
  const store = givenStore ?? await openTrellisStore()
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as IncomingMessage
  req.method = method; req.url = `/xaihi/trellis-layouts.json?id=${id}`
  let status = 0; let text = ''
  const res = { writeHead: (code: number) => { status = code }, end: (value: string) => { text += value } } as unknown as ServerResponse
  await trellisLayoutsHandler(Promise.resolve(store))(req, res)
  return { status, body: JSON.parse(text) }
}
describe('Trellis DSH data domain', () => {
  it('uses a named DSH domain and reads back documents across store lifetimes', async () => {
    expect(trellisDomain.name).toBe('xaihi_trellis')
    expect(trellisDomain.version).toBe(1)
    const { f, table } = facility()
    const a = await openTrellisStore(f)
    expect(a.durable).toBe(true)
    await a.write('workspace-a', input, 0); await a.close()
    const b = await openTrellisStore(f)
    expect(b.read('workspace-a')).toMatchObject({ revision: 1, navigation: 'free', writer: 'Xaihi window A' })
    expect(table.size).toBe(1)
  })
  it('serializes simultaneous read/check/write operations; stale revisions cannot overwrite another window', async () => {
    const { f } = facility(); const store = await openTrellisStore(f)
    const [a, b] = await Promise.all([store.write('workspace-a', input, 0), store.write('workspace-a', { ...input, writer: 'Xaihi window B' }, 0)])
    expect(a.conflict).toBe(false)
    expect(b.conflict).toBe(true)
    expect(b.layout.writer).toBe('Xaihi window A')
    expect(store.read('workspace-a')?.revision).toBe(1)
    const updated = await store.write('workspace-a', { ...input, writer: 'Xaihi window B' }, 1)
    expect(updated.layout.revision).toBe(2)
  })
  it('reports unavailable or failed domain service visibly, and retains only session data', async () => {
    const store = await openTrellisStore()
    expect(store.durable).toBe(false); expect(store.reason).toContain('absent')
    await store.write('workspace-a', input, 0)
    expect(store.read('workspace-a')?.revision).toBe(1)
    const broken = await openTrellisStore({ async open() { throw new Error('domain could not open') } })
    expect(broken.durable).toBe(false); expect(broken.reason).toContain('could not open')
  })
  it('rejects unversioned writes, invalid workspace ids and wrong HTTP methods', async () => {
    expect((await call('PUT', input)).status).toBe(400)
    expect((await call('PUT', { ...input, expectedRevision: 0 })).body).toMatchObject({ durable: false, layout: { revision: 1 } })
    expect((await call('GET', undefined, '../outside')).status).toBe(400)
    expect((await call('POST')).status).toBe(405)
    expect((await call('GET')).body).toMatchObject({ durable: false, reason: 'storageDomain service is absent', layout: null })
  })
  it('rejects malformed recursive nodes and oversized documents', async () => {
    const body = { ...input, expectedRevision: 0 }
    expect((await call('PUT', { ...body, document: { ...input.document, root: { kind: 'split', id: 'bad', children: [{}] } } })).status).toBe(400)
    expect((await call('PUT', { ...body, writer: 'x'.repeat(512 * 1024) })).status).toBe(413)
  })
  it('returns HTTP409 and the latest writer for a stale revision', async () => {
    const store = await openTrellisStore()
    expect((await call('PUT', { ...input, expectedRevision: 0 }, 'workspace-a', store)).status).toBe(200)
    const conflict = await call('PUT', { ...input, writer: 'Xaihi window B', expectedRevision: 0 }, 'workspace-a', store)
    expect(conflict.status).toBe(409)
    expect(conflict.body).toMatchObject({ conflict: true, error: 'LAYOUT_CONFLICT', layout: { writer: 'Xaihi window A', revision: 1 } })
  })

})
