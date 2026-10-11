import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import base from './vitest.browser.config.ts'
export default defineConfig({
  ...base,
  plugins: [tailwindcss()],
  optimizeDeps: {
    ...base.optimizeDeps,
    entries: [],
    include: [...base.optimizeDeps.include, '@radix-ui/react-switch', '@use-gesture/react', '@danfessler/trellis-react', '@danfessler/trellis', '@lumino/commands', '@radix-ui/react-popover', '@radix-ui/react-slot', 'animejs'],
  },
  test: {
    ...base.test,
    setupFiles: ['src/test/setup-picker-browser.ts'],
    include: ['tests/trellis-browser.spec.tsx', 'tests/compact-view-switch.browser.spec.tsx', 'tests/compact-action-menu.browser.spec.tsx', 'tests/compact-app-menu.browser.spec.tsx'],
  },
})
