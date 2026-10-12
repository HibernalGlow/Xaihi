import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import workspaceBrowserConfig from './vitest.browser.config.ts'
import workspaceViteConfig from './vite.config.ts'

/**
 * 分形视图表面（画布层 + 节点右键）的浏览器尺。
 *
 * 基座照 `vitest.alphabet.browser.config.ts`：吃**文档那条** vite 配置的解析与 CSS 管线，
 * 而不是 `vitest.browser.config.ts` 那张朴素 alias 表。原因是那条表把 `@hibernalglow/xaihi-sdk`
 * 裸名当**前缀**匹配，子路径 `/bridge`、`/operations`（本来经包 exports 指 `lib/` 的浏览器安全入口）
 * 会被一起吃掉，落成 "Failed to resolve import"。字母索引那条尺走文档管线时没有这层噪声。
 * 顺带这也更贴近真身：工作台在 React 19 的文档里跑（ADR-0009/0014），不是宿主壳那一侧。
 */
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
  cacheDir: 'node_modules/.vite-trellis-surface-browser',
  optimizeDeps: {
    ...workspaceBrowserConfig.optimizeDeps,
    entries: ['tests/trellis-surface.browser.test.tsx'],
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
    include: ['tests/trellis-surface.browser.test.tsx'],
  },
})
