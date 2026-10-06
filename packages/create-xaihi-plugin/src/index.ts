/**
 * 节点包脚手架。
 *
 * 生成物的两条硬约束由模板本身保证（不是靠人记）：
 * 1. 每个可安装包自带 `cordis.patch.yml`（插件即 bundle，否则 profile 与桌面
 *    Plugins 页都不认）；
 * 2. 所有 `@deepseek-ai/*` 精确钉版本，`@hibernalglow/xaihi-sdk` 在仓内用
 *    `workspace:*`、发布期由 `--sdk-version` 换成真实版本（profile 解析不了
 *    `workspace:*`，见 ADR-0002）。
 *
 * @module create-xaihi-plugin
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 与全仓一致的钉版线。 */
export const DSH_LINE = '0.2.0-rc.2'

/** 一次生成的输入。 */
export interface ScaffoldInput {
  /** kebab-case 短名，同时决定包名、行 id 与 remote 名。 */
  name: string
  /** 节点 id（`xaihi.node/v1` 的 nodeId 与工具名前缀）。 */
  nodeId: string
  titleZh: string
  titleEn: string
  /** SDK 依赖写法：仓内 workspace 协议或发布期版本。 */
  sdkVersion: string
}

/** 校验一个可用的短名。 */
export function assertName(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`create-xaihi-plugin: name must be kebab-case ([a-z0-9-]), got "${name}"`)
  }
}

const remoteName = (name: string): string => name.replace(/-/g, '')

/** 生成 package.json 内容。 */
export function packageJsonOf(input: ScaffoldInput): string {
  const pkg = {
    name: `@hibernalglow/xaihi-${input.name}`,
    version: '0.0.0',
    description: `Xaihi node ${input.titleEn}: backend actions plus a self-owned workspace panel.`,
    license: 'MIT',
    type: 'module',
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
    exports: {
      '.': { types: './lib/index.d.ts', default: './lib/index.js' },
      './locale/*.json': './locale/*.json',
      './cordis.patch.yml': './cordis.patch.yml',
      './package.json': './package.json',
    },
    files: ['lib/**', 'dist/**', 'locale/*.json', 'cordis.patch.yml', 'package.json'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    xaihi: {
      schema: 'xaihi.manifest/1',
      id: `xaihi-${input.name}`,
      title: { zh: input.titleZh, en: input.titleEn },
      ui: { remote: remoteName(input.name), entry: './dist/remoteEntry.js' },
      panels: [{
        id: `xaihi.workspace.${remoteName(input.name)}`,
        title: { zh: `${input.titleZh}面板`, en: `${input.titleEn} panel` },
        area: 'workspace',
        remote: remoteName(input.name),
        export: 'Panel',
      }],
      node: nodeDefinitionOf(input),
    },
    scripts: {
      build: 'tsdown && rspack build',
      typecheck: 'tsc --noEmit',
      'test:unit': 'vitest run',
      clean: 'rm -rf lib dist',
    },
    engines: { node: '^22.19.0 || >=24.0.0' },
    dependencies: { '@deepseek-ai/schemastery': '~3.18.4' },
    peerDependencies: {
      '@deepseek-ai/cordis': '~4.0.4',
      '@deepseek-ai/dsh-tools': DSH_LINE,
    },
    devDependencies: {
      '@deepseek-ai/cordis': '~4.0.4',
      '@deepseek-ai/dsh-tools': DSH_LINE,
      '@deepseek-ai/schemastery': '~3.18.4',
      '@hibernalglow/xaihi-sdk': input.sdkVersion,
      '@module-federation/enhanced': '2.9.2',
      '@rspack/cli': '2.2.8',
      '@rspack/core': '2.2.8',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.7',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      tsdown: '^0.22.2',
      typescript: '^6.0.3',
      vitest: '^4.1.11',
    },
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

/** 生成的最小节点定义（一个动作，够接线；真实字段由人补）。 */
function nodeDefinitionOf(input: ScaffoldInput): Record<string, unknown> {
  return {
    definitionVersion: 1,
    nodeId: input.nodeId,
    title: { zh: input.titleZh, en: input.titleEn },
    description: { zh: `${input.titleZh}（脚手架初始定义）`, en: `${input.titleEn} (scaffold initial definition)` },
    actions: [{ id: 'run', label: { zh: '执行', en: 'Run' } }],
    fields: [{ id: 'target', kind: 'text', label: { zh: '目标', en: 'Target' }, rules: [{ rule: { type: 'nonBlank' } }] }],
    groups: [{ id: 'main', fieldIds: ['target'] }],
    inputBindings: [{ fieldId: 'target', slot: 'target', transform: 'trim' }],
    danger: { type: 'none' },
    reportsProgress: false,
    publishesOutputPath: false,
  }
}

/** 每个文件的内容表。 */
export function filesOf(input: ScaffoldInput): Record<string, string> {
  const remote = remoteName(input.name)
  return {
    'package.json': packageJsonOf(input),
    'cordis.patch.yml': `# 节点自带一行：插件即 bundle（无 patch 的依赖会被 profile 与 Plugins 页拒绝）。\n# 行的 id 必须等于 package.json#xaihi.id。\n- insert:\n    - id: xaihi-${input.name}\n      name: '@hibernalglow/xaihi-${input.name}'\n`,
    'tsdown.config.ts': `import { defineConfig } from 'tsdown'\n\n/** 宿主半边；SDK 与 dsh-tools 的关系见 node-sdk 的说明。 */\nexport default defineConfig({\n  entry: ['src/index.ts'],\n  outDir: 'lib',\n  format: ['esm'],\n  platform: 'node',\n  target: 'es2024',\n  dts: true,\n  clean: true,\n  fixedExtension: false,\n  noExternal: ['@hibernalglow/xaihi-sdk'],\n  external: ['@deepseek-ai/dsh-tools'],\n})\n`,
    'rspack.config.mjs': `import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'\n\n// shared.import:false ⇒ 拿不到宿主 React 就硬失败，绝不允许自带第二份。\n// name 必须等于 package.json#xaihi.ui.remote。\nconst reactShared = { singleton: true, requiredVersion: '^18.3.1', import: false }\n\nexport default {\n  mode: 'production',\n  // rspack 要求一个入口；契约在 exposes 里，这个文件不会被运行时消费。\n  entry: './frontend/container-entry.ts',\n  output: { path: new URL('dist/', import.meta.url).pathname, clean: true, publicPath: 'auto' },\n  resolve: { extensions: ['.tsx', '.ts', '.js'] },\n  module: {\n    rules: [\n      {\n        test: /\\.tsx?$/,\n        use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } } } }],\n        type: 'javascript/auto',\n      },\n    ],\n  },\n  plugins: [\n    new ModuleFederationPlugin({\n      name: '${remote}',\n      filename: 'remoteEntry.js',\n      exposes: { './Panel': './frontend/Panel.tsx' },\n      shared: { react: reactShared, 'react-dom': reactShared },\n      dts: false,\n    }),\n  ],\n}\n`,
    'tsconfig.json': `{\n  "extends": "../../tsconfig.base.json",\n  "compilerOptions": {\n    "types": ["node"]\n  },\n  "include": ["src", "frontend", "rspack.config.mjs"]\n}\n`,
    'src/core.ts': `/**\n * ${input.titleEn} 的纯逻辑。把节点内核搬进来时保持无宿主依赖：\n * 文件、进程、权限都由 DSH 的服务提供，调用方在 src/index.ts 里接线。\n */\nexport function run(target: string): string {\n  return \`${remote}: \${target}\`\n}\n`,
    'src/index.ts': `/**\n * ${input.titleEn} 的宿主半边：定义 + 实现接到 DSH 的工具与危险闸门上。\n *\n * 节点定义只有一份真源：\`package.json#xaihi.node\`。清单、装载期校验与工具注册都读它，\n * 所以"面板上看得见但工具少了"这类分叉不可能出现。config 字段在使用点 .get()，\n * 改配置不必重启；定义不合法时 defineNode 在装载期抛全部问题。\n */\n\nimport { createRequire } from 'node:module'\nimport type { Context, Volatile } from '@deepseek-ai/cordis'\nimport Schema from '@deepseek-ai/schemastery'\nimport { defineNode, OPERATIONS_SERVICE, type OperationJournal } from '@hibernalglow/xaihi-sdk'\nimport { run } from './core.ts'\n\nexport const name = '@hibernalglow/xaihi-${input.name}'\n\nexport const inject = ['tools']\n\nexport interface Config {\n  /** 追加到结果前缀的标签，用于验证配置真的被读到。 */\n  label: Volatile<string>\n}\n\nexport const Config = Schema.object({\n  label: Schema.string().default('${input.name}').volatile(),\n})\n\n/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */\nfunction ownNodeDefinition(): unknown {\n  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }\n  const node = pkg.xaihi?.node\n  if (node === undefined) throw new Error(\`\${name}: package.json#xaihi.node is missing\`)\n  return node\n}\n\nexport function apply(ctx: Context, config: Config): void {\n  defineNode(ctx, {\n    definition: ownNodeDefinition(),\n    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。\n    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,\n    handlers: {\n      async run({ inputs }) {\n        return \`\${config.label.get()}: \${run(String(inputs.target ?? ''))}\`\n      },\n    },\n  })\n}\n`,
    'frontend/container-entry.ts': `/**\n * 容器入口占位。rspack 要求一个入口；契约在 rspack.config.mjs 的 exposes 里，\n * 运行时不会执行这个文件。\n */\nexport {}\n`,
    'frontend/Panel.tsx': `/**\n * ${input.titleEn} 的工作面板。\n *\n * 只导出组件与 Probe：Probe 是宿主校验 React 同一性用的，不是装饰。\n * 面板不建自己的 React root、不写自己的颜色 token、不碰主题。\n */\nimport * as React from 'react'\nimport type { PanelProps } from '@hibernalglow/xaihi-sdk'\n\nexport const Probe = { react: React, version: React.version }\n\nexport default function Panel({ contribution, locale }: PanelProps): React.ReactElement {\n  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en\n  const [value, setValue] = React.useState('')\n  return (\n    <div style={{ padding: 12, display: 'grid', gap: 8 }}>\n      <strong>{title}</strong>\n      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={locale === 'zh' ? '目标' : 'Target'} />\n      <span style={{ fontSize: 12, opacity: 0.7 }}>{value || (locale === 'zh' ? '（待填）' : '(empty)')}</span>\n    </div>\n  )\n}\n`,
    'locale/en.json': `${JSON.stringify({ meta: { title: `Xaihi ${input.titleEn}`, description: `Xaihi node ${input.titleEn}: actions plus a workspace panel.` } }, null, 2)}\n`,
    'locale/zh.json': `${JSON.stringify({ meta: { title: `Xaihi ${input.titleZh}`, description: `Xaihi 节点「${input.titleZh}」：动作 + 工作台面板。` } }, null, 2)}\n`,
    'tests/core.spec.ts': `/** 起步测试：定义合法性与"当前实现就是这个"各钉一颗钉子，替换内核时它会红。 */\nimport { readFileSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { describe, expect, it } from 'vitest'\nimport { validateNodeDefinition } from '@hibernalglow/xaihi-sdk'\nimport { run } from '../src/core.ts'\n\ndescribe('${input.name}', () => {\n  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {\n    const path = fileURLToPath(new URL('../package.json', import.meta.url))\n    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }\n    const result = validateNodeDefinition(pkg.xaihi?.node)\n    expect(result.ok ? true : result.errors).toBe(true)\n  })\n\n  it('run 的当前行为（换成真内核之后，请把这条改成真期望）', () => {\n    expect(run('abc')).toBe('${remote}: abc')\n  })\n})\n`,
    'README.md': `# @hibernalglow/xaihi-${input.name}\n\n脚手架生成的 Xaihi 节点包。四件事各自有出处：\n\n- \`package.json#xaihi\`：贡献清单（\`xaihi.manifest/1\`）与 \`xaihi.node/v1\` 定义\n- \`cordis.patch.yml\`：自带一行（插件即 bundle）\n- \`src/index.ts\`：\`defineNode\` 接线，危险闸门交给 DSH 的 approval 缝\n- \`frontend/\`：自带 UI 产物（\`dist/remoteEntry.js\`），React 由宿主提供\n\n本仓内开发：\`pnpm -r run build\` 之后 \`dsh plugin --profile xaihi add file:$(pwd)\`。\n`,
  }
}

/** 写到一个目录；已存在的文件一律不覆盖（避免盖掉人改过的节点）。 */
export function scaffold(input: ScaffoldInput, targetDir: string): string[] {
  assertName(input.name)
  if (existsSync(join(targetDir, 'package.json'))) throw new Error(`create-xaihi-plugin: ${targetDir} already has a package.json`)
  const written: string[] = []
  for (const [relative, content] of Object.entries(filesOf(input))) {
    const absolute = join(targetDir, relative)
    mkdirSync(join(absolute, '..'), { recursive: true })
    writeFileSync(absolute, content)
    written.push(relative)
  }
  return written
}

/** CLI 入口参数解析（不引任何参数库）。 */
export function parseArgs(argv: readonly string[]): ScaffoldInput & { targetDir: string } {
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index] ?? ''
    if (item.startsWith('--')) {
      flags[item.slice(2)] = argv[index + 1] ?? ''
      index += 1
      continue
    }
    positional.push(item)
  }
  const name = positional[0] ?? flags['name'] ?? ''
  assertName(name)
  return {
    name,
    nodeId: flags['node-id'] ?? name.replace(/-/g, ''),
    titleZh: flags['title-zh'] ?? name,
    titleEn: flags['title-en'] ?? name,
    sdkVersion: flags['sdk-version'] ?? 'workspace:*',
    targetDir: flags['dir'] ?? positional[1] ?? `./plugins/${name}`,
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const written = scaffold(options, options.targetDir)
  console.log(`create-xaihi-plugin: wrote ${written.length} files into ${options.targetDir}`)
  for (const file of written) console.log(`  ${file}`)
}

if (process.argv[1] !== undefined && process.argv[1].includes('create-xaihi-plugin')) main()
