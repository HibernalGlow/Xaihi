import { defineConfig } from 'tsdown'

/**
 * 宿主半边：Node ESM 库，输出 lib/，供 loader 的插件行按包名加载。
 *
 * `@hibernalglow/xaihi-sdk` 显式内联：DSH 的 profile 是独立的 pnpm 项目，装进去的包
 * 若留下 `@hibernalglow/*` 的外部引用就必然解析失败（`workspace:*` 同理解析不了）。
 * 这条意图由 tests/bundle.spec.ts 用产物断言守住，不靠默认行为。
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/registry.ts', 'src/routes.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
  noExternal: ['@hibernalglow/xaihi-sdk'],
})
