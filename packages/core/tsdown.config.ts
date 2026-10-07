import { defineConfig } from 'tsdown'

/**
 * 宿主半边：Node ESM 库，输出 lib/，供 loader 的插件行按包名加载。
 *
 * `@hibernalglow/xaihi-sdk` 显式内联：DSH 的 profile 是独立的 pnpm 项目，装进去的包
 * 若留下 `@hibernalglow/*` 的外部引用就必然解析失败（`workspace:*` 同理解析不了）。
 * 这条意图由 tests/bundle.spec.ts 用产物断言守住，不靠默认行为。
 */
export default defineConfig({
  // `host-routes.ts` 单列一份：`scripts/check-doc-bridge.mjs` 要 import 的是**生产那份判据**
  // （`detectHostMount`），线下尺与服务端判据必须是同一份判断。这份清单是显式的——
  // 不写进来就不会出现在 lib/，症状是脚本一跑就 ERR_MODULE_NOT_FOUND（与 `src/routes.ts` 同一条理由）。
  entry: ['src/index.ts', 'src/registry.ts', 'src/routes.ts', 'src/host-routes.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
  noExternal: ['@hibernalglow/xaihi-sdk'],
})
