import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import workspaceBrowserConfig from './vitest.browser.config.ts'
import workspaceViteConfig from './vite.config.ts'

const require = createRequire(import.meta.url)
const documentConfig = workspaceViteConfig({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false })

export default defineConfig({
  ...workspaceBrowserConfig,
  resolve: {
    ...documentConfig.resolve,
    alias: [
      { find: /^react-dom\/test-utils$/, replacement: require.resolve('react-dom-19/test-utils') },
      ...(documentConfig.resolve?.alias ?? []),
    ],
  },
  plugins: documentConfig.plugins,
  cacheDir: 'node_modules/.vite-overlap-browser',
  optimizeDeps: {
    ...workspaceBrowserConfig.optimizeDeps,
    entries: ['tests/nodes-overlap.browser.test.tsx'],
    include: [
      ...(workspaceBrowserConfig.optimizeDeps?.include ?? []),
      '@danfessler/trellis-react',
      '@danfessler/trellis',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-slot',
      'lucide-react',
      'motion/react',
    ],
  },
  test: {
    ...workspaceBrowserConfig.test,
    setupFiles: ['src/test/setup-trellis-surface-browser.ts'],
    include: ['tests/nodes-overlap.browser.test.tsx'],
  },
})
