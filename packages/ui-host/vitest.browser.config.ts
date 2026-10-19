import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { BROWSER_GRAPH_ALIASES, XIRANITE_ALIASES, assertAliasTargets } from './build-aliases.mjs'

assertAliasTargets()

export default defineConfig({
  resolve: {
    alias: {
      ...XIRANITE_ALIASES,
      '@hibernalglow/xaihi-sdk/bridge': fileURLToPath(new URL('../node-sdk/src/bridge.ts', import.meta.url)),
      '@hibernalglow/xaihi-sdk/operations': fileURLToPath(new URL('../node-sdk/src/operations.ts', import.meta.url)),
      '@hibernalglow/xaihi-sdk/manifest': fileURLToPath(new URL('../node-sdk/src/manifest.ts', import.meta.url)),
      ...BROWSER_GRAPH_ALIASES,
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'zod': fileURLToPath(import.meta.resolve('zod')),
    },
  },
  optimizeDeps: {
    include: [
      '@tanstack/react-query',
      '@testing-library/react',
      'class-variance-authority',
      'clsx',
      'consola',
      'i18next',
      'lucide-react',
      'next-themes',
      'nuqs',
      'nuqs/adapters/react',
      'react-i18next',
      'react',
      'react-dom',
      'react/jsx-dev-runtime',
      'tailwind-merge',
      'zod',
      'zustand',
      'zustand/middleware',
      'zustand/react/shallow',
    ],
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
      ],
      headless: true,
    },
    include: [
      'tests/workspace-app-render.spec.tsx',
      'tests/shellect-md3e-layout.spec.tsx',
      'tests/all-nodes-md3e-layout.spec.tsx',
    ],
    server: {
      deps: {
        inline: ['@material/material-color-utilities'],
      },
    },
  },
})
