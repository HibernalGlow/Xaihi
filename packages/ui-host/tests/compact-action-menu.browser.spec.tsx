import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ActionView } from '@/actions'
import { ActionCompactMenu } from '@/components/workspace/ActionCompactMenu'
import { initI18n } from '@/i18n'

const mocked = vi.hoisted(() => ({
  views: [] as ActionView[],
  preferences: { wheelActionOrder: [] as string[], wheelHiddenActions: [] as string[], viewSwitchLoop: false },
  execute: vi.fn(() => true), setLoop: vi.fn(),
}))
vi.mock('@/actions', () => ({
  useActionViews: () => mocked.views,
  getActionIcon: () => undefined,
  resolveActionLabel: (key: string) => key,
  executeAction: mocked.execute,
}))
vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceShallowSelector: (selector: (state: typeof mocked.preferences) => unknown) => selector(mocked.preferences),
  useWorkspaceActions: () => ({ setViewSwitchLoop: mocked.setLoop }),
}))
await initI18n('zh')
const context = { viewMode: 'cards' as const, activeOperationCount: 0, devRuntimeActive: true }
const pointer = (x: number, y = 20) => ({ pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y })
function setup() {
  const result = render(<ActionCompactMenu context={context} />)
  const button = screen.getByTestId('compact-action-switch')
  button.setPointerCapture = vi.fn(); button.hasPointerCapture = () => false
  return { button, ...result }
}
beforeEach(() => {
  mocked.views = Array.from({ length: 8 }, (_, i) => ({ id: `action-${i}`, category: 'workspace', labelKey: `Action ${i}`, presentation: 'command', order: i, enabled: true, toggled: false, badge: 0, indicator: 'none' })) as ActionView[]
  mocked.preferences = { wheelActionOrder: [], wheelHiddenActions: [], viewSwitchLoop: false }
  mocked.execute.mockClear(); mocked.setLoop.mockClear()
})
afterEach(cleanup)
describe('top-right shared action picker', () => {
  it('preserves registry order, visibility, disabled state and badges without mounting a pie menu', async () => {
    mocked.preferences.wheelActionOrder = ['action-3', 'action-2']
    mocked.preferences.wheelHiddenActions = ['action-1']
    mocked.views[3]!.badge = 2; mocked.views[2]!.enabled = false
    mocked.views[7]!.presentation = 'popover'
    const { button } = setup(); fireEvent.click(button)
    await screen.findByRole('group', { name: '更多操作' })
    const items = [...document.querySelectorAll<HTMLButtonElement>('[data-action-id]')]
    expect(items.map(item => item.dataset.actionId)).toEqual(['action-3', 'action-2', 'action-0', 'action-4', 'action-5', 'action-6'])
    expect(items[1]!.disabled).toBe(true); expect(button.textContent).toContain('2')
    expect(document.querySelector('[data-testid="action-wheel-anchor"]')).toBeNull()
    fireEvent.click(items[0]!); expect(mocked.execute).toHaveBeenCalledExactlyOnceWith('action-3')
  })
  it('shows a horizontal preview and runs only the released command', async () => {
    const { button } = setup()
    fireEvent.pointerDown(button, pointer(100)); fireEvent.pointerMove(button, pointer(156))
    await waitFor(() => expect(document.querySelector('[data-action-id="action-1"]')?.getAttribute('aria-pressed')).toBe('true'))
    expect(mocked.execute).not.toHaveBeenCalled()
    fireEvent.pointerUp(button, pointer(156))
    expect(mocked.execute).toHaveBeenCalledExactlyOnceWith('action-1')
  })
  it('never executes on a stationary long press', async () => {
    const { button } = setup(); fireEvent.pointerDown(button, pointer(100))
    await screen.findByRole('group', { name: '更多操作' })
    fireEvent.pointerUp(button, pointer(100))
    expect(mocked.execute).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: '更多操作' })).toBeTruthy()
  })
  it.each(['pointercancel', 'Escape'])('cancels a preview via %s without running a command', async cancel => {
    const { button } = setup()
    fireEvent.pointerDown(button, pointer(100)); fireEvent.pointerMove(button, pointer(156))
    await screen.findByRole('group', { name: '更多操作' })
    if (cancel === 'pointercancel') fireEvent.pointerCancel(button, pointer(156))
    else { fireEvent.keyDown(button, { key: 'Escape' }); fireEvent.pointerUp(button, pointer(156)) }
    expect(mocked.execute).not.toHaveBeenCalled()
    await waitFor(() => expect(document.querySelector('.xaihi-view-menu')).toBeNull())
  })
  it('keeps disabled actions disabled when released from a drag', () => {
    mocked.views[1]!.enabled = false
    const { button } = setup()
    fireEvent.pointerDown(button, pointer(100)); fireEvent.pointerMove(button, pointer(156)); fireEvent.pointerUp(button, pointer(156))
    expect(mocked.execute).not.toHaveBeenCalled()
  })
  it.each([false, true])('shares the loop preference, loop=%s', loop => {
    mocked.preferences.viewSwitchLoop = loop
    const { button } = setup()
    fireEvent.pointerDown(button, pointer(100)); fireEvent.pointerMove(button, pointer(44)); fireEvent.pointerUp(button, pointer(44))
    expect(mocked.execute).toHaveBeenCalledExactlyOnceWith(loop ? 'action-7' : 'action-0')
  })
  it('previews with arrow keys, scrolls the last option into view and requires Enter to execute', async () => {
    const { button } = setup(); fireEvent.keyDown(button, { key: 'End' })
    await waitFor(() => expect(document.querySelector('[data-action-id="action-7"]')?.getAttribute('aria-pressed')).toBe('true'))
    const last = document.querySelector<HTMLElement>('[data-action-id="action-7"]')!
    await waitFor(() => expect(last.getBoundingClientRect().right).toBeLessThanOrEqual(last.parentElement!.getBoundingClientRect().right + 1))
    expect(mocked.execute).not.toHaveBeenCalled()
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(mocked.execute).toHaveBeenCalledExactlyOnceWith('action-7')
  })
  it('offers the same looping toggle and disables an empty action list', async () => {
    const { button, rerender } = setup(); fireEvent.click(button)
    const toggle = await screen.findByRole('switch', { name: '循环切换' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle); expect(mocked.setLoop).toHaveBeenCalledExactlyOnceWith(true)
    fireEvent.keyDown(button, { key: 'Escape' }); mocked.views = []
    rerender(<ActionCompactMenu context={context} />)
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })
})
