/**
 * 节点包脚手架。
 *
 * 生成物的三条硬约束由模板本身保证（不是靠人记）：
 * 1. 每个可安装包自带 `cordis.patch.yml`（插件即 bundle，否则 profile 与桌面
 *    Plugins 页都不认）；
 * 2. 所有 `@deepseek-ai/*` 精确钉版本，`@hibernalglow/xaihi-sdk` 在仓内用
 *    `workspace:*`、发布期由 `--sdk-version` 换成真实版本（profile 解析不了
 *    `workspace:*`，见 ADR-0002）；
 * 3. 每个包自带终端面：`src/cli.ts` + `src/help.ts` + `src/cli-support.ts` +
 *    `tests/cli.spec.ts` + `vitest.config.ts`，连着 `package.json` 的 `bin` 与
 *    `./cli`、`./help` 两条 subpath 以及 tsdown 的三入口。
 *
 * 终端支撑那份 vendored 文件**读 `plugins/linedup/src/cli-support.ts` 再生成**，只改
 * `@module` 一行：`scripts/check-vendored.mjs` 对 13 份拷贝做逐字节比对，在脚手架里再手写
 * 一份就是凭空多出第 14 个漂移源。找不到那份文件时直接炸——静默发一个没有终端面的包，
 * 症状是"新节点少一个面，而没人知道是从哪一步少的"。
 *
 * @module create-xaihi-plugin
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  /**
   * 生成**独立仓**那一档：插件包按 D7 的口径将来要能单独成仓，而默认那份
   * `tsconfig.json` 的 `extends: "../../tsconfig.base.json"` 只在 Xaihi 工作树里成立。
   * 在仓库外的目录里实测过（`.scratch/xaihi-scaffold-e2e/demo`，2026-10-07）：
   * 不改一行 `pnpm run build` 就死在 `get-tsconfig` 的 `readTsconfig` 里
   * （tsdown 的 dts 插件读它），`typecheck` rc=2、`test:unit` rc=1——三件都是同一个缺文件的下游。
   * 打开这一档时额外写一份 `tsconfig.base.json` 快照，并把 extends 改成 `./tsconfig.base.json`。
   */
  standalone: boolean
}

/**
 * `--standalone` 落进生成物里的那份基线快照。
 *
 * 为什么是快照而不是"运行时去读仓根那份"：脚手架要能在发布形态（`pnpm dlx`）下跑，
 * 那时仓根不存在；而"两份编译器约定会漂"这件事不该靠生成时读文件来防，
 * 应该由**本仓的测试**钉住（`tests/scaffold.spec.ts` 里那条 deepStrictEqual），
 * 漂了在 CI 里红，而不是在使用者的机器上以"extends 指向一个不存在的文件"出现。
 */
export const STANDALONE_TSCONFIG_BASE = `{
  "compilerOptions": {
    "target": "es2024",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2024", "dom", "dom.iterable"],
    "jsx": "react-jsx",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
`

/** 校验一个可用的短名。 */
export function assertName(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`create-xaihi-plugin: name must be kebab-case ([a-z0-9-]), got "${name}"`)
  }
}

const remoteName = (name: string): string => name.replace(/-/g, '')

/** 单引号字面量：使用者的标题里带 `'` 时不许把生成的文件劈开。 */
const sq = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * bin 名沿用 vendored 支撑里的 `nodeCliName`（`x<nodeId>`），聚合 CLI 与 `--help`
 * 里的用法行才不会各说一套。
 */
export const binNameOf = (input: ScaffoldInput): string => `x${input.nodeId}`

/** 宿主侧无模型入口的名字（`ctx.commands`），与 `nodeHelpFromManifest` 的默认推导同源。 */
export const hostCommandOf = (input: ScaffoldInput): string => `/${input.nodeId}`

/**
 * 脚手架初始的动作清单。清单与终端面都读这一份：两处各写一次迟早漂成
 * "`--help` 里有 `run`，`package.json#xaihi.node` 里没有"。
 */
export function initialActions(): Array<{ id: string; label: { zh: string; en: string } }> {
  return [{ id: 'run', label: { zh: '执行', en: 'Run' } }]
}

/** 节点标题（清单与模板共用，避免第二个真源）。 */
const nodeTitleOf = (input: ScaffoldInput): { zh: string; en: string } => ({ zh: input.titleZh, en: input.titleEn })

/** 脚手架初始的描述：明写"初始定义"，免得生成物被读成已经搬完的内核。 */
const nodeDescriptionOf = (input: ScaffoldInput): { zh: string; en: string } => ({
  zh: `${input.titleZh}（脚手架初始定义）`,
  en: `${input.titleEn} (scaffold initial definition)`,
})

/** vendored 终端支撑在仓里的位置；相对仓根写，仓根从模块目录与 cwd 各往上找一次。 */
const VENDORED_CLI_SUPPORT = join('plugins', 'linedup', 'src', 'cli-support.ts')

/**
 * 读仓里已有的那份 vendored 支撑，只把 `@module` 换成新包的名字，其余一个字节都不动。
 * @throws 找不到文件或那份文件没有 `@module` 行时点名路径炸；绝不静默缺终端面。
 */
export function vendoredCliSupportOf(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const roots = [resolve(here, '..', '..', '..'), resolve(process.cwd())]
  for (const root of roots) {
    const candidate = join(root, VENDORED_CLI_SUPPORT)
    if (!existsSync(candidate)) continue
    const text = readFileSync(candidate, 'utf8')
    if (!/^[^\S\n]*\*[^\S\n]*@module[^\S\n]+\S+/m.test(text)) {
      throw new Error(`create-xaihi-plugin: ${candidate} 没有 @module 行，无法按包名重写（vendored 件自己漂了，先修它）`)
    }
    return text.replace(/^([^\S\n]*\*[^\S\n]*@module[^\S\n]+)\S+[ \t]*$/m, `$1xaihi-${name}/cli-support`)
  }
  throw new Error(
    `create-xaihi-plugin: 找不到 vendored 终端支撑 ${VENDORED_CLI_SUPPORT}（在 ${roots.join(' / ')} 下各找了一次）。`
    + '终端面不许静默缺件：先恢复那份文件，再生成。',
  )
}

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
      // 聚合 CLI 按 `{包名}/cli` 取 `cli`、按 `{包名}/help` 取 `help`（packages/cli/src/index.ts
      // 的 loadNodeCli / loadNodeHelp），两条 subpath 缺一条就是"节点在列表里但跑不起来"。
      './cli': { types: './lib/cli.d.ts', default: './lib/cli.js' },
      './help': { types: './lib/help.d.ts', default: './lib/help.js' },
      './locale/*.json': './locale/*.json',
      './cordis.patch.yml': './cordis.patch.yml',
      './package.json': './package.json',
    },
    bin: { [binNameOf(input)]: './lib/cli.js' },
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
      '@types/node': '^22.20.0',
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
    title: nodeTitleOf(input),
    description: nodeDescriptionOf(input),
    actions: initialActions(),
    fields: [{ id: 'target', kind: 'text', label: { zh: '目标', en: 'Target' }, rules: [{ rule: { type: 'nonBlank' } }] }],
    groups: [{ id: 'main', fieldIds: ['target'] }],
    inputBindings: [{ fieldId: 'target', slot: 'target', transform: 'trim' }],
    danger: { type: 'none' },
    reportsProgress: false,
    publishesOutputPath: false,
  }
}

/** 终端面 `src/cli.ts`：动作名单从清单推，不能执行的那一半响亮拒绝（退出码 2）。 */
export function cliTsOf(input: ScaffoldInput): string {
  const hostCommand = hostCommandOf(input)
  const actions = initialActions()
  const descriptionEn = nodeDescriptionOf(input).en
  const actionIds = actions.map((action) => sq(action.id)).join(', ')
  const blocks = actions.map((action) => `      ${action.id}: defineCommand({
        meta: { name: ${sq(action.id)}, description: ${sq(action.label.en)} },
        args: actionArgs(),
        async run ({ args }) {
          await runHostedAction(${sq(action.id)}, args, host)
        },
      }),`).join('\n')

  return `#!/usr/bin/env node
/**
 * ${input.titleEn} 的终端面（脚手架档）。
 *
 * 形状对齐同批已迁节点里"只规划、不执行"那一档（对照 \`plugins/sleept/src/cli.ts\`）：
 * 面上有 \`package.json#xaihi.node.actions\` 的每条动作，\`--help\`、flag 拼法与退出码
 * 都按 vendored 支撑（\`src/cli-support.ts\`）定下的契约给；**动作本身在独立 bin 里一律
 * 拒绝执行**（退出码 2）。
 *
 * 为什么脚手架默认拒绝，而不是把 \`src/core.ts\` 跑一遍了事：脚手架给的 \`run()\` 是占位
 * 实现，动作真正的接线只在 \`src/index.ts\` 的 \`defineNode\` 里——工具注册挂在 DSH 的
 * \`tools\` 服务上（那文件的 \`export const inject = ['tools']\`），进度与运行记录在
 * xaihi-core 的 \`OPERATIONS_SERVICE\` 账本里。bin 不在宿主进程里，两样都拿不到；在这里
 * 把占位内核跑完再打印一行成功，等于把"这块内核还没搬"演成"这个节点已经能用"。
 *
 * 要点亮这一面：把 \`runHostedAction\` 里那句拒绝换成对 \`src/core.ts\` 的真实调用，前提
 * 是该动作不需要上面两样。\`ui\` / \`gd\` / \`guided\` 三条交互腿未接：全屏 TUI 在 OpenTUI
 * 上、引导流在 @clack 上，都不随本包发布（判据见 \`src/cli-support.ts\` 顶部）。三条腿留在
 * \`--help\` 里响亮拒绝，比静默消失好读——面板上少了才叫缺能力，写着"未接"只是还没搬。
 *
 * @module xaihi-${input.name}/cli
 */

import {
  canRunInteractiveCli,
  CliUsageError,
  createCliHost,
  defineCommand,
  nodeCliName,
  runNodeCliFace,
  runPipeProgram,
  writeError,
  writeJson,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'

const CLI_NAME = nodeCliName('${input.nodeId}')

/** 动作名单的唯一真源是 \`package.json#xaihi.node\`；这里只抄它的 id，别处不许再列一份。 */
const NODE_ACTIONS = [${actionIds}] as const

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 \`--help\` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: ${sq(descriptionEn)},
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

/** 派发形状对齐 vendored 支撑里的 \`runNodeCliFace\`（\`--help\` 短路与无参拒绝都在那儿）。 */
export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI）与引导流（@clack）都不随本包发布，'
      + '而本节点的动作本来就只接在宿主进程里（DSH 的 tools 服务）。',
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: ${sq(descriptionEn)} },
    subCommands: {
${blocks}
      // ↓ 上游面上有、本包没带的那三条腿：面在这儿，实现不在这儿。
      ui: defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.（未接）' },
        async run () {
          await runUnwiredFace('ui', host)
        },
      }),
      gd: defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.（未接）' },
        async run () {
          await runUnwiredFace('gd', host)
        },
      }),
      guided: defineCommand({
        meta: { name: 'guided', description: 'Compatibility alias for gd.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/** flag 名单就是清单里那一个字段（\`fields[0].id\`）；定义加字段时这里与 \`package.json\` 一起动。 */
function actionArgs () {
  return {
    target: { type: 'string', description: 'Value for the "target" field of package.json#xaihi.node.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 为什么不能在 bin 里执行。\`--json\` 的载荷与 stderr 用同一句话，不分叉。
 * 缺的那两样要点名到服务名：只说"不支持"，使用者无从判断是内核没搬还是宿主没起。
 */
const REFUSAL = '本节点的动作只接在宿主进程里：工具注册在 DSH 的 tools 服务上，进度与运行记录在 '
  + 'xaihi-core 的 OPERATIONS_SERVICE 账本里，而脚手架给的 src/core.ts 还是占位实现。'
  + \`无模型的入口请用宿主侧的 \\\`${hostCommand}\\\`（ctx.commands）；要点亮这一条，先把内核换成真实现。\`

async function runHostedAction (action: string, args: CliArgs, host: CliHost): Promise<void> {
  // 名单就是上面那一份：动作没登记却走到这里，先炸，不要让拒绝文案自己漂出去。
  if (!(NODE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(\`\${CLI_NAME}: "\${action}" 不在 package.json#xaihi.node.actions 里\`)
  }
  const target = typeof args.target === 'string' ? args.target : ''
  if (target === '') {
    // 不替定义里那条 nonBlank 规则编默认值：缺参就是一条用法错（退出码 2）。
    throw new CliUsageError(\`Missing --target for \\\`\${CLI_NAME} \${action}\\\`. 定义里字段 target 的规则是 nonBlank，不在这里替它猜一个。\`)
  }
  if (args.json === true) {
    writeJson(host, { node: '${input.nodeId}', action, target, executed: false, refused: REFUSAL })
  } else {
    writeError(host, \`\${CLI_NAME} \${action} 未接：\${REFUSAL}\`)
  }
  process.exitCode = 2
}

/**
 * 未接：\`ui\` / \`gd\` / \`guided\` 三条腿。原因点名到具体的包，并且**不做任何参数校验**——
 * 未接的功能先报"缺参"会把"这块内核没搬"说成"你参数没给对"。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(\`\${CLI_NAME}: "\${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支\`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, \`Guided mode requires an interactive terminal. Use \\\`\${CLI_NAME} --help\\\` for scripted use.\`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上，本包不引它'
    : '引导流的字段表在 @clack/prompts 上，本包不引它'
  writeError(host, \`\${CLI_NAME} \${name} 未接：\${what}。替代归属是工作台面板与宿主侧的 \\\`${hostCommand}\\\`（ctx.commands）。\`)
  process.exitCode = 2
}

/**
 * 自执行闸门：与同批节点同一写法（\`.bin\` 软链下 argv[1] 未必等于 \`import.meta.url\`，
 * 而聚合 CLI 引本模块时 argv[1] 是它自己的入口，两条都不该点亮）。
 */
const entry = process.argv[1] ?? ''
if (/\\bcli\\.[cm]?[jt]s$/.test(entry.replace(/\\\\/g, '/'))) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
`
}

/** 终端帮助载荷：从 `package.json#xaihi.node` 推，不抄第二份。 */
export function helpTsOf(input: ScaffoldInput): string {
  return `/**
 * ${input.titleEn} 的终端帮助载荷：**由 \`package.json#xaihi.node\` 推导**，不抄第二份。
 *
 * 手写一份 help.ts 就是把标题、描述与命令再誊一遍英文样板，那是会漂的第二真源——同批节点
 * 实测过：内容还是旧壳时代的，命令名连 bin 都对不上。推导器与它为什么叫 \`Terminal*\` 的
 * 说明在 \`@hibernalglow/xaihi-sdk\` 的 help.ts。
 *
 * 导出名 \`help\` 是聚合 CLI 定的：\`packages/cli/src/index.ts\` 里
 * \`interface NodeHelpModule { help?: NodeHelp }\`，按 \`{packageName}/help\` 动态装载。
 *
 * @module xaihi-${input.name}/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('${pkgNameOf(input)}: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: '${binNameOf(input)}', command: '${hostCommandOf(input)}' })
`
}

/**
 * 只跑本包自己的测试：判据与那次 3113 文件的实测记在 `plugins/linedup/vitest.config.ts`，
 * 生成的包不写这条就会把上游包自己的失败用例算到本包头上。
 */
export function vitestConfigOf(): string {
  return `import { defineConfig } from 'vitest/config'

/**
 * 只跑本包自己的 \`tests/**\` 与 \`src/**\`。
 *
 * 为什么不能靠默认值：vitest 的默认 include 是"仓库内所有 spec/test 文件"，而它的排除表
 * 抓不到 pnpm 的依赖仓库——真包躺在 \`node_modules/.pnpm/<pkg>/node_modules/<pkg>/…\`，
 * 祖先目录叫 \`<pkg>\` 而不是 \`node_modules\`。判据出自 \`plugins/linedup/vitest.config.ts\`
 * 里记着的那次实测（不写时收集到 3113 个文件，其中 21 个失败用例全是上游包自己的）。
 *
 * 只动 include，不加 exclude：多一挡遮蔽就多一处下次静默漏跑的地方。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
  },
})
`
}

/** 终端面的验收：断契约（`--help` 的名单、拒绝的退出码与那句理由），不断占位内核。 */
export function cliSpecOf(input: ScaffoldInput): string {
  const bin = binNameOf(input)
  const firstAction = initialActions()[0]?.id ?? 'run'
  return `/**
 * ${input.name} 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：动作名单来自 \`package.json#xaihi.node.actions\`（节点能力的唯一真源）；
 * "bin 里不执行"来自 \`src/index.ts\` 的 \`inject = ['tools']\` 与 node-sdk 的
 * \`OPERATIONS_SERVICE\`；退出码 2 与那句 \`No interactive terminal detected.\` 来自
 * \`src/cli-support.ts\` 的 \`runNodeCliFace\`。期望值全部手抄，不由被测函数现算。
 *
 * 阳性对照有三处：整条 \`guided\` 子命令删掉第一条立刻红（只 \`toContain\` 查不出这种漂移，
 * \`gd\` 的描述里就写着 "guided"）；\`declaredActions()\` 在清单空或形状漂时直接抛，而不是
 * 返回一串 \`undefined\` 让下面的循环假绿；把 \`runHostedAction\` 的拒绝换成"打印成功"，
 * 第三条立刻红。
 *
 * @module xaihi-${input.name}/tests/cli
 */

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'

/** 每个用例自己清一次退出码，否则一条用例的 \`process.exitCode\` 会脏到下一条。 */
afterEach(() => {
  process.exitCode = 0
})

function createHost (): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: true } as CliHost['stdin'],
    stdout: {
      isTTY: false,
      columns: 120,
      write (chunk: string) {
        stdout += chunk
        return true
      },
    },
    stderr: {
      isTTY: false,
      columns: 120,
      write (chunk: string) {
        stderr += chunk
        return true
      },
    },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}

/**
 * 动作名单的唯一真源。形状不对就直接抛，不是返回一串 \`undefined\` 继续往下走：
 * 否则"至少 1 条"的下界照样成立，循环里却全员拿着 \`undefined\` 去比，这条尺就成了假的。
 */
function declaredActions (): string[] {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    xaihi?: { node?: { actions?: Array<{ id?: unknown }> } }
  }
  const actions = manifest.xaihi?.node?.actions
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('package.json#xaihi.node.actions 缺失或为空：这条尺没有真源可比')
  }
  return actions.map((entry, index) => {
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(\`第 \${index} 条动作没有 id（真源形状漂了，不是断言该迁就的东西）\`)
    }
    return entry.id
  })
}

describe('${input.name} 终端面', () => {
  it('--help 把清单里的动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions.length, 'package.json#xaihi.node.actions 空了，下面的循环是假绿').toBeGreaterThan(0)

    // 只 \`toContain(名字)\` 会假绿：\`gd\` 那条腿的描述里就写着 "guided"，把子命令整条删掉
    // 也照样查不出来。所以按 Subcommands 表格那一行的形状认（两个空格 + 名字 + 空白）。
    const row = (name: string): RegExp => new RegExp(\`^  \${name} +\`, 'm')
    for (const action of actions) {
      expect(row(action).test(help), \`--help 的子命令表里没有动作 \${action}（清单与终端面漂了）\`).toBe(true)
    }

    // 未接的三条腿**留在面板上并标明未接**，不是删掉了事。
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), \`--help 的子命令表里没有未接的交互腿 \${leg}\`).toBe(true)
    }
    expect(help).toContain('未接')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('非 TTY 且无参数时拒绝，并给出 ${bin} --help 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('${bin}')
  })

  it('动作只拒绝不执行：executed=false，理由点名缺的那条 DSH 服务', async () => {
    for (const action of declaredActions()) {
      const host = createHost()
      await runProgram([action, '--target', 'abc', '--json'], host)
      expect(process.exitCode, \`\${action} 没执行却给了成功码\`).toBe(2)
      const report = JSON.parse(host.stdoutText()) as { action: string; executed: boolean; refused: string }
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把占位内核演成成功').toBe(false)
      expect(report.refused, '拒绝理由必须点名宿主侧那条服务，否则使用者不知道缺什么').toContain('tools')
      process.exitCode = 0
    }
  })

  it('不给 --target 就拒绝：不替定义里的 nonBlank 规则编一个默认值', async () => {
    const host = createHost()
    await runProgram(['${firstAction}'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode, '缺参必须红，不能猜默认值').not.toBe(0)
    expect(\`\${host.stdoutText()}\${host.stderrText()}\`).toContain('--target')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['${firstAction}', '--target', 'abc', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('三条未接的腿响亮拒绝（退出码 2，不是 0）', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, \`\${leg} 未接却报了成功码\`).toBe(2)
      expect(host.stderrText(), \`\${leg} 的拒绝里没说"未接"\`).toContain('未接')
      process.exitCode = 0
    }
  })
})
`
}

/** npm 包名（多处模板共用，拼一次）。 */
function pkgNameOf(input: ScaffoldInput): string {
  return `@hibernalglow/xaihi-${input.name}`
}

/** 每个文件的内容表。 */
export function filesOf(input: ScaffoldInput): Record<string, string> {
  const remote = remoteName(input.name)
  return {
    'package.json': packageJsonOf(input),
    'cordis.patch.yml': `# 节点自带一行：插件即 bundle（无 patch 的依赖会被 profile 与 Plugins 页拒绝）。\n# 行的 id 必须等于 package.json#xaihi.id。\n- insert:\n    - id: xaihi-${input.name}\n      name: '@hibernalglow/xaihi-${input.name}'\n`,
    'tsdown.config.ts': `import { defineConfig } from 'tsdown'\n\n/**\n * 宿主半边 + 终端半边三入口：\`src/index.ts\` 给 cordis 装载，\`src/cli.ts\` 是 \`bin\` 指的\n * 那份，\`src/help.ts\` 给聚合 CLI 按 \`{包名}/help\` 动态装载。少一条入口的症状是\n * "\`exports\` 里那条 subpath 指向一个不存在的 \`lib/cli.js\`"，所以要与 \`package.json\`\n * 的 exports 同批改。SDK 与 dsh-tools 的关系见 node-sdk 的说明。\n */\nexport default defineConfig({\n  entry: ['src/index.ts', 'src/cli.ts', 'src/help.ts'],\n  outDir: 'lib',\n  format: ['esm'],\n  platform: 'node',\n  target: 'es2024',\n  dts: true,\n  clean: true,\n  fixedExtension: false,\n  noExternal: ['@hibernalglow/xaihi-sdk'],\n  external: ['@deepseek-ai/dsh-tools'],\n})\n`,
    'rspack.config.mjs': `import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'\n\n// shared.import:false ⇒ 拿不到宿主 React 就硬失败，绝不允许自带第二份。\n// name 必须等于 package.json#xaihi.ui.remote。\nconst reactShared = { singleton: true, requiredVersion: '^18.3.1', import: false }\n\nexport default {\n  mode: 'production',\n  // rspack 要求一个入口；契约在 exposes 里，这个文件不会被运行时消费。\n  entry: './frontend/container-entry.ts',\n  output: { path: new URL('dist/', import.meta.url).pathname, clean: true, publicPath: 'auto' },\n  resolve: { extensions: ['.tsx', '.ts', '.js'] },\n  module: {\n    rules: [\n      {\n        test: /\\.tsx?$/,\n        use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } } } }],\n        type: 'javascript/auto',\n      },\n    ],\n  },\n  plugins: [\n    new ModuleFederationPlugin({\n      name: '${remote}',\n      filename: 'remoteEntry.js',\n      exposes: { './Panel': './frontend/Panel.tsx' },\n      shared: { react: reactShared, 'react-dom': reactShared },\n      dts: false,\n    }),\n  ],\n}\n`,
    'tsconfig.json': input.standalone
      ? `{\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": {\n    "types": ["node"]\n  },\n  "include": ["src", "frontend", "tests", "rspack.config.mjs"]\n}\n`
      : `{\n  "extends": "../../tsconfig.base.json",\n  "compilerOptions": {\n    "types": ["node"]\n  },\n  "include": ["src", "frontend", "tests", "rspack.config.mjs"]\n}\n`,
    ...(input.standalone ? { 'tsconfig.base.json': STANDALONE_TSCONFIG_BASE } : {}),
    'vitest.config.ts': vitestConfigOf(),
    'src/cli-support.ts': vendoredCliSupportOf(input.name),
    'src/cli.ts': cliTsOf(input),
    'src/core.ts': `/**\n * ${input.titleEn} 的纯逻辑。把节点内核搬进来时保持无宿主依赖：\n * 文件、进程、权限都由 DSH 的服务提供，调用方在 src/index.ts 里接线。\n */\nexport function run(target: string): string {\n  return \`${remote}: \${target}\`\n}\n`,
    'src/help.ts': helpTsOf(input),
    'src/index.ts': `/**\n * ${input.titleEn} 的宿主半边：定义 + 实现接到 DSH 的工具与危险闸门上。\n *\n * 节点定义只有一份真源：\`package.json#xaihi.node\`。清单、装载期校验与工具注册都读它，\n * 所以"面板上看得见但工具少了"这类分叉不可能出现。config 字段在使用点 .get()，\n * 改配置不必重启；定义不合法时 defineNode 在装载期抛全部问题。\n */\n\nimport { createRequire } from 'node:module'\nimport type { Context, Volatile } from '@deepseek-ai/cordis'\nimport Schema from '@deepseek-ai/schemastery'\nimport { defineNode, OPERATIONS_SERVICE, type OperationJournal } from '@hibernalglow/xaihi-sdk'\nimport { run } from './core.ts'\n\nexport const name = '@hibernalglow/xaihi-${input.name}'\n\nexport const inject = ['tools']\n\nexport interface Config {\n  /** 追加到结果前缀的标签，用于验证配置真的被读到。 */\n  label: Volatile<string>\n}\n\nexport const Config = Schema.object({\n  label: Schema.string().default('${input.name}').volatile(),\n})\n\n/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */\nfunction ownNodeDefinition(): unknown {\n  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }\n  const node = pkg.xaihi?.node\n  if (node === undefined) throw new Error(\`\${name}: package.json#xaihi.node is missing\`)\n  return node\n}\n\nexport function apply(ctx: Context, config: Config): void {\n  defineNode(ctx, {\n    definition: ownNodeDefinition(),\n    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。\n    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,\n    handlers: {\n      async run({ inputs }) {\n        return \`\${config.label.get()}: \${run(String(inputs.target ?? ''))}\`\n      },\n    },\n  })\n}\n`,
    'frontend/container-entry.ts': `/**\n * 容器入口占位。rspack 要求一个入口；契约在 rspack.config.mjs 的 exposes 里，\n * 运行时不会执行这个文件。\n */\nexport {}\n`,
    'frontend/Panel.tsx': `/**\n * ${input.titleEn} 的工作面板。\n *\n * 只导出组件与 Probe：Probe 是宿主校验 React 同一性用的，不是装饰。\n * 面板不建自己的 React root、不写自己的颜色 token、不碰主题。\n */\nimport * as React from 'react'\nimport type { PanelProps } from '@hibernalglow/xaihi-sdk'\n\nexport const Probe = { react: React, version: React.version }\n\nexport default function Panel({ contribution, locale }: PanelProps): React.ReactElement {\n  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en\n  const [value, setValue] = React.useState('')\n  return (\n    <div style={{ padding: 12, display: 'grid', gap: 8 }}>\n      <strong>{title}</strong>\n      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={locale === 'zh' ? '目标' : 'Target'} />\n      <span style={{ fontSize: 12, opacity: 0.7 }}>{value || (locale === 'zh' ? '（待填）' : '(empty)')}</span>\n    </div>\n  )\n}\n`,
    'locale/en.json': `${JSON.stringify({ meta: { title: `Xaihi ${input.titleEn}`, description: `Xaihi node ${input.titleEn}: actions plus a workspace panel.` } }, null, 2)}\n`,
    'locale/zh.json': `${JSON.stringify({ meta: { title: `Xaihi ${input.titleZh}`, description: `Xaihi 节点「${input.titleZh}」：动作 + 工作台面板。` } }, null, 2)}\n`,
    'tests/cli.spec.ts': cliSpecOf(input),
    'tests/core.spec.ts': `/** 起步测试：定义合法性与"当前实现就是这个"各钉一颗钉子，替换内核时它会红。 */\nimport { readFileSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { describe, expect, it } from 'vitest'\nimport { validateNodeDefinition } from '@hibernalglow/xaihi-sdk'\nimport { run } from '../src/core.ts'\n\ndescribe('${input.name}', () => {\n  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {\n    const path = fileURLToPath(new URL('../package.json', import.meta.url))\n    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }\n    const result = validateNodeDefinition(pkg.xaihi?.node)\n    expect(result.ok ? true : result.errors).toBe(true)\n  })\n\n  it('run 的当前行为（换成真内核之后，请把这条改成真期望）', () => {\n    expect(run('abc')).toBe('${remote}: abc')\n  })\n})\n`,
    'README.md': `# @hibernalglow/xaihi-${input.name}\n\n脚手架生成的 Xaihi 节点包。五件事各自有出处：\n\n- \`package.json#xaihi\`：贡献清单（\`xaihi.manifest/1\`）与 \`xaihi.node/v1\` 定义\n- \`cordis.patch.yml\`：自带一行（插件即 bundle）\n- \`src/index.ts\`：\`defineNode\` 接线，危险闸门交给 DSH 的 approval 缝\n- \`frontend/\`：自带 UI 产物（\`dist/remoteEntry.js\`），React 由宿主提供\n- \`src/cli.ts\` + \`src/help.ts\` + \`src/cli-support.ts\`：终端面（\`bin\` = \`${binNameOf(input)}\`）。\n  脚手架档的动作在 bin 里**只拒绝不执行**（退出码 2，理由点名缺的那条 DSH 服务），\n  内核搬进来之后再在 \`runHostedAction\` 里点亮\n\n本仓内开发：\`pnpm -r run build\` 之后 \`dsh plugin --profile xaihi add file:$(pwd)\`。\n`,
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
  // 不带值的开关必须先认出来：原来那条循环一律吃掉后一个 token，
  // 于是 `--standalone demo /tmp/x` 会把 `demo` 当成开关的值，报 "name must be kebab-case"。
  const valueless = new Set(['standalone'])
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index] ?? ''
    if (item.startsWith('--')) {
      const key = item.slice(2)
      if (valueless.has(key)) {
        flags[key] = 'true'
        continue
      }
      flags[key] = argv[index + 1] ?? ''
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
    standalone: flags['standalone'] === 'true',
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
