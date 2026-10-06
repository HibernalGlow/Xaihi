import { defineConfig } from 'tsdown'

/** 纯类型与校验器：Node 侧与浏览器侧共用，所以不内联任何运行时框架。 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'neutral',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
})
