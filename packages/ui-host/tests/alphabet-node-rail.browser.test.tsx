import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AlphabetNodeRail } from '@/components/workspace/AlphabetNodeRail'
import { initI18n } from '@/i18n'
import '@/index.css'

const { appearance, actions, openComponent } = vi.hoisted(() => ({
  appearance: {
    activeWorkspaceId: 'launcher-test', viewMode: 'cards', alphabetIndexVisible: true,
    alphabetIndexOpacity: 93, alphabetIndexStyle: 'solid', alphabetIndexWaveIntensity: 69,
    alphabetIndexHideEmpty: true, alphabetIndexDirectDeploySingle: true, zCounter: 0,
  },
  actions: { deployComponent: vi.fn(), ensureComponent: vi.fn(), removeComponent: vi.fn() },
  openComponent: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceActions: () => actions,
  useWorkspaceShallowSelector: (selector: (state: typeof appearance) => unknown) => selector(appearance),
}))
vi.mock('@/hooks/useWindowControls', () => ({ useWindowControls: () => ({ openComponent }) }))
vi.mock('@/plugins/useContributedModules', () => ({ useContributedModules: () => [] }))

beforeAll(async () => { await initI18n('zh') })
afterEach(() => { cleanup(); vi.clearAllMocks() })

function setup() {
  render(<div style={{ position: 'relative', width: 800, height: 480 }}><AlphabetNodeRail /></div>)
  return screen.getByTestId('alphabet-node-rail')
}

function enter(element: HTMLElement) { fireEvent.pointerEnter(element, { pointerType: 'mouse' }) }
function leave(element: HTMLElement) { fireEvent.pointerLeave(element, { pointerType: 'mouse' }) }

async function expand() {
  const rail = setup()
  enter(screen.getByTestId('alphabet-node-capsule'))
  await waitFor(() => expect(rail.getAttribute('data-expanded')).toBe('true'))
  return rail
}

describe('buoyant alphabetical node launcher', () => {
  it('rests as a small capsule and floats into a wider rail without opening results yet', async () => {
    const rail = setup()
    const surface = screen.getByTestId('alphabet-node-surface')
    expect(rail.getAttribute('data-expanded')).toBe('false')
    expect(screen.getByTestId('alphabet-node-capsule').textContent).toContain('节点')
    expect(document.getElementById('alphabet-node-letters')?.hasAttribute('inert')).toBe(true)
    await waitFor(() => expect(surface.getBoundingClientRect().width).toBeCloseTo(112, 0))
    const restingTop = surface.getBoundingClientRect().top
    enter(surface)
    await waitFor(() => expect(surface.getBoundingClientRect().width).toBeGreaterThan(300))
    expect(surface.getBoundingClientRect().top).toBeLessThan(restingTop)
    expect(screen.queryByTestId('alphabet-node-results')).toBeNull()
    expect(screen.queryByTestId('alphabet-node-letter-Z')).toBeNull()
    leave(surface)
    await waitFor(() => expect(rail.getAttribute('data-expanded')).toBe('false'))
    await waitFor(() => expect(surface.getBoundingClientRect().width).toBeCloseTo(112, 0))
  })

  it('stays afloat while crossing into the portalled node list, then sinks after leaving', async () => {
    const rail = await expand()
    enter(screen.getByTestId('alphabet-node-letter-B'))
    const results = await screen.findByTestId('alphabet-node-results')
    leave(rail)
    enter(results)
    // Longer than the collapse grace period: crossing must cancel the pending close.
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(rail.getAttribute('data-expanded')).toBe('true')
    expect(screen.getByTestId('alphabet-node-result-bitv')).toBeTruthy()
    leave(results)
    await waitFor(() => expect(rail.getAttribute('data-expanded')).toBe('false'))
    await waitFor(() => expect(screen.queryByTestId('alphabet-node-results')).toBeNull())
  })

  it('deploys a node and returns to the capsule with an accessible announcement', async () => {
    const rail = await expand()
    enter(screen.getByTestId('alphabet-node-letter-B'))
    fireEvent.click(await screen.findByTestId('alphabet-node-result-bitv'))
    expect(actions.deployComponent).toHaveBeenCalledWith('bitv', 'cards')
    expect(rail.getAttribute('data-expanded')).toBe('false')
    expect(rail.querySelector('[aria-live="polite"]')?.textContent).toContain('BitV')
    expect(rail.querySelector('[aria-live="polite"]')?.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('keeps the separate-window action from also deploying the node', async () => {
    const rail = await expand()
    enter(screen.getByTestId('alphabet-node-letter-B'))
    const button = await screen.findByTestId('alphabet-node-open-window-bitv')
    fireEvent.pointerDown(button)
    fireEvent.click(button)
    await waitFor(() => expect(openComponent).toHaveBeenCalledOnce())
    expect(actions.ensureComponent).toHaveBeenCalledOnce()
    expect(actions.deployComponent).not.toHaveBeenCalled()
    expect(rail.getAttribute('data-expanded')).toBe('false')
  })

  it('supports keyboard entry, filtered letter navigation, and Escape without reopening', async () => {
    const rail = setup()
    screen.getByTestId('alphabet-node-capsule').focus()
    await waitFor(() => expect(document.activeElement?.getAttribute('data-testid')).toBe('alphabet-node-letter-B'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('data-testid')).toBe('alphabet-node-letter-C')
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement?.getAttribute('data-testid')).toBe('alphabet-node-letter-T')
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement?.getAttribute('data-testid')).toBe('alphabet-node-letter-B')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('data-testid')).toBe('alphabet-node-result-bitv')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(rail.getAttribute('data-expanded')).toBe('false'))
    expect(document.activeElement?.getAttribute('data-testid')).toBe('alphabet-node-capsule')
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(rail.getAttribute('data-expanded')).toBe('false')
  })

  it('retains wheel navigation and clears a pending close when the pointer returns', async () => {
    const rail = await expand()
    fireEvent.wheel(rail, { deltaY: -100 })
    await waitFor(() => expect(screen.getByTestId('alphabet-node-letter-C').getAttribute('aria-selected')).toBe('true'))
    leave(rail)
    enter(rail)
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(rail.getAttribute('data-expanded')).toBe('true')
  })

  it('directly deploys the single node upon clicking the letter when direct deploy is enabled by default', async () => {
    appearance.alphabetIndexDirectDeploySingle = true
    const rail = await expand()
    // Letter B has exactly 1 node (bitv). Clicking letter B directly deploys bitv without needing popover choice.
    fireEvent.click(screen.getByTestId('alphabet-node-letter-B'))
    expect(actions.deployComponent).toHaveBeenCalledWith('bitv', 'cards')
    expect(rail.getAttribute('data-expanded')).toBe('false')
    expect(rail.querySelector('[aria-live="polite"]')?.textContent).toContain('BitV')
  })

  it('opens popover instead of deploying directly when direct deploy switch is turned off', async () => {
    appearance.alphabetIndexDirectDeploySingle = false
    try {
      const rail = await expand()
      fireEvent.click(screen.getByTestId('alphabet-node-letter-B'))
      expect(actions.deployComponent).not.toHaveBeenCalled()
      expect(await screen.findByTestId('alphabet-node-results')).toBeTruthy()
      expect(screen.getByTestId('alphabet-node-result-bitv')).toBeTruthy()
    } finally {
      appearance.alphabetIndexDirectDeploySingle = true
    }
  })

  it('opens popover instead of deploying when a letter has multiple nodes even if direct deploy is enabled', async () => {
    appearance.alphabetIndexDirectDeploySingle = true
    const rail = await expand()
    // Letter S has multiple nodes (SETTINGS, SAMEA, etc.). Clicking letter S must open results rather than deploying.
    fireEvent.click(screen.getByTestId('alphabet-node-letter-S'))
    expect(actions.deployComponent).not.toHaveBeenCalled()
    expect(await screen.findByTestId('alphabet-node-results')).toBeTruthy()
  })
})
