import type { LayoutDocument } from '@danfessler/trellis'
import { readTrellisDocument } from '@/lib/trellis/document'
export type TrellisNavigation = 'focus' | 'free'
export interface TrellisLayoutRecord { revision: number; updatedAt: number; writer: string; navigation: TrellisNavigation; document: LayoutDocument }
export interface TrellisLayoutResponse { durable: boolean; reason: string | null; layout: TrellisLayoutRecord | null; conflict?: boolean; available?: boolean }
export function trellisLayoutEndpoint(workspaceId: string): string | null {
  const boot = (globalThis as { __XAIHI_UI__?: { apiBase: string } }).__XAIHI_UI__
  return boot ? `${boot.apiBase}/trellis-layouts.json?id=${encodeURIComponent(workspaceId)}` : null
}
export async function requestTrellisLayout(endpoint: string, input?: { document: LayoutDocument; navigation: TrellisNavigation; expectedRevision: number; writer: string }): Promise<TrellisLayoutResponse> {
  const response = await fetch(endpoint, { method: input ? 'PUT' : 'GET', headers: input ? { 'content-type': 'application/json' } : undefined,
    body: input ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(10000) })
  if (response.status === 404 && !input) return { available: false, durable: false, reason: 'LAYOUT_SERVICE_UNAVAILABLE', layout: null }
  const body = await response.json().catch(() => { throw new Error(`Xaihi layout storage: HTTP ${response.status}`) }) as TrellisLayoutResponse & { error?: string; detail?: string }
  if (!response.ok && response.status !== 409) throw new Error(body.detail ?? body.error ?? `HTTP ${response.status}`)
  if (typeof body.durable !== 'boolean' || ((input || response.status === 409) && !body.layout)) throw new Error('Xaihi layout storage response is invalid')
  if (body.layout) {
    const document = readTrellisDocument(body.layout.document)
    if (!document || !Number.isSafeInteger(body.layout.revision) || body.layout.revision < 1 || typeof body.layout.writer !== 'string' || !Number.isFinite(body.layout.updatedAt) || !['focus', 'free'].includes(body.layout.navigation)) throw new Error('Xaihi stored layout is invalid')
    body.layout = { ...body.layout, document }
  }
  return { ...body, conflict: response.status === 409 }
}
