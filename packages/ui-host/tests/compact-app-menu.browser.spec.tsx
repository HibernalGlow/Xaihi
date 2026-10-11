import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppCompactMenu } from '@/components/workspace/AppCompactMenu'
import { initI18n } from '@/i18n'

const route = vi.hoisted(() => vi.fn())
vi.mock('nuqs', async () => ({ ...await vi.importActual<typeof import('nuqs')>('nuqs'), useQueryStates: () => [{}, route] }))
await initI18n('zh')
const commands = { onSettings: vi.fn(), onRegistry: vi.fn(), onOperations: vi.fn(), onHistory: vi.fn(), onDeletions: vi.fn(), onDashboard: vi.fn(), onDevTools: vi.fn(), onHazard: vi.fn(), onExit: vi.fn(), onView: vi.fn(), onLayout: vi.fn() }
function setup(loop = false) {
  render(<AppCompactMenu version="0.5.0" hazardMode={false} viewMode="cards" cardLayout="trellis" loop={loop}
    views={[{ key: 'cards', labelKey: 'topbar:viewMode.cards' }, { key: 'flow', labelKey: 'topbar:viewMode.flow' }, { key: 'lane', labelKey: 'topbar:viewMode.lane' }]}
    layouts={[{ key: 'focus', labelKey: 'topbar:cardLayout.focus' }, { key: 'trellis', labelKey: 'topbar:cardLayout.trellis' }]} {...commands} />)
  const button = screen.getByTestId('compact-app-menu')
  button.setPointerCapture = vi.fn(); button.hasPointerCapture = () => false
  return button
}
const point = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y })
const root = (key: string) => document.querySelector<HTMLButtonElement>(`[data-app-command="${key}"]`)!
const child = (key: string) => document.querySelector<HTMLButtonElement>(`[data-xaihi-picker-child="${key}"]`)!
beforeEach(() => { Object.values(commands).forEach(fn => fn.mockClear()); route.mockClear() })
afterEach(cleanup)
describe('vertical application picker', () => {
  it('keeps the application commands, vertical rows, brand trigger and nested panel/layout choices', async () => {
    const button = setup(); fireEvent.click(button)
    expect(button.textContent).toContain('XAIHI')
    expect(document.querySelectorAll('[data-app-command]')).toHaveLength(12)
    expect(document.querySelector('[data-xaihi-view-dot]')).toBeNull()
    await waitFor(() => expect(root('settings').getBoundingClientRect().top).toBeGreaterThan(0))
    const first = root('settings').getBoundingClientRect(), second = root('views').getBoundingClientRect()
    expect(second.top).toBeGreaterThan(first.bottom); expect(second.left).toBe(first.left)
    fireEvent.click(root('views')); fireEvent.click(child('flow'))
    expect(commands.onView).toHaveBeenCalledExactlyOnceWith('flow')
    fireEvent.click(button); fireEvent.click(root('layouts')); fireEvent.click(child('trellis'))
    expect(commands.onLayout).toHaveBeenCalledExactlyOnceWith('trellis'); expect(commands.onView).toHaveBeenLastCalledWith('cards')
  })
  it('routes exact settings steps and keeps runtime shortcuts', () => {
    const button = setup(); fireEvent.click(button); fireEvent.click(root('settings')); fireEvent.click(child('runtime'))
    fireEvent.click(document.querySelector('[data-xaihi-picker-detail="memory-protection"]')!)
    expect(commands.onSettings).toHaveBeenCalledTimes(1); expect(route).toHaveBeenLastCalledWith({ settings: 'runtime', settingsStep: 'memory-protection' })
    fireEvent.click(button); fireEvent.click(root('runtime')); fireEvent.click(child('connection'))
    expect(route).toHaveBeenLastCalledWith({ settings: 'runtime', settingsStep: 'connection' })
  })
  it('continues down, right into children, left back to root and down to another command before release', async () => {
    const button = setup(); fireEvent.pointerDown(button, point(100,20)); fireEvent.pointerMove(button, point(100,62))
    await waitFor(() => expect(root('views').getBoundingClientRect().top).toBeGreaterThan(0))
    const panel = root('views').getBoundingClientRect(), x = panel.left + panel.width / 2, y = panel.top + panel.height / 2
    fireEvent.pointerMove(button, point(x,y)); fireEvent.pointerMove(button, point(panel.right+60,y))
    await waitFor(() => expect(child('flow')).toBeTruthy())
    await waitFor(() => expect(child('flow').closest('.overflow-hidden')!.getBoundingClientRect().height).toBeGreaterThan(80))
    const flow = child('flow').getBoundingClientRect()
    fireEvent.pointerMove(button, point(flow.left+flow.width/2,flow.top+21))
    await waitFor(() => expect(child('flow').getAttribute('aria-pressed')).toBe('true'))
    const back = root('views').getBoundingClientRect()
    fireEvent.pointerMove(button, point(back.left+back.width/2,y))
    await waitFor(() => expect(document.querySelector('.xaihi-view-menu')?.getAttribute('data-expanded')).toBe('false'))
    const history = root('history').getBoundingClientRect(), hx=history.left+history.width/2, hy=history.top+21
    fireEvent.pointerMove(button, point(hx,hy))
    await waitFor(() => expect(root('history').getAttribute('aria-pressed')).toBe('true'))
    expect(commands.onView).not.toHaveBeenCalled(); expect(commands.onHistory).not.toHaveBeenCalled()
    fireEvent.pointerUp(button, point(hx,hy)); expect(commands.onHistory).toHaveBeenCalledOnce()
  })
  it('keeps a parent menu open when a drag releases on its label', async () => {
    const button = setup(); fireEvent.pointerDown(button, point(100,20)); fireEvent.pointerMove(button, point(100,62))
    await waitFor(() => expect(root('views').getBoundingClientRect().top).toBeGreaterThan(0))
    const row = root('views').getBoundingClientRect(), x = row.left+row.width/2, y = row.top+21
    fireEvent.pointerMove(button, point(x,y)); fireEvent.pointerUp(button, point(x,y))
    await waitFor(() => expect(document.querySelector('.xaihi-view-menu')?.getAttribute('data-expanded')).toBe('true'))
    expect(commands.onView).not.toHaveBeenCalled(); fireEvent.click(child('lane')); expect(commands.onView).toHaveBeenCalledExactlyOnceWith('lane')
  })
  it('supports vertical keyboard selection, child backtracking and cancellation without executing Hazard', async () => {
    const button = setup(); fireEvent.keyDown(button, { key: 'ArrowDown' }); fireEvent.keyDown(button, { key: 'ArrowRight' })
    await waitFor(() => expect(child('cards')).toBeTruthy())
    fireEvent.keyDown(child('cards'), { key: 'ArrowLeft' }); await waitFor(() => expect(root('views')).toHaveFocus())
    fireEvent.keyDown(root('views'), { key: 'ArrowDown' }); expect(root('layouts')).toHaveFocus()
    fireEvent.keyDown(root('layouts'), { key: 'Escape' }); await waitFor(() => expect(document.querySelector('.xaihi-view-menu')).toBeNull())
    fireEvent.click(button); fireEvent.click(root('hazard')); expect(commands.onHazard).toHaveBeenCalledOnce()
    expect(commands.onExit).not.toHaveBeenCalled()
  })
})
