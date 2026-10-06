import { readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { defineConfig } from 'tsdown'

// 两份产物：宿主半边（Node ESM 到 lib/index.js）与浏览器半边（CJS 握手 bundle 到
// lib/client.js）。浏览器半边的握手 id 必须等于包名，client-modules 才把产物挂到
// loader 里 name 为该包名的那一行。
// externals 只列基线平台模块（0.2.0 浏览器模块表实际有的项），其余一律内联：
// 内联出第二份 React 会让面板挂上另一套 dispatcher，症状是 hooks 随机崩。
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-theme',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/cordis',
]

const lib = {
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'] as const,
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
}

/**
 * Vite 的 `?url` 后缀在本包构建里没人实现。搬运树把它原样带进来一处
 * （`src/components/workspace/FlowCanvasView.tsx:37` 的 tldraw 中文语言包），
 * 于是 `pnpm build` 以 UNLOADABLE_DEPENDENCY 红。
 *
 * 这里补在构建层而不是改组件：本包没有 Vite，但搬运来的代码会持续带进这类写法，
 * 一行插件管住整类。行为抄 Vite 对小资源的默认——直接内联成 data URL，
 * 不伪造地址：内容就是那份文件本身。
 */
const VITE_URL_SUFFIX = '?url'
const PACKAGE_ROOT = dirname(new URL('.', import.meta.url).pathname)
const MIME_BY_EXT: Record<string, string> = {
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
}

const viteUrlSuffix = {
  name: 'xaihi-vite-url-suffix',
  load(id: string) {
    if (!id.endsWith(VITE_URL_SUFFIX)) return null
    const file = id.slice(0, -VITE_URL_SUFFIX.length)
    const bytes = readFileSync(resolve(PACKAGE_ROOT, file))
    const mime = MIME_BY_EXT[extname(file).toLowerCase()] ?? 'application/octet-stream'
    return `export default ${JSON.stringify(`data:${mime};base64,${bytes.toString('base64')}`)}`
  },
}

const client = {
  name: '@hibernalglow/xaihi-ui/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  external: CLIENT_EXTERNALS,
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [viteUrlSuffix],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@hibernalglow/xaihi-ui", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([lib, client])
