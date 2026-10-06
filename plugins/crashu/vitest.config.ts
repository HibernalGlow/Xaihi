import { defineConfig } from 'vitest/config'

/**
 * 只跑本包自己的 `tests/**` 与 `src/**`。
 *
 * 为什么不能靠默认值：vitest 的默认 include 是"仓库内所有 spec/test 文件"，而它的排除表
 * 抓不到 pnpm 的依赖仓库——真包躺在 `node_modules/.pnpm/<pkg>/node_modules/<pkg>/…`，
 * 祖先目录叫 `<pkg>` 而不是 `node_modules`。这条与判据同为 `plugins/linedup/vitest.config.ts`
 * 里记着的那次实测（不写时收集到 3113 个文件，其中 21 个失败用例全是上游包自己的）。
 *
 * 只动 include，不加 exclude：多一挡遮蔽就多一处下次静默漏跑的地方。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
  },
})
