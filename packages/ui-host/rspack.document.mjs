import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { rspack } from '@rspack/core'
import { assertAliasTargets, BROWSER_GRAPH_ALIASES } from './build-aliases.mjs'

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

/**
 * `@xiranite/*` 的边**从 `tsconfig.ported.json` 的 paths 现读**，不在这里再抄一份。
 * 那份表是搬运批唯一真源（它的注释写明了理由：把 217 条 TS2307 变成可核对的真边），
 * 这里复制一份字面量就会漂移：类型检查绿、构建红，而症状出现在另一个realm里。
 * `key/*` 形式交成目录前缀（rspack 会把子路径接在后面），精确形式加 `$` 只匹配整名。
 */
function aliasesFromTsconfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(here, 'tsconfig.ported.json'), 'utf8'))
  const out = {}
  for (const [key, targets] of Object.entries(cfg.compilerOptions?.paths ?? {})) {
    const target = targets?.[0]
    if (typeof target !== 'string') continue
    if (key === 'react' || key === 'react-dom' || key.startsWith('react/')) continue
    if (key === '@/*') continue
    const absolute = path.resolve(here, target)
    if (key.endsWith('/*')) out[key.slice(0, -2)] = absolute.replace(/\/\*$/, '')
    else out[`${key}$`] = absolute
  }
  return out
}

export const tsconfigAliases = aliasesFromTsconfig

/**
 * 只在这份浏览器产物里生效的收窄边（判据与实测都写在 `build-aliases.mjs` 的
 * `BROWSER_GRAPH_ALIASES` 注释里，这里不重述理由，只做接线）。
 *
 * 键加 `$` 做**整名匹配**：`@hibernalglow/xaihi-sdk/bridge` 与 `/operations` 那两条子路径
 * 必须照包自己的 `exports` 走（它们本来就是浏览器安全的入口），不能被裸名那条规则吃掉；
 * 反过来若裸名那条边没被切，`rspack build` 就剩三条
 * `Reading from "node:fs" / "node:os" / "node:module" is not handled by plugins`。
 */
function browserGraphAliases() {
  assertAliasTargets()
  return Object.fromEntries(
    Object.entries(BROWSER_GRAPH_ALIASES).map(([key, target]) => [`${key}$`, target]),
  )
}

/** 两份文档产物共用的解析与规则；只有 entry 与输出目录不同。 */

/**
 * React Compiler 挂在 swc 之前（enforce: 'pre'，babel 先剥类型并把 memo 化的
 * 代码注进去，JSX 转换仍由下面的 builtin:swc-loader 完成）。默认 'infer'——
 * 2026-10-07 使用者拍的口径：dev（vite.config.ts，serve 默认 off）要快，
 * **最终产物必须带编译器优化**。`XAIHI_REACT_COMPILER_MODE=off` 是减法跑测的
 * 入口：关掉重建，产物里必须不再出现 `compiler-runtime`（正控判据）。
 */
function reactCompilerRule() {
  const mode = process.env.XAIHI_REACT_COMPILER_MODE ?? 'infer'
  if (mode !== 'annotation' && mode !== 'infer' && mode !== 'off') {
    throw new Error(`XAIHI_REACT_COMPILER_MODE must be annotation, infer, or off, got: ${mode}`)
  }
  if (mode === 'off') return []
  // 两条 rule 而不是一条：syntax-jsx 若对 .ts 也开，`<TInfo = unknown>(x) => …`
  // 这类泛型箭头会被当成 JSX 起始标签解析（实测 document-host.ts:203 就这么炸的）。
  const ruleFor = (test, withJsx) => ({
    test,
    include: path.join(here, 'src'),
    enforce: 'pre',
    use: [{
      loader: 'babel-loader',
      options: {
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        presets: [["@babel/preset-typescript", { ignoreExtensions: true }]],
        // babel 8 的 preset-typescript 移除了 isTSX/allExtensions：按扩展名探测
        // JSX 的老路没了，.tsx 显式挂 syntax-jsx，.ts 不挂。
        plugins: [
          ...(withJsx ? ["@babel/plugin-syntax-jsx"] : []),
          ["babel-plugin-react-compiler", { compilationMode: mode }],
        ],
        cacheDirectory: true,
        cacheCompression: false,
      },
    }],
  })
  return [ruleFor(/\.tsx$/, true), ruleFor(/\.ts$/, false)]
}

export const documentBase = {
  mode: 'production',
  context: here,
  output: {
    path: path.join(here, 'dist-ui'),
    clean: true,
    publicPath: '',
    filename: '[name].js',
    assetModuleFilename: 'assets/[name][ext]',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.json'],
    /**
     * `@xiranite/{shared,logging,…}` 的类型检查与构建能指到源码（靠 tsconfig paths / 别名表），
     * 但那些包**不在 pnpm workspace 里**（`pnpm-workspace.yaml` 顶部的负向条目），
     * 所以它们没有自己的 `node_modules`：从 `packages/shared/src/**` 里发出去的裸名
     * （实测 `zod`）按 Node 的逐级上溯找不到。这里补两条机械规则，而不是去给那些包手装依赖：
     *  - `modules` 把本包的 `node_modules` 也当解析根（裸名统一落到本包声明的那份，
     *    与 `check:pins` 的"声明即唯一版本"是同一条口径）；
     *  - `extensionAlias` 让 NodeNext 写的 `./schema.js` 指到同目录的 `./schema.ts`
     *    （实测 `./schema.js` / `./query.js` / `./jsonl.js` / `./http-url.js` /
     *    `./source-thumbnail-client.js` 五条都是这一类，不是缺文件）。
     */
    modules: [path.join(here, 'node_modules'), 'node_modules'],
    extensionAlias: { '.js': ['.ts', '.js'], '.tsx': ['.tsx'] },
    alias: {
      '@': path.join(here, 'src'),
      // `$` 后缀是**整名匹配**：不加的话 `react-dom/client` 会被 `react-dom` 这条前缀规则吃掉，
      // 实测报 "Cannot find module 'react-dom/client' for matched aliased key 'react-dom'"。
      'react$': react19,
      'react-dom$': reactDom19,
      'react/jsx-runtime': require.resolve('react-19/jsx-runtime'),
      'react/jsx-dev-runtime': require.resolve('react-19/jsx-dev-runtime'),
      // 别名把 `react-dom` 指到包根目录后，`react-dom/client` 这条子路径不会自动接上
      //（实测报 "Cannot find module 'react-dom/client' for matched aliased key 'react-dom'"），
      // 所以子路径逐条给绝对文件，不指望前缀匹配。
      'react-dom/client': require.resolve('react-dom-19/client'),
      'react-dom/server': require.resolve('react-dom-19/server'),
      '@xyflow/react/dist/style.css': path.join(here, 'src/vendor/xyflow-stub.css'),
      '@xyflow/react$': path.join(here, 'src/vendor/xyflow-stub.tsx'),
      '@xyflow/react': path.join(here, 'src/vendor/xyflow-stub.tsx'),
      ...aliasesFromTsconfig(),
      ...browserGraphAliases(),
    },
  },
  module: {
    rules: [
      ...reactCompilerRule(),
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
      // 上游那份 `@material/material-color-utilities@0.4.0` 里是**无扩展名的深路径**
      // （`../dynamiccolor/dynamic_scheme`），rspack 按 fullySpecified 的规则要求带扩展名，
      // 实测 9 条 Module not found 全从这里来。只对第三方 .js 关掉这条严格性，
      // 不动我们自己的源码——那边的扩展名本来就该写全。
      { test: /\.m?js$/, resolve: { fullySpecified: false } },
      // 样式抽成一份 main.css，文档壳用 <link> 引它（ADR-0008：类名与变量两边都要有）。
      { test: /\.css$/i, type: 'css/auto' },
      // `?url` 那类引用交回一个可引用的 URL，不是把文件内容内联进来。
      { test: /\.(json|png|jpg|jpeg|svg|woff2?)$/, resourceQuery: /url/, type: 'asset/resource' },
      { test: /\.(png|jpg|jpeg|webp|svg|woff2?)$/, type: 'asset' },
    ],
  },
  experiments: { css: true },
  plugins: [
    new rspack.DefinePlugin({
      'import.meta.env': '({ DEV: false, PROD: true, MODE: "production", VITE_APP_VERSION: "0.0.0", VITE_XIRANITE_FRONTEND_DEV_URL: "", VITE_XIRANITE_BACKEND_URL: "", VITE_XIRANITE_BACKEND_TOKEN: "" })',
      'import.meta.env.DEV': JSON.stringify(false),
      'import.meta.env.PROD': JSON.stringify(true),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify('0.0.0'),
      'import.meta.env.VITE_XIRANITE_FRONTEND_DEV_URL': JSON.stringify(''),
      'import.meta.env.VITE_XIRANITE_BACKEND_URL': JSON.stringify(''),
      'import.meta.env.VITE_XIRANITE_BACKEND_TOKEN': JSON.stringify(''),
    }),
  ],
  stats: { preset: 'errors-warnings' },
  infrastructureLogging: { level: 'error' },
}

export default { ...documentBase, entry: { main: './src/document/main.tsx' } }
