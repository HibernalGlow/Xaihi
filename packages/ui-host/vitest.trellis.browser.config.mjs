import { defineConfig } from 'vitest/config'
import base from './vitest.browser.config.ts'
export default defineConfig({ ...base, optimizeDeps: { ...base.optimizeDeps, include: [...base.optimizeDeps.include, '@radix-ui/react-switch', '@use-gesture/react'] }, test: { ...base.test, include: ['tests/trellis-browser.spec.tsx', 'tests/compact-view-switch.browser.spec.tsx', 'tests/compact-action-menu.browser.spec.tsx'] } })
