import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { KIT_CSS } from '../lib/index.js'

const output = fileURLToPath(new URL('../lib/styles.css', import.meta.url))
await mkdir(resolve(output, '..'), { recursive: true })
await writeFile(output, `${KIT_CSS.trim()}\n`, 'utf8')
console.log(`xaihi-ui-kit: wrote ${output}`)
