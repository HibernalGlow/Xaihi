import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import workspaceBrowserConfig from './vitest.browser.config.ts'
import workspaceViteConfig from './vite.config.ts'

// Use the document's React 19 aliases and CSS pipeline; Motion must share its renderer.
const require = createRequire(import.meta.url)
const documentConfig = workspaceViteConfig({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false })

export default defineConfig({
  ...workspaceBrowserConfig,
  resolve: {
    ...documentConfig.resolve,
    alias: [
      { find: /^react-dom\/test-utils$/, replacement: require.resolve('react-dom-19/test-utils') },
      ...(documentConfig.resolve?.alias as Array<{ find: string | RegExp; replacement: string }>),
    ],
  },
  plugins: documentConfig.plugins,
  optimizeDeps: {
    ...workspaceBrowserConfig.optimizeDeps,
    entries: ['tests/alphabet-node-rail.browser.test.tsx'],
    include: [
      ...(workspaceBrowserConfig.optimizeDeps?.include ?? []),
      'motion/react', '@radix-ui/react-popover', '@radix-ui/react-slot', 'cmdk',
    ],
  },
  test: {
    ...workspaceBrowserConfig.test,
    include: ['tests/alphabet-node-rail.browser.test.tsx'],
  },
})
