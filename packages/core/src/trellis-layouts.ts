/** Trellis documents are workspace data, stored by DSH rather than settings or localStorage. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'

export const TRELLIS_LAYOUT_PATH = '/xaihi/trellis-layouts.json'
const panelSchema = z.object({ kind: z.literal('panel'), id: z.string(), views: z.array(z.string()), selected: z.string() })
type LayoutNodeData = { kind: 'panel'; id: string; views: string[]; selected: string }
  | { kind: 'split'; id: string; axis: 'x' | 'y'; weights: number[]; children: LayoutNodeData[] }
  | { kind: 'stage'; id: string; child?: LayoutNodeData }
const nodeSchema: z.ZodType<LayoutNodeData> = z.lazy(() => z.discriminatedUnion('kind', [
  panelSchema,
  z.object({ kind: z.literal('split'), id: z.string(), axis: z.enum(['x', 'y']), weights: z.array(z.number().positive()), children: z.array(nodeSchema) }),
  z.object({ kind: z.literal('stage'), id: z.string(), child: nodeSchema.optional() }),
]))
const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
const layerSchema = z.enum(['stage', 'overlay'])
const documentSchema = z.object({
  schema: z.literal(1), version: z.union([z.string(), z.number()]).optional(), root: nodeSchema.nullable(),
  floating: z.array(z.object({ panel: panelSchema, rect: rectSchema, z: z.number(), layer: layerSchema })),
  hidden: z.array(z.object({ panel: panelSchema, restore: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('floating'), rect: rectSchema, layer: layerSchema }),
    z.object({ kind: z.literal('docked'), beside: z.string(), edge: z.enum(['left', 'right', 'top', 'bottom']), share: z.number().positive() }),
    z.object({ kind: z.literal('tab'), panel: z.string() }),
  ]) })),
  views: z.record(z.string(), z.object({ type: z.literal('xaihi-node'), params: z.record(z.string(), z.unknown()).optional(), title: z.string().optional() })),
  navigation: z.object({ frame: z.array(z.string()).optional(), framings: z.array(z.object({ id: z.string(), name: z.string().max(80), frame: z.array(z.string()) })).optional() }).optional(),
})
export const trellisRecordSchema = z.object({
  revision: z.number().int().nonnegative(), updatedAt: z.number(), writer: z.string().max(120),
  navigation: z.enum(['focus', 'free']), document: documentSchema,
})
export type TrellisRecord = z.infer<typeof trellisRecordSchema>
export const trellisDomain = defineDomain({
  name: 'xaihi_trellis', version: 1,
  tables: { layouts: domainTable<string, TrellisRecord>(trellisRecordSchema) },
})
interface LayoutTable { get(key: string): TrellisRecord | undefined; put(key: string, value: TrellisRecord): Promise<void> }
export interface TrellisDomainFacility {
  open(spec: typeof trellisDomain): Promise<{ table(name: 'layouts'): LayoutTable; close(): Promise<void> }>
}
export interface TrellisStore {
  durable: boolean; reason: string | null
  read(id: string): TrellisRecord | null
  write(id: string, input: Omit<TrellisRecord, 'revision' | 'updatedAt'>, expectedRevision: number): Promise<{ conflict: boolean; layout: TrellisRecord }>
  close(): Promise<void>
}
export async function openTrellisStore(facility?: TrellisDomainFacility): Promise<TrellisStore> {
  let reason: string | null = facility ? null : 'storageDomain service is absent'
  let domain: Awaited<ReturnType<TrellisDomainFacility['open']>> | undefined
  try { domain = await facility?.open(trellisDomain) } catch (error) { reason = String(error) }
  const memory = new Map<string, TrellisRecord>()
  const table = domain?.table('layouts') ?? { get: (id: string) => memory.get(id), put: async (id: string, value: TrellisRecord) => { memory.set(id, value) } }
  // A read/check/write must be one operation, including while DSH's put is pending.
  let queue: Promise<unknown> = Promise.resolve()
  return {
    durable: Boolean(domain), reason,
    read: (id) => table.get(id) ?? null,
    write(id, input, expectedRevision) {
      const operation = queue.then(async () => {
        const previous = table.get(id)
        if ((previous?.revision ?? 0) !== expectedRevision) {
          if (!previous) throw new Error('Xaihi layout revision is unavailable')
          return { conflict: true, layout: previous }
        }
        const layout = trellisRecordSchema.parse({ ...input, revision: expectedRevision + 1, updatedAt: Date.now() })
        await table.put(id, layout)
        return { conflict: false, layout }
      })
      queue = operation.catch(() => {})
      return operation
    },
    async close() { await queue; await domain?.close() },
  }
}
const writeSchema = trellisRecordSchema.omit({ revision: true, updatedAt: true }).extend({ expectedRevision: z.number().int().nonnegative() })
const MAX_BYTES = 512 * 1024
export function trellisLayoutsHandler(storePromise: Promise<TrellisStore>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id')
    if (!id || !/^[\w-]{1,120}$/.test(id)) { send(400, { error: 'Xaihi workspace id is invalid' }); return }
    const store = await storePromise
    const status = { durable: store.durable, reason: store.reason }
    if (req.method === 'GET') { send(200, { ...status, layout: store.read(id) }); return }
    if (req.method !== 'PUT') { send(405, { error: 'Xaihi layouts accept GET or PUT' }); return }
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk); size += buffer.length
        if (size > MAX_BYTES) { send(413, { error: 'Xaihi layout exceeds 512 KiB' }); return }
        chunks.push(buffer)
      }
      const parsed = writeSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      if (!parsed.success) { send(400, { error: 'Xaihi layout document is invalid' }); return }
      const { expectedRevision, ...input } = parsed.data
      const result = await store.write(id, input, expectedRevision)
      send(result.conflict ? 409 : 200, { ...status, ...result, ...(result.conflict ? { error: 'LAYOUT_CONFLICT' } : {}) })
    } catch (error) { send(error instanceof SyntaxError ? 400 : 500, { error: 'Xaihi layout could not be saved', detail: String(error) }) }
  }
}
