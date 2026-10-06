import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'
import { XIRANITE_ALIASES, assertAliasTargets } from './build-aliases.mjs'

assertAliasTargets()

/**
 * 环境是 happy-dom，不是 node：上游 `vite.config.ts` 的测试默认环境逐字就是
 * `environment: "happy-dom"`，而搬过来的设计语言有一整批判据要走 DOM 侧读回
 * （`domColor.ts` 用 canvas 解析 CSS 颜色、`resolve.test.ts` 用 getComputedStyle）。
 * 把它们退到 node 环境会红成一片，而症状离原因很远（"document is not defined"）。
 * 本仓自己那四个 spec 不碰 DOM API 的存在性，所以同环境跑。
 *
 * `include` 只点到 `src/lib/design-theme/**`，没有放开整个 `src/**`：
 * 那底下正在并行搬 L1/L2/L4，上游测试里有依赖 Tauri、浏览器夹具和 `@/i18n` 的，
 * 一次性放开会让"设计语言这一层到底搬没搬对"这个判据被淹没在别人的红里。
 * 每确认一层能跑，就往上加一条 glob，加的那次必须能说出为什么。
 *
 * `@material/material-color-utilities@0.4.0` 的 ESM 产物里是**无扩展名的内部 import**
 * （`…/dynamiccolor/dynamic_color`），Vite 能解析、Node 的 ESM 加载器不能。
 * vitest 默认把 node_modules 依赖外置给 Node 去解析，所以这条依赖必须显式内联，
 * 否则任何引到它的测试文件都会以 "Cannot find module" 失败。
 */
export default defineConfig({
  resolve: {
    alias: {
      // `@xiranite/*` 与 `@/` 都按同一张表解析（表本身由 build-aliases.mjs 自检：
      // 每一条都指得到真源码）。三处共用一张表，改一处就会在另一处红。
      ...XIRANITE_ALIASES,
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      'src/lib/design-theme/**/*.test.ts',
    ],
    server: {
      deps: {
        inline: ['@material/material-color-utilities'],
      },
    },
  },
})
