import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { BROWSER_GRAPH_ALIASES, XIRANITE_ALIASES } from './build-aliases.mjs'
import { mf2AcceptanceServer } from './tests/mf2-server.ts'

const documentErrors: string[] = []
let stopCapture: (() => void) | undefined
const react19 = process.env.XAIHI_MF2_REACT === '19'
export default defineConfig(async () => ({
  plugins: [await mf2AcceptanceServer()],
  resolve: { alias: {
    ...XIRANITE_ALIASES,
    '@hibernalglow/xaihi-sdk/bridge': fileURLToPath(new URL('../node-sdk/src/bridge.ts', import.meta.url)),
    '@hibernalglow/xaihi-sdk/operations': fileURLToPath(new URL('../node-sdk/src/operations.ts', import.meta.url)),
    '@hibernalglow/xaihi-sdk/manifest': fileURLToPath(new URL('../node-sdk/src/manifest.ts', import.meta.url)),
    ...BROWSER_GRAPH_ALIASES,
    '@hibernalglow/xaihi-kisaki': fileURLToPath(new URL('../../plugins/kisaki/src', import.meta.url)),
    zod: fileURLToPath(import.meta.resolve('zod')),
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    react: fileURLToPath(new URL(react19 ? './node_modules/react-19' : '../../node_modules/.pnpm/react@18.3.1/node_modules/react', import.meta.url)),
    'react-dom': fileURLToPath(new URL(react19 ? './node_modules/react-dom-19' : '../../node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom', import.meta.url)),
  } },
  optimizeDeps: { include: ['@module-federation/runtime', '@radix-ui/react-slot', '@testing-library/react', 'class-variance-authority', 'clsx', 'consola', 'i18next', 'lucide-react', 'next-themes', 'react-dom', 'react-dom/client', 'react-i18next', 'react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'sonner', 'tailwind-merge', 'zod', 'zustand', 'zustand/middleware', 'zustand/react/shallow'] },
  test: {
    browser: { commands: {
      async prepareMf2Document({page}) {
        // 正式 CSS 的 Google Fonts @import 会阻塞 HTML parser；MF 验收只隔离这条外网字体。
        await page.route('https://fonts.googleapis.com/**', route => route.fulfill({status: 200, contentType: 'text/css', body: ''}))
        documentErrors.length = 0
        const capture = (error: Error) => { documentErrors.push(error.message) }
        page.on('pageerror', capture)
        stopCapture = () => page.off('pageerror', capture)
      },
      async captureMf2Document({frame}) {
        const screenshot = path.join(tmpdir(), 'xaihi-mf2-document-' + process.pid + '.png')
        await (await frame()).locator('iframe').screenshot({path: screenshot})
        stopCapture?.()
        return {path: screenshot, errors: [...documentErrors]}
      },
    }, enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }], headless: true },
    include: ['tests/mf2-mount.browser.test.tsx'],
    testTimeout: 20000,
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
}))
