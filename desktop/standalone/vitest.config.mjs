import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const uiRequire = createRequire(new URL('../../packages/ui-host/package.json', import.meta.url))
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../../packages/ui-host/src', import.meta.url)), 'i18next': uiRequire.resolve('i18next'), 'react-i18next': uiRequire.resolve('react-i18next'), 'react': uiRequire.resolve('react'), '@hibernalglow/xaihi-sdk/bridge': fileURLToPath(new URL('../../packages/node-sdk/src/bridge.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['desktop/standalone/*.test.ts'] },
})
