// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useTheme } from 'next-themes'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { KisakiAppearanceProvider, useKisakiAppearance } from './KisakiAppearance'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { NodeUiConfigStore } from '@/nodes/shared/NodeUiConfigContext'

function Probe() {
  const appearance = useKisakiAppearance()
  const { forcedTheme } = useTheme()
  return <div>
    <output data-testid="ready">{String(appearance.ready)}</output>
    <output data-testid="mode">{appearance.mode}</output>
    <output data-testid="design">{appearance.effectiveDesignTheme?.id}</output>
    <button onClick={() => appearance.setDesignTheme("swiss")}>swiss</button>
    <button onClick={() => appearance.setDesignTheme("workspace")}>inherit-design</button>
    <output data-testid="palette">{appearance.colorTheme}</output>
    <output data-testid="effective">{forcedTheme}</output>
    {appearance.error && <p role="alert">{appearance.error}</p>}
    <button onClick={() => appearance.setMode('dark')}>dark</button>
    <button onClick={() => appearance.setColorTheme('violet')}>violet</button>
    <button onClick={() => { appearance.setMode('workspace'); appearance.setColorTheme('workspace') }}>reset</button>
  </div>
}

afterEach(cleanup)

describe('Kisaki standalone appearance', () => {
  test('overrides the shared design theme only for the product and restores live inheritance', async () => {
    const globalDesign = useWorkspaceStore.getState().designTheme
    let saved: unknown = {}
    const store: NodeUiConfigStore = { read: async () => saved, write: async (_node, value) => { saved = value } }
    render(<KisakiAppearanceProvider store={store}><Probe /></KisakiAppearanceProvider>)
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('design').textContent).toBe(globalDesign.id)
    fireEvent.click(screen.getByRole('button', { name: 'swiss' }))
    await waitFor(() => expect(saved).toMatchObject({ appearance: { designTheme: 'swiss' } }))
    expect(screen.getByTestId('design').textContent).toBe('swiss')
    expect(useWorkspaceStore.getState().designTheme).toBe(globalDesign)
    fireEvent.click(screen.getByRole('button', { name: 'inherit-design' }))
    await waitFor(() => expect(saved).toMatchObject({ appearance: { designTheme: 'workspace' } }))
    expect(screen.getByTestId('design').textContent).toBe(globalDesign.id)
  })
  test('loads, merges, serializes writes and restores workspace appearance without changing the global preference', async () => {
    const writes: unknown[] = []
    let saved = { existingNodePreference: true, appearance: { mode: 'light', colorTheme: 'amber' } }
    const store: NodeUiConfigStore = {
      read: vi.fn(async () => saved),
      write: vi.fn(async (_node, value) => { writes.push(value); saved = value as typeof saved }),
    }
    localStorage.setItem('theme', 'system')
    const mounted = render(<KisakiAppearanceProvider store={store} workspaceMode="system"><Probe /></KisakiAppearanceProvider>)
    await waitFor(() => expect(screen.getByTestId('effective').textContent).toBe('light'))
    expect(screen.getByTestId('palette').textContent).toBe('amber')
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    fireEvent.click(screen.getByRole('button', { name: 'violet' }))
    await waitFor(() => expect(writes.length).toBe(2))
    expect(writes.at(-1)).toEqual({ existingNodePreference: true, appearance: { mode: 'dark', colorTheme: 'violet' } })
    expect(screen.getByTestId('effective').textContent).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('system')
    mounted.unmount()
    expect(document.documentElement.dataset.standalonePalette).toBeUndefined()
    render(<KisakiAppearanceProvider store={store} workspaceMode="system"><Probe /></KisakiAppearanceProvider>)
    await waitFor(() => expect(screen.getByTestId('palette').textContent).toBe('violet'))
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    await waitFor(() => expect(writes.length).toBe(4))
    expect(writes.at(-1)).toEqual({ existingNodePreference: true, appearance: { mode: 'workspace', colorTheme: 'workspace' } })
    expect(screen.getByTestId('effective').textContent).toBe('system')
  })

  test('shows persistence failures instead of silently claiming the preference was saved', async () => {
    const store: NodeUiConfigStore = { read: async () => ({}), write: async () => { throw new Error('SETTINGS_CONFLICT: 读取第 1 版，当前第 2 版') } }
    render(<KisakiAppearanceProvider store={store}><Probe /></KisakiAppearanceProvider>)
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('SETTINGS_CONFLICT'))
  })
})
