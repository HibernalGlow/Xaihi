import { defineConfig } from 'tsdown'

/**
 * 宿主半边 + 终端半边三入口：`src/index.ts` 给 cordis 装载，`src/cli.ts` 是 `bin` 指的
 * 那份，`src/help.ts` 给聚合 CLI 按 `{包名}/help` 动态装载。少一条入口的症状是
 * "`exports` 里那条 subpath 指向一个不存在的 `lib/cli.js`"，所以要与 `package.json`
 * 的 exports 同批改。SDK 与 dsh-tools 的关系见 node-sdk 的说明。
 */
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
    '@deepseek-ai/dsh-tools',
  ],
})
