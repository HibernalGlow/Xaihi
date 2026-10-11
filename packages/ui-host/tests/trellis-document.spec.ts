import { describe, expect, it } from 'vitest'
import { initialTrellisDocument, reconcileTrellisDocument, readTrellisDocument, trellisViewId } from '@/lib/trellis/document'
import type { LayoutDocument, PanelNode, StageNode } from '@danfessler/trellis'
const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id, moduleId: 'logx' }))
const panel = (id: string): PanelNode => ({ kind: 'panel', id: `panel-${id}`, views: [trellisViewId(id)], selected: trellisViewId(id) })
function organized(): LayoutDocument {
  const doc = initialTrellisDocument(nodes)
  doc.root = { kind: 'stage', id: 'stage', child: { ...panel('a'), views: [trellisViewId('a'), trellisViewId('b')], selected: trellisViewId('b') } }
  doc.floating = [{ panel: panel('c'), rect: { x: .1, y: .2, w: .4, h: .5 }, z: 2, layer: 'overlay' }]
  doc.hidden = [{ panel: panel('d'), restore: { kind: 'tab', panel: 'panel-a' } }]
  doc.navigation = { frame: [trellisViewId('b')], framings: [{ id: 'saved', name: 'editing', frame: [trellisViewId('a'), trellisViewId('b')] }] }
  return doc
}
describe('Trellis instance reconciliation', () => {
  it('starts with recursive alternating splits and one real view per instance', () => {
    const doc = initialTrellisDocument(nodes)
    expect(doc.root).toMatchObject({ kind: 'stage', child: { kind: 'split', axis: 'x', children: [{ kind: 'split', axis: 'y' }, { kind: 'split', axis: 'y' }] } })
    expect(Object.keys(doc.views)).toEqual(['xaihi-view-a', 'xaihi-view-b', 'xaihi-view-c', 'xaihi-view-d'])
    expect(doc.views['xaihi-view-c']?.params).toEqual({ componentId: 'c', moduleId: 'logx' })
  })
  it('does not reset tab groups, selected tabs, hidden panels, floating geometry or viewpoints when node order changes', () => {
    const doc = organized()
    const result = reconcileTrellisDocument(doc, [...nodes].reverse())
    expect(result.root).toEqual(doc.root)
    expect(result.floating).toEqual(doc.floating)
    expect(result.hidden).toEqual(doc.hidden)
    expect(result.navigation).toEqual(doc.navigation)
  })
  it('appends only new instances and removes deleted instances even from hidden/floating groups', () => {
    const result = reconcileTrellisDocument(organized(), [nodes[0]!, nodes[1]!, { id: 'e', moduleId: 'findz' }])
    expect(Object.keys(result.views).sort()).toEqual(['xaihi-view-a', 'xaihi-view-b', 'xaihi-view-e'])
    expect(result.hidden).toEqual([])
    expect(result.floating).toEqual([])
    const stage = result.root as StageNode
    expect(stage.child).toMatchObject({ kind: 'split', children: [{ id: 'panel-a', selected: 'xaihi-view-b' }, { kind: 'panel', selected: 'xaihi-view-e' }] })
  })
  it('repairs missing tab selection but fences unknown types and incompatible document versions', () => {
    const doc = organized()
    ;(doc.root as StageNode).child = { kind: 'panel', id: 'test', selected: 'missing', views: ['xaihi-view-a', 'foreign'] }
    doc.views.foreign = { type: 'unregistered', params: { componentId: 'a' } }
    const result = readTrellisDocument(doc)
    expect((result?.root as StageNode).child).toMatchObject({ selected: 'xaihi-view-a', views: ['xaihi-view-a'] })
    expect(result?.views.foreign).toBeUndefined()
    expect(readTrellisDocument({ ...doc, schema: 2 })).toBeNull()
    expect(readTrellisDocument({ ...doc, version: 42 })).toBeNull()
    expect(readTrellisDocument({ schema: 1, views: [], floating: [], hidden: [] })).toBeNull()
  })
})
