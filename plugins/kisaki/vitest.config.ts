import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['src/Tui.bun.test.tsx', 'node_modules', 'dist', 'lib'],
  },
})
