import { defineConfig } from 'vitest/config'

/** 默认 node 环境；需要 DOM 的组件测试在自己的 spec 首行声明 jsdom。 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
})
