import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Md3eManager } from '../../../plugins/shellect/frontend/Md3eManager'
import type { ShellectCallInput, ShellectCallResult } from '../../../plugins/shellect/frontend/types'
import type { ShellectManagerCatalog } from '../../../plugins/shellect/src/manager'

const catalog: ShellectManagerCatalog = {
  platform: 'darwin',
  hostPlatform: 'darwin',
  title: 'macOS',
  enabled: true,
  namespace: 'xaihi-shellect',
  revision: 7,
  writable: true,
  settingsReason: '',
  policies: {},
  actions: [{
    id: 'lookup',
    nodeId: 'xaihi-findz',
    title: 'Find in library',
    sourceTitle: 'Findz',
    selection: 'files',
    mutates: false,
    registered: true,
    supported: true,
    enabled: true,
    order: 0,
  }],
}

const theme = {
  '--xaihi-surface': '#f8f6fc',
  '--xaihi-on-surface': '#1c1b20',
  '--xaihi-on-surface-variant': '#49464f',
  '--xaihi-outline': '#797680',
  '--xaihi-primary': '#6045a8',
  '--xaihi-on-primary': '#ffffff',
  '--xaihi-secondary-container': '#e9ddff',
  '--xaihi-on-secondary-container': '#24134f',
  '--xaihi-error': '#ba1a1a',
  '--xaihi-md3e-surface': '#f8f6fc',
  '--xaihi-md3e-surface-lowest': '#ffffff',
  '--xaihi-md3e-surface-low': '#f1eff7',
  '--xaihi-md3e-surface-high': '#e9e6ef',
  '--xaihi-md3e-primary': '#6045a8',
  '--xaihi-md3e-on-primary': '#ffffff',
  '--xaihi-md3e-primary-container': '#e9ddff',
  '--xaihi-md3e-on-primary-container': '#24134f',
  '--xaihi-md3e-secondary-container': '#e9ddff',
  '--xaihi-md3e-on-secondary-container': '#24134f',
  '--xaihi-md3e-tertiary-container': '#dce2ff',
  '--xaihi-md3e-on-tertiary-container': '#171b39',
  '--xaihi-md3e-error': '#ba1a1a',
} as React.CSSProperties & Record<`--${string}`, string>

afterEach(() => cleanup())

describe('Shellect MD3E browser layout', () => {
  it('fits the 240px node surface, scrolls internally, and detects a forced overflow', async () => {
    const call = async (_input: ShellectCallInput): Promise<ShellectCallResult> => ({ success: true, data: catalog })
    const { container } = render(
      <div style={{ ...theme, width: 240, height: 640, containerType: 'size', overflow: 'hidden' }}>
        <Md3eManager call={call} compact />
      </div>,
    )

    await screen.findByText('macOS · 可写')

    const surface = container.querySelector<HTMLElement>('[data-shellect-scroll]')
    expect(surface).not.toBeNull()
    const frame = surface as HTMLElement
    const bounds = frame.getBoundingClientRect()
    expect(bounds.width).toBeCloseTo(240, 0)
    expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth + 1)
    expect(frame.querySelector('[data-shellect-stats]')?.getBoundingClientRect().width).toBeLessThanOrEqual(bounds.width + 1)

    const overflowing = () => [...frame.querySelectorAll<HTMLElement>('*')].filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
    })
    expect(overflowing()).toEqual([])

    const rogue = document.createElement('div')
    rogue.dataset.testid = 'positive-control-overflow'
    rogue.style.cssText = 'width: 500px; height: 2px; flex: 0 0 auto;'
    frame.append(rogue)
    expect(overflowing()).toContain(rogue)
    rogue.remove()

    expect(frame.scrollHeight).toBeGreaterThan(frame.clientHeight)
    frame.scrollTop = 120
    await waitFor(() => expect(frame.scrollTop).toBeGreaterThan(0))
    expect(document.scrollingElement?.scrollTop ?? 0).toBe(0)
    expect(getComputedStyle(frame).backgroundColor).toBe('rgb(241, 239, 247)')
    expect(frame.querySelector('button[aria-label="重新读取 Shellect catalog"]')).not.toBeNull()
    expect(frame.querySelector('input[aria-label="MD3E 动作名称 · lookup"]')).not.toBeNull()
  })
})
