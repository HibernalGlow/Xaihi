import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { CompactViewSwitch } from '@/components/workspace/CompactViewSwitch'
import type { ViewMode, CardLayout, DefaultWorkspaceView } from '@/types/workspace'
import { initI18n } from '@/i18n'
await initI18n('zh')
const Icon = ({className}: {className?: string}) => <svg className={className} />
const views = ['cards','flow','lane'].map(key => ({ key: key as ViewMode, labelKey: `topbar:viewMode.${key}`, hintKey: `topbar:viewMode.${key}Hint`, icon: Icon }))
const layouts = ['focus','trellis'].map(key => ({ key: key as CardLayout, labelKey: `topbar:cardLayout.${key}`, hintKey: `topbar:cardLayout.${key}Hint`, icon: Icon }))
afterEach(cleanup)
function setup(initialView: ViewMode = 'cards', initialLoop = false) {
  const onView = vi.fn(), onLayout = vi.fn()
  function Harness() {
    const [view, setView] = useState<ViewMode>(initialView)
    const [loop, setLoop] = useState(initialLoop)
    const [layout, setLayout] = useState<CardLayout>('trellis')
    const [defaultView, setDefaultView] = useState<DefaultWorkspaceView | null>(null)
    return <CompactViewSwitch viewMode={view} cardLayout={layout} views={views} layouts={layouts}
      loop={loop} onLoopChange={setLoop} navigation="free" defaultView={defaultView} onSetDefault={() => setDefaultView(view === "cards" ? { viewMode: view, cardLayout: "trellis", navigation: "free" } : { viewMode: view } as DefaultWorkspaceView)}
      onView={v=>{onView(v);setView(v)}} onLayout={l=>{onLayout(l);setLayout(l)}} />
  }
  render(<Harness />)
  const button = screen.getByTestId('compact-view-switch')
  button.setPointerCapture = vi.fn(); button.hasPointerCapture = () => false
  const pointer = (x: number,y: number) => ({ pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX:x,clientY:y })
  return { button, onView, onLayout, pointer }
}
describe('compact two-level view gesture',()=>{
  it('previews a horizontal list without switching the workspace until release',async()=>{
    const {button,onView,pointer}=setup()
    fireEvent.pointerDown(button,pointer(100,20));fireEvent.pointerMove(button,pointer(156,20))
    await waitFor(()=>expect(document.querySelector('[data-view-mode="flow"]')?.getAttribute('aria-pressed')).toBe('true'))
    expect(onView).not.toHaveBeenCalled()
    fireEvent.pointerUp(button,pointer(156,20))
    expect(onView).toHaveBeenLastCalledWith('flow')
    fireEvent.click(button)
    await waitFor(()=>expect(document.querySelector('.xaihi-view-menu')).toBeNull())
  })
  it('enters card layouts vertically and commits the pointed child only on release',async()=>{
    const {button,onView,onLayout,pointer}=setup()
    fireEvent.pointerDown(button,pointer(100,20));fireEvent.pointerMove(button,pointer(100,70))
    await waitFor(()=>expect(document.querySelector('.xaihi-view-menu [data-card-layout]')).toBeTruthy())
    const row=document.querySelector<HTMLElement>('.xaihi-view-menu [data-card-layout="focus"]')!
    await waitFor(()=>expect(row.getBoundingClientRect().height).toBeGreaterThan(0))
    const y=row.getBoundingClientRect().top + row.getBoundingClientRect().height/2
    fireEvent.pointerMove(button,pointer(100,y))
    expect(onView).not.toHaveBeenCalled();expect(onLayout).not.toHaveBeenCalled()
    fireEvent.pointerUp(button,pointer(100,y))
    expect(onView).toHaveBeenLastCalledWith('cards');expect(onLayout).toHaveBeenLastCalledWith('focus')
  })
  it('cancels a preview without changing either mode',async()=>{
    const {button,onView,onLayout,pointer}=setup()
    fireEvent.pointerDown(button,pointer(100,20));fireEvent.pointerMove(button,pointer(156,20));fireEvent.pointerCancel(button,pointer(156,20))
    expect(onView).not.toHaveBeenCalled();expect(onLayout).not.toHaveBeenCalled()
  })
  it('discards a drag when Escape is pressed before release', async () => {
    const {button,onView,onLayout,pointer}=setup()
    fireEvent.pointerDown(button,pointer(100,20));fireEvent.pointerMove(button,pointer(156,20))
    fireEvent.keyDown(button,{key:'Escape'});fireEvent.pointerUp(button,pointer(156,20))
    expect(onView).not.toHaveBeenCalled();expect(onLayout).not.toHaveBeenCalled()
    await waitFor(()=>expect(document.querySelector('.xaihi-view-menu')).toBeNull())
  })
  it('returns upward from children and continues horizontally in the same press', async () => {
    const { button, onView, onLayout, pointer } = setup()
    fireEvent.pointerDown(button, pointer(100, 20)); fireEvent.pointerMove(button, pointer(100, 70))
    await waitFor(() => expect(document.querySelector('.xaihi-view-menu [data-card-layout]')).toBeTruthy())
    const row = document.querySelector<HTMLElement>('[data-card-layout="focus"]')!
    await waitFor(() => expect(row.getBoundingClientRect().height).toBeGreaterThan(0))
    fireEvent.pointerMove(button, pointer(100, row.getBoundingClientRect().top + 20))
    fireEvent.pointerMove(button, pointer(100, 20))
    fireEvent.pointerMove(button, pointer(156, 20))
    await waitFor(() => expect(document.querySelector('[data-view-mode="flow"]')?.getAttribute('aria-pressed')).toBe('true'))
    expect(onView).not.toHaveBeenCalled()
    fireEvent.pointerUp(button, pointer(156, 20))
    expect(onView).toHaveBeenLastCalledWith('flow')
    expect(onLayout).not.toHaveBeenCalled()
  })
  it.each([
    ['cards', false, -56, 'cards'], ['lane', false, 56, 'lane'],
    ['cards', true, -56, 'lane'], ['lane', true, 56, 'cards'],
  ] as const)('boundary from %s with loop=%s and dx=%s selects %s', async (initialView, loop, dx, expected) => {
    const {button,onView,pointer}=setup(initialView,loop)
    fireEvent.pointerDown(button,pointer(100,20));fireEvent.pointerMove(button,pointer(100+dx,20))
    await waitFor(()=>expect(document.querySelector(`[data-view-mode="${expected}"]`)?.getAttribute('aria-pressed')).toBe('true'))
    expect(onView).not.toHaveBeenCalled()
    fireEvent.pointerUp(button,pointer(100+dx,20))
    expect(onView).toHaveBeenLastCalledWith(expected)
  })
  it('starts with looping off and enables it from the picker', async () => {
    const {button,onView,pointer}=setup('lane')
    fireEvent.click(button)
    const toggle = await screen.findByRole('switch', {name:'循环切换'})
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(button,{key:'Escape'})
    fireEvent.pointerDown(button,pointer(100,20));fireEvent.pointerMove(button,pointer(156,20));fireEvent.pointerUp(button,pointer(156,20))
    expect(onView).toHaveBeenLastCalledWith('cards')
  })
  it('sets the complete current combination as startup default in the footer', async () => {
    const { button } = setup()
    fireEvent.click(button)
    const save = await screen.findByRole('button', { name: '将当前视图设为启动默认' })
    expect(save.textContent).toContain('自由缩放')
    fireEvent.click(save)
    expect(screen.getByText('当前视图已是启动默认')).toBeTruthy()
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })

})
