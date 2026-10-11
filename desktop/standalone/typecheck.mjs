import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ui = join(repo, 'packages/ui-host')
const require = createRequire(join(ui, 'package.json'))
const ts = require('typescript')
const configFile = join(ui, 'tsconfig.ported.json')
const config = ts.readConfigFile(configFile, ts.sys.readFile).config
// 按移植树原来的类型尺度量接线文件；依赖仍从真实源码取类型。
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, ui)
// 桌面源码在搬运配置的 rootDir 外；禁用该目录限制，仍使用原来的严格度。
const paths = Object.fromEntries(Object.entries(parsed.options.paths).map(([key, entries]) => [key, entries.map(entry => resolve(ui, entry))]))
Object.assign(paths, {
  'react': [join(ui, 'node_modules/@types/react/index.d.ts')],
  'react/*': [join(ui, 'node_modules/@types/react/*')],
  'react-dom/*': [join(ui, 'node_modules/@types/react-dom/*')],
  '@hibernalglow/xaihi-kisaki/*': [join(repo, 'plugins/kisaki/src/*')],
  '@hibernalglow/xaihi-sdk/bridge': [join(repo, 'packages/node-sdk/src/bridge.ts')],
  '*': [join(ui, 'node_modules/*'), join(repo, 'node_modules/*')],
})
const files = ['packages/ui-host/src/nodes/shared/StandaloneAppearance.tsx', 'desktop/standalone/ApplicationFrame.tsx', 'packages/ui-host/src/nodes/shared/StandaloneApplicationContext.tsx', 'desktop/standalone/local-files.ts', 'packages/ui-host/src/nodes/kisaki/views/KisakiAppearance.tsx', 'packages/ui-host/src/nodes/kisaki/source-inputs.tsx', 'desktop/standalone/settings-bridge.ts', 'desktop/standalone/host.tsx', 'desktop/products/kisaki/host.ts', 'desktop/products/kisaki/Panel.tsx', 'packages/ui-host/src/nodes/kisaki/views/KisakiWorkspaceView.tsx', 'packages/ui-host/src/nodes/shared/useNodeI18n.ts', 'packages/ui-host/src/components/workspace/WorkspaceAppearance.tsx'].map(file => join(repo, file))
const program = ts.createProgram(files, { ...parsed.options, rootDir: repo, paths, types: ['node'], typeRoots: [join(repo, 'node_modules/@types')], noUncheckedSideEffectImports: false })
const diagnostics = files.flatMap(file => {
  const source = program.getSourceFile(file)
  if (!source) throw new Error(`typecheck source missing: ${file}`)
  return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
})
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: file => file, getCurrentDirectory: () => repo, getNewLine: () => '\n' }))
console.log(`standalone typecheck: ${files.length} owned source files; ${diagnostics.length} diagnostics`)
process.exitCode = diagnostics.length ? 1 : 0
