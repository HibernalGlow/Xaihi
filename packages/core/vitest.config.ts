import { defineConfig } from 'vitest/config'

/** 默认 node 环境：登记表与路由测试不需要 DOM。 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
})
