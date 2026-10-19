import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('Shellect distributable source', () => {
  it('keeps backend, CLI, native adapter and MF2 source entry points', async () => {
    for (const file of [
      'src/index.ts',
      'src/cli.ts',
      'frontend/Manager.tsx',
      'frontend/container-entry.ts',
      'rspack.config.mjs',
      'tsdown.config.ts',
      'lib/native/bridge.mjs',
    ]) {
      await expect(access(resolve(root, file))).resolves.toBeUndefined()
    }
  })

  it('exposes the Shellect remote and package entry from one manifest', async () => {
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
      main?: string
      xaihi?: { ui?: { remote?: string; entry?: string } }
    }
    expect(manifest.main).toBe('lib/index.js')
    expect(manifest.xaihi?.ui).toEqual({ remote: 'shellect', entry: './dist/remoteEntry.js' })
  })
})
