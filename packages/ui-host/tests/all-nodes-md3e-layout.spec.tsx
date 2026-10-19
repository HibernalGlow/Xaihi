import '@/client/generated/client.css'
import '@/index.css'
import { cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { NodeHostApi } from '@xiranite/contract'
import { afterEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Component as Bitv } from '@/nodes/bitv/Component'
import { Component as Classf } from '@/nodes/classf/Component'
import { Component as Classq } from '@/nodes/classq/Component'
import { Component as Cleanf } from '@/nodes/cleanf/Component'
import { Component as Crashu } from '@/nodes/crashu/Component'
import { Component as Dissolvef } from '@/nodes/dissolvef/Component'
import { Component as Enginev } from '@/nodes/enginev/Component'
import { Component as Findz } from '@/nodes/findz/Component'
import { Component as Formatv } from '@/nodes/formatv/Component'
import { Component as Gifu } from '@/nodes/gifu/Component'
import { Component as Kisaki } from '@/nodes/kisaki/Component'
import { Component as Linedup } from '@/nodes/linedup/Component'
import { Component as Marku } from '@/nodes/marku/Component'
import { Component as Migratef } from '@/nodes/migratef/Component'
import { Component as Mvz } from '@/nodes/mvz/Component'
import { Component as Nameu } from '@/nodes/nameu/Component'
import { Component as Recycleu } from '@/nodes/recycleu/Component'
import { Component as Repacku } from '@/nodes/repacku/Component'
import { Component as Samea } from '@/nodes/samea/Component'
import { Component as Shellect } from '@/nodes/shellect/Component'
import { Component as Sleept } from '@/nodes/sleept/Component'
import { Component as Timeu } from '@/nodes/timeu/Component'
import { Component as Trename } from '@/nodes/trename/Component'

const nodes = [
  ['bitv', Bitv], ['classf', Classf], ['classq', Classq], ['cleanf', Cleanf],
  ['crashu', Crashu], ['dissolvef', Dissolvef], ['enginev', Enginev], ['findz', Findz],
  ['formatv', Formatv], ['gifu', Gifu], ['kisaki', Kisaki], ['linedup', Linedup],
  ['marku', Marku], ['migratef', Migratef], ['mvz', Mvz], ['nameu', Nameu],
  ['recycleu', Recycleu], ['repacku', Repacku], ['samea', Samea], ['shellect', Shellect],
  ['sleept', Sleept], ['timeu', Timeu], ['trename', Trename],
] as const

const widths = [240, 320, 720] as const
const theme = {
  '--background': '#f8f6fc',
  '--foreground': '#1c1b20',
  '--primary': '#6045a8',
  '--primary-foreground': '#ffffff',
  '--secondary': '#e9ddff',
  '--secondary-foreground': '#24134f',
  '--accent': '#dce2ff',
  '--accent-foreground': '#171b39',
  '--muted': '#f1eff7',
  '--muted-foreground': '#49464f',
  '--card': '#ffffff',
  '--card-foreground': '#1c1b20',
  '--border': '#797680',
  '--input': '#e9e6ef',
  '--destructive': '#ba1a1a',
  '--destructive-foreground': '#ffffff',
  '--md3e-surface': '#f8f6fc',
  '--md3e-surface-lowest': '#ffffff',
  '--md3e-surface-low': '#f1eff7',
  '--md3e-surface-high': '#e9e6ef',
  '--md3e-surface-highest': '#dedbe6',
  '--md3e-primary': '#6045a8',
  '--md3e-on-primary': '#ffffff',
  '--md3e-primary-container': '#e9ddff',
  '--md3e-on-primary-container': '#24134f',
  '--md3e-secondary-container': '#e9ddff',
  '--md3e-on-secondary-container': '#24134f',
  '--md3e-tertiary-container': '#dce2ff',
  '--md3e-on-tertiary-container': '#171b39',
  '--md3e-error': '#ba1a1a',
} as React.CSSProperties & Record<`--${string}`, string>

function createMockHost(): NodeHostApi<Record<string, unknown>, Record<string, unknown>> {
  const data: Record<string, unknown> = {}
  return {
    contract: { name: 'xaihi.node-host', version: '1.0.0', supportedCapabilities: ['contract', 'state', 'runner', 'clipboard'], hasCapability: () => true },
    env: { theme: 'light', platform: 'web' },
    state: { getData: () => data, patchData: (patch) => Object.assign(data, patch) },
    runner: { run: async () => ({ success: true, message: 'OK' }) },
    actions: { run: async () => ({ success: true, message: 'OK' }) },
    clipboard: { readText: async () => '', writeText: async () => undefined },
    getData: <T,>() => data as T,
    patchData: (_componentId, patch) => { Object.assign(data, patch) },
    listComponents: () => [],
    updateComponent: () => undefined,
  }
}

afterEach(() => {
  cleanup()
  useWorkspaceStore.setState({ uiFace: 'legacy' })
  delete document.documentElement.dataset.uiFace
})

describe('MD3E node layouts in Chromium', () => {
  it.each(nodes)('%s stays inside its node surface at narrow, compact, and regular widths', async (id, Component) => {
    useWorkspaceStore.setState({ uiFace: 'md3e' })
    document.documentElement.dataset.uiFace = 'md3e'

    const host = createMockHost()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container, rerender } = render(
      <QueryClientProvider client={queryClient}>
        <div data-testid="node-viewport" style={{ ...theme, width: widths[0], height: 640, overflow: 'hidden', containerType: 'size' }}>
          <Component compId={`layout-${id}`} host={host as never} />
        </div>
      </QueryClientProvider>,
    )

    for (const width of widths) {
      const viewport = container.querySelector<HTMLElement>('[data-testid="node-viewport"]')!
      viewport.style.width = `${width}px`
      rerender(
        <QueryClientProvider client={queryClient}>
          <div data-testid="node-viewport" style={{ ...theme, width, height: 640, overflow: 'hidden', containerType: 'size' }}>
            <Component compId={`layout-${id}`} host={host as never} />
          </div>
        </QueryClientProvider>,
      )

      await waitFor(() => expect(container.querySelector('[data-ui-variant="md3e"], [data-node-ui="md3e"]')).not.toBeNull())
      const surface = container.querySelector<HTMLElement>('[data-ui-variant="md3e"], [data-node-ui="md3e"]')!
      const surfaceBounds = surface.getBoundingClientRect()
      expect(surfaceBounds.width, `${id} surface width at ${width}px`).toBeCloseTo(width, 0)

      const overflowing = [...surface.querySelectorAll<HTMLElement>('*')].filter((element) => {
        if (element.closest('[aria-hidden="true"]')) return false
        const style = getComputedStyle(element)
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0' || style.position === 'fixed') return false
        const bounds = element.getBoundingClientRect()
        return bounds.width > 0 && (bounds.left < surfaceBounds.left - 1 || bounds.right > surfaceBounds.right + 1)
      })
      expect(overflowing.map((element) => `${element.tagName}.${String(element.className).slice(0, 60)} ${Math.round(element.getBoundingClientRect().left)}..${Math.round(element.getBoundingClientRect().right)} vs ${Math.round(surfaceBounds.left)}..${Math.round(surfaceBounds.right)}`), `${id} children overflow at ${width}px`).toEqual([])
      expect(surface.scrollWidth, `${id} horizontal scroll at ${width}px`).toBeLessThanOrEqual(surface.clientWidth + 1)
    }
  })
})
