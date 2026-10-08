import { defineConfig } from 'tsdown'

/** 宿主半边 + 终端面两条腿（`cli` 是 bin，`help` 给聚合 CLI 动态装载）。 */
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
    external: [
    /^@hibernalglow\/xaihi-cli-runtime/,
    /^@opentui\//,
    /^react(\/|$)/,
    "@deepseek-ai/dsh-tools",
  ],
})
