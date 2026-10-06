import { defineConfig } from 'vitest/config'

/**
 * 默认 node 环境；需要 DOM 的测试自己声明。
 *
 * `@material/material-color-utilities@0.4.0` 的 ESM 产物里是**无扩展名的内部 import**
 * （`…/dynamiccolor/dynamic_color`），Vite 能解析、Node 的 ESM 加载器不能。
 * vitest 默认把 node_modules 依赖外置给 Node 去解析，所以这条依赖必须显式内联，
 * 否则任何引到它的测试文件都会以 "Cannot find module" 失败。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    server: {
      deps: {
        inline: ['@material/material-color-utilities'],
      },
    },
  },
})
