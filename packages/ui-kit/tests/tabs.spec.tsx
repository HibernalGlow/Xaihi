// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { XMd3eTabs } from '../src/md3e.tsx'

afterEach(cleanup)

describe('XMd3eTabs keyboard behavior', () => {
  it('keeps one tab stop and activates tabs with wrapping arrows and Home/End', async () => {
    const user = userEvent.setup()
    const changes = vi.fn()

    function ControlledTabs() {
      const [value, setValue] = React.useState('library')
      return <XMd3eTabs
        aria-label="Library sections"
        items={[
          { id: 'library', label: 'Library' },
          { id: 'history', label: 'History' },
          { id: 'settings', label: 'Settings' },
        ]}
        value={value}
        onValueChange={(next) => { changes(next); setValue(next) }}
      />
    }

    render(<ControlledTabs />)

    const tabs = screen.getAllByRole('tab')
    expect(screen.getByRole('tablist', { name: 'Library sections' }).getAttribute('aria-orientation')).toBe('horizontal')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    tabs[0]?.focus()
    await user.keyboard('{ArrowRight}{End}{ArrowRight}{Home}')

    expect(changes.mock.calls.map(([value]) => value)).toEqual(['history', 'settings', 'library'])
    expect(document.activeElement).toBe(tabs[0])
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
  })

  it('skips disabled tabs and uses the first enabled tab as the fallback tab stop', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<XMd3eTabs
      items={[
        { id: 'disabled', label: 'Disabled', disabled: true },
        { id: 'first', label: 'First' },
        { id: 'last', label: 'Last' },
      ]}
      value="missing"
      onValueChange={onValueChange}
    />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]?.hasAttribute('disabled')).toBe(true)
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])

    tabs[1]?.focus()
    await user.keyboard('{ArrowLeft}{End}')

    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual(['last'])
    expect(document.activeElement).toBe(tabs[2])
  })
})
