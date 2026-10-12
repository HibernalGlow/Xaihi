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
      '@hibernalglow/xaihi-kisaki': fileURLToPath(new URL('../../plugins/kisaki/src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'zod': fileURLToPath(import.meta.resolve('zod')),
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
    //
    // 第二条起手（`setup-document-feed.ts`）堵的是另一件**测试宿主才有**的事：
    // 文档侧那条运行回显会去跟 `/xaihi/operations/stream`，测试里没有 EventSource、
    // happy-dom 又把相对 URL 解到 `http://localhost:3000`，于是判据会打一次真网络请求。
    // 理由与验法写在那个文件头。
    setupFiles: ['src/test/setup-webstorage.ts', 'src/test/setup-document-feed.ts'],
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      'src/lib/design-theme/**/*.test.ts',
      // 以下 10 个是搬运批次带进来的上游节点测试里**实测能跑**的那一批
      // （38 文件 / 300 断言，`docs/port/ui-tests-inventory.md` 有前后对照）。
      'src/nodes/findz/workspace-layout.test.ts',
      'src/nodes/logx/browser-boundary.test.ts',
      'src/nodes/shared/LocalAudioPreviewDialog.test.tsx',
      'src/nodes/shared/LocalImagePreview.test.tsx',
      'src/nodes/shared/LocalImagePreviewDialog.test.tsx',
      'src/nodes/shared/LocalVideoPreview.test.tsx',
      'src/nodes/shared/LocalVideoPreviewDialog.test.tsx',
      'src/nodes/shared/externalNodeGateway.test.ts',
      'src/nodes/shared/useLocalFileDrop.test.tsx',
      // Kisaki standalone file drop and node UI appearance overrides.
      'src/nodes/kisaki/source-inputs.test.tsx',
      'src/nodes/kisaki/views/KisakiAppearance.test.tsx',
      'src/nodes/shared/useNodeSurface.test.ts',
      // 2026-10-07 加：`workspaceContext.tsx` 从 REST 换成桥之后，这一份是**唯一**在 React 层
      // 量 `WorkspaceProvider` 新契约的文件（握手门控 / 宿主读写 `state.getData|patchData` /
      // 防抖 / 竞态保护；11 条实测绿，假桥 `fakeHost` 在文件内）。静态那条（入口起桥、快照该走
      // `state.*` 两条边）在 `tests/document-bridge-wiring.spec.ts`，两条互补：那边量源码里的边，
      // 这边量真跑一轮的行为。
      'src/store/workspaceBackendLifecycle.test.tsx',
      // 2026-10-07 加：`NodeConfigPopover` 的"开机恢复"偏好从 REST（`nodeConfigApi.getUi/saveUi`，
      // 已裁）换成节点界面设置载体（`NodeUiConfigContext` → `xaihi-core.nodeUi`）。这一份量
      // 载体路径的存取/迁移与"没载体退回本地遗留键"三条腿（7 条断言实测绿）。它也是
      // `NodeUiConfigProvider` 装配契约的唯一行为判据。
      'src/nodes/shared/NodeConfigPopover.test.tsx',
      // 2026-10-08 加：图标全变成 `?` 那一次（`5a1abee` 把注册表换成生成物时丢了 `icon`/`category`，
      // 27 个节点全中，而 `check:noderegistry` 只比字节一致、看不见"字段没了"）。这一份量的是
      // **图标名查得到表、并且渲得出自己的图形**——"字段在不在"由生成器管（缺就 rc=1）。
      // 4 条断言实测绿；两次阳性对照各跑过一次（都是改产物里 bandia 那一条，改完重生成回原字节）：
      // icon 换成不存在的名字 ⇒ 第 2、4 条红；换成 `CircleHelp` ⇒ 同样第 2、4 条红，消息各自点名
      // `bandia.icon="..."`。第 1、3 条在两种扰动下都保持绿，说明红的是判据不是环境。
      'src/components/modules/moduleIconCatalogue.test.ts',
      // 2026-10-09 加：字母索引条的"隐藏空字母"这一条。判据是纯函数（`getVisibleInitials` 挑出真正
      // 有节点的首字母、`getNextAlphabetIndex` 只停在可见字母上），走界面那条路要 happy-dom 加
      // Radix Popover，量不动；而它改错了的表现是"滚动停在看不见的格子上 / 弹层脱锚"，在真机上
      // 很难复现，所以必须钉在这里。文件早就在树里（随搬运批次进来），此前一直不在 `include` 里
      // ⇒ 它断言过的三件事今天之前都没跑过。实测 11 条绿。两次阳性对照各跑过一次：
      // `getVisibleInitials` 的过滤放宽成恒真 ⇒ 第 5、6、7 条红；`getNextAlphabetIndex` 最后一步
      // 换回按 26 取模 ⇒ 第 8、9 条红（两次都是改完立刻回原样、再跑回 11 绿）。
      'src/components/workspace/AlphabetNodeRail.test.ts',
      // 2026-10-09 加：这次改动把一个偏好同时加进**四份手写枚举**（store 的 persist 清单、宿主的
      // `AppConfigSync` 清单 + 它的 normalize、`selectWorkspaceActions` 的转发表），而这一份正是
      // 唯一能看见"只改了一处"的判据（它自带 `brandNewPreference` 那条伪造对照）。此前它一直不在
      // `include` 里，等于那四份清单的对齐靠人眼。实测 10 条绿；阳性对照跑过一次：把新偏好从宿主
      // 那份清单删掉 ⇒ 第 1 条红并点名 `alphabetIndexHideEmpty`，改回即绿。
      'src/store/persistedUiPreferences.test.ts',
      // Explicit links must not swallow the first view change after a remount.
      'src/components/workspace/WorkspaceUrlState.test.tsx',
    ],
    server: {
      deps: {
        inline: ['@material/material-color-utilities'],
      },
    },
  },
})
