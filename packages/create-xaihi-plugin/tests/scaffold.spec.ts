/**
 * 脚手架产物的自洽性测试：模板里的三处 id 必须互相咬合，否则症状会是"装了但面板/工具都不出现"。
 * @module create-xaihi-plugin/tests/scaffold
 */

import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertName, binNameOf, filesOf, parseArgs, scaffold, vendoredCliSupportOf } from '../src/index.ts'

const input = { name: 'demo-node', nodeId: 'demonode', titleZh: '演示', titleEn: 'Demo', sdkVersion: 'workspace:*' }
const repoRoot = resolve(import.meta.dirname, '..', '..', '..')

/** 终端面的键表：少任何一个，发出去的都是一个没有 bin 的包。 */
const CLI_FACE_KEYS = ['src/cli.ts', 'src/cli-support.ts', 'src/help.ts', 'tests/cli.spec.ts', 'vitest.config.ts']

const missingFaceKeys = (table: Record<string, string | undefined>): string[] =>
  CLI_FACE_KEYS.filter((key) => !(key in table))

/** `package.json` 里终端面用得到的那几格（写成接口是为了能拿残缺副本喂尺）。 */
interface FacePkg {
  bin?: Record<string, string>
  exports?: Record<string, { types?: string; default?: string }>
  scripts?: { build?: string }
}

/**
 * `package.json` 与 tsdown 里终端面的四颗钉子，抽成函数是为了能拿一份残缺的去喂它：
 * 断言只写一遍的话，"删掉 bin 键"这种漂移没有任何东西可红。
 */
function terminalFaceGaps(pkg: FacePkg, tsdown: string): string[] {
  const gaps: string[] = []
  const bin = binNameOf(input)
  if (pkg.bin?.[bin] !== './lib/cli.js') gaps.push(`bin["${bin}"] 不是 ./lib/cli.js`)
  for (const subpath of ['./cli', './help']) {
    const target = subpath === './cli' ? './lib/cli.js' : './lib/help.js'
    if (pkg.exports?.[subpath]?.default !== target) gaps.push(`exports["${subpath}"] 缺或指错`)
  }
  for (const entry of ['src/index.ts', 'src/cli.ts', 'src/help.ts']) {
    if (!tsdown.includes(`'${entry}'`)) gaps.push(`tsdown 入口少了 ${entry}`)
  }
  if (pkg.scripts?.build !== 'tsdown && rspack build') gaps.push('scripts.build 不是 tsdown && rspack build')
  return gaps
}

/** `check-vendored.mjs` 的归一化：抹掉带包名的 @module 行，其余一个字节都不许差。 */
const stripModuleLine = (text: string): string =>
  text.split('\n').filter((line) => !/^\s*\*\s*@module\s/.test(line)).join('\n')

describe('scaffold', () => {
  it('拒绝非 kebab-case 名字', () => {
    expect(() => assertName('Demo_Node')).toThrow('kebab-case')
    expect(() => assertName('demo-node')).not.toThrow()
  })

  it('manifest id、patch 行 id、工具前缀三处互相咬合', () => {
    const files = filesOf(input)
    const pkg = JSON.parse(files['package.json'] as string) as {
      name: string
      xaihi: { id: string; ui: { remote: string }; panels: Array<{ remote: string; export: string }> }
      dsh: { bundle: { patch: string } }
    }
    const patch = files['cordis.patch.yml'] as string
    expect(pkg.name).toBe('@hibernalglow/xaihi-demo-node')
    expect(patch).toContain(`id: ${pkg.xaihi.id}`)
    expect(patch).toContain(`name: '${pkg.name}'`)
    expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(pkg.xaihi.panels[0]?.remote).toBe(pkg.xaihi.ui.remote)
    expect(pkg.xaihi.panels[0]?.export).toBe('Panel')
    expect(files['frontend/Panel.tsx']).toContain('export const Probe')
    // remote 名要与 rspack 的容器名一致，否则清单里的 remote 解析不到容器。
    expect(files['rspack.config.mjs']).toContain(`name: '${pkg.xaihi.ui.remote}'`)
  })

  it('落到目录里就是可读的一包，且拒绝覆盖已有包', async () => {
    const dir = await mkdtemp(`${tmpdir()}/xaihi-scaffold-`)
    try {
      const written = scaffold(input, dir)
      expect(written).toContain('src/index.ts')
      // 接线件必须齐全：缺任何一个，症状都是"装了但要么没工具要么没面板"
      for (const required of ['package.json', 'cordis.patch.yml', 'tsdown.config.ts', 'rspack.config.mjs', 'frontend/Panel.tsx', 'frontend/container-entry.ts', 'tests/core.spec.ts', ...CLI_FACE_KEYS]) {
        expect(written).toContain(required)
      }
      const entry = await readFile(`${dir}/src/index.ts`, 'utf8')
      expect(entry).toContain("export const name = '@hibernalglow/xaihi-demo-node'")
      // 定义只有一份真源：生成的代码从自己的 package.json 读，不再复制一份常量
      expect(entry).toContain('pkg.xaihi?.node')
      expect(entry).not.toContain('const DEFINITION')
      // 生成的节点必须自带账本接法：写成注册时读一次会让"core 后激活"的会话永久没有运行记录。
      expect(entry).toContain('journal: () => ctx.get(OPERATIONS_SERVICE)')
      expect(() => scaffold(input, dir)).toThrow('already has a package.json')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('每个生成物都是能解析的 TS/TSX（语法级门禁）', async () => {
    const ts = await import('typescript')
    const files = filesOf(input)
    const sources = Object.entries(files).filter(([path]) => /\.tsx?$/.test(path))
    expect(sources.length).toBeGreaterThan(4)
    for (const [path, content] of sources) {
      const emitted = ts.transpileModule(content, {
        reportDiagnostics: true,
        fileName: path,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      })
      const messages = (emitted.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
      expect(messages, `${path}: ${messages.join(' | ')}`).toEqual([])
    }
    // 阳性对照：同一条尺必须看得见坏语法，否则上面那段是空断言。
    const broken = ts.transpileModule('export const Panel = () => <div>{<', {
      reportDiagnostics: true,
      fileName: 'broken.tsx',
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    })
    expect((broken.diagnostics ?? []).length).toBeGreaterThan(0)
  })

  it('CLI 参数：--sdk-version 换成发布期版本', () => {
    const parsed = parseArgs(['demo-node', '--node-id', 'demonode', '--sdk-version', '0.1.0-alpha.1', '--dir', '/tmp/x'])
    expect(parsed.sdkVersion).toBe('0.1.0-alpha.1')
    expect(parsed.targetDir).toBe('/tmp/x')
    expect(parsed.nodeId).toBe('demonode')
  })

})

/**
 * 终端面这一档：每个已迁包都带 `bin` + `./cli` + `./help` 三条腿，脚手架不发就等于每个新包
 * 都要人肉抄一遍——抄出来的第 14 份 `cli-support.ts` 正是 `check:vendored` 要抓的漂移源。
 * 所以那份文件在生成时读仓里的既有拷贝、只改 `@module` 一行，这几条断言钉的就是这件事。
 */
describe('终端面', () => {
  it('filesOf() 带着整张终端面的脸', () => {
    const files = filesOf(input)
    expect(missingFaceKeys(files)).toEqual([])
    // 阳性对照：一张少了 `src/cli.ts` 的表必须被同一把尺查到。
    const stripped: Record<string, string | undefined> = { ...files }
    delete stripped['src/cli.ts']
    expect(missingFaceKeys(stripped)).toEqual(['src/cli.ts'])
  })

  it('生成的 cli-support.ts 与 plugins/linedup 那份逐字节一致，只差 @module 一行', () => {
    const canonical = readFileSync(resolve(repoRoot, 'plugins/linedup/src/cli-support.ts'), 'utf8')
    const generated = filesOf(input)['src/cli-support.ts'] as string
    expect(stripModuleLine(generated)).toBe(stripModuleLine(canonical))
    // 只改那一行：逐行比，差异必须恰好落在 @module 那一行上——多改一行（哪怕只是顺手
    // 把包名带进正文）都会让 check:vendored 之外的读者找不到这份拷贝的出处。
    const generatedLines = generated.split('\n')
    const canonicalLines = canonical.split('\n')
    expect(generatedLines.length).toBe(canonicalLines.length)
    const changed = generatedLines
      .map((line, index) => (line === canonicalLines[index] ? null : index + 1))
      .filter((line): line is number => line !== null)
    expect(changed.length).toBe(1)
    expect(changed.map((line) => generatedLines[line - 1])).toEqual([' * @module xaihi-demo-node/cli-support'])
    expect(generated).not.toContain('xaihi-linedup/cli-support')
    // 阳性对照：制造一处单字符漂移就必须红（与 `check-vendored --self-check` 同一判据）。
    expect(stripModuleLine(`${generated}\n// 正控：这一行制造一次不一致\n`)).not.toBe(stripModuleLine(canonical))
  })

  it('package.json 的 bin 与两条 subpath、tsdown 的三入口各自都红得起来', () => {
    const files = filesOf(input)
    const tsdown = files['tsdown.config.ts'] as string
    const pkg = JSON.parse(files['package.json'] as string) as FacePkg
    expect(terminalFaceGaps(pkg, tsdown)).toEqual([])
    expect(pkg.bin).toEqual({ xdemonode: './lib/cli.js' })

    // 阳性对照三条：删 bin、删 ./help subpath、把 tsdown 退回单入口，尺都必须红。
    const noBin = structuredClone(pkg)
    delete noBin.bin
    expect(terminalFaceGaps(noBin, tsdown)).toContain('bin["xdemonode"] 不是 ./lib/cli.js')
    const noHelpSubpath = structuredClone(pkg)
    if (noHelpSubpath.exports) delete noHelpSubpath.exports['./help']
    expect(terminalFaceGaps(noHelpSubpath, tsdown)).toContain('exports["./help"] 缺或指错')
    expect(terminalFaceGaps(pkg, tsdown.replace(", 'src/help.ts'", ''))).toContain('tsdown 入口少了 src/help.ts')
  })

  it('src/cli.ts 的子命令名单就是 package.json#xaihi.node 的动作名单', () => {
    const files = filesOf(input)
    const cli = files['src/cli.ts'] as string
    const declared = (JSON.parse(files['package.json'] as string) as {
      xaihi: { node: { actions: Array<{ id: string }> } }
    }).xaihi.node.actions.map((action) => action.id)
    const drift = (actions: readonly string[]): string[] =>
      actions.filter((action) => !cli.includes(`${action}: defineCommand({`))
    expect(drift(declared)).toEqual([])
    expect(declared).toEqual(['run'])
    // 阳性对照：清单里多一条动作而终端面没跟上，这条尺必须点名它。
    expect(drift([...declared, 'ghost-action'])).toEqual(['ghost-action'])
  })

  it('src/help.ts 由清单推导，且带着 TS4023 那颗显式标注的钉子', () => {
    const help = filesOf(input)['src/help.ts'] as string
    expect(help).toContain("require('../package.json')")
    expect(help).toContain('nodeHelpFromManifest(node')
    // 不写显式类型的话 dts 会报 TS4023 / MISSING_EXPORT（解法抄自 plugins/linedup/src/help.ts）。
    expect(help).toContain('export const help: TerminalNodeHelp =')
    expect(help).toContain(`bin: '${binNameOf(input)}'`)
    expect(help).toContain(`command: '/${input.nodeId}'`)
    // 阳性对照：一份自己誊 `commands:` 文案的手写 help.ts 就该被这条查到。
    expect(help).not.toContain('commands: [')
  })

  it('生成的 vitest.config.ts 只收本包的 spec', () => {
    const config = filesOf(input)['vitest.config.ts'] as string
    expect(config).toContain("include: ['tests/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}']")
    // 阳性对照：加一条 exclude 遮蔽就是把"静默漏跑"再藏一层，这条尺要看得见它。
    expect(config.includes('exclude:')).toBe(false)
  })

  it('终端面的动作在 bin 里拒绝执行时要点名缺的那条 DSH 服务', () => {
    const cli = filesOf(input)['src/cli.ts'] as string
    expect(cli).toContain('process.exitCode = 2')
    expect(cli).toContain('tools 服务')
    expect(cli).toContain('OPERATIONS_SERVICE')
    // 阳性对照：把拒绝换成"跑占位内核打印一行成功"，上面这条就红。
    expect(cli.includes('executed: false')).toBe(true)
    expect(cli.includes('executed: true')).toBe(false)
  })

  it('scaffold() 落盘的 cli-support.ts 就是 vendored 那份', async () => {
    const dir = await mkdtemp(`${tmpdir()}/xaihi-scaffold-cli-`)
    try {
      const written = scaffold(input, dir)
      expect(missingFaceKeys(Object.fromEntries(written.map((key) => [key, ''])))).toEqual([])
      const support = await readFile(resolve(dir, 'src/cli-support.ts'), 'utf8')
      expect(support).toBe(vendoredCliSupportOf(input.name))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
