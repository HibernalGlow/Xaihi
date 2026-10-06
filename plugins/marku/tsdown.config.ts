import { defineConfig } from 'tsdown'

/** 宿主半边 + 终端面（cli / help）；SDK 与 dsh-tools 的关系见 node-sdk 的说明。 */
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/help.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
  noExternal: ['@hibernalglow/xaihi-sdk'],
  external: ['@deepseek-ai/dsh-tools'],
})
