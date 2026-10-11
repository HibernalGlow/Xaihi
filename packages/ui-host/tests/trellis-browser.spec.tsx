import { useEffect, useState, createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Workspace, ViewType, useView } from '@danfessler/trellis-react'
import type { LayoutDocument, WorkspaceHandle } from '@danfessler/trellis'
import '@danfessler/trellis/style.css'
import { initialTrellisDocument, TRELLIS_NODE_TYPE } from '@/lib/trellis/document'

const mounts = new Map<string, number>()
function StatefulNode() {
  const view = useView<{ componentId: string }>()
  const [value, setValue] = useState('')
  useEffect(() => { mounts.set(view.id, (mounts.get(view.id) ?? 0) + 1) }, [])
  return <div data-testid={`node-${view.params.componentId}`} style={{ height: '100%', overflow: 'auto' }}>
    <label>{view.params.componentId}<input aria-label={`editor-${view.params.componentId}`} value={value} onChange={(e) => setValue(e.target.value)} /></label>
    <div style={{ height: 2000 }}>Scrollable node content</div>
  </div>
}
afterEach(() => { cleanup(); mounts.clear() })
describe('Trellis original engine in Chromium', () => {
  it('preserves the same editable DOM through mode switches, tabs, floats, hiding, restoration and controlled reload', async () => {
    const handle = createRef<WorkspaceHandle>()
    let changeMode!: (mode: 'focus' | 'free') => void
    let replaceDocument!: (doc: LayoutDocument) => void
    function Harness() {
      const [document, setDocument] = useState(() => initialTrellisDocument(['a','b','c','d'].map((id) => ({ id, moduleId: 'test-node' }))))
      const [mode, setMode] = useState<'focus' | 'free'>('focus')
      changeMode = setMode; replaceDocument = setDocument
      return <div style={{ width: 1100, height: 720 }}><Workspace ref={handle} document={document} onDocumentChange={setDocument} navigation={mode} motion="reduced">
        <ViewType id={TRELLIS_NODE_TYPE} title="Node" minSize={{ width: 480, height: 320 }} scaling="interactive" gestures="content"><StatefulNode /></ViewType>
      </Workspace></div>
    }
    render(<Harness />)
    await waitFor(() => expect(handle.current).toBeTruthy())
    const input = screen.getByLabelText('editor-a') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'retain my edits' } })
    const ws = handle.current!
    await act(async () => { changeMode('free') })
    expect(screen.getByLabelText('editor-a')).toBe(input)
    await act(async () => { ws.dock('xaihi-view-b', { into: 'xaihi-panel-a' }) })
    expect(ws.getDocument().views['xaihi-view-b']).toBeTruthy()
    await act(async () => { ws.select('xaihi-view-a'); ws.float('xaihi-view-a', { x: .1, y: .1, w: .6, h: .7 }) })
    expect(ws.getDocument().floating).toHaveLength(1)
    await act(async () => { ws.hide('xaihi-view-a') })
    expect(ws.getDocument().hidden).toHaveLength(1)
    await act(async () => { ws.restore(ws.getDocument().hidden[0]!.panel.id) })
    await act(async () => { ws.dock('xaihi-view-a', 'stage'); changeMode('focus') })
    await act(async () => { ws.navigation.frame('xaihi-view-a'); ws.navigation.framings.save('Editing') })
    const saved = JSON.parse(JSON.stringify(ws.getDocument())) as LayoutDocument
    expect(saved.navigation?.framings?.[0]?.name).toBe('Editing')
    await act(async () => { replaceDocument(saved); changeMode('free') })
    expect(screen.getByLabelText('editor-a')).toBe(input)
    expect(input.value).toBe('retain my edits')
    expect(mounts.get('xaihi-view-a')).toBe(1)
    expect(mounts.size).toBe(4)
    const camera = { ...ws.navigation.camera }
    const scroller = screen.getByTestId('node-a')
    fireEvent.wheel(scroller, { deltaY: 80 })
    expect(ws.navigation.camera).toEqual(camera)
    expect(getComputedStyle(input).pointerEvents).not.toBe('none')
  })
})
