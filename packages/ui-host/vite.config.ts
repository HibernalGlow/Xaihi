/**
 * 仅开发期的 vite server（`pnpm dev:ui`）。它不产出任何构建物：上线形态仍是
 * `rspack.document.mjs` 那条 `dist-ui` 管道，两份产物互不相认（rspack 不读这份
 * 配置，这份也不写给宿主消费的东西）。
 *
 * 为什么存在（2026-10-07 使用者拍的口径）：工作台源码本来就是 vite 形状开发的
 * ——源里到处是 `import.meta.env.VITE_*`，rspack 只是用 DefinePlugin 伪造它们。
 * "改一行 → 全量 rspack → rev 换址 → 手动刷新"不是那份开发体验。这份配置只做三件事：
 *
 *  1. **alias 单真源**：直接吃 `rspack.document.mjs` 的 `documentBase.resolve.alias`
 *     （它又从 `tsconfig.ported.json` 现读）。这里绝不第三处抄表，否则会出现
 *     "类型检查绿、dev 红或反之"的漂移。`$` 后缀是 rspack 的整名匹配语义，
 *     转成 vite 的正则形状；字符串键保持原序（先到先得，与 rspack 相同）。
 *  2. **浏览器切边**照抄 `build-aliases.mjs` 的 BROWSER_GRAPH_ALIASES：裸名 sdk
 *     不许拖进 Node 侧工具管线（rspack 那条 `Reading from "node:fs" is not handled`
 *     的同一条边界，dev server 也要有）。
 *  3. **桥是真的**：`/xaihi` 全前缀代理到隔离宿主（env `XAIHI_HOST_ORIGIN` 可换，
 *     默认 `http://127.0.0.1:3199`，即 `pnpm host` 烧进去的那个）。dev 壳
 *     `index.html` 写 `apiBase:'/xaihi'`，顶层窗按 `realm.ts` 的载体选择走
 *     host-http ⇒ `POST /xaihi/host` 穿过代理落到真宿主，granted 形状与
 *     `dsh web` 下同形（实测 [contract, state, config]）。
 *
 * React Compiler 分档（照搬运源仓 `scripts/react-compiler-mode` 的同一套语义，
 * 环境变量按本仓品牌改名）：**serve 默认 off**（开发要的是快，不要编译器的
 * 全树 babel），`XAIHI_REACT_COMPILER_DIAGNOSTIC=1` 时才在 dev 里开来做诊断；
 * 最终产物（rspack 那条）必须开，见 `rspack.document.mjs`。
 *
 * 已知边界：插件面板的 MF remote（各插件 `dist/remoteEntry.js`）不在 vite 图里，
 * 面板 UI 的热更仍走各自包的 `rspack build`；这条 dev 链覆盖工作台本体
 * （`src/**`：顶栏、工作区、文档面、L1/L2/L3 全部搬运源码）。
 *
 * @module xaihi-ui/vite-config-dev
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { BROWSER_GRAPH_ALIASES, assertAliasTargets } from './build-aliases.mjs'
import { documentBase } from './rspack.document.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// react 19 必须是这一份：`react-19` 是 npm 别名包（react@19.2.4），与宿主的 18
// 井水不犯河水（ADR-0009 的同一条结论，dev server 也要遵守）。
const react19 = path.dirname(require.resolve('react-19/package.json'))
const reactDom19 = path.dirname(require.resolve('react-dom-19/package.json'))

/** React Compiler 的分档（`off | annotation | infer`），语义见文件头。 */
type ReactCompilerMode = 'annotation' | 'infer' | 'off'

function reactCompilerMode(command: 'build' | 'serve'): ReactCompilerMode {
  const env = process.env as Record<string, string | undefined>
  if (command === 'serve' && env.XAIHI_REACT_COMPILER_DIAGNOSTIC !== '1') return 'off'
  const mode = env.XAIHI_REACT_COMPILER_MODE ?? (command === 'build' ? 'infer' : 'off')
  if (mode !== 'annotation' && mode !== 'infer' && mode !== 'off') {
    throw new Error('XAIHI_REACT_COMPILER_MODE must be annotation, infer, or off')
  }
  return mode
}

function reactCompilerPlugins(command: 'build' | 'serve') {
  const mode = reactCompilerMode(command)
  return mode === 'off' ? [] : [babel({ presets: [reactCompilerPreset({ compilationMode: mode })] })]
}

/** rspack 的整名匹配（`key$`）→ vite 的正则；其余键原样（先到先得序不变）。 */
function toViteAlias(map: Record<string, string>): Array<{ find: RegExp | string; replacement: string }> {
  return Object.entries(map).map(([find, replacement]) =>
    find.endsWith('$')
      ? { find: new RegExp(`^${find.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement }
      : { find, replacement },
  )
}

assertAliasTargets()

const HOST_ORIGIN = process.env.XAIHI_HOST_ORIGIN?.trim() || 'http://127.0.0.1:3199'

/**
 * 移植包（shared/logging/cli-runtime/contract/api）不在 pnpm workspace 里、没有自己的
 * node_modules，它们源码里的第三方裸名按逐级上溯找不到 —— rspack 用
 * `resolve.modules: [本包 node_modules, …]` 兜底，vite 没有这个选项，等价的机械规则
 * 就是把这份清单逐个 alias 到本包 node_modules（子路径自动拼上，`csv-parse/browser/esm`
 * 这类也吃得下）。清单来自实清点（grep 六个移植包 src 的裸 import），不是猜测；
 * 这些包里 browser 图真正到达的只有其中一部分，多给几条不生效也无害。
 */
const UI_NODE_MODULES = path.join(here, 'node_modules')
const PORTED_PACKAGE_BARE_IMPORTS = [
  'zod', 'sharp', 'cli-spinners', 'string-width', 'sixel', 'rotating-file-stream',
  'p-queue', 'lru-cache', 'json-rules-engine', 'i18next', 'csv-parse', 'citty',
  'chalk', 'boxen', '@clack/prompts', '@opentui/core', '@opentui/react',
  '@material/material-color-utilities',
]
const portedBareAliases = PORTED_PACKAGE_BARE_IMPORTS.map((name) => ({
  find: name,
  replacement: path.join(UI_NODE_MODULES, name),
}))

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), ...reactCompilerPlugins(command)],
  resolve: {
    alias: [
      // 浏览器切边先给：**整名匹配**（rspack 那边是 `${key}$`，语义一字不差）——
      // 只拦 `@hibernalglow/xaihi-sdk` 裸名落到 help.ts；`/bridge`、`/operations`
      // 子路径是浏览器安全入口，必须照包自己的 exports 走（指 lib/ 产物），
      // 吃成前缀就会把它们也拖进 help.ts —— rspack.build-aliases.mjs 的头注
      // 明确警告过这一点，第一版 dev 配置就在这里栽过（Pre-transform error 实测）。
      ...Object.entries(BROWSER_GRAPH_ALIASES).map(([find, replacement]) => ({
        find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        replacement: replacement as string,
      })),
      ...toViteAlias(documentBase.resolve.alias as unknown as Record<string, string>),
      ...portedBareAliases,
    ],
    // NodeNext 写的 `./schema.js` 要指到同目录 `.ts`（rspack 同一条规则；
    // shared/logging/cli-runtime 里实测五条都是这一类，不是缺文件）。
    extensionAlias: { '.js': ['.ts', '.js'], '.tsx': ['.tsx'] },
    // react 19 与 react-dom 19 必须同实例（React context 的单例前提）。
    dedupe: ['react', 'react-dom'],
  },
  // 移植包裸名的解析见上方 portedBareAliases（那个清单就是真源）；预构建的
  // eager 名单只挑浏览器图确定到达的两个，其余交给 scan 自动发现。
  optimizeDeps: {
    include: ['zod', '@material/material-color-utilities'],
  },
  // vite 8 走 oxc，esbuild 的 jsx 选项会被忽略（实测警告）；JSX 的 automatic
  // runtime 由 react 插件自己的 babel 管，这里什么都不用设。
  server: {
    // 显式绑回环：vite 默认 `localhost` 在本机只落 ::1，`127.0.0.1` 连不上（实测）。
    host: '127.0.0.1',
    port: 5188,
    // 被占就报错退出，不许悄悄换 5189：`pnpm dev` 编排链与文档都按 5188 说事，
    // 静默换址会出现"页面开着旧实例、新实例在别的端口"的假现场（2026-10-07 实测踩过）。
    strictPort: true,
    proxy: {
      // 桥的 endpoint（`realm.ts` 的 `${boot.apiBase}/host`）与宿主的其余
      // `/xaihi/*` 路由全部落到隔离宿主。`/xaihi/host` 上没有 token 闸门
      // （401 那道闸只挡宿主自己的页面），所以代理不需要带凭据。
      '/xaihi': { target: HOST_ORIGIN, changeOrigin: true },
    },
    watch: {
      ignored: ['**/dist-ui/**', '**/dist-nodeface/**', '**/dist-realm/**', '**/lib/**', '**/locale/**'],
    },
    warmup: { clientFiles: ['./index.html', './src/document/main.tsx'] },
  },
}))
