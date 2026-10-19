// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { XMd3eSegmentedTrack } from '../src/components.tsx'

afterEach(cleanup)

describe('XMd3eSegmentedTrack interaction', () => {
  it('exposes a single-choice radio group and activates with wrapping arrow keys', async () => {
    const user = userEvent.setup()
    const changes = vi.fn()

    function ControlledTrack() {
      const [value, setValue] = React.useState('all')
      return <XMd3eSegmentedTrack
        aria-label="Filter"
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
          { value: 'saved', label: 'Saved' },
        ]}
        value={value}
        onChange={(next) => { changes(next); setValue(next) }}
      />
    }

    render(<ControlledTrack />)

    const radios = screen.getAllByRole('radio')
    expect(screen.getByRole('radiogroup', { name: 'Filter' }).getAttribute('aria-orientation')).toBe('horizontal')
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    radios[0]?.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{Home}')

    expect(changes.mock.calls.map(([value]) => value)).toEqual(['unread', 'saved', 'all'])
    expect(document.activeElement).toBe(radios[0])
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true')
  })

  it('skips disabled options and recovers tab order when the controlled value is absent', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<XMd3eSegmentedTrack
      options={[
        { value: 'disabled', label: 'Disabled', disabled: true },
        { value: 'compact', label: 'Compact' },
        { value: 'roomy', label: 'Roomy' },
      ]}
      value="unknown"
      onChange={onChange}
    />)

    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])

    radios[1]?.focus()
    await user.keyboard('{ArrowLeft}{End}')

    expect(onChange.mock.calls.map(([value]) => value)).toEqual(['roomy'])
    expect(document.activeElement).toBe(radios[2])
  })
})
