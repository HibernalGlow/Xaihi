// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { XMd3eGestureBoard } from '../src/md3e.tsx'

afterEach(cleanup)

describe('XMd3eGestureBoard keyboard behavior', () => {
  it('uses grid rows and roving focus while selecting points from the keyboard', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<XMd3eGestureBoard aria-label="Unlock pattern" onValueChange={onValueChange} />)

    const points = screen.getAllByRole('gridcell')
    expect(screen.getByRole('grid', { name: 'Unlock pattern' }).querySelectorAll('[role="row"]')).toHaveLength(3)
    expect(points.map((point) => point.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1', '-1', '-1', '-1'])

    points[0]?.focus()
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}')

    expect(document.activeElement).toBe(points[4])
    expect(onValueChange).toHaveBeenCalledWith([4])
    expect(points[4]?.getAttribute('tabindex')).toBe('0')
    expect(points[1]?.getAttribute('tabindex')).toBe('-1')
  })

  it('keeps focus within row edges and moves to row boundaries with Home and End', async () => {
    const user = userEvent.setup()
    render(<XMd3eGestureBoard />)

    const points = screen.getAllByRole('gridcell')
    points[2]?.focus()
    await user.keyboard('{ArrowRight}{End}{ArrowLeft}{Home}')

    expect(document.activeElement).toBe(points[0])
  })
})
