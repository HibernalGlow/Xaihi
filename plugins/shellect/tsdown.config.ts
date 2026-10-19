import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: false,
  noExternal: ['@hibernalglow/xaihi-sdk'],
  external: ['@deepseek-ai/dsh-tools'],
})
