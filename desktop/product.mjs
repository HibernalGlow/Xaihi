#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stageNativeResources } from './standalone/native-resources.mjs'
import { assertKisakiGraph } from './standalone/product-graph.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const takesValue = new Set(['--platform', '--arch'])
const flagValue = (flag) => {
  const index = argv.indexOf(flag)
  return index === -1 ? undefined : argv[index + 1]
}
// 默认装本机那一份；在 arm64 上出 darwin-x64 这类交叉装配才显式给这两个参数。
const platform = flagValue('--platform') ?? process.platform
const arch = flagValue('--arch') ?? process.arch
for (const flag of takesValue) {
  if (argv.includes(flag) && flagValue(flag) === undefined) throw new Error(`${flag} 后面要跟值`)
}
const positional = argv.filter((entry, index) => !takesValue.has(entry) && !takesValue.has(argv[index - 1]))
const [mode = 'build', name = 'kisaki', ...options] = positional
if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error('产品 id 无效')
const config = join(repo, 'desktop/products', name, 'product.json')
const product = JSON.parse(readFileSync(config, 'utf8'))
if (product.id !== name) throw new Error('产品 id 与目录不一致')
const output = join(repo, 'desktop/.products', name)
const env = { ...process.env, XAIHI_DESKTOP_PRODUCT_CONFIG: config }
async function run(command, args, options = {}) {
  await new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: repo, stdio: 'inherit', env, ...options })
    child.once('error', fail)
    child.once('exit', (code, signal) => code === 0 ? done() : fail(new Error(`${command} 退出：${code ?? signal}`)))
  })
}
if (mode === 'build') {
  // 产物只清自己的目录；DSH package closure 由上游 prepare-dsh 负责。
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  await run('pnpm', ['--filter', '@hibernalglow/xaihi-core', 'build'])
  await run('pnpm', ['--filter', '@hibernalglow/xaihi-kisaki', 'exec', 'tsdown'])
  // 干净检出的隐藏前置：products/kisaki/Panel.tsx 引 `@/client/generated/client.css`，那份是
  // gitignored 的生成物，只有 ui 包自己的 build（scripts/build-css.mjs）会写它。漏掉这一步的症状
  // 是下面那条 rspack 在编译期找不到模块，而不是这里少跑了一条命令。
  await run('pnpm', ['--filter', '@hibernalglow/xaihi-ui', 'build'])
  await run('pnpm', ['--filter', '@hibernalglow/xaihi-ui', 'exec', 'rspack', 'build', '--config', join(repo, 'desktop/standalone/rspack.config.mjs')])
  const graph = JSON.parse(readFileSync(join(output, 'ui', product.remote, 'module-graph.json'), 'utf8'))
  assertKisakiGraph(graph)
  const native = stageNativeResources({ repo, destination: join(output, 'native'), native: product.native, platform, arch })
  writeFileSync(join(output, 'product.json'), JSON.stringify({ ...product, nativeResources: native }, null, 2) + '\n')
  console.log(`产品资源已生成：${output}（${native.platform}-${native.arch}）`)
} else if (['profile', 'check', 'launch'].includes(mode)) {
  await run('node', [join(repo, 'desktop/dev-shell.mjs'), mode, ...options])
} else {
  throw new Error('用法：node desktop/product.mjs <build|profile|check|launch> [kisaki] [--platform <p> --arch <a>]')
}
