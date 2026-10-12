#!/usr/bin/env node
/**
 * 拼出"工作台随包载荷"：把工作台的文档产物与它要的那几个 bundle 收成一个自足的目录。
 *
 * 为什么要它：包里今天只有上游那套组合（`rg -a -c 'xaihi-core' app.asar` = 0），
 * 而桌面 profile 的初始依赖来自随包的 tarball 集、bundle 列表写死在上游常量里
 * （`apps/desktop/src/project-manager.ts:136-142`）。所以本地跑得通的那套组合
 * （`dev-shell.mjs` 往 profile 写 `xaihi-core.uiBundleDir` + 启用我们的 bundles）
 * 要变成"装完即用"，就得把这些东西先拼成一个**随包目录**，再让包在铺 profile 时读它。
 *
 *   node desktop/desktop-payload.mjs build [--out <目录>]
 *   node desktop/desktop-payload.mjs check --out <目录>
 *
 * 落盘形状（`--out` 默认 `desktop/.products/xaihi-desktop`）：
 *   ui/            工作台文档产物（`pnpm --filter @hibernalglow/xaihi-ui build:document`）
 *   packs/<name>/  每个 bundle 的**目录形态**（含 package.json 与 lib/）——用目录而不是 .tgz：
 *                  `file:` 装目录在 pnpm 里是拷贝，且不必处理 `workspace:*` 的版本改写。
 *   profile.json   bundles 列表 + core 的配置（`uiBundleDir` 用**相对本目录**的写法）
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePackageManager, shellCommandLine } from './standalone/package-manager.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const mode = argv[0] ?? 'build'
const outIndex = argv.indexOf('--out')
const out = resolve(outIndex === -1 ? join(repo, 'desktop/.products/xaihi-desktop') : argv[outIndex + 1])

/** 工作台要的那套组合。与 `.scratch/dsh-xaihi-desktop-home/profiles/xaihi` 实测就绪的那份一致。 */
const BUNDLES = [
  '@hibernalglow/xaihi-core',
  '@hibernalglow/xaihi-ui',
  '@hibernalglow/xaihi-linedup',
  '@hibernalglow/xaihi-sleept',
  '@hibernalglow/xaihi-dissolvef',
]

function run (command, args) {
  const target = resolvePackageManager(command)
  const result = spawnSync(target.command, target.shell ? [shellCommandLine(args)] : args, {
    cwd: repo, stdio: 'inherit', env: process.env, shell: target.shell,
  })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 退出：${String(result.status ?? result.signal)}`)
}

/**
 * 构建前点名"别名表缺了改名族"这件事。
 *
 * 界面里写的是改名后的 `@hibernalglow/xaihi-<id>/<leaf>`，而 `rspack.document.mjs` 只认
 * `tsconfig.ported.json` 里有的键 ⇒ 缺那一族时构建会以 30 条 `Can't resolve '@hibernalglow/xaihi-…'` 收场，
 * 症状指向"模块不存在"（假的：源码一直在），而归因要读生成器才知道。这一族有自己的产出规则
 * （实测两种下游自补都不等价：只补 `@xiranite/node-*` 少 10 条；按作用域整体换名只与它重合 10 条），
 * 所以这里**只报不补**：整族缺席时立刻红并点名，正解是生成器那一处产出孪生名。
 * @returns {void}
 */
function preflightNodeLeaves () {
  const table = JSON.parse(readFileSync(join(repo, 'packages/ui-host/tsconfig.ported.json'), 'utf8')).compilerOptions?.paths ?? {}
  const keys = Object.keys(table)
  const twins = keys.filter(key => key.startsWith('@hibernalglow/xaihi-'))
  if (twins.length > 0) {
    console.log(`载荷预检：别名表含 ${String(twins.length)} 条改名族键（共 ${String(keys.length)} 键）`)
    return
  }
  const imported = new Set()
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) { walk(path); continue }
      if (!/\.tsx?$/u.test(entry.name)) continue
      for (const match of readFileSync(path, 'utf8').matchAll(/["'](@hibernalglow\/xaihi-[a-z0-9-]+\/[^"']+)["']/gu)) imported.add(match[1])
    }
  }
  walk(join(repo, 'packages/ui-host/src'))
  const needsTable = [...imported].filter((spec) => {
    // `@hibernalglow/xaihi-<id>/<leaf>`：包名带 `xaihi-` 前缀，而源码目录是 `plugins/<id>`。
    const [, scopedName, ...rest] = spec.split('/')
    const id = String(scopedName).replace(/^xaihi-/u, '')
    const manifest = join(repo, 'plugins', id, 'package.json')
    if (!existsSync(manifest)) return false
    const exported = Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).exports ?? {})
    return !exported.includes(`./${rest.join('/')}`)
  }).sort()
  throw new Error(`载荷预检：别名表里没有任何改名族键，而界面源码引了 ${String(needsTable.length)} 条只能靠它解析的边，`
    + `例如 ${needsTable.slice(0, 5).join('、')}。这一族由 build-aliases.mjs 产出（生成器那一处修），不要在载荷侧自补。`)
}

/**
 * 别名表只在"它是在别的机器上生成的"时候才重生成。
 *
 * 那份表签进仓时带的是生成机上指向 `plugins/**` 的**绝对路径**（生成器只把 `packages/` 下的目标相对化）
 * ⇒ runner 上 `path.resolve` 会指到不存在的目录，症状是"命中别名却找不到模块"。按检出重生成能修它；
 * 但**无条件**重生成会把别人刚落进仓库、已含"改名族键"的那张表（用他们自己那版生成器现算的）抹回旧形状，
 * 于是我要的键又不见了。判据就取"表里还有没有绝对路径"：有才重生成，没有就原样用仓库里那张。
 * @returns {void}
 */
function regenerateAliasTableIfNeeded () {
  const table = join(repo, 'packages/ui-host/tsconfig.ported.json')
  const paths = JSON.parse(readFileSync(table, 'utf8')).compilerOptions?.paths ?? {}
  const absolute = Object.values(paths).filter((value) => typeof value?.[0] === 'string' && value[0].startsWith('/')).length
  if (absolute === 0) {
    console.log('载荷：别名表里没有绝对路径，跳过重生成（保留仓库里那张）')
    return
  }
  console.log(`载荷：别名表含 ${String(absolute)} 条绝对路径，按检出重生成`)
  run('node', [join(repo, 'packages/ui-host/build-aliases.mjs'), '--write'])
}

/** 从各包的 package.json 找到它的目录，并确认构建产物在场——缺了要在拼载荷时就红，不留到运行期。 */
function packageDir (name) {
  const directory = name.startsWith('@hibernalglow/xaihi-')
    ? join(repo, name === '@hibernalglow/xaihi-ui' ? 'packages/ui-host' : name === '@hibernalglow/xaihi-core' ? 'packages/core' : `plugins/${name.slice('@hibernalglow/xaihi-'.length)}`)
    : undefined
  if (directory === undefined || !existsSync(join(directory, 'package.json'))) {
    throw new Error(`载荷：找不到 ${name} 的源目录（约定 packages/core、packages/ui-host、plugins/<id>）`)
  }
  return directory
}

if (mode === 'build') {
  run('pnpm', ['--filter', '@hibernalglow/xaihi-core', 'build'])
  // 干净检出的隐藏前置（与 product.mjs 同一条）：`build:document` 吃的 `client.css` 是 gitignored 的生成物，
  // 只有 ui 包自己的 `build`（scripts/build-css.mjs）会写它。
  //
  // 这里**不**调 `pnpm --filter … build`：那条脚本的第三步 `check-client-bundle` 是一把闸门、不是生产者，
  // 而它在 Windows 上会因为"尺自己站错位置"判缺产物（云上实测 `缺 \D:\a\Xaihi\Xaihi\packages\ui-host\lib/client.js`，
  // 而 tsdown 上一行刚写完文件）⇒ 整条载荷步在 Windows 上红。那把尺的修在 `windows-build-path-portability`
  // 那条 lane 上（同一个文件，我不去抢）；载荷只要产物，闸门照旧由 CI 其它腿量。
  run('pnpm', ['--filter', '@hibernalglow/xaihi-ui', 'exec', 'node', 'scripts/build-css.mjs'])
  run('pnpm', ['--filter', '@hibernalglow/xaihi-ui', 'exec', 'tsdown'])
  // 文档产物的别名**从 `tsconfig.ported.json` 现读**（`rspack.document.mjs` 的 `aliasesFromTsconfig`），
  // 而那份签进仓的表里指向 `plugins/<node>/src/<leaf>.ts` 的值是**本机绝对路径**
  // （生成器只把 `packages/` 下的目标相对化）⇒ 在 runner 上 `path.resolve` 会指到不存在的目录，
  // 症状是"命中别名却找不到模块"（云上实测一条 Component 一处，共 11 条）。按检出重生成一次再构建，
  // 与 `ci.yml`/本 workflow 里给 typecheck 腿加的那步同源。
  regenerateAliasTableIfNeeded()
  preflightNodeLeaves()
  run('pnpm', ['--filter', '@hibernalglow/xaihi-ui', 'build:document'])
  for (const name of BUNDLES) if (name !== '@hibernalglow/xaihi-core' && name !== '@hibernalglow/xaihi-ui') {
    run('pnpm', ['--filter', name, 'build'])
  }

  rmSync(out, { recursive: true, force: true })
  mkdirSync(join(out, 'packs'), { recursive: true })
  cpSync(join(repo, 'packages/ui-host/dist-ui'), join(out, 'ui'), { recursive: true })

  for (const name of BUNDLES) {
    const source = packageDir(name)
    const destination = join(out, 'packs', name.slice('@hibernalglow/'.length))
    for (const entry of ['package.json', 'lib', 'dist', 'locale', 'cordis.patch.yml']) {
      if (existsSync(join(source, entry))) cpSync(join(source, entry), join(destination, entry), { recursive: true })
    }
    if (!existsSync(join(destination, 'lib', 'index.js'))) {
      throw new Error(`载荷：${name} 没有 lib/index.js，先确认它自己的 build 跑过`)
    }
  }

  writeFileSync(join(out, 'profile.json'), `${JSON.stringify({
    schemaVersion: 1,
    bundles: BUNDLES,
    coreConfig: {
      uiBundleDir: 'ui',
      verbose: false,
    },
  }, null, 2)}\n`)
  console.log(`载荷已生成：${out}（${String(BUNDLES.length)} 个 bundle + 工作台产物）`)
} else if (mode === 'check') {
  const manifest = join(out, 'profile.json')
  if (!existsSync(manifest)) throw new Error(`载荷 check：${manifest} 不在`)
  const profile = JSON.parse(readFileSync(manifest, 'utf8'))
  const missing = []
  if (!existsSync(join(out, profile.coreConfig.uiBundleDir))) missing.push(profile.coreConfig.uiBundleDir)
  for (const name of profile.bundles) {
    if (!existsSync(join(out, 'packs', name.slice('@hibernalglow/'.length), 'lib/index.js'))) {
      missing.push(`packs/${name.slice('@hibernalglow/'.length)}/lib/index.js`)
    }
  }
  if (missing.length > 0) throw new Error(`载荷 check：缺 ${missing.join('、')}`)
  console.log(`载荷 check OK：${out}（${String(profile.bundles.length)} 个 bundle + 工作台产物在场）`)
} else {
  throw new Error(`用法：node desktop/desktop-payload.mjs <build|check> [--out <目录>]（收到 ${mode}）`)
}
