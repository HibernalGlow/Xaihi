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
 * `include` 里没有整个 `src/nodes/**`（那底下的上游测试仍有一大批跑不起来，判据见
 * `docs/port/ui-tests-inventory.md`）：下面那十二条是**实测过**的——临时配置一次放开全部
 * 43 个节点测试，跑绿的那 12 个逐个记下断言数，合计 52 条，才写进来。
 * 每确认一层能跑，就往上加一条，加的那次必须能说出为什么；用显式文件路径而不是
 * `src/nodes/shared/*.test.tsx` 这类族 glob，是为了新搬进来的文件不会被顺手放绿。
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
    // Node 26 的实验性 `localStorage` 全局会把 happy-dom 那份 `Storage` 顶掉（实测值恒为
    // undefined 且读一次告警一次）。这一层不是某个测试的毛病，是运行时形状：搬来的节点测试里
    // 180 条 `setItem` 失败全压在这上面（`docs/port/ui-tests-283-triage.md`）。
    // 先试过 `poolOptions.threads.execArgv: ['--no-experimental-webstorage']`——照红，
    // Worker 的 execArgv 收不下进程级开关；所以改成在测试宿主里装回同一个实现（见那份文件头）。
    // 判据是 `tests/localstorage-env.spec.ts` 那三条：去掉起手必须红。
    setupFiles: ['src/test/setup-webstorage.ts'],
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      'src/lib/design-theme/**/*.test.ts',
      // 以下 12 个是搬运批次带进来的上游节点测试里**实测能跑**的那一批
      // （38 文件 / 300 断言，`docs/port/ui-tests-inventory.md` 有前后对照）。
      'src/nodes/findz/workspace-layout.test.ts',
      'src/nodes/logx/browser-boundary.test.ts',
      'src/nodes/marku/workflow-result-projection.test.ts',
      'src/nodes/marku/workflow-state.test.ts',
      'src/nodes/shared/LocalAudioPreviewDialog.test.tsx',
      'src/nodes/shared/LocalImagePreview.test.tsx',
      'src/nodes/shared/LocalImagePreviewDialog.test.tsx',
      'src/nodes/shared/LocalVideoPreview.test.tsx',
      'src/nodes/shared/LocalVideoPreviewDialog.test.tsx',
      'src/nodes/shared/externalNodeGateway.test.ts',
      'src/nodes/shared/useLocalFileDrop.test.tsx',
      'src/nodes/shared/useNodeSurface.test.ts',
    ],
    server: {
      deps: {
        inline: ['@material/material-color-utilities'],
      },
    },
  },
})
