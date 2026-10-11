import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildMf2Document } from './build-mf2-acceptance.mjs'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const directory = await buildMf2Document()
try {
  for (const react of ['18', '19']) {
    const rc = await new Promise((resolve, reject) => {
      const child = spawn('pnpm', ['exec', 'vitest', 'run', '-c', 'vitest.mf2.config.ts'], {
        stdio: 'inherit', env: { ...process.env, XAIHI_MF2_DOCUMENT: directory, XAIHI_MF2_REACT: react },
      })
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
    })
    console.log(`test:mf2 React ${react} rc=${rc}`)
    if (rc !== 0) { process.exitCode = rc; break }
  }
} finally { await rm(directory, { recursive: true, force: true }) }
