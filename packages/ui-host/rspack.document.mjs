import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * Xaihi 文档那一侧（React 19）的浏览器产物。
 *
 * 为什么这一份用 rspack 而不是本包其余两份用的 tsdown：搬进来的界面树里有
 * 真 CSS 与 `?url` 资源引用（实测 `src/index.css`、`dockview.css`、`gridstack.min.css`、
 * `findz/treemap.css`、`src/assets/tldraw-zh-cn.json?url`），tsdown 直答
 * "`@tsdown/css` is not installed" 与 `UNLOADABLE_DEPENDENCY`，而这两类rspack 原生就吃
 * （`type: 'css/mini-extract'` 与 `type: 'asset'` + resourceQuery）。
 * 浏览器 UI 用 rspack 也不是新机制——每个节点包自己的 `rspack.config.mjs` 就是这个仓现有的那套。
 *
 * react 走 **alias 到本包的 react-19**，不是 external、也不是 MF shared：
 * ADR-0009 实测过"同一次编译里外面宿主 18、里面自带 19"做不到（V2 报
 * `Cannot read properties of undefined (reading 'S')`，因为 react-dom@19 内部 require('react')
 * 被共享表解析成了宿主的 18）。这份 bundle 里没有模块联邦、没有共享表，
 * 所以 19 的 react + react-dom 是一整张闭合的图；对外只交出一个 DOM 容器。
 *
 * 产物名必须与 core 那两条路由常量一致（`UI_ENTRY_SCRIPT` / `UI_ENTRY_STYLE`），
 * 否则文档壳引到 404，而症状是"界面空白"。
 */
const here = path.dirname(new URL(import.meta.url).pathname)
const require = createRequire(import.meta.url)
const react19 = path.dirname(require.resolve('react-19/package.json'))
const reactDom19 = path.dirname(require.resolve('react-dom-19/package.json'))

export default {
  mode: 'production',
  context: here,
  entry: { main: './src/document/main.tsx' },
  output: {
    path: path.join(here, 'dist-ui'),
    clean: true,
    publicPath: 'auto',
    filename: '[name].js',
    assetModuleFilename: 'assets/[name][ext]',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.join(here, 'src'),
      react: react19,
      'react-dom': reactDom19,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [{
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic' } },
            },
          },
        }],
        type: 'javascript/auto',
      },
      // 样式抽成一份 main.css，文档壳用 <link> 引它（ADR-0008：类名与变量两边都要有）。
      { test: /\.css$/, type: 'css/mini-extract' },
      // `?url` 那类引用交回一个可引用的 URL，不是把文件内容内联进来。
      { test: /\.(json|png|jpg|jpeg|svg|woff2?)$/, resourceQuery: /url/, type: 'asset/resource' },
      { test: /\.(png|jpg|jpeg|webp|svg|woff2?)$/, type: 'asset' },
    ],
  },
  experiments: { css: true },
  stats: { preset: 'errors-warnings' },
  infrastructureLogging: { level: 'error' },
}
