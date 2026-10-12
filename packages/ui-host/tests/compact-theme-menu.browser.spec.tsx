import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeCompactMenu } from '@/components/workspace/ThemeCompactMenu'
import { DEFAULT_DESIGN_THEME } from '@/lib/design-theme/contract'
import { DESIGN_THEME_ENTRIES } from '@/lib/design-theme/registry'
import { initI18n } from '@/i18n'

const route = vi.hoisted(() => vi.fn())
vi.mock('nuqs', async () => ({ ...await vi.importActual<typeof import('nuqs')>('nuqs'), useQueryStates: () => [{}, route] }))
await initI18n('zh')
const actions = { onColorMode: vi.fn(), onSelection: vi.fn(), onDesignTheme: vi.fn(), onSettings: vi.fn() }
const custom = { name: '我的主题:default', cssVars: { light: { background: '#ffffff', primary: '#3355ff', secondary: '#cccccc', accent: '#00aaaa' }, dark: { background: '#101010', primary: '#99aaff' } } }
const base = { theme: 'wuling' as const, selections: { light: { kind: 'preset', name: 'wuling' }, dark: { kind: 'custom', name: custom.name } } as const,
  customThemes: [custom], designTheme: { ...DEFAULT_DESIGN_THEME, id: 'native' as const }, scheme: 'dark' as const, colorMode: 'system' as const, loop: false }
function setup() {
  render(<ThemeCompactMenu {...base} {...actions} />)
  const button = screen.getByTestId('compact-theme-menu')
  button.setPointerCapture = vi.fn(); button.hasPointerCapture = () => false
  return button
}
const root = (key: string) => document.querySelector<HTMLButtonElement>(`[data-theme-category="${key}"]`)!
const child = (key: string) => [...document.querySelectorAll<HTMLButtonElement>('[data-xaihi-picker-child]')].find(button => button.getAttribute('data-xaihi-picker-child') === key)!
beforeEach(() => { Object.values(actions).forEach(fn => fn.mockClear()); route.mockClear() })
afterEach(cleanup)
describe('shared theme picker', () => {
  it('retains all registered design languages and their current configuration when switching', () => {
    fireEvent.click(setup()); fireEvent.click(root('design'))
    expect(document.querySelectorAll('.xaihi-picker-matrix-lane')[0]!.querySelectorAll('[data-xaihi-picker-child]')).toHaveLength(DESIGN_THEME_ENTRIES.length)
    expect(document.querySelectorAll('.xaihi-picker-matrix-lane')).toHaveLength(3)
    expect(root('design').hasAttribute('aria-haspopup')).toBe(false)
    expect(child('native').dataset.xaihiPickerSelected).toBe('true')
    fireEvent.click(child('md3'))
    expect(actions.onDesignTheme).toHaveBeenCalledWith({ ...base.designTheme, id: 'md3' })
    expect(actions.onSelection).not.toHaveBeenCalled()
  })
  it('shows the active custom theme with dark swatches and writes only the current scheme', async () => {
    const button = setup(); expect(button.getAttribute('aria-label')).toContain(custom.name)
    fireEvent.click(button); fireEvent.click(root('color'))
    const customRow = child(`custom:${custom.name}`)
    expect(customRow.dataset.xaihiPickerSelected).toBe('true')
    expect(customRow.querySelector('[style]')?.getAttribute('style')).toContain('rgb(16, 16, 16)')
    fireEvent.click(customRow)
    expect(actions.onSelection).toHaveBeenCalledWith('dark', { kind: 'custom', name: custom.name })
    await waitFor(() => expect(document.querySelector('.xaihi-view-menu')).toBeNull())
    fireEvent.click(button); fireEvent.click(root('color')); fireEvent.click(child('default'))
    expect(actions.onSelection).toHaveBeenLastCalledWith('dark', { kind: 'none' })
    fireEvent.click(button); fireEvent.click(root('color')); fireEvent.click(child('preset'))
    expect(actions.onSelection).toHaveBeenLastCalledWith('dark', { kind: 'preset', name: 'wuling' })
  })
  it('keeps color modes separate from color selection and routes directly to appearance settings', () => {
    const button = setup(); fireEvent.click(button); fireEvent.click(root('mode'))
    expect(child('system').dataset.xaihiPickerSelected).toBe('true')
    fireEvent.click(child('light')); expect(actions.onColorMode).toHaveBeenCalledWith('light')
    expect(actions.onSelection).not.toHaveBeenCalled()
    fireEvent.click(button); fireEvent.click(screen.getByRole('button', { name: '打开主题设置' }))
    expect(actions.onSettings).toHaveBeenCalledOnce()
    expect(route).toHaveBeenCalledWith({ settings: 'appearance', settingsStep: 'theme' })
  })
  it('uses vertical keys for modes and horizontal keys for options without any submenu', async () => {
    const button = setup(); fireEvent.click(button)
    fireEvent.keyDown(root('design'), { key: 'ArrowRight' })
    expect(child('md3').getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(child('md3'), { key: 'ArrowDown' })
    expect(child(`custom:${custom.name}`).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(child(`custom:${custom.name}`), { key: 'ArrowLeft' })
    expect(child('preset').getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(child('preset'), { key: 'ArrowUp' })
    expect(child('native').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelectorAll('.xaihi-picker-matrix-lane')).toHaveLength(3)
    Object.values(actions).forEach(fn => expect(fn).not.toHaveBeenCalled())
    fireEvent.keyDown(child('native'), { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('.xaihi-view-menu')).toBeNull())
    Object.values(actions).forEach(fn => expect(fn).not.toHaveBeenCalled())
  })
  it('continuously switches vertical modes and horizontal options during one press, then commits on release', async () => {
    const button = setup()
    const point = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y })
    fireEvent.pointerDown(button, point(100,20)); fireEvent.pointerMove(button, point(100,35))
    await waitFor(() => expect(root('mode')).toBeTruthy())
    await waitFor(() => expect(root('mode').getBoundingClientRect().top).toBeGreaterThan(0))
    const design = child('native').getBoundingClientRect(), x = design.left + 20, y = design.top + 19
    fireEvent.pointerMove(button, point(x,y))
    fireEvent.pointerMove(button, point(x+96,y))
    expect(child('md3').getAttribute('aria-pressed')).toBe('true')
    const mode = child('system').getBoundingClientRect(), my = mode.top + 19
    fireEvent.pointerMove(button, point(x+96,my))
    expect(child('system').getAttribute('aria-pressed')).toBe('true')
    const light = child('light').getBoundingClientRect()
    fireEvent.pointerMove(button, point(light.left + light.width / 2, light.top + light.height / 2))
    expect(child('light').getAttribute('aria-pressed')).toBe('true')
    Object.values(actions).forEach(fn => expect(fn).not.toHaveBeenCalled())
    fireEvent.pointerUp(button, point(light.left + light.width / 2, light.top + light.height / 2))
    expect(actions.onColorMode).toHaveBeenCalledWith('light')
    expect(actions.onDesignTheme).not.toHaveBeenCalled()
    await waitFor(() => expect(document.querySelector('.xaihi-view-menu')).toBeNull())
  })
})
