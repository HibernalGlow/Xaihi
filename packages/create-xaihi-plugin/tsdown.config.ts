import { defineConfig } from 'tsdown'

/** 脚手架是本地工具：只出自包含的 Node ESM，不发布也可用。 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: true,
  fixedExtension: false,
})
