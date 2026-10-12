import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { ThemeSettings } from '@/components/views/settings/ThemeSettings'
import { SettingsStepCard } from '@/components/views/settings/primitives'
import { parseSettingsStepId, scrollToSettingsStep } from '@/components/views/settings/settingsNavigation'
import { initI18n } from '@/i18n'

const query = vi.hoisted(() => ({ settings: 'runtime' as string | null, settingsStep: 'memory-protection' as string | null, setSettings: vi.fn(), setStep: vi.fn() }))
vi.mock('nuqs', async () => ({ ...await vi.importActual<typeof import('nuqs')>('nuqs'), useQueryState: (key: string) => key === 'settings' ? [query.settings, query.setSettings] : [query.settingsStep, query.setStep] }))
vi.mock('@/nodes/shared/useNodeSurface', () => ({ useNodeSurface: () => ({ mode: 'expanded', height: 900, density: 'roomy', ref: vi.fn() }) }))
vi.mock('@/components/ui/blur-fade', () => ({ BlurFade: ({children}: {children: import('react').ReactNode}) => children }))
vi.mock('@/components/ui/scroll-progress', () => ({ ScrollProgress: () => null }))
vi.mock('@/components/views/settings/SettingsSearch', () => ({ SettingsSearch: () => null }))
vi.mock('@/components/views/settings/RuntimeSection', () => ({ RuntimeSection: () => <><div data-settings-step="connection" /><div data-settings-step="memory-protection" /></> }))
vi.mock('@/components/views/settings/AppearanceSection', () => ({ AppearanceSection: () => <><div data-settings-step="theme" /><div data-settings-step="theme-import" /></> }))
vi.mock('@/components/views/settings/WorkspaceSection', () => ({ WorkspaceSection: () => <div data-settings-step="background" /> }))
vi.mock('@/components/views/settings/ViewSection', () => ({ ViewSection: () => <div data-settings-step="components" /> }))
vi.mock('@/components/views/settings/DataSection', () => ({ DataSection: () => <div data-settings-step="storage" /> }))
await initI18n('zh')
const scrolled = vi.fn()
beforeEach(() => {
  query.settings = 'runtime'; query.settingsStep = 'memory-protection'; query.setSettings.mockClear(); query.setStep.mockClear(); scrolled.mockClear()
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function() { scrolled(this.getAttribute('data-settings-step')) })
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('settings picker route contract', () => {
  it('validates exact steps against their category', () => {
    expect(parseSettingsStepId('runtime','memory-protection')).toBe('memory-protection')
    expect(parseSettingsStepId('appearance','memory-protection')).toBeNull()
    expect(parseSettingsStepId(null,'theme')).toBeNull()
    expect(parseSettingsStepId('runtime','unknown')).toBeNull()
  })
  it('mounts the requested category and scrolls to its exact step', async () => {
    render(<ThemeSettings />)
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith('memory-protection'))
    expect(document.querySelector('[data-settings-active-section="runtime"]')).toBeTruthy()
    expect(document.querySelector('[data-settings-nav-step="memory-protection"]')?.getAttribute('aria-current')).toBe('true')
    expect(document.querySelector('[data-settings-step="theme"]')).toBeNull()
  })
  it('ignores a step from another category and reacts to later route changes', async () => {
    query.settingsStep = 'theme'; const { rerender } = render(<ThemeSettings />)
    expect(scrolled).not.toHaveBeenCalled()
    expect(document.querySelector('[data-settings-nav-step="connection"]')?.getAttribute('aria-current')).toBe('true')
    query.settings = 'appearance'; query.settingsStep = 'theme-import'; rerender(<ThemeSettings />)
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith('theme-import'))
    expect(document.querySelector('[data-settings-step="memory-protection"]')).toBeNull()
  })
  it('reveals an advanced step before scrolling and leaves an already open disclosure open', () => {
    const { container, queryByText } = render(<SettingsStepCard id="theme-import" title="Import" advanced><span>Import controls</span></SettingsStepCard>)
    expect(queryByText('Import controls')).toBeNull()
    act(() => { expect(scrollToSettingsStep(container, 'theme-import')).toBe(true) })
    expect(queryByText('Import controls')).toBeTruthy()
    expect(container.querySelector('[data-settings-step-toggle]')?.getAttribute('aria-expanded')).toBe('true')
    act(() => { scrollToSettingsStep(container, 'theme-import') })
    expect(queryByText('Import controls')).toBeTruthy()
    expect(scrolled).toHaveBeenCalledWith('theme-import')
    expect(scrollToSettingsStep(container, 'memory-protection')).toBe(false)
  })
  it('clears stale steps on category selection and writes exact step links on step selection', () => {
    render(<ThemeSettings />)
    fireEvent.click(document.querySelector('[data-settings-nav-stage="appearance"]')!)
    expect(query.setSettings).toHaveBeenCalledWith('appearance'); expect(query.setStep).toHaveBeenCalledWith(null)
    fireEvent.click(document.querySelector('[data-settings-nav-step="connection"]')!)
    expect(query.setSettings).toHaveBeenLastCalledWith('runtime'); expect(query.setStep).toHaveBeenLastCalledWith('connection')
  })
})
