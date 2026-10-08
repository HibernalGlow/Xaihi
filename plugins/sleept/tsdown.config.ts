import { defineConfig } from 'tsdown'

/** 宿主半边；SDK 与 dsh-tools 的关系见 node-sdk 的说明。 */
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
  // cli-runtime 保持 external：lib/cli.js 里的裸导入由本包 devDependency 的 workspace 链接
  // 解析到 packages/cli-runtime，重依赖（@opentui/*、@clack、react…）再由它自己的
  // node_modules 解决——不内联（内联会把整棵终端树拖进本包，sharp 是原生模块更内不进）。
  external: [/^@hibernalglow\/xaihi-cli-runtime/, /^@opentui\//, /^react(\/|$)/, '@deepseek-ai/dsh-tools'],
})
