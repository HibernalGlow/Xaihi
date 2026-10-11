import { sanitize, type LayoutDocument, type LayoutNode, type PanelNode } from '@danfessler/trellis'

export const TRELLIS_NODE_TYPE = 'xaihi-node'
export interface TrellisComponent { id: string; moduleId: string }
export const trellisViewId = (componentId: string) => `xaihi-view-${componentId}`
const panel = (component: TrellisComponent): PanelNode => ({
  kind: 'panel', id: `xaihi-panel-${component.id}`, views: [trellisViewId(component.id)], selected: trellisViewId(component.id),
})
/** A balanced recursive starting layout; user-created groups are never rebuilt from node order. */
function branch(components: TrellisComponent[], depth = 0): LayoutNode | null {
  if (!components.length) return null
  if (components.length === 1) return panel(components[0])
  const middle = Math.ceil(components.length / 2)
  return { kind: 'split', id: `xaihi-split-${components[0].id}-${depth}`, axis: depth % 2 ? 'y' : 'x',
    weights: [middle / components.length, (components.length - middle) / components.length],
    children: [branch(components.slice(0, middle), depth + 1)!, branch(components.slice(middle), depth + 1)!] }
}
export function initialTrellisDocument(components: TrellisComponent[]): LayoutDocument {
  const child = branch(components)
  return { schema: 1, version: 1, root: { kind: 'stage', id: 'xaihi-stage', ...(child ? { child: child as Exclude<LayoutNode, { kind: 'stage' }> } : {}) },
    floating: [], hidden: [], views: Object.fromEntries(components.map((c) => [trellisViewId(c.id), { type: TRELLIS_NODE_TYPE, params: { componentId: c.id, moduleId: c.moduleId } }])) }
}
/** Drop unavailable instances, retain docking/hidden/floating positions, and append only new instances. */
export function reconcileTrellisDocument(document: LayoutDocument, components: TrellisComponent[]): LayoutDocument {
  const wanted = new Map(components.map((c) => [trellisViewId(c.id), c]))
  const views = Object.fromEntries(Object.entries(document.views).filter(([id, view]) => wanted.has(id) && view.type === TRELLIS_NODE_TYPE)
    .map(([id, view]) => [id, { ...view, params: { ...view.params, componentId: wanted.get(id)!.id, moduleId: wanted.get(id)!.moduleId } }]))
  let next = sanitize({ ...document, views }, (type) => type === TRELLIS_NODE_TYPE)
  const missing = components.filter((c) => !next.views[trellisViewId(c.id)])
  if (missing.length) {
    const addition = initialTrellisDocument(missing)
    const fresh = (addition.root as { child?: LayoutNode }).child
    const root = next.root
    if (root?.kind === 'stage') {
      next = { ...next, root: { ...root, child: root.child ? { kind: 'split', id: `xaihi-append-${missing[0].id}`, axis: 'x', weights: [3, 1], children: [root.child, fresh!] } : fresh as PanelNode } }
    } else {
      next = { ...next, root: root ? { kind: 'split', id: `xaihi-append-${missing[0].id}`, axis: 'x', weights: [3, 1], children: [root, addition.root!] } : addition.root }
    }
    next.views = { ...next.views, ...addition.views }
    next = sanitize(next, (type) => type === TRELLIS_NODE_TYPE)
  }
  return JSON.stringify(next) === JSON.stringify(document) ? document : next
}
/** Untrusted domain JSON goes through the upstream repair function, with an application type fence. */
export function readTrellisDocument(value: unknown): LayoutDocument | null {
  if (!value || typeof value !== 'object') return null
  const doc = value as LayoutDocument
  if (doc.schema !== 1 || (doc.version !== undefined && doc.version !== 1) || !doc.views || Array.isArray(doc.views) || !Array.isArray(doc.floating) || !Array.isArray(doc.hidden)) return null
  try { return sanitize(doc, (type) => type === TRELLIS_NODE_TYPE) } catch { return null }
}
