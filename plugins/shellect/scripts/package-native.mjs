import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

const required = ['bridge.mjs', 'export.mjs', 'install.mjs', 'uninstall.mjs']
for (const file of required) await access(resolve('lib/native', file))
console.log(`shellect: native adapters present (${required.length})`)
