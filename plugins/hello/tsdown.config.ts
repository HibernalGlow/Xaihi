import { defineConfig } from 'tsdown'

/** 节点宿主半边：只出 Node ESM，UI 产物由 rspack 出到 dist/。 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
})
