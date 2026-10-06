import { defineConfig } from 'tsdown'

/**
 * 纯类型与校验器：Node 侧与浏览器侧共用，所以不内联任何运行时框架。
 * `@deepseek-ai/dsh-tools` 必须是外部依赖：本包会被内联进各插件产物，若把
 * dsh-tools 一起打进去，每个节点就各有一份工具管线（校验、注册、呈现都分叉）。
 *
 * `src/operations.ts` 单列一个入口是给浏览器半边用的：壳里只许按
 * `@hibernalglow/xaihi-sdk/operations` 取值导入，从 barrel 取会把 Node 侧的工具管线
 * 一起内联进浏览器产物（purity 门禁抓到的正是这件事）。
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/operations.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'neutral',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
  external: ['@deepseek-ai/dsh-tools'],
})
