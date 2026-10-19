import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KIT_CSS, XAIHI_UI_KIT_THEME_TOKENS } from '../src/tokens.ts'

describe('distribution surface', () => {
  const root = resolve(import.meta.dirname, '..')

  it('keeps the documented package surface and stylesheet contract in source', async () => {
    await expect(access(resolve(root, 'README.md'))).resolves.toBeUndefined()
    await expect(access(resolve(root, 'package.json'))).resolves.toBeUndefined()
    expect(KIT_CSS).toContain('.xaihi-md3e-shape-button')
    expect(KIT_CSS).toContain('.xaihi-md3e-slider[data-thickness="40"]')
    expect(XAIHI_UI_KIT_THEME_TOKENS).toContain('--xaihi-md3e-surface-lowest')
    expect(KIT_CSS).toContain('var(--xaihi-md3e-surface-lowest')
  })
})
